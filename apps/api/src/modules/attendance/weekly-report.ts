type ReportMember = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
};

type ReportLesson = {
  id: string;
  date: Date;
  status: string;
};

type ReportMark = {
  lessonId: string;
  studentId: string;
  status: string;
};

export function weekMonday(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export function buildWeeklyReport(
  weekStart: string,
  members: ReportMember[],
  lessons: ReportLesson[],
  marks: ReportMark[],
) {
  const dayDates = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(`${weekStart}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
  const activeLessons = lessons.filter(
    (lesson) => lesson.status !== 'CANCELLED',
  );
  const marksByKey = new Map(
    marks.map((mark) => [`${mark.lessonId}:${mark.studentId}`, mark.status]),
  );
  return {
    weekStart,
    weekEnd: dayDates[5],
    days: dayDates,
    students: members.map((student) => {
      const days = dayDates.map((date) => {
        let unexcusedHours = 0;
        let excusedHours = 0;
        let unmarkedLessons = 0;
        for (const lesson of activeLessons) {
          if (lesson.date.toISOString().slice(0, 10) !== date) continue;
          const status = marksByKey.get(`${lesson.id}:${student.id}`);
          if (status === 'ABSENT') unexcusedHours += 2;
          else if (status === 'EXCUSED') excusedHours += 2;
          else if (!status) unmarkedLessons += 1;
        }
        return { date, unexcusedHours, excusedHours, unmarkedLessons };
      });
      return {
        id: student.id,
        name: [student.lastName, student.firstName, student.middleName]
          .filter(Boolean)
          .join(' '),
        days,
        totalUnexcusedHours: days.reduce(
          (sum, day) => sum + day.unexcusedHours,
          0,
        ),
        totalExcusedHours: days.reduce((sum, day) => sum + day.excusedHours, 0),
      };
    }),
  };
}
