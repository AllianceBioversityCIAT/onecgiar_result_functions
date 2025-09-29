#!/usr/bin/env bash
set -euo pipefail
FN="$1"      # AWS function name (e.g., result-management-normalizer)
ZIP="$2"     # path to the zip file
ALIAS="$3"   # dev | prod
REGION="${AWS_REGION:-us-east-1}"

aws lambda update-function-code \
    --function-name "$FN" \
    --zip-file "fileb://$ZIP" \
    --publish \
    --region "$REGION" > /tmp/upd.json

NEWV=$(jq -r '.Version' /tmp/upd.json)
if ! aws lambda get-alias --function-name "$FN" --name "$ALIAS" --region "$REGION" >/dev/null 2>&1; then
    aws lambda create-alias --function-name "$FN" --name "$ALIAS" --function-version "$NEWV" --region "$REGION" >/dev/null
else
    OLDV=$(aws lambda get-alias --function-name "$FN" --name "$ALIAS" --region "$REGION" | jq -r '.FunctionVersion')
    aws lambda update-alias --function-name "$FN" --name "$ALIAS" --function-version "$NEWV" --region "$REGION" >/dev/null
    echo "Rollback: aws lambda update-alias --function-name $FN --name $ALIAS --function-version $OLDV"
fi
echo "OK $FN@$ALIAS -> v$NEWV"
