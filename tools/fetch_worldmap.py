#!/usr/bin/env python3
"""Images des cartes du jeu (tuiles de 250 px), reprises de DofusDB et converties en WebP.

Usage : python3 tools/fetch_worldmap.py        (après tools/fetch_map.py, qui liste les cartes dans data/map.json)

Écrit data/worldmap/<id carte>/<échelle>/<n>.webp pour les échelles de chaque carte (Monde des Douze : 0.2, 0.4, 0.6 ;
autres : 0.25, 0.5). Tuile n (à partir de 1) d'une échelle s : colonne (n − 1) % ⌈largeur × s / 250⌉,
ligne (n − 1) // ce nombre. Les tuiles déjà présentes ne sont pas retéléchargées.
"""
import io, json, math, time, urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "AtelierDofus/1.0 (outil privé d'un groupe d'amis)"}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()


def label(s):
    return ("%g" % s)  # 0.2 -> "0.2", 1.0 -> "1"


def main():
    worlds = json.load(open(ROOT / "data" / "map.json", encoding="utf-8"))["worlds"]
    total = 0
    for w in worlds:
        for s in w["scales"]:
            cols, rows = math.ceil(w["totalWidth"] * s / 250), math.ceil(w["totalHeight"] * s / 250)
            out = ROOT / "data" / "worldmap" / str(w["id"]) / label(s)
            out.mkdir(parents=True, exist_ok=True)
            for n in range(1, cols * rows + 1):
                f = out / f"{n}.webp"
                if f.exists():
                    continue
                try:
                    im = Image.open(io.BytesIO(get(f"https://api.dofusdb.fr/img/worlds/{w['id']}/{label(s)}/{n}.jpg"))).convert("RGB")
                    im.save(f, "WEBP", quality=62, method=5)
                    total += f.stat().st_size
                except Exception as e:
                    print("tuile manquante", w["id"], s, n, e)
                time.sleep(0.08)
        print(w["id"], w["name"], "ok")
    print("nouvelles tuiles :", round(total / 1e6, 1), "Mo")


if __name__ == "__main__":
    main()
