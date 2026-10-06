'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type Lesson = {
  id: string;
  lessonNumber: number;
  startTime: string;
  endTime: string;
  status: string;
  subject: { name: string } | null;
};
type Member = {
  student: { id: string; firstName: string; lastName: string };
  attendance: { status: string } | null;
};
const statuses = [
  ['PRESENT', 'Присутствует'],
  ['ABSENT', 'Отсутствует'],
  ['LATE', 'Опоздал'],
  ['LEFT_EARLY', 'Ушёл раньше'],
  ['EXCUSED', 'Уважительная'],
  ['EXEMPT', 'Освобождён'],
];

export default function MarkPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<Lesson[]>('/schedule/today')
      .then(setLessons)
      .catch((error: Error) => setMessage(error.message));
  }, []);

  async function open(lesson: Lesson) {
    setMessage('');
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
      {message && <p className="notice">{message}</p>}
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
          <div className="roster">
            {members.map((member) => (
              <label key={member.student.id} className="roster-row">
                <span>
                  {member.student.lastName} {member.student.firstName}
                </span>
                <select
                  value={marks[member.student.id] ?? ''}
                  onChange={(event) =>
                    setMarks({
                      ...marks,
                      [member.student.id]: event.target.value,
                    })
                  }
                >
                  <option value="">Не отмечен</option>
                  {statuses.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
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
