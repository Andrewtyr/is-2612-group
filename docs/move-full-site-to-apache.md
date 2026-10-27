# Перенос всего сайта на другой сервер с Apache

Текущий исходный код: `https://github.com/Andrewtyr/is-2612-group`, рабочий каталог на старом сервере: `/opt/is-2612-group`. Apache принимает HTTPS и передаёт **все** запросы в Next.js на `127.0.0.1:3000`. Сам сайт, API, PostgreSQL, ААГ и CYBER SAFE продолжают работать в Docker Compose. Apache не запускает их код непосредственно.

## Что требуется сохранить

| Составляющая | Где находится на старом сервере | Что попадает в архив |
| --- | --- | --- |
| Исходный код | Git checkout `/opt/is-2612-group` | `code/` и `commit.txt` |
| Пользователи, посещаемость, оценки, расписание | том `postgres_data` | `group-system.dump` |
| Загруженные в журнал документы | `/opt/is-2612-group/uploads` | `uploads/` |
| ААГ: пользователи, материалы, ответы, презентации, медиа | том `aag_data` | `aag/aag.sqlite`, `aag/uploads/`, список запрещённых слов |
| CYBER SAFE: рейтинг | том `cyber_safe_data` | `cyber-safe/` |
| Настройки и ключи | `.env.production`, `.env.cyber-safe`, при наличии `.env` | одноимённые файлы |

Архив содержит личные данные, пароли и токены. Храните его вне публичной папки Apache; не загружайте в Git и не присылайте в чат. Если перенос станет окончательным, на время последней копии остановите запись на старом сайте и повторите экспорт: данные, внесённые **после** копии, на новом сервере не появятся.

## 1. Создать полный архив на старом сервере

В SSH:

```sh
cd /opt/is-2612-group
sudo docker compose -f docker-compose.production.yml ps
sudo sh scripts/export-transfer-bundle.sh
```

Скрипт выведет два пути `Archive:` и `Checksum:` в домашней папке пользователя, например `/home/USER/is2612-transfer/is2612-complete-....tar.gz`. Он сохраняет PostgreSQL в согласованном формате `pg_dump`, ААГ через SQLite `VACUUM INTO`, копирует файлы и исходники текущего коммита. Все контейнеры должны быть запущены. Если ААГ содержит загруженные видео, контейнер ААГ должен быть собран из версии с исправленной резервной копией.

На компьютере **в отдельном локальном PowerShell**, подставив точное имя архива из вывода, скачайте оба файла:

```powershell
scp keatfo96gt@2.153.248.137:/home/keatfo96gt/is2612-transfer/is2612-complete-YYYYMMDDTHHMMSSZ.tar.gz "D:\is2612-backup\"
scp keatfo96gt@2.153.248.137:/home/keatfo96gt/is2612-transfer/is2612-complete-YYYYMMDDTHHMMSSZ.tar.gz.sha256 "D:\is2612-backup\"
Get-FileHash -Algorithm SHA256 "D:\is2612-backup\is2612-complete-YYYYMMDDTHHMMSSZ.tar.gz"
```

Сравните хеш с первой колонкой `.sha256`. Для хранения дополнительной копии используйте зашифрованный носитель.

## 2. Подготовить новый Ubuntu-сервер

