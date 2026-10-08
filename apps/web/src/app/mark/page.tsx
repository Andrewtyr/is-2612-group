'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type Lesson = {
  id: string;
  date: string;
  lessonNumber: number;
  startTime: string;
  endTime: string;
  status: string;
  subject: { name: string } | null;
};
type Member = {
  student: { id: string; firstName: string; lastName: string };
  attendance: { status: string } | null;
  preAbsent: boolean;
};

export default function MarkPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [copyFromId, setCopyFromId] = useState('');
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    api<Lesson[]>('/schedule/today')
      .then(setLessons)
      .catch((error: Error) => setMessage(error.message));
  }, []);

  async function open(lesson: Lesson) {
    setMessage('');
    setCopyFromId('');
    try {
      const roster = await api<Member[]>(`/lessons/${lesson.id}/attendance`);
      setSelected(lesson);
      setMembers(roster);
      setMarks(
        Object.fromEntries(
          roster
            .filter((member) => member.attendance)
            .map((member) => [member.student.id, member.attendance!.status]),
        ),
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function save() {
    if (!selected) return;
    const entries = members
      .filter((member) => marks[member.student.id])
      .map((member) => ({
        studentId: member.student.id,
        status: marks[member.student.id],
      }));
    if (!entries.length) return setMessage('Сначала выберите отметки');
    try {
      await api(`/lessons/${selected.id}/attendance`, {
        method: 'POST',
        body: JSON.stringify({ entries }),
      });
      await open(selected);
      setMessage('Отметки сохранены');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function copyFromLesson() {
    if (!selected || !copyFromId || copying) return;
    const source = lessons.find((lesson) => lesson.id === copyFromId);
    if (
      !source ||
      source.id === selected.id ||
      source.date.slice(0, 10) !== selected.date.slice(0, 10) ||
      source.status === 'CANCELLED'
    ) {
      setMessage('Можно копировать отметки только между парами одного дня.');
      return;
    }
    setCopying(true);
    try {
      const [sourceRoster, targetRoster] = await Promise.all([
        api<Member[]>(`/lessons/${source.id}/attendance`),
        api<Member[]>(`/lessons/${selected.id}/attendance`),
      ]);
      const target = new Map(
        targetRoster.map((member) => [member.student.id, member]),
      );
      const entries = sourceRoster
        .filter((member) => {
          const destination = target.get(member.student.id);
          return (
            member.attendance &&
            destination &&
            !destination.attendance &&
            !marks[member.student.id]
          );
        })
        .map((member) => ({
          studentId: member.student.id,
          status: member.attendance!.status,
        }));
      if (!entries.length) {
        setMessage(
          'Новых отметок для копирования нет. Уже выставленные отметки сохранены.',
        );
        return;
      }
      await api(`/lessons/${selected.id}/attendance`, {
        method: 'POST',
        body: JSON.stringify({
          entries,
          reason: `Скопировано с ${source.lessonNumber} пары`,
        }),
      });
      await open(selected);
      setMessage(
        `Скопировано ${entries.length} отметок с ${source.lessonNumber} пары. Уже выставленные отметки не изменены.`,
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setCopying(false);
    }
  }

  return (
    <main className="shell">
      <div className="page-head">
        <div>
          <Link className="back-link" href="/">
            ← Сегодня
          </Link>
          <h1>Отметить группу</h1>
          <p className="muted">Выберите пару и отметьте исключения</p>
        </div>
      </div>
      {message && (
        <div className="feedback-toast" role="status">
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setMessage('')}
            aria-label="Закрыть уведомление"
          >
            ×
          </button>
        </div>
      )}
      <div className="lessons">
        {lessons.map((lesson) => (
          <button
            key={lesson.id}
            className={`lesson lesson-button ${selected?.id === lesson.id ? 'chosen' : ''}`}
            onClick={() => open(lesson)}
            disabled={lesson.status === 'CANCELLED'}
          >
            <div className="lesson-time">
              <strong>{lesson.startTime}</strong>
              <span>{lesson.endTime}</span>
            </div>
            <div className="lesson-content">
              <div className="lesson-top">{lesson.lessonNumber} пара</div>
              <h3>{lesson.subject?.name ?? 'Занятие'}</h3>
            </div>
          </button>
        ))}
      </div>
      {selected && (
        <section className="panel">
          <div className="section-title">
            <h2>{selected.lessonNumber} пара · список группы</h2>
          </div>
          <button
            className="secondary"
            onClick={() =>
              setMarks(
                Object.fromEntries(
                  members.map((member) => [member.student.id, 'PRESENT']),
                ),
              )
            }
          >
            Все присутствуют
          </button>
          {lessons.some(
            (lesson) =>
              lesson.id !== selected.id &&
              lesson.date.slice(0, 10) === selected.date.slice(0, 10) &&
              lesson.status !== 'CANCELLED',
          ) && (
            <div className="copy-attendance">
              <label htmlFor="copy-from-lesson">
                Скопировать отметки с другой пары этого дня
              </label>
              <div className="row">
                <select
                  id="copy-from-lesson"
                  value={copyFromId}
                  onChange={(event) => setCopyFromId(event.target.value)}
                >
                  <option value="">Выберите пару</option>
                  {lessons
                    .filter(
                      (lesson) =>
                        lesson.id !== selected.id &&
                        lesson.date.slice(0, 10) ===
                          selected.date.slice(0, 10) &&
                        lesson.status !== 'CANCELLED',
                    )
                    .map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>
                        {lesson.lessonNumber} пара ·{' '}
                        {lesson.subject?.name ?? 'Занятие'}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="secondary"
                  onClick={copyFromLesson}
                  disabled={!copyFromId || copying}
                >
                  {copying ? 'Копирую…' : 'Скопировать'}
                </button>
              </div>
              <p className="muted">
                Копируются только отмеченные студенты. Отметки, уже выставленные
                на этой паре, сохранятся.
              </p>
            </div>
          )}
          <div className="roster">
            {members.map((member) => (
              <div key={member.student.id} className="roster-row">
                <span>
                  {member.student.lastName} {member.student.firstName}
                  {member.preAbsent && (
                    <small className="notice-tag">
                      {' '}
                      · сообщил об отсутствии
                    </small>
                  )}
                </span>
                <span
                  className="mark-choices"
                  role="group"
                  aria-label={`Посещаемость: ${member.student.lastName} ${member.student.firstName}`}
                >
                  {(
                    [
                      ['PRESENT', 'Был'],
                      ['LATE', 'Опоздал'],
                      ['ABSENT', 'Отсутствовал'],
                    ] as const
                  ).map(([status, label]) => (
                    <button
                      key={status}
                      type="button"
                      className={`mark-choice ${marks[member.student.id] === status ? 'active' : ''}`}
                      aria-pressed={marks[member.student.id] === status}
                      onClick={() =>
                        setMarks({ ...marks, [member.student.id]: status })
                      }
                    >
                      {marks[member.student.id] === status ? '✓ ' : ''}
                      {label}
                    </button>
                  ))}
                  <select
                    aria-label="Другой статус"
                    value={
                      [
                        'LEFT_EARLY',
                        'EXCUSED',
                        'EXEMPT',
                        'NEEDS_REVIEW',
                      ].includes(marks[member.student.id])
                        ? marks[member.student.id]
                        : ''
                    }
                    onChange={(event) =>
                      setMarks({
                        ...marks,
                        [member.student.id]: event.target.value,
                      })
                    }
                  >
                    <option value="">Ещё…</option>
                    <option value="LEFT_EARLY">Ушёл раньше</option>
                    <option value="EXCUSED">Уважительная</option>
                    <option value="EXEMPT">Освобождён</option>
                    <option value="NEEDS_REVIEW">На проверке</option>
                  </select>
                </span>
              </div>
            ))}
          </div>
          <button className="primary" onClick={save}>
            Сохранить отметки
          </button>
        </section>
      )}
    </main>
  );
}
