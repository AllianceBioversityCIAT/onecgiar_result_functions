#!/usr/bin/env bash
set -euo pipefail
SRCDIR="$1"; OUTZIP="$2"
pushd "$SRCDIR" >/dev/null
# Install all dependencies first (including devDependencies needed for build)
npm ci || npm i
# Build the project
npm run build
# Clean up node_modules and reinstall only production dependencies
rm -rf node_modules
npm ci --omit=dev --omit=optional || npm i --omit=dev --omit=optional
# package only what is necessary
cd dist
zip -q -r "../../$OUTZIP" . ../node_modules
popd >/dev/null
echo "ZIP ready: $OUTZIP"
