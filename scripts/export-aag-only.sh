#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
umask 077
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Commit or preserve local changes before exporting code.' >&2
  exit 1
fi

recipient="${SUDO_USER:-$(id -un)}"
recipient_home="$(getent passwd "$recipient" | cut -d: -f6)"
if [ -z "$recipient_home" ]; then
  echo 'Cannot determine the recipient home directory.' >&2
  exit 1
fi
output="$recipient_home/is2612-transfer"
install -d -m 700 -o "$recipient" "$output"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="aag-only-$stamp"
stage="$output/$name.stage"
archive="$output/$name.tar.gz"
if [ -e "$stage" ] || [ -e "$archive" ]; then
  echo 'Export target already exists.' >&2
  exit 1
fi
mkdir -m 700 "$stage"
printf 'Export incomplete. Do not use this directory.\n' > "$stage/INCOMPLETE"

git archive HEAD apps/aag | tar -xf - -C "$stage"
git rev-parse HEAD > "$stage/commit.txt"
result="$(docker compose -f docker-compose.production.yml exec -T aag npm --workspace @aag/api run backup)"
backup_path="$(printf '%s\n' "$result" | sed -n 's/^Копия создана: //p' | tail -n 1)"
container="$(docker compose -f docker-compose.production.yml ps -q aag)"
if [ -z "$backup_path" ] || [ -z "$container" ]; then
  echo 'AAG backup was not created.' >&2
  exit 1
fi
docker cp "$container:$backup_path" "$stage/data"
if [ ! -s "$stage/data/aag.sqlite" ]; then
  echo 'AAG database backup is missing.' >&2
  exit 1
fi

rm "$stage/INCOMPLETE"
tar -C "$stage" -czf "$archive" .
tar -tzf "$archive" > /dev/null
sha256sum "$archive" > "$archive.sha256"
chown "$recipient" "$archive" "$archive.sha256"
chmod 600 "$archive" "$archive.sha256"
case "$stage" in "$output"/aag-only-*.stage) rm -rf -- "$stage" ;; *) echo 'Unexpected staging path; manual cleanup required.' >&2 ;; esac
printf 'Archive: %s\nChecksum: %s\n' "$archive" "$archive.sha256"
