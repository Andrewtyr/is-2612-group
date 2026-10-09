'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type ReportDay = {
  date: string;
  unexcusedHours: number;
  excusedHours: number;
  unmarkedLessons: number;
};
type Report = {
  weekStart: string;
  weekEnd: string;
  days: string[];
  students: {
    id: string;
    name: string;
    days: ReportDay[];
    totalUnexcusedHours: number;
    totalExcusedHours: number;
  }[];
};

function today() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Novosibirsk',
  }).format(new Date());
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

function Hours({ day }: { day: ReportDay }) {
  return (
    <span className="report-hours">
      {day.unexcusedHours > 0 && <span>{day.unexcusedHours}</span>}
      {day.excusedHours > 0 && (
        <span className="report-excused" title="Уважительная причина">
          {day.excusedHours}
        </span>
      )}
      {!day.unexcusedHours && !day.excusedHours && !day.unmarkedLessons && '—'}
      {day.unmarkedLessons > 0 && (
        <span className="report-pending" title="Есть пары без отметки">
          ?
        </span>
      )}
    </span>
  );
}

export default function ReportsPage() {
  const [week, setWeek] = useState(today);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    api<Report>(`/attendance/reports/weekly?week=${encodeURIComponent(week)}`)
      .then(setReport)
      .catch((reason: Error) => {
        setReport(null);
        setError(reason.message);
      })
      .finally(() => setLoading(false));
  }, [week]);

  return (
    <main className="shell report-page">
      <div className="page-head">
        <div>
          <Link className="back-link" href="/">
            ← Сегодня
          </Link>
          <h1>Отчёт по пропускам</h1>
          <p className="muted">Одна пропущенная пара = 2 часа</p>
        </div>
      </div>
      <div className="panel report-controls">
        <label htmlFor="report-week">Выберите день нужной недели</label>
        <input
          id="report-week"
          type="date"
          value={week}
          onChange={(event) => setWeek(event.target.value)}
        />
        <button type="button" onClick={() => window.print()} disabled={!report}>
          Распечатать
        </button>
      </div>
      {error && <p className="notice">{error}</p>}
      {loading && <p className="muted">Загружаю отчёт…</p>}
      {report && (
        <>
          <h2>
            Неделя {report.weekStart} — {report.weekEnd}
          </h2>
          <p className="muted report-legend">
            Обычное число — пропуск без уважительной причины. Число в кружке —
            уважительная причина. «?» — пара ещё не отмечена.
          </p>
          <div className="report-scroll">
            <table className="report-table">
              <thead>
                <tr>
                  <th scope="col">№</th>
                  <th scope="col">Студент</th>
                  {report.days.map((date) => (
                    <th scope="col" key={date}>
                      {dateLabel(date)}
                    </th>
                  ))}
                  <th scope="col">Всего</th>
                </tr>
              </thead>
              <tbody>
                {report.students.map((student, index) => (
                  <tr key={student.id}>
                    <td>{index + 1}</td>
                    <th scope="row">{student.name}</th>
                    {student.days.map((day) => (
                      <td key={day.date}>
                        <Hours day={day} />
                      </td>
                    ))}
                    <td>
                      <span className="report-hours">
                        {student.totalUnexcusedHours || '—'}
                        {student.totalExcusedHours > 0 && (
                          <span
                            className="report-excused"
                            title="Уважительные часы"
                          >
                            {student.totalExcusedHours}
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
