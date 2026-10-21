'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type Student = { id: string; name: string };
type GradeCell = {
  date: string;
  columnIndex: number;
  value: string;
  needsReview?: boolean;
  raw?: string;
};
type GradePage = {
  subject: string;
  dates: { date: string; columnIndex: number; needsReview?: boolean }[];
  rows: { name: string; studentId: string | null; grades: GradeCell[] }[];
  previewImage?: string;
};
type Preview = {
  checksum: string;
  academicYearStart: number;
  format: 'pdf' | 'xps' | 'excel';
  pages: GradePage[];
};

function formatDate(value: string) {
  if (!value) return 'Укажите дату';
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

function gradeKey(pageIndex: number, rowIndex: number, columnIndex: number) {
  return `${pageIndex}:${rowIndex}:${columnIndex}`;
}

export default function GradeImportPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState(2026);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [subjects, setSubjects] = useState<Record<number, string>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [allowUnmatched, setAllowUnmatched] = useState(false);
  const [openSubject, setOpenSubject] = useState(0);
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
        headers: {
          'Content-Type': file.name.toLowerCase().endsWith('.xps')
            ? 'application/vnd.ms-xpsdocument'
            : file.name.toLowerCase().endsWith('.xlsx')
              ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              : file.name.toLowerCase().endsWith('.xls')
                ? 'application/vnd.ms-excel'
                : 'application/pdf',
        },
        body: file,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          Array.isArray(data.message) ? data.message.join(', ') : data.message,
        );
      const result = data as Preview;
      setPreview(result);
      setOpenSubject(0);
      setSubjects(
        Object.fromEntries(
          result.pages.map((page, pageIndex) => [pageIndex, page.subject]),
        ),
      );
      setDates(
        Object.fromEntries(
          result.pages.flatMap((page, pageIndex) =>
            page.dates.map((date) => [
              `${pageIndex}:${date.columnIndex}`,
              date.date,
            ]),
          ),
        ),
      );
      setGrades(
        Object.fromEntries(
          result.pages.flatMap((page, pageIndex) =>
            page.rows.flatMap((row, rowIndex) =>
              row.grades.map((grade) => [
                gradeKey(pageIndex, rowIndex, grade.columnIndex),
                grade.needsReview ? '?' : grade.value,
              ]),
            ),
          ),
        ),
      );
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
            page.dates.some((date) =>
              /^[2-5]$|^нб$/i.test(
                grades[gradeKey(pageIndex, rowIndex, date.columnIndex)] ?? '',
              ),
            ) && !assignments[`${pageIndex}:${rowIndex}`],
        ).length,
      0,
    ) ?? 0;
  const unresolved = Object.values(grades).filter(
    (value) => value === '?',
  ).length;
  const invalidDates =
    preview?.pages.reduce(
      (count, page, pageIndex) =>
        count +
        page.dates.filter(
          (date) =>
            !/^\d{4}-\d{2}-\d{2}$/.test(
              dates[`${pageIndex}:${date.columnIndex}`] ?? '',
            ),
        ).length,
      0,
    ) ?? 0;
  const invalidSubjects =
    preview?.pages.filter((_, pageIndex) => !subjects[pageIndex]?.trim())
      .length ?? 0;

  async function save() {
    if (
      !preview ||
      !file ||
      unresolved > 0 ||
      invalidDates > 0 ||
      invalidSubjects > 0 ||
      (unmatched > 0 && !allowUnmatched)
    )
      return;
    const entries = preview.pages.flatMap((page, pageIndex) =>
      page.rows.flatMap((row, rowIndex) => {
        const studentId = assignments[`${pageIndex}:${rowIndex}`];
        return studentId
          ? page.dates.flatMap((date) => {
              const value =
                grades[gradeKey(pageIndex, rowIndex, date.columnIndex)] ?? '';
              return /^[2-5]$|^нб$/i.test(value)
                ? [
                    {
                      studentId,
                      subject: subjects[pageIndex].trim(),
                      date: dates[`${pageIndex}:${date.columnIndex}`],
                      columnIndex: date.columnIndex,
                      value,
                    },
                  ]
                : [];
            })
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
      const result = await api<{
        imported: number;
        updated: number;
        unchanged: number;
        alreadyImported: boolean;
      }>('/grades/import', {
        method: 'POST',
        body: JSON.stringify({
          checksum: preview.checksum,
          fileName: file.name,
          academicYearStart: preview.academicYearStart,
          entries,
        }),
      });
      setMessage(
        result.alreadyImported
          ? 'Этот файл уже загружен.'
          : `Новых: ${result.imported}, обновлено: ${result.updated}, без изменений: ${result.unchanged}.`,
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
          <Link className="back-link" href="/grades/admin">
            ← Оценки группы
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
          PDF, XPS или Excel (.xls, .xlsx)
          <input
            type="file"
            accept=".pdf,.xps,.xls,.xlsx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
            Найдено предметов: {preview.pages.length}. Строк журнала:{' '}
            {preview.pages.reduce((count, page) => count + page.rows.length, 0)}
            . Строк без сопоставления: {unmatched}. «нб» показывается отдельно
            от числовых оценок.
          </p>
          {preview.format !== 'pdf' && (
            <p className="muted">
              Проверьте таблицу и сопоставление студентов. Можно исправить
              предметы и оценки. Неясных отметок: {unresolved}; некорректных
              дат: {invalidDates}.
            </p>
          )}
          {preview.pages.map((page, pageIndex) => (
            <section
              className="panel grade-subject"
              key={`${page.subject}:${pageIndex}`}
            >
              {preview.format !== 'pdf' ? (
                <label className="grade-subject-name">
                  Предмет
                  <input
                    type="text"
                    maxLength={200}
                    value={subjects[pageIndex] ?? ''}
                    onChange={(event) =>
                      setSubjects({
                        ...subjects,
                        [pageIndex]: event.target.value,
                      })
                    }
                  />
                </label>
              ) : (
                <h2>{page.subject}</h2>
              )}
              {preview.format === 'excel' && (
                <button
                  type="button"
                  onClick={() =>
                    setOpenSubject(openSubject === pageIndex ? -1 : pageIndex)
                  }
                >
                  {openSubject === pageIndex
                    ? 'Свернуть таблицу'
                    : 'Показать оценки и проверить'}
                </button>
              )}
              {(preview.format !== 'excel' || openSubject === pageIndex) && (
                <>
                  {page.previewImage && (
                    <details className="grade-source-preview">
                      <summary>Сверить с оригинальной страницей</summary>
                      {/* The image comes from the uploaded XPS and is held only in this preview. */}
                      <img src={page.previewImage} alt="Страница журнала XPS" />
                    </details>
                  )}
                  <div className="report-scroll">
                    <table className="report-table grade-preview-table">
                      <thead>
                        <tr>
                          <th scope="col">Студент из журнала</th>
                          <th scope="col">Аккаунт группы</th>
                          {page.dates.map((date) => (
                            <th scope="col" key={date.columnIndex}>
                              {preview.format === 'xps' ? (
                                <input
                                  type="date"
                                  aria-label={`Дата колонки ${date.columnIndex + 1}`}
                                  value={
                                    dates[`${pageIndex}:${date.columnIndex}`] ??
                                    ''
                                  }
                                  onChange={(event) =>
                                    setDates({
                                      ...dates,
                                      [`${pageIndex}:${date.columnIndex}`]:
                                        event.target.value,
                                    })
                                  }
                                />
                              ) : (
                                formatDate(date.date)
                              )}
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
                                {preview.format !== 'pdf' ? (
                                  <select
                                    aria-label={`Оценка: ${row.name}, колонка ${date.columnIndex + 1}`}
                                    className={
                                      grades[
                                        gradeKey(
                                          pageIndex,
                                          rowIndex,
                                          date.columnIndex,
                                        )
                                      ] === '?'
                                        ? 'grade-needs-review'
                                        : ''
                                    }
                                    value={
                                      grades[
                                        gradeKey(
                                          pageIndex,
                                          rowIndex,
                                          date.columnIndex,
                                        )
                                      ] ?? ''
                                    }
                                    onChange={(event) =>
                                      setGrades({
                                        ...grades,
                                        [gradeKey(
                                          pageIndex,
                                          rowIndex,
                                          date.columnIndex,
                                        )]: event.target.value,
                                      })
                                    }
                                  >
                                    <option value="">—</option>
                                    <option value="?">Проверить</option>
                                    <option value="2">2</option>
                                    <option value="3">3</option>
                                    <option value="4">4</option>
                                    <option value="5">5</option>
                                    <option value="нб">нб</option>
                                  </select>
                                ) : (
                                  (row.grades.find(
                                    (grade) =>
                                      grade.columnIndex === date.columnIndex,
                                  )?.value ?? '—')
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
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
            disabled={
              busy ||
              unresolved > 0 ||
              invalidDates > 0 ||
              invalidSubjects > 0 ||
              (unmatched > 0 && !allowUnmatched)
            }
            onClick={save}
          >
            Сохранить проверенные оценки
          </button>
        </>
      )}
    </main>
  );
}
