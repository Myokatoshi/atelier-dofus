#!/usr/bin/env python3
"""Données de la carte interactive (toutes les cartes visibles du jeu), à relancer après une mise à jour du jeu.

Usage : python3 tools/fetch_map.py [Orukam]

Écrit data/map.json :
  "worlds": [{id, name, origineX, origineY, mapWidth, mapHeight, totalWidth, totalHeight, scales}]   cartes (DofusDB)
  "cells":  [[x, y, id_sous_zone, id_carte], ...]   cartes du jeu (DofusDB, map-positions ; Monde des Douze : extérieur seulement)
  "res":    [[id_objet, nom, métier, niveau], ...]  ressources récoltables (Kamamaster)
  "spawns": {id_objet: [[x, y, quantité, id_carte], ...]}  emplacements des ressources (Kamamaster), carte déduite de la sous-zone
  "hints":  [[x, y, id_carte, catégorie, gfx, nom], ...]   repères : zaaps, transports, ateliers, HDV, banques (DofusDB)
Icônes des repères : data/hints/<gfx>.png. Images des cartes : tools/fetch_worldmap.py.
Les anomalies (bonus % par sous-zone) viennent de data/km/orukam.json, mis à jour toutes les 2 heures.
Environ 350 appels à DofusDB et 25 à Kamamaster : à ne lancer qu'occasionnellement.
"""
import json, sys, time, urllib.parse, urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "AtelierDofus/1.0 (outil privé d'un groupe d'amis)"}
DDB = "https://api.dofusdb.fr/"
SCALES = {1: [0.2, 0.4, 0.6]}  # autres cartes : 0.25 et 0.5
KEEP_HINTS = {2, 3, 9} | {4}    # HDV, ateliers, transports (dont zaaps), divers (banques…)


def get(url, pause):
    data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180).read()
    time.sleep(pause)
    return data


def ddb_all(path, params):
    out, skip = [], 0
    while True:
        q = urllib.parse.urlencode(params + [("$limit", 50), ("$skip", skip)], safe="$[]")
        d = json.loads(get(DDB + path + "?" + q, 0.2))
        out += d["data"]
        skip += len(d["data"])
        if not d["data"] or skip >= d["total"]:
            return out


def main():
    server = sys.argv[1] if len(sys.argv) > 1 else "Orukam"
    # 1. Cartes visibles
    worlds = []
    for w in ddb_all("worlds", []):
        if not w.get("visibleOnMap") or not w.get("totalWidth"):
            continue
        worlds.append({"id": w["id"], "name": w["name"]["fr"], **{k: w[k] for k in ("origineX", "origineY", "mapWidth", "mapHeight", "totalWidth", "totalHeight")},
                       "scales": SCALES.get(w["id"], [0.25, 0.5])})
    ids = {w["id"] for w in worlds}
    print(len(worlds), "cartes")

    # 2. Cartes du jeu (positions), par carte
    cells = {}
    for m in ddb_all("map-positions", [("$select[]", "posX"), ("$select[]", "posY"), ("$select[]", "subAreaId"), ("$select[]", "worldMap"), ("$select[]", "outdoor")]):
        w = m.get("worldMap")
        if w not in ids or (w == 1 and not m.get("outdoor")):
            continue
        cells.setdefault((w, m["posX"], m["posY"]), m["subAreaId"])
    sub_world = {}
    count = defaultdict(Counter)
    for (w, x, y), sa in cells.items():
        count[sa][w] += 1
    for sa, c in count.items():
        sub_world[sa] = c.most_common(1)[0][0]
    print(len(cells), "cartes du jeu")

    # 3. Repères (zaaps, ateliers, transports, HDV, banques)
    hints = []
    for h in ddb_all("hints", []):
        if h.get("worldMapId") in ids and h.get("categoryId") in KEEP_HINTS:
            hints.append([h["x"], h["y"], h["worldMapId"], h["categoryId"], h["gfx"], h["name"]["fr"]])
    gdir = ROOT / "data" / "hints"
    gdir.mkdir(parents=True, exist_ok=True)
    for g in sorted({h[4] for h in hints}):
        f = gdir / f"{g}.png"
        if not f.exists():
            try:
                f.write_bytes(get(f"{DDB}img/hints/{g}.png", 0.1))
            except Exception as e:
                print("icône manquante", g, e)
    print(len(hints), "repères")

    # 4. Ressources récoltables et leurs emplacements (Kamamaster)
    base = "https://api.kamamaster.fr/api/map/"
    res = json.loads(get(base + "resources?" + urllib.parse.urlencode({"server": server}), 2))["resources"]
    res = [r for r in res if (r.get("spawnMapCount") or 0) > 0]
    spawns = {}
    for i in range(0, len(res), 40):
        q = [("resourceIds", r["resourceId"]) for r in res[i:i + 40]] + [("minX", -300), ("maxX", 300), ("minY", -300), ("maxY", 300), ("server", server)]
        for s in json.loads(get(base + "resource-spawns?" + urllib.parse.urlencode(q), 2))["spawns"]:
            w = sub_world.get(s.get("subAreaId"), 1)
            spawns.setdefault(str(s["resourceId"]), []).append([s["posX"], s["posY"], s.get("quantity") or 1, w])

    out = {"source": "DofusDB (cartes, repères), Kamamaster (ressources)", "worlds": worlds,
           "cells": sorted([x, y, sa, w] for (w, x, y), sa in cells.items()),
           "res": sorted(([r["resourceId"], r["name"], r.get("job") or r.get("group") or "", r.get("level") or 0] for r in res if str(r["resourceId"]) in spawns), key=lambda r: (r[2], r[3], r[1])),
           "spawns": spawns, "hints": hints}
    json.dump(out, open(ROOT / "data" / "map.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(len(out["res"]), "ressources,", sum(len(v) for v in spawns.values()), "emplacements")


if __name__ == "__main__":
    main()
