import type { Role } from '@prisma/client';

function localDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Novosibirsk',
  }).format(now);
}

export function canEditAttendance(
  role: Role,
  lessonDate: string,
  now: Date,
  windowDays = 0,
): boolean {
  if (role === 'ADMIN' || role === 'CURATOR') return true;
  if (role !== 'HEAD' && role !== 'DEPUTY') return false;
  const deadline = new Date(`${lessonDate}T00:00:00Z`);
  const extraDays = Number.isFinite(windowDays)
    ? Math.max(0, Math.min(7, Math.floor(windowDays)))
    : 0;
  deadline.setUTCDate(deadline.getUTCDate() + extraDays);
  const currentDate = localDate(now);
  return (
    currentDate >= lessonDate &&
    currentDate <= deadline.toISOString().slice(0, 10)
  );
}
