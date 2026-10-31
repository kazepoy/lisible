#!/usr/bin/env bash
# Génère le projet Xcode (app conteneur macOS + iOS/iPadOS) autour de l'extension.
# À lancer sur un Mac avec Xcode installé.
#
#   ./scripts/creer-projet-xcode.sh [bundle-id]
#
# Le projet référence directement le dossier extension/ (pas de copie) :
# toute modification de l'extension est reprise au prochain build Xcode.
set -euo pipefail

cd "$(dirname "$0")/.."

BUNDLE_ID="${1:-com.example.lisible}"
OUT="xcode"

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun introuvable : ce script doit être lancé sur macOS avec Xcode." >&2
  exit 1
fi

xcrun safari-web-extension-converter extension \
  --project-location "$OUT" \
  --app-name "Lisible" \
  --bundle-identifier "$BUNDLE_ID" \
  --swift \
  --no-open \
  --no-prompt \
  --force

echo
echo "Projet généré dans $OUT/Lisible/Lisible.xcodeproj"
echo "Ouvrez-le, choisissez la cible (macOS ou iOS), puis Product > Run."
