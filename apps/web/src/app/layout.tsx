import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ИС-2612 — учебная группа',
  description: 'Расписание и посещаемость учебной группы',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
