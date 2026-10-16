#!/bin/zsh
# Publie une nouvelle version du jeu : régénère les étapes, incrémente le numéro de version
# (ce qui force les téléphones à recharger la page), puis envoie sur GitHub Pages.
cd "$(dirname "$0")"
v=$(( $(python3 -c "import json;print(json.load(open('version.json'))['v'])") + 1 ))
python3 generer-etapes.py || exit 1
sed -i '' -E "s/\?v=[0-9]+/?v=$v/g" index.html sw.js
sed -i '' -E "s/(<meta name=\"version\" content=\")[0-9]+/\1$v/" index.html
sed -i '' -E "s/quete-cap-homard-v[0-9]+'/quete-cap-homard-v$v'/" sw.js
echo "{\"v\": $v}" > version.json
git add -A && git -c user.name="Romain Capdepont" -c user.email="capdepontromain@gmail.com" commit -q -m "${1:-Mise à jour} (v$v)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push -q && echo "Publié v$v"
