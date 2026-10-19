import { existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';

export type ExportGrade = { subject: string; date: Date; value: string };

function fontPath() {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf',
    'C:\\Windows\\Fonts\\arial.ttf',
  ];
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error('Не найден шрифт для печати оценок');
  return found;
}

function shortDate(date: Date) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC' }).format(date);
}

export async function renderStudentGradesPdf(
  studentName: string,
  grades: ExportGrade[],
): Promise<Buffer> {
  const document = new PDFDocument({
    size: 'A4',
    margin: 44,
    info: { Title: `Оценки — ${studentName}`, Author: 'ИС-2612' },
  });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
  document.font(fontPath());
  document.fontSize(18).fillColor('#17324d').text('Оценки ученика');
  document.moveDown(0.25).fontSize(12).text(studentName);
  document
    .moveDown(0.2)
    .fontSize(9)
    .fillColor('#607285')
    .text(`Дата печати: ${shortDate(new Date())}`);
  document.moveDown(1.2);

  const subjects = new Map<string, ExportGrade[]>();
  for (const grade of grades) {
    const entries = subjects.get(grade.subject) ?? [];
    entries.push(grade);
    subjects.set(grade.subject, entries);
  }
  if (!subjects.size) {
    document.fontSize(11).fillColor('#17324d').text('Оценок пока нет.');
  } else {
    for (const [subject, entries] of subjects) {
      for (let offset = 0; offset < entries.length; offset += 32) {
        const current = entries.slice(offset, offset + 32);
        const subjectLabel = offset ? `${subject} (продолжение)` : subject;
        const subjectHeight = document
          .fontSize(10)
          .heightOfString(subjectLabel, { width: 170 });
        const contentHeight = Math.max(
          subjectHeight,
          Math.ceil(current.length / 4) * 39,
        );
        if (document.y + contentHeight + 22 > document.page.height - 44) {
          document.addPage();
        }
        const y = document.y;
        document
          .rect(44, y - 6, document.page.width - 88, contentHeight + 17)
          .fill('#f3f7fa');
        document
          .fontSize(10)
          .fillColor('#17324d')
          .text(subjectLabel, 52, y + 5, { width: 170 });
        current.forEach((entry, index) => {
          const x = 238 + (index % 4) * 77;
          const cellY = y + Math.floor(index / 4) * 39;
          document
            .fontSize(8)
            .fillColor('#607285')
            .text(shortDate(entry.date), x, cellY, {
              width: 72,
              align: 'center',
            });
          document
            .fontSize(13)
            .fillColor(entry.value === 'нб' ? '#a05227' : '#17324d')
            .text(entry.value, x, cellY + 13, {
              width: 72,
              align: 'center',
            });
        });
        document.y = y + contentHeight + 17;
      }
    }
  }
  document.end();
  return finished;
}
