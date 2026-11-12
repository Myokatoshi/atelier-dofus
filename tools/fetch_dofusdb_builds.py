#!/usr/bin/env python3
"""Données du simulateur de build, depuis DofusDB (https://dofusdb.fr) : classes, sorts, armes.

Usage : python3 tools/fetch_dofusdb_builds.py

Écrit data/build.json :
  "breeds": [[id, nom, ids des sorts]]                      19 classes
  "spells": {id: [nom, icône, [[niveau min, PA, PO min, PO max, % critique, lancers/tour, lancers/cible,
                                intervalle, PO modifiable, effets, effets critiques]]]}   un grade par palier de niveau
     effet = [id d'effet, min, max, durée, cible (masque), zone]
  "effects": {id: [texte, caractéristique, catégorie, élément]}  textes des effets utilisés (catégorie 2 = dégâts)
  "weapons": {id objet: [PA, PO min, PO max, % critique, bonus critique, lancers/tour, [[id d'effet, min, max]]]}
et les icônes des sorts dans data/spells/<icône>.webp, les symboles de classe dans data/breeds/<id>.webp.
À relancer après une mise à jour du jeu (une centaine d'appels).
"""
import io, json, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
API = "https://api.dofusdb.fr/"
UA = {"User-Agent": "AtelierDofus/1.0 (outil privé d'un groupe d'amis)"}
WEAPON_TYPES = [2, 3, 4, 5, 6, 7, 8, 19, 20, 21, 22, 114, 271]


def get(url):
    for i in range(4):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        except Exception:
            if i == 3:
                raise
            time.sleep(2 + i * 3)


def page(path, params):
    out, skip = [], 0
    while True:
        q = urllib.parse.urlencode({**params, "$limit": 50, "$skip": skip}, safe="$[]", doseq=True)
        d = json.loads(get(API + path + "?" + q))
        out += d["data"]
        skip += len(d["data"])
        time.sleep(0.4)
        if not d["data"] or skip >= d["total"]:
            return out


def by_ids(path, key, ids):
    out, ids = [], sorted(set(i for i in ids if i))
    for i in range(0, len(ids), 40):
        out += page(path, {f"{key}[$in][]": ids[i:i + 40]})
    return out


def webp(url, dest, size):
    if dest.exists():
        return
    try:
        im = Image.open(io.BytesIO(get(url))).convert("RGBA")
    except Exception as e:
        print("  image manquante", url, e)
        return
    im.thumbnail((size, size), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "WEBP", quality=85, method=6)
    time.sleep(0.2)


def fx(e):
    lo, hi = e.get("diceNum") or 0, e.get("diceSide") or 0
    if not hi or hi < lo:
        hi = lo
    if not lo and e.get("value"):
        lo = hi = e["value"]
    z = e.get("zoneDescr") or {}
    zone = chr(z["shape"]) + str(z.get("param1") or "") if z.get("shape") else ""
    return [e["effectId"], lo, hi, e.get("duration") or 0, e.get("targetMask") or "", zone]


def main():
    breeds = sorted(page("breeds", {}), key=lambda b: b.get("sortIndex", b["id"]))
    out_b = [[b["id"], b["shortName"]["fr"], b.get("breedSpellsId") or []] for b in breeds]
    for b in breeds:
        webp(b["img"], ROOT / "data" / "breeds" / f"{b['id']}.webp", 64)
    spell_ids = [s for b in out_b for s in b[2]]
    spells = by_ids("spells", "id", spell_ids)
    levels = by_ids("spell-levels", "spellId", spell_ids)
    by_spell = {}
    for lv in levels:
        by_spell.setdefault(lv["spellId"], []).append(lv)
    out_s, used = {}, set()
    for s in spells:
        grades = []
        for lv in sorted(by_spell.get(s["id"], []), key=lambda x: x.get("grade", 0)):
            ef = [fx(e) for e in lv.get("effects") or [] if e.get("visibleInTooltip", True)]
            cr = [fx(e) for e in lv.get("criticalEffect") or [] if e.get("visibleInTooltip", True)]
            used.update(e[0] for e in ef + cr)
            grades.append([lv.get("minPlayerLevel") or 1, lv.get("apCost") or 0, lv.get("minRange") or 0, lv.get("range") or 0,
                           lv.get("criticalHitProbability") or 0, lv.get("maxCastPerTurn") or 0, lv.get("maxCastPerTarget") or 0,
                           lv.get("minCastInterval") or 0, 1 if lv.get("rangeCanBeBoosted") else 0, ef, cr])
        out_s[str(s["id"])] = [s["name"]["fr"], s.get("iconId") or 0, grades]
        if s.get("iconId"):
            webp(f"{API}img/spells/sort_{s['iconId']}.png", ROOT / "data" / "spells" / f"{s['iconId']}.webp", 48)
    weapons = {}
    for t in WEAPON_TYPES:
        for it in page("items", {"typeId": t}):
            dmg = [[e["effectId"], e.get("from") or 0, max(e.get("to") or 0, e.get("from") or 0)] for e in it.get("effects") or [] if e.get("category") == 2]
            used.update(d[0] for d in dmg)
            weapons[str(it["id"])] = [it.get("apCost") or 0, it.get("minRange") or 0, it.get("range") or 0, it.get("criticalHitProbability") or 0,
                                      it.get("criticalHitBonus") or 0, it.get("maxCastPerTurn") or 0, dmg]
    effects = {str(e["id"]): [e["description"]["fr"], e.get("characteristic") or 0, e.get("category") or 0, e.get("elementId", -1)]
               for e in by_ids("effects", "id", list(used))}
    data = {"source": "DofusDB (dofusdb.fr)", "fetched": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "breeds": out_b, "spells": out_s, "effects": effects, "weapons": weapons}
    (ROOT / "data" / "build.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(len(out_b), "classes,", len(out_s), "sorts,", len(weapons), "armes,", len(effects), "effets")


if __name__ == "__main__":
    main()
