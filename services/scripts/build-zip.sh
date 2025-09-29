#!/usr/bin/env bash
set -euo pipefail
SRCDIR="$1"; OUTZIP="$2"
pushd "$SRCDIR" >/dev/null
npm ci --omit=dev || npm i --omit=dev
npm run build
# package only what is necessary
cd dist
zip -q -r "../../$OUTZIP" .
popd >/dev/null
echo "ZIP ready: $OUTZIP"
