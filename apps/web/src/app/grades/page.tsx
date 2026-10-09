'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type Grade = {
  id: string;
  subject: string;
  date: string;
  value: string;
  columnIndex: number;
};

export default function GradesPage() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Grade[]>('/grades/me')
      .then(setGrades)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  const subjects = [...new Set(grades.map((grade) => grade.subject))];
  return (
    <main className="shell">
      <div className="page-head">
        <div>
          <Link className="back-link" href="/">
            ← Сегодня
          </Link>
          <h1>Мои оценки</h1>
          <p className="muted">Данные из загруженного журнала по предметам</p>
        </div>
      </div>
      {error && <p className="notice">{error}</p>}
      {loading && <p className="muted">Загружаю оценки…</p>}
      {!loading && !error && !subjects.length && (
        <div className="empty">Оценки ещё не загружены.</div>
      )}
      {subjects.map((subject) => (
        <section className="panel grade-subject" key={subject}>
          <h2>{subject}</h2>
          <table className="grades-table">
            <thead>
              <tr>
                <th scope="col">Дата</th>
                <th scope="col">Отметка</th>
              </tr>
            </thead>
            <tbody>
              {grades
                .filter((grade) => grade.subject === subject)
                .map((grade) => (
                  <tr key={grade.id}>
                    <td>
                      {new Date(
                        `${grade.date.slice(0, 10)}T12:00:00Z`,
                      ).toLocaleDateString('ru-RU', { timeZone: 'UTC' })}
                    </td>
                    <td
                      className={
                        grade.value === 'нб' ? 'grade-absence' : 'grade-value'
                      }
                    >
                      {grade.value === 'нб' ? 'нб — не был' : grade.value}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
    </main>
  );
}
