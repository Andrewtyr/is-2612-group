'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type Lesson = {
  id: string;
  lessonNumber: number;
  startTime: string;
  endTime: string;
  room: string | null;
  building: string | null;
  subgroup: string;
  status: string;
  subject: { name: string } | null;
  teacher: { name: string } | null;
};
type Bell = {
  id: string;
  dayScheme: string;
  lessonNumber: number;
  startTime: string;
  endTime: string;
};
type Change = {
  id: string;
  type: string;
  reason: string | null;
  detectedAt: string;
  lesson: {
    date: string;
    lessonNumber: number;
    subject: { name: string } | null;
  };
};

const schemeNames: Record<string, string> = {
  MON: 'Понедельник',
  TUE_FRI: 'Вторник — пятница',
  SAT: 'Суббота',
};
const statusNames: Record<string, string> = {
  PLANNED: 'По расписанию',
  CHANGED: 'Изменена',
  CANCELLED: 'Отменена',
  ADDED: 'Добавлена',
};

function localDate() {
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Novosibirsk',
  }).format(new Date());
}

export default function SchedulePage() {
  const [date, setDate] = useState(localDate);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [bells, setBells] = useState<Bell[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Lesson[]>(`/schedule/date/${date}`)
      .then(setLessons)
      .catch((reason: Error) => setError(reason.message));
  }, [date]);

  useEffect(() => {
    Promise.all([
      api<Bell[]>('/schedule/bells'),
      api<Change[]>('/schedule/changes'),
    ])
      .then(([bellRows, changeRows]) => {
        setBells(bellRows);
        setChanges(changeRows);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  return (
    <main className="shell">
      <div className="page-head">
        <div>
          <Link className="back-link" href="/">
            ← Сегодня
          </Link>
          <h1>Расписание</h1>
          <p className="muted">Занятия группы ИС-2612</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <label className="panel schedule-date">
        Выберите дату
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <div className="section-title">
        <h2>Занятия</h2>
        <span>{lessons.length}</span>
      </div>
      <div className="lessons">
        {lessons.length === 0 && (
          <div className="empty">На эту дату занятий нет.</div>
        )}
        {lessons.map((lesson) => (
          <article
            key={lesson.id}
            className={`lesson ${lesson.status === 'CANCELLED' ? 'cancelled' : ''}`}
          >
            <div className="lesson-time">
              <strong>{lesson.startTime}</strong>
              <span>{lesson.endTime}</span>
            </div>
            <div className="lesson-content">
              <div className="lesson-top">
                <span>{lesson.lessonNumber} пара</span>
                <em>{statusNames[lesson.status] ?? lesson.status}</em>
              </div>
              <h3>{lesson.subject?.name ?? 'Предмет не указан'}</h3>
              <p>
                {lesson.teacher?.name ?? 'Преподаватель не указан'} · кабинет{' '}
                {lesson.room ?? 'не указан'}
                {lesson.building ? ` · корпус ${lesson.building}` : ''}
                {lesson.subgroup ? ` · подгруппа ${lesson.subgroup}` : ''}
              </p>
            </div>
          </article>
        ))}
      </div>
      <div className="section-title">
        <h2>Расписание звонков</h2>
      </div>
      {Object.entries(schemeNames).map(([scheme, title]) => (
        <section key={scheme} className="panel">
          <h3>{title}</h3>
          <div className="bell-grid">
            {bells
              .filter((bell) => bell.dayScheme === scheme)
              .map((bell) => (
                <div key={bell.id}>
                  <strong>{bell.lessonNumber} пара</strong>
                  <span>
                    {bell.startTime}–{bell.endTime}
                  </span>
                </div>
              ))}
          </div>
        </section>
      ))}
      <div className="section-title">
        <h2>Последние изменения</h2>
      </div>
      <div className="panel">
        {changes.length === 0 && <p className="muted">Изменений пока нет.</p>}
        {changes.slice(0, 20).map((change) => (
          <div key={change.id} className="change-row">
            <strong>
              {change.lesson.date.slice(0, 10)} · {change.lesson.lessonNumber}{' '}
              пара · {change.lesson.subject?.name ?? 'Занятие'}
            </strong>
            <span>
              {change.reason ??
                (change.type.includes('CANCEL')
                  ? 'Отмена'
                  : 'Изменение расписания')}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
