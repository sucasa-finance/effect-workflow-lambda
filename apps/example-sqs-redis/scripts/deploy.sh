#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$APP_DIR/.build"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"

ESBUILD="$(find "$REPO_ROOT/node_modules/.pnpm" -path '*@esbuild*darwin-arm64*/bin/esbuild' -o -path '*@esbuild*linux-x64*/bin/esbuild' 2>/dev/null | head -1)"
if [ -z "$ESBUILD" ]; then
  ESBUILD="$(command -v esbuild 2>/dev/null || true)"
fi
if [ -z "$ESBUILD" ]; then
  echo "esbuild not found" >&2; exit 1
fi

echo "==> Bundling Lambda handlers"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/sqs" "$BUILD_DIR/http"

"$ESBUILD" "$APP_DIR/src/platform/lambda/sqs.lambda.ts" \
  --bundle --platform=node --format=cjs \
  --outfile="$BUILD_DIR/sqs/sqs.js"

"$ESBUILD" "$APP_DIR/src/platform/lambda/http.lambda.ts" \
  --bundle --platform=node --format=cjs \
  --outfile="$BUILD_DIR/http/http.js"

echo "==> Starting infrastructure"
docker compose -f "$APP_DIR/docker-compose.yml" up -d --wait

echo "==> Deploying with Pulumi"
cd "$APP_DIR/infra"
PULUMI_CONFIG_PASSPHRASE='' pulumi up --yes --stack local
