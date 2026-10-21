import { CLASS_HOUR_SUBGROUP, type AcademyLesson } from './academy-parser';
import type { PdfChange } from './academy-pdf';

type ExistingLesson = {
  id: string;
  lessonNumber: number;
  subgroup: string;
  status: string;
  source: string;
};

type Slot = Pick<AcademyLesson, 'lessonNumber' | 'subgroup'>;
type Override = Pick<PdfChange, 'lessonNumber' | 'classHour'>;

function slotKey(number: number, subgroup: string) {
  return `${number}:${subgroup}`;
}

/** Reconcile by date, period and subgroup; PDF changes own their slots. */
export function missingOfficialLessons<T extends ExistingLesson>(
  saved: T[],
  published: Slot[],
  changes: Override[],
): T[] {
  const current = new Set(
    published.map((lesson) => slotKey(lesson.lessonNumber, lesson.subgroup)),
  );
  for (const change of changes) {
    current.add(
      slotKey(change.lessonNumber, change.classHour ? CLASS_HOUR_SUBGROUP : ''),
    );
  }
  return saved.filter(
    (lesson) =>
      (lesson.source === 'academy' || lesson.source === 'official-pdf') &&
      lesson.status !== 'CANCELLED' &&
      !current.has(slotKey(lesson.lessonNumber, lesson.subgroup)),
  );
}
