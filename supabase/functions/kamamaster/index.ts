// Fonction serveur « kamamaster » : récupère les données publiées par Kamamaster pour Orukam et les range
// dans la table km_data (lue par l'appli). Appelée toutes les heures par pg_cron (migration 010).
// Même logique que tools/fetch_kamamaster.py :
//  - à chaque passage : prix HDV et zones en anomalie (2 appels) ;
//  - si les prix ont changé ou si le dernier passage complet date de 6 h ou plus : coefficients de brisage et donjons ;
//  - prix ≥ 1 milliard ignorés ; cote « douteuse » si elle s'écarte de plus de ×3 de la médiane de ses 7 derniers jours ;
//  - historique quotidien des prix sur 90 jours.
// Répond tout de suite et travaille en arrière-plan (?wait=1 pour attendre le résultat, ?full=1 pour un passage complet).
import { createClient } from "npm:@supabase/supabase-js@2.49.10";

const SERVER = "Orukam", SLUG = "orukam";
const API = "https://api.kamamaster.fr/api/";
const SITE = "https://myokatoshi.github.io/atelier-dofus/";
const UA = { "User-Agent": "AtelierDofus/1.0 (outil privé d'un groupe d'amis, quelques appels par jour)" };
const MAX_PRICE = 1_000_000_000, DOUBT_RATIO = 3, DOUBT_DAYS = 7, DOUBT_MIN = 3, KEEP_DAYS = 90, FULL_EVERY = 6 * 3600e3;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function get(path: string, params: Record<string, string | number>) {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const r = await fetch(API + path + "?" + q, { headers: UA });
  if (!r.ok) throw new Error(path + " : HTTP " + r.status);
  const j = await r.json();
  await sleep(2000); // rester discret
  return j;
}
// Comparaison de données indépendante de l'ordre des clés
const canon = (v: unknown): string => Array.isArray(v) ? "[" + v.map(canon).join(",") + "]"
  : v && typeof v === "object" ? "{" + Object.keys(v as object).sort().map(k => JSON.stringify(k) + ":" + canon((v as any)[k])).join(",") + "}" : JSON.stringify(v);
const same = (a: unknown, b: unknown) => canon(a) === canon(b);
const byId = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort((a, b) => +a[0] - +b[0]));

async function anomaliesNow(): Promise<Record<string, number> | null> {
  try {
    const out: Record<string, number> = {};
    for (const z of (await get("map/anomaly-zones", { server: SERVER })).zones || []) if ((z.bonusPercent || 0) > 0) out[String(z.subAreaId)] = z.bonusPercent;
    return out;
  } catch (e) { console.log("Anomalies indisponibles :", e); return null; }
}

