# Развёртывание

Production рассчитан на один сервер с Docker Compose. До запуска настройте HTTPS через reverse proxy и закрытый доступ к серверу. Файл `.env.production` хранится только на сервере; он должен содержать `POSTGRES_PASSWORD`, `DATABASE_URL` с хостом `postgres`, длинный `JWT_SECRET`, `WEB_ORIGIN` с публичным HTTPS-адресом и `GROUP_NAME=ИС-2612`.

Пример строки подключения: `postgresql://group:<password>@postgres:5432/group_system?schema=public`. Пароль должен совпадать с `POSTGRES_PASSWORD`.

Первый запуск: `docker compose -f docker-compose.production.yml up -d --build`. API применяет Prisma Migrate перед стартом. Затем создайте администратора, передав `ADMIN_LOGIN` и `ADMIN_PASSWORD` через окружение и запустив `docker compose -f docker-compose.production.yml exec api pnpm --filter @group/api db:seed`. Передайте пароль лично и смените его при первом входе.

Для обновления из уже работающего checkout используйте `sh scripts/deploy.sh` на Linux или `./scripts/deploy.ps1` в PowerShell. Скрипты делают backup работающей БД, получают код, собирают и запускают контейнеры, затем проверяют `/api/health`.

Backup хранится в `backups/` в формате PostgreSQL custom. Для восстановления остановите API, затем выполните `pg_restore` для нужного файла на отдельной проверенной копии БД, проверьте данные и только после этого применяйте к production. Для отката кода выберите предыдущий Git tag и снова соберите контейнеры; несовместимую миграцию БД необходимо откатывать из backup.

На текущей машине Docker Desktop не обнаружен, поэтому production сборка контейнеров ещё не проверена.
