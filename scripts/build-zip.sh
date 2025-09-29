#!/usr/bin/env bash
set -euo pipefail
SRCDIR="$1"; OUTZIP="$2"
ROOTDIR="$(pwd -P)"
pushd "$SRCDIR" >/dev/null
# Install all dependencies first (including devDependencies needed for build)
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
# Build the project
npm run build
# Clean up node_modules and reinstall only production dependencies
rm -rf node_modules
if [ -f package-lock.json ]; then
  npm ci --omit=dev --omit=optional
else
  npm install --omit=dev --omit=optional
fi
ZIP_TARGET="$ROOTDIR/$OUTZIP"
mkdir -p "$(dirname "$ZIP_TARGET")"
echo "Packaging artifacts into $ZIP_TARGET"
# package only what is necessary
cd dist
zip -q -r "$ZIP_TARGET" . ../node_modules
popd >/dev/null
echo "ZIP ready: $OUTZIP"