#!/usr/bin/env bash
# Recreate every marketing screenshot from scratch, end to end:
# stack up → demo data seeded → token minted → light-mode captures → WebP.
#
# Writes public/marketing/home/*.webp (homepage product tour) and
# public/marketing/products/*.webp (/products/* hero plates). The PNG
# intermediates are gitignored; only the WebP is imported by a page.
#
# Usage (from frontend/):
#   ./e2e/tools/recreate-marketing-shots.sh
#
# Prereqs: Docker running; frontend dev server on :3000 (npm run dev) or
# PLAYWRIGHT_BASE_URL pointing elsewhere.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
FRONTEND_DIR="$REPO_ROOT/frontend"

echo "==> Ensuring the docker-compose stack is up"
if ! curl -sf -m 3 http://localhost:8000/api/v1/health >/dev/null 2>&1; then
  (cd "$REPO_ROOT" && docker-compose up -d)
  echo "==> Waiting for the backend to become healthy"
  for _ in $(seq 1 30); do
    curl -sf -m 3 http://localhost:8000/api/v1/health >/dev/null 2>&1 && break
    sleep 5
  done
  curl -sf -m 3 http://localhost:8000/api/v1/health >/dev/null \
    || { echo "backend never became healthy" >&2; exit 1; }
fi

echo "==> Ensuring the frontend is reachable"
BASE_URL="${PLAYWRIGHT_BASE_URL:-http://localhost:3000}"
curl -sf -m 5 "$BASE_URL" >/dev/null \
  || { echo "frontend not reachable at $BASE_URL — start it with 'npm run dev'" >&2; exit 1; }

echo "==> Seeding marketing demo data (idempotent)"
# --yes is required: the seeder refuses to write without it, because it also
# creates *enabled* automations and must never be pointed at a real database
# by accident. It prints the target workspace before doing anything.
docker exec aexy-backend python scripts/seed_marketing_demo.py --yes

echo "==> Minting a test token"
TOKEN="$(docker exec aexy-backend python scripts/generate_test_token.py --first \
  | sed -n 's/.*export AEXY_TEST_TOKEN="\([^"]*\)".*/\1/p' | head -1)"
[ -n "$TOKEN" ] || { echo "could not extract token" >&2; exit 1; }

echo "==> Capturing screenshots"
cd "$FRONTEND_DIR"
AEXY_TEST_TOKEN="$TOKEN" npx tsx e2e/tools/capture-marketing-shots.ts

# The capture writes PNGs; the pages import WebP. Without this step the script
# looked like it succeeded while changing nothing a page actually loads (the
# PNGs are gitignored).
echo "==> Converting to WebP"
for dir in home products; do
  out="public/marketing/$dir"
  # nullglob so an empty directory is skipped rather than passing a literal glob
  shopt -s nullglob
  pngs=("$out"/*.png)
  shopt -u nullglob
  [ ${#pngs[@]} -gt 0 ] || continue
  npx sharp-cli --input "${pngs[@]}" --output "$out" --format webp -q 75 >/dev/null
  rm -f "${pngs[@]}"
  echo "    $out: ${#pngs[@]} shot(s)"
done

echo "==> Done. WebP in public/marketing/{home,products}/"
