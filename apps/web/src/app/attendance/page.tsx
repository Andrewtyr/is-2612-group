'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type RecordItem = {
  id: string;
  status: string;
  lesson: {
    date: string;
    lessonNumber: number;
    subject: { name: string } | null;
  };
};
type Summary = {
  total: number;
  attended: number;
  missed: number;
  late: number;
  excused: number;
  percent: number;
};
type Reason = { id: string; date: string; category: string; status: string };

const categories = [
  'болезнь',
  'семейные обстоятельства',
  'соревнования',
  'официальное мероприятие',
  'практика',
  'транспорт',
  'другая причина',
];
const statusLabels: Record<string, string> = {
  PRESENT: 'Присутствовал',
  ABSENT: 'Отсутствовал',
  LATE: 'Опоздал',
  LEFT_EARLY: 'Ушёл раньше',
  EXCUSED: 'Уважительная причина',
  EXEMPT: 'Освобождён',
  NEEDS_REVIEW: 'Требует проверки',
};

export default function AttendancePage() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [error, setError] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [comment, setComment] = useState('');
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [disputeComment, setDisputeComment] = useState('');

  async function refresh() {
    try {
      const [items, statistics, reasonsList] = await Promise.all([
        api<RecordItem[]>('/attendance/me'),
        api<Summary>('/statistics/me'),
        api<Reason[]>('/absence-reasons/me'),
      ]);
      setRecords(items);
      setSummary(statistics);
      setReasons(reasonsList);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function addReason(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api('/absence-reasons', {
        method: 'POST',
        body: JSON.stringify({ date, category, comment }),
      });
      setComment('');
      await refresh();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function submitDispute(event: React.FormEvent) {
    event.preventDefault();
    if (!disputeId) return;
    try {
      await api(`/attendance/${disputeId}/dispute`, {
        method: 'POST',
        body: JSON.stringify({ comment: disputeComment }),
      });
      setDisputeId(null);
      setDisputeComment('');
      setError('Спор отправлен куратору');
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
          <h1>Посещаемость</h1>
          <p className="muted">Ваши отметки и причины отсутствия</p>
        </div>
      </div>
      {error && <p className="notice">{error}</p>}
      {summary && (
        <div className="stats-grid">
          <div>
            <strong>{summary.percent}%</strong>
            <span>посещаемость</span>
          </div>
          <div>
            <strong>{summary.attended}</strong>
            <span>посещено</span>
          </div>
          <div>
            <strong>{summary.missed}</strong>
            <span>пропущено</span>
          </div>
          <div>
            <strong>{summary.late}</strong>
            <span>опозданий</span>
          </div>
        </div>
      )}
      <div className="section-title">
        <h2>История отметок</h2>
      </div>
      <div className="lessons">
        {records.length === 0 && <div className="empty">Отметок пока нет.</div>}
        {records.map((item) => (
          <article key={item.id} className="lesson">
            <div className="lesson-content wide">
              <div className="lesson-top">
                {item.lesson.date.slice(0, 10)} · {item.lesson.lessonNumber}{' '}
                пара
              </div>
              <h3>{item.lesson.subject?.name ?? 'Занятие'}</h3>
              <p>{statusLabels[item.status] ?? item.status}</p>
            </div>
            <button
              className="small-button"
              onClick={() => setDisputeId(item.id)}
            >
              Оспорить
            </button>
          </article>
        ))}
      </div>
      {disputeId && (
        <form className="panel" onSubmit={submitDispute}>
          <h3>Оспорить отметку</h3>
          <textarea
            value={disputeComment}
            onChange={(e) => setDisputeComment(e.target.value)}
            minLength={5}
            required
            placeholder="Опишите, что произошло"
          />
          <div className="row">
            <button type="submit" className="primary">
              Отправить
            </button>
            <button
              type="button"
              className="small-button"
              onClick={() => setDisputeId(null)}
            >
              Отмена
            </button>
          </div>
        </form>
      )}
      <div className="section-title">
        <h2>Сообщить об отсутствии</h2>
      </div>
      <form className="panel form-grid" onSubmit={addReason}>
        <label>
          Дата
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label>
          Причина
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="full">
          Комментарий
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="При необходимости"
          />
        </label>
        <button className="primary">Отправить куратору</button>
      </form>
      {reasons.length > 0 && (
        <div className="panel">
          <h3>Мои причины</h3>
          {reasons.map((item) => (
            <p key={item.id}>
              {item.date.slice(0, 10)} · {item.category} ·{' '}
              {item.status === 'PENDING'
                ? 'на проверке'
                : item.status === 'APPROVED'
                  ? 'подтверждено'
                  : 'отклонено'}
            </p>
          ))}
        </div>
      )}
    </main>
  );
}
