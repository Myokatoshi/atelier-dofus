#!/usr/bin/env python3
"""Mines (minerais sous terre) pour la carte interactive : ajoute à data/map.json la clé "mines" et marque
les emplacements souterrains des minerais (5e valeur = 1 dans "spawns").

Usage : python3 tools/build_mines.py <MapsInformationDataRoot.asset> [<spawns_minerais.json>] [Orukam]

- MapsInformationDataRoot.asset : fichiers du jeu (Ankama), extraits par doduda + pydofus3 (voir CLAUDE.md,
  chaîne du rendu Dofus 3) : position (posX, posY), sous-zone et carte (worldMap) de chaque carte du jeu.
  worldMap = -1 : carte qui n'apparaît sur aucune carte du monde (salles des mines, grottes…).
- spawns_minerais.json : réponse de Kamamaster « map/resource-spawns » pour les minerais ; absent = 1 appel.
- .cache/subareas.json, .cache/areas.json, .cache/fr.json (tools/build_data.py) : noms des sous-zones et zones.

Un emplacement de minerai (x, y, sous-zone) est souterrain si la sous-zone a une salle hors carte (worldMap -1)
à ces coordonnées, s'il n'est pas sur une carte extérieure du Monde des Douze (« cells » de data/map.json),
ou si la sous-zone est une mine, une galerie, un tunnel, une grotte ou des souterrains (d'après son nom).
Vérifié : dans les sous-zones à la fois en surface et sous terre, les minerais tombent presque tous sur les
quelques coordonnées qui ont une salle souterraine (ex. Forêt des pins perdus : 36 sur 36, 4 cartes sur 210).
Le plan des mines n'existe pas dans le jeu (beaucoup de salles partagent les mêmes coordonnées) : on donne
l'entrée (coordonnées), le nombre de salles (cartes souterraines de la sous-zone à 2 cases au plus) et les
minerais présents. Une sous-zone peut avoir plusieurs mines (ex. « Souterrains » d'Amakna) : une mine = un groupe
d'emplacements voisins (à 2 cases au plus).
"""
import json, re, sys, urllib.parse, urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
UNDER = re.compile(r"^(Mines?|Galeries?|Souterrains?|Tunnel|Grottes?)\b|souterrain", re.I)


def refs(name):
    return [x["data"] for x in json.load(open(CACHE / name, encoding="utf-8"))["references"]["RefIds"] if "id" in x["data"]]


def main():
    maps = json.load(open(sys.argv[1], encoding="utf-8"))["objectsById"].values()
    server = sys.argv[3] if len(sys.argv) > 3 else "Orukam"
    M = json.load(open(ROOT / "data" / "map.json", encoding="utf-8"))
    ores = [r[0] for r in M["res"] if r[2] == "Mineur"]
    if len(sys.argv) > 2 and Path(sys.argv[2]).exists():
        sp = json.load(open(sys.argv[2], encoding="utf-8"))["spawns"]
    else:
        q = [("resourceIds", i) for i in ores] + [("minX", -300), ("maxX", 300), ("minY", -300), ("maxY", 300), ("server", server)]
        url = "https://api.kamamaster.fr/api/map/resource-spawns?" + urllib.parse.urlencode(q)
        sp = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "AtelierDofus/1.0 (outil privé d'un groupe d'amis)"}), timeout=120).read())["spawns"]
    L = json.load(open(CACHE / "fr.json", encoding="utf-8"))["entries"]
    tr = lambda i: L.get(str(i), "")
    subs = {s["id"]: s for s in refs("subareas.json")}
    areas = {a["id"]: tr(a["nameId"]) for a in refs("areas.json")}
    sname = lambda sa: tr(subs[sa]["nameId"]) if sa in subs else "Zone %d" % sa

    outdoor = {(c[0], c[1], c[2]) for c in M["cells"] if c[3] == 1}
    hidden = {(m["posX"], m["posY"], m["subAreaId"]) for m in maps if m["worldMap"] == -1}
    under = lambda x, y, sa: (x, y, sa) in hidden or (x, y, sa) not in outdoor or bool(UNDER.search(sname(sa)))

    # emplacements souterrains par sous-zone, puis une mine = groupe de cases voisines (à 2 cases au plus)
    pts, flag = defaultdict(list), defaultdict(set)
    for s in sp:
        rid, x, y, sa, q = s["resourceId"], s["posX"], s["posY"], s["subAreaId"], s.get("quantity") or 1
        if rid in ores and under(x, y, sa):
            flag[str(rid)].add((x, y)); pts[sa].append((x, y, rid, q))
    roompos = defaultdict(list)
    for m in maps:
        k = (m["posX"], m["posY"], m["subAreaId"])
        if m["worldMap"] == -1 or (m["worldMap"] == 1 and (k not in outdoor or UNDER.search(sname(k[2])))):
            roompos[k[2]].append(k[:2])
    mines = {}
    for sa, l in pts.items():
        groups = []
        for x, y, rid, q in l:
            near = [g for g in groups if any(max(abs(x - a), abs(y - b)) <= 2 for a, b in g["c"])]
            g = near[0] if near else {"c": {}, "o": defaultdict(int)}
            for o in near[1:]:
                for c, v in o["c"].items(): g["c"][c] = g["c"].get(c, 0) + v
                for r, v in o["o"].items(): g["o"][r] += v
                groups.remove(o)
            if not near: groups.append(g)
            g["c"][(x, y)] = g["c"].get((x, y), 0) + q
            g["o"][rid] += q
        for i, g in enumerate(groups):
            g["r"] = sum(1 for a, b in roompos[sa] if any(max(abs(a - x), abs(b - y)) <= 2 for x, y in g["c"])) or len(g["c"])
            mines[(sa, i)] = g
    # emplacements souterrains (5e valeur) ; un emplacement partagé surface / mine compte comme souterrain
    n = 0
    for rid, l in M["spawns"].items():
        for e in l:
            del e[4:]
            if (e[0], e[1]) in flag.get(rid, ()):
                e.append(1); n += 1
    M["mines"] = sorted(([sa, sname(sa), areas.get(subs.get(sa, {}).get("areaId"), ""), m["r"],
                          [[x, y] for (x, y), _ in sorted(m["c"].items(), key=lambda t: -t[1])],
                          {str(k): v for k, v in sorted(m["o"].items(), key=lambda t: -t[1])}]
                         for (sa, _), m in mines.items()), key=lambda t: -sum(t[5].values()))
    M["source"] = "DofusDB (cartes, repères), Kamamaster (ressources), fichiers du jeu (mines)"
    json.dump(M, open(ROOT / "data" / "map.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    tot = sum(s.get("quantity") or 1 for s in sp if s["resourceId"] in ores)
    print(len(M["mines"]), "mines,", n, "emplacements souterrains,", sum(sum(m[5].values()) for m in M["mines"]), "minerais sous terre sur", tot)


if __name__ == "__main__":
    main()
