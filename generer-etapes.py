#!/usr/bin/env python3
"""Lit prive/reponses.json (réponses en clair, jamais en ligne) et génère etapes.js
avec les réponses brouillées (empreinte SHA-256). À relancer après chaque modification."""
import json, hashlib, unicodedata, re, pathlib
ici = pathlib.Path(__file__).parent
src = json.loads((ici / "prive" / "reponses.json").read_text(encoding="utf-8"))

def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]", "", s)

etapes = []
for i, e in enumerate(src["etapes"]):
    e = dict(e)
    e["id"] = i + 1  # numérotation automatique dans l'ordre du fichier
    if e.get("type") in ("photo", "libre"):
        e["empreintes"] = []
        e.pop("reponses", None)
    else:
        # Tolérance d'une lettre près (faute, lettre en trop ou en moins) : on retient aussi
        # chaque réponse privée d'une lettre ; l'appli fait pareil avec la saisie et compare.
        # (deux lettres près pour les réponses longues, 8 lettres et plus)
        cles = set()
        for r in e.pop("reponses"):
            n = norm(r)
            cles.add(n)
            if len(n) >= 5:
                for k in range(len(n)):
                    d1 = n[:k] + n[k + 1:]
                    cles.add(d1)
                    if len(n) >= 8:
                        for j in range(len(d1)):
                            cles.add(d1[:j] + d1[j + 1:])
        e["empreintes"] = sorted(hashlib.sha256(c.encode()).hexdigest()[:24] for c in cles)
    etapes.append(e)

out = "// Fichier généré par generer-etapes.py : ne pas modifier à la main.\n"
out += "window.CONFIG = " + json.dumps(src.get("config", {}), ensure_ascii=False, indent=2) + ";\n"
out += "window.ETAPES = " + json.dumps(etapes, ensure_ascii=False, indent=2) + ";\n"
(ici / "etapes.js").write_text(out, encoding="utf-8")
print(f"etapes.js généré : {len(etapes)} étapes.")
