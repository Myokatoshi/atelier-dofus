#!/usr/bin/env python3
"""Crée le compte d'un membre du groupe (e-mail confirmé + mot de passe provisoire).

Usage : python3 tools/add_member.py adresse@exemple.com [pseudo]
Fonctionne dans une session Claude de l'environnement « atelier-dofus » (jeton Supabase
injecté par le proxy). La clé d'administration est lue via l'API de gestion et n'est jamais affichée.
"""
import json, secrets, string, sys, urllib.request

REF = "jvzwoialynhvhwkccgba"
MGMT = "https://api.supabase.com/v1/projects/" + REF
PROJECT = "https://" + REF + ".supabase.co"


def call(url, method="GET", headers=None, body=None):
    req = urllib.request.Request(url, method=method, headers={"Content-Type": "application/json", **(headers or {})},
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def admin_key():
    _, keys = call(MGMT + "/api-keys?reveal=true", headers={"Authorization": "Bearer proxy-injected"})
    for k in keys:
        if k.get("type") == "secret" and k.get("api_key"):
            return k["api_key"]
    for k in keys:
        if k.get("name") == "service_role":
            return k["api_key"]
    raise SystemExit("Clé d'administration introuvable")


def password(n=12):
    alphabet = string.ascii_letters + string.digits
    while True:
        p = "".join(secrets.choice(alphabet) for _ in range(n))
        if any(c.isdigit() for c in p) and any(c.isupper() for c in p) and any(c.islower() for c in p):
            return p


def main():
    email = sys.argv[1].strip().lower()
    pseudo = sys.argv[2] if len(sys.argv) > 2 else None
    key = admin_key()
    h = {"apikey": key, "Authorization": "Bearer " + key}
    pw = password()
    status, res = call(PROJECT + "/auth/v1/admin/users", "POST", h, {"email": email, "password": pw, "email_confirm": True})
    if status >= 300:
        msg = (res or {}).get("msg") or (res or {}).get("message") or (res or {}).get("error_description") or res
        raise SystemExit(f"Échec ({status}) : {msg}")
    uid = res["id"]
    if pseudo:
        call(PROJECT + "/rest/v1/profiles", "POST", {**h, "Prefer": "resolution=merge-duplicates"}, {"id": uid, "pseudo": pseudo[:30]})
    print(json.dumps({"compte": email, "mot_de_passe_provisoire": pw, "id": uid}, ensure_ascii=False))


if __name__ == "__main__":
    main()
