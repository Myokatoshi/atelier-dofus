#!/usr/bin/env python3
"""Fichiers du rendu Dofus 3 des personnages (simulateur de build), pour d3-ts-renderer (vendor/d3r.js).

Chaîne complète (voir CLAUDE.md, « Rendu Dofus 3 ») :
  1. doduda (dofusdude) télécharge depuis le CDN d'Ankama les bundles du squelette joueur (bone 1),
     des skins et des données ;
  2. pydofus3 (PyDofus) les extrait (--process-reference pour les données, --skin-png pour les skins) ;
  3. le lien objet -> skin est retrouvé en comparant l'icône de chaque objet au rendu de chaque skin
     (le jeu ne le fournit pas : c'est le serveur qui l'envoie) -> itemskins.json (objet -> skin) ;
  4. ce script recopie dans data/d3/ ce qu'il faut à l'appli, en WebP et JSON compact.

Usage : python3 tools/build_d3looks.py <dossier extrait par pydofus3> <itemskins.json> [<squelettes de familiers extraits> <itempets.json>]

Écrit data/d3/Content/Data/{breeds,bodies,skinslotsrules}dataroot.json, data/d3/Content/Characters/Bones/1-static/,
data/d3/Content/Characters/Skins/<skin>/{skin.json,0.webp…} (corps de base, tête par défaut, skins des objets)
et data/d3/looks.json : {"items": {objet: skin}, "breeds": {classe: [[corps, tête, couleurs] homme, [...] femme]}}.
"""
import json, os, shutil, sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "d3"


