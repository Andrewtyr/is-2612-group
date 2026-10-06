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
curl --fail --silent --show-error http://localhost:3000/api/health
echo
echo 'Deployment healthy'
