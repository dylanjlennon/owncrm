import './globals.css';
import type { Metadata, Viewport } from 'next';
import { APP_NAME } from '@/lib/config';

export const metadata: Metadata = { title: APP_NAME, robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
