'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { NativeCameraSelfieDialog } from '@/features/asistencias/components/NativeCameraSelfieDialog'
import { OfflineStatusCard } from '@/components/pwa/OfflineStatusCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { queueOfflineAsistencia } from '@/lib/offline/syncQueue'
import {
  calcularDistanciaMetros,
  calcularHashArchivo,
  getLocalDateValue,
  getLocalTimeValue,
  stampAttendanceSelfie,
  type CapturedPosition,
  type SelfieCapture,
} from '../lib/attendanceCapture'
import type { AsistenciasPanelData } from '../services/asistenciaService'
import { selectAttendanceMission } from '../lib/attendanceMission'

function buildPageHref(data: AsistenciasPanelData, page: number) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('pageSize', String(data.paginacion.pageSize))
  return `/asistencias?${params.toString()}`
}

export function AsistenciasPanel({ data }: { data: AsistenciasPanelData }) {
  const offline = useOfflineSync()
  const [contextId, setContextId] = useState(data.asistencias[0]?.id ?? '')
  const [fechaOperacion, setFechaOperacion] = useState(getLocalDateValue())
  const [horaCheckIn, setHoraCheckIn] = useState(getLocalTimeValue())
  const [estadoGps, setEstadoGps] = useState<
    'PENDIENTE' | 'DENTRO_GEOCERCA' | 'FUERA_GEOCERCA' | 'SIN_GPS'
  >('PENDIENTE')
  const [biometriaEstado, setBiometriaEstado] = useState<
    'PENDIENTE' | 'VALIDA' | 'RECHAZADA' | 'NO_EVALUADA'
  >('PENDIENTE')
  const [estatus, setEstatus] = useState<
    'PENDIENTE_VALIDACION' | 'VALIDA' | 'RECHAZADA' | 'CERRADA'
  >('PENDIENTE_VALIDACION')
  const [distancia, setDistancia] = useState('')
  const [justificacion, setJustificacion] = useState('')
  const [capturedPosition, setCapturedPosition] = useState<CapturedPosition | null>(null)
  const [selfieCapture, setSelfieCapture] = useState<SelfieCapture | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [isReadingSelfie, setIsReadingSelfie] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [misionConfirmada, setMisionConfirmada] = useState(false)
  const [checkoutPosition, setCheckoutPosition] = useState<CapturedPosition | null>(null)
  const [checkoutEstadoGps, setCheckoutEstadoGps] = useState<
    'PENDIENTE' | 'DENTRO_GEOCERCA' | 'FUERA_GEOCERCA' | 'SIN_GPS'
  >('PENDIENTE')
  const [checkoutJustificacion, setCheckoutJustificacion] = useState('')
  const [checkoutSelfieCapture, setCheckoutSelfieCapture] = useState<SelfieCapture | null>(null)
  const [activeCameraFlow, setActiveCameraFlow] = useState<'check-in' | 'check-out' | null>(null)
  const [isCapturingCheckoutPosition, setIsCapturingCheckoutPosition] = useState(false)
  const [isReadingCheckoutSelfie, setIsReadingCheckoutSelfie] = useState(false)
  const [isClosingShift, setIsClosingShift] = useState(false)
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)

  const selectedContext = data.asistencias.find((item) => item.id === contextId) ?? null
  const tieneGeocerca =
    selectedContext?.geocercaLatitud !== null &&
    selectedContext?.geocercaLongitud !== null &&
    selectedContext?.geocercaRadioMetros !== null
  const openAttendance = useMemo(
    () => (selectedContext?.checkInUtc && !selectedContext.checkOutUtc ? selectedContext : null),
    [selectedContext]
  )
  const missionSelection = useMemo(() => {
    if (!selectedContext) {
      return { mission: null, avoidedImmediateRepeat: false }
    }

    return selectAttendanceMission({
      empleadoId: selectedContext.empleadoId,
      pdvId: selectedContext.pdvId,
      fechaOperacion,
      previousMissionId: selectedContext.ultimaMisionDiaId,
      missions: data.misionesCatalogo,
    })
  }, [data.misionesCatalogo, fechaOperacion, selectedContext])
  const currentMission = missionSelection.mission
  const canPrev = data.paginacion.page > 1
  const canNext = data.paginacion.page < data.paginacion.totalPages

  useEffect(() => {
    setCapturedPosition(null)
    setSelfieCapture(null)
    setDistancia('')
    setJustificacion('')
    setEstadoGps('PENDIENTE')
    setBiometriaEstado('PENDIENTE')
    setEstatus('PENDIENTE_VALIDACION')
    setCheckoutPosition(null)
    setCheckoutEstadoGps('PENDIENTE')
    setCheckoutJustificacion('')
    setCheckoutSelfieCapture(null)
    setActiveCameraFlow(null)
    setMisionConfirmada(false)
    setFeedback(null)
  }, [contextId])

  useEffect(() => {
    setMisionConfirmada(false)
  }, [fechaOperacion, contextId])

  const handleCapturePosition = async () => {
    if (!selectedContext) {
      setFeedback({ tone: 'error', message: 'Selecciona primero un contexto base.' })
      return
    }

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      const capturedAt = new Date().toISOString()
      setCapturedPosition({
        latitud: null,
        longitud: null,
        precision: null,
        distanciaMetros: null,
        dentroGeocerca: null,
        capturadaEn: capturedAt,
      })
      setEstadoGps('SIN_GPS')
      setEstatus('PENDIENTE_VALIDACION')
      setFeedback({
        tone: 'success',
        message:
          'Este dispositivo no pudo obtener GPS. Puedes continuar, pero el check-in quedara en PENDIENTE_VALIDACION.',
      })
      return
    }

    setIsLocating(true)
    setFeedback(null)

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        })
      })

      const latitud = position.coords.latitude
      const longitud = position.coords.longitude
      const precision = Number.isFinite(position.coords.accuracy)
        ? Number(position.coords.accuracy)
        : null

      let distanciaMetros: number | null = null
      let dentroGeocerca: boolean | null = null
      let siguienteEstadoGps: 'PENDIENTE' | 'DENTRO_GEOCERCA' | 'FUERA_GEOCERCA' | 'SIN_GPS' =
        'PENDIENTE'

      if (tieneGeocerca && selectedContext) {
        distanciaMetros = calcularDistanciaMetros(
          latitud,
          longitud,
          selectedContext.geocercaLatitud as number,
          selectedContext.geocercaLongitud as number
        )
        dentroGeocerca = distanciaMetros <= (selectedContext.geocercaRadioMetros as number)
        siguienteEstadoGps = dentroGeocerca ? 'DENTRO_GEOCERCA' : 'FUERA_GEOCERCA'
        setDistancia(String(Math.round(distanciaMetros)))
      } else {
        siguienteEstadoGps = 'PENDIENTE'
      }

      setCapturedPosition({
        latitud,
        longitud,
        precision,
        distanciaMetros,
        dentroGeocerca,
        capturadaEn: new Date().toISOString(),
      })
      setEstadoGps(siguienteEstadoGps)
      if (siguienteEstadoGps === 'DENTRO_GEOCERCA') {
        setJustificacion('')
      }
      setFeedback({
        tone: 'success',
        message:
          siguienteEstadoGps === 'FUERA_GEOCERCA'
            ? 'Ubicacion capturada. El check-in quedo fuera de geocerca y requiere justificacion.'
            : 'Ubicacion capturada correctamente.',
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No fue posible capturar la ubicacion actual.'
      const capturedAt = new Date().toISOString()

      setCapturedPosition({
        latitud: null,
        longitud: null,
        precision: null,
        distanciaMetros: null,
        dentroGeocerca: null,
        capturadaEn: capturedAt,
      })
      setEstadoGps('SIN_GPS')
      setEstatus('PENDIENTE_VALIDACION')
      setFeedback({
        tone: 'success',
        message: `${message} El check-in quedara en PENDIENTE_VALIDACION por falta de GPS.`,
      })
    } finally {
      setIsLocating(false)
    }
  }

  const handleCheckoutPosition = async () => {
    if (!openAttendance) {
      setFeedback({ tone: 'error', message: 'Selecciona una jornada abierta para capturar el cierre.' })
      return
    }

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setFeedback({ tone: 'error', message: 'Este navegador no soporta geolocalizacion.' })
      return
    }

    setIsCapturingCheckoutPosition(true)
    setFeedback(null)

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        })
      })

      const latitud = position.coords.latitude
      const longitud = position.coords.longitude
      const precision = Number.isFinite(position.coords.accuracy)
        ? Number(position.coords.accuracy)
        : null

      let distanciaMetros: number | null = null
      let dentroGeocerca: boolean | null = null
      let siguienteEstadoGps: 'PENDIENTE' | 'DENTRO_GEOCERCA' | 'FUERA_GEOCERCA' | 'SIN_GPS' =
        'PENDIENTE'

      if (tieneGeocerca && selectedContext) {
        distanciaMetros = calcularDistanciaMetros(
          latitud,
          longitud,
          selectedContext.geocercaLatitud as number,
          selectedContext.geocercaLongitud as number
        )
        dentroGeocerca = distanciaMetros <= (selectedContext.geocercaRadioMetros as number)
        siguienteEstadoGps = dentroGeocerca ? 'DENTRO_GEOCERCA' : 'FUERA_GEOCERCA'
      }

      setCheckoutPosition({
        latitud,
        longitud,
        precision,
        distanciaMetros,
        dentroGeocerca,
        capturadaEn: new Date().toISOString(),
      })
      setCheckoutEstadoGps(siguienteEstadoGps)
      if (siguienteEstadoGps === 'DENTRO_GEOCERCA') {
        setCheckoutJustificacion('')
      }
      setFeedback({
        tone: 'success',
        message:
          siguienteEstadoGps === 'FUERA_GEOCERCA'
            ? 'Ubicacion de salida capturada. El check-out requerira justificacion fuera de geocerca.'
            : 'Ubicacion de salida capturada correctamente.',
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No fue posible capturar la ubicacion de salida.'

      setFeedback({ tone: 'error', message })
    } finally {
      setIsCapturingCheckoutPosition(false)
    }
  }

  const processAttendanceSelfieCapture = async ({
    file,
    flowLabel,
    latitude,
    longitude,
    successMessage,
    target,
  }: {
    file: File
    flowLabel: 'Check-in' | 'Check-out'
    latitude: number | null
    longitude: number | null
    successMessage: string
    target: 'check-in' | 'check-out'
  }) => {
    if (target === 'check-in') {
      setIsReadingSelfie(true)
    } else {
      setIsReadingCheckoutSelfie(true)
    }

    setFeedback(null)

    try {
      const capturedAt = new Date().toISOString()
      const stampedResult = await stampAttendanceSelfie(file, {
        capturedAt,
        latitude,
        longitude,
        flowLabel,
      })
      const hash = await calcularHashArchivo(stampedResult.file)
      const nextCapture: SelfieCapture = {
        file: stampedResult.file,
        previewUrl: URL.createObjectURL(stampedResult.file),
        hash,
        fileName: stampedResult.file.name,
        fileSize: stampedResult.file.size,
        mimeType: stampedResult.file.type || 'image/jpeg',
        capturadaEn: capturedAt,
        latitud: latitude,
        longitud: longitude,
        timestampStamped: true,
        captureSource: 'native-getusermedia',
        originalBytes: file.size,
        targetBytes: stampedResult.targetBytes,
        targetMet: stampedResult.targetMet,
      }

      if (target === 'check-in') {
        setSelfieCapture(nextCapture)
        if (biometriaEstado === 'NO_EVALUADA') {
          setBiometriaEstado('PENDIENTE')
        }
      } else {
        setCheckoutSelfieCapture(nextCapture)
      }

      setFeedback({
        tone: 'success',
        message: successMessage,
      })
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : target === 'check-in'
              ? 'No fue posible procesar la selfie.'
              : 'No fue posible procesar la selfie de salida.',
      })

      if (target === 'check-in') {
        setSelfieCapture(null)
      } else {
        setCheckoutSelfieCapture(null)
      }

      throw error
    } finally {
      if (target === 'check-in') {
        setIsReadingSelfie(false)
      } else {
        setIsReadingCheckoutSelfie(false)
      }
    }
  }

  const handleCaptureCheckInSelfie = async (file: File) =>
    processAttendanceSelfieCapture({
      file,
      flowLabel: 'Check-in',
      latitude: capturedPosition?.latitud ?? null,
      longitude: capturedPosition?.longitud ?? null,
      successMessage: 'Selfie de check-in capturada desde la cámara nativa y sellada con fecha, hora y GPS operativo.',
      target: 'check-in',
    })

  const handleCaptureCheckOutSelfie = async (file: File) =>
    processAttendanceSelfieCapture({
      file,
      flowLabel: 'Check-out',
      latitude: checkoutPosition?.latitud ?? null,
      longitude: checkoutPosition?.longitud ?? null,
      successMessage: 'Selfie de salida capturada desde la cámara nativa y sellada para el cierre local.',
      target: 'check-out',
    })

  const handleQueueDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!selectedContext) {
      setFeedback({ tone: 'error', message: 'Selecciona un contexto reciente para clonar la jornada.' })
      return
    }

    if (!currentMission) {
      setFeedback({ tone: 'error', message: 'No hay una mision activa disponible para este check-in.' })
      return
    }

    if (!misionConfirmada) {
      setFeedback({ tone: 'error', message: 'Debes leer y confirmar la mision del dia antes de guardar el check-in.' })
      return
    }

    if (estadoGps === 'FUERA_GEOCERCA' && !selectedContext.permiteCheckinConJustificacion) {
      setFeedback({
        tone: 'error',
        message: 'El PDV no admite excepcion fuera de geocerca para este check-in.',
      })
      return
    }

    if (estadoGps === 'FUERA_GEOCERCA' && !justificacion.trim()) {
      setFeedback({
        tone: 'error',
        message: 'La justificacion es obligatoria cuando el check-in queda fuera de geocerca.',
      })
      return
    }

    if (!selfieCapture) {
      setFeedback({
        tone: 'error',
        message: 'Debes capturar la selfie de check-in desde la cámara nativa antes de guardar la jornada.',
      })
      return
    }

    const distanciaValue = distancia.trim() === '' ? null : Number(distancia)

    if (distanciaValue !== null && Number.isNaN(distanciaValue)) {
      setFeedback({ tone: 'error', message: 'La distancia debe ser numerica.' })
      return
    }

    const checkInUtc = new Date(`${fechaOperacion}T${horaCheckIn}:00`).toISOString()

    setIsSaving(true)
    setFeedback(null)

    try {
      await queueOfflineAsistencia({
        id: crypto.randomUUID(),
        cuenta_cliente_id: selectedContext.cuentaClienteId,
        asignacion_id: selectedContext.asignacionId,
        empleado_id: selectedContext.empleadoId,
        supervisor_empleado_id: selectedContext.supervisorEmpleadoId,
        pdv_id: selectedContext.pdvId,
        fecha_operacion: fechaOperacion,
        empleado_nombre: selectedContext.empleado,
        pdv_clave_btl: selectedContext.pdvClaveBtl,
        pdv_nombre: selectedContext.pdvNombre,
        pdv_zona: selectedContext.zona,
        cadena_nombre: selectedContext.cadena,
        check_in_utc: checkInUtc,
        check_out_utc: null,
        latitud_check_in: capturedPosition?.latitud ?? null,
        longitud_check_in: capturedPosition?.longitud ?? null,
        latitud_check_out: null,
        longitud_check_out: null,
        distancia_check_in_metros: distanciaValue,
        distancia_check_out_metros: null,
        estado_gps: estadoGps,
        justificacion_fuera_geocerca: justificacion.trim() || null,
        mision_dia_id: selectedContext.misionDiaId,
        mision_codigo: selectedContext.misionCodigo,
        mision_instruccion: selectedContext.misionInstruccion,
        biometria_estado: selfieCapture ? 'PENDIENTE' : biometriaEstado,
        biometria_score: null,
        selfie_check_in_hash: selfieCapture?.hash ?? null,
        selfie_check_in_url: null,
        selfie_check_out_hash: null,
        selfie_check_out_url: null,
        estatus,
        origen: 'OFFLINE_SYNC',
        offline_selfie_check_in: selfieCapture
          ? {
              file: selfieCapture.file,
              fileName: selfieCapture.fileName,
              fileSize: selfieCapture.fileSize,
              mimeType: selfieCapture.mimeType,
              capturedAt: selfieCapture.capturadaEn,
              localHash: selfieCapture.hash,
            }
          : null,
        metadata: {
          captura_local: true,
          origen_panel: 'asistencias',
          contexto_base_id: selectedContext.id,
          gps_capturado_en: capturedPosition?.capturadaEn ?? null,
          gps_precision_metros: capturedPosition?.precision ?? null,
          gps_dentro_geocerca: capturedPosition?.dentroGeocerca ?? null,
          selfie: selfieCapture
            ? {
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
              }
            : null,
        },
      })

      if (offline.isOnline) {
        await offline.syncNow()
      }

      setFeedback({
        tone: 'success',
        message: offline.isOnline
          ? 'Borrador en cola local. Se intento sincronizar de inmediato.'
          : 'Borrador guardado localmente. Quedara pendiente hasta recuperar red.',
      })
      setDistancia('')
      setJustificacion('')
      setEstadoGps('PENDIENTE')
      setBiometriaEstado('PENDIENTE')
      setEstatus('PENDIENTE_VALIDACION')
      setCapturedPosition(null)
      setSelfieCapture(null)
      setActiveCameraFlow(null)
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'No fue posible guardar el borrador offline.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleQueueCheckout = async () => {
    if (!openAttendance) {
      setFeedback({ tone: 'error', message: 'Selecciona una jornada abierta para registrar el check-out.' })
      return
    }

    if (openAttendance.ventasPendientesConfirmacion > 0) {
      setFeedback({
        tone: 'error',
        message:
          'No puedes cerrar la jornada mientras existan ventas pendientes por confirmar en esta asistencia.',
      })
      return
    }

    if (!checkoutPosition) {
      setFeedback({ tone: 'error', message: 'Primero captura la ubicacion de salida.' })
      return
    }

    if (checkoutEstadoGps === 'FUERA_GEOCERCA' && !openAttendance.permiteCheckinConJustificacion) {
      setFeedback({
        tone: 'error',
        message: 'El PDV no permite excepcion fuera de geocerca para el cierre de jornada.',
      })
      return
    }

    if (checkoutEstadoGps === 'FUERA_GEOCERCA' && !checkoutJustificacion.trim()) {
      setFeedback({
        tone: 'error',
        message: 'La justificacion es obligatoria cuando el check-out queda fuera de geocerca.',
      })
      return
    }

    setIsClosingShift(true)
    setFeedback(null)

    try {
      await queueOfflineAsistencia({
        id: openAttendance.id,
        cuenta_cliente_id: openAttendance.cuentaClienteId,
        asignacion_id: openAttendance.asignacionId,
        empleado_id: openAttendance.empleadoId,
        supervisor_empleado_id: openAttendance.supervisorEmpleadoId,
        pdv_id: openAttendance.pdvId,
        fecha_operacion: openAttendance.fechaOperacion,
        empleado_nombre: openAttendance.empleado,
        pdv_clave_btl: openAttendance.pdvClaveBtl,
        pdv_nombre: openAttendance.pdvNombre,
        pdv_zona: openAttendance.zona,
        cadena_nombre: openAttendance.cadena,
        check_out_utc: new Date().toISOString(),
        latitud_check_out: checkoutPosition.latitud,
        longitud_check_out: checkoutPosition.longitud,
        distancia_check_out_metros:
          checkoutPosition.distanciaMetros !== null ? Math.round(checkoutPosition.distanciaMetros) : null,
        estado_gps: checkoutEstadoGps,
        justificacion_fuera_geocerca: checkoutJustificacion.trim() || null,
        selfie_check_out_hash: checkoutSelfieCapture?.hash ?? null,
        selfie_check_out_url: null,
        estatus: 'CERRADA',
        origen: 'OFFLINE_SYNC',
        offline_selfie_check_out: checkoutSelfieCapture
          ? {
              file: checkoutSelfieCapture.file,
              fileName: checkoutSelfieCapture.fileName,
              fileSize: checkoutSelfieCapture.fileSize,
              mimeType: checkoutSelfieCapture.mimeType,
              capturedAt: checkoutSelfieCapture.capturadaEn,
              localHash: checkoutSelfieCapture.hash,
            }
          : null,
        metadata: {
          cierre_local: true,
          origen_panel: 'asistencias',
          checkout: {
            gps_capturado_en: checkoutPosition.capturadaEn,
            gps_precision_metros: checkoutPosition.precision,
            gps_dentro_geocerca: checkoutPosition.dentroGeocerca,
            ventas_confirmadas: openAttendance.ventasConfirmadas,
            ventas_pendientes_confirmacion: openAttendance.ventasPendientesConfirmacion,
            selfie: checkoutSelfieCapture
              ? {
                  file_name: checkoutSelfieCapture.fileName,
                  file_size: checkoutSelfieCapture.fileSize,
                  mime_type: checkoutSelfieCapture.mimeType,
                  capturada_en: checkoutSelfieCapture.capturadaEn,
                  latitud: checkoutSelfieCapture.latitud,
                  longitud: checkoutSelfieCapture.longitud,
                  timestamp_stamped: checkoutSelfieCapture.timestampStamped,
                  capture_source: checkoutSelfieCapture.captureSource,
                  original_bytes: checkoutSelfieCapture.originalBytes,
                  final_bytes: checkoutSelfieCapture.fileSize,
                  target_bytes: checkoutSelfieCapture.targetBytes,
                  target_met: checkoutSelfieCapture.targetMet,
                }
              : null,
          },
        },
      })

      if (offline.isOnline) {
        await offline.syncNow()
      }

      setFeedback({
        tone: 'success',
        message: offline.isOnline
          ? 'Check-out en cola local. Se intento sincronizar de inmediato.'
          : 'Check-out guardado localmente. Se sincronizara cuando vuelva la conectividad.',
      })
      setCheckoutPosition(null)
      setCheckoutEstadoGps('PENDIENTE')
      setCheckoutJustificacion('')
      setCheckoutSelfieCapture(null)
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'No fue posible guardar el check-out local.',
      })
    } finally {
      setIsClosingShift(false)
    }
  }

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <OfflineStatusCard
        offline={offline}
        title="Operacion offline de asistencias"
        description="La cola local conserva capturas de check-in para sincronizarlas cuando vuelva la conectividad."
      />

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Registros totales" value={String(data.resumen.total)} />
        <MetricCard label="Jornadas abiertas" value={String(data.resumen.abiertas)} />
        <MetricCard label="Pendientes validacion" value={String(data.resumen.pendientesValidacion)} />
        <MetricCard label="Fuera geocerca" value={String(data.resumen.fueraGeocerca)} />
        <MetricCard label="Cerradas" value={String(data.resumen.cerradas)} />
        <MetricCard label="Dias justificados" value={String(data.resumen.justificadas)} />
      </div>

      <NativeCameraSelfieDialog
        open={activeCameraFlow === 'check-in'}
        title="Selfie nativa de check-in"
        description="La cámara frontal se abre en vivo para capturar la selfie operativa del check-in."
        onClose={() => setActiveCameraFlow(null)}
        onCapture={handleCaptureCheckInSelfie}
      />
      <NativeCameraSelfieDialog
        open={activeCameraFlow === 'check-out'}
        title="Selfie nativa de check-out"
        description="Captura la selfie de salida desde la cámara nativa antes de cerrar la jornada."
        onClose={() => setActiveCameraFlow(null)}
        onCapture={handleCaptureCheckOutSelfie}
      />

      <Card className="border-slate-200 bg-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              Disciplina operativa
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">
              Faltas, retardos y ausencias justificadas
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Este corte deriva incidencias sobre asignaciones publicadas, asistencias validas y solicitudes aprobadas.
              La falta administrativa se genera automaticamente al acumular tres retardos en el periodo visible.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Incidencias visibles: <span className="font-semibold text-slate-950">{data.incidenciasDisciplina.length}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Retardos" value={String(data.disciplinaResumen.retardos)} />
          <MetricCard label="Faltas" value={String(data.disciplinaResumen.faltas)} />
          <MetricCard label="Ausencias justificadas" value={String(data.disciplinaResumen.ausenciasJustificadas)} />
          <MetricCard label="Pendientes validacion" value={String(data.disciplinaResumen.pendientesValidacion)} />
          <MetricCard label="Falta administrativa" value={String(data.disciplinaResumen.faltasAdministrativas)} />
        </div>

        {data.incidenciasDisciplina.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">
            No se detectaron incidencias derivadas en el rango visible de asistencias.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Empleado</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {data.incidenciasDisciplina.map((item) => (
                  <tr
                    key={`${item.assignmentId}-${item.fecha}-${item.estado}`}
                    className="border-t border-slate-100 align-top"
                  >
                    <td className="px-4 py-3 text-slate-600">{item.fecha}</td>
                    <td className="px-4 py-3 text-slate-900">{item.empleado}</td>
                    <td className="px-4 py-3 text-slate-600">{item.cuentaCliente ?? 'Sin cliente'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {item.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.estado === 'RETARDO'
                        ? `${item.minutosRetardo ?? 0} min sobre ${item.horarioEsperado ?? 'sin horario'}`
                        : item.estado === 'AUSENCIA_JUSTIFICADA'
                          ? 'Solicitud aprobada ligada al dia.'
                          : item.estado === 'PENDIENTE_VALIDACION'
                            ? 'Check-in en revision manual.'
                            : 'Sin check-in valido en el dia laborable esperado.'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="border-slate-200 bg-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              Captura local
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">
              Nuevo borrador de asistencia
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Esta captura ya puede tomar geolocalizacion viva y selfie local. Cuando sincroniza, la selfie
              se sube por el pipeline compartido de evidencias manteniendo hash, metadata y posicion.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Plantillas recientes: <span className="font-semibold text-slate-950">{data.asistencias.length}</span>
          </div>
        </div>

        {data.asistencias.length === 0 ? (
          <p className="mt-6 text-sm text-amber-700">
            Aun no hay asistencias recientes para tomar como contexto base.
          </p>
        ) : (
          <form className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleQueueDraft}>
            <label className="block text-sm text-slate-600 xl:col-span-2">
              Contexto base
              <select
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                value={contextId}
                onChange={(event) => setContextId(event.target.value)}
              >
                {data.asistencias.map((asistencia) => (
                  <option key={asistencia.id} value={asistencia.id}>
                    {asistencia.empleado} - {asistencia.pdvClaveBtl} - {asistencia.fechaOperacion}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-slate-600">
              Fecha operacion
              <input
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                type="date"
                value={fechaOperacion}
                onChange={(event) => setFechaOperacion(event.target.value)}
              />
            </label>

            <label className="block text-sm text-slate-600">
              Hora check-in
              <input
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                type="time"
                value={horaCheckIn}
                onChange={(event) => setHoraCheckIn(event.target.value)}
              />
            </label>

            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-slate-700 md:col-span-2 xl:col-span-4">
              <p className="font-semibold text-slate-950">Mision del dia</p>
              {currentMission ? (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex rounded-full bg-white px-3 py-1 font-semibold text-sky-700">
                      {currentMission.codigo ?? 'SIN-CODIGO'}
                    </span>
                    {missionSelection.avoidedImmediateRepeat && (
                      <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800">
                        No repetida contra la visita anterior
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{currentMission.instruccion}</p>
                  {selectedContext?.ultimaMisionCodigo && (
                    <p className="mt-2 text-xs text-slate-500">
                      Ultima mision en este PDV: {selectedContext.ultimaMisionCodigo}
                    </p>
                  )}
                  <label className="mt-4 flex items-start gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      checked={misionConfirmada}
                      onChange={(event) => setMisionConfirmada(event.target.checked)}
                    />
                    <span>Lei la mision del dia y confirmo que la ejecutare durante esta jornada.</span>
                  </label>
                </>
              ) : (
                <p className="mt-2 text-sm text-rose-700">No hay misiones activas disponibles para asignar este check-in.</p>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700 md:col-span-2 xl:col-span-2">
              <p className="font-semibold text-slate-950">Contexto GPS</p>
              {tieneGeocerca && selectedContext ? (
                <>
                  <p className="mt-2">
                    Objetivo: {Number(selectedContext.geocercaLatitud).toFixed(6)},{' '}
                    {Number(selectedContext.geocercaLongitud).toFixed(6)}
                  </p>
                  <p className="mt-1">Radio permitido: {selectedContext.geocercaRadioMetros} m</p>
                  <p className="mt-1">
                    Justificacion fuera de geocerca:{' '}
                    {selectedContext.permiteCheckinConJustificacion ? 'Permitida' : 'No permitida'}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-amber-700">
                  Este contexto no tiene geocerca disponible; puedes capturar sin validacion espacial.
                </p>
              )}
              {capturedPosition && (
                <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-600">
                  <p>
                    Captura:{' '}
                    {capturedPosition.latitud !== null && capturedPosition.longitud !== null
                      ? `${capturedPosition.latitud.toFixed(6)}, ${capturedPosition.longitud.toFixed(6)}`
                      : 'GPS no disponible'}
                  </p>
                  <p className="mt-1">Precision estimada: {capturedPosition.precision ?? 'N/D'} m</p>
                  <p className="mt-1">
                    Distancia a geocerca:{' '}
                    {capturedPosition.distanciaMetros !== null
                      ? Math.round(capturedPosition.distanciaMetros)
                      : 'N/D'}{' '}
                    m
                  </p>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <Button type="button" variant="outline" onClick={handleCapturePosition} isLoading={isLocating}>
                  Capturar ubicacion
                </Button>
                {capturedPosition && (
                  <Button type="button" variant="ghost" onClick={() => setCapturedPosition(null)}>
                    Limpiar GPS
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700 md:col-span-2 xl:col-span-2">
              <p className="font-semibold text-slate-950">Selfie de check-in</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                La captura usa la cámara nativa vía getUserMedia, sella la selfie con fecha, hora y GPS visible, y la comprime en cliente antes de subirla para mantener un peso operativo controlado.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveCameraFlow('check-in')}
                  isLoading={isReadingSelfie}
                >
                  Abrir cámara frontal
                </Button>
                {selfieCapture ? (
                  <Button type="button" variant="ghost" onClick={() => setSelfieCapture(null)}>
                    Limpiar selfie
                  </Button>
                ) : null}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                No se permite galería ni selección manual de archivo para el check-in operativo.
              </p>
              {selfieCapture ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-950">{selfieCapture.fileName}</p>
                  <p className="mt-1">Tamano final: {Math.round(selfieCapture.fileSize / 1024)} KB</p>
                  <p className="mt-1">Tamano original: {Math.round(selfieCapture.originalBytes / 1024)} KB</p>
                  <p className="mt-1">Objetivo cliente: {Math.round(selfieCapture.targetBytes / 1024)} KB ({selfieCapture.targetMet ? 'cumplido' : 'parcial'})</p>
                  <p className="mt-1 break-all">Hash: {selfieCapture.hash}</p>
                  <p className="mt-1">
                    GPS:{' '}
                    {selfieCapture.latitud !== null && selfieCapture.longitud !== null
                      ? `${selfieCapture.latitud.toFixed(6)}, ${selfieCapture.longitud.toFixed(6)}`
                      : 'No disponible'}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">Sin selfie capturada todavia.</p>
              )}
            </div>

            <label className="block text-sm text-slate-600">
              Estado GPS
              <select
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                value={estadoGps}
                onChange={(event) =>
                  setEstadoGps(
                    event.target.value as 'PENDIENTE' | 'DENTRO_GEOCERCA' | 'FUERA_GEOCERCA' | 'SIN_GPS'
                  )
                }
              >
                <option value="PENDIENTE">PENDIENTE</option>
                <option value="DENTRO_GEOCERCA">DENTRO_GEOCERCA</option>
                <option value="FUERA_GEOCERCA">FUERA_GEOCERCA</option>
                <option value="SIN_GPS">SIN_GPS</option>
              </select>
            </label>

            <div className="block text-sm text-slate-600">
              <p>Biometria</p>
              <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                <p className="font-medium text-slate-950">Validacion biometrica del servidor</p>
                <p className="mt-1 text-xs text-slate-600">
                  El check-in se sincroniza con selfie nativa y el servidor decide el estado final contra la referencia del expediente.
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Estado inicial enviado: {selfieCapture ? 'PENDIENTE' : biometriaEstado}
                </p>
              </div>
            </div>

            <label className="block text-sm text-slate-600">
              Estatus
              <select
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                value={estatus}
                onChange={(event) =>
                  setEstatus(
                    event.target.value as 'PENDIENTE_VALIDACION' | 'VALIDA' | 'RECHAZADA' | 'CERRADA'
                  )
                }
              >
                <option value="PENDIENTE_VALIDACION">PENDIENTE_VALIDACION</option>
                <option value="VALIDA">VALIDA</option>
                <option value="RECHAZADA">RECHAZADA</option>
                <option value="CERRADA">CERRADA</option>
              </select>
            </label>

            <label className="block text-sm text-slate-600">
              Distancia check-in (m)
              <input
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                type="number"
                min="0"
                value={distancia}
                onChange={(event) => setDistancia(event.target.value)}
                placeholder="100"
              />
            </label>

            <label className="block text-sm text-slate-600 xl:col-span-4">
              Justificacion
              <textarea
                className="mt-2 min-h-28 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                value={justificacion}
                onChange={(event) => setJustificacion(event.target.value)}
                placeholder="Obligatoria cuando el GPS queda fuera de geocerca."
              />
            </label>

            <div className="xl:col-span-4 flex flex-wrap items-center gap-3">
              <Button type="submit" isLoading={isSaving} disabled={!offline.isSupported}>
                Guardar borrador local
              </Button>
              {feedback && (
                <p
                  className={`text-sm ${
                    feedback.tone === 'success' ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {feedback.message}
                </p>
              )}
            </div>
          </form>
        )}
      </Card>

      <Card className="border-slate-200 bg-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              Cierre de jornada
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">Check-out operativo</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              El cierre usa la asistencia abierta seleccionada, requiere coordenadas de salida y bloquea la jornada si quedan ventas sin confirmar.
            </p>
          </div>
          {openAttendance ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Jornada abierta: <span className="font-semibold text-slate-950">{openAttendance.pdvClaveBtl}</span>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              El contexto actual no tiene una jornada abierta.
            </div>
          )}
        </div>

        {!openAttendance ? (
          <p className="mt-6 text-sm text-slate-600">
            Selecciona una asistencia con check-in activo y sin check-out para capturar el cierre de jornada.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700 md:col-span-2">
              <p className="font-semibold text-slate-950">Resumen comercial</p>
              <p className="mt-2">Ventas confirmadas: <span className="font-semibold text-emerald-700">{openAttendance.ventasConfirmadas}</span></p>
              <p className="mt-1">Ventas pendientes: <span className="font-semibold text-rose-700">{openAttendance.ventasPendientesConfirmacion}</span></p>
              <p className="mt-3 text-xs text-slate-500">
                Si hay ventas pendientes, el endpoint rechazara el cierre con conflicto operacional.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700 md:col-span-2">
              <p className="font-semibold text-slate-950">Ubicacion de salida</p>
              {checkoutPosition ? (
                <div className="mt-3 text-xs text-slate-600">
                  <p>
                    Captura:{' '}
                    {checkoutPosition.latitud !== null && checkoutPosition.longitud !== null
                      ? `${checkoutPosition.latitud.toFixed(6)}, ${checkoutPosition.longitud.toFixed(6)}`
                      : 'GPS no disponible'}
                  </p>
                  <p className="mt-1">Precision estimada: {checkoutPosition.precision ?? 'N/D'} m</p>
                  <p className="mt-1">
                    Distancia a geocerca:{' '}
                    {checkoutPosition.distanciaMetros !== null ? Math.round(checkoutPosition.distanciaMetros) : 'N/D'} m
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600">Aun no se capturan coordenadas de salida.</p>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCheckoutPosition}
                  isLoading={isCapturingCheckoutPosition}
                >
                  Capturar salida GPS
                </Button>
                {checkoutPosition && (
                  <Button type="button" variant="ghost" onClick={() => setCheckoutPosition(null)}>
                    Limpiar salida
                  </Button>
                )}
              </div>
            </div>

            <label className="block text-sm text-slate-600">
              Estado GPS salida
              <select
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                value={checkoutEstadoGps}
                onChange={(event) =>
                  setCheckoutEstadoGps(
                    event.target.value as 'PENDIENTE' | 'DENTRO_GEOCERCA' | 'FUERA_GEOCERCA' | 'SIN_GPS'
                  )
                }
              >
                <option value="PENDIENTE">PENDIENTE</option>
                <option value="DENTRO_GEOCERCA">DENTRO_GEOCERCA</option>
                <option value="FUERA_GEOCERCA">FUERA_GEOCERCA</option>
                <option value="SIN_GPS">SIN_GPS</option>
              </select>
            </label>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-950">Selfie de salida</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveCameraFlow('check-out')}
                  isLoading={isReadingCheckoutSelfie}
                >
                  Abrir cámara de salida
                </Button>
                {checkoutSelfieCapture ? (
                  <Button type="button" variant="ghost" onClick={() => setCheckoutSelfieCapture(null)}>
                    Limpiar selfie
                  </Button>
                ) : null}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                La selfie de salida se captura también con cámara nativa; sigue siendo opcional si la política del cliente no la exige.
              </p>
              {checkoutSelfieCapture ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-950">{checkoutSelfieCapture.fileName}</p>
                  <p className="mt-1">Tamano final: {Math.round(checkoutSelfieCapture.fileSize / 1024)} KB</p>
                  <p className="mt-1">Tamano original: {Math.round(checkoutSelfieCapture.originalBytes / 1024)} KB</p>
                  <p className="mt-1">Objetivo cliente: {Math.round(checkoutSelfieCapture.targetBytes / 1024)} KB ({checkoutSelfieCapture.targetMet ? 'cumplido' : 'parcial'})</p>
                  <p className="mt-1 break-all">Hash: {checkoutSelfieCapture.hash}</p>
                  <p className="mt-1">
                    GPS:{' '}
                    {checkoutSelfieCapture.latitud !== null && checkoutSelfieCapture.longitud !== null
                      ? `${checkoutSelfieCapture.latitud.toFixed(6)}, ${checkoutSelfieCapture.longitud.toFixed(6)}`
                      : 'No disponible'}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">La selfie de salida es opcional si la politica del cliente no la exige.</p>
              )}
            </div>

            <label className="block text-sm text-slate-600 md:col-span-2 xl:col-span-4">
              Justificacion de salida
              <textarea
                className="mt-2 min-h-24 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                value={checkoutJustificacion}
                onChange={(event) => setCheckoutJustificacion(event.target.value)}
                placeholder="Obligatoria si el cierre queda fuera de geocerca."
              />
            </label>

            <div className="md:col-span-2 xl:col-span-4 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={handleQueueCheckout}
                isLoading={isClosingShift}
                disabled={!offline.isSupported || openAttendance.ventasPendientesConfirmacion > 0}
              >
                Guardar check-out local
              </Button>
              {openAttendance.ventasPendientesConfirmacion > 0 && (
                <p className="text-sm text-rose-700">
                  Debes confirmar todas las ventas de esta jornada antes de cerrar el check-out.
                </p>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card className="border-slate-200 bg-white">
        <p className="text-sm text-slate-500">Cobertura funcional</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Base de jornada diaria con check-in, check-out, GPS, mision del dia, biometria y
          justificacion fuera de geocerca. La lectura operativa ya reconoce solicitudes aprobadas como dias justificados,
          sin eximir metas ni cuotas comerciales.
        </p>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Asistencias recientes</h2>
          <p className="mt-1 text-sm text-slate-500">
            Trazabilidad de jornada por empleado, PDV, estatus operativo y justificacion por solicitud.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">Empleado</th>
                <th className="px-6 py-3 font-medium">PDV</th>
                <th className="px-6 py-3 font-medium">Check-in / out</th>
                <th className="px-6 py-3 font-medium">GPS / ventas</th>
                <th className="px-6 py-3 font-medium">Biometria</th>
                <th className="px-6 py-3 font-medium">Estatus</th>
                <th className="px-6 py-3 font-medium">Mision</th>
              </tr>
            </thead>
            <tbody>
              {data.asistencias.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                    Sin registros visibles todavia.
                  </td>
                </tr>
              ) : (
                data.asistencias.map((asistencia) => (
                  <tr key={asistencia.id} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{asistencia.fechaOperacion}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {asistencia.cuentaCliente ?? 'Sin cliente'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{asistencia.empleado}</div>
                      {asistencia.diaJustificado && (
                        <div className="mt-2 text-xs font-medium text-emerald-700">
                          {asistencia.detalleJustificacion}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{asistencia.pdvClaveBtl}</div>
                      <div className="mt-1 text-xs text-slate-400">{asistencia.pdvNombre}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {asistencia.cadena ?? 'Sin cadena'} - {asistencia.zona ?? 'Sin zona'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>IN: {asistencia.checkInUtc ?? 'Sin check-in'}</div>
                      <div className="mt-1">OUT: {asistencia.checkOutUtc ?? 'Abierta'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill
                        active={asistencia.estadoGps === 'DENTRO_GEOCERCA'}
                        label={asistencia.estadoGps}
                      />
                      {asistencia.distanciaCheckInMetros !== null && (
                        <div className="mt-2 text-xs text-slate-500">
                          {asistencia.distanciaCheckInMetros} m
                        </div>
                      )}
                      {asistencia.justificacionFueraGeocerca && (
                        <div className="mt-2 text-xs text-amber-700">
                          {asistencia.justificacionFueraGeocerca}
                        </div>
                      )}
                      <div className="mt-2 text-xs text-slate-500">
                        Ventas OK: {asistencia.ventasConfirmadas}
                      </div>
                      <div className={`mt-1 text-xs ${asistencia.ventasPendientesConfirmacion > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        Pendientes: {asistencia.ventasPendientesConfirmacion}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill
                        active={asistencia.biometriaEstado === 'VALIDA'}
                        label={asistencia.biometriaEstado}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill
                        active={asistencia.estatus === 'VALIDA' || asistencia.estatus === 'CERRADA'}
                        label={asistencia.estatus}
                      />
                      {asistencia.diaJustificado && (
                        <div className="mt-2 text-xs text-emerald-700">
                          Dia justificado por {asistencia.solicitudRelacionadaTipo}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">
                        {asistencia.misionCodigo ?? 'Sin mision'}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {asistencia.misionInstruccion ?? 'Sin instruccion'}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="border-slate-200 bg-white">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">Paginacion incremental</p>
            <p className="mt-1 text-xs text-slate-500">
              Pagina {data.paginacion.page} de {data.paginacion.totalPages} | maximo{' '}
              {data.paginacion.pageSize} registros por pagina | total {data.paginacion.totalItems}
            </p>
          </div>
          <div className="flex gap-3">
            <PaginationLink
              href={buildPageHref(data, Math.max(1, data.paginacion.page - 1))}
              disabled={!canPrev}
            >
              Anterior
            </PaginationLink>
            <PaginationLink
              href={buildPageHref(
                data,
                Math.min(data.paginacion.totalPages, data.paginacion.page + 1)
              )}
              disabled={!canNext}
            >
              Siguiente
            </PaginationLink>
          </div>
        </div>
      </Card>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <SharedMetricCard label={label} value={value} />
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
      }`}
    >
      {label}
    </span>
  )
}

function PaginationLink({ href, disabled, children }: { href: string; disabled: boolean; children: string }) {
  if (disabled) {
    return (
      <span className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-400">
        {children}
      </span>
    )
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
    >
      {children}
    </Link>
  )
}
