#!/usr/bin/env python3
"""Génère les données de l'Atelier Dofus 3 à partir des releases DofusDude.

Source : https://github.com/dofusdude/dofus3-main/releases (extraction automatique du client).

Usage :
    python3 tools/build_data.py            # télécharge la dernière release dans .cache/ puis génère data/
    python3 tools/build_data.py --offline  # réutilise .cache/
    python3 tools/build_data.py --offline --no-icons  # ne régénère pas les planches d'icônes

Sorties (dans data/) :
    core.json        objets (nom, niveau, type, icône, panoplie), recettes, types, métiers, panoplies, Almanax,
                     caractéristiques et bonus de panoplie
    det/NN.json      détails par objet (description, effets en texte, effets chiffrés), répartis par id % 32
    farm.json        drops des monstres, zones, donjons, ressources récoltables
    icons/NN.webp    planches d'icônes 48 px, 256 icônes par planche
"""
import io, json, re, sys, tarfile, urllib.request
from pathlib import Path

from PIL import Image  # pip install pillow

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
OUT = ROOT / "data"
BASE = "https://github.com/dofusdude/dofus3-main/releases/latest/download/"
FILES = ["items.json", "recipes.json", "jobs.json", "item_types.json", "item_super_types.json", "item_sets.json",
         "effects.json", "almanax.json", "quest_objectives.json", "fr.json", "items_images_64.tar.gz",
         "characteristics.json", "monsters.json", "subareas.json", "areas.json", "dungeons.json", "skills.json"]
ICON = 48
PER_SHEET = 256  # 16 x 16
CHUNKS = 32


def fetch():
    CACHE.mkdir(exist_ok=True)
    for f in FILES:
        dst = CACHE / f
        if "--offline" in sys.argv and dst.exists():
            continue
        print("téléchargement", f)
        urllib.request.urlretrieve(BASE + f, dst)


def refs(name):
    return json.load(open(CACHE / name, encoding="utf-8"))["references"]["RefIds"]


TAG = re.compile(r"<[^>]+>")
LINK = re.compile(r"\{\{[a-zA-Z]+,[^:}]*::([^}]*)\}\}")


def clean(s):
    return TAG.sub("", LINK.sub(r"\1", s or "")).strip()


def effect_text(tpl, a, b, c):
    t = tpl
    t = re.sub(r"\{\{~1~2([^}]*)\}\}", lambda m: m.group(1) if b and b != a else "", t)
    t = re.sub(r"\{\{~p([^}]*)\}\}", lambda m: m.group(1) if max(a, b) > 1 else "", t)
    t = re.sub(r"\{\{[^}]*\}\}", "", t)
    t = t.replace("#1", str(a)).replace("#2", str(b) if b and b != a else "").replace("#3", str(c))
    return clean(re.sub(r"\s+", " ", t))


