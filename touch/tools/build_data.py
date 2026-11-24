#!/usr/bin/env python3
"""Prépare les fichiers de data/ à partir des tables brutes de Dofus Touch (.cache/raw, voir tools/fetch_data.py).

Usage : python3 tools/build_data.py

Fichiers écrits (JSON compacts, chargés par js/app.js) :
- core.json    : version, objets, types, effets, panoplies, recettes, métiers, récoltes (chargé au démarrage)
- monsters.json: monstres (grades, résistances, zones, butin), races
- world.json   : zones, sous-zones (niveau, monstres, cases), donjons, repères (zaaps, ateliers…), cartes
- spells.json  : classes (coûts des caractéristiques, sorts) et sorts (niveaux, effets)
- quests.json  : quêtes, catégories, succès, catégories de succès, défis
- almanax.json : calendrier de l'Almanax (bonus, Méryde, offrande)
- desc.json    : descriptions des objets (chargé à l'ouverture d'une fiche)
- misc.json    : familiers (nourriture), montures, titres, compagnons
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / ".cache" / "raw"
OUT = ROOT / "data"


def load(name):
    return json.loads((RAW / f"{name}.json").read_text())


def save(name, obj):
    OUT.mkdir(exist_ok=True)
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    (OUT / name).write_text(s)
    print(f"{name}: {len(s) / 1e6:.2f} Mo")


def strip(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def trim(a):
    """Retire les zéros de fin d'une liste (fichiers plus petits)."""
    a = list(a)
    while a and not a[-1]:
        a.pop()
    return a


def fx(effects):
    """Effets d'objet : [effet, min, max, valeur] (max 0 = valeur fixe)."""
    out = []
    for e in effects or []:
        if not e or "effectId" not in e:
            continue
        out.append(trim([e["effectId"], e.get("diceNum", 0), e.get("diceSide", 0), e.get("value", 0)]))
    return out


def spell_fx(effects):
    """Effets de sort : [effet, min, max, valeur, durée, zone, cibles, déclencheurs, caché]."""
    out = []
    for e in effects or []:
        out.append([e["effectId"], e.get("diceNum", 0), e.get("diceSide", 0), e.get("value", 0), e.get("duration", 0),
                    e.get("rawZone", ""), e.get("targetMask", ""), e.get("triggers", ""), 1 if e.get("hidden") else 0])
    return out


def crit_class(crit):
    """Condition d'un drop : niveau du perso (PL), quête/saison/objet possédé, ou aucune."""
    if not crit or crit == "null":
        return 0, 0, 0
    lo = hi = 0
    for m in re.finditer(r"PL([<>])(\d+)", crit):
        if m.group(1) == ">":
            lo = int(m.group(2)) + 1
        else:
            hi = int(m.group(2)) - 1
    other = bool(re.search(r"(Q[a-z]|Sc|PO|Pj|PJ|Ps|Sd|Pm|PB|CU)[=!<>]", crit))
    return (2 if other else (1 if lo or hi else 0)), lo, hi


