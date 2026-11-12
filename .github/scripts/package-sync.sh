#!/usr/bin/env bash
# Packages the SAM build of the Sync stack and publishes the packaged template for the Jenkins CD job.
#   1. `sam package`: uploads the function code of .sam-build/template.yaml to the SAM managed bucket the legacy job
#      already uses (under SAM_PREFIX/code) and writes packaged-template.yaml, whose CodeUri values point at those
#      objects (key = MD5 of the zip).
#   2. Uploads packaged-template.yaml to SAM_PREFIX/gha-<run>-<attempt>/packaged-template.yaml with provenance metadata
#      (revision, source, run, unit), checked by Jenkins (stage "Verify Package").
#   3. Prints `digest=sha256:<hex>` of the packaged template to GITHUB_OUTPUT: the ARTIFACTS value of the hand-over.
# Inputs (environment): BUCKET, PREFIX, RUN_LABEL, REVISION, SOURCE, AWS_REGION and the step-scoped temporary credentials.
set -euo pipefail
: "${BUCKET:?}" "${PREFIX:?}" "${RUN_LABEL:?}" "${REVISION:?}" "${SOURCE:?}" "${AWS_REGION:?}" "${GITHUB_OUTPUT:?}"
[[ "$RUN_LABEL" =~ ^[0-9]+-[0-9]+$ ]] || { echo "::error::invalid run label"; exit 1; }
[[ "$REVISION" =~ ^[0-9a-f]{40}$ ]] || { echo "::error::invalid revision"; exit 1; }
[ -f .sam-build/template.yaml ] || { echo "::error::.sam-build/template.yaml not found (run sam build first)"; exit 1; }

sam package \
  --template-file .sam-build/template.yaml \
  --s3-bucket "$BUCKET" \
  --s3-prefix "${PREFIX}/code" \
  --region "$AWS_REGION" \
  --output-template-file packaged-template.yaml \
  --no-progressbar > /dev/null

grep -q "s3://${BUCKET}/${PREFIX}/code/" packaged-template.yaml \
  || { echo "::error::the packaged template does not reference the uploaded code (fail closed)"; exit 1; }

key="${PREFIX}/gha-${RUN_LABEL}/packaged-template.yaml"
aws s3api put-object \
  --bucket "$BUCKET" \
  --key "$key" \
  --body packaged-template.yaml \
  --content-type "text/yaml" \
  --metadata "revision=${REVISION},source=${SOURCE},run=${RUN_LABEL},unit=sync" \
  --region "$AWS_REGION" > /dev/null

digest="sha256:$(sha256sum packaged-template.yaml | cut -d' ' -f1)"
echo "digest=${digest}" >> "$GITHUB_OUTPUT"
echo "Packaged template published: ${key} (${digest})"
rm -f packaged-template.yaml
