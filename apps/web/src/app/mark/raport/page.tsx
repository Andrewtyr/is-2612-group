'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { lessonLabel } from '@/lib/lesson-label';

type Lesson = {
  id: string;
  date: string;
  lessonNumber: number;
  startTime: string;
  status: string;
  subject: { name: string } | null;
};
type Member = {
  student: { id: string; firstName: string; lastName: string };
  attendance: { status: string } | null;
};
type AbsenceRow = {
  key: number;
  studentId: string;
  lessonIds: string[];
  status: 'ABSENT' | 'EXCUSED';
};

function today() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Novosibirsk',
  }).format(new Date());
}

function label(lesson: Lesson) {
  return `${lessonLabel(lesson.lessonNumber, lesson.subject?.name)} · ${lesson.subject?.name ?? 'Занятие'}`;
}

const statusLabels: Record<string, string> = {
  PRESENT: 'Был',
  ABSENT: 'Отсутствовал',
  EXCUSED: 'Уважительная',
  LATE: 'Опоздал',
  LEFT_EARLY: 'Ушёл раньше',
  EXEMPT: 'Освобождён',
  NEEDS_REVIEW: 'На проверке',
};

export default function RaportPage() {
  const [role, setRole] = useState('');
  const [date, setDate] = useState(today);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rosters, setRosters] = useState<Record<string, Member[]>>({});
  const [rows, setRows] = useState<AbsenceRow[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<{ role: string }>('/auth/me')
      .then((user) => setRole(user.role))
      .catch((error: Error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api<Lesson[]>(`/schedule/date/${date}`, { signal: controller.signal })
      .then(async (allLessons) => {
        const active = allLessons.filter(
          (lesson) => lesson.status !== 'CANCELLED',
        );
        const pairs = await Promise.all(
          active.map(
            async (lesson) =>
              [
                lesson.id,
                await api<Member[]>(`/lessons/${lesson.id}/attendance`, {
                  signal: controller.signal,
                }),
              ] as const,
          ),
        );
        if (controller.signal.aborted) return;
        setLessons(active);
        setSelectedIds([]);
        setRosters(Object.fromEntries(pairs));
        setRows([]);
        setConfirmed(false);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setMessage(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date]);

  const members = lessons.length ? (rosters[lessons[0].id] ?? []) : [];
  const selected = lessons.filter((lesson) => selectedIds.includes(lesson.id));
  const duplicateStudents = rows.some(
    (row, index) =>
      row.studentId &&
      rows.findIndex((other) => other.studentId === row.studentId) !== index,
  );
  const incomplete = rows.some(
    (row) =>
      !row.studentId || !row.lessonIds.some((id) => selectedIds.includes(id)),
  );
  const planned = selected.flatMap((lesson) =>
    (rosters[lesson.id] ?? []).map((member) => {
      const absence = rows.find(
        (row) =>
          row.studentId === member.student.id &&
          row.lessonIds.includes(lesson.id),
      );
      return {
        lessonId: lesson.id,
        studentId: member.student.id,
        status: absence?.status ?? 'PRESENT',
        previous: member.attendance?.status ?? null,
      };
    }),
  );
  const changes = planned.filter((entry) => entry.status !== entry.previous);

  function changeDate(value: string) {
    if (!value) return;
    setDate(value);
    setLoading(true);
    setLessons([]);
    setSelectedIds([]);
    setRosters({});
    setRows([]);
    setConfirmed(false);
    setMessage('');
  }

  function updateRow(key: number, patch: Partial<AbsenceRow>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
    setConfirmed(false);
  }

  async function save() {
    if (
      !confirmed ||
      !selectedIds.length ||
      incomplete ||
      duplicateStudents ||
      saving
    )
      return;
    setSaving(true);
    setMessage('');
    try {
      const result = await api<{ updated: number }>('/attendance/raport', {
        method: 'POST',
        body: JSON.stringify({
          date,
          lessonIds: selectedIds,
          absences: rows.map(({ studentId, lessonIds, status }) => ({
            studentId,
            lessonIds: lessonIds.filter((id) => selectedIds.includes(id)),
            status,
          })),
        }),
      });
      const refreshed = await Promise.all(
        lessons.map(
          async (lesson) =>
            [
              lesson.id,
              await api<Member[]>(`/lessons/${lesson.id}/attendance`),
            ] as const,
        ),
      );
      setRosters(Object.fromEntries(refreshed));
      setConfirmed(false);
      setMessage(`Сохранено изменений: ${result.updated}`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="shell">
      <Link className="back-link" href="/mark">
        ← Отметить группу
      </Link>
      <div className="page-head">
        <div>
          <h1>Рапортичка</h1>
          <p className="muted">
            Укажите отсутствующих; остальные будут отмечены как «Был».
          </p>
        </div>
      </div>
      {message && (
        <div className="feedback-toast" role="status">
          {message}
        </div>
      )}
      <section className="panel">
        {['ADMIN', 'CURATOR'].includes(role) && (
          <label className="raport-date">
            Дата занятий
            <input
              type="date"
              value={date}
              max={today()}
              onChange={(event) => changeDate(event.target.value)}
            />
          </label>
        )}
        <h2>Пары</h2>
        <p className="muted">
          Выберите только те пары, которые есть в рапортичке.
        </p>
        {loading && <p className="muted">Загружаю расписание и отметки…</p>}
        {!loading && !lessons.length && (
          <p className="muted">На этот день нет занятий.</p>
        )}
        <div className="raport-lessons">
          {lessons.map((lesson) => (
            <label key={lesson.id} className="raport-lesson">
              <input
                type="checkbox"
                checked={selectedIds.includes(lesson.id)}
                onChange={(event) => {
                  setSelectedIds((current) =>
                    event.target.checked
                      ? [...current, lesson.id]
                      : current.filter((id) => id !== lesson.id),
                  );
                  setConfirmed(false);
                }}
              />
              <span>
                {label(lesson)} · {lesson.startTime}
              </span>
            </label>
          ))}
        </div>
      </section>
      {!!lessons.length && (
        <section className="panel">
          <div className="section-title">
            <h2>Кого не было</h2>
            <button
              className="secondary"
              type="button"
              onClick={() => {
                setRows((current) => [
                  {
                    key: nextKey,
                    studentId: '',
                    lessonIds: [],
                    status: 'ABSENT',
                  },
                  ...current,
                ]);
                setNextKey((value) => value + 1);
                setConfirmed(false);
              }}
            >
              + Добавить ученика
            </button>
          </div>
          {!rows.length && (
            <p className="muted">
              Если отсутствующих нет, просто проверьте итог ниже.
            </p>
          )}
          {rows.map((row) => (
            <div className="raport-person" key={row.key}>
              <div className="row">
                <select
                  aria-label="Ученик"
                  value={row.studentId}
                  onChange={(event) =>
                    updateRow(row.key, { studentId: event.target.value })
                  }
                >
                  <option value="">Выберите ученика</option>
                  {members.map((member) => (
                    <option key={member.student.id} value={member.student.id}>
                      {member.student.lastName} {member.student.firstName}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Причина отсутствия"
                  value={row.status}
                  onChange={(event) =>
                    updateRow(row.key, {
                      status: event.target.value as AbsenceRow['status'],
                    })
                  }
                >
                  <option value="ABSENT">Без уважительной причины</option>
                  <option value="EXCUSED">Болезнь / уважительная</option>
                </select>
                <button
                  className="secondary raport-all-lessons"
                  type="button"
                  disabled={
                    selected.length === 0 ||
                    selected.every((lesson) => row.lessonIds.includes(lesson.id))
                  }
                  onClick={() =>
                    updateRow(row.key, {
                      lessonIds: selected.map((lesson) => lesson.id),
                    })
                  }
                >
                  Не был на всех выбранных парах
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    setRows((current) =>
                      current.filter((item) => item.key !== row.key),
                    );
                    setConfirmed(false);
                  }}
                >
                  Убрать
                </button>
              </div>
              <div className="raport-lessons">
                {selected.map((lesson) => (
                  <label className="raport-lesson" key={lesson.id}>
                    <input
                      type="checkbox"
                      checked={row.lessonIds.includes(lesson.id)}
                      onChange={(event) =>
                        updateRow(row.key, {
                          lessonIds: event.target.checked
                            ? [...row.lessonIds, lesson.id]
                            : row.lessonIds.filter((id) => id !== lesson.id),
                        })
                      }
                    />
                    <span>{label(lesson)}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {duplicateStudents && (
            <p className="error">Один ученик указан дважды.</p>
          )}
          {incomplete && (
            <p className="muted">
              Для каждого отсутствующего выберите ученика и хотя бы одну пару.
            </p>
          )}
        </section>
      )}
      {!!selected.length && (
        <section className="panel">
          <h2>Проверьте перед сохранением</h2>
          <div className="raport-summary">
            {selected.map((lesson) => {
              const marks = planned.filter(
                (entry) => entry.lessonId === lesson.id,
              );
              const absentNames = rows
                .filter((row) => row.lessonIds.includes(lesson.id))
                .map((row) => {
                  const student = members.find(
                    (member) => member.student.id === row.studentId,
                  )?.student;
                  return student
                    ? `${student.lastName} ${student.firstName}${row.status === 'EXCUSED' ? ' (уваж.)' : ''}`
                    : 'Ученик не выбран';
                });
              return (
                <div key={lesson.id}>
                  <strong>{label(lesson)}</strong>
                  <span>
                    Были:{' '}
                    {marks.filter((entry) => entry.status === 'PRESENT').length}
                  </span>
                  <span>
                    Не были:{' '}
                    {marks.filter((entry) => entry.status === 'ABSENT').length}
                  </span>
                  <span>
                    Уважительная:{' '}
                    {marks.filter((entry) => entry.status === 'EXCUSED').length}
                  </span>
                  <span>
                    Меняются прежние:{' '}
                    {
                      marks.filter(
                        (entry) =>
                          entry.previous && entry.status !== entry.previous,
                      ).length
                    }
                  </span>
                  {absentNames.length > 0 && (
                    <small className="raport-absent-names">
                      Не были: {absentNames.join(', ')}
                    </small>
                  )}
                </div>
              );
            })}
          </div>
          <p>
            Изменится отметок: <strong>{changes.length}</strong>. Уже
            выставленные отметки тоже будут приведены к этой рапортичке.
          </p>
          {changes.some((entry) => entry.previous) && (
            <details className="raport-old-changes">
              <summary>Показать прежние отметки, которые изменятся</summary>
              <ul>
                {changes
                  .filter((entry) => entry.previous)
                  .map((entry) => {
                    const lesson = lessons.find(
                      (item) => item.id === entry.lessonId,
                    );
                    const student = members.find(
                      (member) => member.student.id === entry.studentId,
                    )?.student;
                    return (
                      <li key={`${entry.lessonId}:${entry.studentId}`}>
                        {student?.lastName} {student?.firstName} ·{' '}
                        {lesson ? label(lesson) : 'Пара'}:{' '}
                        {statusLabels[entry.previous!] ?? entry.previous} →{' '}
                        {statusLabels[entry.status] ?? entry.status}
                      </li>
                    );
                  })}
              </ul>
            </details>
          )}
          <label className="raport-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Я проверил список, пары и причины отсутствия
          </label>
          <button
            className="primary"
            type="button"
            onClick={save}
            disabled={
              !confirmed ||
              incomplete ||
              duplicateStudents ||
              saving ||
              !selectedIds.length
            }
          >
            {saving ? 'Сохраняю…' : 'Сохранить рапортичку'}
          </button>
        </section>
      )}
    </main>
  );
}
