'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type Dispute = {
  id: string;
  comment: string;
  student: { firstName: string; lastName: string };
  attendance: {
    status: string;
    lesson: { date: string; subject: { name: string } | null };
  };
};
type Reason = {
  id: string;
  category: string;
  comment: string | null;
  date: string;
  student: { firstName: string; lastName: string };
  attachments: { id: string; fileName: string }[];
};
type GroupStat = {
  student: { id: string; firstName: string; lastName: string };
  summary: {
    total: number;
    attended: number;
    missed: number;
    late: number;
    percent: number;
  };
};
type SyncState = { lastSuccess: string | null; lastError: string | null };
type Member = {
  user: {
    id: string;
    login: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
    role: string;
    status: string;
  };
};
type EditableLesson = {
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
type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
  user: { firstName: string; lastName: string } | null;
};
const auditNames: Record<string, string> = {
  USER_CREATE: 'Создан участник',
  USER_IMPORT: 'Импортирован участник',
  USER_UPDATE: 'Изменён участник',
  USER_ROLE_CHANGE: 'Изменена роль',
  ATTENDANCE_MARK: 'Изменена отметка',
  ATTENDANCE_CONFIRM: 'Отметка подтверждена студентом',
  DISPUTE_RESOLVE: 'Рассмотрен спор',
  ABSENCE_REASON_CREATE: 'Сообщено об отсутствии',
  ABSENCE_REASON_REVIEW: 'Рассмотрена причина',
  LESSON_CREATE: 'Добавлена пара',
  LESSON_UPDATE: 'Изменена пара',
  SCHEDULE_OFFICIAL_CHANGE: 'Изменение от академии',
};

function localDate() {
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Novosibirsk',
  }).format(new Date());
}

