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
trap 'exit 130' INT TERM

docker build --quiet --tag "$name" "$(dirname "$0")" > /dev/null
docker network create "$name" > /dev/null
docker volume create "$name" > /dev/null
docker run --detach --name "$name-postgres" --network "$name" --env POSTGRES_PASSWORD=test postgres:17-alpine > /dev/null
timeout 60 sh -c "until docker exec $name-postgres pg_isready --host localhost --quiet; do sleep 1; done"

backup() {
  docker run --rm --network "$name" --volume "$name:/backups" --env PGUSER=postgres --env PGPASSWORD=test "$@" "$name" once
}

backup_fails() {
  if backup "$@"; then
    echo "FAIL: backup with $* exited successfully" >&2
    exit 1
  fi
}

expect() {
  if ! docker run --rm --volume "$name:/backups" --entrypoint sh "$name" -c "$2"; then
    echo "FAIL: $1" >&2
    exit 1
  fi
}

backup_fails --env PGHOST=nowhere --tmpfs /photos
expect "a failed dump is neither kept nor marked successful" \
  '[ ! -e /backups/last-success ] && [ -z "$(find /backups/db -name "*.dump")" ]'

backup_fails --env PGHOST="$name-postgres"
expect "a failed photo copy is not marked successful" '[ ! -e /backups/last-success ]'

backup --env PGHOST="$name-postgres" --tmpfs /photos
expect "a good backup is marked successful and leaves only readable dumps" \
  '[ -s /backups/last-success ] && [ -z "$(find /backups/db -name "*.partial")" ] && ls /backups/db/*.dump | xargs -n 1 pg_restore --list > /dev/null'

echo "backup tests passed"
