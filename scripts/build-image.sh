#!/usr/bin/env bash
# Construit l'image Linux (Alpine) au format 9p de v86, dans image-out/.
# Lancé par GitHub Actions (Docker y est disponible). Le résultat est mis en cache.
set -euxo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/image-out"
WORK="$(mktemp -d)"
trap 'docker rm -f vm-alpine-c >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

# Les outils de conversion viennent du dépôt v86, à la version du paquet npm utilisé
git clone --filter=blob:none --no-checkout https://github.com/copy/v86 "$WORK/v86"
git -C "$WORK/v86" checkout 315b2b0 || git -C "$WORK/v86" checkout master
V86="$WORK/v86"

rm -rf "$OUT"
mkdir -p "$OUT/alpine-rootfs-flat"

docker build "$ROOT/image" --platform linux/386 --rm --tag vm-alpine
docker rm -f vm-alpine-c >/dev/null 2>&1 || true
docker create --platform linux/386 -t -i --name vm-alpine-c vm-alpine
docker export vm-alpine-c -o "$WORK/rootfs.tar"
tar -f "$WORK/rootfs.tar" --delete ".dockerenv" || true

python3 "$V86/tools/fs2json.py" --zstd --out "$OUT/alpine-fs.json" "$WORK/rootfs.tar"
python3 "$V86/tools/copy-to-sha256.py" --zstd "$WORK/rootfs.tar" "$OUT/alpine-rootfs-flat"

du -sh "$WORK/rootfs.tar" "$OUT"/*
echo "fichiers : $(find "$OUT/alpine-rootfs-flat" -type f | wc -l)"
