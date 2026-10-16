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
for e in src["etapes"]:
    e = dict(e)
    e["empreintes"] = [hashlib.sha256(norm(r).encode()).hexdigest() for r in e.pop("reponses")]
    etapes.append(e)

out = "// Fichier généré par generer-etapes.py : ne pas modifier à la main.\n"
out += "window.CONFIG = " + json.dumps(src.get("config", {}), ensure_ascii=False, indent=2) + ";\n"
out += "window.ETAPES = " + json.dumps(etapes, ensure_ascii=False, indent=2) + ";\n"
(ici / "etapes.js").write_text(out, encoding="utf-8")
print(f"etapes.js généré : {len(etapes)} étapes.")
