'use client'

import { type ReactNode, useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ModalPanel } from '@/components/ui/modal-panel'
import { NativeCameraSelfieDialog } from '@/features/asistencias/components/NativeCameraSelfieDialog'
import {
  calcularHashArchivo,
  captureAttendancePosition,
  stampAttendanceSelfie,
  type AttendanceGpsState,
  type CapturedPosition,
} from '@/features/asistencias/lib/attendanceCapture'
import {
  registrarInicioVisitaRutaSemanal,
  registrarEvidenciaEventoAgendaRutaSemanal,
  registrarSalidaVisitaRutaSemanal,
} from '../actions'
import { injectDirectR2Upload } from '@/lib/storage/directR2Client'
import { ESTADO_RUTA_INICIAL } from '../state'
import {
  SUPERVISOR_CHECKLIST_ITEMS,
  calculateSupervisorChecklistCompletion,
  isSupervisorChecklistItemNotApplicable,
  type SupervisorChecklistKey,
} from '../lib/supervisorVisitChecklist'
import type {
  SupervisorTodayRouteData,
  RutaAgendaEventoItem,
  RutaSemanalVisitItem,
} from '../services/rutaSemanalService'

interface SupervisorTodayRouteSheetProps {
  data: SupervisorTodayRouteData | null
  onSuccess: (message: string) => void
  onError: (message: string) => void
  dayEventActionSlot?: ReactNode
  onDayEventModalClose?: () => void
}

interface CapturedDraft {
  file: File
  previewUrl: string
  hash: string
  capturedAt: string
  position: CapturedPosition
  gpsState: AttendanceGpsState
}

