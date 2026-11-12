#!/usr/bin/env python3
"""Coefficients d'XP de craft publiés par DofusDB (https://dofusdb.fr), pour le calcul d'XP des métiers.

Usage : python3 tools/fetch_dofusdb_xp.py

Écrit data/xp.json : {"source", "fetched",
                      "types": {id_type: ratio %},   types d'objets dont l'XP de craft diffère de 100 %
                      "items": {id_objet: ratio %}}  objets dont l'XP de craft diffère (prioritaire sur le type)
Formule (simulateur d'XP de DofusDB) : XP d'un craft de niveau R au niveau de métier M =
    0 si M − R > 100, sinon ⌊20 × R ÷ ((M − R)^1,1 ÷ 10 + 1) × ratio / 100 × bonus / 100⌋
XP totale du niveau N : N × (N − 1) × 10.
À relancer après une mise à jour du jeu (une vingtaine d'appels).
"""
import json, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://api.dofusdb.fr/"
UA = {"User-Agent": "AtelierDofus/1.0 (outil privé d'un groupe d'amis)"}


def page(path, params):
    out, skip = [], 0
    while True:
        q = urllib.parse.urlencode({**params, "$limit": 50, "$skip": skip}, safe="$[]")
        d = json.load(urllib.request.urlopen(urllib.request.Request(API + path + "?" + q, headers=UA), timeout=60))
        out += d["data"]
        skip += len(d["data"])
        time.sleep(0.5)
        if not d["data"] or skip >= d["total"]:
            return out


def main():
    types = {str(x["id"]): x["craftXpRatio"] for x in page("item-types", {"craftXpRatio[$ne]": -1})}
    items = {str(x["id"]): x["craftXpRatio"] for x in page("items", {"craftXpRatio[$ne]": -1})}
    out = {"source": "https://dofusdb.fr", "fetched": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "types": dict(sorted(types.items(), key=lambda kv: int(kv[0]))), "items": dict(sorted(items.items(), key=lambda kv: int(kv[0])))}
    json.dump(out, open(ROOT / "data" / "xp.json", "w", encoding="utf-8"), separators=(",", ":"))
    print(f"{len(types)} types et {len(items)} objets avec un coefficient d'XP particulier")


if __name__ == "__main__":
    main()
