#!/usr/bin/env bash
set -euo pipefail
: "${DEPLOY_ROOT:?}" "${RELEASE_SHA:?}" "${BACKEND_IMAGE:?}" "${FRONTEND_IMAGE:?}"
: "${GHCR_USER:?}" "${GHCR_TOKEN:?}"
cd "$DEPLOY_ROOT"
test -f .env
exec 9> .deploy.lock
flock -w 600 9

# Keep the short-lived workflow token out of the user's Docker configuration.
DOCKER_CONFIG=$(mktemp -d)
export DOCKER_CONFIG
trap 'rm -f "$DOCKER_CONFIG/config.json"; rmdir "$DOCKER_CONFIG"' EXIT
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
unset GHCR_TOKEN
compose=(docker compose --project-name dormproj --project-directory "$DEPLOY_ROOT"
  --env-file "$DEPLOY_ROOT/.env" -f "$DEPLOY_ROOT/.releases/$RELEASE_SHA/docker-compose.yml")

# Download sequentially while the current application continues serving requests.
"${compose[@]}" pull backend
"${compose[@]}" pull frontend
# No compilation or database recreation on the production server.
"${compose[@]}" up -d --no-build --pull never --no-deps --wait --wait-timeout 180 backend
"${compose[@]}" up -d --no-build --pull never --no-deps --wait --wait-timeout 90 frontend
"${compose[@]}" ps
