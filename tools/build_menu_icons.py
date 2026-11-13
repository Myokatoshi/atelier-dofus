#!/usr/bin/env python3
"""Planche d'icônes des menus (data/icons/menu.webp) : seulement les objets de GI (js/app.js),
pour ne pas charger une vingtaine de grandes planches d'icônes au démarrage.

Usage : python3 tools/build_menu_icons.py   (à relancer si GI change ou après tools/build_data.py)
"""
import json, re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
src = (ROOT / "js" / "app.js").read_text(encoding="utf-8")
gi = re.search(r"const GI = \{(.*?)\};", src, re.S).group(1)
ids = list(dict.fromkeys(int(x) for x in re.findall(r":\s*(\d+)", gi)))
core = json.load(open(ROOT / "data" / "core.json", encoding="utf-8"))
I = core["icons"]; size, cols, per = I["size"], I["cols"], I["per"]
out = Image.new("RGBA", (size * len(ids), size), (0, 0, 0, 0))
sheets = {}
for k, iid in enumerate(ids):
    p = core["items"][str(iid)][3]
    s = p // per; n = p % per
    if s not in sheets:
        sheets[s] = Image.open(ROOT / "data" / "icons" / ("%02d.webp" % s)).convert("RGBA")
    x, y = (n % cols) * size, (n // cols) * size
    out.paste(sheets[s].crop((x, y, x + size, y + size)), (k * size, 0))
out.save(ROOT / "data" / "icons" / "menu.webp", "WEBP", quality=90, method=6)
json.dump(ids, open(ROOT / "data" / "icons" / "menu.json", "w"))
print(len(ids), "icônes", (ROOT / "data" / "icons" / "menu.webp").stat().st_size, "octets")
