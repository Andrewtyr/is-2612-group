import {
  buildReportStudents,
  type DailyAbsenceSummary,
  type ReportLesson,
  type ReportMark,
  type ReportMember,
} from './weekly-report';

export function buildMonthlyReport(
  month: string,
  members: ReportMember[],
  lessons: ReportLesson[],
  marks: ReportMark[],
  summaries: DailyAbsenceSummary[] = [],
) {
  const [year, monthNumber] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const days = Array.from({ length: count }, (_, index) =>
    `${month}-${String(index + 1).padStart(2, '0')}`,
  );
  return {
    month,
    days,
    students: buildReportStudents(days, members, lessons, marks, summaries),
  };
}
