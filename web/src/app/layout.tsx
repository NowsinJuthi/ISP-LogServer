import type { Metadata, Viewport } from 'next';
import BrandHead from '@/components/BrandHead';
import SiteFooter from '@/components/SiteFooter';
import { themeInitScript } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Log Server',
  description: 'MikroTik log server',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen flex flex-col">
        <BrandHead />
        <div className="flex-1 flex flex-col min-h-0">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
