#!/usr/bin/env bash
set -euo pipefail
SRCDIR="${1:-.}"         # raíz del proyecto (donde está package.json)
OUTZIP="${2:-normalizer.zip}"

ROOTDIR="$(pwd -P)"
pushd "$SRCDIR" >/dev/null

# 1) Instala dependencias (incluyendo dev si las hay, por si tienes scripts auxiliares)
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

# 2) (Opcional) si existe script "build", ejecútalo (no es obligatorio)
if npm run -s | grep -q "^  build$"; then
  npm run build
fi

# 3) Reinstala solo prod deps
rm -rf node_modules
if [ -f package-lock.json ]; then
  npm ci --omit=dev --omit=optional
else
  npm install --omit=dev --omit=optional
fi

ZIP_TARGET="$ROOTDIR/$OUTZIP"
mkdir -p "$(dirname "$ZIP_TARGET")"
echo "Packaging into $ZIP_TARGET"

# 4) Selecciona carpeta a empacar:
#    - si existe ./dist y contiene handler, empaquetar dist/ (modo build)
#    - si no, empaquetar src/ (modo JS puro)
PAYLOAD_DIR="src"
if [ -d "dist" ] && [ -f "dist/handlers/injest.mjs" ]; then
  PAYLOAD_DIR="dist"
fi

# 5) Empaquetar payload + node_modules + package.json
TMPDIR="$(mktemp -d)"
mkdir -p "$TMPDIR/$PAYLOAD_DIR" "$TMPDIR/node_modules"
cp -R "$PAYLOAD_DIR"/. "$TMPDIR/$PAYLOAD_DIR/"
cp -R node_modules "$TMPDIR/"
cp package.json "$TMPDIR/"

pushd "$TMPDIR" >/dev/null
zip -q -r "$ZIP_TARGET" .
popd >/dev/null

rm -rf "$TMPDIR"
popd >/dev/null
echo "ZIP ready: $OUTZIP"