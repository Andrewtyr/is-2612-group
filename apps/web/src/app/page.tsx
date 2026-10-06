'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type User = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  mustChangePass: boolean;
};
type Lesson = {
  id: string;
  lessonNumber: number;
  date: string;
  startTime: string;
  endTime: string;
  room: string | null;
  building: string | null;
  status: string;
  subject: { name: string } | null;
  teacher: { name: string } | null;
};
type SyncState = { lastSuccess: string | null; lastError: string | null };

function weekDayLabel(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [requiresHttps, setRequiresHttps] = useState(false);
  const [tab, setTab] = useState<'today' | 'tomorrow' | 'week'>('today');

  useEffect(() => {
    setRequiresHttps(
      window.location.protocol === 'http:' &&
        !['localhost', '127.0.0.1'].includes(window.location.hostname),
    );
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    api<Lesson[]>(`/schedule/${tab}`)
      .then(setLessons)
      .catch((reason: Error) => setError(reason.message));
    api<SyncState | null>('/schedule/sync/status')
      .then(setSyncState)
      .catch(() => {});
  }, [user, tab]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const result = await api<{ user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login, password }),
      });
      setUser(result.user);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function signOut() {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
    setLessons([]);
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api('/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: password, newPassword }),
      });
      setUser(user ? { ...user, mustChangePass: false } : null);
      setPassword('');
      setNewPassword('');
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  if (loading)
    return (
      <main className="shell">
        <p>Загрузка…</p>
      </main>
    );

  if (!user) {
    return (
      <main className="shell login-shell">
        <div className="brand">
          <span className="brand-mark">✓</span>
          <span>ИС–2612</span>
        </div>
        <section className="login-card">
          <div className="eyebrow">УЧЕБНАЯ ГРУППА</div>
          <h1>
            Всё важное
            <br />
            на сегодня
          </h1>
          <p className="muted">
            Расписание, изменения и посещаемость в одном месте.
          </p>
          {requiresHttps ? (
            <p className="error">
              Для входа откройте сайт по HTTPS. Сейчас адрес сервера открыт по
              HTTP, поэтому вход не сохраняется. После настройки домена
              используйте https://is2612.ru.
            </p>
          ) : (
            <form onSubmit={signIn}>
              <label>
                Логин
                <input
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                Пароль
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              {error && <p className="error">{error}</p>}
              <button type="submit" className="primary">
                Войти
              </button>
            </form>
          )}
        </section>
      </main>
    );
  }

  if (user.mustChangePass) {
    return (
      <main className="shell login-shell">
        <div className="brand">
          <span className="brand-mark">✓</span>
          <span>ИС–2612</span>
        </div>
        <section className="login-card">
          <div className="eyebrow">БЕЗОПАСНОСТЬ</div>
          <h1>Смените пароль</h1>
          <p className="muted">
            Временный пароль нужно заменить перед началом работы.
          </p>
          <form onSubmit={changePassword}>
            <label>
              Текущий пароль
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              Новый пароль (от 12 символов)
              <input
                type="password"
                required
                minLength={12}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary">Сохранить пароль</button>
          </form>
        </section>
      </main>
    );
  }

  const today = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Novosibirsk',
  }).format(new Date());
  const now = new Intl.DateTimeFormat('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Novosibirsk',
  }).format(new Date());
  const current =
    tab === 'today'
      ? lessons.find(
          (lesson) =>
            lesson.startTime <= now &&
            lesson.endTime > now &&
            lesson.status !== 'CANCELLED',
        )
      : undefined;
  const next =
    tab === 'today'
      ? lessons.find(
          (lesson) => lesson.startTime > now && lesson.status !== 'CANCELLED',
        )
      : undefined;
  const highlighted =
    current ??
    next ??
    (tab === 'today'
      ? undefined
      : lessons.find((lesson) => lesson.status !== 'CANCELLED'));

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">✓</span>
          <span>ИС–2612</span>
        </div>
        <button className="link-button" onClick={signOut}>
          Выйти
        </button>
      </header>
      <div className="page-head">
        <div>
          <div className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</div>
          <h1>Сегодня</h1>
          <p className="muted capitalize">{today}</p>
        </div>
        <div className="avatar">
          {user.firstName[0]}
          {user.lastName[0]}
        </div>
      </div>
      <section className="hero-card">
        <div className="hero-label">
          {current
            ? 'СЕЙЧАС ИДЁТ'
            : next
              ? 'СЛЕДУЮЩАЯ ПАРА'
              : tab === 'today'
                ? 'НА СЕГОДНЯ'
                : 'РАСПИСАНИЕ'}
        </div>
        <h2>{highlighted?.subject?.name ?? 'Занятий пока нет'}</h2>
        {highlighted && (
          <p>
            {highlighted.lessonNumber} пара · {highlighted.startTime}–
            {highlighted.endTime} · кабинет {highlighted.room ?? 'не указан'}
          </p>
        )}
      </section>
      <div className="section-title">
        <h2>Расписание</h2>
        <span>{lessons.length} занятий</span>
      </div>
      {syncState && (
        <p className="sync-note">
          {syncState.lastError ? 'Не удалось проверить новые изменения. ' : ''}
          {syncState.lastSuccess &&
            `Последнее обновление: ${new Date(syncState.lastSuccess).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`}
        </p>
      )}
      <div className="tabs">
        {(
          [
            ['today', 'Сегодня'],
            ['tomorrow', 'Завтра'],
            ['week', 'Неделя'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? 'active' : ''}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="lessons">
        {lessons.length === 0 && (
          <div className="empty">
            Расписание пока не загружено. Куратор может добавить занятия после
            настройки системы.
          </div>
        )}
        {lessons.map((lesson, index) => (
          <Fragment key={lesson.id}>
            {tab === 'week' &&
              (index === 0 ||
                lessons[index - 1].date.slice(0, 10) !==
                  lesson.date.slice(0, 10)) && (
                <h3 className="week-day-heading">
                  {weekDayLabel(lesson.date)}
                </h3>
              )}
            <article
              className={`lesson ${lesson.status === 'CANCELLED' ? 'cancelled' : ''}`}
            >
              <div className="lesson-time">
                <strong>{lesson.startTime}</strong>
                <span>{lesson.endTime}</span>
              </div>
              <div className="lesson-content">
                <div className="lesson-top">
                  <span>{lesson.lessonNumber} пара</span>
                  {lesson.status !== 'PLANNED' && (
                    <em>
                      {lesson.status === 'CANCELLED' ? 'Отменена' : 'Изменена'}
                    </em>
                  )}
                </div>
                <h3>{lesson.subject?.name ?? 'Предмет не указан'}</h3>
                <p>
                  {lesson.teacher?.name ?? 'Преподаватель не указан'} ·{' '}
                  {lesson.room ? `каб. ${lesson.room}` : 'кабинет не указан'}
                </p>
              </div>
            </article>
          </Fragment>
        ))}
      </div>
      <nav className="bottom-nav">
        <Link className="selected" href="/">
          Сегодня
        </Link>
        <Link href="/schedule">Расписание</Link>
        <Link href="/attendance">Посещаемость</Link>
        <Link href="/notifications">Уведомления</Link>
        {['HEAD', 'DEPUTY', 'CURATOR', 'ADMIN'].includes(user.role) && (
          <Link href="/mark">Отметить</Link>
        )}
        {['CURATOR', 'ADMIN'].includes(user.role) && (
          <Link href="/manage">Управление</Link>
        )}
      </nav>
    </main>
  );
}
