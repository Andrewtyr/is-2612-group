'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type User = {
  firstName: string;
  lastName: string;
  role: string;
  mustChangePass: boolean;
};
const roles: Record<string, string> = {
  ADMIN: 'Администратор',
  HEAD: 'Староста',
  DEPUTY: 'Заместитель',
  CURATOR: 'Куратор',
  STUDENT: 'Студент',
};
const paths: Record<string, string> = {
  home: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',
  calendar: 'M4 5h16v16H4ZM8 3v4m8-4v4M4 10h16',
  chart: 'M4 20V10m8 10V4m8 16v-7',
  book: 'M12 5v16M3 4h5l4 2 4-2h5v15h-5l-4 2-4-2H3Z',
  bell: 'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 21h4',
  check: 'm8 12 3 3 5-6M4 3h16v18H4Z',
  report: 'M5 3h10l4 4v14H5ZM9 11h6m-6 4h6',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
  more: 'M5 12h1m5 0h1m5 0h1',
  game: 'M4 10V7a4 4 0 0 1 8 0v3m0 0h8v11H4V10h16m-8 4v3',
};
function Icon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export default function Navigation() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      void api<User>('/auth/me', { signal: controller.signal })
        .then(setUser)
        .catch(() => {
          if (!controller.signal.aborted) setUser(null);
        });
    };
    refresh();
    window.addEventListener('session-changed', refresh);
    return () => {
      controller.abort();
      window.removeEventListener('session-changed', refresh);
    };
  }, [pathname]);
  if (!user || user.mustChangePass) return null;
  const links = [
    { href: '/', label: 'Сегодня', icon: 'home' },
    { href: '/schedule', label: 'Расписание', icon: 'calendar' },
    ...(['HEAD', 'DEPUTY', 'CURATOR', 'ADMIN'].includes(user.role)
      ? [{ href: '/mark', label: 'Отметить', icon: 'check' }]
      : [{ href: '/grades', label: 'Мои оценки', icon: 'book' }]),
    { href: '/notifications', label: 'Уведомления', icon: 'bell' },
    { href: '/attendance', label: 'Посещаемость', icon: 'chart' },
    ...(['CURATOR', 'ADMIN'].includes(user.role)
      ? [
          { href: '/cyber-safe', label: 'Игра CYBER SAFE', icon: 'game' },
          { href: '/aag', label: 'ААГ Интерактив', icon: 'game' },
        ]
      : []),
    ...(['HEAD', 'DEPUTY'].includes(user.role)
      ? [{ href: '/grades', label: 'Мои оценки', icon: 'book' }]
      : []),
    ...(['HEAD', 'ADMIN'].includes(user.role)
      ? [{ href: '/reports', label: 'Отчёты', icon: 'report' }]
      : []),
    ...(['CURATOR', 'ADMIN'].includes(user.role)
      ? [{ href: '/manage', label: 'Управление', icon: 'settings' }]
      : []),
    ...(user.role === 'ADMIN'
      ? [{ href: '/grades/admin', label: 'Оценки группы', icon: 'book' }]
      : []),
  ];
  const renderLink = (link: (typeof links)[number]) => {
    const content = (
      <>
        <Icon name={link.icon} />
        <span>{link.label}</span>
      </>
    );
    return ['/cyber-safe', '/aag'].includes(link.href) ? (
      <a key={link.href} href={link.href}>
        {content}
      </a>
    ) : (
      <Link
        key={link.href}
        href={link.href}
        aria-current={pathname === link.href ? 'page' : undefined}
      >
        {content}
      </Link>
    );
  };
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      window.location.assign('/');
    } catch {
      setError('Не удалось выйти. Попробуйте ещё раз.');
    }
  }
  return (
    <aside className="app-navigation">
      <Link href="/" className="nav-brand">
        <span className="nav-logo">иc</span>
        <span>
          ИС–2612<small>Учебная группа</small>
        </span>
      </Link>
      <div className="nav-caption">ЛИЧНЫЙ КАБИНЕТ</div>
      <nav className="desktop-links" aria-label="Основная навигация">
        {links.map(renderLink)}
      </nav>
      <div className="nav-profile">
        <span className="profile-initials">
          {user.firstName[0]}
          {user.lastName[0]}
        </span>
        <div>
          <strong>{user.firstName}</strong>
          <small>{roles[user.role] || user.role}</small>
        </div>
        <button
          onClick={logout}
          title="Выйти из аккаунта"
          aria-label="Выйти из аккаунта"
        >
          ↗
        </button>
      </div>
      <nav className="mobile-links" aria-label="Основная навигация">
        {links.slice(0, 4).map(renderLink)}
        <details
          key={pathname}
          className="nav-more"
          onKeyDown={(event) => {
            if (event.key === 'Escape') event.currentTarget.open = false;
          }}
        >
          <summary>
            <Icon name="more" />
            <span>Ещё</span>
          </summary>
          <div className="more-sheet">
            <div className="more-heading">
              Все разделы <small>{roles[user.role]}</small>
            </div>
            {links.slice(4).map(renderLink)}
            <button onClick={logout}>Выйти из аккаунта ↗</button>
          </div>
        </details>
      </nav>
      {error && (
        <div role="alert" className="feedback-toast">
          {error}
          <button onClick={() => setError('')} aria-label="Закрыть">
            ×
          </button>
        </div>
      )}
    </aside>
  );
}
