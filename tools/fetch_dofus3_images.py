#!/usr/bin/env python3
"""Images du client Dofus 3 (Unity) pour le simulateur de build, extraites par dofusdude
(https://github.com/dofusdude/dofus3-main/releases) : icônes des sorts et têtes des classes.

Usage : python3 tools/fetch_dofus3_images.py   (après tools/fetch_dofusdb_builds.py)

Écrit data/spells/<icône>.webp (48 px, icônes des sorts de data/build.json)
  et data/breeds/head_<classe><0 homme | 1 femme>.webp (64 px).
"""
import io, json, tarfile, urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://github.com/dofusdude/dofus3-main/releases/latest/download/"


def members(name):
    data = urllib.request.urlopen(BASE + name, timeout=600).read()
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tf:
        for m in tf:
            if m.isfile():
                yield m.name.rsplit("/", 1)[-1], tf.extractfile(m).read()


def main():
    build = json.load(open(ROOT / "data" / "build.json", encoding="utf-8"))
    icons = {sp[1] for sp in build["spells"].values()}
    (ROOT / "data" / "spells").mkdir(parents=True, exist_ok=True)
    n = 0
    for fn, raw in members("spell_images_96.tar.gz"):
        ic = fn.removeprefix("sort_").split("-")[0]
        if ic.isdigit() and int(ic) in icons:
            im = Image.open(io.BytesIO(raw)).convert("RGBA")
            im.thumbnail((48, 48), Image.LANCZOS)
            im.save(ROOT / "data" / "spells" / f"{ic}.webp", "WEBP", quality=85, method=6)
            n += 1
    (ROOT / "data" / "breeds").mkdir(parents=True, exist_ok=True)
    h = 0
    for fn, raw in members("class_head_images_64.tar.gz"):
        key = fn.removeprefix("Head_").split("-")[0]
        if key.isdigit():
            Image.open(io.BytesIO(raw)).convert("RGBA").save(ROOT / "data" / "breeds" / f"head_{key}.webp", "WEBP", quality=90, method=6)
            h += 1
    print(n, "icônes de sorts sur", len(icons), "·", h, "têtes de classe")


if __name__ == "__main__":
    main()