def webp(src, dst, div=2):
    """Texture en WebP, deux (familiers : quatre) fois plus petite en largeur et hauteur (invisible au format de la poupée)."""
    im = Image.open(src); w, h = im.size
    if w > 256 or h > 256:
        im = im.resize((max(1, w // div), max(1, h // div)), Image.LANCZOS)
    im.save(dst, "WEBP", quality=82, method=4)


def compact(o, k=""):
    """Arrondit les nombres (positions au millième, coordonnées de texture à 5 décimales) : JSON 2 à 3 fois plus léger."""
    if isinstance(o, float):
        r = round(o, 5 if k == "uv" else 3)
        return int(r) if r == int(r) else r
    if isinstance(o, dict):
        return {kk: compact(v, "uv" if kk == "uv" or k == "uv" else kk) for kk, v in o.items()}
    if isinstance(o, list):
        return [compact(v, k) for v in o]
    return o


def dump(o, path):
    json.dump(compact(o), open(path, "w"), separators=(",", ":"))


def main():
    src = Path(sys.argv[1]) / "Dofus_Data" / "StreamingAssets" / "Content"
    item_skins = {int(k): int(v) for k, v in json.load(open(sys.argv[2])).items()}
    data = src / "Data"
    load = lambda n: json.load(open(data / (n + ".asset")))["objectsById"]
    (OUT / "Content" / "Data").mkdir(parents=True, exist_ok=True)
    for n in ["BreedsDataRoot", "BodiesDataRoot", "SkinSlotsRulesDataRoot"]:
        json.dump({"objectsById": load(n)}, open(OUT / "Content" / "Data" / (n.lower() + ".json"), "w"), separators=(",", ":"))
    breeds, bodies, heads = load("BreedsDataRoot"), load("BodiesDataRoot"), load("HeadsDataRoot")
    looks = {"items": {}, "breeds": {}}
    skins = set()
    for bid, b in breeds.items():
        per = []
        for g in (0, 1):
            body = next((int(v["skins"]) for v in bodies.values() if v["breed"] == int(bid) and v["gender"] == g and v["label"] == "base"), None)
            hs = sorted((v for v in heads.values() if v["breed"] == int(bid) and v["gender"] == g), key=lambda v: v["order"])
            head = int(hs[0]["skins"]) if hs else None
            cols = b["maleColors" if g == 0 else "femaleColors"]
            per.append([body, head, cols])
            skins.update(x for x in (body, head) if x)
        looks["breeds"][bid] = per
    for it, sk in item_skins.items():
        looks["items"][str(it)] = sk
        skins.add(sk)
    # Squelette du personnage joueur (pose statique)
    shutil.copytree(src / "Characters" / "Bones" / "1-static", OUT / "Content" / "Characters" / "Bones" / "1-static", dirs_exist_ok=True)
    bdir = OUT / "Content" / "Characters" / "Bones" / "1-static"
    for f in list(bdir.iterdir()):
        if f.suffix == ".png":
            webp(f, f.with_suffix(".webp")); f.unlink()
        elif f.suffix == ".json":
            dump(json.load(open(f)), f)
    missing = 0
    for sk in sorted(skins):
        s, d = src / "Characters" / "Skins" / str(sk), OUT / "Content" / "Characters" / "Skins" / str(sk)
        if not (s / "skin.json").exists():
            missing += 1
            continue
        if (d / "skin.json").exists() and not any(d.glob("*.png")) and len(list(d.glob("*.webp"))) >= len(list(s.glob("*.png"))):
            continue  # déjà converti (relance)
        d.mkdir(parents=True, exist_ok=True)
        dump(json.load(open(s / "skin.json")), d / "skin.json")
        for f in s.glob("*.png"):
            webp(f, d / (f.stem + ".webp"))
    # skins qui ne servent plus
    keep = {str(x) for x in skins}
    for d in (OUT / "Content" / "Characters" / "Skins").iterdir():
        if d.name not in keep:
            shutil.rmtree(d)
    # Familiers et montiliers (et leurs apparats) : squelette propre, affiché à côté du personnage.
    # Le lien objet -> squelette n'est pas dans les fichiers du jeu (l'appearanceId ne pointe pas le bon squelette) :
    # il est retrouvé en comparant l'icône de l'objet à la vignette de chacun des ~8 600 squelettes (itempets.json).
    looks["pets"] = {}
    if len(sys.argv) > 4:
        pb = Path(sys.argv[3]) / "Dofus_Data" / "StreamingAssets" / "Content" / "Characters" / "Bones"
        for iid, bone in json.load(open(sys.argv[4])).items():
            a = str(bone); sb = pb / a
            if not (sb / "bone.json").exists():
                continue
            looks["pets"][iid] = int(a)
            db = OUT / "Content" / "Characters" / "Bones" / a
            if (db / "bone.json").exists():
                continue
            db.mkdir(parents=True, exist_ok=True)
            for f in sb.iterdir():
                if f.suffix == ".dat" and f.name.startswith(("AnimStatique", "AnimState0")):
                    shutil.copy(f, db / f.name)
                elif f.suffix == ".json":
                    dump(json.load(open(f)), db / f.name)
                elif f.suffix == ".png":
                    webp(f, db / (f.stem + ".webp"), 4)
    # Montiliers (et leurs apparats) : le personnage est monté dessus, assis (squelette cavalier « 9582 » ; « 2 » le met debout), sous-entité 2@0
    items = load("ItemsDataRoot")
    looks["ride"] = sorted(int(i) for i in looks["pets"] if items.get(i, {}).get("typeId") in (121, 250, 324))
    if len(sys.argv) > 4:
        rb = Path(sys.argv[3]) / "Dofus_Data" / "StreamingAssets" / "Content" / "Characters" / "Bones" / "9582"
        db = OUT / "Content" / "Characters" / "Bones" / "9582"
        if (rb / "bone.json").exists() and not (db / "bone.json").exists():
            db.mkdir(parents=True, exist_ok=True)
            for f in rb.iterdir():
                if f.suffix == ".dat":
                    shutil.copy(f, db / f.name)
                elif f.suffix == ".json":
                    dump(json.load(open(f)), db / f.name)
                elif f.suffix == ".png":
                    webp(f, db / (f.stem + ".webp"))
    json.dump(looks, open(OUT / "looks.json", "w"), separators=(",", ":"))
    size = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
    print(len(skins), "skins,", missing, "manquants,", len(looks["items"]), "objets,", len(looks["pets"]), "familiers/montures,", round(size / 1e6, 1), "Mo")


if __name__ == "__main__":
    main()
