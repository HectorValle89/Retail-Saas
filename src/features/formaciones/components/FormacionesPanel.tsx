'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import { Select } from '@/components/ui/select'
import { confirmarAvisoPdvFormacion, guardarFormacion, registrarAsistenciaFormacion } from '../actions'
import { ESTADO_FORMACION_ADMIN_INICIAL } from '../state'
import type { FormacionAsistenciaItem, FormacionEventoItem, FormacionesPanelData } from '../services/formacionService'

type ComposerTab = 'general' | 'alcance' | 'operacion'

function formatDate(value: string | null) {
  if (!value) return 'Pendiente'
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: value.includes('T') ? '2-digit' : undefined,
    minute: value.includes('T') ? '2-digit' : undefined,
  }).format(new Date(value.includes('T') ? value : `${value}T12:00:00`))
}

function formatReminder(status: FormacionEventoItem['reminderSummary'][number]['status']) {
  if (status === 'ENVIADO') return 'Enviado'
  if (status === 'NO_APLICA') return 'No aplica'
  if (status === 'OMITIDO') return 'Omitido'
  return 'Pendiente'
}

export function FormacionesPanel({ data }: { data: FormacionesPanelData }) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(data.eventos[0]?.id ?? null)
  const selectedEvent = data.eventos.find((item) => item.id === selectedEventId) ?? null
  const isSupervisorOwner =
    data.actorPuesto === 'SUPERVISOR' &&
    Boolean(data.actorEmpleadoId) &&
    selectedEvent?.primarySupervisorId === data.actorEmpleadoId

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && data.mensajeInfraestructura && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Eventos" value={String(data.resumen.totalEventos)} />
        <MetricCard label="Participantes confirmados" value={String(data.resumen.participantesConfirmados)} />
        <MetricCard label="PDVs avisados" value={String(data.resumen.supervisorPdvConfirmados)} />
        <MetricCard label="Recordatorios pendientes" value={String(data.resumen.recordatoriosPendientes)} />
      </section>

      {data.puedeGestionar && <FormacionEditorCard data={data} event={selectedEvent} />}

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Formaciones registradas</h2>
              <p className="mt-1 text-sm text-slate-500">Alcance por PDV, aviso previo y plan automático de recordatorios.</p>
            </div>
            {data.puedeGestionar && (
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedEventId(null)}>
                Nueva formación
              </Button>
            )}
          </div>
          <div className="space-y-3 px-4 py-4">
            {data.eventos.length === 0 ? (
              <p className="px-2 py-8 text-sm text-slate-500">Todavía no hay formaciones cargadas.</p>
            ) : (
          data.eventos.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedEventId(item.id)}
                  className={`w-full rounded-3xl border px-4 py-4 text-left transition ${
                    selectedEvent?.id === item.id
                      ? 'border-slate-950 bg-slate-950 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{item.nombre}</p>
                      <p className={`mt-1 text-xs ${selectedEvent?.id === item.id ? 'text-slate-300' : 'text-slate-500'}`}>
                        {item.tipoEvento} · {item.modalidad === 'EN_LINEA' ? 'En línea' : 'Presencial'}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      item.supervisorPdvPendientesCount === 0 && item.pdvConfirmaciones.length > 0
                        ? selectedEvent?.id === item.id ? 'bg-emerald-500/20 text-emerald-100' : 'bg-emerald-100 text-emerald-700'
                        : selectedEvent?.id === item.id ? 'bg-amber-500/20 text-amber-100' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {item.supervisorPdvConfirmadosCount}/{item.pdvConfirmaciones.length} PDVs avisados
                    </span>
                  </div>
                  <p className={`mt-3 text-xs ${selectedEvent?.id === item.id ? 'text-slate-300' : 'text-slate-500'}`}>
                    {item.sede} · {item.ciudad ?? 'Sin ciudad'} · {formatDate(item.fechaInicio)}
                  </p>
                  <p className={`mt-2 text-xs ${selectedEvent?.id === item.id ? 'text-slate-400' : 'text-slate-400'}`}>
                    {item.selectedPdvIds.length} PDVs · {item.notificationRecipientIds.length} destinatarios
                  </p>
                </button>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-6">
          {isSupervisorOwner && <SupervisorPdvConfirmationCard event={selectedEvent} />}
          <FormacionOverviewCard event={selectedEvent} />
          <AttendanceCard event={selectedEvent} />
        </div>
      </section>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <SharedMetricCard label={label} value={value} />
}

function FormacionEditorCard({ data, event }: { data: FormacionesPanelData; event: FormacionEventoItem | null }) {
  const [state, formAction] = useActionState(guardarFormacion, ESTADO_FORMACION_ADMIN_INICIAL)
  const [activeTab, setActiveTab] = useState<ComposerTab>('general')
  const [selectedSupervisorId, setSelectedSupervisorId] = useState(event?.primarySupervisorId ?? '')
  const [selectedCoordinatorId, setSelectedCoordinatorId] = useState(event?.primaryCoordinatorId ?? '')
  const [selectedModality, setSelectedModality] = useState<'PRESENCIAL' | 'EN_LINEA'>(event?.modalidad ?? 'PRESENCIAL')
  const [selectedPdvIds, setSelectedPdvIds] = useState<string[]>(event?.selectedPdvIds ?? [])
  const [selectedEventType, setSelectedEventType] = useState<'FORMACION' | 'ISDINIZACION'>(event?.tipoEvento ?? 'FORMACION')

  useEffect(() => {
    setSelectedSupervisorId(event?.primarySupervisorId ?? '')
    setSelectedCoordinatorId(event?.primaryCoordinatorId ?? '')
    setSelectedModality(event?.modalidad ?? 'PRESENCIAL')
    setSelectedPdvIds(event?.selectedPdvIds ?? [])
    setSelectedEventType(event?.tipoEvento ?? 'FORMACION')
  }, [event?.id, event?.primarySupervisorId, event?.primaryCoordinatorId, event?.modalidad, event?.selectedPdvIds, event?.tipoEvento])

  const selectedSupervisor = useMemo(
    () => data.supervisoresDisponibles.find((item) => item.id === selectedSupervisorId) ?? null,
    [data.supervisoresDisponibles, selectedSupervisorId]
  )

  const affectedPdvs = useMemo(() => {
    if (!selectedSupervisor) return []
    return data.pdvGroups.flatMap((group) => group.pdvs).filter((pdv) => pdv.supervisorId === selectedSupervisor.id)
  }, [data.pdvGroups, selectedSupervisor])

  useEffect(() => {
    if (!selectedSupervisor) {
      setSelectedPdvIds([])
      return
    }

    const allowedIds = new Set(affectedPdvs.map((pdv) => pdv.id))
    setSelectedPdvIds((current) => {
      const scopedCurrent = current.filter((id) => allowedIds.has(id))
      if (scopedCurrent.length > 0) return scopedCurrent
      return event?.primarySupervisorId === selectedSupervisor.id && event.selectedPdvIds.length > 0
        ? event.selectedPdvIds.filter((id) => allowedIds.has(id))
        : affectedPdvs.map((pdv) => pdv.id)
    })
  }, [affectedPdvs, event?.primarySupervisorId, event?.selectedPdvIds, selectedSupervisor])

  useEffect(() => {
    if (selectedCoordinatorId || !selectedSupervisor?.coordinatorId) return
    setSelectedCoordinatorId(selectedSupervisor.coordinatorId)
  }, [selectedCoordinatorId, selectedSupervisor])

  const selectedCoordinator = useMemo(
    () => data.coordinadoresDisponibles.find((item) => item.id === selectedCoordinatorId) ?? null,
    [data.coordinadoresDisponibles, selectedCoordinatorId]
  )

  const tabs: Array<{ key: ComposerTab; label: string; helper: string }> = [
    { key: 'general', label: 'Crear formación', helper: 'Nombre, fecha y modalidad.' },
    { key: 'alcance', label: 'PDVs y asistentes', helper: 'Supervisor, coordinador y tiendas impactadas.' },
    { key: 'operacion', label: 'Dirección del evento', helper: 'Sede, coordenadas y radio.' },
  ]

  return (
    <Card className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{event ? 'Editar formación' : 'Crear formación'}</h2>
          <p className="mt-1 text-sm text-slate-500">
            La formación sustituye la jornada normal del día y exige aviso previo del supervisor al PDV.
          </p>
        </div>
        {event && <span className="text-xs font-semibold text-slate-500">{event.estado}</span>}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-3xl border px-4 py-4 text-left transition ${
              activeTab === tab.key ? 'border-[var(--module-primary)] bg-[var(--module-soft-bg)] text-slate-950 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <p className="text-sm font-semibold">{tab.label}</p>
            <p className="mt-1 text-xs text-slate-500">{tab.helper}</p>
          </button>
        ))}
      </div>

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="evento_id" value={event?.id ?? ''} />
        {activeTab === 'general' && (
          <GeneralStep
            event={event}
            selectedEventType={selectedEventType}
            selectedModality={selectedModality}
            setSelectedEventType={setSelectedEventType}
            setSelectedModality={setSelectedModality}
          />
        )}
        {activeTab === 'alcance' && (
          <ScopeStep
            data={data}
            event={event}
            selectedSupervisorId={selectedSupervisorId}
            selectedCoordinatorId={selectedCoordinatorId}
            selectedSupervisor={selectedSupervisor}
            selectedCoordinator={selectedCoordinator}
            selectedPdvIds={selectedPdvIds}
            setSelectedSupervisorId={setSelectedSupervisorId}
            setSelectedCoordinatorId={setSelectedCoordinatorId}
            togglePdv={(pdvId) =>
              setSelectedPdvIds((current) => current.includes(pdvId) ? current.filter((item) => item !== pdvId) : [...current, pdvId])
            }
            affectedPdvs={affectedPdvs}
          />
        )}
        {activeTab === 'operacion' && (
          <OperacionStep event={event} selectedModality={selectedModality} />
        )}
        <StateMessage state={state} />
        <div className="flex flex-wrap gap-3">
          {activeTab !== 'general' && (
            <Button type="button" variant="outline" size="sm" onClick={() => setActiveTab(activeTab === 'operacion' ? 'alcance' : 'general')}>
              Paso anterior
            </Button>
          )}
          {activeTab !== 'operacion' && (
            <Button type="button" variant="outline" size="sm" onClick={() => setActiveTab(activeTab === 'general' ? 'alcance' : 'operacion')}>
              Siguiente paso
            </Button>
          )}
          <SubmitActionButton label={event ? 'Actualizar formación' : 'Crear formación'} pendingLabel={event ? 'Actualizando...' : 'Creando...'} />
        </div>
      </form>
    </Card>
  )
}

function GeneralStep({
  event,
  selectedEventType,
  selectedModality,
  setSelectedEventType,
  setSelectedModality,
}: {
  event: FormacionEventoItem | null
  selectedEventType: 'FORMACION' | 'ISDINIZACION'
  selectedModality: 'PRESENCIAL' | 'EN_LINEA'
  setSelectedEventType: (value: 'FORMACION' | 'ISDINIZACION') => void
  setSelectedModality: (value: 'PRESENCIAL' | 'EN_LINEA') => void
}) {
  return (
    <div className="space-y-5 rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <div className="grid gap-4 xl:grid-cols-4">
        <Input label="Nombre" name="nombre" defaultValue={event?.nombre ?? ''} required />
        <Select label="Tipo de evento" name="tipo_evento" value={selectedEventType} options={[{ value: 'FORMACION', label: 'FORMACION' }, { value: 'ISDINIZACION', label: 'ISDINIZACION' }]} onChange={(e) => setSelectedEventType(e.target.value === 'ISDINIZACION' ? 'ISDINIZACION' : 'FORMACION')} />
        <Select label="Modalidad" name="modalidad" value={selectedModality} options={[{ value: 'PRESENCIAL', label: 'Presencial' }, { value: 'EN_LINEA', label: 'En línea' }]} onChange={(e) => setSelectedModality(e.target.value === 'EN_LINEA' ? 'EN_LINEA' : 'PRESENCIAL')} />
        <Select label="Estado" name="estado" defaultValue={event?.estado ?? 'PROGRAMADA'} options={['PROGRAMADA', 'EN_CURSO', 'FINALIZADA', 'CANCELADA'].map((value) => ({ value, label: value }))} />
      </div>
      <div className="grid gap-4 xl:grid-cols-4">
        <Input label="Fecha inicio" name="fecha_inicio" type="date" defaultValue={event?.fechaInicio ?? ''} required />
        <Input label="Fecha fin" name="fecha_fin" type="date" defaultValue={event?.fechaFin ?? ''} required />
        <Input label="Horario inicio" name="horario_inicio" type="time" defaultValue={event?.scheduleStart ?? ''} required />
        <Input label="Horario fin" name="horario_fin" type="time" defaultValue={event?.scheduleEnd ?? ''} required />
      </div>
      <FieldTextarea label="Objetivo de la formación" name="descripcion" defaultValue={event?.descripcion ?? ''} placeholder="Temas, instrucciones operativas y objetivo de la sesión." />
    </div>
  )
}

function ScopeStep(props: {
  data: FormacionesPanelData
  event: FormacionEventoItem | null
  selectedSupervisorId: string
  selectedCoordinatorId: string
  selectedSupervisor: FormacionesPanelData['supervisoresDisponibles'][number] | null
  selectedCoordinator: FormacionesPanelData['coordinadoresDisponibles'][number] | null
  selectedPdvIds: string[]
  setSelectedSupervisorId: (value: string) => void
  setSelectedCoordinatorId: (value: string) => void
  togglePdv: (pdvId: string) => void
  affectedPdvs: FormacionesPanelData['pdvGroups'][number]['pdvs']
}) {
  const { data, event, selectedSupervisorId, selectedCoordinatorId, selectedSupervisor, selectedCoordinator, selectedPdvIds, setSelectedSupervisorId, setSelectedCoordinatorId, togglePdv, affectedPdvs } = props
  return (
    <div className="space-y-5 rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <div className="grid gap-4 xl:grid-cols-2">
        <Select label="Supervisor" name="supervisor_id" value={selectedSupervisorId} options={[{ value: '', label: 'Selecciona un supervisor' }, ...data.supervisoresDisponibles.map((item) => ({ value: item.id, label: `${item.nombre} · ${item.estados.join(', ') || 'Sin estado'}` }))]} onChange={(e) => setSelectedSupervisorId(e.target.value)} />
        <Select label="Coordinador" name="coordinador_id" value={selectedCoordinatorId} options={[{ value: '', label: 'Selecciona un coordinador' }, ...data.coordinadoresDisponibles.map((item) => ({ value: item.id, label: item.zona ? `${item.nombre} · ${item.zona}` : item.nombre }))]} onChange={(e) => setSelectedCoordinatorId(e.target.value)} />
      </div>
      {!selectedSupervisor ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">Selecciona un supervisor para ver las tiendas impactadas.</div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <PreviewMetric label="Supervisor" value={selectedSupervisor.nombre} />
            <PreviewMetric label="Coordinador" value={selectedCoordinator?.nombre ?? selectedSupervisor.coordinatorName ?? event?.coordinatorName ?? 'Sin coordinador visible'} />
            <PreviewMetric label="PDVs seleccionados" value={String(selectedPdvIds.length)} />
            <PreviewMetric label="DC esperadas" value={String(affectedPdvs.filter((pdv) => selectedPdvIds.includes(pdv.id)).length)} />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Tiendas participantes</p>
                <p className="mt-1 text-sm text-slate-500">Las DC asignadas a esos PDVs el día de la formación quedarán inscritas automáticamente.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{selectedPdvIds.length} seleccionadas</span>
            </div>
            <div className="mt-3 grid gap-2 xl:grid-cols-2">
              {affectedPdvs.map((pdv) => (
                <label key={pdv.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 text-sm transition ${selectedPdvIds.includes(pdv.id) ? 'border-sky-300 bg-sky-50 text-slate-900' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'}`}>
                  <input type="checkbox" name="pdv_id" value={pdv.id} checked={selectedPdvIds.includes(pdv.id)} onChange={() => togglePdv(pdv.id)} className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600" />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-950">{pdv.nombre}</p>
                    <p className="mt-1 text-xs text-slate-500">{pdv.ciudad ?? 'Sin ciudad'} · {pdv.estado}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-400">{pdv.claveBtl}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function OperacionStep({ event, selectedModality }: { event: FormacionEventoItem | null; selectedModality: 'PRESENCIAL' | 'EN_LINEA' }) {
  const coordinatesValue =
    event?.locationLatitude != null && event?.locationLongitude != null
      ? `${event.locationLatitude}, ${event.locationLongitude}`
      : ''

  return (
    <div className="space-y-5 rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <div className="grid gap-4 xl:grid-cols-2">
        <Input label={selectedModality === 'EN_LINEA' ? 'Liga o sede virtual' : 'Sede de la formación'} name="sede" defaultValue={event?.sede ?? ''} required />
        <Input label="Ciudad" name="ciudad" defaultValue={event?.ciudad ?? ''} />
      </div>
      {selectedModality === 'PRESENCIAL' ? (
        <>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">Captura dirección, coordenadas y radio. La DC y el supervisor harán check-in con selfie en esta sede.</div>
          <div className="grid gap-4 xl:grid-cols-[1.35fr_1.1fr_0.8fr]">
            <Input label="Dirección del evento" name="ubicacion_direccion" defaultValue={event?.locationAddress ?? ''} required />
            <Input label="Latitud, longitud" name="ubicacion_coordenadas" defaultValue={coordinatesValue} placeholder="25.6866, -100.3161" required />
            <Input label="Radio (m)" name="ubicacion_radio_metros" type="number" step="1" defaultValue={event?.locationRadiusMeters?.toString() ?? '100'} />
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-900">La formación en línea también queda visible como jornada operativa del día, sin geocerca.</div>
      )}
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Aviso operativo a tiendas</p>
        <p className="mt-2 text-sm text-sky-900">
          La creación de la formación ya no solicita confirmaciones aquí. El supervisor responsable confirma después,
          PDV por PDV, qué tiendas ya fueron informadas y coordinación solo recibe ese avance operativo.
        </p>
      </div>
    </div>
  )
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-950">{value}</p>
    </div>
  )
}

