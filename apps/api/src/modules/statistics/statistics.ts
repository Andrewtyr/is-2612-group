type Entry = {
  lessonStatus: 'PLANNED' | 'CHANGED' | 'CANCELLED' | 'ADDED';
  attendanceStatus:
    | 'PRESENT'
    | 'ABSENT'
    | 'LATE'
    | 'LEFT_EARLY'
    | 'EXCUSED'
    | 'EXEMPT'
    | 'NEEDS_REVIEW'
    | null;
};

export function attendanceSummary(entries: Entry[]) {
  const marked = entries.filter(
    (entry) =>
      entry.lessonStatus !== 'CANCELLED' &&
      entry.attendanceStatus !== null &&
      entry.attendanceStatus !== 'EXEMPT' &&
      entry.attendanceStatus !== 'NEEDS_REVIEW',
  );
  const attended = marked.filter((entry) =>
    ['PRESENT', 'LATE', 'LEFT_EARLY'].includes(entry.attendanceStatus!),
  ).length;
  const missed = marked.filter(
    (entry) => entry.attendanceStatus === 'ABSENT',
  ).length;
  const late = marked.filter(
    (entry) => entry.attendanceStatus === 'LATE',
  ).length;
  const excused = marked.filter(
    (entry) => entry.attendanceStatus === 'EXCUSED',
  ).length;
  return {
    total: marked.length,
    attended,
    missed,
    late,
    excused,
    percent: marked.length ? Math.round((attended / marked.length) * 100) : 0,
  };
}
