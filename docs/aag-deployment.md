# Развёртывание ААГ на is2612.ru

ААГ доступен по адресу `https://is2612.ru/aag`. Он работает в отдельном контейнере `aag` и хранит SQLite и загруженные файлы в томе `aag_data`. Существующий `/api` остаётся за сайтом учебной группы; запросы ААГ идут через `/aag/api`.

После публикации проверенного кода в `main` на сервере в `/opt/is-2612-group`:

1. Сохранить базу учебной группы: `sudo sh scripts/backup.sh`.
2. Обновить код: `git pull --ff-only`.
3. Собрать образы: `sudo docker compose -f docker-compose.production.yml build aag web`.
4. Запустить: `sudo docker compose -f docker-compose.production.yml up -d aag web`.
5. Проверить: `curl -fsS http://127.0.0.1:3000/aag/api/health` и открыть `https://is2612.ru/aag`.

На новой пустой базе один раз создать администратора интерактивно:

`sudo docker compose -f docker-compose.production.yml exec aag npm --workspace @aag/api run bootstrap-admin -- admin "Администратор"`

Пароль вводится в терминале без отображения. Не отправляйте его в чат и не записывайте в репозиторий. Резервную копию данных ААГ можно создать командой `sudo docker compose -f docker-compose.production.yml exec aag npm --workspace @aag/api run backup`; она сохраняется в томе `aag_data`.
