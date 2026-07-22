#!/usr/bin/env bash
# Release the studio app: mirror studio/ to bedyukteam/- and deploy to Render.
# Usage:  bash studio/scripts/deploy-render.sh   (from the repo root, or anywhere)
set -euo pipefail
cd "$(dirname "$0")/../.."   # repo root

SERVICE_ID="srv-d8ogbvjsq97s73fkf7f0"

# Render API key from root .env
set -a; source .env; set +a
: "${RENDER_API_KEY:?RENDER_API_KEY missing from root .env}"

echo "→ mirroring studio/ to bedyukteam/- …"
SPLIT=$(git subtree split --prefix=studio podcast-studio | tail -1)
git push https://github.com/bedyukteam/-.git "$SPLIT:main" && echo "  ✓ mirrored ($SPLIT)"

echo "→ triggering Render deploy…"
DEPLOY=$(curl -s -X POST "https://api.render.com/v1/services/$SERVICE_ID/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" -d '{}')
DEPLOY_ID=$(printf '%s' "$DEPLOY" | sed -n 's/.*"id":"\(dep-[^"]*\)".*/\1/p')
echo "  deploy: ${DEPLOY_ID:-$DEPLOY}"

echo "→ waiting for deploy to go live…"
while true; do
  STATUS=$(curl -s "https://api.render.com/v1/services/$SERVICE_ID/deploys/$DEPLOY_ID" \
    -H "Authorization: Bearer $RENDER_API_KEY" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')
  echo "  $STATUS"
  case "$STATUS" in
    live) echo "✓ live"; break ;;
    build_failed|update_failed|canceled|deactivated) echo "✗ deploy failed: $STATUS"; exit 1 ;;
  esac
  sleep 20
done
