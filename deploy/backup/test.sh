#!/bin/sh
set -eu

name=matchium-backup-test-$$
cleanup() {
  docker rm --force "$name-postgres" "$name-scheduler" > /dev/null 2>&1 || true
  docker network rm "$name" > /dev/null 2>&1 || true
  docker volume rm "$name" > /dev/null 2>&1 || true
  docker image rm "$name" > /dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 1' INT TERM

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

docker build --quiet --tag "$name" "$(dirname "$0")" > /dev/null
docker network create "$name" > /dev/null
docker volume create "$name" > /dev/null
docker run --rm --volume "$name:/backups" --entrypoint chown "$name" 1000:1000 /backups
docker run --detach --name "$name-postgres" --network "$name" --env POSTGRES_PASSWORD=test postgres:17-alpine \
  -c max_prepared_transactions=1 > /dev/null
timeout 60 sh -c "until docker exec $name-postgres pg_isready --host localhost --quiet; do sleep 1; done" ||
  fail "postgres did not start within 60 seconds"

backup() {
  docker run --rm --user 1000:1000 --network "$name" --volume "$name:/backups" --env PGUSER=postgres --env PGPASSWORD=test "$@" "$name" once
}

backup_fails() {
  if output=$(backup "$@" 2>&1); then
    fail "backup with $* exited successfully"
  fi
  case $output in
    *'"message":"FAILED"'*) ;;
    *) fail "backup with $* did not run to its own failure: $output" ;;
  esac
}

expect() {
  docker run --rm --volume "$name:/backups" --entrypoint sh "$name" -c "$2" || fail "$1"
}

psql() {
  docker exec "$name-postgres" psql --username postgres --quiet "$@"
}

nothing_kept='[ -z "$(find /backups/db -name "matchium-*")" ] && [ ! -e /backups/last-success ]'

backup_fails --env PGHOST=missing.invalid --tmpfs /photos
expect "a failed dump leaves no dump, no partial file and no success mark" "$nothing_kept"
expect "the health check fails before any backup has succeeded" '! backup check'

psql --command 'CREATE TABLE held (id int)' --command 'BEGIN' --command 'LOCK TABLE held' \
  --command "PREPARE TRANSACTION 'held'"
status=0
backup --env PGHOST="$name-postgres" --env DUMP_TIMEOUT=3s --tmpfs /photos > /dev/null 2>&1 || status=$?
psql --command "ROLLBACK PREPARED 'held'"
[ "$status" -eq 124 ] || fail "a dump stuck behind a lock ended with $status, not the timeout's 124"
expect "a dump stuck behind a lock is given up and leaves nothing behind" "$nothing_kept"

backup_fails --env PGHOST="$name-postgres"
expect "a failed photo copy after a good dump is not marked successful" \
  'ls /backups/db/*.dump > /dev/null && [ ! -e /backups/last-success ]'

backup --env PGHOST="$name-postgres" --tmpfs /photos
expect "a good backup is marked successful and every dump is readable" \
  '[ -s /backups/last-success ] && ls /backups/db/*.dump | xargs -n 1 pg_restore --list > /dev/null'
expect "the health check passes after a good backup" 'backup check'
expect "the health check fails once the last good backup is over 26 hours old" \
  'touch -d "27 hours ago" /backups/last-success && ! backup check'

docker run --detach --name "$name-scheduler" --user 1000:1000 --volume "$name:/backups" "$name" > /dev/null
timeout 30 sh -c "until docker logs $name-scheduler 2>&1 | grep -q scheduled; do sleep 1; done" ||
  fail "the scheduler did not start within 30 seconds"
docker stop "$name-scheduler" > /dev/null
[ "$(docker inspect --format '{{.State.ExitCode}}' "$name-scheduler")" = 0 ] ||
  fail "the scheduler was killed instead of stopping on SIGTERM"

echo "backup tests passed"
