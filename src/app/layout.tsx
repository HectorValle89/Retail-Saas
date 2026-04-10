export const runtime = 'edge';
import type { Metadata, Viewport } from 'next';
import { Inter, Poppins } from 'next/font/google';
import Script from 'next/script';
import { siteConfig } from '@/config/siteConfig';
import 'bootstrap-icons/font/bootstrap-icons.css';
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
        <Script id="dev-pwa-reset" strategy="beforeInteractive">
          {`
            (function () {
              try {
                var hostname = window.location.hostname || '';
                var isLanHost =
                  hostname === 'localhost' ||
                  hostname === '127.0.0.1' ||
                  hostname === '0.0.0.0' ||
                  hostname.indexOf('192.168.') === 0 ||
                  hostname.indexOf('10.') === 0 ||
                  /^172\\.(1[6-9]|2\\d|3[0-1])\\./.test(hostname);

                if (!isLanHost) return;

                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(function (registrations) {
                    return Promise.all(registrations.map(function (registration) {
                      return registration.unregister();
                    }));
                  }).catch(function () {});
                }

                if ('caches' in window) {
                  caches.keys().then(function (keys) {
                    return Promise.all(keys.filter(function (key) {
                      return key.indexOf('retail-') === 0;
                    }).map(function (key) {
                      return caches.delete(key);
                    }));
                  }).catch(function () {});
                }
              } catch (error) {}
            })();
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}

