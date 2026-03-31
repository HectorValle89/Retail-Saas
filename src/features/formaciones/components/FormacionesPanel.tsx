'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  registrarAsistenciaFormacion,
  registrarGastoFormacion,
  registrarNotificacionFormacion,
  guardarFormacion,
} from '../actions'
import { ESTADO_FORMACION_ADMIN_INICIAL } from '../state'
import type {
  FormacionAsistenciaItem,
  FormacionEventoItem,
  FormacionesPanelData,
} from '../services/formacionService'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(`${value}T12:00:00`))
}

export function FormacionesPanel({ data }: { data: FormacionesPanelData }) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(data.eventos[0]?.id ?? null)
  const selectedEvent = data.eventos.find((item) => item.id === selectedEventId) ?? null

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
        <MetricCard label="Gastos" value={formatCurrency(data.resumen.gastosTotal)} />
        <MetricCard label="Notificaciones pendientes" value={String(data.resumen.notificacionesPendientes)} />
      </section>

      {data.puedeGestionar && (
        <FormacionEditorCard data={data} event={selectedEvent} />
      )}

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Formaciones registradas</h2>
              <p className="mt-1 text-sm text-slate-500">
                Eventos, sedes y asistentes programados para el alcance actual.
              </p>
            </div>
            {data.puedeGestionar && (
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedEventId(null)}>
                Nuevo evento
              </Button>
            )}
          </div>
          <div className="space-y-3 px-4 py-4">
            {data.eventos.length === 0 ? (
              <p className="px-2 py-8 text-sm text-slate-500">
                Todavía no hay eventos cargados para el alcance actual.
              </p>
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
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{item.nombre}</p>
                    <span className="text-xs text-slate-500">
                      {item.tipoEvento} · {item.modalidad === 'EN_LINEA' ? 'En linea' : 'Presencial'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.sede} · {item.ciudad ?? 'Sin ciudad'} · {formatDate(item.fechaInicio)} - {formatDate(item.fechaFin)}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">{item.participantes.length} asistentes · {formatCurrency(item.gastosOperativos.reduce((sum, gasto) => sum + gasto.monto, 0))}</p>
                </button>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <AttendanceCard event={selectedEvent} />
          <GastosCard event={selectedEvent} />
          <NotificacionCard event={selectedEvent} />
        </div>
      </section>
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

function FormacionEditorCard({ data, event }: { data: FormacionesPanelData; event: FormacionEventoItem | null }) {
  const [state, formAction] = useActionState(guardarFormacion, ESTADO_FORMACION_ADMIN_INICIAL)
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
    if (!selectedSupervisor) {
      return []
    }

    return data.pdvGroups
      .flatMap((group) => group.pdvs)
      .filter((pdv) => pdv.supervisorId === selectedSupervisor.id)
      .sort((left, right) => left.nombre.localeCompare(right.nombre, 'es-MX'))
  }, [data.pdvGroups, selectedSupervisor])

  useEffect(() => {
    if (!selectedSupervisor) {
      setSelectedPdvIds([])
      return
    }

    const allowedIds = new Set(affectedPdvs.map((pdv) => pdv.id))
    setSelectedPdvIds((current) => {
      const scopedCurrent = current.filter((id) => allowedIds.has(id))
      if (scopedCurrent.length > 0) {
        return scopedCurrent
      }
      return affectedPdvs.map((pdv) => pdv.id)
    })
  }, [affectedPdvs, selectedSupervisor])

  useEffect(() => {
    if (selectedCoordinatorId || !selectedSupervisor?.coordinatorId) {
      return
    }

    setSelectedCoordinatorId(selectedSupervisor.coordinatorId)
  }, [selectedCoordinatorId, selectedSupervisor])

  const selectedCoordinator = useMemo(
    () => data.coordinadoresDisponibles.find((item) => item.id === selectedCoordinatorId) ?? null,
    [data.coordinadoresDisponibles, selectedCoordinatorId]
  )

  const selectedPdvCount = selectedPdvIds.length
  const selectedDcCount = useMemo(() => {
    if (!selectedPdvIds.length) {
      return 0
    }

    const selectedSet = new Set(selectedPdvIds)
    return event && event.primarySupervisorId === selectedSupervisorId
      ? event.participantes.filter((item) => item.puesto === 'DERMOCONSEJERO').length
      : affectedPdvs.filter((pdv) => selectedSet.has(pdv.id)).length
  }, [affectedPdvs, event, selectedPdvIds, selectedSupervisorId])

  const togglePdv = (pdvId: string) => {
    setSelectedPdvIds((current) =>
      current.includes(pdvId) ? current.filter((item) => item !== pdvId) : [...current, pdvId]
    )
  }

  return (
    <Card className="space-y-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{event ? 'Editar evento' : 'Crear evento'}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Configura la sesion, filtra por supervisor, selecciona PDVs y carga el manual operativo.
          </p>
        </div>
        {event && <span className="text-xs font-semibold text-slate-500">{event.estado}</span>}
      </div>

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="evento_id" value={event?.id ?? ''} />
        <div className="grid gap-4 xl:grid-cols-4">
          <Input label="Nombre" name="nombre" defaultValue={event?.nombre ?? ''} required />
          <Select
            label="Tipo de evento"
            name="tipo_evento"
            value={selectedEventType}
            options={[
              { value: 'FORMACION', label: 'FORMACION' },
              { value: 'ISDINIZACION', label: 'ISDINIZACION' },
            ]}
            onChange={(nextEvent) => setSelectedEventType(nextEvent.target.value === 'ISDINIZACION' ? 'ISDINIZACION' : 'FORMACION')}
          />
          <Select
            label="Modalidad"
            name="modalidad"
            value={selectedModality}
            options={[
              { value: 'PRESENCIAL', label: 'Presencial' },
              { value: 'EN_LINEA', label: 'En linea' },
            ]}
            onChange={(nextEvent) => setSelectedModality(nextEvent.target.value === 'EN_LINEA' ? 'EN_LINEA' : 'PRESENCIAL')}
          />
          <Select
            label="Estado"
            name="estado"
            defaultValue={event?.estado ?? 'BORRADOR'}
            options={['BORRADOR', 'PROGRAMADA', 'CERRADA', 'CANCELADA'].map((value) => ({ value, label: value }))}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Input
            label={selectedModality === 'EN_LINEA' ? 'Liga o sede virtual' : 'Sede'}
            name="sede"
            defaultValue={event?.sede ?? ''}
            required
          />
          <Input label="Ciudad" name="ciudad" defaultValue={event?.ciudad ?? ''} />
        </div>

        <div className="grid gap-4 xl:grid-cols-4">
          <Input label="Fecha inicio" name="fecha_inicio" type="date" defaultValue={event?.fechaInicio ?? ''} required />
          <Input label="Fecha fin" name="fecha_fin" type="date" defaultValue={event?.fechaFin ?? ''} required />
          <Input label="Horario inicio" name="horario_inicio" type="time" defaultValue={event?.scheduleStart ?? ''} required />
          <Input label="Horario fin" name="horario_fin" type="time" defaultValue={event?.scheduleEnd ?? ''} required />
        </div>

        <Select
          label="Supervisor"
          name="supervisor_id"
          value={selectedSupervisorId}
          options={[
            { value: '', label: 'Selecciona un supervisor' },
            ...data.supervisoresDisponibles.map((item) => ({
              value: item.id,
              label: `${item.nombre} · ${item.estados.join(', ') || 'Sin estado'}`,
            })),
          ]}
          onChange={(event) => {
            setSelectedSupervisorId(event.target.value)
          }}
        />

        <Select
          label="Coordinador"
          name="coordinador_id"
          value={selectedCoordinatorId}
          options={[
            { value: '', label: 'Selecciona un coordinador' },
            ...data.coordinadoresDisponibles.map((item) => ({
              value: item.id,
              label: item.zona ? `${item.nombre} · ${item.zona}` : item.nombre,
            })),
          ]}
          onChange={(nextEvent) => setSelectedCoordinatorId(nextEvent.target.value)}
        />

        <FieldTextarea
          label="Instrucciones"
          name="descripcion"
          defaultValue={event?.descripcion ?? ''}
          placeholder="Temas, requisitos previos y mensajes operativos de la sesion."
        />

        {selectedModality === 'PRESENCIAL' ? (
          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr_0.8fr]">
            <Input
              label="Direccion del evento"
              name="ubicacion_direccion"
              defaultValue={event?.locationAddress ?? ''}
              required
            />
            <Input
              label="Latitud"
              name="ubicacion_latitud"
              type="number"
              step="0.000001"
              defaultValue={event?.locationLatitude?.toString() ?? ''}
              required
            />
            <Input
              label="Longitud"
              name="ubicacion_longitud"
              type="number"
              step="0.000001"
              defaultValue={event?.locationLongitude?.toString() ?? ''}
              required
            />
            <Input
              label="Radio (m)"
              name="ubicacion_radio_metros"
              type="number"
              step="1"
              defaultValue={event?.locationRadiusMeters?.toString() ?? '100'}
            />
          </div>
        ) : (
          <div className="rounded-3xl border border-sky-100 bg-sky-50 px-4 py-4 text-sm text-sky-900">
            El check-in en linea pedira evidencia visual de presencia en la sesion. No se validara geocerca.
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Segmentacion de participantes</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Filtra por supervisor y marca las tiendas participantes. Las DC asignadas a esos PDVs quedaran inscritas.
                </p>
              </div>
              {selectedSupervisor && (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                  {selectedPdvCount} / {selectedSupervisor.pdvCount} PDVs
                </span>
              )}
            </div>

            {!selectedSupervisor ? (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                Primero selecciona un supervisor para ver el alcance de la formacion.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <PreviewMetric label="Supervisor" value={selectedSupervisor.nombre} />
                  <PreviewMetric
                    label="Coordinador"
                    value={selectedCoordinator?.nombre ?? selectedSupervisor.coordinatorName ?? event?.coordinatorName ?? 'Sin coordinador visible'}
                  />
                  <PreviewMetric label="Estados" value={selectedSupervisor.estados.join(', ')} />
                  <PreviewMetric
                    label="DC esperadas"
                    value={selectedDcCount > 0 ? String(selectedDcCount) : 'Se calcula al guardar'}
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                        PDVs impactados
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Marca solo las tiendas que participaran. La agenda de tienda se reemplazara por este evento.
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {selectedPdvCount} seleccionadas
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 xl:grid-cols-2">
                    {affectedPdvs.map((pdv) => (
                      <label
                        key={pdv.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 text-sm transition ${
                          selectedPdvIds.includes(pdv.id)
                            ? 'border-sky-300 bg-sky-50 text-slate-900'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          name="pdv_id"
                          value={pdv.id}
                          checked={selectedPdvIds.includes(pdv.id)}
                          onChange={() => togglePdv(pdv.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600"
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-950">{pdv.nombre}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {pdv.ciudad ?? 'Sin ciudad'} · {pdv.estado}
                          </p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-400">
                            {pdv.claveBtl}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Manual de mercadeo</p>
              <p className="mt-1 text-sm text-slate-500">
                Sube el PDF con instrucciones y requisitos previos para campo.
              </p>
              <input
                type="file"
                name="manual_pdf"
                accept="application/pdf"
                className="mt-4 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
              />
              {event?.manualDocument?.url && (
                <a
                  href={event.manualDocument.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex text-sm font-medium text-sky-700 hover:text-sky-800"
                >
                  Abrir manual actual{event.manualDocument.fileName ? ` · ${event.manualDocument.fileName}` : ''}
                </a>
              )}
            </div>
            <FieldTextarea
              label="Gastos operativos"
              name="gastos_operativos"
              rows={4}
              defaultValue=""
              placeholder="Tipo|Monto|Comentario"
            />
            <FieldTextarea
              label="Notificaciones"
              name="notificaciones"
              rows={4}
              defaultValue=""
              placeholder="Canal|Mensaje"
            />
          </div>
        </div>

        <StateMessage state={state} />
        <SubmitActionButton label={event ? 'Actualizar evento' : 'Crear evento'} pendingLabel={event ? 'Actualizando...' : 'Creando...'} />
      </form>
    </Card>
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

function AttendanceCard({ event }: { event: FormacionEventoItem | null }) {
  if (!event) {
    return (
      <Card className="border-slate-200 bg-white">
        <h2 className="text-lg font-semibold text-slate-950">Asistencias</h2>
        <p className="mt-2 text-sm text-slate-500">Selecciona un evento para registrar asistencias.</p>
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
        {event.asistencias.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no se generaron asistencias para este evento.</p>
        ) : (
          event.asistencias.map((item) => (
            <AttendanceRow key={item.id} item={item} eventId={event.id} />
          ))
        )}
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
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-semibold text-slate-950">{item.participanteNombre}</p>
          <p className="text-xs text-slate-500">{item.puesto ?? 'Sin puesto'}</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1">
            <input type="checkbox" name="presente" defaultChecked={item.presente} className="h-4 w-4" /> Presente
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" name="confirmado" defaultChecked={item.confirmado} className="h-4 w-4" /> Confirmado
          </label>
        </div>
      </div>
      <FieldTextarea label="Comentarios" name="comentarios" rows={2} defaultValue={item.comentarios ?? ''} placeholder="Notas de asistencia" />
      <FieldTextarea label="Evidencias" name="evidencias" rows={2} defaultValue="" placeholder="Lista de evidencias" />
      <StateMessage state={state} />
      <SubmitActionButton label="Guardar" pendingLabel="Guardando..." />
    </form>
  )
}

function GastosCard({ event }: { event: FormacionEventoItem | null }) {
  const [state, formAction] = useActionState(registrarGastoFormacion, ESTADO_FORMACION_ADMIN_INICIAL)

  if (!event) {
    return (
      <Card className="border-slate-200 bg-white">
        <h2 className="text-lg font-semibold text-slate-950">Gastos</h2>
        <p className="mt-2 text-sm text-slate-500">Selecciona un evento para ver los gastos asociados.</p>
      </Card>
    )
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-950">Gastos operativos</h2>
        <span className="text-xs text-slate-500">{event.gastosOperativos.length} registros</span>
      </div>
      <div className="space-y-2 text-sm">
        {event.gastosOperativos.length === 0 ? (
          <p className="text-sm text-slate-500">No se han registrado gastos.</p>
        ) : (
          event.gastosOperativos.map((item, index) => (
            <div key={`${item.tipo}-${index}`} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-2">
              <div>
                <p className="font-semibold text-slate-900">{item.tipo}</p>
                <p className="text-xs text-slate-500">{item.comentario ?? 'Sin comentarios'}</p>
              </div>
              <p className="text-sm font-semibold text-slate-900">{formatCurrency(item.monto)}</p>
            </div>
          ))
        )}
      </div>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="evento_id" value={event.id} />
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Tipo" name="tipo" required />
          <Input label="Monto" name="monto" type="number" step="0.01" required />
        </div>
        <FieldTextarea label="Comentario" name="comentario" rows={2} />
        <StateMessage state={state} />
        <SubmitActionButton label="Registrar gasto" pendingLabel="Guardando..." />
      </form>
    </Card>
  )
}

function NotificacionCard({ event }: { event: FormacionEventoItem | null }) {
  const [state, formAction] = useActionState(registrarNotificacionFormacion, ESTADO_FORMACION_ADMIN_INICIAL)

  if (!event) {
    return (
      <Card className="border-slate-200 bg-white">
        <h2 className="text-lg font-semibold text-slate-950">Notificaciones</h2>
        <p className="mt-2 text-sm text-slate-500">Selecciona un evento para registrar avisos.</p>
      </Card>
    )
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-950">Notificaciones a participantes</h2>
        <span className="text-xs text-slate-500">{event.notificaciones.length} enviadas</span>
      </div>
      <div className="space-y-2 text-sm">
        {event.notificaciones.length === 0 ? (
          <p className="text-sm text-slate-500">No se han registrado notificaciones.</p>
        ) : (
          event.notificaciones.map((item, index) => (
            <div key={`${item.canal}-${index}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-2">
              <p className="text-xs text-slate-500">{item.canal} · {item.estado}</p>
              <p className="font-semibold text-slate-900">{item.mensaje}</p>
            </div>
          ))
        )}
      </div>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="evento_id" value={event.id} />
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Canal" name="canal" required />
          <Input label="Participante ID" name="participante_id" />
        </div>
        <FieldTextarea label="Mensaje" name="mensaje" rows={2} required />
        <StateMessage state={state} />
        <SubmitActionButton label="Enviar notificación" pendingLabel="Enviando..." />
      </form>
    </Card>
  )
}

function FieldTextarea({
  label,
  name,
  rows = 3,
  defaultValue = '',
  placeholder = '',
  required = false,
}: {
  label: string
  name: string
  rows?: number
  defaultValue?: string
  placeholder?: string
  required?: boolean
}) {
  const fieldId = `${name}-${label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div className="w-full">
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      <textarea
        id={fieldId}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-foreground transition-all duration-200 placeholder:text-foreground-muted hover:border-border-dark focus:outline-none focus:ring-2 focus:ring-accent-500"
      />
    </div>
  )
}

function StateMessage({ state }: { state: { ok: boolean; message: string | null } }) {
  if (!state.message) {
    return null
  }

  return (
    <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
      {state.message}
    </p>
  )
}

function SubmitActionButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="sm" isLoading={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}
