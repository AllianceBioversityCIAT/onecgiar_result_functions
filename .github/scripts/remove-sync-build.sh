#!/usr/bin/env bash
# Removes every local copy of the Sync secret written for the build: services/sync/.env (write-sync-env.sh) and the SAM
# build directory .sam-build, whose function folders contain a copy of it. Runs as an `if: always()` step, so it also
# runs when a previous step failed. Never fails the job. The packaged copy in S3 is the one the legacy job also uploads.
set -uo pipefail
rm -f "services/sync/.env"
rm -rf ".sam-build"
echo "Sync .env and SAM build directory removed"