export default function ManagePage() {
  const [tab, setTab] = useState<
    'overview' | 'lessons' | 'edit' | 'users' | 'audit'
  >('overview');
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [stats, setStats] = useState<GroupStat[]>([]);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentRole, setCurrentRole] = useState('');
  const [editDate, setEditDate] = useState(localDate);
  const [editableLessons, setEditableLessons] = useState<EditableLesson[]>([]);
  const [editId, setEditId] = useState('');
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [editForm, setEditForm] = useState({
    subject: '',
    teacher: '',
    room: '',
    building: '',
    subgroup: '',
    startTime: '',
    endTime: '',
    status: 'PLANNED',
    reason: '',
  });
  const [message, setMessage] = useState('');
  const [disputeMarks, setDisputeMarks] = useState<Record<string, string>>({});
  const [lesson, setLesson] = useState({
    date: '',
    lessonNumber: 1,
    subject: '',
    teacher: '',
    room: '',
    startTime: '08:00',
    endTime: '09:30',
    reason: 'Ручное добавление',
  });
  const [user, setUser] = useState({
    login: '',
    firstName: '',
    lastName: '',
    middleName: '',
    password: '',
    role: 'STUDENT',
  });

  async function refresh() {
    try {
      const [
        newDisputes,
        newReasons,
        groupStats,
        currentSync,
        groupMembers,
        me,
      ] = await Promise.all([
        api<Dispute[]>('/curator/disputes'),
        api<Reason[]>('/curator/absence-reasons'),
        api<GroupStat[]>('/statistics/group'),
        api<SyncState | null>('/schedule/sync/status'),
        api<Member[]>('/users/manage'),
        api<{ role: string }>('/auth/me'),
      ]);
      setDisputes(newDisputes);
      setReasons(newReasons);
      setStats(groupStats);
      setSyncState(currentSync);
      setMembers(groupMembers);
      setCurrentRole(me.role);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (tab !== 'edit') return;
    api<EditableLesson[]>(`/schedule/date/${editDate}`)
      .then(setEditableLessons)
      .catch((error: Error) => setMessage(error.message));
  }, [editDate, tab]);

  useEffect(() => {
    if (tab !== 'audit') return;
    api<AuditEntry[]>('/audit')
      .then(setAuditEntries)
      .catch((error: Error) => setMessage(error.message));
  }, [tab]);

  function selectEdit(id: string) {
    setEditId(id);
    const selected = editableLessons.find((item) => item.id === id);
    if (!selected) return;
    setEditForm({
      subject: selected.subject?.name ?? '',
      teacher: selected.teacher?.name ?? '',
      room: selected.room ?? '',
      building: selected.building ?? '',
      subgroup: selected.subgroup,
      startTime: selected.startTime,
      endTime: selected.endTime,
      status: selected.status,
      reason: '',
    });
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editId) return;
    try {
      await api(`/schedule/lessons/${editId}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      setMessage('Изменение занятия сохранено в истории');
      setEditableLessons(
        await api<EditableLesson[]>(`/schedule/date/${editDate}`),
      );
      setEditId('');
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function createLesson(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api('/schedule/lessons', {
        method: 'POST',
        body: JSON.stringify(lesson),
      });
      setMessage('Занятие добавлено');
      setLesson({
        ...lesson,
        lessonNumber: lesson.lessonNumber + 1,
        subject: '',
        room: '',
      });
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api('/users', { method: 'POST', body: JSON.stringify(user) });
      setMessage('Пользователь создан. Передайте ему временный пароль лично.');
      setUser({
        login: '',
        firstName: '',
        lastName: '',
        middleName: '',
        password: '',
        role: 'STUDENT',
      });
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function updateMember(
    id: string,
    change: { role?: string; status?: string },
  ) {
    try {
      await api(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(change),
      });
      setMessage('Данные участника обновлены');
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function reviewReason(id: string, status: string) {
    try {
      await api(`/curator/absence-reasons/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function resolveDispute(id: string, status: string) {
    const decision = window.prompt('Напишите решение по спору');
    if (!decision) return;
    try {
      await api(`/curator/disputes/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          decision,
          attendanceStatus:
            status === 'APPROVED' ? disputeMarks[id] : undefined,
        }),
      });
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function syncSchedule() {
    setMessage('Проверяем сайт академии…');
    try {
      const result = await api<{ lessons: number }>('/schedule/sync', {
        method: 'POST',
      });
      setMessage(
        `Расписание проверено: ${result.lessons} занятий в ближайшие дни`,
      );
      await refresh();
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
          <h1>Управление</h1>
          <p className="muted">Группа ИС-2612</p>
        </div>
      </div>
      {message && <p className="notice">{message}</p>}
      <div className="tabs">
        <button
          className={tab === 'overview' ? 'active' : ''}
          onClick={() => setTab('overview')}
        >
          Обзор
        </button>
        <button
          className={tab === 'lessons' ? 'active' : ''}
          onClick={() => setTab('lessons')}
        >
          Добавить пару
        </button>
        <button
          className={tab === 'edit' ? 'active' : ''}
          onClick={() => setTab('edit')}
        >
          Изменить пару
        </button>
        <button
          className={tab === 'users' ? 'active' : ''}
          onClick={() => setTab('users')}
        >
          Участники
        </button>
        <button
          className={tab === 'audit' ? 'active' : ''}
          onClick={() => setTab('audit')}
        >
          Журнал
        </button>
      </div>
      {tab === 'overview' && (
        <>
          <div className="panel">
            <h3>Расписание академии</h3>
            <p className="muted">
              {syncState?.lastSuccess
                ? `Последняя проверка: ${new Date(syncState.lastSuccess).toLocaleString('ru-RU')}`
                : 'Ещё не обновлялось'}
            </p>
            {syncState?.lastError && (
              <p className="error">Последняя ошибка: {syncState.lastError}</p>
            )}
            <button className="secondary" onClick={syncSchedule}>
              Обновить расписание сейчас
            </button>
          </div>
          <div className="section-title">
            <h2>Спорные отметки</h2>
            <span>{disputes.length}</span>
          </div>
          {disputes.length === 0 && (
            <div className="empty">Новых споров нет.</div>
          )}
          {disputes.map((item) => (
            <article className="panel" key={item.id}>
              <h3>
                {item.student.lastName} {item.student.firstName}
              </h3>
              <p className="muted">
                {item.attendance.lesson.date.slice(0, 10)} ·{' '}
                {item.attendance.lesson.subject?.name} ·{' '}
                {item.attendance.status}
              </p>
              <p>{item.comment}</p>
              <label className="review-label">
                Исправить отметку
                <select
                  value={disputeMarks[item.id] ?? ''}
                  onChange={(event) =>
                    setDisputeMarks({
                      ...disputeMarks,
                      [item.id]: event.target.value,
                    })
                  }
                >
                  <option value="">Без изменения отметки</option>
                  <option value="PRESENT">Присутствовал</option>
                  <option value="ABSENT">Отсутствовал</option>
                  <option value="LATE">Опоздал</option>
                  <option value="EXCUSED">Уважительная причина</option>
                </select>
              </label>
              <div className="row">
                <button
                  className="secondary"
                  onClick={() => resolveDispute(item.id, 'APPROVED')}
                >
                  Принять
                </button>
                <button
                  className="small-button"
                  onClick={() => resolveDispute(item.id, 'REJECTED')}
                >
                  Отклонить
                </button>
              </div>
            </article>
          ))}
          <div className="section-title">
            <h2>Причины отсутствия</h2>
            <span>{reasons.length}</span>
          </div>
          {reasons.length === 0 && (
            <div className="empty">Новых причин нет.</div>
          )}
          {reasons.map((item) => (
            <article className="panel" key={item.id}>
              <h3>
                {item.student.lastName} {item.student.firstName}
              </h3>
              <p>
                {item.date.slice(0, 10)} · {item.category}
              </p>
              <p className="muted">{item.comment}</p>
              {item.attachments.map((attachment) => (
                <p key={attachment.id}>
                  <a href={`/api/attachments/${attachment.id}`}>
                    {attachment.fileName}
                  </a>
                </p>
              ))}
              <div className="row">
                <button
                  className="secondary"
                  onClick={() => reviewReason(item.id, 'APPROVED')}
                >
                  Подтвердить
                </button>
                <button
                  className="small-button"
                  onClick={() => reviewReason(item.id, 'REJECTED')}
                >
                  Отклонить
                </button>
              </div>
            </article>
          ))}
          <div className="section-title">
            <h2>Статистика группы</h2>
          </div>
          <div className="panel table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Студент</th>
                  <th>Всего</th>
                  <th>Посещено</th>
                  <th>Пропущено</th>
                  <th>Опозданий</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((item) => (
                  <tr key={item.student.id}>
                    <td>
                      {item.student.lastName} {item.student.firstName}
                    </td>
                    <td>{item.summary.total}</td>
                    <td>{item.summary.attended}</td>
                    <td>{item.summary.missed}</td>
                    <td>{item.summary.late}</td>
                    <td>{item.summary.percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === 'lessons' && (
        <form className="panel form-grid" onSubmit={createLesson}>
          <label>
            Дата
            <input
              type="date"
              required
              value={lesson.date}
              onChange={(e) => setLesson({ ...lesson, date: e.target.value })}
            />
          </label>
          <label>
            Номер пары
            <input
              type="number"
              min="1"
              max="12"
              required
              value={lesson.lessonNumber}
              onChange={(e) =>
                setLesson({ ...lesson, lessonNumber: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Начало
            <input
              type="time"
              required
              value={lesson.startTime}
              onChange={(e) =>
                setLesson({ ...lesson, startTime: e.target.value })
              }
            />
          </label>
          <label>
            Конец
            <input
              type="time"
              required
              value={lesson.endTime}
              onChange={(e) =>
                setLesson({ ...lesson, endTime: e.target.value })
              }
            />
          </label>
          <label className="full">
            Предмет
            <input
              required
              value={lesson.subject}
              onChange={(e) =>
                setLesson({ ...lesson, subject: e.target.value })
              }
            />
          </label>
          <label>
            Преподаватель
            <input
              value={lesson.teacher}
              onChange={(e) =>
                setLesson({ ...lesson, teacher: e.target.value })
              }
            />
          </label>
          <label>
            Кабинет
            <input
              value={lesson.room}
              onChange={(e) => setLesson({ ...lesson, room: e.target.value })}
            />
          </label>
          <label className="full">
            Причина ручного добавления
            <input
              required
              value={lesson.reason}
              onChange={(e) => setLesson({ ...lesson, reason: e.target.value })}
            />
          </label>
          <button className="primary">Добавить занятие</button>
        </form>
      )}
      {tab === 'edit' && (
        <section className="panel">
          <h3>Ручная корректировка</h3>
          <p className="muted">
            Каждая правка сохраняется в истории расписания.
          </p>
          <div className="form-grid">
            <label>
              Дата
              <input
                type="date"
                value={editDate}
                onChange={(event) => {
                  setEditDate(event.target.value);
                  setEditId('');
                }}
              />
            </label>
            <label>
              Занятие
              <select
                value={editId}
                onChange={(event) => selectEdit(event.target.value)}
              >
                <option value="">Выберите пару</option>
                {editableLessons.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.lessonNumber} пара · {item.subject?.name ?? 'Занятие'}{' '}
                    · {item.subgroup || 'вся группа'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {editId && (
            <form className="form-grid" onSubmit={saveEdit}>
              <label>
                Статус
                <select
                  value={editForm.status}
                  onChange={(event) =>
                    setEditForm({ ...editForm, status: event.target.value })
                  }
                >
                  <option value="PLANNED">По расписанию</option>
                  <option value="CHANGED">Изменена</option>
                  <option value="CANCELLED">Отменена</option>
                  <option value="ADDED">Добавлена</option>
                </select>
              </label>
              <label>
                Кабинет
                <input
                  value={editForm.room}
                  onChange={(event) =>
                    setEditForm({ ...editForm, room: event.target.value })
                  }
                />
              </label>
              <label>
                Начало
                <input
                  type="time"
                  value={editForm.startTime}
                  onChange={(event) =>
                    setEditForm({ ...editForm, startTime: event.target.value })
                  }
                />
              </label>
              <label>
                Конец
                <input
                  type="time"
                  value={editForm.endTime}
                  onChange={(event) =>
                    setEditForm({ ...editForm, endTime: event.target.value })
                  }
                />
              </label>
              <label className="full">
                Предмет
                <input
                  value={editForm.subject}
                  onChange={(event) =>
                    setEditForm({ ...editForm, subject: event.target.value })
                  }
                />
              </label>
              <label className="full">
                Преподаватель
                <input
                  value={editForm.teacher}
                  onChange={(event) =>
                    setEditForm({ ...editForm, teacher: event.target.value })
                  }
                />
              </label>
              <label className="full">
                Причина изменения
                <input
                  required
                  value={editForm.reason}
                  onChange={(event) =>
                    setEditForm({ ...editForm, reason: event.target.value })
                  }
                />
              </label>
              <button className="primary">Сохранить изменение</button>
            </form>
          )}
        </section>
      )}
      {tab === 'users' && (
        <>
          <form className="panel form-grid" onSubmit={createUser}>
            <label>
              Фамилия
              <input
                required
                value={user.lastName}
                onChange={(e) => setUser({ ...user, lastName: e.target.value })}
              />
            </label>
            <label>
              Имя
              <input
                required
                value={user.firstName}
                onChange={(e) =>
                  setUser({ ...user, firstName: e.target.value })
                }
              />
            </label>
            <label>
              Отчество
              <input
                value={user.middleName}
                onChange={(e) =>
                  setUser({ ...user, middleName: e.target.value })
                }
              />
            </label>
            <label>
              Логин
              <input
                required
                value={user.login}
                onChange={(e) => setUser({ ...user, login: e.target.value })}
              />
            </label>
            <label>
              Роль
              <select
                value={user.role}
                onChange={(e) => setUser({ ...user, role: e.target.value })}
              >
                <option value="STUDENT">Студент</option>
                <option value="HEAD">Староста</option>
                <option value="DEPUTY">Заместитель старосты</option>
                {currentRole === 'ADMIN' && (
                  <option value="CURATOR">Куратор</option>
                )}
              </select>
            </label>
            <label className="full">
              Временный пароль (минимум 12 символов)
              <input
                required
                type="password"
                minLength={12}
                value={user.password}
                onChange={(e) => setUser({ ...user, password: e.target.value })}
              />
            </label>
            <button className="primary">Создать пользователя</button>
          </form>
          <div className="section-title">
            <h2>Список группы</h2>
            <span>{members.length}</span>
          </div>
          <div className="panel">
            {members.map(({ user: member }) => (
              <div key={member.id} className="member-row">
                <div>
                  <strong>
                    {member.lastName} {member.firstName}{' '}
                    {member.middleName ?? ''}
                  </strong>
                  <span className="muted">
                    {member.login} ·{' '}
                    {member.status === 'BLOCKED' ? 'заблокирован' : 'активен'}
                  </span>
                </div>
                {member.role !== 'ADMIN' && (
                  <div className="row">
                    <select
                      value={member.role}
                      onChange={(event) =>
                        void updateMember(member.id, {
                          role: event.target.value,
                        })
                      }
                    >
                      <option value="STUDENT">Студент</option>
                      <option value="HEAD">Староста</option>
                      <option value="DEPUTY">Заместитель</option>
                      {currentRole === 'ADMIN' && (
                        <option value="CURATOR">Куратор</option>
                      )}
                    </select>
                    <button
                      className="small-button"
                      onClick={() =>
                        void updateMember(member.id, {
                          status:
                            member.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE',
                        })
                      }
                    >
                      {member.status === 'ACTIVE'
                        ? 'Заблокировать'
                        : 'Восстановить'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {tab === 'audit' && (
        <section className="panel">
          <h3>Последние действия</h3>
          {auditEntries.length === 0 && (
            <p className="muted">Записей пока нет.</p>
          )}
          {auditEntries.map((entry) => (
            <div key={entry.id} className="change-row">
              <strong>{auditNames[entry.action] ?? entry.action}</strong>
              <span className="muted">
                {new Date(entry.createdAt).toLocaleString('ru-RU')} ·{' '}
                {entry.user
                  ? `${entry.user.lastName} ${entry.user.firstName}`
                  : 'Система'}
              </span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
