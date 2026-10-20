import type { AttendanceStatus } from '@prisma/client';

type Absence = {
  studentId: string;
  lessonIds: string[];
  status: 'ABSENT' | 'EXCUSED';
};

export function buildRaportMarks(
  lessonIds: string[],
  studentIds: string[],
  absences: Absence[],
  existing: { lessonId: string; studentId: string; status: AttendanceStatus }[],
) {
  const absent = new Map<string, AttendanceStatus>(
    absences.flatMap(({ studentId, lessonIds: missed, status }) =>
      missed.map((lessonId) => [`${lessonId}:${studentId}`, status] as const),
    ),
  );
  const previous = new Map<string, AttendanceStatus>(
    existing.map((mark) => [`${mark.lessonId}:${mark.studentId}`, mark.status]),
  );
  return lessonIds.flatMap((lessonId) =>
    studentIds.flatMap((studentId) => {
      const key = `${lessonId}:${studentId}`;
      const status = absent.get(key) ?? 'PRESENT';
      if (previous.get(key) === status) return [];
      return [{ lessonId, studentId, status, oldStatus: previous.get(key) }];
    }),
  );
}
