'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
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
  registrarSalidaVisitaRutaSemanal,
} from '../actions'
import { ESTADO_RUTA_INICIAL } from '../state'
import {
  SUPERVISOR_CHECKLIST_ITEMS,
  type SupervisorChecklistKey,
} from '../lib/supervisorVisitChecklist'
import type { RutaSemanalPanelData, RutaSemanalVisitItem } from '../services/rutaSemanalService'

interface SupervisorTodayRouteSheetProps {
  data: RutaSemanalPanelData | null
  onSuccess: (message: string) => void
  onError: (message: string) => void
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
}: SupervisorTodayRouteSheetProps) {
  const [selectedVisit, setSelectedVisit] = useState<RutaSemanalVisitItem | null>(null)

  const visits = data?.visitasHoy ?? []

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
            Revisa el orden del dia y abre cada tienda para registrar llegada, checklist completo y cierre.
          </p>
        </Card>

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
    </>
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
      SUPERVISOR_CHECKLIST_ITEMS.map((item) => [item.key, visit.checklistCalidad[item.key] ?? false])
    ) as Record<SupervisorChecklistKey, boolean>
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

  const checklistDone = Object.values(checklist).every(Boolean)
  const canStartVisit = !currentVisit.checkInAt
  const canFinishVisit = Boolean(currentVisit.checkInAt) && !currentVisit.checkOutAt
  const canOpenChecklist = Boolean(currentVisit.checkInAt)

  const beginGpsCapture = () => {
    if (gpsPromiseRef.current) {
      return gpsPromiseRef.current
    }

    const pending = captureAttendancePosition({
      geocercaLatitud: currentVisit.latitud,
      geocercaLongitud: currentVisit.longitud,
      geocercaRadioMetros: currentVisit.geocercaRadioMetros,
    }).finally(() => {
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

    if (!checklistDone) {
      onError('Debes completar el checklist al 100%.')
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
      }
      formData.set('love_isdin_records_count', loveIsdinRecordsCount)
      formData.set('latitud', String(endDraft.position.latitud ?? ''))
      formData.set('longitud', String(endDraft.position.longitud ?? ''))
      formData.set('distancia_metros', String(endDraft.position.distanciaMetros ?? ''))
      formData.set('estado_gps', endDraft.gpsState)
      formData.set('comments', comments)

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
        checklistCompletion: 100,
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
          Registra tu llegada con selfie y GPS antes de iniciar el checklist.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => {
              void beginGpsCapture()
              setIsStartCameraOpen(true)
            }}
            disabled={!canStartVisit}
          >
            {currentVisit.checkInAt ? 'Llegada registrada' : 'Llegue a tienda'}
          </Button>
          {currentVisit.checkInAt && (
            <>
              <span className="text-sm text-emerald-700">
                Entrada: {new Date(currentVisit.checkInAt).toLocaleString('es-MX')}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  currentVisit.checkInGpsState === 'DENTRO_GEOCERCA'
                    ? 'bg-emerald-100 text-emerald-700'
                    : currentVisit.checkInGpsState === 'FUERA_GEOCERCA'
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-slate-100 text-slate-600'
                }`}
              >
                {currentVisit.checkInGpsState === 'DENTRO_GEOCERCA'
                  ? 'Dentro del PDV'
                  : currentVisit.checkInGpsState === 'FUERA_GEOCERCA'
                    ? 'Fuera del PDV'
                    : 'GPS pendiente'}
              </span>
            </>
          )}
        </div>
        {startDraft && canStartVisit && (
          <div className="mt-4 space-y-3">
            <img
              src={startDraft.previewUrl}
              alt="Borrador de llegada"
              className="aspect-[4/3] w-full rounded-[18px] border border-slate-200 object-cover"
            />
            <Button type="button" onClick={submitStartVisit} disabled={isPending}>
              Confirmar llegada
            </Button>
          </div>
        )}
      </Card>

      <Card className="bg-white p-4">
        <p className="text-sm font-semibold text-slate-950">2. Checklist de visita</p>
        <p className="mt-1 text-sm text-slate-600">
          Debe quedar al 100% y documenta la calidad real de la visita del supervisor.
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
              onChange={(checked) => setChecklist((current) => ({ ...current, [item.key]: checked }))}
              disabled={!canOpenChecklist}
            />
          ))}
        </div>
        <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
          <label className="block text-sm font-semibold text-slate-900">
            Cuantos registros Love ISDIN lleva la M-DC en este momento
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
            disabled={!canOpenChecklist}
            className="mt-3 w-full rounded-[14px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
          />
        </div>
      </Card>

      <Card className="bg-white p-4">
        <p className="text-sm font-semibold text-slate-950">3. Salida y evidencia</p>
        <p className="mt-1 text-sm text-slate-600">
          Cierra la visita con selfie final tomada desde camara, evidencia desde camara y comentarios de hallazgos.
        </p>
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEvidenceCameraOpen(true)}
              disabled={!canFinishVisit}
            >
              {evidenceDraft ? 'Volver a tomar evidencia' : 'Tomar evidencia'}
            </Button>
            <span className="text-sm text-slate-500">
              La evidencia adicional se captura desde camara dentro del PDV.
            </span>
          </div>
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
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void beginGpsCapture()
                setIsEndCameraOpen(true)
              }}
              disabled={!canFinishVisit}
            >
              {currentVisit.checkOutAt ? 'Salida registrada' : 'Registrar salida'}
            </Button>
          {currentVisit.checkOutAt && (
              <>
                <span className="text-sm text-emerald-700">
                  Salida: {new Date(currentVisit.checkOutAt).toLocaleString('es-MX')}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    currentVisit.checkOutGpsState === 'DENTRO_GEOCERCA'
                      ? 'bg-emerald-100 text-emerald-700'
                      : currentVisit.checkOutGpsState === 'FUERA_GEOCERCA'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {currentVisit.checkOutGpsState === 'DENTRO_GEOCERCA'
                    ? 'Salida dentro del PDV'
                    : currentVisit.checkOutGpsState === 'FUERA_GEOCERCA'
                      ? 'Salida fuera del PDV'
                      : 'GPS pendiente'}
                </span>
              </>
          )}
        </div>
          {endDraft && canFinishVisit && (
            <div className="space-y-3">
              <img
                src={endDraft.previewUrl}
                alt="Borrador de salida"
                className="aspect-[4/3] w-full rounded-[18px] border border-slate-200 object-cover"
              />
              <Button type="button" onClick={submitFinishVisit} disabled={isPending || !checklistDone}>
                Confirmar salida
              </Button>
            </div>
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
        description="Toma la selfie de entrada mientras el sistema calcula GPS y geocerca."
        onClose={() => setIsStartCameraOpen(false)}
        onCapture={(file) => handleCapture(file, 'Check-in', setStartDraft)}
        facingMode="environment"
        captureLabel="Capturar llegada"
      />

      <NativeCameraSelfieDialog
        open={isEndCameraOpen}
        title="Salida de tienda"
        description="Toma la selfie final para cerrar la visita de supervision."
        onClose={() => setIsEndCameraOpen(false)}
        onCapture={(file) => handleCapture(file, 'Check-out', setEndDraft)}
        facingMode="environment"
        captureLabel="Capturar salida"
      />

      <NativeCameraSelfieDialog
        open={isEvidenceCameraOpen}
        title="Evidencia adicional"
        description="Toma una foto de evidencia dentro del punto de venta."
        onClose={() => setIsEvidenceCameraOpen(false)}
        onCapture={(file) => handleCapture(file, 'Evidencia', setEvidenceDraft)}
        facingMode="environment"
        captureLabel="Capturar evidencia"
      />
    </div>
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
  onChange,
  disabled,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
  disabled: boolean
}) {
  return (
    <div
      className={`rounded-[18px] border px-4 py-4 ${
        disabled ? 'border-slate-200 bg-slate-100' : 'border-slate-200 bg-slate-50'
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
        <span>{label}</span>
      </label>
    </div>
  )
}
