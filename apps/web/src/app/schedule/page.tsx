'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

type Lesson = {
  id: string;
  date: string;
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

function weekDayLabel(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

export default function SchedulePage() {
  const [date, setDate] = useState(localDate);
  const [view, setView] = useState<'day' | 'week'>('day');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(true);
  const [bells, setBells] = useState<Bell[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [error, setError] = useState('');
  const [authState, setAuthState] = useState<
    'checking' | 'ready' | 'required' | 'error'
  >('checking');

  useEffect(() => {
    api('/auth/me')
      .then(() => setAuthState('ready'))
      .catch((reason: Error) => {
        if (reason instanceof ApiError && reason.status === 401) {
          setAuthState('required');
        } else {
          setError(reason.message);
          setAuthState('error');
        }
      });
  }, []);

  useEffect(() => {
    if (authState !== 'ready') return;
    let active = true;
    setError('');
    setLessonsLoading(true);
    api<Lesson[]>(view === 'week' ? '/schedule/week' : `/schedule/date/${date}`)
      .then((rows) => {
        if (active) setLessons(rows);
      })
      .catch((reason: Error) => {
        if (!active) return;
        if (reason instanceof ApiError && reason.status === 401) {
          setAuthState('required');
        } else {
          setError(reason.message);
        }
      })
      .finally(() => {
        if (active) setLessonsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [date, view, authState]);

  useEffect(() => {
    if (authState !== 'ready') return;
    Promise.all([
      api<Bell[]>('/schedule/bells'),
      api<Change[]>('/schedule/changes'),
    ])
      .then(([bellRows, changeRows]) => {
        setBells(bellRows);
        setChanges(changeRows);
      })
      .catch((reason: Error) => {
        if (reason instanceof ApiError && reason.status === 401) {
          setAuthState('required');
        } else {
          setError(reason.message);
        }
      });
  }, [authState]);

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
      {authState === 'checking' && <p className="muted">Загрузка…</p>}
      {authState === 'required' && (
        <section className="panel">
          <h2>Нужно войти</h2>
          <p>
            Войдите в аккаунт на главной странице, чтобы увидеть расписание.
          </p>
          <Link className="primary" href="/">
            Перейти ко входу
          </Link>
        </section>
      )}
      {error && <p className="error">{error}</p>}
      {authState === 'ready' && (
        <>
          <div className="tabs">
            <button
              type="button"
              className={view === 'day' ? 'active' : ''}
              onClick={() => setView('day')}
            >
              День
            </button>
            <button
              type="button"
              className={view === 'week' ? 'active' : ''}
              onClick={() => setView('week')}
            >
              Неделя
            </button>
          </div>
          {view === 'day' && (
            <label className="panel schedule-date">
              Выберите дату
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
          )}
          <div className="section-title">
            <h2>Занятия</h2>
            <span>{lessonsLoading ? '…' : lessons.length}</span>
          </div>
          <div className="lessons">
            {lessonsLoading && <div className="empty">Загрузка…</div>}
            {!lessonsLoading && lessons.length === 0 && (
              <div className="empty">
                {view === 'week'
                  ? 'На ближайшие семь дней занятий нет.'
                  : 'На эту дату занятий нет.'}
              </div>
            )}
            {!lessonsLoading &&
              lessons.map((lesson, index) => (
                <Fragment key={lesson.id}>
                  {view === 'week' &&
                    (index === 0 ||
                      lessons[index - 1].date.slice(0, 10) !==
                        lesson.date.slice(0, 10)) && (
                      <h3 className="week-day-heading">
                        {weekDayLabel(lesson.date)}
                      </h3>
                    )}
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
                        {lesson.teacher?.name ?? 'Преподаватель не указан'} ·
                        кабинет {lesson.room ?? 'не указан'}
                        {lesson.building ? ` · корпус ${lesson.building}` : ''}
                        {lesson.subgroup
                          ? ` · подгруппа ${lesson.subgroup}`
                          : ''}
                      </p>
                    </div>
                  </article>
                </Fragment>
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
            {changes.length === 0 && (
              <p className="muted">Изменений пока нет.</p>
            )}
            {changes.slice(0, 20).map((change) => (
              <div key={change.id} className="change-row">
                <strong>
                  {change.lesson.date.slice(0, 10)} ·{' '}
                  {change.lesson.lessonNumber} пара ·{' '}
                  {change.lesson.subject?.name ?? 'Занятие'}
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
        </>
      )}
    </main>
  );
}
