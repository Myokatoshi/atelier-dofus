#!/usr/bin/env python3
"""Données du simulateur de build, depuis DofusDB (https://dofusdb.fr) : classes, sorts, armes.

Usage : python3 tools/fetch_dofusdb_builds.py

Écrit data/build.json :
  "breeds": [[id, nom, ids des sorts (paires sort/variante à la suite), [[sort, variante]…]]]                      19 classes
  "spells": {id: [nom, icône, [[niveau min, PA, PO min, PO max, % critique, lancers/tour, lancers/cible,
                                intervalle, PO modifiable, effets, effets critiques]]]}   un grade par palier de niveau
     effet = [id d'effet, min, max, durée, cible (masque), zone]
  "effects": {id: [texte, caractéristique, catégorie, élément]}  textes des effets utilisés (catégorie 2 = dégâts)
  "passives": {id objet: [sorts passifs]}, "pspells": {sort: [nom, description, effets]}   Dofus, objets légendaires
  "weapons": {id objet: [PA, PO min, PO max, % critique, bonus critique, lancers/tour, [[id d'effet, min, max]]]}
Les images (icônes des sorts, têtes des classes) viennent du client Dofus 3 : tools/fetch_dofus3_images.py.
À relancer après une mise à jour du jeu (une centaine d'appels).
"""
import json, re, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path


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
    # breedSpellsId ne donne qu'un sort par paire : les variantes (deuxième sort de chaque paire) viennent de spell-variants
    variants = {}
    for v in page("spell-variants", {}):
        variants.setdefault(v.get("breedId"), []).append(v.get("spellIds") or [])
    out_b = []
    for b in breeds:
        ids = list(b.get("breedSpellsId") or [])
        pairs = variants.get(b["id"], [])
        order = {s: i for i, s in enumerate(ids)}
        pairs.sort(key=lambda p: min(order.get(x, 999) for x in p))
        allids = [x for p in pairs for x in p] + [x for x in ids if not any(x in p for p in pairs)]
        out_b.append([b["id"], b["shortName"]["fr"], allids, pairs])
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
    weapons = {}
    for t in WEAPON_TYPES:
        for it in page("items", {"typeId": t}):
            dmg = [[e["effectId"], e.get("from") or 0, max(e.get("to") or 0, e.get("from") or 0)] for e in it.get("effects") or [] if e.get("category") == 2]
            used.update(d[0] for d in dmg)
            weapons[str(it["id"])] = [it.get("apCost") or 0, it.get("minRange") or 0, it.get("range") or 0, it.get("criticalHitProbability") or 0,
                                      it.get("criticalHitBonus") or 0, it.get("maxCastPerTurn") or 0, dmg]
    # Passifs des Dofus et objets légendaires : effet 1175 « lance le sort » -> sort passif (nom, description, effets du dernier grade)
    passives, pspells = {}, {}
    for it in page("items", {"possibleEffects.effectId": 1175, "$select[]": ["id", "possibleEffects"]}):
        sids = [e.get("diceNum") for e in it.get("possibleEffects") or [] if e.get("effectId") == 1175 and e.get("diceNum")]
        if sids:
            passives[str(it["id"])] = sids
    clean = lambda t: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", re.sub(r"\{\{[^}]*::([^}]*)\}\}", r"\1", t or ""))).strip()
    ps_ids = sorted({x for v in passives.values() for x in v})
    ps_lv = {}
    for lv in by_ids("spell-levels", "spellId", ps_ids):
        if lv["spellId"] not in ps_lv or lv.get("grade", 0) > ps_lv[lv["spellId"]].get("grade", 0):
            ps_lv[lv["spellId"]] = lv
    for sp in by_ids("spells", "id", ps_ids):
        lv = ps_lv.get(sp["id"], {})
        ef = [fx(e) for e in lv.get("effects") or []]
        used.update(e[0] for e in ef)
        pspells[str(sp["id"])] = [sp["name"]["fr"], clean((sp.get("description") or {}).get("fr")), ef]
    effects = {str(e["id"]): [e["description"]["fr"], e.get("characteristic") or 0, e.get("category") or 0, e.get("elementId", -1)]
               for e in by_ids("effects", "id", list(used))}
    data = {"source": "DofusDB (dofusdb.fr)", "fetched": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "breeds": out_b, "spells": out_s, "effects": effects, "weapons": weapons,
            "passives": passives, "pspells": pspells}
    (ROOT / "data" / "build.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(len(out_b), "classes,", len(out_s), "sorts,", len(weapons), "armes,", len(effects), "effets")


if __name__ == "__main__":
    main()
