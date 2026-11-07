import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'STOICS · Secret Room Manager',
  description:
    'The STOICS guild command center. Build balanced parties, track attendance, and make every run count.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
