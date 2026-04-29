import './globals.css';
import 'leaflet/dist/leaflet.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { Inter, Poppins } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import { AppRuntime } from '@/components/app/AppRuntime'
import { siteConfig } from '@/config/siteConfig'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
});

export const metadata: Metadata = {
  title: siteConfig.appName,
  applicationName: siteConfig.appName,
  appleWebApp: {
    capable: true,
    title: siteConfig.appName,
    statusBarStyle: 'default',
  },
  description: siteConfig.appDescription,
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
      <body>
        {children}
        <AppRuntime />
      </body>
    </html>
  );
}
