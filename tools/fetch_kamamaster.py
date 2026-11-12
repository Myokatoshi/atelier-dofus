#!/usr/bin/env python3
"""Récupère les données publiées par Kamamaster (https://kamamaster.fr) pour un serveur.

Usage : python3 tools/fetch_kamamaster.py [Orukam]

Écrit, dans data/km/ :
- <serveur>.json : {"server", "fetched", "source",
                    "prices": {id_objet: prix},                       prix HDV (0 ignorés)
                    "coefs": {id_objet: [coefficient %, "AAAA-MM-JJ"]}, coefficients de brisage (meilleures opportunités)
                    "anomalies": {id_sous_zone: bonus %},              zones en anomalie (bonus > 0)
                    "doubt": {id_objet: [prix, médiane récente]}}       cotes douteuses, retirées de "prices"
- <serveur>-donjons.json : rentabilité des donjons calculée par Kamamaster (équipe de 4, prospection 100,
                    30 min, 1 personnage) : drops attendus par passage, bonus d'anomalie compris
- <serveur>-history.json : {"dates": [...], "prices": {id_objet: [prix ou 0 par date]}}, 90 derniers jours

- <serveur>-check.json : {"checked": dernière vérification, "changed": dernier changement des prix, "full": dernier passage complet}

Lancé toutes les 2 heures par .github/workflows/kamamaster.yml : 2 appels (prix HDV, zones en anomalie) ;
les 2 autres (brisage, donjons) seulement si les prix ont changé ou si le dernier passage complet date de 6 h ou plus.
Un fichier de données n'est réécrit que si ses données ont changé.
"""
import json, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://api.kamamaster.fr/api/"
UA = {"User-Agent": "AtelierDofus/1.0 (outil privé d'un groupe d'amis, quelques appels par jour)"}
KEEP_DAYS = 90
MAX_PRICE = 1_000_000_000  # au-delà : annonce fantaisiste à l'HDV, ignorée
DOUBT_RATIO = 3            # cote douteuse : plus de 3 fois au-dessus ou en dessous de la médiane récente
DOUBT_DAYS, DOUBT_MIN = 7, 3
FULL_EVERY = timedelta(hours=6)  # brisage, anomalies et donjons : au moins toutes les 6 h  # médiane des 7 derniers jours connus, au moins 3 valeurs pour juger


def get(path, **params):
    url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
    data = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180))
    time.sleep(2)  # rester discret
    return data


def fetch_anomalies(server):
    """Zones en anomalie (bonus % > 0) ; None si Kamamaster ne répond pas."""
    try:
        return {str(z["subAreaId"]): z["bonusPercent"] for z in get("map/anomaly-zones", server=server).get("zones", [])
                if (z.get("bonusPercent") or 0) > 0}
    except Exception as e:
        print("Anomalies indisponibles :", e)
        return None