def main():
    cfg = json.loads((ROOT / ".cache" / "config.json").read_text())
    items_raw = load("Items")
    types_raw = load("ItemTypes")
    effects_raw = load("Effects")
    sets_raw = load("ItemSets")
    recipes_raw = load("Recipes")
    jobs_raw = load("Jobs")
    skills_raw = load("Skills")
    monsters_raw = load("Monsters")
    races_raw = load("MonsterRaces")
    sraces_raw = load("MonsterSuperRaces")
    subareas_raw = load("SubAreas")
    areas_raw = load("Areas")
    dungeons_raw = load("Dungeons")
    mappos = load("MapPositions")
    npcs = load("Npcs")

    # ---------- Objets ----------
    used_effects = set()
    items, desc = {}, {}
    for k, it in items_raw.items():
        name = it.get("nameId")
        if not name:
            continue
        e = fx(it.get("possibleEffects"))
        used_effects.update(x[0] for x in e)
        flags = (0 if it.get("exchangeable", True) else 1) | (2 if it.get("etheral") else 0) | (4 if it.get("usable") else 0) \
            | (8 if it.get("twoHanded") else 0) | (16 if it.get("secretRecipe") else 0) | (32 if it.get("cursed") else 0)
        weapon = []
        if it.get("_type") == "Weapon":
            weapon = [it.get("apCost", 0), it.get("minRange", 0), it.get("range", 0), it.get("criticalHitProbability", 0),
                      it.get("criticalHitBonus", 0), it.get("maxCastPerTurn", 0), 1 if it.get("castInLine") else 0]
        crit = it.get("criteria") or ""
        items[k] = [name, it["typeId"], it.get("level", 0), it.get("iconId", 0), (it.get("itemSetIds") or [0])[0] if it.get("itemSetIds") else 0,
                    e, "" if crit == "null" else crit, it.get("realWeight", 0), flags, weapon, it.get("price", 0)]
        if it.get("descriptionId"):
            desc[k] = strip(it["descriptionId"])
    types = {k: [t["nameId"], t["superTypeId"]] for k, t in types_raw.items()}

    # ---------- Panoplies ----------
    sets = {}
    for k, s in sets_raw.items():
        bonus = []
        for lst in s.get("effects") or []:
            b = fx(lst)
            used_effects.update(x[0] for x in b)
            bonus.append(b)
        sets[k] = [s["nameId"], s["items"], bonus]
        for i in s["items"]:
            if str(i) in items and not items[str(i)][4]:
                items[str(i)][4] = int(k)

    # ---------- Recettes, métiers, récoltes ----------
    recipes = {}
    for r in recipes_raw.values():
        if str(r["resultId"]) in items:
            recipes[str(r["resultId"])] = [r["jobId"], r["ingredientIds"], r["quantities"]]
    jobs = {k: [j["nameId"], j.get("iconId", 0)] for k, j in jobs_raw.items()}
    harvest = []
    for s in skills_raw.values():
        if s.get("gatheredRessourceItem", -1) > 0 and str(s["gatheredRessourceItem"]) in items:
            harvest.append([s["parentJobId"], s["gatheredRessourceItem"], s.get("levelMin", 1), s.get("subAreas", []), s["nameId"]])
    # Ateliers : compétence de craft -> métier (pour les recettes « sans métier » éventuelles)
    effects = {}
    for k in sorted(used_effects | {96, 97, 98, 99, 100, 91, 92, 93, 94, 95, 108, 101, 116, 127, 168, 169, 950, 951}):
        e = effects_raw.get(str(k))
        if e:
            effects[str(k)] = [e.get("descriptionId", ""), e.get("characteristic", 0), e.get("category", 0), e.get("bonusType", 0),
                               e.get("operator", "")]

    core = {
        "game": "Dofus Touch", "client": cfg.get("assetsUrl", "").rsplit("/", 1)[-1].split("_")[0],
        "assets": cfg.get("assetsUrl", ""),
        "types": types, "items": items, "effects": effects, "sets": sets, "recipes": recipes, "jobs": jobs, "harvest": harvest,
    }

    # ---------- Monstres ----------
    monsters = {}
    for k, m in monsters_raw.items():
        if not m.get("nameId"):
            continue
        grades = [[g.get("level", 0), g.get("lifePoints", 0), g.get("actionPoints", 0), g.get("movementPoints", 0), g.get("gradeXp", 0),
                   g.get("wisdom", 0), g.get("earthResistance", 0), g.get("waterResistance", 0), g.get("airResistance", 0),
                   g.get("fireResistance", 0), g.get("neutralResistance", 0), g.get("paDodge", 0), g.get("pmDodge", 0)]
                  for g in m.get("grades", [])]
        drops = []
        for d in m.get("drops", []):
            if str(d["objectId"]) not in items:
                continue
            c, lo, hi = crit_class(d.get("criteria"))
            drops.append(trim([d["objectId"], round(d.get("percentDropForGrade1", 0), 3), round(d.get("percentDropForGrade5", 0), 3),
                               c, lo, hi, 0 if d.get("hasProspectionBonus", True) else 1, d.get("findCeil", 0)]))
        kind = (1 if m.get("isBoss") else 0) | (2 if m.get("isMiniBoss") else 0) | (4 if m.get("isQuestMonster") else 0) \
            | (8 if not m.get("isVisibleInBestiary", True) else 0) | (16 if m.get("race") == 78 else 0)
        monsters[k] = [m["nameId"], m.get("race", 0), kind, grades, m.get("subareas", []), drops, m.get("favoriteSubareaId", 0)]
    races = {k: [r.get("nameId", ""), r.get("superRaceId", 0)] for k, r in races_raw.items() if r.get("nameId")}
    sraces = {k: r["nameId"] for k, r in sraces_raw.items()}
    save("monsters.json", {"monsters": monsters, "races": races, "superRaces": sraces})

    # ---------- Monde ----------
    map_sub = {int(k): v.get("subAreaId") for k, v in mappos.items()}
    subareas = {}
    for k, s in subareas_raw.items():
        subareas[k] = [s.get("nameId", ""), s.get("areaId", 0), s.get("level", 0), s.get("monsters", []), 1 if s.get("capturable") else 0]
    grid = {}  # cases du Monde des Douze (worldMap 1) : "x,y" -> sous-zone
    for v in mappos.values():
        if v.get("worldMap") == 1 and v.get("outdoor") and v.get("subAreaId"):
            grid.setdefault(f"{v['posX']},{v['posY']}", v["subAreaId"])
    for v in load("SubAreasWorldMapData").values():  # complète avec les positions affichées sur la carte du monde
        pos = (v.get("gridPositions") or {}).get("1") or []
        for i in range(0, len(pos) - 1, 2):
            grid.setdefault(f"{pos[i]},{pos[i + 1]}", v["id"])
    dungeons = {}
    for k, d in dungeons_raw.items():
        subs = sorted({map_sub.get(m) for m in d.get("mapIds", []) if map_sub.get(m)})
        ent = mappos.get(str(d.get("entranceMapId")), {})
        mons = sorted({m for s in subs for m in subareas_raw.get(str(s), {}).get("monsters", [])})
        dungeons[k] = [d["nameId"], d.get("optimalPlayerLevel", 0), d.get("dungeonKey", 0), subs, mons,
                       [ent.get("posX"), ent.get("posY")] if ent else None, len(d.get("mapIds", []))]
    hintcats = {k: v["nameId"] for k, v in load("HintCategory").items()}
    hints = [[h.get("categoryId", 0), h.get("nameId", ""), h.get("x", 0), h.get("y", 0), h.get("subareaId", 0), h.get("gfx", 0)]
             for h in load("Hints").values() if h.get("worldMapId") == 1]
    areas = {k: [a["nameId"], a.get("superAreaId", 0)] for k, a in areas_raw.items()}
    save("world.json", {"areas": areas, "subareas": subareas, "grid": grid, "dungeons": dungeons, "hints": hints, "hintcats": hintcats})

    # ---------- Classes et sorts ----------
    breeds_raw, spells_raw, levels_raw = load("Breeds"), load("Spells"), load("SpellLevels")
    stat_keys = ["Strength", "Intelligence", "Chance", "Agility", "Vitality", "Wisdom"]
    breeds, spells = {}, {}
    for k, b in breeds_raw.items():
        breeds[k] = [b["shortNameId"], strip(b.get("descriptionId")), {s: b.get("statsPointsFor" + s, []) for s in stat_keys},
                     b.get("breedSpellsId", []), b.get("maleArtwork", 0), b.get("femaleArtwork", 0)]
        for sid in b.get("breedSpellsId", []):
            s = spells_raw.get(str(sid))
            if not s:
                continue
            lv = []
            for lid in s.get("spellLevels", []):
                L = levels_raw.get(str(lid))
                if not L:
                    continue
                lv.append([L.get("minPlayerLevel", 0), L.get("apCost", 0), L.get("minRange", 0), L.get("range", 0),
                           L.get("criticalHitProbability", 0), L.get("minCastInterval", 0), L.get("maxCastPerTurn", 0),
                           L.get("maxCastPerTarget", 0), 1 if L.get("rangeCanBeBoosted") else 0, 1 if L.get("castInLine") else 0,
                           1 if L.get("castTestLos") else 0, spell_fx(L.get("effects")), spell_fx(L.get("criticalEffect")),
                           L.get("initialCooldown", 0), 1 if L.get("needFreeCell") else 0])
            spells[str(sid)] = [s.get("nameId", ""), strip(s.get("descriptionId")), s.get("iconId", 0), lv]
    used_sp = {e[0] for s in spells.values() for L in s[3] for e in L[11] + L[12]}
    for k in used_sp:
        e = effects_raw.get(str(k))
        if e and str(k) not in effects:
            effects[str(k)] = [e.get("descriptionId", ""), e.get("characteristic", 0), e.get("category", 0), e.get("bonusType", 0),
                               e.get("operator", "")]
    states = {k: v.get("nameId", "") for k, v in load("SpellStates").items()}
    save("spells.json", {"breeds": breeds, "spells": spells, "states": states})

    # ---------- Quêtes et succès ----------
    qcat_raw, quests_raw, steps_raw = load("QuestCategory"), load("Quests"), load("QuestSteps")
    qrew_raw, qobj_raw = load("QuestStepRewards"), load("QuestObjectives")
    rew_by_step = {}
    for r in qrew_raw.values():
        rew_by_step.setdefault(r["stepId"], []).extend(r.get("itemsReward") or [])
    quests = {}
    for k, q in quests_raw.items():
        if not q.get("nameId"):
            continue
        xp = kamas = 0.0
        rew_items, monsters_to_kill = {}, set()
        for sid in q.get("stepIds", []):
            st = steps_raw.get(str(sid), {})
            xp += st.get("xpRatio", 0) or 0
            kamas += st.get("kamasRatio", 0) or 0
            for it, n in rew_by_step.get(sid, []):
                rew_items[it] = rew_items.get(it, 0) + n
            for oid in st.get("objectiveIds", []):
                o = qobj_raw.get(str(oid), {})
                if o.get("typeId") in (6, 7, 14) and o.get("parameters"):
                    monsters_to_kill.add(o["parameters"][0])
        quests[k] = [q["nameId"], q.get("categoryId", 0), q.get("levelMin", 0), q.get("levelMax", 0),
                     (1 if q.get("isRepeatable") else 0) | (2 if q.get("isDungeonQuest") else 0) | (4 if q.get("isMain") else 0),
                     len(q.get("stepIds", [])), round(xp, 2), round(kamas, 2), [[int(i), n] for i, n in rew_items.items()],
                     sorted(monsters_to_kill)]
    qcats = {k: [c["nameId"], c.get("order", 0)] for k, c in qcat_raw.items()}
    ach_raw, acat_raw, arew_raw, aobj_raw = load("Achievements"), load("AchievementCategories"), load("AchievementRewards"), load("AchievementObjectives")
    arew = {}
    for r in arew_raw.values():
        if r.get("levelMin", -1) not in (-1, 0):
            continue
        a = arew.setdefault(r["achievementId"], [0, 0, []])
        a[0] = max(a[0], r.get("kamasRatio", 0) or 0)
        a[1] = max(a[1], r.get("experienceRatio", 0) or 0)
        for i, n in zip(r.get("itemsReward") or [], r.get("itemsQuantityReward") or []):
            a[2].append([i, n])
    achievements = {}
    for k, a in ach_raw.items():
        if not a.get("nameId"):
            continue
        objs = [aobj_raw[str(o)]["nameId"] for o in a.get("objectiveIds", []) if str(o) in aobj_raw and aobj_raw[str(o)].get("nameId")]
        r = arew.get(a["id"], [0, 0, []])
        achievements[k] = [a["nameId"], a.get("categoryId", 0), strip(a.get("descriptionId")), a.get("points", 0), a.get("level", 0),
                           a.get("iconId", 0), objs, r[2], round(r[0], 2), round(r[1], 2)]
    acats = {k: [c["nameId"], c.get("parentId", 0), c.get("order", 0), c.get("icon", "")] for k, c in acat_raw.items()}
    challenges = {k: [c.get("nameId", ""), strip(c.get("descriptionId"))] for k, c in load("Challenge").items() if c.get("nameId")}
    save("quests.json", {"quests": quests, "qcats": qcats, "achievements": achievements, "acats": acats, "challenges": challenges})

    # ---------- Almanax ----------
    # Méryde (PNJ) -> offrande : quête « Offrande à … » (catégorie Almanax) dont un objectif va voir ce PNJ
    offer_by_npc = {}
    for q in quests_raw.values():
        if q.get("categoryId") != 31:
            continue
        for sid in q.get("stepIds", []):
            st = steps_raw.get(str(sid), {})
            npc = item = qty = None
            for oid in st.get("objectiveIds", []):
                o = qobj_raw.get(str(oid), {})
                if o.get("typeId") == 1 and o.get("parameters"):
                    npc = o["parameters"][0]
                if o.get("typeId") == 3 and len(o.get("parameters", [])) >= 3:
                    item, qty = o["parameters"][1], o["parameters"][2]
            if npc and item:
                offer_by_npc[npc] = [item, qty, q["nameId"], round(st.get("xpRatio", 0) or 0, 2), round(st.get("kamasRatio", 0) or 0, 2),
                                     st.get("optimalLevel", 0), st.get("duration", 0)]
    alm = {}
    for k, a in load("AlmanaxCalendars").items():
        npc = a.get("npcId")
        o = offer_by_npc.get(npc, [0, 0, "", 0, 0, 0, 0])
        alm[k] = [a.get("nameId", ""), strip(a.get("descId")), npcs.get(str(npc), {}).get("nameId", ""), *o]
    # Correspondance date -> entrée : relevée en jeu (19/11/2026 = entrée 66) et recoupée avec le calendrier de Dofus PC ;
    # l'entrée n suit le jour n - 1 après le 15 septembre. Corrigeable dans l'appli si besoin.
    save("almanax.json", {"days": alm, "ref": ["2026-11-19", 66], "cycle": 365})

    # ---------- Divers ----------
    pets = {k: [p.get("foodItems", []), p.get("foodTypes", [])] for k, p in load("Pets").items()}
    mounts = {k: [m.get("nameId", "")] for k, m in load("Mounts").items()}
    titles = {k: t.get("nameMaleId", "") for k, t in load("Titles").items() if t.get("visible")}
    companions = {k: [c.get("nameId", ""), c.get("unlockCriterion", "")] for k, c in load("Companions").items()}
    bh = {k: [b.get("description", ""), b.get("allowedTypes", [])] for k, b in load("BidHouseCategories").items()}
    save("misc.json", {"pets": pets, "mounts": mounts, "titles": titles, "companions": companions, "bidhouses": bh})
    save("desc.json", desc)
    core["effects"] = effects
    save("core.json", core)


if __name__ == "__main__":
    main()
