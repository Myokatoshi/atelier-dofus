#!/usr/bin/env python3
"""Âmes capturées et pierres de capture.

- souls  : objet « âme » -> [niveau max du ou des monstres, "archi" | "boss"]
- stones : [[objet pierre, niveau de capture maximal], ...] trié par niveau

Utilisé par tools/build_data.py. Peut aussi compléter un data/core.json existant :
    python3 tools/souls.py chemin/monsters.json chemin/fr.json
"""
import json, re, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOUL_TYPES = {"Âme d'archimonstre": "archi", "Âme de gardien de donjon": "boss"}
CAPTURE = re.compile(r"Capture d'âme de niveau (\d+) maximum")


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()


def singular(s):
    return " ".join(w[:-1] if len(w) > 3 and w.endswith("s") else w for w in s.split())


def compute(L, monsters, items, types, det_of):
    """L : traductions ; monsters : MonsterData ; items/types : core.json ; det_of(id) -> détail (effets)."""
    levels = {}
    for m in monsters:
        name = L.get(str(m["nameId"]), "")
        if not name:
            continue
        lv = max([g["level"] for g in m["grades"]["Array"]] or [0])
        key = norm(name)
        # Même nom pour plusieurs versions (classique, Expédition...) : on garde la version la plus basse
        levels[key] = min(levels.get(key, lv), lv)
    by_sing = {}
    for key, lv in levels.items():
        by_sing[singular(key)] = min(by_sing.get(singular(key), lv), lv)

    def level_of(part):
        k = norm(part)
        if k in levels:
            return levels[k]
        k = singular(k)
        if k in by_sing:
            return by_sing[k]
        # « Gelées Royales » -> toutes les « gelée royale ... »
        hits = [lv for name, lv in by_sing.items() if name.startswith(k)]
        return max(hits) if hits else None

    souls = {}
    for iid, it in items.items():
        kind = SOUL_TYPES.get((types.get(str(it[2])) or [""])[0])
        if not kind:
            continue
        # Le niveau de l'objet « âme » est celui du monstre ; s'il vaut 1, on le déduit des monstres
        if it[1] > 1:
            souls[int(iid)] = [it[1], kind]
            continue
        name = it[0].split(":", 1)[1] if ":" in it[0] else it[0]
        parts = [p for p in re.split(r"\s*&\s*|\s*,\s*", name) if p.strip()]
        lvls = [lv for lv in (level_of(p) for p in parts) if lv]
        if lvls:
            souls[int(iid)] = [max(lvls), kind]

    stones = []
    for iid, it in items.items():
        if (types.get(str(it[2])) or [""])[0] != "Pierre d'âme":
            continue
        for fx in det_of(int(iid)).get("fx", []):
            m = CAPTURE.search(fx)
            if m:
                stones.append([int(iid), int(m.group(1))])
    stones.sort(key=lambda x: x[1])
    return souls, stones


def main():
    monsters = [x["data"] for x in json.load(open(sys.argv[1], encoding="utf-8"))["references"]["RefIds"] if x["type"]["class"] == "MonsterData"]
    L = json.load(open(sys.argv[2], encoding="utf-8"))["entries"]
    core_path = ROOT / "data" / "core.json"
    core = json.load(open(core_path, encoding="utf-8"))
    det = {}

    def det_of(i):
        n = i % 32
        if n not in det:
            det[n] = json.load(open(ROOT / "data" / "det" / f"{n:02d}.json", encoding="utf-8"))
        return det[n].get(str(i), {})

    souls, stones = compute(L, monsters, core["items"], core["types"], det_of)
    core["souls"], core["stones"] = souls, stones
    json.dump(core, open(core_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(souls)} âmes reliées à un niveau de monstre, {len(stones)} pierres de capture")


if __name__ == "__main__":
    main()
