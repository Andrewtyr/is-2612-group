#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

docker compose -f docker-compose.production.yml exec -T postgres \
  psql -X -v ON_ERROR_STOP=1 -U group -d group_system <<'SQL'
BEGIN;

CREATE TEMP TABLE stale_class_hour ON COMMIT DROP AS
SELECT l.id
FROM "Lesson" AS l
JOIN "Subject" AS s ON s.id = l."subjectId"
WHERE l.id = 'cmv92mlfm0ctbqw25kfo6e7l7'
  AND l.date = DATE '2026-10-19'
  AND l."lessonNumber" = 3
  AND l."startTime" = '12:20'
  AND l."endTime" = '13:50'
  AND l.source = 'official-pdf'
  AND s.name = 'Классный час'
  AND NOT EXISTS (SELECT 1 FROM "Attendance" AS a WHERE a."lessonId" = l.id)
  AND NOT EXISTS (SELECT 1 FROM "AbsenceReason" AS r WHERE r."lessonId" = l.id);

DO $$
BEGIN
  IF (SELECT count(*) FROM stale_class_hour) <> 1 THEN
    RAISE EXCEPTION 'The stale class hour was not found or now has linked data';
  END IF;
END
$$;

DELETE FROM "ScheduleChange"
WHERE "lessonId" IN (SELECT id FROM stale_class_hour);

DELETE FROM "Lesson"
WHERE id IN (SELECT id FROM stale_class_hour);

COMMIT;
SQL
