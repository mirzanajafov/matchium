#!/bin/sh
set -eu

name=matchium-backup-test-$$
cleanup() {
  docker rm --force "$name-postgres" > /dev/null 2>&1 || true
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
docker run --detach --name "$name-postgres" --network "$name" --env POSTGRES_PASSWORD=test postgres:17-alpine > /dev/null
timeout 60 sh -c "until docker exec $name-postgres pg_isready --host localhost --quiet; do sleep 1; done" ||
  fail "postgres did not start within 60 seconds"

backup() {
  docker run --rm --network "$name" --volume "$name:/backups" --env PGUSER=postgres --env PGPASSWORD=test "$@" "$name" once
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

backup_fails --env PGHOST=missing.invalid --tmpfs /photos
expect "a failed dump leaves no dump, no partial file and no success mark" \
  '[ -z "$(find /backups/db -name "matchium-*")" ] && [ ! -e /backups/last-success ]'

backup_fails --env PGHOST="$name-postgres"
expect "a failed photo copy after a good dump is not marked successful" \
  'ls /backups/db/*.dump > /dev/null && [ ! -e /backups/last-success ]'

backup --env PGHOST="$name-postgres" --tmpfs /photos
expect "a good backup is marked successful and every dump is readable" \
  '[ -s /backups/last-success ] && ls /backups/db/*.dump | xargs -n 1 pg_restore --list > /dev/null'

echo "backup tests passed"
