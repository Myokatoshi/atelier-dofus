#!/usr/bin/env python3
"""Télécharge les données du jeu Dofus Touch depuis le serveur officiel d'Ankama (celui qu'utilise le client du jeu).

Usage : python3 tools/fetch_data.py [--force]

- config.json donne l'adresse des données (dataUrl) et des images (assetsUrl) de la version en cours ;
- chaque table du jeu s'obtient par POST <dataUrl>/data/map?lang=fr {"class": "<Table>"} (toute la table d'un coup) ;
- les fichiers bruts sont rangés dans .cache/raw/<Table>.json (non publiés), puis tools/build_data.py prépare data/.
Une cinquantaine d'appels, espacés d'une seconde : à relancer après une mise à jour du jeu.
"""
import json, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / ".cache" / "raw"
SERVER = "https://dt-proxy-production-login.ankama-games.com"
UA = {"User-Agent": "AtelierTouch/1.0 (outil de fans, quelques appels par mise à jour du jeu)"}
TABLES = """Jobs Items ItemSets ItemTypes Recipes Skills Monsters MonsterRaces MonsterSuperRaces MonsterMiniBoss SubAreas Areas
SuperAreas Dungeons Effects Breeds Spells SpellLevels SpellTypes SpellStates Achievements AchievementCategories AchievementObjectives
AchievementRewards Quests QuestCategory QuestSteps QuestStepRewards QuestObjectives QuestObjectiveTypes AlmanaxCalendars Npcs Hints
HintCategory WorldMaps Pets Mounts RideFood Incarnation IncarnationLevels Companions Titles Ornaments BidHouseCategories Months
UniqueDrops Interactives Challenge Heads AlignmentSides SubAreasWorldMapData MapPositions""".split()


def main():
    force = "--force" in sys.argv
    RAW.mkdir(parents=True, exist_ok=True)
    cfg = json.load(urllib.request.urlopen(urllib.request.Request(SERVER + "/config.json?lang=fr", headers=UA), timeout=60))
    (RAW.parent / "config.json").write_text(json.dumps(cfg, ensure_ascii=False))
    data_url = cfg.get("dataUrl") or SERVER
    for t in TABLES:
        out = RAW / f"{t}.json"
        if out.exists() and not force:
            continue
        req = urllib.request.Request(data_url + "/data/map?lang=fr", data=json.dumps({"class": t}).encode(),
                                     headers={**UA, "Content-Type": "application/json", "Accept": "application/json"})
        body = urllib.request.urlopen(req, timeout=300).read()
        json.loads(body)  # vérifie que la réponse est bien du JSON
        out.write_bytes(body)
        print(t, len(body))
        time.sleep(1)


if __name__ == "__main__":
    main()
