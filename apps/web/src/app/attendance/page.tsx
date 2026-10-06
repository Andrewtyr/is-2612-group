'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type RecordItem = {
  id: string;
  status: string;
  confirmedAt: string | null;
  lesson: {
    date: string;
    lessonNumber: number;
    subject: { name: string } | null;
  };
  history: {
    id: string;
    oldStatus: string | null;
    newStatus: string;
    createdAt: string;
    editor: { firstName: string; lastName: string; role: string };
  }[];
  disputes: { id: string; status: string; decision: string | null }[];
};
type Summary = {
  total: number;
  attended: number;
  missed: number;
  late: number;
  excused: number;
  percent: number;
};
type Reason = {
  id: string;
  date: string;
  category: string;
  status: string;
  attachments: { id: string; fileName: string }[];
};
type AbsenceLesson = {
  id: string;
  lessonNumber: number;
  subject: { name: string } | null;
};

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
  const [absenceLessons, setAbsenceLessons] = useState<AbsenceLesson[]>([]);
  const [lessonId, setLessonId] = useState('');
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

  useEffect(() => {
    if (!date) return;
    api<AbsenceLesson[]>(`/schedule/date/${date}`)
      .then(setAbsenceLessons)
      .catch((reason: Error) => setError(reason.message));
  }, [date]);

  async function addReason(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api('/absence-reasons', {
        method: 'POST',
        body: JSON.stringify({
          date,
          category,
          comment,
          lessonId: lessonId || undefined,
        }),
      });
      setComment('');
      setLessonId('');
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

  async function confirmMark(id: string) {
    try {
      await api(`/attendance/${id}/confirm`, { method: 'POST' });
      await refresh();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function uploadDocument(reasonId: string, file: File) {
    try {
      const response = await fetch(
        `/api/absence-reasons/${reasonId}/attachments`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': file.type,
            'X-File-Name': encodeURIComponent(file.name),
          },
          body: file,
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message ?? 'Не удалось загрузить документ');
      }
      setError('Документ добавлен');
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
          <article key={item.id} className="panel attendance-record">
            <div className="lesson-content wide">
              <div className="lesson-top">
                {item.lesson.date.slice(0, 10)} · {item.lesson.lessonNumber}{' '}
                пара
              </div>
              <h3>{item.lesson.subject?.name ?? 'Занятие'}</h3>
              <p>{statusLabels[item.status] ?? item.status}</p>
              {item.confirmedAt && (
                <p className="muted">Вы подтвердили отметку</p>
              )}
              {item.disputes[0] && (
                <p className="muted">
                  Спор:{' '}
                  {item.disputes[0].status === 'PENDING'
                    ? 'на рассмотрении'
                    : item.disputes[0].status === 'APPROVED'
                      ? 'принят'
                      : item.disputes[0].status === 'REJECTED'
                        ? 'отклонён'
                        : 'нужны сведения'}
                  {item.disputes[0].decision
                    ? ` · ${item.disputes[0].decision}`
                    : ''}
                </p>
              )}
              {item.history.length > 0 && (
                <details className="mark-history">
                  <summary>История отметки</summary>
                  {item.history.map((change) => (
                    <p key={change.id} className="muted">
                      {new Date(change.createdAt).toLocaleString('ru-RU')} ·{' '}
                      {change.editor.lastName} {change.editor.firstName}:{' '}
                      {change.oldStatus
                        ? `${statusLabels[change.oldStatus] ?? change.oldStatus} → `
                        : ''}
                      {statusLabels[change.newStatus] ?? change.newStatus}
                    </p>
                  ))}
                </details>
              )}
            </div>
            <div className="row">
              {!item.confirmedAt && (
                <button
                  className="secondary"
                  onClick={() => void confirmMark(item.id)}
                >
                  Подтвердить
                </button>
              )}
              {item.disputes[0]?.status !== 'PENDING' && (
                <button
                  className="small-button"
                  onClick={() => setDisputeId(item.id)}
                >
                  Оспорить
                </button>
              )}
            </div>
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
            onChange={(e) => {
              setDate(e.target.value);
              setLessonId('');
            }}
            required
          />
        </label>
        <label>
          Период
          <select
            value={lessonId}
            onChange={(e) => setLessonId(e.target.value)}
          >
            <option value="">Весь день</option>
            {absenceLessons.map((item) => (
              <option key={item.id} value={item.id}>
                {item.lessonNumber} пара · {item.subject?.name ?? 'Занятие'}
              </option>
            ))}
          </select>
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
            <div key={item.id} className="reason-row">
              <p>
                {item.date.slice(0, 10)} · {item.category} ·{' '}
                {item.status === 'PENDING'
                  ? 'на проверке'
                  : item.status === 'APPROVED'
                    ? 'подтверждено'
                    : 'отклонено'}
              </p>
              {item.attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={`/api/attachments/${attachment.id}`}
                >
                  {attachment.fileName}
                </a>
              ))}
              <label>
                Прикрепить справку (PDF, JPG, PNG до 5 МБ)
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadDocument(item.id, file);
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
