# Перенос только ААГ на сервер с Apache

Код ААГ на компьютере находится в `apps/aag` репозитория `https://github.com/Andrewtyr/is-2612-group`. На работающем сервере его база и загруженные материалы находятся **не в Git**, а в Docker-томе `aag_data` (`/data/aag.sqlite` и `/data/uploads` внутри контейнера). Для переноса нужны код и согласованная копия этого тома.

## 1. Сделать архив на текущем сервере

```sh
cd /opt/is-2612-group
sudo sh scripts/export-aag-only.sh
```

Скрипт выведет пути `Archive:` и `Checksum:` в `/home/keatfo96gt/is2612-transfer/`. Архив содержит `apps/aag/`, `data/aag.sqlite`, `data/uploads/`, список запрещённых слов и `commit.txt`. Сведения об участниках и ответы на вопросы находятся в базе: файл не публикуйте и не пересылайте в чат.

На компьютере скачайте оба файла через PowerShell. В начале строки **обязателен `&`**, если запускаете `scp.exe` по полному пути:

```powershell
New-Item -ItemType Directory -Force -Path 'D:\is2612-backup'
& 'C:\Windows\System32\OpenSSH\scp.exe' 'keatfo96gt@2.153.248.137:/home/keatfo96gt/is2612-transfer/aag-only-YYYYMMDDTHHMMSSZ.tar.gz' 'D:\is2612-backup\'
& 'C:\Windows\System32\OpenSSH\scp.exe' 'keatfo96gt@2.153.248.137:/home/keatfo96gt/is2612-transfer/aag-only-YYYYMMDDTHHMMSSZ.tar.gz.sha256' 'D:\is2612-backup\'
Get-FileHash -Algorithm SHA256 'D:\is2612-backup\aag-only-YYYYMMDDTHHMMSSZ.tar.gz'
```

Подставьте имя из вывода скрипта и сравните хеш с `.sha256`. Пароль SSH вводите только в консоли.

Если удобнее **CMD**, там нет оператора `&`: команда начинается прямо с `C:\Windows\System32\OpenSSH\scp.exe`, затем идут те же два пути.

## 2. Развернуть ААГ на другом Ubuntu-сервере

Нужны Docker Engine с Compose, Apache 2.4, домен с HTTPS и свободный локальный порт 4180. Архив можно передать на новый сервер через `scp`. Затем в SSH **на новом сервере**:

```sh
sudo install -d -m 700 /srv/aag-transfer
sudo tar -xzf /home/USER/aag-only-YYYYMMDDTHHMMSSZ.tar.gz -C /srv/aag-transfer
sudo install -d /opt/aag-interactive
sudo cp -a /srv/aag-transfer/apps/aag/. /opt/aag-interactive/
cd /opt/aag-interactive
printf 'AAG_PUBLIC_BASE_URL=https://ВАШ-ДОМЕН/aag/\n' | sudo tee deploy/.env.apache > /dev/null
sudo chmod 600 deploy/.env.apache
sudo docker compose --env-file deploy/.env.apache -f deploy/compose.apache.yaml build app
sudo docker compose --env-file deploy/.env.apache -f deploy/compose.apache.yaml run --rm --no-deps --user root -v /srv/aag-transfer/data:/restore:ro app sh -c 'cp /restore/aag.sqlite /data/aag.sqlite && mkdir -p /data/uploads && if [ -d /restore/uploads ]; then cp -a /restore/uploads/. /data/uploads/; fi && if [ -f /restore/word-cloud-blocklist.txt ]; then cp /restore/word-cloud-blocklist.txt /data/word-cloud-blocklist.txt; fi && chown -R node:node /data'
sudo docker compose --env-file deploy/.env.apache -f deploy/compose.apache.yaml up -d app
curl -fsS http://127.0.0.1:4180/api/health
```

Команда восстановления рассчитана на **новый пустой том**. При запуске на существующем ААГ она заменит базу. Пользователи и материалы из старой базы уже восстановлены; повторно создавать администратора не нужно.

## 3. Проксировать `/aag/` через Apache

В HTTPS `VirtualHost` вашего сайта добавьте до общих правил `ProxyPass` следующие строки:

```apache
ProxyRequests Off
ProxyPreserveHost On
RequestHeader set X-Forwarded-Proto "https"
RedirectMatch ^/aag$ /aag/
ProxyPass "/aag/" "http://127.0.0.1:4180/"
ProxyPassReverse "/aag/" "http://127.0.0.1:4180/"
```

Включите модули и проверьте конфигурацию:

```sh
sudo a2enmod proxy proxy_http headers ssl
sudo apache2ctl configtest
sudo systemctl reload apache2
```

Порт 4180 не открывайте наружу. Для Apache достаточно публичных 80/443 и действующего сертификата. [Документация Apache ProxyPass](https://httpd.apache.org/docs/2.4/mod/mod_proxy.html).

Откройте `https://ВАШ-ДОМЕН/aag/`, проверьте вход, материалы, QR-код показа и запуск вопроса с телефона. Если старый ААГ продолжит принимать новые данные, перед окончательным переключением повторите экспорт: после первого снимка базы записи расходятся.
