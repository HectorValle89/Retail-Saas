import type { MetadataRoute } from 'next'
import { siteConfig } from '@/config/siteConfig'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.appName,
    short_name: 'Retail FF',
    description: siteConfig.appDescription,
    start_url: '/dashboard',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f8fafc',
    theme_color: '#0f172a',
    lang: 'es-MX',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    shortcuts: [
      {
        name: 'Asistencias',
        short_name: 'Asistencias',
        url: '/asistencias',
      },
      {
        name: 'Ventas',
        short_name: 'Ventas',
        url: '/ventas',
      },
      {
        name: 'Offline',
        short_name: 'Offline',
        url: '/offline',
      },
    ],
  }
}

