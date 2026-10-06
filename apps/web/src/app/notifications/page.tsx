'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type Notification = {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState('');

  async function refresh() {
    try {
      setItems(await api<Notification[]>('/notifications'));
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function markRead(id: string) {
    try {
      await api(`/notifications/${id}/read`, { method: 'POST' });
      await refresh();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  return (
    <main className="shell">
      <div className="page-head">
        <div>
          <Link className="back-link" href="/">
            ← Сегодня
          </Link>
          <h1>Уведомления</h1>
          <p className="muted">Изменения и решения по вашим отметкам</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {items.length === 0 && <div className="empty">Уведомлений пока нет.</div>}
      <div className="lessons">
        {items.map((item) => (
          <article
            key={item.id}
            className={`panel notification-card ${item.readAt ? '' : 'unread'}`}
          >
            <div>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
              <small className="muted">
                {new Date(item.createdAt).toLocaleString('ru-RU')}
              </small>
            </div>
            {!item.readAt && (
              <button
                className="small-button"
                onClick={() => void markRead(item.id)}
              >
                Прочитано
              </button>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