def main():
    server = sys.argv[1] if len(sys.argv) > 1 else "Orukam"
    slug = server.lower().replace(" ", "-")
    out_dir = ROOT / "data" / "km"
    out_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)

    # 1. Prix HDV
    prices = {}
    for x in get("hdv/serveur", serveurName=server):
        try:
            p = round(float(x.get("price") or 0))
        except (TypeError, ValueError):
            continue
        if 0 < p < MAX_PRICE and x.get("ankamaId"):
            prices[str(x["ankamaId"])] = p
    if len(prices) < 100:
        raise SystemExit(f"Réponse suspecte ({len(prices)} prix) : fichiers non modifiés")

    # Prix identiques au dernier passage et passage complet récent : on note juste l'heure de vérification
    stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    main_file, check_file = out_dir / f"{slug}.json", out_dir / f"{slug}-check.json"
    old = json.load(open(main_file, encoding="utf-8")) if main_file.exists() else None
    check = json.load(open(check_file, encoding="utf-8")) if check_file.exists() else {}
    old_raw = {**old["prices"], **{k: v[0] for k, v in (old.get("doubt") or {}).items()}} if old else None
    last_full = check.get("full")
    recent = last_full and now - datetime.strptime(last_full, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < FULL_EVERY
    if old_raw == prices and recent:
        # Les anomalies changent plus souvent que les prix : elles sont vérifiées à chaque passage (1 appel)
        an = fetch_anomalies(server)
        if an is not None and an != old.get("anomalies"):
            old["anomalies"], old["anomaliesAt"] = an, stamp
            json.dump(old, open(main_file, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
            print(f"{server} : anomalies mises à jour ({len(an)} zone(s))")
        json.dump({"checked": stamp, "changed": old.get("fetched"), "full": last_full}, open(check_file, "w"), separators=(",", ":"))
        print(f"{server} : prix inchangés depuis le {old.get('fetched')} (vérifié le {stamp})")
        return

    # Cotes douteuses : écart de plus de ×3 avec la médiane des derniers jours (Kamamaster ne relève
    # qu'une annonce par objet ; une seule annonce fantaisiste suffit à fausser la cote)
    raw = dict(prices)
    hist_file = out_dir / f"{slug}-history.json"
    hist = {"dates": [], "prices": {}}
    if hist_file.exists():
        hist = json.load(open(hist_file, encoding="utf-8"))
    day = now.strftime("%Y-%m-%d")
    past = [i for i, d in enumerate(hist["dates"]) if d < day][-DOUBT_DAYS:]
    doubt = {}
    for k, p in raw.items():
        vals = sorted(v for v in (hist["prices"].get(k, [])[i] for i in past if i < len(hist["prices"].get(k, []))) if v > 0)
        if len(vals) >= DOUBT_MIN:
            med = vals[len(vals) // 2] if len(vals) % 2 else (vals[len(vals) // 2 - 1] + vals[len(vals) // 2]) / 2
            if p > med * DOUBT_RATIO or p < med / DOUBT_RATIO:
                doubt[k] = [p, round(med)]
                del prices[k]

    # 2. Coefficients de brisage (meilleures opportunités du serveur)
    coefs = {}
    try:
        for x in get("brisage/opportunities", server=server, limit=10000):
            if x.get("itemAnkamaId") and x.get("coefficient") is not None:
                coefs[str(x["itemAnkamaId"])] = [x["coefficient"], (x.get("coefficientChangedAt") or "")[:10]]
    except Exception as e:  # données secondaires : on garde les prix
        print("Coefficients indisponibles :", e)

    # 3. Zones en anomalie (bonus %)
    anomalies = fetch_anomalies(server)
    if anomalies is None:
        anomalies = (old or {}).get("anomalies", {})
    anomalies_at = (old or {}).get("anomaliesAt") if old and old.get("anomalies") == anomalies else stamp

    # 4. Donjons : drops attendus par passage, avec les réglages par défaut de Kamamaster
    dungeons = None
    try:
        dungeons = []
        for x in get("map/dungeons", server=server, teamSize=4, prospecting=100, durationMinutes=30, characterCount=1).get("dungeons", []):
            drops = [[t["resourceId"], round(t.get("expectedQuantity") or 0, 5), round(t.get("effectiveDropRate") or 0, 3),
                      ", ".join(t.get("monsterNames") or [])]
                     for t in x.get("topDrops") or [] if t.get("resourceId") and (t.get("expectedQuantity") or 0) > 0]
            boss = [m["name"] for r in x.get("rooms") or [] if r.get("isBossRoom") for m in r.get("monsters") or []]
            last = (x.get("rooms") or [{}])[-1].get("monsters") or []
            dungeons.append({"id": x["id"], "n": x["name"], "lv": x.get("recommendedLevel"), "x": x.get("posX"), "y": x.get("posY"),
                             "an": x.get("anomalyBonusPercent") or 0, "rooms": len(x.get("rooms") or []),
                             "boss": sorted(set(boss or [m["name"] for m in last])), "miss": x.get("missingMonsterCount") or 0,
                             "drops": sorted(drops, key=lambda d: -d[1])})
        dungeons.sort(key=lambda d: d["id"])
    except Exception as e:
        print("Donjons indisponibles :", e)
        dungeons = None

    def save(path, payload):
        """Écrit le fichier seulement si les données (hors date de récupération) ont changé."""
        if path.exists():
            try:
                old = json.load(open(path, encoding="utf-8"))
                old.pop("fetched", None)
                if old == json.loads(json.dumps(payload, ensure_ascii=False)):
                    return False
            except ValueError:
                pass
        json.dump({**payload, "fetched": stamp}, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        return True

    changed = save(out_dir / f"{slug}.json", {"server": server, "source": "https://kamamaster.fr",
                   "prices": dict(sorted(prices.items(), key=lambda kv: int(kv[0]))), "coefs": coefs, "anomalies": anomalies, "anomaliesAt": anomalies_at,
                   "doubt": dict(sorted(doubt.items(), key=lambda kv: int(kv[0])))})
    if dungeons:
        save(out_dir / f"{slug}-donjons.json", {"server": server, "source": "https://kamamaster.fr",
             "params": {"team": 4, "pp": 100, "min": 30, "chars": 1}, "list": dungeons})
    json.dump({"checked": stamp, "changed": json.load(open(main_file, encoding="utf-8"))["fetched"], "full": stamp},
              open(check_file, "w"), separators=(",", ":"))
    if not changed:
        print(f"{server} : prix inchangés depuis le dernier passage")
        return

    # 4. Historique quotidien des prix (90 jours)
    # (prix bruts, cotes douteuses comprises : si un nouveau prix se confirme, la médiane le rattrape)
    if hist["dates"] and hist["dates"][-1] == day:  # relancé le même jour : on remplace
        hist["dates"].pop()
        for v in hist["prices"].values():
            v.pop()
    hist["dates"].append(day)
    n = len(hist["dates"])
    for k in set(hist["prices"]) | set(raw):
        row = hist["prices"].setdefault(k, [0] * (n - 1))
        row.extend([0] * (n - 1 - len(row)))
        row.append(raw.get(k, 0))
    if n > KEEP_DAYS:
        cut = n - KEEP_DAYS
        hist["dates"] = hist["dates"][cut:]
        hist["prices"] = {k: v[cut:] for k, v in hist["prices"].items()}
    hist["prices"] = {k: v for k, v in sorted(hist["prices"].items(), key=lambda kv: int(kv[0])) if any(v)}
    json.dump(hist, open(hist_file, "w", encoding="utf-8"), separators=(",", ":"))

    print(f"{server} : {len(prices)} prix, {len(coefs)} coefficients de brisage, {len(anomalies)} zone(s) en anomalie, "
          f"{len(doubt)} cote(s) douteuse(s), {len(dungeons or [])} donjons, historique de {len(hist['dates'])} jour(s)")


if __name__ == "__main__":
    main()
