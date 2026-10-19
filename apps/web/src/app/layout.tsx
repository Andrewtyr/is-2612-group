import type { Metadata } from 'next';
import './globals.css';
import './modern.css';
import Navigation from '@/components/navigation';

export const metadata: Metadata = {
  title: 'ИС-2612 — учебная группа',
  description: 'Расписание и посещаемость учебной группы',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <a className="skip-link" href="#main-content">
          Перейти к содержимому
        </a>
        <div className="app-frame">
          <Navigation />
          <div className="app-content" id="main-content" tabIndex={-1}>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
