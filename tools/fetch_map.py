#!/usr/bin/env python3
"""Données de la carte interactive (monde des Douze), à relancer après une mise à jour du jeu.

Usage : python3 tools/fetch_map.py [Orukam]

Écrit data/map.json :
  "cells": [[x, y, id_sous_zone], ...]       cartes extérieures du monde principal (DofusDB, map-positions, worldMap 1)
  "res":   [[id_objet, nom, métier, niveau], ...]   ressources récoltables (Kamamaster)
  "spawns": {id_objet: [[x, y, quantité], ...]}      emplacements des ressources (Kamamaster, resource-spawns)
Les anomalies (bonus % par sous-zone) viennent de data/km/orukam.json, mis à jour toutes les 2 heures.
Environ 200 appels à DofusDB (pages de 50) et 25 à Kamamaster : à ne lancer qu'occasionnellement.
"""
import json, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "AtelierDofus/1.0 (outil privé d'un groupe d'amis)"}


def get(url, pause):
    data = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180))
    time.sleep(pause)
    return data


def main():
    server = sys.argv[1] if len(sys.argv) > 1 else "Orukam"
    # 1. Cartes extérieures du monde principal
    cells, skip = {}, 0
    while True:
        q = urllib.parse.urlencode([("worldMap", 1), ("outdoor", "true"), ("$limit", 50), ("$skip", skip),
                                    ("$select[]", "posX"), ("$select[]", "posY"), ("$select[]", "subAreaId")], safe="$[]")
        d = get("https://api.dofusdb.fr/map-positions?" + q, 0.25)
        for m in d["data"]:
            cells.setdefault((m["posX"], m["posY"]), m["subAreaId"])
        skip += len(d["data"])
        if not d["data"] or skip >= d["total"]:
            break
    print(len(cells), "cartes")

    # 2. Ressources récoltables et leurs emplacements
    base = "https://api.kamamaster.fr/api/map/"
    res = get(base + "resources?" + urllib.parse.urlencode({"server": server}), 2)["resources"]
    res = [r for r in res if (r.get("spawnMapCount") or 0) > 0]
    spawns = {}
    for i in range(0, len(res), 40):
        q = [("resourceIds", r["resourceId"]) for r in res[i:i + 40]] + [("minX", -300), ("maxX", 300), ("minY", -300), ("maxY", 300), ("server", server)]
        for s in get(base + "resource-spawns?" + urllib.parse.urlencode(q), 2)["spawns"]:
            spawns.setdefault(str(s["resourceId"]), []).append([s["posX"], s["posY"], s.get("quantity") or 1])
    out = {"source": "DofusDB (cartes), Kamamaster (ressources)",
           "cells": sorted([x, y, sa] for (x, y), sa in cells.items()),
           "res": sorted(([r["resourceId"], r["name"], r.get("job") or r.get("group") or "", r.get("level") or 0] for r in res if str(r["resourceId"]) in spawns), key=lambda r: (r[2], r[3], r[1])),
           "spawns": spawns}
    json.dump(out, open(ROOT / "data" / "map.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(len(out["res"]), "ressources,", sum(len(v) for v in spawns.values()), "emplacements")


if __name__ == "__main__":
    main()