function FormacionOverviewCard({ event }: { event: FormacionEventoItem | null }) {
  if (!event) {
    return (
      <Card className="border-slate-200 bg-white">
        <h2 className="text-lg font-semibold text-slate-950">Vista operativa</h2>
        <p className="mt-2 text-sm text-slate-500">Selecciona una formación para revisar sede, aviso al PDV y recordatorios.</p>
      </Card>
    )
  }

  return (
    <Card className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{event.nombre}</h2>
          <p className="mt-1 text-sm text-slate-500">{event.tipoEvento} · {event.modalidad === 'EN_LINEA' ? 'En línea' : 'Presencial'} · {event.estado}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${event.supervisorPdvConfirmado ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{event.supervisorPdvConfirmado ? 'Supervisor confirmado' : 'Supervisor pendiente'}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PreviewMetric label="Fecha" value={formatDate(event.fechaInicio)} />
        <PreviewMetric label="Supervisor" value={event.supervisorName ?? 'Sin supervisor visible'} />
        <PreviewMetric label="PDVs" value={String(event.selectedPdvIds.length)} />
        <PreviewMetric label="Avisados" value={`${event.supervisorPdvConfirmadosCount}/${event.pdvConfirmaciones.length}`} />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Avance de confirmaciones por PDV</p>
          <span className="text-sm font-semibold text-slate-700">{event.pdvConfirmationProgressPct}%</span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.max(0, Math.min(100, event.pdvConfirmationProgressPct))}%` }} />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {event.supervisorPdvConfirmadosCount} PDVs avisados · {event.supervisorPdvPendientesCount} pendientes
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Sede y coordenadas</p>
        <p className="mt-2 text-sm text-slate-900">{event.locationAddress ?? event.sede}</p>
        {event.modalidad === 'PRESENCIAL' && (
          <p className="mt-2 text-xs text-slate-500">{event.locationLatitude ?? 'Sin latitud'}, {event.locationLongitude ?? 'Sin longitud'} · Radio {event.locationRadiusMeters ?? 100} m</p>
        )}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Confirmación general del supervisor</p>
        <p className="mt-2 text-sm text-slate-900">
          {event.supervisorPdvContacto ? `${event.supervisorPdvContacto}${event.supervisorPdvContactoPuesto ? ` · ${event.supervisorPdvContactoPuesto}` : ''}` : 'Sin referencia general visible'}
        </p>
        <p className="mt-2 text-xs text-slate-500">{event.supervisorPdvConfirmadoEn ? `Confirmado ${formatDate(event.supervisorPdvConfirmadoEn)}` : 'Sin fecha de confirmación general'}</p>
        {event.supervisorPdvNotas && <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-600">{event.supervisorPdvNotas}</p>}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Confirmaciones por PDV</p>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {event.pdvConfirmaciones.map((item) => (
            <div key={item.pdvId} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{item.pdvNombre}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.ciudad ?? 'Sin ciudad'} · {item.estado ?? item.zona ?? 'Sin estado'}
                  </p>
                  {item.claveBtl && <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-400">{item.claveBtl}</p>}
                </div>
                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${item.confirmado ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {item.confirmado ? 'Avisado' : 'Pendiente'}
                </span>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {item.confirmadoEn ? `Confirmado ${formatDate(item.confirmadoEn)}` : 'Sin confirmación registrada'}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Plan de recordatorios automáticos</p>
        <div className="mt-3 space-y-2">
          {event.reminderSummary.map((reminder) => (
            <div key={reminder.key} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">{reminder.label}</p>
                <p className="text-xs text-slate-500">{formatDate(reminder.scheduledFor)}</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-slate-900">{formatReminder(reminder.status)}</p>
                <p className="text-xs text-slate-500">{reminder.sentAt ? formatDate(reminder.sentAt) : 'Aún sin envío'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

function SupervisorPdvConfirmationCard({ event }: { event: FormacionEventoItem | null }) {
  if (!event) {
    return null
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Confirmación operativa por PDV</h2>
          <p className="mt-1 text-sm text-slate-500">
            Marca tienda por tienda que ya informaste al gerente o encargado sobre la formación o ISDINIZACIÓN.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {event.supervisorPdvConfirmadosCount}/{event.pdvConfirmaciones.length} avisados
        </span>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {event.pdvConfirmaciones.map((item) => (
          <SupervisorPdvConfirmationRow key={item.pdvId} eventId={event.id} item={item} />
        ))}
      </div>
    </Card>
  )
}

function SupervisorPdvConfirmationRow({
  eventId,
  item,
}: {
  eventId: string
  item: FormacionEventoItem['pdvConfirmaciones'][number]
}) {
  const [state, formAction] = useActionState(confirmarAvisoPdvFormacion, ESTADO_FORMACION_ADMIN_INICIAL)

  return (
    <form action={formAction} className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
      <input type="hidden" name="evento_id" value={eventId} />
      <input type="hidden" name="pdv_id" value={item.pdvId} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-950">{item.pdvNombre}</p>
          <p className="mt-1 text-xs text-slate-500">
            {item.ciudad ?? 'Sin ciudad'} · {item.estado ?? item.zona ?? 'Sin estado'}
          </p>
          {item.claveBtl && <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-400">{item.claveBtl}</p>}
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${item.confirmado ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {item.confirmado ? 'Avisado' : 'Pendiente'}
        </span>
      </div>
      <label className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <input name="confirmado" type="checkbox" defaultChecked={item.confirmado} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
        <span className="font-medium">Confirmo que ya informé al PDV de esta formación.</span>
      </label>
      {item.confirmadoEn && <p className="text-xs text-slate-500">Última confirmación: {formatDate(item.confirmadoEn)}</p>}
      <StateMessage state={state} />
      <SubmitActionButton label="Guardar confirmación" pendingLabel="Guardando..." />
    </form>
  )
}

function AttendanceCard({ event }: { event: FormacionEventoItem | null }) {
  if (!event) {
    return (
      <Card className="border-slate-200 bg-white">
        <h2 className="text-lg font-semibold text-slate-950">Asistencias</h2>
        <p className="mt-2 text-sm text-slate-500">Selecciona una formación para revisar las asistencias esperadas.</p>
      </Card>
    )
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Asistencias: {event.nombre}</h2>
          <p className="text-sm text-slate-500">{event.participantes.length} participantes registrados</p>
        </div>
        <span className="text-xs text-slate-500">{event.estado}</span>
      </div>
      <div className="space-y-4">
        {event.asistencias.length === 0 ? <p className="text-sm text-slate-500">Todavía no se generaron asistencias para esta formación.</p> : event.asistencias.map((item) => <AttendanceRow key={item.id} item={item} eventId={event.id} />)}
      </div>
    </Card>
  )
}

function AttendanceRow({ item, eventId }: { item: FormacionAsistenciaItem; eventId: string }) {
  const [state, formAction] = useActionState(registrarAsistenciaFormacion, ESTADO_FORMACION_ADMIN_INICIAL)
  return (
    <form action={formAction} className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
      <input type="hidden" name="asistencia_id" value={item.id} />
      <input type="hidden" name="evento_id" value={eventId} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-950">{item.participanteNombre}</p>
          <p className="text-xs text-slate-500">{item.puesto ?? 'Sin puesto'}</p>
          {item.originPdvName && <p className="mt-1 text-xs text-slate-400">PDV origen: {item.originPdvName}</p>}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1"><input type="checkbox" name="presente" defaultChecked={item.presente} className="h-4 w-4" /> Presente</label>
          <label className="flex items-center gap-1"><input type="checkbox" name="confirmado" defaultChecked={item.confirmado} className="h-4 w-4" /> Confirmado</label>
        </div>
      </div>
      <FieldTextarea label="Comentarios" name="comentarios" rows={2} defaultValue={item.comentarios ?? ''} placeholder="Notas de asistencia" />
      <FieldTextarea label="Evidencias" name="evidencias" rows={2} defaultValue="" placeholder="Lista de evidencias" />
      <StateMessage state={state} />
      <SubmitActionButton label="Guardar" pendingLabel="Guardando..." />
    </form>
  )
}

function FieldTextarea({ label, name, rows = 3, defaultValue = '', placeholder = '', required = false }: { label: string; name: string; rows?: number; defaultValue?: string; placeholder?: string; required?: boolean }) {
  const fieldId = `${name}-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div className="w-full">
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      <textarea id={fieldId} name={name} rows={rows} defaultValue={defaultValue} placeholder={placeholder} required={required} className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-foreground transition-all duration-200 placeholder:text-foreground-muted hover:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-500" />
    </div>
  )
}

function StateMessage({ state }: { state: { ok: boolean; message: string | null } }) {
  if (!state.message) return null
  return <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>
}

function SubmitActionButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" isLoading={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}
