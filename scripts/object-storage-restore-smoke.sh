#!/usr/bin/env bash
set -Eeuo pipefail

: "${S3_ENDPOINT:?S3_ENDPOINT is required}"
: "${S3_BUCKET:?S3_BUCKET is required}"
: "${RESTORE_BUCKET:?RESTORE_BUCKET is required}"
: "${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID is required}"
: "${S3_SECRET_ACCESS_KEY:?S3_SECRET_ACCESS_KEY is required}"

WORK_DIR="${WORK_DIR:-./data/backups/object-storage-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$WORK_DIR"

# Requires the AWS CLI. The source and restore buckets must be private and in an isolated restore account.
aws --endpoint-url "$S3_ENDPOINT" s3api get-bucket-versioning --bucket "$S3_BUCKET" > "$WORK_DIR/source-versioning.json"
aws --endpoint-url "$S3_ENDPOINT" s3api get-public-access-block --bucket "$S3_BUCKET" > "$WORK_DIR/source-public-access.json"
aws --endpoint-url "$S3_ENDPOINT" s3api list-objects-v2 --bucket "$S3_BUCKET" --max-items "${SAMPLE_SIZE:-25}" > "$WORK_DIR/source-sample.json"

test "$(jq -r '.PublicAccessBlockConfiguration.BlockPublicAcls // false' "$WORK_DIR/source-public-access.json")" = "true"
test "$(jq -r '.PublicAccessBlockConfiguration.BlockPublicPolicy // false' "$WORK_DIR/source-public-access.json")" = "true"

jq -r '.Contents[]?.Key' "$WORK_DIR/source-sample.json" | while read -r key; do
  test -n "$key"
  case "$key" in
    tenant/*/*) ;;
    *) echo "invalid_tenant_prefix:$key" >&2; exit 1 ;;
  esac
done

aws --endpoint-url "$S3_ENDPOINT" s3api head-bucket --bucket "$RESTORE_BUCKET"
printf 'Object-storage restore prerequisites and sampled tenant-prefix checks passed at %s\n' "$WORK_DIR"
