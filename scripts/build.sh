#!/usr/bin/env bash
# Assemble le site dans dist/ : les pages de web/ + l'émulateur v86 + l'image Linux.
# Lancé par GitHub Actions au moment de la publication (le réseau y est ouvert).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

rm -rf "$DIST"
mkdir -p "$DIST/build" "$DIST/bios" "$DIST/images"

# 1. Les pages du projet
cp -r "$ROOT"/web/. "$DIST"/

# 2. L'émulateur v86 (paquet npm)
echo "==> Installation du paquet npm v86"
(cd "$WORK" && npm init -y >/dev/null && npm install v86 >/dev/null)
PKG="$WORK/node_modules/v86"

echo "==> Contenu du paquet :"
ls -la "$PKG" "$PKG/build" "$PKG/bios" 2>/dev/null || true

copy_required() {
  local src="$1" dst="$2"
  if [ ! -f "$src" ]; then
    echo "ERREUR : fichier introuvable dans le paquet v86 : $src" >&2
    exit 1
  fi
  cp "$src" "$dst"
}

copy_required "$PKG/build/v86.wasm"   "$DIST/build/v86.wasm"
copy_required "$PKG/bios/seabios.bin" "$DIST/bios/seabios.bin"
copy_required "$PKG/bios/vgabios.bin" "$DIST/bios/vgabios.bin"

# libv86.js : dans le paquet si présent, sinon depuis la dernière release GitHub
if [ -f "$PKG/build/libv86.js" ]; then
  cp "$PKG/build/libv86.js" "$DIST/build/libv86.js"
else
  echo "==> libv86.js absent du paquet, téléchargement depuis la release GitHub"
  curl -fsSL -o "$DIST/build/libv86.js" \
    "https://github.com/copy/v86/releases/download/latest/libv86.js"
fi

# 3. L'image Linux (Buildroot, hébergée par l'auteur de v86)
echo "==> Téléchargement de l'image Linux"
curl -fsSL -o "$DIST/images/buildroot-bzimage68.bin" \
  "https://i.copy.sh/buildroot-bzimage68.bin"

# GitHub Pages : ne pas passer par Jekyll
touch "$DIST/.nojekyll"

echo "==> Site prêt dans $DIST"
du -sh "$DIST"/*
