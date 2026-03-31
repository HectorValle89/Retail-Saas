'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { lockBodyScroll } from '@/lib/ui/bodyScrollLock'

interface NativeCameraSelfieDialogProps {
  open: boolean
  title: string
  description: string
  onClose: () => void
  onCapture: (file: File) => Promise<void>
  facingMode?: 'user' | 'environment'
  captureLabel?: string
}

export function NativeCameraSelfieDialog({
  open,
  title,
  description,
  onClose,
  onCapture,
  facingMode = 'user',
  captureLabel = 'Capturar selfie',
}: NativeCameraSelfieDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false
    const unlockBodyScroll = lockBodyScroll()
    setError(null)
    setIsPreparing(true)

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Este navegador no soporta captura nativa con camara.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
      })

      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    }

    void startCamera()
      .catch((cameraError) => {
        if (!cancelled) {
          setError(
            cameraError instanceof Error
              ? cameraError.message
              : 'No fue posible acceder a la camara del dispositivo.'
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPreparing(false)
        }
      })

    return () => {
      unlockBodyScroll()
      cancelled = true
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.srcObject = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }
  }, [open])

  const handleTakePhoto = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas) {
      setError('La camara aun no esta lista para capturar.')
      return
    }

    const width = video.videoWidth
    const height = video.videoHeight

    if (!width || !height) {
      setError('No fue posible obtener la imagen de la camara.')
      return
    }

    const context = canvas.getContext('2d')

    if (!context) {
      setError('No fue posible preparar la captura.')
      return
    }

    canvas.width = width
    canvas.height = height
    context.drawImage(video, 0, 0, width, height)
    setIsCapturing(true)
    setError(null)

    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (value) => {
            if (!value) {
              reject(new Error('No fue posible capturar la selfie.'))
              return
            }

            resolve(value)
          },
          'image/jpeg',
          0.92
        )
      })

      const file = new File([blob], `attendance-selfie-${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      })

      await onCapture(file)
      onClose()
    } catch (captureError) {
      setError(
        captureError instanceof Error
          ? captureError.message
          : 'No fue posible procesar la captura de la camara.'
      )
    } finally {
      setIsCapturing(false)
    }
  }

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            aria-label="Cerrar camara"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path d="M6 6l12 12" strokeLinecap="round" />
              <path d="M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-950">
            <video ref={videoRef} className="aspect-[4/5] w-full object-cover" autoPlay muted playsInline />
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {error && (
            <p className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={handleTakePhoto}
              isLoading={isPreparing || isCapturing}
            >
              {captureLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
