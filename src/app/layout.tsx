import type { Metadata, Viewport } from 'next'
import { AuthSessionMonitor } from '@/components/auth/AuthSessionMonitor'
import { PwaBootstrap } from '@/components/pwa/PwaBootstrap'
import { siteConfig } from '@/config/siteConfig'
import './globals.css'

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
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f172a',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body>
        {children}
        <AuthSessionMonitor />
        <PwaBootstrap />
      </body>
    </html>
  )
}
