#!/bin/sh
set -eu

# Run as root on the current production host. The archive contains personal
# data and credentials; it is written only to a private directory.
cd "$(dirname "$0")/.."
umask 077

for file in .env.production .env.cyber-safe; do
  if [ ! -f "$file" ]; then
    echo "Missing $file" >&2
    exit 1
  fi
done
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
name="is2612-complete-$stamp"
stage="$output/$name.stage"
archive="$output/$name.tar.gz"
if [ -e "$stage" ] || [ -e "$archive" ]; then
  echo 'Export target already exists.' >&2
  exit 1
fi
mkdir -m 700 "$stage"
printf 'Export incomplete. Do not use this directory.\n' > "$stage/INCOMPLETE"
mkdir -p "$stage/code" "$stage/uploads" "$stage/cyber-safe"

git archive HEAD | tar -xf - -C "$stage/code"
git rev-parse HEAD > "$stage/commit.txt"
cp .env.production .env.cyber-safe "$stage/"
if [ -f .env ]; then cp .env "$stage/.env"; fi
if [ -d uploads ]; then cp -a uploads/. "$stage/uploads/"; fi

docker compose -f docker-compose.production.yml exec -T postgres \
  pg_dump -U group -d group_system -Fc > "$stage/group-system.dump"
if [ ! -s "$stage/group-system.dump" ]; then
  echo 'PostgreSQL backup is empty.' >&2
  exit 1
fi

aag_output="$(docker compose -f docker-compose.production.yml exec -T aag npm --workspace @aag/api run backup)"
aag_path="$(printf '%s\n' "$aag_output" | sed -n 's/^Копия создана: //p' | tail -n 1)"
if [ -z "$aag_path" ]; then
  echo 'AAG backup path was not returned.' >&2
  exit 1
fi
aag_container="$(docker compose -f docker-compose.production.yml ps -q aag)"
cyber_container="$(docker compose -f docker-compose.production.yml ps -q cyber-safe)"
if [ -z "$aag_container" ] || [ -z "$cyber_container" ]; then
  echo 'AAG or CYBER SAFE container is not running.' >&2
  exit 1
fi
docker cp "$aag_container:$aag_path" "$stage/aag"
docker cp "$cyber_container:/app/data/." "$stage/cyber-safe/"
if [ ! -s "$stage/aag/aag.sqlite" ]; then
  echo 'AAG database backup is missing.' >&2
  exit 1
fi

rm "$stage/INCOMPLETE"
tar -C "$stage" -czf "$archive" .
tar -tzf "$archive" > /dev/null
sha256sum "$archive" > "$archive.sha256"
chown "$recipient" "$archive" "$archive.sha256"
chmod 600 "$archive" "$archive.sha256"
case "$stage" in "$output"/is2612-complete-*.stage) rm -rf -- "$stage" ;; *) echo 'Unexpected staging path; manual cleanup required.' >&2 ;; esac
printf 'Archive: %s\nChecksum: %s\n' "$archive" "$archive.sha256"
