'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { NativeCameraSelfieDialog } from '@/features/asistencias/components/NativeCameraSelfieDialog'
import {
  calcularHashArchivo,
  captureAttendancePosition,
  stampAttendanceSelfie,
  type AttendanceGpsState,
  type CapturedPosition,
  type SelfieCapture,
} from '@/features/asistencias/lib/attendanceCapture'
import { selectAttendanceMission } from '@/features/asistencias/lib/attendanceMission'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { queueOfflineAsistencia } from '@/lib/offline/syncQueue'
import type { DashboardDermoconsejoData } from '../services/dashboardService'

interface DermoCheckInSheetProps {
  data: DashboardDermoconsejoData
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

interface GpsCaptureResult {
  position: CapturedPosition
  estadoGps: AttendanceGpsState
}

export function DermoCheckInSheet({
  data,
  onClose,
  onSuccess,
  onError,
}: DermoCheckInSheetProps) {
  const offline = useOfflineSync()
  const [missionAccepted, setMissionAccepted] = useState(false)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [isCapturingGps, setIsCapturingGps] = useState(false)
  const [capturedPosition, setCapturedPosition] = useState<CapturedPosition | null>(null)
  const [gpsState, setGpsState] = useState<AttendanceGpsState>('PENDIENTE')
  const [selfieCapture, setSelfieCapture] = useState<SelfieCapture | null>(null)
  const [justificacion, setJustificacion] = useState('')
  const [isPreparingDraft, setIsPreparingDraft] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const gpsPromiseRef = useRef<Promise<GpsCaptureResult> | null>(null)

  const selectedMission = useMemo(
    () =>
      selectAttendanceMission({
        empleadoId: data.checkIn.empleadoId,
        pdvId: data.checkIn.pdvId ?? `pdv-fallback-${data.checkIn.empleadoId}`,
        fechaOperacion: data.checkIn.fechaOperacion,
        previousMissionId: data.checkIn.previousMissionId,
        missions: data.checkIn.missions,
      }).mission,
    [data.checkIn]
  )
  const canStartShift = Boolean(
    data.shift.canStart && data.checkIn.assignmentId && data.checkIn.assignmentSchedule
  )
  const blockingReason =
    data.shift.disabledReason ??
    'Necesitas una asignacion activa con PDV y horario para registrar la llegada.'

  useEffect(() => {
    return () => {
      if (selfieCapture?.previewUrl) {
        URL.revokeObjectURL(selfieCapture.previewUrl)
      }
    }
  }, [selfieCapture])

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

  const handleAcceptMission = () => {
    if (!canStartShift) {
      onError(blockingReason)
      return
    }

    if (!selectedMission) {
      onError('No hay una mision activa disponible para el check-in de hoy.')
      return
    }

    setMissionAccepted(true)
    void beginGpsCapture()
    setIsCameraOpen(true)
  }

  const handleCaptureSelfie = async (file: File) => {
    setIsPreparingDraft(true)

    try {
      const gpsCapture = await resolveGpsCapture()
      const capturedAt = new Date().toISOString()
      const stampedResult = await stampAttendanceSelfie(file, {
        capturedAt,
        latitude: gpsCapture.position.latitud,
        longitude: gpsCapture.position.longitud,
        flowLabel: 'Check-in',
      })
      const hash = await calcularHashArchivo(stampedResult.file)

      if (selfieCapture?.previewUrl) {
        URL.revokeObjectURL(selfieCapture.previewUrl)
      }

      setSelfieCapture({
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
        captureSource: 'native-getusermedia',
        originalBytes: file.size,
        targetBytes: stampedResult.targetBytes,
        targetMet: stampedResult.targetMet,
      })

      if (gpsCapture.estadoGps === 'DENTRO_GEOCERCA') {
        setJustificacion('')
      }
    } finally {
      setIsPreparingDraft(false)
    }
  }

  const handleSubmitDraft = async () => {
    if (!canStartShift || !data.checkIn.assignmentId || !data.checkIn.assignmentSchedule) {
      onError(blockingReason)
      return
    }

    if (!data.checkIn.pdvId || !data.checkIn.cuentaClienteId) {
      onError('No hay un PDV operativo asignado para registrar la llegada.')
      return
    }

    if (!selectedMission) {
      onError('No hay una mision del dia disponible para este check-in.')
      return
    }

    if (!missionAccepted) {
      onError('Primero debes aceptar la mision del dia.')
      return
    }

    if (!selfieCapture) {
      onError('Primero toma la fotografia operativa para generar el borrador.')
      return
    }

    if (gpsState === 'FUERA_GEOCERCA' && !data.checkIn.permiteCheckinConJustificacion) {
      onError('Este PDV no permite check-in fuera de geocerca.')
      return
    }

    if (gpsState === 'FUERA_GEOCERCA' && !justificacion.trim()) {
      onError('Agrega una justificacion para continuar fuera de geocerca.')
      return
    }

    setIsSubmitting(true)

    try {
      const gpsCapture = await resolveGpsCapture()

      await queueOfflineAsistencia({
        id: crypto.randomUUID(),
        cuenta_cliente_id: data.checkIn.cuentaClienteId,
        asignacion_id: data.checkIn.assignmentId,
        empleado_id: data.checkIn.empleadoId,
        supervisor_empleado_id: data.checkIn.supervisorEmpleadoId,
        pdv_id: data.checkIn.pdvId,
        fecha_operacion: data.checkIn.fechaOperacion,
        empleado_nombre: data.checkIn.empleadoNombre,
        pdv_clave_btl: data.checkIn.pdvClaveBtl ?? undefined,
        pdv_nombre: data.checkIn.pdvNombre,
        pdv_zona: data.checkIn.zona,
        cadena_nombre: data.checkIn.cadena,
        check_in_utc: new Date().toISOString(),
        check_out_utc: null,
        latitud_check_in: gpsCapture.position.latitud,
        longitud_check_in: gpsCapture.position.longitud,
        latitud_check_out: null,
        longitud_check_out: null,
        distancia_check_in_metros:
          gpsCapture.position.distanciaMetros !== null
            ? Math.round(gpsCapture.position.distanciaMetros)
            : null,
        distancia_check_out_metros: null,
        estado_gps: gpsCapture.estadoGps,
        justificacion_fuera_geocerca: justificacion.trim() || null,
        mision_dia_id: selectedMission.id,
        mision_codigo: selectedMission.codigo,
        mision_instruccion: selectedMission.instruccion,
        biometria_estado: 'PENDIENTE',
        biometria_score: null,
        selfie_check_in_hash: selfieCapture.hash,
        selfie_check_in_url: null,
        selfie_check_out_hash: null,
        selfie_check_out_url: null,
        estatus: 'PENDIENTE_VALIDACION',
        origen: 'OFFLINE_SYNC',
        offline_selfie_check_in: {
          file: selfieCapture.file,
          fileName: selfieCapture.fileName,
          fileSize: selfieCapture.fileSize,
          mimeType: selfieCapture.mimeType,
          capturedAt: selfieCapture.capturadaEn,
          localHash: selfieCapture.hash,
        },
        metadata: {
          captura_local: true,
          origen_panel: 'dashboard_dermoconsejo',
          mission_acceptance: {
            accepted: true,
            accepted_at: new Date().toISOString(),
            id: selectedMission.id,
            codigo: selectedMission.codigo,
            instruccion: selectedMission.instruccion,
          },
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
      })

      if (offline.isOnline) {
        await offline.syncNow()
      }

      onSuccess(
        offline.isOnline
          ? 'Borrador enviado. Se intento sincronizar de inmediato.'
          : 'Borrador guardado. Se enviara cuando vuelva la red.'
      )
      onClose()
    } catch (error) {
      onError(
        error instanceof Error ? error.message : 'No fue posible generar el borrador de llegada.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {!canStartShift && (
        <Card className="border-amber-200 bg-amber-50 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            Flujo bloqueado
          </p>
          <p className="mt-3 text-sm leading-6 text-amber-950">{blockingReason}</p>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            Este check-in solo se habilita con una asignacion activa que defina PDV y horario para
            comparar geocerca, tienda y retardo.
          </p>
        </Card>
      )}

      <Card className="bg-white p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
          Mision del dia
        </p>
        {selectedMission ? (
          <>
            <p className="mt-3 text-base font-semibold text-slate-950">{selectedMission.instruccion}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Acepta la mision para abrir la camara. Mientras tomas la foto, el sistema valida GPS
              y geocerca en segundo plano.
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-rose-700">
            No hay una mision activa disponible para este check-in.
          </p>
        )}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="button"
            onClick={handleAcceptMission}
            disabled={!selectedMission || !canStartShift}
            isLoading={isCapturingGps && !missionAccepted}
          >
            Aceptar mision y abrir camara
          </Button>
          {missionAccepted && (
            <span className="text-sm text-slate-600">
              Mision aceptada. Ya puedes generar el borrador de entrada.
            </span>
          )}
        </div>
      </Card>

      <Card className="bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
              Estado de captura
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Sucursal: <span className="font-semibold text-slate-950">{data.checkIn.pdvNombre}</span>
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
              rows={3}
              className="mt-2 w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
              placeholder="Explica por que la llegada quedo fuera de geocerca."
            />
          </div>
        )}

        {gpsState === 'FUERA_GEOCERCA' && !data.checkIn.permiteCheckinConJustificacion && (
          <p className="mt-4 rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Este PDV no permite excepciones fuera de geocerca. Debes volver a capturar desde la
            tienda.
          </p>
        )}
      </Card>

      <Card className="bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
              Borrador de selfie
            </p>
            <p className="mt-2 text-sm text-slate-600">
              La foto se sella con fecha, hora y GPS antes de enviarse.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!canStartShift) {
                onError(blockingReason)
                return
              }
              if (!missionAccepted) {
                onError('Primero acepta la mision del dia.')
                return
              }
              void beginGpsCapture()
              setIsCameraOpen(true)
            }}
            isLoading={isPreparingDraft}
            disabled={!canStartShift}
          >
            {selfieCapture ? 'Tomar de nuevo' : 'Tomar fotografia'}
          </Button>
        </div>

        {selfieCapture ? (
          <div className="mt-4 overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50">
            <img
              src={selfieCapture.previewUrl}
              alt="Borrador de selfie para check-in"
              className="aspect-[4/5] w-full object-cover"
            />
            <div className="grid gap-3 px-4 py-4 text-sm text-slate-600 sm:grid-cols-2">
              <div>
                <p className="font-semibold text-slate-950">Captura lista</p>
                <p className="mt-1">Hora: {new Date(selfieCapture.capturadaEn).toLocaleString('es-MX')}</p>
                <p className="mt-1">Peso final: {(selfieCapture.fileSize / 1024).toFixed(1)} KB</p>
              </div>
              <div>
                <p className="font-semibold text-slate-950">Sello operativo</p>
                <p className="mt-1">
                  GPS:{' '}
                  {selfieCapture.latitud !== null && selfieCapture.longitud !== null
                    ? `${selfieCapture.latitud.toFixed(6)}, ${selfieCapture.longitud.toFixed(6)}`
                    : 'Sin GPS'}
                </p>
                <p className="mt-1">
                  Compresion objetivo:{' '}
                  {selfieCapture.targetMet ? 'cumplida' : 'maxima aplicada'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-[16px] border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
            Cuando tomes la foto, aqui se mostrara el borrador final antes del envio.
          </p>
        )}
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={handleSubmitDraft}
          isLoading={isSubmitting}
          disabled={
            !canStartShift ||
            !selfieCapture ||
            (gpsState === 'FUERA_GEOCERCA' && !data.checkIn.permiteCheckinConJustificacion)
          }
        >
          Enviar borrador
        </Button>
      </div>

      <NativeCameraSelfieDialog
        open={isCameraOpen}
        title="Fotografia de llegada"
        description="Toma la selfie operativa desde la camara frontal. El sistema ya esta calculando GPS mientras capturas."
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCaptureSelfie}
      />
    </div>
  )
}
