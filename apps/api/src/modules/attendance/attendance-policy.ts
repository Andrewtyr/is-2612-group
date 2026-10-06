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
): boolean {
  if (role === 'ADMIN' || role === 'CURATOR') return true;
  if (role !== 'HEAD' && role !== 'DEPUTY') return false;
  return lessonDate === localDate(now);
}
