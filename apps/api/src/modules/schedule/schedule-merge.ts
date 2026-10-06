type BaseLesson = {
  lessonNumber: number;
  subject: string;
  room: string;
  teacher: string;
  status: 'PLANNED' | 'CHANGED' | 'CANCELLED' | 'ADDED';
};

export function applyOfficialChange(
  lesson: BaseLesson,
  change: Partial<BaseLesson>,
): BaseLesson {
  return {
    ...lesson,
    ...change,
    status: change.status ?? 'CHANGED',
  };
}
