'use client'

import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface LawyerQRSectionProps {
  lawyerId: string
  lawyerSlug: string
  lawyerName: string
}

export function LawyerQRSection({ lawyerId, lawyerSlug, lawyerName }: LawyerQRSectionProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [stats, setStats] = useState({ clicks: 0, bookings: 0, conversionRate: 0 })

  const bookingUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/book/${lawyerSlug}`
  const shortCode = lawyerSlug.slice(0, 8).toUpperCase()

  useEffect(() => {
    generateQRCode()
    // In a real app, fetch stats from API
    setStats({
      clicks: Math.floor(Math.random() * 100) + 20,
      bookings: Math.floor(Math.random() * 30) + 5,
      conversionRate: 25.5
    })
  }, [lawyerSlug, bookingUrl])

  const generateQRCode = async () => {
    try {
      const url = await QRCode.toDataURL(bookingUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#1E3A5F',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'H'
      })
      setQrDataUrl(url)
    } catch (err) {
      console.error('Error generating QR code:', err)
    }
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(bookingUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareLink = async () => {
    if (navigator.share) {
      await navigator.share({
        title: `Agendar cita con ${lawyerName}`,
        text: `Agenda tu consulta legal con ${lawyerName}`,
        url: bookingUrl
      })
    } else {
      copyLink()
    }
  }

  const downloadQR = async (format: 'png' | 'svg') => {
    if (format === 'png' && qrDataUrl) {
      const link = document.createElement('a')
      link.download = `qr-${lawyerSlug}.png`
      link.href = qrDataUrl
      link.click()
    } else if (format === 'svg') {
      try {
        const svgString = await QRCode.toString(bookingUrl, {
          type: 'svg',
          width: 300,
          margin: 2,
          color: {
            dark: '#1E3A5F',
            light: '#FFFFFF'
          }
        })
        const blob = new Blob([svgString], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.download = `qr-${lawyerSlug}.svg`
        link.href = url
        link.click()
        URL.revokeObjectURL(url)
      } catch (err) {
        console.error('Error generating SVG:', err)
      }
    }
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <LinkIcon className="w-5 h-5 text-accent-500" />
        Mi Enlace de Agendamiento
      </h3>

      {/* URL Display */}
      <div className="bg-gray-50 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-foreground-secondary">Tu enlace personalizado:</span>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm bg-white px-3 py-2 rounded-lg border border-border truncate">
            {bookingUrl}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={copyLink}
            className="shrink-0"
          >
            {copied ? (
              <CheckIcon className="w-4 h-4 text-success-500" />
            ) : (
              <CopyIcon className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={shareLink}
            className="shrink-0"
          >
            <ShareIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* QR Code */}
      <div className="flex flex-col md:flex-row gap-6 items-start">
        <div className="bg-white p-4 rounded-xl border border-border shadow-sm">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR Code" className="w-48 h-48" />
          ) : (
            <div className="w-48 h-48 bg-gray-100 animate-pulse rounded" />
          )}
          <p className="text-center text-xs text-foreground-secondary mt-2">
            Codigo: {shortCode}
          </p>
        </div>

        <div className="flex-1 space-y-4">
          <div>
            <h4 className="font-medium text-foreground mb-2">Tu Codigo QR</h4>
            <p className="text-sm text-foreground-secondary">
              Escanea este codigo con cualquier telefono para acceder directamente a tu pagina de agendamiento.
              Descargalo para tu tarjeta de presentacion, firma de email o materiales impresos.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadQR('png')}>
              <DownloadIcon className="w-4 h-4 mr-2" />
              PNG
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadQR('svg')}>
              <DownloadIcon className="w-4 h-4 mr-2" />
              SVG
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <PrinterIcon className="w-4 h-4 mr-2" />
              Imprimir
            </Button>
          </div>

          {/* Stats */}
          <div className="bg-accent-50 rounded-xl p-4 mt-4">
            <h4 className="text-sm font-medium text-accent-700 mb-3 flex items-center gap-2">
              <ChartIcon className="w-4 h-4" />
              Estadisticas del Enlace
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-2xl font-bold text-accent-600">{stats.clicks}</p>
                <p className="text-xs text-accent-600/70">Clicks</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-accent-600">{stats.bookings}</p>
                <p className="text-xs text-accent-600/70">Citas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-accent-600">{stats.conversionRate}%</p>
                <p className="text-xs text-accent-600/70">Conversion</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

// Icons
function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  )
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  )
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )
}

function PrinterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
    </svg>
  )
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}