def main():
    fetch()
    L = json.load(open(CACHE / "fr.json", encoding="utf-8"))["entries"]
    tr = lambda i: L.get(str(i), "")

    raw = refs("items.json")
    byrid = {x["rid"]: x["data"] for x in raw}
    items = [x["data"] for x in raw if x["type"]["class"] in ("ItemData", "WeaponData") and tr(x["data"]["nameId"])]
    E = {x["data"]["id"]: x["data"] for x in refs("effects.json")}

    recipes = {}
    for r in (x["data"] for x in refs("recipes.json")):
        ings = r["ingredientIds"]["Array"]
        if ings:
            recipes[r["resultId"]] = [r["jobId"], [[a, b] for a, b in zip(ings, r["quantities"]["Array"])]]

    # Icônes : une position par iconId présent dans l'archive
    # Lecture séquentielle : un accès aléatoire dans un .tar.gz redécompresse depuis le début à chaque fois
    wanted = {i["iconId"] for i in items}
    members = {}
    with tarfile.open(CACHE / "items_images_64.tar.gz", "r|gz") as tf:  # noqa: SIM117
        for m in tf:
            mm = re.search(r"/(\d+)-64\.png$", m.name)
            if mm and int(mm.group(1)) in wanted:
                members[int(mm.group(1))] = tf.extractfile(m).read()
    icon_ids = sorted({i["iconId"] for i in items if i["iconId"] in members})
    pos = {ic: n for n, ic in enumerate(icon_ids)}

    OUT.mkdir(exist_ok=True)
    (OUT / "icons").mkdir(exist_ok=True)
    (OUT / "det").mkdir(exist_ok=True)
    cols = int(PER_SHEET ** 0.5)
    for s in ([] if "--no-icons" in sys.argv else range(0, len(icon_ids), PER_SHEET)):
        sheet = Image.new("RGBA", (cols * ICON, cols * ICON), (0, 0, 0, 0))
        for n, ic in enumerate(icon_ids[s:s + PER_SHEET]):
            im = Image.open(io.BytesIO(members[ic])).convert("RGBA").resize((ICON, ICON), Image.LANCZOS)
            sheet.paste(im, ((n % cols) * ICON, (n // cols) * ICON))
        sheet.save(OUT / "icons" / f"{s // PER_SHEET:02d}.webp", "WEBP", quality=76, method=4)

    core_items, det = {}, [dict() for _ in range(CHUNKS)]
    for i in items:
        core_items[i["id"]] = [tr(i["nameId"]), i["level"], i["typeId"], pos.get(i["iconId"], -1), i.get("itemSetId", -1)]
        fx, st = [], []
        for e in i["possibleEffects"]["Array"]:
            ed = byrid.get(e["rid"])
            ef = ed and E.get(ed["actionId"])
            if not ef:
                continue
            txt = effect_text(tr(ef["descriptionId"]), ed["diceNum"], ed["diceSide"], ed["value"])
            if txt and "#" not in txt:
                fx.append(txt)
            # Effet chiffré [caractéristique, min, max] signé, pour additionner les stats d'un build
            if ef["characteristic"] > 0 and ef["bonusType"] in (1, -1):
                lo, hi = ed["diceNum"], max(ed["diceNum"], ed["diceSide"])
                st.append([ef["characteristic"], lo * ef["bonusType"], hi * ef["bonusType"]])
        d = {}
        desc = clean(tr(i["descriptionId"]))
        if desc:
            d["d"] = desc
        if fx:
            d["fx"] = fx
        if st:
            d["st"] = st
        if d:
            det[i["id"] % CHUNKS][i["id"]] = d
    for n, chunk in enumerate(det):
        json.dump(chunk, open(OUT / "det" / f"{n:02d}.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    recipes = {k: v for k, v in recipes.items() if k in core_items and all(a in core_items for a, _ in v[1])}
    supers = {x["data"]["id"]: tr(x["data"].get("nameId", 0)) for x in refs("item_super_types.json") if "id" in x["data"]}
    used_types = {v[2] for v in core_items.values()}
    types = {t["data"]["id"]: [tr(t["data"]["nameId"]), t["data"]["superTypeId"]] for t in refs("item_types.json") if t["data"]["id"] in used_types}
    jobs = {j["data"]["id"]: tr(j["data"]["nameId"]) for j in refs("jobs.json")}
    sets_raw = refs("item_sets.json")
    sets = {s["data"]["id"]: tr(s["data"]["nameId"]) for s in sets_raw if "nameId" in s["data"]}

    # Caractéristiques : modèle de texte (effet positif) + catégorie, pour afficher les totaux d'un build
    C = {x["data"]["id"]: x["data"] for x in refs("characteristics.json")}
    chars = {}
    for ef in sorted(E.values(), key=lambda e: e["id"]):
        c = ef["characteristic"]
        if c > 0 and ef["bonusType"] == 1 and c not in chars and tr(ef["descriptionId"]):
            cd = C.get(c, {})
            chars[c] = [tr(ef["descriptionId"]), ef["category"], cd.get("order", 999), tr(cd.get("nameId", 0))]
    # Bonus de panoplie : setfx[id][n] = [[caractéristique, valeur], ...] pour n pièces portées
    srid = {x["rid"]: x["data"] for x in sets_raw}
    setfx = {}
    for sd in (x["data"] for x in sets_raw if x["type"]["class"] == "ItemSetData"):
        tiers = []
        for tier in sd["effects"]["Array"]:
            vals = []
            for v in tier["values"]["Array"]:
                ed = srid.get(v["rid"]); ef = ed and E.get(ed["actionId"])
                if ef and ef["characteristic"] > 0 and ef["bonusType"] in (1, -1):
                    vals.append([ef["characteristic"], ed["diceNum"] * ef["bonusType"]])
            tiers.append(vals)
        if any(tiers):
            setfx[sd["id"]] = tiers

    qo = {x["data"]["id"]: x["data"] for x in refs("quest_objectives.json") if "id" in x["data"]}
    alm = []
    for a in (x["data"] for x in refs("almanax.json")):
        ds = a["dates"]["Array"]
        if len(ds) != 1 or not re.fullmatch(r"\d\d/\d\d/\*", ds[0]):
            continue
        o = qo.get(a["objectiveId"], {}).get("parameters", {})
        alm.append([ds[0][:5], o.get("parameter1", 0), o.get("parameter2", 0), clean(tr(a["nameId"])), clean(tr(a["descId"]))])
    alm.sort(key=lambda x: (x[0][3:], x[0][:2]))

    version = next((a for a in sys.argv if re.fullmatch(r"\d+(\.\d+)+", a)), None)
    if not version:
        try:  # la page releases/latest redirige vers le tag de la version
            version = urllib.request.urlopen(urllib.request.Request(BASE.replace("/download/", ""), method="HEAD")).geturl().rsplit("/", 1)[-1]
        except Exception:
            version = "3.x"
    core = {"v": version, "items": core_items, "recipes": recipes, "types": types, "supers": supers, "jobs": jobs,
            "sets": sets, "setfx": setfx, "chars": chars, "almanax": alm, "icons": {"size": ICON, "cols": cols, "per": PER_SHEET, "count": len(icon_ids)}}
    json.dump(core, open(OUT / "core.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    # ---- Farm : drops des monstres, zones, donjons, récolte ----
    subs_raw = [x["data"] for x in refs("subareas.json")]
    areas = {a["data"]["id"]: tr(a["data"]["nameId"]) for a in refs("areas.json")}
    dungeons = {}
    boss_dj = {}
    for dj in (x["data"] for x in refs("dungeons.json")):
        dungeons[dj["id"]] = [tr(dj["nameId"]), dj.get("optimalPlayerLevel", dj.get("minLevel", 0))]
        for b in dj["bosses"]["Array"]:
            boss_dj[b] = dj["id"]
    subs = {s_["id"]: [tr(s_["nameId"]), s_["areaId"], s_["level"], s_["dungeonId"]] for s_ in subs_raw if tr(s_["nameId"])}
    mons, drops = {}, {}
    for m in (x["data"] for x in refs("monsters.json")):
        name = tr(m["nameId"])
        ok = [d_ for d_ in m["drops"]["Array"] if not d_.get("hasCriterions") and d_["objectId"] in core_items]
        if not name or not ok:
            continue
        lv = [g["level"] for g in m["grades"]["Array"]] or [0]
        sa = [x for x in m["subareas"]["Array"] if x in subs]
        mons[m["id"]] = [name, min(lv), max(lv), sa, boss_dj.get(m["id"], 0)]
        for d_ in ok:
            pc = [d_["percentDropForGrade%d" % g] for g in range(1, 6)]
            drops.setdefault(d_["objectId"], []).append([m["id"], round(min(pc), 3), round(max(pc), 3)])
    for k_ in drops:
        drops[k_].sort(key=lambda x: -x[2])
    harvest = {}
    for sk in (x["data"] for x in refs("skills.json")):
        it_ = sk.get("gatheredRessourceItem", -1)
        if it_ in core_items and it_ not in harvest:
            harvest[it_] = [sk["parentJobId"], sk["levelMin"], []]
    for s_ in subs_raw:
        for it_ in s_["harvestables"]["Array"]:
            if it_ in harvest and s_["id"] in subs:
                harvest[it_][2].append(s_["id"])
    farm = {"mons": mons, "drops": drops, "subs": subs, "areas": areas, "dungeons": dungeons, "harvest": harvest}
    json.dump(farm, open(OUT / "farm.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"farm : {len(mons)} monstres, {len(drops)} objets droppables, {len(harvest)} ressources récoltables, {len(subs)} zones, {len(dungeons)} donjons")
    print(f"{len(core_items)} objets, {len(recipes)} recettes, {len(alm)} jours d'Almanax, {len(icon_ids)} icônes, version {version}")


if __name__ == "__main__":
    main()