async function run(force = false) {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rows } = await sb.from("km_data").select("key, data");
  const db: Record<string, any> = Object.fromEntries((rows || []).map(r => [r.key, r.data]));
  // Première fois : reprise des fichiers publiés sur le site
  const put = async (key: string, data: unknown) => { const { error } = await sb.from("km_data").upsert({ key, data, updated_at: new Date().toISOString() }); if (error) throw error; };
  for (const k of [SLUG, SLUG + "-history", SLUG + "-donjons", SLUG + "-check"]) if (!db[k]) {
    try { const r = await fetch(SITE + "data/km/" + k + ".json", { cache: "no-store" }); if (r.ok) { db[k] = await r.json(); await put(k, db[k]); } } catch { /* absent */ }
  }
  const now = new Date(), stamp = now.toISOString().slice(0, 19) + "Z", day = stamp.slice(0, 10);

  // 1. Prix HDV
  const prices: Record<string, number> = {};
  for (const x of await get("hdv/serveur", { serveurName: SERVER })) {
    const p = Math.round(parseFloat(x.price || 0));
    if (p > 0 && p < MAX_PRICE && x.ankamaId) prices[String(x.ankamaId)] = p;
  }
  if (Object.keys(prices).length < 100) throw new Error("Réponse suspecte (" + Object.keys(prices).length + " prix)");

  const old = db[SLUG] || null, check = db[SLUG + "-check"] || {};
  const oldRaw = old ? { ...old.prices, ...Object.fromEntries(Object.entries(old.doubt || {}).map(([k, v]: any) => [k, v[0]])) } : null;
  const recent = check.full && now.getTime() - new Date(check.full).getTime() < FULL_EVERY;
  if (oldRaw && same(oldRaw, prices) && recent && !force) {
    const an = await anomaliesNow();
    if (an && !same(an, old.anomalies || {})) { old.anomalies = an; old.anomaliesAt = stamp; await put(SLUG, old); }
    await put(SLUG + "-check", { checked: stamp, changed: old.fetched, full: check.full });
    return { prices: "inchangés", anomalies: an ? Object.keys(an).length : null };
  }

  // Cotes douteuses (sur l'historique, prix bruts)
  const raw = { ...prices };
  const hist = db[SLUG + "-history"] || { dates: [], prices: {} };
  const past = hist.dates.map((d: string, i: number) => [d, i]).filter(([d]: any) => d < day).map(([, i]: any) => i).slice(-DOUBT_DAYS);
  const doubt: Record<string, [number, number]> = {};
  for (const [k, p] of Object.entries(raw)) {
    const row = hist.prices[k] || [];
    const vals = past.filter((i: number) => i < row.length).map((i: number) => row[i]).filter((v: number) => v > 0).sort((a: number, b: number) => a - b);
    if (vals.length >= DOUBT_MIN) {
      const n = vals.length, med = n % 2 ? vals[(n - 1) / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2;
      if (p > med * DOUBT_RATIO || p < med / DOUBT_RATIO) { doubt[k] = [p, Math.round(med)]; delete prices[k]; }
    }
  }

  // 2. Coefficients de brisage
  const coefs: Record<string, [number, string]> = {};
  try {
    for (const x of await get("brisage/opportunities", { server: SERVER, limit: 10000 }))
      if (x.itemAnkamaId && x.coefficient != null) coefs[String(x.itemAnkamaId)] = [x.coefficient, (x.coefficientChangedAt || "").slice(0, 10)];
  } catch (e) { console.log("Coefficients indisponibles :", e); }

  // 3. Anomalies
  const anomalies = (await anomaliesNow()) ?? (old?.anomalies || {});
  const anomaliesAt = old && same(old.anomalies || {}, anomalies) ? old.anomaliesAt ?? null : stamp;

  // 4. Donjons
  let dungeons: any[] | null = null;
  try {
    dungeons = [];
    for (const x of (await get("map/dungeons", { server: SERVER, teamSize: 4, prospecting: 100, durationMinutes: 30, characterCount: 1 })).dungeons || []) {
      const drops = (x.topDrops || []).filter((t: any) => t.resourceId && (t.expectedQuantity || 0) > 0)
        .map((t: any) => [t.resourceId, Math.round((t.expectedQuantity || 0) * 1e5) / 1e5, Math.round((t.effectiveDropRate || 0) * 1e3) / 1e3, (t.monsterNames || []).join(", ")])
        .sort((a: any, b: any) => b[1] - a[1]);
      const rooms = x.rooms || [];
      const boss = rooms.filter((r: any) => r.isBossRoom).flatMap((r: any) => (r.monsters || []).map((m: any) => m.name));
      const last = (rooms[rooms.length - 1] || {}).monsters || [];
      dungeons.push({ id: x.id, n: x.name, lv: x.recommendedLevel ?? null, x: x.posX ?? null, y: x.posY ?? null, an: x.anomalyBonusPercent || 0, rooms: rooms.length,
        boss: [...new Set(boss.length ? boss : last.map((m: any) => m.name))].sort(), miss: x.missingMonsterCount || 0, drops });
    }
    dungeons.sort((a, b) => a.id - b.id);
  } catch (e) { console.log("Donjons indisponibles :", e); dungeons = null; }

  const main = { server: SERVER, source: "https://kamamaster.fr", prices: byId(prices), coefs, anomalies, anomaliesAt, doubt: byId(doubt) };
  const strip = (o: any) => { if (!o) return null; const { fetched: _f, ...rest } = o; return rest; };
  const changed = !same(strip(old), main);
  const mainOut = changed ? { ...main, fetched: stamp } : old;
  if (changed) await put(SLUG, mainOut);
  if (dungeons && dungeons.length) {
    const dj = { server: SERVER, source: "https://kamamaster.fr", params: { team: 4, pp: 100, min: 30, chars: 1 }, list: dungeons };
    if (!same(strip(db[SLUG + "-donjons"]), dj)) await put(SLUG + "-donjons", { ...dj, fetched: stamp });
  }
  await put(SLUG + "-check", { checked: stamp, changed: mainOut.fetched, full: stamp });
  if (!changed) return { prices: "inchangés", full: true };

  // 5. Historique quotidien (prix bruts, cotes douteuses comprises)
  if (hist.dates.length && hist.dates[hist.dates.length - 1] === day) { hist.dates.pop(); for (const v of Object.values(hist.prices) as number[][]) v.pop(); }
  hist.dates.push(day);
  const n = hist.dates.length;
  for (const k of new Set([...Object.keys(hist.prices), ...Object.keys(raw)])) {
    const row: number[] = hist.prices[k] || (hist.prices[k] = Array(n - 1).fill(0));
    while (row.length < n - 1) row.push(0);
    row.push(raw[k] || 0);
  }
  if (n > KEEP_DAYS) { const cut = n - KEEP_DAYS; hist.dates = hist.dates.slice(cut); for (const k of Object.keys(hist.prices)) hist.prices[k] = hist.prices[k].slice(cut); }
  hist.prices = byId(Object.fromEntries(Object.entries(hist.prices).filter(([, v]: any) => v.some((x: number) => x > 0))));
  await put(SLUG + "-history", hist);
  return { prices: Object.keys(prices).length, coefs: Object.keys(coefs).length, anomalies: Object.keys(anomalies).length, doubt: Object.keys(doubt).length, dungeons: dungeons?.length ?? 0, history: n };
}

Deno.serve(async req => {
  const u = new URL(req.url), wait = u.searchParams.get("wait");
  const job = run(!!u.searchParams.get("full")).then(r => { console.log("kamamaster :", JSON.stringify(r)); return r; }).catch(e => { console.error("kamamaster :", e); return { error: String(e) }; });
  if (wait) return Response.json(await job);
  // @ts-ignore EdgeRuntime est fourni par Supabase
  EdgeRuntime.waitUntil(job);
  return Response.json({ started: true });
});