export function SupervisorTodayRouteSheet({
  data,
  onSuccess,
  onError,
  dayEventActionSlot: dayEventActionContent,
  onDayEventModalClose,
}: SupervisorTodayRouteSheetProps) {
  const [selectedVisit, setSelectedVisit] = useState<RutaSemanalVisitItem | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<RutaAgendaEventoItem | null>(null)
  const [visitItems, setVisitItems] = useState<RutaSemanalVisitItem[]>(() => data?.visitasHoy ?? [])
  const [eventItems, setEventItems] = useState<RutaAgendaEventoItem[]>(() => data?.eventosHoy ?? [])

  useEffect(() => {
    setVisitItems(data?.visitasHoy ?? [])
    setEventItems(data?.eventosHoy ?? [])
  }, [data])

  const visits = visitItems
  const actionableEvents = eventItems.filter((event) => event.estatusAprobacion !== 'RECHAZADO')

  if (!data) {
    return (
      <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        La ruta semanal todavia no esta disponible para este supervisor.
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <Card className="bg-white p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
            Ruta de hoy
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">
            {visits.length === 0 ? 'Sin tiendas programadas' : `${visits.length} tienda(s) por visitar`}
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            Revisa el orden del dia, registra llegada, checklist opcional, evento del dia y cierre.
          </p>
        </Card>

        <TodayRouteDayEventSection content={dayEventActionContent} onClose={onDayEventModalClose} />

        {visits.length === 0 ? (
          <Card className="bg-slate-50 p-5 text-sm text-slate-500">
            No hay tiendas planificadas para hoy dentro de la ruta semanal visible.
          </Card>
        ) : (
          <div className="space-y-3">
            {visits.map((visit) => (
              <button
                key={visit.id}
                type="button"
                onClick={() => setSelectedVisit(visit)}
                className="w-full rounded-[22px] border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-[var(--module-border)] hover:bg-[var(--module-soft-bg)]"
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.8fr))_auto] lg:items-center">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-950">{visit.pdv ?? 'PDV sin nombre'}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {visit.pdvClaveBtl ?? 'Sin clave'} · {visit.zona ?? 'Sin zona'}
                    </p>
                  </div>
                  <SummaryPill label="Orden" value={`#${visit.orden}`} />
                  <SummaryPill
                    label="Llegada"
                    value={visit.checkInAt ? 'Registrada' : 'Pendiente'}
                    tone={visit.checkInAt ? 'emerald' : 'amber'}
                  />
                  <SummaryPill
                    label="Checklist"
                    value={`${visit.checklistCompletion}%`}
                    tone={visit.checklistCompletion === 100 ? 'emerald' : 'sky'}
                  />
                  <SummaryPill
                    label="Salida"
                    value={visit.checkOutAt ? 'Cerrada' : 'Pendiente'}
                    tone={visit.checkOutAt ? 'emerald' : 'slate'}
                  />
                  <div className="flex justify-end">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                      Abrir visita
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {actionableEvents.length > 0 ? (
          <Card className="bg-white p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
              Eventos del dia
            </p>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">
              {actionableEvents.length} evento(s) operativos por ejecutar
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Aqui aparecen las visitas adicionales y eventos extraordinarios registrados para hoy.
            </p>
            <div className="mt-4 space-y-3">
              {actionableEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => setSelectedEvent(event)}
                  className="w-full rounded-[22px] border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-[var(--module-border)] hover:bg-[var(--module-soft-bg)]"
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.9fr))_auto] lg:items-center">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-slate-950">{event.titulo}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {event.tipoLabel} · {event.pdv ?? event.sede ?? 'Sin sede'}
                      </p>
                    </div>
                    <SummaryPill label="Hora" value={event.horaInicio ?? 'Pendiente'} />
                    <SummaryPill
                      label="Aprobacion"
                      value={event.estatusAprobacion === 'NO_REQUIERE' ? 'Lista' : event.estatusAprobacion}
                      tone={event.estatusAprobacion === 'APROBADO' || event.estatusAprobacion === 'NO_REQUIERE' ? 'emerald' : 'amber'}
                    />
                    <SummaryPill
                      label="Ejecucion"
                      value={event.estatusEjecucion === 'COMPLETADO' ? 'Cerrado' : event.estatusEjecucion === 'EN_CURSO' ? 'En curso' : 'Pendiente'}
                      tone={event.estatusEjecucion === 'COMPLETADO' ? 'emerald' : event.estatusEjecucion === 'EN_CURSO' ? 'sky' : 'amber'}
                    />
                    <SummaryPill
                      label="Tipo"
                      value={event.tipoEvento === 'VISITA_ADICIONAL' ? 'Visita' : 'Evento'}
                    />
                    <div className="flex justify-end">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                        Abrir evento
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        ) : null}
      </div>

      <ModalPanel
        open={Boolean(selectedVisit)}
        onClose={() => setSelectedVisit(null)}
        title={selectedVisit ? `Visita en ${selectedVisit.pdv ?? 'PDV'}` : 'Visita'}
        subtitle="Registra llegada, checklist y salida de la supervision."
      >
        {selectedVisit && (
          <SupervisorVisitExecutionPanel
            key={selectedVisit.id}
            visit={selectedVisit}
            onClose={() => setSelectedVisit(null)}
            onSuccess={(message, nextVisit) => {
              setSelectedVisit(nextVisit)
              onSuccess(message)
            }}
            onError={onError}
          />
        )}
      </ModalPanel>

      <ModalPanel
        open={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        title={selectedEvent ? selectedEvent.titulo : 'Evento del dia'}
        subtitle="Registra la evidencia operativa del evento con selfie, motivo y GPS silencioso."
      >
        {selectedEvent ? (
          <SupervisorDayEventExecutionPanel
            key={selectedEvent.id}
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onSuccess={(message, nextEvent) => {
              setEventItems((current) =>
                current.map((item) => (item.id === nextEvent.id ? nextEvent : item))
              )
              setSelectedEvent(nextEvent)
              onSuccess(message)
            }}
            onError={onError}
          />
        ) : null}
      </ModalPanel>
    </>
  )
}

function SupervisorDayEventExecutionPanel({
  event,
  onClose,
  onSuccess,
  onError,
}: {
  event: RutaAgendaEventoItem
  onClose: () => void
  onSuccess: (message: string, nextEvent: RutaAgendaEventoItem) => void
  onError: (message: string) => void
}) {
  const [currentEvent, setCurrentEvent] = useState(event)
  const [comments, setComments] = useState(event.descripcion ?? '')
  const [draft, setDraft] = useState<CapturedDraft | null>(null)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    return () => {
      if (draft?.previewUrl) {
        URL.revokeObjectURL(draft.previewUrl)
      }
    }
  }, [draft])

  const buildSilentGpsFallback = (): { position: CapturedPosition; estadoGps: AttendanceGpsState } => ({
    position: {
      latitud: null,
      longitud: null,
      precision: null,
      distanciaMetros: null,
      dentroGeocerca: null,
      capturadaEn: new Date().toISOString(),
    },
    estadoGps: 'SIN_GPS',
  })

  const handleCapture = async (file: File) => {
    const gpsCapture = await captureAttendancePosition({
      geocercaLatitud: null,
      geocercaLongitud: null,
      geocercaRadioMetros: null,
    }).catch(() => buildSilentGpsFallback())
    const capturedAt = new Date().toISOString()
    const stamped = await stampAttendanceSelfie(file, {
      capturedAt,
      latitude: gpsCapture.position.latitud,
      longitude: gpsCapture.position.longitud,
      flowLabel: 'Evidencia',
      hideGpsCoordinates: true,
    })
    const hash = await calcularHashArchivo(stamped.file)
    setDraft((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl)
      }
      return {
        file: stamped.file,
        previewUrl: URL.createObjectURL(stamped.file),
        hash,
        capturedAt,
        position: gpsCapture.position,
        gpsState: gpsCapture.estadoGps,
      }
    })
  }

  const submitEvent = () => {
    if (!draft) {
      onError('Primero toma la selfie del evento.')
      return
    }

    if (!comments.trim()) {
      onError('Agrega el motivo o hallazgo principal del evento.')
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.set('agenda_evento_id', currentEvent.id)
      formData.set('selfie_file', draft.file)
      formData.set('latitud', String(draft.position.latitud ?? ''))
      formData.set('longitud', String(draft.position.longitud ?? ''))
      formData.set('distancia_metros', String(draft.position.distanciaMetros ?? ''))
      formData.set('estado_gps', draft.gpsState)
      formData.set('comments', comments)

      try {
        await injectDirectR2Upload(formData, draft.file, {
          modulo: 'rutas',
          removeFieldName: 'selfie_file',
          fieldNames: {
            objectKey: 'selfie_r2_object_key',
            sha256: 'selfie_r2_sha256',
            fileName: 'selfie_r2_file_name',
            contentType: 'selfie_r2_type',
            size: 'selfie_r2_size',
          },
          thumbnailFieldNames: {
            objectKey: 'selfie_thumbnail_r2_object_key',
            sha256: 'selfie_thumbnail_r2_sha256',
            fileName: 'selfie_thumbnail_r2_file_name',
            contentType: 'selfie_thumbnail_r2_type',
            size: 'selfie_thumbnail_r2_size',
          },
        })
      } catch (error) {
        console.error('No fue posible subir la selfie del evento a R2.', error)
      }

      const result = await registrarEvidenciaEventoAgendaRutaSemanal(ESTADO_RUTA_INICIAL, formData)
      if (!result.ok) {
        onError(result.message ?? 'No fue posible registrar el evento.')
        return
      }

      const nextEvent: RutaAgendaEventoItem = {
        ...currentEvent,
        descripcion: comments,
        estatusEjecucion: 'COMPLETADO',
        selfieUrl: draft.previewUrl,
        checkInAt: draft.capturedAt,
        checkOutAt: draft.capturedAt,
      }

      setCurrentEvent(nextEvent)
      onSuccess(result.message ?? 'Evento operativo registrado.', nextEvent)
      onClose()
    })
  }

  return (
    <div className="space-y-4">
      <Card className="bg-slate-50 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailItem label="Evento" value={currentEvent.titulo} />
          <DetailItem label="Tipo" value={currentEvent.tipoLabel} />
          <DetailItem label="Punto de venta" value={currentEvent.pdv ?? currentEvent.sede ?? 'Sin sede'} />
          <DetailItem label="Hora" value={currentEvent.horaInicio ?? 'Pendiente'} />
        </div>
      </Card>

      <Card className="bg-white p-4">
        <p className="text-sm font-semibold text-slate-950">Evidencia del evento</p>
        <p className="mt-1 text-sm text-slate-600">
          Captura unica con selfie, motivo y GPS silencioso para dejar trazabilidad del evento operativo.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => setIsCameraOpen(true)} className="w-full sm:w-auto">
            {currentEvent.checkInAt ? 'Evento registrado' : 'Abrir selfie'}
          </Button>
          {currentEvent.checkInAt ? (
            <span className="text-sm text-emerald-700">
              Registrado: {new Date(currentEvent.checkInAt).toLocaleString('es-MX')}
            </span>
          ) : null}
        </div>

        {draft ? (
          <div className="mt-4 overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50">
            <img src={draft.previewUrl} alt="Borrador del evento" className="aspect-[4/5] w-full object-cover" />
            <div className="space-y-3 px-4 py-4">
              <div className="text-sm text-slate-600">
                <p className="font-semibold text-slate-950">Selfie lista para enviar</p>
                <p>Hora: {new Date(draft.capturedAt).toLocaleString('es-MX')}</p>
              </div>
            </div>
          </div>
        ) : null}

        <label className="mt-4 block text-sm text-slate-700">
          <span className="font-semibold">Motivo y hallazgos del evento</span>
          <textarea
            value={comments}
            onChange={(nextEvent) => setComments(nextEvent.target.value)}
            rows={3}
            className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
          />
        </label>

        {draft ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" onClick={submitEvent} disabled={isPending} className="w-full sm:w-auto">
              {isPending ? 'Enviando...' : 'Confirmar evento'}
            </Button>
          </div>
        ) : null}
      </Card>

      <div className="flex justify-end">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </div>

      <NativeCameraSelfieDialog
        open={isCameraOpen}
        title="Selfie del evento"
        description="Toma la selfie del evento operativo. El GPS se intentara capturar en segundo plano."
        captureLabel="Capturar selfie"
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCapture}
      />
    </div>
  )
}

