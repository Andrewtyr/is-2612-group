$ErrorActionPreference = 'Stop'

if (-not (Test-Path '.env.production')) { throw '.env.production отсутствует' }

$running = docker compose -f docker-compose.production.yml ps --status running postgres
if ($LASTEXITCODE -ne 0) { throw 'Не удалось проверить PostgreSQL' }
if ($running -match 'postgres') { & "$PSScriptRoot/backup.ps1" }

git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw 'git pull завершился с ошибкой' }
docker compose -f docker-compose.production.yml build
if ($LASTEXITCODE -ne 0) { throw 'Сборка Docker завершилась с ошибкой' }
docker compose -f docker-compose.production.yml up -d
if ($LASTEXITCODE -ne 0) { throw 'Запуск контейнеров завершился с ошибкой' }
Invoke-RestMethod 'http://localhost:3000/api/health' | Out-Host
