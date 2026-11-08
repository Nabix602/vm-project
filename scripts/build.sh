#!/usr/bin/env bash
# Assemble le site dans dist/ : pages de web/ + émulateur v86 + BIOS + image Linux (image-out/).
# Lancé par GitHub Actions après build-image.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ ! -f "$ROOT/image-out/alpine-fs.json" ]; then
  echo "ERREUR : image-out/ absent, lance d'abord scripts/build-image.sh" >&2
  exit 1
fi

rm -rf "$DIST"
mkdir -p "$DIST/build" "$DIST/bios" "$DIST/images"

# 1. Les pages du projet
cp -r "$ROOT"/web/. "$DIST"/

# 2. L'émulateur v86 (paquet npm)
echo "==> Installation du paquet npm v86"
(cd "$WORK" && npm init -y >/dev/null && npm install v86 >/dev/null)
PKG="$WORK/node_modules/v86"
grep '"version"' "$PKG/package.json"

cp "$PKG/build/v86.wasm"    "$DIST/build/v86.wasm"
cp "$PKG/build/libv86.js"   "$DIST/build/libv86.js"
[ -f "$PKG/build/v86-fallback.wasm" ] && cp "$PKG/build/v86-fallback.wasm" "$DIST/build/v86-fallback.wasm"

# 3. Les BIOS ne sont pas dans le paquet npm : on les prend dans le dépôt de v86
echo "==> Téléchargement des BIOS"
for f in seabios.bin vgabios.bin; do
  curl -fsSL -o "$DIST/bios/$f" "https://raw.githubusercontent.com/copy/v86/master/bios/$f" \
    || curl -fsSL -o "$DIST/bios/$f" "https://copy.sh/v86/bios/$f"
done

# 4. L'image Linux
cp -r "$ROOT"/image-out/. "$DIST/images/"

# GitHub Pages : ne pas passer par Jekyll
touch "$DIST/.nojekyll"

echo "==> Site prêt dans $DIST"
du -sh "$DIST"/* | sort -h
echo "fichiers : $(find "$DIST" -type f | wc -l)"
