#!/usr/bin/env sh
set -eu

if [ ! -f .env.production ]; then
  echo ".env.production is missing" >&2
  exit 1
fi

if docker compose -f docker-compose.production.yml ps --status running postgres | grep -q postgres; then
  sh scripts/backup.sh
fi

git pull --ff-only
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml up -d
attempt=0
while [ "$attempt" -lt 30 ]; do
  if curl --fail --silent --max-time 3 http://127.0.0.1:3000/api/health >/dev/null; then
    echo 'Deployment healthy'
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 2
done

echo 'Site did not become healthy after startup' >&2
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs --tail=60 api web
exit 1
