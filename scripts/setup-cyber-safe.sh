#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
target=.env.cyber-safe
if [ -e "$target" ]; then
  echo "Игровой пароль уже настроен в $target. Файл не изменён."
  exit 0
fi

umask 077
password="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
if [ "${#password}" -ne 48 ]; then
  echo 'Не удалось создать случайный пароль.' >&2
  exit 1
fi
printf 'ADMIN_PASSWORD=%s\n' "$password" > "$target"
printf 'Пароль монитора CYBER SAFE: %s\n' "$password"
echo 'Сохраните пароль у себя. Не присылайте его в чат.'
