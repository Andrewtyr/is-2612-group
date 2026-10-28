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
type MonthlyReport = {
  month: string;
  days: string[];
  students: {
    id: string;
    name: string;
    days: ReportDay[];
    totalUnexcusedHours: number;
    totalExcusedHours: number;
  }[];
};

function currentMonth() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', timeZone: 'Asia/Novosibirsk',
  }).format(new Date());
}

export default function MonthlyReportPage() {
  const [month, setMonth] = useState(currentMonth);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    api<MonthlyReport>(`/attendance/reports/monthly?month=${encodeURIComponent(month)}`)
      .then(setReport)
      .catch((reason: Error) => { setReport(null); setError(reason.message); })
      .finally(() => setLoading(false));
  }, [month]);

  return (
    <main className="shell report-page monthly-report-page">
      <div className="page-head">
        <div>
          <Link className="back-link" href="/reports">← Недельный отчёт</Link>
          <h1>Месячный отчёт по пропускам</h1>
          <p className="muted">Часы по дням: без уважительной причины и с уважительной причиной</p>
        </div>
      </div>
      <div className="panel report-controls">
        <label htmlFor="report-month">Месяц</label>
        <input id="report-month" type="month" value={month}
          onChange={(event) => setMonth(event.target.value)} />
        <a className="button" href={`/api/attendance/reports/monthly.xlsx?month=${encodeURIComponent(month)}`}
          aria-disabled={!report} onClick={(event) => { if (!report) event.preventDefault(); }}>
          Скачать Excel
        </a>
      </div>
      {error && <p className="notice">{error}</p>}
      {loading && <p className="muted">Загружаю отчёт…</p>}
      {report && (
        <>
          <h2>Ведомость за {report.month}</h2>
          <p className="muted report-legend">«?» означает, что на паре нет отметки и за этот день нет данных бумажной ведомости.</p>
          <div className="report-scroll monthly-report-scroll">
            <table className="report-table monthly-report-table">
              <thead>
                <tr>
                  <th scope="col" rowSpan={2}>№</th>
                  <th scope="col" rowSpan={2}>ФИО</th>
                  {report.days.map((date) => <th scope="colgroup" colSpan={2} key={date}>{Number(date.slice(-2))}</th>)}
                  <th scope="col" rowSpan={2}>Всего</th>
                  <th scope="col" rowSpan={2}>Ув.</th>
                  <th scope="col" rowSpan={2}>Неув.</th>
                </tr>
                <tr>
                  {report.days.flatMap((date) => [
                    <th scope="col" key={`${date}-u`}>неув.</th>,
                    <th scope="col" key={`${date}-e`}>ув.</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {report.students.map((student, index) => (
                  <tr key={student.id}>
                    <td>{index + 1}</td>
                    <th scope="row">{student.name}</th>
                    {student.days.flatMap((day) => [
                      <td key={`${day.date}-u`}>{day.unexcusedHours || (day.unmarkedLessons ? '?' : '—')}</td>,
                      <td key={`${day.date}-e`}>{day.excusedHours || '—'}</td>,
                    ])}
                    <td>{student.totalUnexcusedHours + student.totalExcusedHours}</td>
                    <td>{student.totalExcusedHours}</td>
                    <td>{student.totalUnexcusedHours}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={2} scope="row">Итого часов</th>
                  {report.days.flatMap((_, dayIndex) => [
                    <td key={`${dayIndex}-u`}>{report.students.reduce((sum, student) => sum + student.days[dayIndex].unexcusedHours, 0)}</td>,
                    <td key={`${dayIndex}-e`}>{report.students.reduce((sum, student) => sum + student.days[dayIndex].excusedHours, 0)}</td>,
                  ])}
                  <td>{report.students.reduce((sum, student) => sum + student.totalUnexcusedHours + student.totalExcusedHours, 0)}</td>
                  <td>{report.students.reduce((sum, student) => sum + student.totalExcusedHours, 0)}</td>
                  <td>{report.students.reduce((sum, student) => sum + student.totalUnexcusedHours, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
