#!/usr/bin/env sh
set -eu

mkdir -p backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
docker compose -f docker-compose.production.yml exec -T postgres sh -c "pg_dump -U group -d group_system -Fc > /backups/group-system-$stamp.dump"
printf 'Backup: backups/group-system-%s.dump\n' "$stamp"
