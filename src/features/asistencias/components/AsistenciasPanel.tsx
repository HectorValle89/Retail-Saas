'use client'

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { OfflineStatusCard } from '@/components/pwa/OfflineStatusCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { queueOfflineAsistencia } from '@/lib/offline/syncQueue'
import type { AsistenciasPanelData } from '../services/asistenciaService'

function getLocalDateValue() {
  return new Intl.DateTimeFormat('en-CA').format(new Date())
}

function getLocalTimeValue() {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

function calcularDistanciaMetros(
  latitudOrigen: number,
  longitudOrigen: number,
  latitudDestino: number,
  longitudDestino: number
) {
  const radioTierra = 6371000
  const toRadians = (value: number) => (value * Math.PI) / 180
  const deltaLatitud = toRadians(latitudDestino - latitudOrigen)
  const deltaLongitud = toRadians(longitudDestino - longitudOrigen)
  const latitudOrigenRad = toRadians(latitudOrigen)
  const latitudDestinoRad = toRadians(latitudDestino)

  const haversine =
    Math.sin(deltaLatitud / 2) * Math.sin(deltaLatitud / 2) +
    Math.sin(deltaLongitud / 2) * Math.sin(deltaLongitud / 2) *
      Math.cos(latitudOrigenRad) *
      Math.cos(latitudDestinoRad)

  return 2 * radioTierra * Math.asin(Math.sqrt(haversine))
}

async function calcularHashArchivo(file: File) {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('Este navegador no soporta hashing seguro para selfie.')
  }

  const buffer = await file.arrayBuffer()
  const digest = await window.crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

interface CapturedPosition {
  latitud: number
  longitud: number
  precision: number | null
  distanciaMetros: number | null
  dentroGeocerca: boolean | null
  capturadaEn: string
}

interface SelfieCapture {
  hash: string
  fileName: string
  fileSize: number
  mimeType: string
  capturadaEn: string
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
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)

  const selectedContext = data.asistencias.find((item) => item.id === contextId) ?? null
  const tieneGeocerca =
    selectedContext?.geocercaLatitud !== null &&
    selectedContext?.geocercaLongitud !== null &&
    selectedContext?.geocercaRadioMetros !== null

  useEffect(() => {
    setCapturedPosition(null)
    setSelfieCapture(null)
    setDistancia('')
    setJustificacion('')
    setEstadoGps('PENDIENTE')
    setBiometriaEstado('PENDIENTE')
    setEstatus('PENDIENTE_VALIDACION')
    setFeedback(null)
  }, [contextId])

  const handleCapturePosition = async () => {
    if (!selectedContext) {
      setFeedback({ tone: 'error', message: 'Selecciona primero un contexto base.' })
      return
    }

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setFeedback({ tone: 'error', message: 'Este navegador no soporta geolocalizacion.' })
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

      setFeedback({ tone: 'error', message })
    } finally {
      setIsLocating(false)
    }
  }

  const handleSelfieChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      setSelfieCapture(null)
      return
    }

    setIsReadingSelfie(true)
    setFeedback(null)

    try {
      const hash = await calcularHashArchivo(file)
      setSelfieCapture({
        hash,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'image/jpeg',
        capturadaEn: new Date().toISOString(),
      })
      if (biometriaEstado === 'NO_EVALUADA') {
        setBiometriaEstado('PENDIENTE')
      }
      setFeedback({
        tone: 'success',
        message: 'Selfie capturada. Se guardara hash y metadata en el borrador local.',
      })
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'No fue posible procesar la selfie.',
      })
      setSelfieCapture(null)
    } finally {
      event.target.value = ''
      setIsReadingSelfie(false)
    }
  }

  const handleQueueDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!selectedContext) {
      setFeedback({ tone: 'error', message: 'Selecciona un contexto reciente para clonar la jornada.' })
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
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'No fue posible guardar el borrador offline.',
      })
    } finally {
      setIsSaving(false)
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

      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard label="Registros visibles" value={String(data.resumen.total)} />
        <MetricCard label="Jornadas abiertas" value={String(data.resumen.abiertas)} />
        <MetricCard label="Pendientes validacion" value={String(data.resumen.pendientesValidacion)} />
        <MetricCard label="Fuera geocerca" value={String(data.resumen.fueraGeocerca)} />
        <MetricCard label="Cerradas" value={String(data.resumen.cerradas)} />
      </div>

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
              Esta captura ya puede tomar geolocalizacion viva y selfie local. El sync remoto sigue
              guardando hash, metadata y posicion; el upload binario de imagen queda para la siguiente iteracion.
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

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700 md:col-span-2 xl:col-span-2">
              <p className="font-semibold text-slate-950">Contexto GPS</p>
              {tieneGeocerca && selectedContext ? (
                <>
                  <p className="mt-2">
                    Objetivo: {Number(selectedContext.geocercaLatitud).toFixed(6)}, {Number(selectedContext.geocercaLongitud).toFixed(6)}
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
                    Captura: {capturedPosition.latitud.toFixed(6)}, {capturedPosition.longitud.toFixed(6)}
                  </p>
                  <p className="mt-1">Precision estimada: {capturedPosition.precision ?? 'N/D'} m</p>
                  <p className="mt-1">Distancia a geocerca: {capturedPosition.distanciaMetros !== null ? Math.round(capturedPosition.distanciaMetros) : 'N/D'} m</p>
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
                La captura local calcula hash SHA-256 para trazabilidad. La carga binaria al storage se deja pendiente.
              </p>
              <label className="mt-4 block">
                <span className="sr-only">Capturar selfie</span>
                <input
                  className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={handleSelfieChange}
                  disabled={isReadingSelfie}
                />
              </label>
              {selfieCapture ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-950">{selfieCapture.fileName}</p>
                  <p className="mt-1">Tamano: {Math.round(selfieCapture.fileSize / 1024)} KB</p>
                  <p className="mt-1 break-all">Hash: {selfieCapture.hash}</p>
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

            <label className="block text-sm text-slate-600">
              Biometria
              <select
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                value={biometriaEstado}
                onChange={(event) =>
                  setBiometriaEstado(
                    event.target.value as 'PENDIENTE' | 'VALIDA' | 'RECHAZADA' | 'NO_EVALUADA'
                  )
                }
              >
                <option value="PENDIENTE">PENDIENTE</option>
                <option value="VALIDA">VALIDA</option>
                <option value="RECHAZADA">RECHAZADA</option>
                <option value="NO_EVALUADA">NO_EVALUADA</option>
              </select>
            </label>

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
        <p className="text-sm text-slate-500">Cobertura funcional</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Base de jornada diaria con check-in, check-out, GPS, mision del dia, biometria y
          justificacion fuera de geocerca. La captura local ya toma posicion viva y selfie con hash;
          el siguiente paso es subir imagen al storage y validar biometria real.
        </p>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Asistencias recientes</h2>
          <p className="mt-1 text-sm text-slate-500">
            Trazabilidad de jornada por empleado, PDV y estatus operativo.
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
                <th className="px-6 py-3 font-medium">GPS</th>
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
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-slate-200 bg-white">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </Card>
  )
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


