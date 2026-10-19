'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Student = { id: string; name: string };
type Grade = {
  id: string;
  subject: string;
  date: string;
  value: string;
  columnIndex: number;
};
type StudentGrades = { student: Student; grades: Grade[] };

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC' }).format(
    new Date(`${value.slice(0, 10)}T12:00:00Z`),
  );
}

export default function AdminGradesPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [result, setResult] = useState<StudentGrades | null>(null);
  const [loading, setLoading] = useState(true);
  const [gradesLoading, setGradesLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Student[]>('/grades/students')
      .then((list) => {
        setStudents(list);
        setSelectedId(list[0]?.id ?? '');
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setGradesLoading(true);
    setError('');
    setResult(null);
    api<StudentGrades>(`/grades/students/${encodeURIComponent(selectedId)}`)
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setGradesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const groups = new Map<string, Grade[]>();
  for (const grade of result?.grades ?? []) {
    const items = groups.get(grade.subject) ?? [];
    items.push(grade);
    groups.set(grade.subject, items);
  }

  return (
    <main className="shell">
      <div className="page-head">
        <div>
          <Link className="back-link" href="/manage">
            ← Управление
          </Link>
          <h1>Оценки группы</h1>
          <p className="muted">
            Выберите ученика, чтобы посмотреть оценки по всем предметам.
          </p>
        </div>
      </div>
      <div className="panel admin-grades-controls">
        <label htmlFor="grade-student">Ученик</label>
        <select
          id="grade-student"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          disabled={loading || !students.length}
        >
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name}
            </option>
          ))}
        </select>
        <a
          className="grade-action"
          href={
            selectedId
              ? `/api/grades/students/${encodeURIComponent(selectedId)}/pdf`
              : undefined
          }
          aria-disabled={!result || gradesLoading}
          onClick={(event) => {
            if (!result || gradesLoading) event.preventDefault();
          }}
        >
          Скачать PDF для печати
        </a>
        <Link className="grade-action secondary" href="/grades/import">
          Загрузить журнал
        </Link>
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {(loading || gradesLoading) && <p className="muted">Загружаю оценки…</p>}
      {!loading && !students.length && !error && (
        <p className="empty">В группе пока нет учеников.</p>
      )}
      {result && !groups.size && (
        <p className="empty">Для этого ученика оценки ещё не загружены.</p>
      )}
      {result && groups.size > 0 && (
        <section
          className="panel admin-grade-panel"
          aria-label={`Оценки: ${result.student.name}`}
        >
          <div className="admin-grade-heading">
            <div>
              <h2>{result.student.name}</h2>
              <p className="muted">
                Предметов: {groups.size} · записей: {result.grades.length}
              </p>
            </div>
          </div>
          <div className="admin-grade-scroll">
            <table className="admin-grade-table">
              <thead>
                <tr>
                  <th scope="col">Предмет</th>
                  <th scope="col">Оценки</th>
                </tr>
              </thead>
              <tbody>
                {[...groups].map(([subject, grades]) => (
                  <tr key={subject}>
                    <th scope="row">{subject}</th>
                    <td>
                      <div className="admin-grade-values">
                        {grades.map((grade) => (
                          <span
                            key={grade.id}
                            className={`admin-grade-chip ${grade.value === 'нб' ? 'absence' : ''}`}
                            title={formatDate(grade.date)}
                          >
                            <small>{formatDate(grade.date)}</small>
                            <strong>{grade.value}</strong>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