Нужны Docker Engine с Compose, Apache 2.4, домен с A-записью на новый IP и действующий сертификат HTTPS. Откройте наружу только 80/443 и административный SSH; порт 3000 уже привязан Compose только к `127.0.0.1`. [Установка Docker для Ubuntu](https://docs.docker.com/engine/install/ubuntu/), [обратный прокси Apache](https://httpd.apache.org/docs/2.4/mod/mod_proxy.html).

Передайте архив на новый сервер по `scp`, затем на **новом** сервере:

```sh
sudo install -d -m 700 /srv/is2612-transfer /opt/is-2612-group
sudo tar -xzf /home/USER/is2612-complete-YYYYMMDDTHHMMSSZ.tar.gz -C /srv/is2612-transfer
sudo cp -a /srv/is2612-transfer/code/. /opt/is-2612-group/
sudo cp /srv/is2612-transfer/.env.production /srv/is2612-transfer/.env.cyber-safe /opt/is-2612-group/
if [ -f /srv/is2612-transfer/.env ]; then sudo cp /srv/is2612-transfer/.env /opt/is-2612-group/.env; fi
sudo install -d /opt/is-2612-group/uploads
sudo cp -a /srv/is2612-transfer/uploads/. /opt/is-2612-group/uploads/
cd /opt/is-2612-group
```

Если используется **новый домен**, создайте или отредактируйте в каталоге проекта `.env` со строкой `SITE_ORIGIN=https://НОВЫЙ-ДОМЕН` (без завершающего `/`). В `.env.production` измените `WEB_ORIGIN`, `MAX_SITE_URL` и `MAX_WEBHOOK_URL` на новый адрес. Пароль PostgreSQL в `DATABASE_URL` должен совпадать с `POSTGRES_PASSWORD`; хост БД внутри Compose — `postgres`. Сохраните прежние `JWT_SECRET`, пароли и токены. До переключения отключите бота MAX на новом сервере, временно оставив `MAX_BOT_TOKEN=` пустым; оригинал токена сохранён в архиве. После переключения домена верните токен и проверьте регистрацию webhook. Для прежнего домена `is2612.ru` файл `.env` не нужен.

## 3. Восстановить данные на пустом сервере

Убедитесь, что здесь ещё нет других данных с тем же Compose-проектом `is-2612-group`. **Не запускайте `db:seed`**: учётные записи уже находятся в резервной копии.

```sh
cd /opt/is-2612-group
sudo docker compose -f docker-compose.production.yml build
sudo docker compose -f docker-compose.production.yml up -d postgres
sudo docker compose -f docker-compose.production.yml exec -T postgres pg_restore -U group -d group_system --clean --if-exists --no-owner --no-privileges < /srv/is2612-transfer/group-system.dump
sudo docker compose -f docker-compose.production.yml run --rm --no-deps --user root -v /srv/is2612-transfer/aag:/restore:ro aag sh -c 'cp /restore/aag.sqlite /data/aag.sqlite && mkdir -p /data/uploads && if [ -d /restore/uploads ]; then cp -a /restore/uploads/. /data/uploads/; fi && if [ -f /restore/word-cloud-blocklist.txt ]; then cp /restore/word-cloud-blocklist.txt /data/word-cloud-blocklist.txt; fi && chown -R node:node /data'
sudo docker compose -f docker-compose.production.yml run --rm --no-deps --user root -v /srv/is2612-transfer/cyber-safe:/restore:ro cyber-safe sh -c 'cp -a /restore/. /app/data/ && chown -R node:node /app/data'
sudo docker compose -f docker-compose.production.yml up -d
sudo docker compose -f docker-compose.production.yml ps
```

Команды восстановления предназначены для **пустых томов нового сервера**. На сервере с существующими данными они могут их заменить. Если `pg_restore` сообщил об ошибке, остановитесь и разберите её до запуска API.

## 4. Настроить Apache

В существующем HTTPS-виртуальном хосте нужного домена включите модули `proxy`, `proxy_http`, `headers`, `ssl`, затем добавьте проксирование. Подставьте действительные домен и пути к сертификату; сертификат должен уже существовать:

```apache
<VirtualHost *:443>
    ServerName НОВЫЙ-ДОМЕН
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/НОВЫЙ-ДОМЕН/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/НОВЫЙ-ДОМЕН/privkey.pem
    ProxyRequests Off
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    ProxyPass "/" "http://127.0.0.1:3000/"
    ProxyPassReverse "/" "http://127.0.0.1:3000/"
</VirtualHost>
```

Не создавайте второй конфликтующий `VirtualHost` с тем же `ServerName`: добавьте директивы в имеющийся. Модули и конфигурацию проверьте так:

```sh
sudo a2enmod proxy proxy_http headers ssl
sudo apache2ctl configtest
sudo systemctl reload apache2
```

Порт 80 можно перенаправить на HTTPS. Сертификат и закрытый ключ настройте по [документации Apache mod_ssl](https://httpd.apache.org/docs/2.4/mod/mod_ssl.html). Не делайте `ProxyPass` напрямую к контейнерам API, ААГ или CYBER SAFE: их маршруты уже обслуживаются сайтом на порту 3000.

## 5. Проверить до переключения пользователей

```sh
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/aag/api/health
curl -fsS http://127.0.0.1:3000/cyber-safe/api/config
sudo docker compose -f docker-compose.production.yml logs --tail=80 api aag web
```

После настройки DNS и HTTPS проверьте вход, отметки, оценки, файлы, игру и ААГ через публичный адрес. При переносе на тот же домен не оставляйте одновременно два работающих MAX-бота. После успешной проверки сохраните ещё одну копию архива вне обоих VPS.

В `code/` находится полный снимок исходников, но без каталога `.git`. Для дальнейших обновлений через Git можно отдельно клонировать репозиторий и перейти на коммит из `commit.txt`; конфигурацию и данные при этом сохраните вне клона либо перенесите в новый checkout. Не выполняйте обычный `git pull` в каталоге, созданном только из снимка `code/`.
