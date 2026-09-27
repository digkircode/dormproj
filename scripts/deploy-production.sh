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

# The bot is optional. Its secrets live outside the repository and are added to
# the backend only when the complete server-side file has been provisioned.
TELEGRAM_ENV_FILE="$DEPLOY_ROOT/.secrets/telegram.env"
if [ -f "$TELEGRAM_ENV_FILE" ]; then
  for key in TELEGRAM_BOT_TOKEN TELEGRAM_BOT_USERNAME TELEGRAM_WEBHOOK_SECRET; do
    grep -qE "^${key}=.+$" "$TELEGRAM_ENV_FILE" || { echo "Incomplete Telegram configuration: $key" >&2; exit 1; }
  done
  export TELEGRAM_ENV_FILE
  compose+=(-f "$DEPLOY_ROOT/.releases/$RELEASE_SHA/docker-compose.telegram.yml")
fi

# Download sequentially while the current application continues serving requests.
"${compose[@]}" pull backend
"${compose[@]}" pull frontend
# Apply idempotent Prisma migrations with the new backend image before switching traffic.
"${compose[@]}" run --rm --no-deps -T backend ./node_modules/.bin/prisma migrate deploy
# No compilation or database recreation on the production server.
previous_backend_container=$("${compose[@]}" ps -q backend)
previous_backend_image=''
if [ -n "$previous_backend_container" ]; then
  previous_backend_image=$(docker inspect --format '{{.Config.Image}}' "$previous_backend_container")
fi
if ! "${compose[@]}" up -d --no-build --pull never --no-deps --wait --wait-timeout 180 backend; then
  if [ -n "$previous_backend_image" ]; then
    BACKEND_IMAGE="$previous_backend_image" "${compose[@]}" up -d --no-build --pull never --no-deps --wait --wait-timeout 180 backend || true
  fi
  exit 1
fi
"${compose[@]}" up -d --no-build --pull never --no-deps --wait --wait-timeout 90 frontend
"${compose[@]}" ps
