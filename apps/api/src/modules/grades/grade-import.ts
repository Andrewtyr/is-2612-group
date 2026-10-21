/** A grade's identity is student + normalized subject + date + ordinal within that date.
 * Source column indexes differ between PDF, XPS and Excel exports and cannot be used as identity.
 */
export type IncomingGrade = {
  studentId: string;
  subject: string;
  date: string; // ISO date
  columnIndex: number; // source ordering only
  value: string;
};

export type StoredGrade = {
  id: string;
  studentId: string;
  subject: string;
  date: Date | string;
  columnIndex: number;
  value: string;
};

export type GradeOperation =
  | {
      type: 'insert';
      entry: IncomingGrade;
      columnIndex: number;
      subject: string;
    }
  | { type: 'update'; id: string; value: string }
  | { type: 'unchanged' };

export function normalizeGradeSubject(subject: string) {
  return subject.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

function keySubject(studentId: string, subject: string) {
  return JSON.stringify([
    studentId,
    normalizeGradeSubject(subject)
      .replace(/^[\p{L}]{1,6}\.\s*\d{1,3}\s+/u, '')
      .toLocaleLowerCase('ru-RU')
      .replace(/ё/g, 'е'),
  ]);
}

function key(studentId: string, subject: string, date: string) {
  return JSON.stringify([keySubject(studentId, subject), date]);
}

function normalizedValue(value: string) {
  return value.trim().toLocaleLowerCase('ru-RU');
}

export function planGradeImport(
  incoming: IncomingGrade[],
  stored: StoredGrade[],
): GradeOperation[] {
  const storedByDay = new Map<string, StoredGrade[]>();
  const preferredSubject = new Map<string, string>();
  for (const entry of stored) {
    const identity = keySubject(entry.studentId, entry.subject);
    if (!preferredSubject.has(identity))
      preferredSubject.set(identity, entry.subject);
    const date =
      entry.date instanceof Date
        ? entry.date.toISOString().slice(0, 10)
        : entry.date.slice(0, 10);
    const k = key(entry.studentId, entry.subject, date);
    const list = storedByDay.get(k) ?? [];
    list.push(entry);
    storedByDay.set(k, list);
  }
  for (const list of storedByDay.values()) {
    list.sort(
      (a, b) => a.columnIndex - b.columnIndex || a.id.localeCompare(b.id),
    );
  }

  const incomingByDay = new Map<string, IncomingGrade[]>();
  for (const entry of incoming) {
    const item = { ...entry, subject: normalizeGradeSubject(entry.subject) };
    const k = key(item.studentId, item.subject, item.date);
    const list = incomingByDay.get(k) ?? [];
    list.push(item);
    incomingByDay.set(k, list);
  }
  const operations: GradeOperation[] = [];
  for (const [k, list] of incomingByDay) {
    list.sort((a, b) => a.columnIndex - b.columnIndex);
    const previous = storedByDay.get(k) ?? [];
    const occupied = new Set(previous.map((entry) => entry.columnIndex));
    let nextSlot = previous.length
      ? Math.max(...previous.map((entry) => entry.columnIndex)) + 1
      : 0;
    for (let index = 0; index < list.length; index++) {
      const item = list[index];
      const earlier = previous[index];
      if (earlier) {
        operations.push(
          normalizedValue(earlier.value) === normalizedValue(item.value)
            ? { type: 'unchanged' }
            : {
                type: 'update',
                id: earlier.id,
                value: normalizedValue(item.value),
              },
        );
      } else {
        while (occupied.has(nextSlot)) nextSlot++;
        occupied.add(nextSlot);
        operations.push({
          type: 'insert',
          entry: item,
          columnIndex: nextSlot,
          subject:
            previous[0]?.subject ??
            preferredSubject.get(keySubject(item.studentId, item.subject)) ??
            item.subject,
        });
      }
    }
    // Never remove old grades when a later export has blank or fewer cells.
  }
  return operations;
}
