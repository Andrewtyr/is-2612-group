$ErrorActionPreference = 'Stop'

New-Item -ItemType Directory -Force -Path 'backups' | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$file = "group-system-$stamp.dump"
docker compose -f docker-compose.production.yml exec -T postgres sh -c "pg_dump -U group -d group_system -Fc > /backups/$file"
if ($LASTEXITCODE -ne 0) { throw 'Не удалось создать резервную копию PostgreSQL' }
Write-Host "Backup: backups/$file"
