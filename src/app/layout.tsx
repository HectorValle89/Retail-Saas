import type { Metadata, Viewport } from 'next';
import { Inter, Poppins } from 'next/font/google';
import { AppRuntime } from '@/components/app/AppRuntime';
import { siteConfig } from '@/config/siteConfig';
import 'leaflet/dist/leaflet.css';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const poppins = Poppins({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-poppins',
  weight: ['500', '600', '700'],
});

export const metadata: Metadata = {
  title: siteConfig.seo.siteTitle,
  description: siteConfig.seo.defaultDescription,
  applicationName: siteConfig.appName,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: siteConfig.appName,
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: siteConfig.seo.siteTitle,
    description: siteConfig.seo.defaultDescription,
    locale: siteConfig.seo.locale,
    siteName: siteConfig.appName,
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#2CB67D',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${poppins.variable}`}>
      <body className={inter.className}>
        {children}
        <AppRuntime />
      </body>
    </html>
  );
}
