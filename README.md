# Информационная система группы ИС-2612

Мобильный сайт учебной группы: расписание, изменения, посещаемость и кураторский контроль.

## Требования

Node.js 22, pnpm 11, Docker Desktop.

## Локальный запуск

1. Скопируйте `.env.example` в `apps/api/.env` и задайте случайный `JWT_SECRET`.
2. Выполните `pnpm install`.
3. Выполните `docker compose up -d postgres`.
4. Выполните `pnpm db:generate` и `pnpm db:migrate`.
5. Выполните `pnpm dev`.

Сайт: http://localhost:3000. API: http://localhost:4000. Проверка API: http://localhost:4000/health.

Укажите `ADMIN_LOGIN` и `ADMIN_PASSWORD` в `apps/api/.env`, затем выполните `pnpm db:seed`. Не храните этот файл в Git. При первом входе смените временный пароль.

## Проверка

`pnpm ci:local` проверяет форматирование, lint, типы, тесты и сборку. Для отдельной проверки Docker используйте `docker compose build`.

Документация архитектуры находится в `docs/architecture.md`, инструкции для сервера — в `docs/deployment.md`.
Инструкция по подключению MAX-бота — в `docs/max-bot.md`.
