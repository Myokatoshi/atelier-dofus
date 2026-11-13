// Fonction serveur « alertes » : vérifie les alertes de prix de chaque membre et envoie une
// notification push (appli fermée) quand une alerte se déclenche, une seule fois par prix déclencheur.
// Appelée par un déclencheur à chaque relevé de prix et toutes les heures (voir supabase/migrations/009_alertes_auto.sql).
// Secrets requis (Supabase > Edge Functions > Secrets) : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.49.10";

const SITE = "https://myokatoshi.github.io/atelier-dofus/";
type Obs = { d: string; lo: number; hi: number; cur: number | null };

let CORE: any = null, CORE_AT = 0;
async function core() {
  if (!CORE || Date.now() - CORE_AT > 6 * 3600e3) { CORE = await (await fetch(SITE + "data/core.json")).json(); CORE_AT = Date.now(); }
  return CORE;
}

let FARM: any = null, FARM_AT = 0;
async function farm() {
  if (!FARM || Date.now() - FARM_AT > 6 * 3600e3) { FARM = await (await fetch(SITE + "data/farm.json")).json(); FARM_AT = Date.now(); }
  return FARM;
}

Deno.serve(async () => {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return Response.json({ error: "Clés VAPID manquantes dans les secrets" }, { status: 500 });
  webpush.setVapidDetails(SITE, pub, priv);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const [{ data: states }, { data: subs }, { data: sent }] = await Promise.all([
    sb.from("user_state").select("user_id, plan"),
    sb.from("push_subs").select("endpoint, user_id, p256dh, auth"),
    sb.from("push_sent").select("user_id, alert_id, key"),
  ]);
  const subsBy = new Map<string, any[]>();
  for (const s of subs || []) subsBy.set(s.user_id, [...(subsBy.get(s.user_id) || []), s]);
  const users = (states || []).filter(u => subsBy.has(u.user_id) && (u.plan?.alerts || []).length);
  if (!users.length) return Response.json({ checked: 0, sent: 0 });

  const C = await core();
  const name = (id: number) => (C.items[id] || ["Objet #" + id])[0];
  const recipe = (id: number) => C.recipes[id];

  // Objets dont il faut le prix : objets des alertes + ingrédients (récursifs) des alertes de craft
  const need = new Set<number>();
  const addRec = (id: number, depth = 0) => { need.add(id); const r = recipe(id); if (r && depth < 6) for (const [ing] of r[1]) if (!need.has(ing)) addRec(ing, depth + 1); };
  // Alertes « butin de protecteur » (a.item = ressource récoltée) : prix du butin de ses protecteurs (sacs : contenu)
  const hasProt = users.some(u => u.plan.alerts.some((a: any) => a.kind === "prot"));
  const F = hasProt ? await farm() : null;
  const protLoot = (rid: number) => {
    if (!F) return [];
    const mids = new Set(Object.entries(F.mons).filter(([, m]: any) => m[5] === rid).map(([k]) => +k));
    const out: [number, number, number][] = [];
    for (const [it, ds] of Object.entries(F.drops) as any) for (const d of ds) if (mids.has(d[0]) && d[3]) out.push([+it, d[1], d[2]]);
    return out;
  };
  for (const u of users) for (const a of u.plan.alerts) {
    if (a.kind === "craft") addRec(+a.item);
    else if (a.kind === "prot") { for (const [it] of protLoot(+a.item)) { need.add(it); const b = F.bags?.[it]; if (b) need.add(b[0]); } }
    else need.add(+a.item);
  }

  // Prix du groupe : dernier relevé de chaque objet (jour le plus récent, puis mise à jour la plus récente)
  const group = new Map<number, Obs & { t: string }>();
  const ids = [...need];
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from("price_obs").select("item_id, d, lo, hi, cur, updated_at").in("item_id", ids.slice(i, i + 300));
    for (const r of data || []) {
      const g = group.get(r.item_id);
      if (!g || r.d > g.d || (r.d === g.d && r.updated_at > g.t)) group.set(r.item_id, { d: r.d, lo: r.lo, hi: r.hi, cur: r.cur, t: r.updated_at });
    }
  }
  let KM: any = null;
  // Prix Kamamaster d'Orukam : table km_data (fonction « kamamaster »), sinon fichier du site
  try { const { data } = await sb.from("km_data").select("data").eq("key", "orukam").maybeSingle(); KM = data?.data || null; } catch { /* table absente */ }
  if (!KM) { try { KM = await (await fetch(SITE + "data/km/orukam.json", { cache: "no-store" })).json(); } catch { /* prix de secours absents */ } }
  const priceAt = (id: number): Obs | null => {
    const g = group.get(id) || null;
    const p = KM?.prices?.[id];
    const km = p ? { d: String(KM.fetched).slice(0, 10), lo: p, hi: p, cur: p } : null;
    return g || km; // le relevé du groupe passe toujours avant Kamamaster
  };
  const nowPrice = (o: Obs | null) => (o ? (o.cur ?? (o.lo + o.hi) / 2) : null);
  // Comme dans l'appli : une cote Kamamaster de ressource récoltable plus de 15 fois au-dessus des ressources
  // du même métier de niveau proche (± 40, au moins 3) est « à vérifier » et n'est pas comptée
  const oddHarv = (id: number) => {
    if (!F || !KM?.prices || group.has(id) || !F.harvest[id] || !KM.prices[id]) return false;
    const [j, lv] = F.harvest[id];
    const peers = Object.entries(F.harvest).filter(([k, v]: any) => +k !== id && v[0] === j && Math.abs(v[1] - lv) <= 40 && KM.prices[k]).map(([k]) => KM.prices[k]).sort((x: number, y: number) => x - y);
    return peers.length >= 3 && KM.prices[id] > 15 * peers[peers.length >> 1];
  };
  const resale = (id: number) => oddHarv(id) ? null : nowPrice(priceAt(id));
  const protValue = (rid: number, pp: number) => {
    let v = 0, n = 0;
    for (const [it, a, b] of protLoot(rid)) {
      const bag = F.bags?.[it]; const own = resale(it);
      const p = own != null ? own : bag ? (resale(bag[0]) != null ? resale(bag[0])! * bag[1] : null) : null;
      if (p == null) continue;
      const ch = b >= 100 ? 1 : Math.min(1, (a + b) / 2 / 100 * pp / 100);
      v += p * ch; n++;
    }
    return n ? v : null;
  };

  // Coût de craft en fourchette : pour chaque ingrédient, la voie la moins chère (acheter ou fabriquer)
  const best = new Map<number, { lo: number; hi: number; missing: number }>();
  const bestOf = (id: number, depth: number, stack: Set<number>): { lo: number; hi: number; missing: number } => {
    if (best.has(id)) return best.get(id)!;
    const o = priceAt(id), buy = o ? { lo: o.lo, hi: o.hi, missing: 0 } : null;
    let craft = null;
    if (recipe(id) && depth < 6 && !stack.has(id)) { stack.add(id); craft = craftOf(id, depth, stack); stack.delete(id); }
    const res = buy && craft && !craft.missing ? (craft.lo + craft.hi < buy.lo + buy.hi ? craft : buy) : buy || craft || { lo: 0, hi: 0, missing: 1 };
    best.set(id, res); return res;
  };
  const craftOf = (id: number, depth = 0, stack = new Set([id])) => {
    let lo = 0, hi = 0, missing = 0;
    for (const [ing, q] of recipe(id)[1]) { const c = bestOf(ing, depth + 1, stack); lo += q * c.lo; hi += q * c.hi; missing += c.missing; }
    return { lo, hi, missing };
  };

  const fmt = new Intl.NumberFormat("fr-FR");
  let sentCount = 0;
  const sentMap = new Map((sent || []).map(s => [s.user_id + "|" + s.alert_id, s.key]));
  for (const u of users) {
    const tax = (u.plan.settings?.tax ?? 2) / 100;
    for (const a of u.plan.alerts) {
      const id = +a.item, o = priceAt(id);
      let ok = false, key: string | null = null, msg = "";
      if (a.kind === "prot") {
        const v = protValue(id, Math.max(1, +(u.plan.settings?.pp || 100)));
        ok = v != null && v >= a.price; key = v == null ? null : "p:" + Math.round(v);
        const mon = F ? (Object.values(F.mons) as any[]).find(m => m[5] === id) : null;
        msg = `${mon ? mon[0] : "Protecteur de " + name(id)} : butin ≈ ${fmt.format(Math.round(v ?? 0))} ₭ par combat (seuil ${fmt.format(a.price)} ₭)`;
      } else if (a.kind === "craft") {
        if (!recipe(id)) continue;
        const c = craftOf(id);
        const m = !o || c.missing ? null : ((o.lo + o.hi) / 2) * (1 - tax) - (c.lo + c.hi) / 2;
        ok = m != null && m >= a.price; key = m == null ? null : (o ? o.d : "") + ":" + Math.round(m);
        msg = `${name(id)} : marge de ${fmt.format(Math.round(m ?? 0))} ₭ par craft (seuil ${fmt.format(a.price)} ₭)`;
      } else if (o) {
        const cur = a.kind === "buy" ? o.lo : o.hi;
        ok = a.kind === "buy" ? cur <= a.price : cur >= a.price; key = o.d + ":" + Math.round(cur);
        msg = `${name(id)} à ${fmt.format(Math.round(cur))} ₭, ${a.kind === "buy" ? "sous ton prix d'achat" : "au-dessus de ton prix de vente"} de ${fmt.format(a.price)} ₭`;
      }
      const k = u.user_id + "|" + a.id;
      if (!ok) { if (sentMap.has(k)) await sb.from("push_sent").delete().eq("user_id", u.user_id).eq("alert_id", a.id); continue; }
      if (!key || sentMap.get(k) === key) continue;
      const payload = JSON.stringify({ title: "Alerte de prix", body: msg, tag: "alerte-" + a.id, url: SITE + "#alertes" });
      for (const s of subsBy.get(u.user_id)!) {
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 }); sentCount++; }
        catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from("push_subs").delete().eq("endpoint", s.endpoint); }
      }
      await sb.from("push_sent").upsert({ user_id: u.user_id, alert_id: a.id, key, sent_at: new Date().toISOString() });
    }
  }
  return Response.json({ checked: users.length, sent: sentCount });
});
