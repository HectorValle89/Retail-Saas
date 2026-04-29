'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import type { PermissionRecoveryState } from '@/lib/device/permissionRecovery'
import type { ActorActual } from '@/lib/auth/session'
import { queueOfflineAsistencia, syncAsistenciaNow } from '@/lib/offline/syncQueue'
import { NativeCameraSelfieDialog } from '@/features/asistencias/components/NativeCameraSelfieDialog'
import {
  calcularHashArchivo,
  captureAttendancePosition,
  stampAttendanceSelfie,
  type AttendanceGpsState,
  type CapturedPosition,
  type SelfieCapture,
} from '@/features/asistencias/lib/attendanceCapture'
import type { DashboardDermoconsejoData } from '../services/dashboardService'

interface DermoCheckOutSheetProps {
  actor: ActorActual
  data: DashboardDermoconsejoData
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

interface GpsCaptureResult {
  position: CapturedPosition
  estadoGps: AttendanceGpsState
}

export function DermoCheckOutSheet({
  actor,
  data,
  onClose,
  onSuccess,
  onError,
}: DermoCheckOutSheetProps) {
  const offline = useOfflineSync()
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [isCapturingGps, setIsCapturingGps] = useState(false)
  const [capturedPosition, setCapturedPosition] = useState<CapturedPosition | null>(null)
  const [gpsState, setGpsState] = useState<AttendanceGpsState>('PENDIENTE')
  const [gpsRecoveryState, setGpsRecoveryState] = useState<PermissionRecoveryState | null>(null)
  const [selfieCapture, setSelfieCapture] = useState<SelfieCapture | null>(null)
  const [justificacion, setJustificacion] = useState('')
  const [isPreparingCapture, setIsPreparingCapture] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const gpsPromiseRef = useRef<Promise<GpsCaptureResult> | null>(null)

  const attendanceId = data.shift.attendanceId
  const canCloseShift = Boolean(attendanceId && data.shift.isOpen)
  const blockingReason =
    data.shift.disabledReason ??
    'Necesitas una jornada abierta y una asignacion activa para cerrar la salida.'

  useEffect(() => {
    return () => {
      if (selfieCapture?.previewUrl) {
        URL.revokeObjectURL(selfieCapture.previewUrl)
      }
    }
  }, [selfieCapture])

  const buildSyncFallbackMessage = (error: unknown) => {
    const reason =
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : 'No fue posible contactar al servidor.'

    return `La salida no se sincronizo con el servidor. Motivo: ${reason}. Quedo guardada solo en este telefono y se reenviara automaticamente cuando la app confirme conectividad real.`
  }

  const beginGpsCapture = () => {
    if (gpsPromiseRef.current) {
      return gpsPromiseRef.current
    }

    setIsCapturingGps(true)
    const pendingCapture = captureAttendancePosition({
      geocercaLatitud: data.checkIn.geocercaLatitud,
      geocercaLongitud: data.checkIn.geocercaLongitud,
      geocercaRadioMetros: data.checkIn.geocercaRadioMetros,
    })
      .then((result) => {
        setCapturedPosition(result.position)
        setGpsState(result.estadoGps)
        setGpsRecoveryState(result.recoveryState)
        return result
      })
      .finally(() => {
        setIsCapturingGps(false)
        gpsPromiseRef.current = null
      })

    gpsPromiseRef.current = pendingCapture
    return pendingCapture
  }

  const resolveGpsCapture = async () => {
    if (gpsPromiseRef.current) {
      return gpsPromiseRef.current
    }

    if (capturedPosition) {
      return {
        position: capturedPosition,
        estadoGps: gpsState,
      }
    }

    return beginGpsCapture()
  }

  const handleStartCameraFlow = async () => {
    if (!canCloseShift) {
      onError(blockingReason)
      return
    }

    try {
      await beginGpsCapture()
      setIsCameraOpen(true)
    } catch (error) {
      onError(
        error instanceof Error ? error.message : 'No fue posible capturar la ubicacion para cerrar la jornada.'
      )
    }
  }

  const handleCaptureSelfie = async (file: File) => {
    setIsPreparingCapture(true)

    try {
      const gpsCapture = await resolveGpsCapture()
      const capturedAt = new Date().toISOString()
      const stampedResult = await stampAttendanceSelfie(file, {
        capturedAt,
        latitude: gpsCapture.position.latitud,
        longitude: gpsCapture.position.longitud,
        flowLabel: 'Check-out',
      })
      const hash = await calcularHashArchivo(stampedResult.file)

      if (selfieCapture?.previewUrl) {
        URL.revokeObjectURL(selfieCapture.previewUrl)
      }

      const newSelfieCapture: SelfieCapture = {
        file: stampedResult.file,
        previewUrl: URL.createObjectURL(stampedResult.file),
        hash,
        fileName: stampedResult.file.name,
        fileSize: stampedResult.file.size,
        mimeType: stampedResult.file.type || 'image/jpeg',
        capturadaEn: capturedAt,
        latitud: gpsCapture.position.latitud,
        longitud: gpsCapture.position.longitud,
        timestampStamped: true,
        captureSource: 'native-getusermedia' as const,
        originalBytes: file.size,
        targetBytes: stampedResult.targetBytes,
        targetMet: stampedResult.targetMet,
      }

      setSelfieCapture(newSelfieCapture)

      if (gpsCapture.estadoGps === 'DENTRO_GEOCERCA') {
        setJustificacion('')
      }

      // Auto-submit si esta dentro de geocerca y no requiere justificacion
      const puedeAutoCerrar =
        gpsCapture.estadoGps === 'DENTRO_GEOCERCA' ||
        (gpsCapture.estadoGps === 'FUERA_GEOCERCA' && data.checkIn.permiteCheckinConJustificacion)

      if (puedeAutoCerrar && canCloseShift) {
        // Pequena espera para que se vea la preview antes de cerrar
        await new Promise((resolve) => setTimeout(resolve, 800))
        await handleAutoSubmitCheckout(newSelfieCapture, gpsCapture)
      }
    } finally {
      setIsPreparingCapture(false)
    }
  }

  const handleAutoSubmitCheckout = async (
    selfieData: typeof selfieCapture,
    gpsCapture: { position: CapturedPosition; estadoGps: AttendanceGpsState }
  ) => {
    if (!canCloseShift || !attendanceId) return

    const resolvedCuentaClienteId =
      actor.cuentaClienteId ?? data.context.cuentaClienteId ?? data.checkIn.cuentaClienteId

    if (!data.context.empleadoId || !data.context.pdvId || !resolvedCuentaClienteId) return

    if (!selfieData) return

    if (gpsCapture.estadoGps === 'FUERA_GEOCERCA' && !data.checkIn.permiteCheckinConJustificacion) {
      return
    }

    setIsSubmitting(true)

    try {
      const payload = {
        id: attendanceId,
        cuenta_cliente_id: resolvedCuentaClienteId,
        asignacion_id: data.checkIn.assignmentId,
        empleado_id: data.context.empleadoId,
        supervisor_empleado_id: data.context.supervisorEmpleadoId ?? data.checkIn.supervisorEmpleadoId,
        pdv_id: data.context.pdvId,
        fecha_operacion: data.shift.fechaOperacion,
        empleado_nombre: data.profile.nombreCompleto,
        pdv_clave_btl: data.store.claveBtl ?? undefined,
        pdv_nombre: data.store.nombre,
        pdv_zona: data.store.zona,
        cadena_nombre: data.checkIn.cadena,
        check_out_utc: new Date().toISOString(),
        latitud_check_out: gpsCapture.position.latitud,
        longitud_check_out: gpsCapture.position.longitud,
        distancia_check_out_metros:
          gpsCapture.position.distanciaMetros !== null
            ? Math.round(gpsCapture.position.distanciaMetros)
            : null,
        estado_gps: gpsCapture.estadoGps,
        biometria_estado: 'NO_EVALUADA' as const,
        justificacion_fuera_geocerca:
          gpsCapture.estadoGps === 'FUERA_GEOCERCA' ? 'Check-out fuera de geocerca - auto' : null,
        selfie_check_out_hash: selfieData.hash,
        selfie_check_out_url: null,
        estatus: 'CERRADA' as const,
        origen: 'OFFLINE_SYNC' as const,
        offline_selfie_check_out: {
          file: selfieData.file,
          fileName: selfieData.fileName,
          fileSize: selfieData.fileSize,
          mimeType: selfieData.mimeType,
          capturedAt: selfieData.capturadaEn,
          localHash: selfieData.hash,
        },
        metadata: {
          cierre_local: true,
          origen_panel: 'dashboard_dermoconsejo_checkout_auto',
          checkout: {
            gps_capturado_en: gpsCapture.position.capturadaEn,
            gps_precision_metros: gpsCapture.position.precision,
            gps_dentro_geocerca: gpsCapture.position.dentroGeocerca,
            selfie: {
              file_name: selfieData.fileName,
              file_size: selfieData.fileSize,
              mime_type: selfieData.mimeType,
              capturada_en: selfieData.capturadaEn,
              latitud: selfieData.latitud,
              longitud: selfieData.longitud,
              timestamp_stamped: selfieData.timestampStamped,
              capture_source: selfieData.captureSource,
              original_bytes: selfieData.originalBytes,
              final_bytes: selfieData.fileSize,
              target_bytes: selfieData.targetBytes,
              target_met: selfieData.targetMet,
            },
          },
        },
      }

      if (offline.isOnline) {
        try {
          await syncAsistenciaNow(payload)
          onSuccess('Salida registrada automaticamente. Completa tus reportes pendientes.')
          onClose()
        } catch (error) {
          await queueOfflineAsistencia(payload)
          await offline.refreshSummary()
          onError(buildSyncFallbackMessage(error))
          onClose()
        }
      } else {
        await queueOfflineAsistencia(payload)
        await offline.refreshSummary()
        onSuccess('Salida guardada localmente. Se enviara cuando haya conexion.')
        onClose()
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No fue posible cerrar la jornada.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitCheckout = async () => {
    if (!canCloseShift || !attendanceId) {
      onError(blockingReason)
      return
    }

    const resolvedCuentaClienteId = actor.cuentaClienteId ?? data.context.cuentaClienteId ?? data.checkIn.cuentaClienteId

    if (!data.context.empleadoId || !data.context.pdvId || !resolvedCuentaClienteId) {
      onError('No hay contexto operativo suficiente para cerrar la jornada.')
      return
    }

    if (!selfieCapture) {
      onError('Primero toma la selfie operativa de salida.')
      return
    }

    if (gpsState === 'FUERA_GEOCERCA' && !data.checkIn.permiteCheckinConJustificacion) {
      onError('El PDV no permite excepcion fuera de geocerca para el cierre de jornada.')
      return
    }

    if (gpsState === 'FUERA_GEOCERCA' && !justificacion.trim()) {
      onError('La justificacion es obligatoria cuando el check-out queda fuera de geocerca.')
      return
    }

    setIsSubmitting(true)

    try {
      const gpsCapture = await resolveGpsCapture()
      const payload = {
        id: attendanceId,
        cuenta_cliente_id: resolvedCuentaClienteId,
        asignacion_id: data.checkIn.assignmentId,
        empleado_id: data.context.empleadoId,
        supervisor_empleado_id: data.context.supervisorEmpleadoId ?? data.checkIn.supervisorEmpleadoId,
        pdv_id: data.context.pdvId,
        fecha_operacion: data.shift.fechaOperacion,
        empleado_nombre: data.profile.nombreCompleto,
        pdv_clave_btl: data.store.claveBtl ?? undefined,
        pdv_nombre: data.store.nombre,
        pdv_zona: data.store.zona,
        cadena_nombre: data.checkIn.cadena,
        check_out_utc: new Date().toISOString(),
        latitud_check_out: gpsCapture.position.latitud,
        longitud_check_out: gpsCapture.position.longitud,
        distancia_check_out_metros:
          gpsCapture.position.distanciaMetros !== null
            ? Math.round(gpsCapture.position.distanciaMetros)
            : null,
        estado_gps: gpsCapture.estadoGps,
        biometria_estado: 'NO_EVALUADA' as const,
        justificacion_fuera_geocerca: justificacion.trim() || null,
        selfie_check_out_hash: selfieCapture.hash,
        selfie_check_out_url: null,
        estatus: 'CERRADA' as const,
        origen: 'OFFLINE_SYNC' as const,
        offline_selfie_check_out: {
          file: selfieCapture.file,
          fileName: selfieCapture.fileName,
          fileSize: selfieCapture.fileSize,
          mimeType: selfieCapture.mimeType,
          capturedAt: selfieCapture.capturadaEn,
          localHash: selfieCapture.hash,
        },
        metadata: {
          cierre_local: true,
          origen_panel: 'dashboard_dermoconsejo_checkout',
          checkout: {
            gps_capturado_en: gpsCapture.position.capturadaEn,
            gps_precision_metros: gpsCapture.position.precision,
            gps_dentro_geocerca: gpsCapture.position.dentroGeocerca,
            selfie: {
              file_name: selfieCapture.fileName,
              file_size: selfieCapture.fileSize,
              mime_type: selfieCapture.mimeType,
              capturada_en: selfieCapture.capturadaEn,
              latitud: selfieCapture.latitud,
              longitud: selfieCapture.longitud,
              timestamp_stamped: selfieCapture.timestampStamped,
              capture_source: selfieCapture.captureSource,
              original_bytes: selfieCapture.originalBytes,
              final_bytes: selfieCapture.fileSize,
              target_bytes: selfieCapture.targetBytes,
              target_met: selfieCapture.targetMet,
            },
          },
        },
      }

      if (offline.isOnline) {
        try {
          await syncAsistenciaNow(payload)
          onSuccess('Salida registrada. Ahora completa tus reportes pendientes del dia.')
          onClose()
          return
        } catch (error) {
          await queueOfflineAsistencia(payload)
          await offline.refreshSummary()
          onError(buildSyncFallbackMessage(error))
          onClose()
          return
        }
      }

      await queueOfflineAsistencia(payload)
      await offline.refreshSummary()
      onSuccess('Salida guardada localmente. Completa tus reportes cuando vuelva la conectividad.')
      onClose()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No fue posible cerrar la jornada.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {!canCloseShift && (
        <Card className="border-amber-200 bg-amber-50 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            Flujo bloqueado
          </p>
          <p className="mt-3 text-sm leading-6 text-amber-950">{blockingReason}</p>
        </Card>
      )}

      <Card className="bg-white p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
          Cierre rapido de jornada
        </p>
        <p className="mt-3 text-base font-semibold text-slate-950">
          Toma la selfie de salida y termina tu presencia fisica en tienda.
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Despues del check-out podras completar ventas y LOVE ISDIN desde Reportes pendientes del dia
          o, si aplica, usar Registro extemporaneo en Incidencias.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="button"
            onClick={handleStartCameraFlow}
            disabled={!canCloseShift || isPreparingCapture || isSubmitting}
            isLoading={isCapturingGps}
          >
            Abrir camara y preparar salida
          </Button>
          {selfieCapture && (
            <span className="text-sm text-slate-600">
              Selfie lista. Ya puedes cerrar la jornada.
            </span>
          )}
        </div>
      </Card>

      <Card className="bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
              Estado de salida
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Sucursal: <span className="font-semibold text-slate-950">{data.store.nombre}</span>
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              gpsState === 'DENTRO_GEOCERCA'
                ? 'bg-emerald-100 text-emerald-700'
                : gpsState === 'FUERA_GEOCERCA'
                  ? 'bg-amber-100 text-amber-800'
                  : gpsState === 'SIN_GPS'
                    ? 'bg-slate-100 text-slate-600'
                    : 'bg-sky-100 text-sky-700'
            }`}
          >
            {isCapturingGps
              ? 'Calculando GPS'
              : gpsState === 'DENTRO_GEOCERCA'
                ? 'Dentro de tienda'
                : gpsState === 'FUERA_GEOCERCA'
                  ? 'Fuera de geocerca'
                  : gpsState === 'SIN_GPS'
                    ? 'Sin GPS'
                    : 'Pendiente'}
          </span>
        </div>

        {gpsState === 'FUERA_GEOCERCA' && data.checkIn.permiteCheckinConJustificacion && (
          <div className="mt-4">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Justificacion
            </label>
            <textarea
              value={justificacion}
              onChange={(event) => setJustificacion(event.target.value)}
              rows={4}
              className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--module-primary)] focus:ring-4 focus:ring-[var(--module-focus-ring)]"
              placeholder="Explica por que cierras fuera de geocerca."
            />
          </div>
        )}

        {gpsRecoveryState && gpsState === 'SIN_GPS' && (
          <div className="mt-4 space-y-3 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <div>
              <p className="font-semibold">{gpsRecoveryState.title}</p>
              <p className="mt-1 leading-6">{gpsRecoveryState.message}</p>
            </div>
            <div className="space-y-2 rounded-[14px] bg-white/70 px-3 py-3">
              {gpsRecoveryState.steps.map((step) => (
                <p key={step} className="leading-5">
                  {step}
                </p>
              ))}
            </div>
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void beginGpsCapture()}>
              {gpsRecoveryState.retryLabel}
            </Button>
          </div>
        )}

        {selfieCapture && (
          <div className="mt-4 overflow-hidden rounded-[22px] border border-slate-200 bg-slate-50">
            <img
              src={selfieCapture.previewUrl}
              alt="Selfie de salida"
              className="h-48 w-full object-cover"
            />
            <div className="space-y-2 px-4 py-4 text-sm text-slate-600">
              <p>
                <span className="font-semibold text-slate-950">Captura:</span>{' '}
                {new Date(selfieCapture.capturadaEn).toLocaleString('es-MX')}
              </p>
              <p>
                <span className="font-semibold text-slate-950">Peso final:</span>{' '}
                {(selfieCapture.fileSize / 1024).toFixed(1)} KB
              </p>
              <p>
                <span className="font-semibold text-slate-950">Sello operativo:</span>{' '}
                {selfieCapture.timestampStamped ? 'aplicado' : 'pendiente'}
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-[14px]"
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmitCheckout}
            disabled={!canCloseShift || !selfieCapture || isPreparingCapture || isSubmitting}
            isLoading={isSubmitting}
            className="rounded-[14px]"
          >
            Cerrar jornada
          </Button>
        </div>
      </Card>

      <NativeCameraSelfieDialog
        open={isCameraOpen}
        title="Selfie nativa de check-out"
        description="Abre la camara frontal, toma la selfie operativa y cierra la jornada sin salir del dashboard."
        onClose={() => {
          if (!isPreparingCapture && !isSubmitting) {
            setIsCameraOpen(false)
          }
        }}
        onCapture={handleCaptureSelfie}
        captureLabel="Capturar salida"
        onRetryPermissions={() => {
          void beginGpsCapture()
        }}
      />
    </div>
  )
}
