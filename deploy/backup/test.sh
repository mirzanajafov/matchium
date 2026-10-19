#!/bin/sh
set -eu

name=matchium-backup-test
docker build --quiet --tag "$name" "$(dirname "$0")" > /dev/null
docker network create "$name" > /dev/null
docker volume create "$name" > /dev/null
trap 'docker rm --force "$name-postgres" > /dev/null; docker network rm "$name" > /dev/null; docker volume rm "$name" > /dev/null' EXIT

docker run --detach --name "$name-postgres" --network "$name" --env POSTGRES_PASSWORD=test postgres:17-alpine > /dev/null
until docker exec "$name-postgres" pg_isready --host localhost --quiet; do sleep 1; done

backup_from() {
  docker run --rm --network "$name" --volume "$name:/backups" --tmpfs /photos \
    --env PGHOST="$1" --env PGUSER=postgres --env PGPASSWORD=test "$name" once
}

expect() {
  if ! docker run --rm --volume "$name:/backups" --entrypoint sh "$name" -c "$2"; then
    echo "FAIL: $1" >&2
    exit 1
  fi
}

if backup_from nowhere; then
  echo "FAIL: a backup without a database exited successfully" >&2
  exit 1
fi
expect "a failed backup is never marked successful" '[ ! -e /backups/last-success ]'
expect "a failed dump never becomes a .dump" '[ -z "$(find /backups/db -name "*.dump")" ]'

backup_from "$name-postgres"
expect "a good backup is marked successful" '[ -s /backups/last-success ]'
expect "a good backup leaves a readable dump" 'pg_restore --list /backups/db/*.dump > /dev/null'

echo "backup tests passed"
