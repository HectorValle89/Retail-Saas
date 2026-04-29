'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { getCameraPermissionRecoveryState } from '@/lib/device/permissionRecovery'
import { lockBodyScroll } from '@/lib/ui/bodyScrollLock'

interface NativeCameraSelfieDialogProps {
  open: boolean
  title: string
  description: string
  onClose: () => void
  onCapture: (file: File) => Promise<void>
  facingMode?: 'user' | 'environment'
  captureLabel?: string
  onRetryPermissions?: () => void | Promise<void>
}

export function NativeCameraSelfieDialog({
  open,
  title,
  description,
  onClose,
  onCapture,
  facingMode = 'user',
  captureLabel = 'Capturar selfie',
  onRetryPermissions,
}: NativeCameraSelfieDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraErrorSource, setCameraErrorSource] = useState<unknown>(null)
  const [retryToken, setRetryToken] = useState(0)
  const [currentFacingMode, setCurrentFacingMode] = useState<'user' | 'environment'>(facingMode)

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false
    const unlockBodyScroll = lockBodyScroll()
    setError(null)
    setCameraErrorSource(null)
    setIsPreparing(true)

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Este navegador no soporta captura nativa con camara.')
      }

      let stream: MediaStream
      try {
        // Intentar modo exacto primero para ser mas rudos con la eleccion
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { exact: currentFacingMode },
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
        })
      } catch (e) {
        console.warn('Fallo getUserMedia con exact facingMode, intentando ideal...', e)
        // Fallback a modo ideal si exact falla
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: currentFacingMode,
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
        })
      }

      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try {
          await videoRef.current.play()
        } catch (e) {
          console.error("Video play failed", e)
        }
      }
    }

    void startCamera()
      .catch((cameraError) => {
        if (!cancelled) {
          setCameraErrorSource(cameraError)
          setError(getCameraPermissionRecoveryState(cameraError).message)
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
  }, [open, currentFacingMode, retryToken])

  const toggleCamera = () => {
    setCurrentFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'))
  }

  const recoveryState = error ? getCameraPermissionRecoveryState(cameraErrorSource ?? new Error(error)) : null

  const isNotAllowedError = (err: unknown): boolean => {
    const name = err instanceof DOMException ? err.name : err instanceof Error ? err.name : ''
    return name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError'
  }

  const handleRetryPermissions = async () => {
    // Si el permiso fue denegado permanentemente, el retry no funciona.
    // Informar al usuario que debe resetearlo manualmente desde el navegador.
    if (isNotAllowedError(cameraErrorSource)) {
      setError(
        'El permiso de cámara fue denegado. Para habilitarlo de nuevo, toca el candado o icono de sitio en la barra del navegador, activa la cámara y vuelve a intentar.'
      )
      return
    }

    setError(null)
    setCameraErrorSource(null)

    try {
      await onRetryPermissions?.()
    } catch {
      // El flujo de GPS puede fallar por separado; la camara se vuelve a intentar de todos modos.
    }

    setRetryToken((value) => value + 1)
  }

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
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
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
          <div className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-slate-950">
            <video ref={videoRef} className="aspect-[4/5] w-full object-cover" autoPlay muted playsInline />
            <canvas ref={canvasRef} className="hidden" />
            
            <div className="absolute left-4 top-4">
              <span className="rounded-full bg-slate-900/60 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
                {currentFacingMode === 'user' ? 'Camara Frontal (Selfie)' : 'Camara Trasera'}
              </span>
            </div>
          </div>

          {error && recoveryState && (
            <div className="space-y-3 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
              <div>
                <p className="font-semibold text-rose-800">{recoveryState.title}</p>
                <p className="mt-1 leading-6">{recoveryState.message}</p>
              </div>
              <div className="space-y-2 rounded-[16px] bg-white/70 px-3 py-3 text-rose-800">
                {recoveryState.steps.map((step) => (
                  <p key={step} className="leading-5">
                    {step}
                  </p>
                ))}
              </div>
              {!isNotAllowedError(cameraErrorSource) && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    className="w-full sm:w-auto"
                    onClick={() => void handleRetryPermissions()}
                    disabled={isPreparing || isCapturing}
                  >
                    {recoveryState.retryLabel}
                  </Button>
                  {recoveryState.requiresSettings && (
                    <p className="text-xs leading-5 text-rose-700 sm:self-center">
                      Si no ves la ventana del navegador, activa el permiso en el candado o ajustes del sitio y vuelve a tocar el boton.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between w-full">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto flex items-center gap-2"
                onClick={toggleCamera}
                disabled={isPreparing || isCapturing}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4"
                >
                  <path
                    d="M20 4h-3.17L15 2H9L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 17a5 5 0 100-10 5 5 0 000 10z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M19 8a1 1 0 100-2 1 1 0 000 2z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Cambiar camara
              </Button>
              <div className="flex flex-col gap-3 sm:flex-row">
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
    </div>
  )
}
