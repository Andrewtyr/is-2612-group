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
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try {
    Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -TimeoutSec 3 | Out-Host
    exit 0
  } catch {
    Start-Sleep -Seconds 2
  }
}
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs --tail=60 api web
throw 'Сайт не ответил на проверку после запуска'
