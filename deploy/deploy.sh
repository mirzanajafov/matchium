#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

compose=(docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app)
branch="${DEPLOY_BRANCH:-main}"
force=false
[ "${1:-}" = "--force" ] && force=true

say() { printf '\n== %s\n' "$1"; }

healthy() {
  say "Waiting for the API and web app"
  for _ in $(seq 1 60); do
    api=$(docker inspect -f '{{.State.Health.Status}}' matchium-api 2>/dev/null || true)
    if [ "$api" = healthy ] && "${compose[@]}" exec -T web node -e \
      "Promise.all([fetch('http://localhost:3101/reset-password'), fetch(process.env.API_URL + '/health')]).then((rs) => process.exit(rs.every((r) => r.ok) ? 0 : 1)).catch(() => process.exit(1))" 2>/dev/null; then
      return 0
    fi
    sleep 3
  done
  return 1
}

release() {
  "${compose[@]}" build && "${compose[@]}" run --rm migrate && "${compose[@]}" up -d --remove-orphans
}

previous=$(git rev-parse HEAD)
git fetch --quiet origin "$branch"
target=$(git rev-parse "origin/$branch")

if [ "$previous" = "$target" ] && [ "$force" = false ]; then
  echo "Already at $(git log --oneline -1). Use --force to rebuild anyway."
  exit 0
fi

say "Backing up before the deploy"
"${compose[@]}" run --rm backup once

say "Deploying $(git log --oneline -1 "$target")"
git merge --ff-only --quiet "$target"
if release && healthy; then
  docker image prune -f --filter "label=com.docker.compose.project=matchium" > /dev/null
  say "Live: $(git log --oneline -1)"
  exit 0
fi

say "Failed or not healthy, rolling back to $(git log --oneline -1 "$previous")"
git reset --hard --quiet "$previous"
release || echo "The previous release failed too." >&2
if healthy; then
  echo "Rolled back. Migrations from the failed release stay applied, and one that failed partway"
  echo "blocks every deploy until it is resolved. The dump taken above is in backups/db."
else
  echo "Not healthy after the rollback. Check: ${compose[*]} logs migrate api web" >&2
fi
exit 1
