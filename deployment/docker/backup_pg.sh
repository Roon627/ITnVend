#!/usr/bin/env bash
# Simple backup helper that uses a temporary postgres container to run pg_dump
# Usage: ./backup_pg.sh <output-dir> (defaults to ./deployment/backups)
set -euo pipefail
OUT_DIR=${1:-$(dirname "$0")/../backups}
mkdir -p "$OUT_DIR"
TS=$(date -u +"%Y%m%dT%H%M%SZ")
OUT_FILE="$OUT_DIR/itnvend_pg_$TS.sql.gz"

# Read env or fallback values
PGUSER=${POSTGRES_USER:-itnvend}
PGPASSWORD=${POSTGRES_PASSWORD:-change-me}
PGDB=${POSTGRES_DB:-itnvend}

# Run a temporary container attached to the same docker network to perform pg_dump
# This assumes docker engine on host and the compose network named 'itnvend_network' exists.

docker run --rm \
  --network itnvend_network \
  -e PGPASSWORD="$PGPASSWORD" \
  postgres:15-alpine \
  sh -c "pg_dump -U $PGUSER -d $PGDB | gzip -c" > "$OUT_FILE"

echo "Backup saved to: $OUT_FILE"