function SupervisorVisitExecutionPanel({
  visit,
  onClose,
  onSuccess,
  onError,
}: {
  visit: RutaSemanalVisitItem
  onClose: () => void
  onSuccess: (message: string, nextVisit: RutaSemanalVisitItem) => void
  onError: (message: string) => void
}) {
  const [currentVisit, setCurrentVisit] = useState(visit)
  const [checklist, setChecklist] = useState<Record<SupervisorChecklistKey, boolean>>(() =>
    Object.fromEntries(
      SUPERVISOR_CHECKLIST_ITEMS.map((item) => [item.key, visit.checklistCalidad?.[item.key] ?? false])
    ) as Record<SupervisorChecklistKey, boolean>
  )
  const [checklistComments, setChecklistComments] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      SUPERVISOR_CHECKLIST_ITEMS.flatMap((item) =>
        'commentKey' in item ? [[item.commentKey, visit.checklistComments?.[item.commentKey] ?? '']] : []
      )
    )
  )
  const [loveIsdinRecordsCount, setLoveIsdinRecordsCount] = useState(
    visit.loveIsdinRecordsCount !== null ? String(visit.loveIsdinRecordsCount) : ''
  )
  const [comments, setComments] = useState(visit.comentarios ?? '')
  const [isStartCameraOpen, setIsStartCameraOpen] = useState(false)
  const [isEndCameraOpen, setIsEndCameraOpen] = useState(false)
  const [isEvidenceCameraOpen, setIsEvidenceCameraOpen] = useState(false)
  const [startDraft, setStartDraft] = useState<CapturedDraft | null>(null)
  const [endDraft, setEndDraft] = useState<CapturedDraft | null>(null)
  const [evidenceDraft, setEvidenceDraft] = useState<CapturedDraft | null>(null)
  const [isPending, startTransition] = useTransition()
  const gpsPromiseRef = useRef<Promise<{ position: CapturedPosition; estadoGps: AttendanceGpsState }> | null>(null)

  useEffect(() => {
    return () => {
      if (startDraft?.previewUrl) {
        URL.revokeObjectURL(startDraft.previewUrl)
      }
      if (endDraft?.previewUrl) {
        URL.revokeObjectURL(endDraft.previewUrl)
      }
      if (evidenceDraft?.previewUrl) {
        URL.revokeObjectURL(evidenceDraft.previewUrl)
      }
    }
  }, [endDraft, evidenceDraft, startDraft])

  const checklistScore = calculateSupervisorChecklistCompletion(checklist)
  const checklistCheckedCount = checklistScore.checkedCount
  const checklistCompletion = checklistScore.percentage
  const canStartVisit = !currentVisit.checkInAt
  const canFinishVisit = Boolean(currentVisit.checkInAt) && !currentVisit.checkOutAt
  const canOpenChecklist = Boolean(currentVisit.checkInAt)

  const buildSilentGpsFallback = (): { position: CapturedPosition; estadoGps: AttendanceGpsState } => ({
    position: {
      latitud: null,
      longitud: null,
      precision: null,
      distanciaMetros: null,
      dentroGeocerca: null,
      capturadaEn: new Date().toISOString(),
    },
    estadoGps: 'SIN_GPS',
  })

  const beginGpsCapture = () => {
    if (gpsPromiseRef.current) {
      return gpsPromiseRef.current
    }

    const pending = captureAttendancePosition({
      geocercaLatitud: currentVisit.latitud,
      geocercaLongitud: currentVisit.longitud,
      geocercaRadioMetros:
        currentVisit.latitud !== null && currentVisit.longitud !== null
          ? currentVisit.geocercaRadioMetros ?? 100
          : null,
    })
      .then((result) => {
        return result
      })
      .catch(() => buildSilentGpsFallback())
      .finally(() => {
        gpsPromiseRef.current = null
      })

    gpsPromiseRef.current = pending
    return pending
  }

  const handleCapture = async (
    file: File,
    flowLabel: 'Check-in' | 'Check-out' | 'Evidencia',
    assignDraft: (draft: CapturedDraft) => void
  ) => {
    const gpsCapture = await beginGpsCapture()
    const capturedAt = new Date().toISOString()
    const stamped = await stampAttendanceSelfie(file, {
      capturedAt,
      latitude: gpsCapture.position.latitud,
      longitude: gpsCapture.position.longitud,
      flowLabel,
      hideGpsCoordinates: true,
    })
    const hash = await calcularHashArchivo(stamped.file)
    assignDraft({
      file: stamped.file,
      previewUrl: URL.createObjectURL(stamped.file),
      hash,
      capturedAt,
      position: gpsCapture.position,
      gpsState: gpsCapture.estadoGps,
    })
  }

  const submitStartVisit = () => {
    if (!startDraft) {
      onError('Primero toma la selfie de llegada.')
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.set('visita_id', currentVisit.id)
      formData.set('selfie_file', startDraft.file)
      formData.set('latitud', String(startDraft.position.latitud ?? ''))
      formData.set('longitud', String(startDraft.position.longitud ?? ''))
      formData.set('distancia_metros', String(startDraft.position.distanciaMetros ?? ''))
      formData.set('estado_gps', startDraft.gpsState)
      formData.set('comments', comments)

      try {
        await injectDirectR2Upload(formData, startDraft.file, {
          modulo: 'rutas',
          removeFieldName: 'selfie_file',
          fieldNames: {
            objectKey: 'selfie_r2_object_key',
            sha256: 'selfie_r2_sha256',
            fileName: 'selfie_r2_file_name',
            contentType: 'selfie_r2_type',
            size: 'selfie_r2_size',
          },
          thumbnailFieldNames: {
            objectKey: 'selfie_thumbnail_r2_object_key',
            sha256: 'selfie_thumbnail_r2_sha256',
            fileName: 'selfie_thumbnail_r2_file_name',
            contentType: 'selfie_thumbnail_r2_type',
            size: 'selfie_thumbnail_r2_size',
          },
        })
      } catch (error) {
        console.error('No fue posible subir la selfie de llegada a R2.', error)
      }

      const result = await registrarInicioVisitaRutaSemanal(ESTADO_RUTA_INICIAL, formData)
      if (!result.ok) {
        onError(result.message ?? 'No fue posible registrar la llegada.')
        return
      }

      const nextVisit: RutaSemanalVisitItem = {
        ...currentVisit,
        checkInAt: startDraft.capturedAt,
        checkInGpsState: startDraft.gpsState,
        checkInSelfieUrl: startDraft.previewUrl,
      }

      setCurrentVisit(nextVisit)
      onSuccess(result.message ?? 'Llegada registrada.', nextVisit)
    })
  }

  const submitFinishVisit = () => {
    if (!endDraft) {
      onError('Primero toma la selfie de salida.')
      return
    }

    if (!comments.trim()) {
      onError('Agrega comentarios finales sobre como estuvo la visita y la situacion del PDV.')
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.set('visita_id', currentVisit.id)
      formData.set('selfie_file', endDraft.file)
      if (evidenceDraft) {
        formData.set('evidencia_file', evidenceDraft.file)
      }
      for (const item of SUPERVISOR_CHECKLIST_ITEMS) {
        formData.set(`checklist_${item.key}`, String(checklist[item.key]))
        if ('commentKey' in item) {
          formData.set(`checklist_comment_${item.commentKey}`, checklistComments[item.commentKey] ?? '')
        }
      }
      formData.set('love_isdin_records_count', loveIsdinRecordsCount)
      formData.set('latitud', String(endDraft.position.latitud ?? ''))
      formData.set('longitud', String(endDraft.position.longitud ?? ''))
      formData.set('distancia_metros', String(endDraft.position.distanciaMetros ?? ''))
      formData.set('estado_gps', endDraft.gpsState)
      formData.set('comments', comments)

      try {
        await injectDirectR2Upload(formData, endDraft.file, {
          modulo: 'rutas',
          removeFieldName: 'selfie_file',
          fieldNames: {
            objectKey: 'selfie_r2_object_key',
            sha256: 'selfie_r2_sha256',
            fileName: 'selfie_r2_file_name',
            contentType: 'selfie_r2_type',
            size: 'selfie_r2_size',
          },
          thumbnailFieldNames: {
            objectKey: 'selfie_thumbnail_r2_object_key',
            sha256: 'selfie_thumbnail_r2_sha256',
            fileName: 'selfie_thumbnail_r2_file_name',
            contentType: 'selfie_thumbnail_r2_type',
            size: 'selfie_thumbnail_r2_size',
          },
        })

        if (evidenceDraft) {
          await injectDirectR2Upload(formData, evidenceDraft.file, {
            modulo: 'rutas',
            removeFieldName: 'evidencia_file',
            fieldNames: {
              objectKey: 'evidencia_r2_object_key',
              sha256: 'evidencia_r2_sha256',
              fileName: 'evidencia_r2_file_name',
              contentType: 'evidencia_r2_type',
              size: 'evidencia_r2_size',
            },
            thumbnailFieldNames: {
              objectKey: 'evidencia_thumbnail_r2_object_key',
              sha256: 'evidencia_thumbnail_r2_sha256',
              fileName: 'evidencia_thumbnail_r2_file_name',
              contentType: 'evidencia_thumbnail_r2_type',
              size: 'evidencia_thumbnail_r2_size',
            },
          })
        }
      } catch (error) {
        console.error('No fue posible subir evidencia de cierre de ruta a R2.', error)
      }

      const result = await registrarSalidaVisitaRutaSemanal(ESTADO_RUTA_INICIAL, formData)
      if (!result.ok) {
        onError(result.message ?? 'No fue posible cerrar la visita.')
        return
      }

      const nextVisit: RutaSemanalVisitItem = {
        ...currentVisit,
        estatus: 'COMPLETADA',
        checkOutAt: endDraft.capturedAt,
        checkOutGpsState: endDraft.gpsState,
        checkOutSelfieUrl: endDraft.previewUrl,
        checkOutEvidenceUrl: evidenceDraft?.previewUrl ?? currentVisit.checkOutEvidenceUrl,
        checklistCalidad: { ...checklist },
        checklistComments: { ...checklistComments },
        checklistCompletion,
        loveIsdinRecordsCount:
          loveIsdinRecordsCount.trim() === '' ? null : Number.parseInt(loveIsdinRecordsCount, 10),
        comentarios: comments,
        completadaEn: endDraft.capturedAt,
      }

      setCurrentVisit(nextVisit)
      onSuccess(result.message ?? 'Visita cerrada.', nextVisit)
      onClose()
    })
  }

  return (
    <div className="space-y-4">
      <Card className="bg-slate-50 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailItem label="Punto de venta" value={currentVisit.pdv ?? 'Sin nombre'} />
          <DetailItem label="Clave" value={currentVisit.pdvClaveBtl ?? 'Sin clave'} />
          <DetailItem label="Zona" value={currentVisit.zona ?? 'Sin zona'} />
          <DetailItem label="Direccion" value={currentVisit.direccion ?? 'Sin direccion'} />
        </div>
      </Card>

      <Card className="bg-white p-4">
        <p className="text-sm font-semibold text-slate-950">1. Llegada a tienda</p>
        <p className="mt-1 text-sm text-slate-600">
          Registra tu llegada mostrando tu gafete de entrada al punto de venta o en la puerta de empleados del
          punto de venta.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => {
              void beginGpsCapture()
              setIsStartCameraOpen(true)
            }}
            disabled={!canStartVisit}
            className="w-full sm:w-auto"
          >
            {currentVisit.checkInAt ? 'Llegada registrada' : 'Abrir camara selfie - Llegada'}
          </Button>
          {currentVisit.checkInAt && (
            <span className="text-sm text-emerald-700">
              Entrada: {new Date(currentVisit.checkInAt).toLocaleString('es-MX')}
            </span>
          )}
        </div>
        {startDraft && canStartVisit && (
          <div className="mt-4 overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50">
            <img
              src={startDraft.previewUrl}
              alt="Borrador de llegada"
              className="aspect-[4/5] w-full object-cover"
            />
            <div className="space-y-3 px-4 py-4">
              <div className="text-sm text-slate-600">
                <p className="font-semibold text-slate-950">Selfie lista para enviar</p>
                <p>Hora: {new Date(startDraft.capturedAt).toLocaleString('es-MX')}</p>
              </div>
              <Button type="button" onClick={submitStartVisit} disabled={isPending} className="w-full sm:w-auto">
                {isPending ? 'Enviando...' : 'Confirmar llegada'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="bg-white p-4">
        <p className="text-sm font-semibold text-slate-950">2. Checklist de visita</p>
        <p className="mt-1 text-sm text-slate-600">
          Checklist opcional para documentar la calidad real de la visita del supervisor.
          {canOpenChecklist ? ` Items aplicables marcados: ${checklistCheckedCount}/${checklistScore.totalCount}.` : ''}
        </p>
        {!canOpenChecklist && (
          <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
            Primero registra y confirma tu llegada a tienda para desbloquear el cuestionario de visita.
          </div>
        )}
        <div className="mt-4 grid gap-3">
          {SUPERVISOR_CHECKLIST_ITEMS.map((item) => (
            <ChecklistItemCard
              key={item.key}
              checked={checklist[item.key]}
              label={item.label}
              notApplicable={isSupervisorChecklistItemNotApplicable(item.key, checklist)}
              onChange={(checked) => setChecklist((current) => ({ ...current, [item.key]: checked }))}
              disabled={!canOpenChecklist}
              commentLabel={'commentLabel' in item ? item.commentLabel : undefined}
              commentInputType={'commentInputType' in item ? item.commentInputType : undefined}
              commentValue={'commentKey' in item ? checklistComments[item.commentKey] ?? '' : undefined}
              onCommentChange={
                'commentKey' in item
                  ? (value) => {
                      const commentKey = item.commentKey
                      setChecklistComments((current) => ({ ...current, [commentKey]: value }))
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </Card>

      <Card className="bg-white p-4">
        <p className="text-sm font-semibold text-slate-950">3. Salida y evidencia</p>
        <p className="mt-1 text-sm text-slate-600">
          Cierra la visita con selfie con la dermoconsejera y ultimos comentarios de hallazgos.
        </p>
        <div className="mt-4 space-y-3">
          <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
            <label className="block text-sm font-semibold text-slate-900">
              Cuantos registros LOVE lleva la DC en este momento
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Registra el total visible durante la visita para seguimiento comercial.
            </p>
            <input
              type="number"
              min="0"
              step="1"
              value={loveIsdinRecordsCount}
              onChange={(event) => setLoveIsdinRecordsCount(event.target.value)}
              placeholder="Ej. 2"
              disabled={!canFinishVisit}
              className="mt-3 w-full rounded-[14px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void beginGpsCapture()
                setIsEndCameraOpen(true)
              }}
              disabled={!canFinishVisit}
              className="w-full sm:w-auto"
            >
              {currentVisit.checkOutAt ? 'Salida registrada' : 'Abrir selfie'}
            </Button>
            {currentVisit.checkOutAt && (
              <span className="text-sm text-emerald-700">
                Salida: {new Date(currentVisit.checkOutAt).toLocaleString('es-MX')}
              </span>
            )}
          </div>
          {endDraft && canFinishVisit && (
            <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50">
              <img
                src={endDraft.previewUrl}
                alt="Borrador de salida"
                className="aspect-[4/5] w-full object-cover"
              />
              <div className="space-y-3 px-4 py-4">
                <div className="text-sm text-slate-600">
                  <p className="font-semibold text-slate-950">Selfie con la dermoconsejera lista</p>
                  <p>Hora: {new Date(endDraft.capturedAt).toLocaleString('es-MX')}</p>
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEvidenceCameraOpen(true)}
              disabled={!canFinishVisit}
            >
              {evidenceDraft ? 'Volver a tomar evidencia' : 'Tomar evidencia'}
            </Button>
            <span className="text-sm text-slate-500">Salida con evidencia adicional opcional.</span>
          </div>
          <p className="rounded-[14px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
            Reporta PRODUCTOS ROTOS, FALTANTES INCONVENIENTES O ALGO ANOMALO EN LA TIENDA.
          </p>
          {evidenceDraft && (
            <img
              src={evidenceDraft.previewUrl}
              alt="Borrador de evidencia"
              className="aspect-[4/3] w-full rounded-[18px] border border-slate-200 object-cover"
            />
          )}
          <textarea
            value={comments}
            onChange={(event) => setComments(event.target.value)}
            rows={3}
            placeholder="Comentarios y hallazgos"
            className="w-full rounded-[14px] border border-slate-200 bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
          />
          {endDraft && canFinishVisit && (
            <>
              {!comments.trim() && (
                <p className="rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  Agrega comentarios finales para confirmar la salida.
                </p>
              )}
              <Button
                type="button"
                onClick={submitFinishVisit}
                disabled={isPending || !comments.trim()}
                className="w-full sm:w-auto"
              >
                {isPending ? 'Enviando...' : 'Confirmar salida'}
              </Button>
            </>
          )}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </div>

      <NativeCameraSelfieDialog
        open={isStartCameraOpen}
        title="Llegada a tienda"
        description="Toma la selfie de entrada mostrando tu gafete o el acceso al punto de venta."
        onClose={() => setIsStartCameraOpen(false)}
        onCapture={(file) => handleCapture(file, 'Check-in', setStartDraft)}
        captureLabel="Capturar llegada"
        onRetryPermissions={() => {
          void beginGpsCapture()
        }}
      />

      <NativeCameraSelfieDialog
        open={isEndCameraOpen}
        title="Salida de tienda"
        description="Toma la selfie con la dermoconsejera para cerrar la visita de supervision."
        onClose={() => setIsEndCameraOpen(false)}
        onCapture={(file) => handleCapture(file, 'Check-out', setEndDraft)}
        captureLabel="Capturar salida"
        onRetryPermissions={() => {
          void beginGpsCapture()
        }}
      />

      <NativeCameraSelfieDialog
        open={isEvidenceCameraOpen}
        title="Evidencia adicional"
        description="Reporta productos rotos, faltantes inconvenientes o algo anomalo en la tienda."
        onClose={() => setIsEvidenceCameraOpen(false)}
        onCapture={(file) => handleCapture(file, 'Evidencia', setEvidenceDraft)}
        facingMode="environment"
        captureLabel="Capturar evidencia"
        onRetryPermissions={() => {
          void beginGpsCapture()
        }}
      />
    </div>
  )
}

function TodayRouteDayEventSection({
  content,
  onClose,
}: {
  content: ReactNode | null | undefined
  onClose?: () => void
}) {
  const [open, setOpen] = useState(false)

  if (!content) {
    return null
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => setOpen(true)} className="w-full sm:w-auto">
          Agregar evento del dia
        </Button>
        <span className="text-sm text-slate-500">
          Registra fuerza mayor, visita adicional o evidencia operativa sin salir de Mi Ruta Hoy.
        </span>
      </div>
      <ModalPanel
        open={open}
        onClose={() => {
          setOpen(false)
          onClose?.()
        }}
        title="Agregar evento del dia"
        subtitle="Captura el evento operativo desde Mi Ruta Hoy con el flujo acordado."
        maxWidthClassName="max-w-[min(1180px,calc(100vw-24px))]"
      >
        <div className="min-h-[68vh]">{content}</div>
      </ModalPanel>
    </>
  )
}

function SummaryPill({
  label,
  value,
  tone = 'slate',
}: {
  label: string
  value: string
  tone?: 'emerald' | 'amber' | 'sky' | 'slate'
}) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : tone === 'sky'
          ? 'bg-sky-50 text-sky-700 border-sky-200'
          : 'bg-slate-50 text-slate-700 border-slate-200'

  return (
    <div className={`rounded-[18px] border px-3 py-2 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[18px] border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-medium text-slate-900">{value}</p>
    </div>
  )
}

function ChecklistItemCard({
  checked,
  label,
  notApplicable,
  onChange,
  disabled,
  commentLabel,
  commentInputType,
  commentValue,
  onCommentChange,
}: {
  checked: boolean
  label: string
  notApplicable: boolean
  onChange: (checked: boolean) => void
  disabled: boolean
  commentLabel?: string
  commentInputType?: 'textarea' | 'time'
  commentValue?: string
  onCommentChange?: (value: string) => void
}) {
  return (
    <div
      className={`rounded-[18px] border px-4 py-4 ${
        disabled
          ? 'border-slate-200 bg-slate-100'
          : notApplicable
            ? 'border-slate-200 bg-slate-50/60'
            : 'border-slate-200 bg-slate-50'
      }`}
    >
      <label className={`flex items-start gap-3 text-sm font-medium ${disabled ? 'text-slate-400' : 'text-slate-700'}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          className="mt-1 h-4 w-4 rounded border-slate-300"
        />
        <span>
          {label}
          {notApplicable ? (
            <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              No aplica al avance
            </span>
          ) : null}
        </span>
      </label>
      {commentLabel && onCommentChange && (
        <label className={`mt-3 block text-sm ${disabled ? 'text-slate-400' : 'text-slate-700'}`}>
          <span className="font-semibold">{commentLabel}</span>
          {commentInputType === 'time' ? (
            <input
              type="time"
              value={commentValue ?? ''}
              onChange={(event) => onCommentChange(event.target.value)}
              disabled={disabled}
              className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)] disabled:bg-slate-100 disabled:text-slate-400"
            />
          ) : (
            <textarea
              value={commentValue ?? ''}
              onChange={(event) => onCommentChange(event.target.value)}
              disabled={disabled}
              rows={3}
              className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)] disabled:bg-slate-100 disabled:text-slate-400"
            />
          )}
        </label>
      )}
    </div>
  )
}
