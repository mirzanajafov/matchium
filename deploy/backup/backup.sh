#!/bin/sh
set -eu

BACKUPS=/backups
PHOTOS=/photos
KEEP_DAYS="${KEEP_DAYS:-14}"
RUN_AT="${RUN_AT:-04:00}"
partial=

log() {
  printf '{"event":"backup","time":"%s","message":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1"
}

backup_database() {
  stamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
  target="$BACKUPS/db/matchium-$stamp.dump"
  partial="$target.partial"
  mkdir -p "$BACKUPS/db"
  pg_dump --format=custom --no-owner --no-privileges --file="$partial"
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
  status=$?
  if [ "$status" -ne 0 ]; then
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

if [ "${1:-}" = "once" ]; then
  trap finish EXIT
  run_once
  exit
fi

log "scheduled daily at $RUN_AT UTC, keeping $KEEP_DAYS days"
while true; do
  sleep "$(seconds_until_next_run)"
  sh "$0" once || true
done
