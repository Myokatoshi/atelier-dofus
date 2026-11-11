#!/usr/bin/env python3
"""Récupère les prix HDV publiés par Kamamaster (https://kamamaster.fr) pour un serveur.

Usage : python3 tools/fetch_kamamaster.py [Orukam]
Écrit data/km/<serveur>.json : {"server", "fetched", "source", "prices": {id_objet: prix}}.
Lancé une fois par jour par .github/workflows/kamamaster.yml. Les prix à 0 (objet absent de l'HDV) sont ignorés.
"""
import json, sys, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
server = sys.argv[1] if len(sys.argv) > 1 else "Orukam"
url = "https://api.kamamaster.fr/api/hdv/serveur?serveurName=" + urllib.parse.quote(server)
req = urllib.request.Request(url, headers={"User-Agent": "AtelierDofus/1.0 (outil privé d'un groupe d'amis, 1 appel par jour)"})
data = json.load(urllib.request.urlopen(req, timeout=120))
prices = {}
for x in data:
    try:
        p = round(float(x.get("price") or 0))
    except (TypeError, ValueError):
        continue
    if p > 0 and x.get("ankamaId"):
        prices[str(x["ankamaId"])] = p
if len(prices) < 100:
    raise SystemExit(f"Réponse suspecte ({len(prices)} prix) : fichier non modifié")
out = ROOT / "data" / "km" / (server.lower().replace(" ", "-") + ".json")
out.parent.mkdir(parents=True, exist_ok=True)
json.dump({"server": server, "fetched": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "source": "https://kamamaster.fr",
           "prices": dict(sorted(prices.items(), key=lambda kv: int(kv[0])))}, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{server} : {len(prices)} prix enregistrés dans {out.relative_to(ROOT)}")
