#!/bin/sh
set -eu

BACKUPS=/backups
PHOTOS=/photos
KEEP_DAYS="${KEEP_DAYS:-14}"
RUN_AT="${RUN_AT:-04:00}"
DUMP_TIMEOUT="${DUMP_TIMEOUT:-30m}"
partial=

log() {
  printf '{"event":"backup","time":"%s","message":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1"
}

backup_database() {
  stamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
  target="$BACKUPS/db/matchium-$stamp.dump"
  partial="$target.partial"
  mkdir -p "$BACKUPS/db"
  timeout "$DUMP_TIMEOUT" pg_dump --format=custom --no-owner --no-privileges --file="$partial"
  pg_restore --list "$partial" > /dev/null
  mv "$partial" "$target"
  log "database $(du -h "$target" | cut -f1) $target"
  find "$BACKUPS/db" -name 'matchium-*' -mtime +"$KEEP_DAYS" -delete
}

backup_photos() {
  mkdir -p "$BACKUPS/photos"
  rsync -a --delete "$PHOTOS/" "$BACKUPS/photos/" || [ "$?" -eq 24 ]
  log "photos $(du -sh "$BACKUPS/photos" | cut -f1)"
}

run_once() {
  backup_database
  backup_photos
  date -u +%Y-%m-%dT%H:%M:%SZ > "$BACKUPS/last-success"
}

finish() {
  if [ "$?" -ne 0 ]; then
    rm -f "$partial"
    log "FAILED"
  fi
}

seconds_until_next_run() {
  now=$(date -u +%s)
  today=$(date -u +%Y-%m-%d)
  next=$(date -u -d "$today $RUN_AT" +%s)
  [ "$next" -gt "$now" ] || next=$((next + 86400))
  echo $((next - now))
}

case "${1:-}" in
  once)
    trap finish EXIT
    run_once
    exit
    ;;
  check)
    [ -n "$(find "$BACKUPS/last-success" -mmin -$((26 * 60)) 2> /dev/null)" ]
    exit
    ;;
esac

stopping=
trap 'stopping=1' TERM INT
log "scheduled daily at $RUN_AT UTC, keeping $KEEP_DAYS days"
while [ -z "$stopping" ]; do
  sleep "$(seconds_until_next_run)" &
  wait $! || break
  sh "$0" once || true
done
