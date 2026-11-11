#!/usr/bin/env python3
"""Récupère les données publiées par Kamamaster (https://kamamaster.fr) pour un serveur.

Usage : python3 tools/fetch_kamamaster.py [Orukam]

Écrit, dans data/km/ :
- <serveur>.json : {"server", "fetched", "source",
                    "prices": {id_objet: prix},                       prix HDV (0 ignorés)
                    "coefs": {id_objet: [coefficient %, "AAAA-MM-JJ"]}, coefficients de brisage (meilleures opportunités)
                    "anomalies": {id_sous_zone: bonus %}}               zones en anomalie (bonus > 0)
- <serveur>-donjons.json : rentabilité des donjons calculée par Kamamaster (équipe de 4, prospection 100,
                    30 min, 1 personnage) : drops attendus par passage, bonus d'anomalie compris
- <serveur>-history.json : {"dates": [...], "prices": {id_objet: [prix ou 0 par date]}}, 90 derniers jours

Lancé 4 fois par jour par .github/workflows/kamamaster.yml (4 appels à l'API de Kamamaster par passage).
Un fichier n'est réécrit que si ses données ont changé : pas de commit inutile.
"""
import json, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://api.kamamaster.fr/api/"
UA = {"User-Agent": "AtelierDofus/1.0 (outil privé d'un groupe d'amis, quelques appels par jour)"}
KEEP_DAYS = 90
MAX_PRICE = 1_000_000_000  # au-delà : annonce fantaisiste à l'HDV, ignorée


def get(path, **params):
    url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
    data = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180))
    time.sleep(2)  # rester discret
    return data


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

    # 2. Coefficients de brisage (meilleures opportunités du serveur)
    coefs = {}
    try:
        for x in get("brisage/opportunities", server=server, limit=10000):
            if x.get("itemAnkamaId") and x.get("coefficient") is not None:
                coefs[str(x["itemAnkamaId"])] = [x["coefficient"], (x.get("coefficientChangedAt") or "")[:10]]
    except Exception as e:  # données secondaires : on garde les prix
        print("Coefficients indisponibles :", e)

    # 3. Zones en anomalie (bonus %)
    anomalies = {}
    try:
        for z in get("map/anomaly-zones", server=server).get("zones", []):
            if (z.get("bonusPercent") or 0) > 0:
                anomalies[str(z["subAreaId"])] = z["bonusPercent"]
    except Exception as e:
        print("Anomalies indisponibles :", e)

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

    stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")

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
                   "prices": dict(sorted(prices.items(), key=lambda kv: int(kv[0]))), "coefs": coefs, "anomalies": anomalies})
    if dungeons:
        save(out_dir / f"{slug}-donjons.json", {"server": server, "source": "https://kamamaster.fr",
             "params": {"team": 4, "pp": 100, "min": 30, "chars": 1}, "list": dungeons})
    if not changed:
        print(f"{server} : prix inchangés depuis le dernier passage")
        return

    # 4. Historique quotidien des prix (90 jours)
    hist_file = out_dir / f"{slug}-history.json"
    hist = {"dates": [], "prices": {}}
    if hist_file.exists():
        hist = json.load(open(hist_file, encoding="utf-8"))
    day = now.strftime("%Y-%m-%d")
    if hist["dates"] and hist["dates"][-1] == day:  # relancé le même jour : on remplace
        hist["dates"].pop()
        for v in hist["prices"].values():
            v.pop()
    hist["dates"].append(day)
    n = len(hist["dates"])
    for k in set(hist["prices"]) | set(prices):
        row = hist["prices"].setdefault(k, [0] * (n - 1))
        row.extend([0] * (n - 1 - len(row)))
        row.append(prices.get(k, 0))
    if n > KEEP_DAYS:
        cut = n - KEEP_DAYS
        hist["dates"] = hist["dates"][cut:]
        hist["prices"] = {k: v[cut:] for k, v in hist["prices"].items()}
    hist["prices"] = {k: v for k, v in sorted(hist["prices"].items(), key=lambda kv: int(kv[0])) if any(v)}
    json.dump(hist, open(hist_file, "w", encoding="utf-8"), separators=(",", ":"))

    print(f"{server} : {len(prices)} prix, {len(coefs)} coefficients de brisage, {len(anomalies)} zone(s) en anomalie, "
          f"{len(dungeons or [])} donjons, historique de {len(hist['dates'])} jour(s)")


if __name__ == "__main__":
    main()
