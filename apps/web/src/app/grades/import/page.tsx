'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type Student = { id: string; name: string };
type GradeCell = { date: string; columnIndex: number; value: string };
type GradePage = {
  subject: string;
  dates: { date: string; columnIndex: number }[];
  rows: { name: string; studentId: string | null; grades: GradeCell[] }[];
};
type Preview = {
  checksum: string;
  academicYearStart: number;
  pages: GradePage[];
};

export default function GradeImportPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState(2026);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [allowUnmatched, setAllowUnmatched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<Student[]>('/grades/students')
      .then(setStudents)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  async function inspect() {
    if (!file) return;
    setBusy(true);
    setError('');
    setMessage('');
    setPreview(null);
    try {
      const response = await fetch(`/api/grades/preview?year=${year}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/pdf' },
        body: file,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          Array.isArray(data.message) ? data.message.join(', ') : data.message,
        );
      const result = data as Preview;
      setPreview(result);
      setAssignments(
        Object.fromEntries(
          result.pages.flatMap((page, pageIndex) =>
            page.rows.map((row, rowIndex) => [
              `${pageIndex}:${rowIndex}`,
              row.studentId ?? '',
            ]),
          ),
        ),
      );
      setAllowUnmatched(false);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const unmatched =
    preview?.pages.reduce(
      (count, page, pageIndex) =>
        count +
        page.rows.filter(
          (row, rowIndex) =>
            row.grades.length > 0 && !assignments[`${pageIndex}:${rowIndex}`],
        ).length,
      0,
    ) ?? 0;

  async function save() {
    if (!preview || !file || (unmatched > 0 && !allowUnmatched)) return;
    const entries = preview.pages.flatMap((page, pageIndex) =>
      page.rows.flatMap((row, rowIndex) => {
        const studentId = assignments[`${pageIndex}:${rowIndex}`];
        return studentId
          ? row.grades.map((grade) => ({
              studentId,
              subject: page.subject,
              date: grade.date,
              columnIndex: grade.columnIndex,
              value: grade.value,
            }))
          : [];
      }),
    );
    if (!entries.length) {
      setError('Не найдено оценок для действующих студентов.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api<{ imported: number; alreadyImported: boolean }>(
        '/grades/import',
        {
          method: 'POST',
          body: JSON.stringify({
            checksum: preview.checksum,
            fileName: file.name,
            academicYearStart: preview.academicYearStart,
            entries,
          }),
        },
      );
      setMessage(
        result.alreadyImported
          ? 'Этот PDF уже загружен.'
          : `Сохранено отметок: ${result.imported}.`,
      );
      setPreview(null);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <div className="page-head">
        <div>
          <Link className="back-link" href="/manage">
            ← Управление
          </Link>
          <h1>Загрузка оценок</h1>
          <p className="muted">
            Сначала проверьте распознанную таблицу, затем сохраните её.
          </p>
        </div>
      </div>
      {error && <p className="notice">{error}</p>}
      {message && <p className="notice">{message}</p>}
      <div className="panel grade-import-controls">
        <label>
          PDF журнала
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
            }}
          />
        </label>
        <label>
          Год начала учебного года
          <input
            type="number"
            min="2000"
            max="2100"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          />
        </label>
        <button type="button" disabled={!file || busy} onClick={inspect}>
          {busy ? 'Обрабатываю…' : 'Посмотреть таблицу'}
        </button>
      </div>
      {preview && (
        <>
          <p className="muted">
            Найдено предметов: {preview.pages.length}. Строк без сопоставления:{' '}
            {unmatched}. «нб» показывается отдельно от числовых оценок.
          </p>
          {preview.pages.map((page, pageIndex) => (
            <section
              className="panel grade-subject"
              key={`${page.subject}:${pageIndex}`}
            >
              <h2>{page.subject}</h2>
              <div className="report-scroll">
                <table className="report-table grade-preview-table">
                  <thead>
                    <tr>
                      <th scope="col">Студент из PDF</th>
                      <th scope="col">Аккаунт группы</th>
                      {page.dates.map((date) => (
                        <th scope="col" key={date.columnIndex}>
                          {date.date.slice(5)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {page.rows.map((row, rowIndex) => (
                      <tr key={`${row.name}:${rowIndex}`}>
                        <th scope="row">{row.name}</th>
                        <td>
                          <select
                            aria-label={`Аккаунт для ${row.name}`}
                            value={
                              assignments[`${pageIndex}:${rowIndex}`] ?? ''
                            }
                            onChange={(event) =>
                              setAssignments({
                                ...assignments,
                                [`${pageIndex}:${rowIndex}`]:
                                  event.target.value,
                              })
                            }
                          >
                            <option value="">Не импортировать</option>
                            {students.map((student) => (
                              <option key={student.id} value={student.id}>
                                {student.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        {page.dates.map((date) => (
                          <td key={date.columnIndex}>
                            {row.grades.find(
                              (grade) => grade.columnIndex === date.columnIndex,
                            )?.value ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {unmatched > 0 && (
            <label className="grade-unmatched">
              <input
                type="checkbox"
                checked={allowUnmatched}
                onChange={(event) => setAllowUnmatched(event.target.checked)}
              />
              Я проверил {unmatched} несопоставленных строк. Они не попадут в
              базу.
            </label>
          )}
          <button
            type="button"
            disabled={busy || (unmatched > 0 && !allowUnmatched)}
            onClick={save}
          >
            Сохранить проверенные оценки
          </button>
        </>
      )}
    </main>
  );
}
