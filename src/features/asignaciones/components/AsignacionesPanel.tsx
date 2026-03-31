'use client'

import Link from 'next/link'
import { useActionState, useDeferredValue, useMemo, useState, type ChangeEvent } from 'react'
import { Card } from '@/components/ui/card'
import { MexicoMap, type MexicoMapPoint } from '@/components/maps/MexicoMap'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { AssignmentCatalogImportRow } from '../lib/assignmentCatalogImport'
import type { AssignmentWeeklyScheduleImportRow } from '../lib/assignmentWeeklyScheduleImport'
import {
  guardarAsignacionPlanificada,
  importarCatalogoMaestroAsignaciones,
  importarHorariosSanPabloSemanales,
  publicarCatalogoMaestroAsignaciones,
  publicarOperacionMensualAsignaciones,
} from '../actions'
import type { AssignmentIssue } from '../lib/assignmentValidation'
import { DIA_LABORAL_CODES } from '../lib/assignmentPlanning'
import type { AsignacionesPanelData } from '../services/asignacionService'
import {
  ESTADO_ASIGNACION_INICIAL,
  ESTADO_IMPORTACION_ASIGNACIONES_INICIAL,
  ESTADO_PUBLICACION_CATALOGO_ASIGNACIONES_INICIAL,
  type AssignmentImportConflict,
} from '../state'
import { AsignacionEstadoControls } from './AsignacionEstadoControls'

function issueTone(severity: AssignmentIssue['severity']) {
  if (severity === 'ERROR') {
    return 'bg-rose-100 text-rose-700'
  }

  if (severity === 'ALERTA') {
    return 'bg-amber-100 text-amber-700'
  }

  return 'bg-sky-100 text-sky-700'
}

function formatDiasLaborales(value: string | null) {
  return value ?? 'Sin captura'
}

function formatNature(
  value: 'BASE' | 'COBERTURA_TEMPORAL' | 'COBERTURA_PERMANENTE' | 'MOVIMIENTO'
) {
  if (value === 'COBERTURA_PERMANENTE') {
    return 'Cobertura permanente'
  }

  if (value === 'COBERTURA_TEMPORAL' || value === 'MOVIMIENTO') {
    return 'Cobertura temporal'
  }

  return 'Base'
}

function formatImportMatch(row: AssignmentCatalogImportRow) {
  return row.idNomina ?? row.username ?? row.nombreDc ?? 'Sin referencia'
}

function formatImportConflictReference(conflict: { claveBtl: string | null; referenciaDc: string | null }) {
  const referenceParts = [conflict.claveBtl, conflict.referenciaDc].filter(Boolean)
  return referenceParts.length > 0 ? referenceParts.join(' · ') : 'Fila sin referencia operativa'
}

function summarizeImportConflicts(conflicts: Array<{ severity: AssignmentIssue['severity'] }>) {
  return {
    errors: conflicts.filter((item) => item.severity === 'ERROR').length,
    alerts: conflicts.filter((item) => item.severity === 'ALERTA').length,
    notices: conflicts.filter((item) => item.severity === 'AVISO').length,
  }
}

function buildCalendarParams(data: AsignacionesPanelData) {
  const params = new URLSearchParams()

  if (data.filtrosCalendario.month) {
    params.set('month', data.filtrosCalendario.month)
  }

  if (data.filtrosCalendario.supervisorEmpleadoId) {
    params.set('supervisor_empleado_id', data.filtrosCalendario.supervisorEmpleadoId)
  }

  if (data.filtrosCalendario.estadoOperativo) {
    params.set('estado_operativo', data.filtrosCalendario.estadoOperativo)
  }

  return params
}

function buildCalendarHref(data: AsignacionesPanelData, partial: Partial<AsignacionesPanelData['filtrosCalendario']>) {
  const params = buildCalendarParams(data)

  if (partial.month !== undefined) {
    if (partial.month) {
      params.set('month', partial.month)
    } else {
      params.delete('month')
    }
  }

  if (partial.supervisorEmpleadoId !== undefined) {
    if (partial.supervisorEmpleadoId) {
      params.set('supervisor_empleado_id', partial.supervisorEmpleadoId)
    } else {
      params.delete('supervisor_empleado_id')
    }
  }

  if (partial.estadoOperativo !== undefined) {
    if (partial.estadoOperativo) {
      params.set('estado_operativo', partial.estadoOperativo)
    } else {
      params.delete('estado_operativo')
    }
  }

  const query = params.toString()
  return query ? `/asignaciones?${query}` : '/asignaciones'
}

function shiftMonth(month: string, delta: number) {
  const [yearRaw, monthRaw] = month.split('-')
  const value = new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1 + delta, 1))
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit' }).format(value)
}

function formatCalendarMonthLabel(month: string) {
  const [yearRaw, monthRaw] = month.split('-')
  const value = new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1, 1))
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(value)
}

function getCalendarStateTone(estado: string) {
  if (estado === 'FORMACION') return 'bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200'
  if (estado === 'VACACIONES') return 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
  if (estado === 'INCAPACIDAD') return 'bg-rose-100 text-rose-800 ring-1 ring-rose-200'
  if (estado === 'FALTA_JUSTIFICADA') return 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
  if (estado === 'ASIGNADA_PDV') return 'bg-slate-100 text-slate-800 ring-1 ring-slate-200'
  return 'bg-slate-50 text-slate-500 ring-1 ring-slate-200'
}

function getCalendarStateLabel(estado: string, pdvNombre: string | null) {
  if (estado === 'FORMACION') return 'FORM'
  if (estado === 'VACACIONES') return 'VAC'
  if (estado === 'INCAPACIDAD') return 'INC'
  if (estado === 'FALTA_JUSTIFICADA') return 'JUST'
  if (estado === 'ASIGNADA_PDV') return pdvNombre ? pdvNombre.slice(0, 10) : 'PDV'
  return 'SIN'
}

function formatOperationalStateLabel(estado: string) {
  if (estado === 'FORMACION') return 'Formacion'
  if (estado === 'VACACIONES') return 'Vacaciones'
  if (estado === 'INCAPACIDAD') return 'Incapacidad'
  if (estado === 'FALTA_JUSTIFICADA') return 'Falta justificada'
  if (estado === 'ASIGNADA_PDV') return 'Asignada a PDV'
  return 'Sin asignacion'
}

function getCurrentMxDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function buildInitialMapDate(data: AsignacionesPanelData) {
  const days = data.calendarioMensual?.dias ?? []
  if (days.length === 0) {
    return null
  }

  const today = getCurrentMxDate()
  return days.includes(today) ? today : days[0]
}

function buildCellKey(empleadoId: string, fecha: string) {
  return `${empleadoId}::${fecha}`
}

function hasBirthdayFlag(flags: Record<string, unknown>) {
  return flags.cumpleanos === true
}

function getMapPointTone(estado: string): MexicoMapPoint['tone'] {
  if (estado === 'FORMACION') return 'sky'
  if (estado === 'VACACIONES') return 'amber'
  if (estado === 'INCAPACIDAD') return 'rose'
  if (estado === 'FALTA_JUSTIFICADA') return 'emerald'
  if (estado === 'ASIGNADA_PDV') return 'violet'
  return 'slate'
}

export function AsignacionesPanel({
  data,
  puedeGestionar,
}: {
  data: AsignacionesPanelData
  puedeGestionar: boolean
}) {
  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('ALL')
  const [tipoFilter, setTipoFilter] = useState('ALL')
  const [issueFilter, setIssueFilter] = useState('ALL')
  const [selectedMapDate, setSelectedMapDate] = useState<string | null>(() => buildInitialMapDate(data))
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null)
  const [gestionTab, setGestionTab] = useState<'catalogo' | 'horarios' | 'manual'>('catalogo')
  const deferredSearch = useDeferredValue(search.trim().toLowerCase())

  const asignacionesFiltradas = data.asignaciones.filter((item) => {
    const matchesSearch = !deferredSearch
      ? true
      : [item.empleado, item.pdv, item.pdvClaveBtl, item.cadena, item.zona]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(deferredSearch))

    const matchesEstado = estadoFilter === 'ALL' || item.estadoPublicacion === estadoFilter
    const matchesTipo = tipoFilter === 'ALL' || item.tipo === tipoFilter
    const matchesIssue =
      issueFilter === 'ALL'
        ? true
        : item.issues.some((issue) => issue.severity === issueFilter)

    return matchesSearch && matchesEstado && matchesTipo && matchesIssue
  })

  const selectedDayMap = useMemo(() => {
    if (!data.calendarioMensual || !selectedMapDate) {
      return null
    }

    const items = data.calendarioMensual.empleados
      .map((empleado) => {
        const dia = empleado.dias.find((item) => item.fecha === selectedMapDate)
        return dia ? { empleado, dia } : null
      })
      .filter((item): item is { empleado: NonNullable<typeof data.calendarioMensual>['empleados'][number]; dia: NonNullable<typeof data.calendarioMensual>['empleados'][number]['dias'][number] } => Boolean(item))

    const points: MexicoMapPoint[] = items
      .filter((item) => item.dia.latitud !== null && item.dia.longitud !== null)
      .map((item) => ({
        id: buildCellKey(item.empleado.empleadoId, item.dia.fecha),
        lat: item.dia.latitud as number,
        lng: item.dia.longitud as number,
        title: item.empleado.nombreCompleto,
        subtitle: item.dia.pdvNombre ?? item.dia.sedeFormacion ?? formatOperationalStateLabel(item.dia.estadoOperativo),
        detail: `${formatOperationalStateLabel(item.dia.estadoOperativo)}${item.dia.horarioInicio ? ` · ${item.dia.horarioInicio}${item.dia.horarioFin ? `-${item.dia.horarioFin}` : ''}` : ''}`,
        tone: getMapPointTone(item.dia.estadoOperativo),
        radiusMeters: item.dia.radioToleranciaMetros ?? null,
      }))

    return {
      items,
      points,
      sinCoordenadas: items.filter((item) => item.dia.latitud === null || item.dia.longitud === null).length,
    }
  }, [data.calendarioMensual, selectedMapDate])

  const selectedCellDetail = useMemo(() => {
    if (!data.calendarioMensual || !selectedCellKey) {
      return null
    }

    for (const empleado of data.calendarioMensual.empleados) {
      for (const dia of empleado.dias) {
        if (buildCellKey(empleado.empleadoId, dia.fecha) === selectedCellKey) {
          return { empleado, dia }
        }
      }
    }

    return null
  }, [data.calendarioMensual, selectedCellKey])

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      {puedeGestionar ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {[
              { id: 'catalogo', label: 'Catalogo maestro inicial' },
              { id: 'horarios', label: 'Horarios semanales San Pablo' },
              { id: 'manual', label: 'Nueva asignacion' },
            ].map((item) => {
              const active = gestionTab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setGestionTab(item.id as 'catalogo' | 'horarios' | 'manual')}
                  className={active
                    ? 'rounded-full bg-[var(--module-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm'
                    : 'rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950'}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          {gestionTab === 'catalogo' ? <ImportarCatalogoMaestroCard data={data} /> : null}
          {gestionTab === 'horarios' ? <ImportarHorariosSanPabloCard /> : null}
          {gestionTab === 'manual' ? <NuevaAsignacionCard data={data} /> : null}
        </div>
      ) : (
        <Card className="border-sky-200 bg-sky-50 text-sky-900">
          <p className="font-medium">Vista operativa en solo lectura</p>
          <p className="mt-2 text-sm">
            El alta y la publicacion de asignaciones solo estan habilitadas para administradores.
          </p>
        </Card>
      )}

      {data.avisosGlobales.length > 0 && (
        <Card className="border-sky-200 bg-sky-50">
          <h2 className="text-lg font-semibold text-slate-950">Avisos de cobertura</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {data.avisosGlobales.map((item) => (
              <div key={item.code} className="rounded-2xl border border-sky-100 bg-white p-4">
                <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                <p className="mt-1 text-sm text-slate-600">{item.message}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="space-y-5 bg-white p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
              Calendario mensual
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">Operacion diaria resuelta</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Vista mensual materializada por dermoconsejera con PDV efectivo, formaciones, vacaciones, incapacidades y eventos que sobreponen la jornada.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <Link
              href={buildCalendarHref(data, { month: shiftMonth(data.filtrosCalendario.month, -1) })}
              className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
            >
              Mes previo
            </Link>
            <Link
              href={buildCalendarHref(data, { month: shiftMonth(data.filtrosCalendario.month, 1) })}
              className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
            >
              Mes siguiente
            </Link>
          </div>
        </div>

        <form action="/asignaciones" className="grid gap-4 lg:grid-cols-[minmax(180px,220px)_minmax(220px,1fr)_minmax(220px,260px)_auto] lg:items-end">
          <label className="block text-sm text-slate-600">
            Mes visible
            <input
              type="month"
              name="month"
              defaultValue={data.filtrosCalendario.month}
              className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
            />
          </label>

          {!data.supervisorCalendarioBloqueado && (
            <label className="block text-sm text-slate-600">
              Supervisor
              <select
                name="supervisor_empleado_id"
                defaultValue={data.filtrosCalendario.supervisorEmpleadoId ?? ''}
                className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
              >
                <option value="">Todos los supervisores</option>
                {data.supervisoresCalendario.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-sm text-slate-600">
            Estado operativo
            <select
              name="estado_operativo"
              defaultValue={data.filtrosCalendario.estadoOperativo ?? ''}
              className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
            >
              <option value="">Todos los estados</option>
              <option value="ASIGNADA_PDV">Asignada a PDV</option>
              <option value="FORMACION">Formacion</option>
              <option value="VACACIONES">Vacaciones</option>
              <option value="INCAPACIDAD">Incapacidad</option>
              <option value="FALTA_JUSTIFICADA">Falta justificada</option>
              <option value="SIN_ASIGNACION">Sin asignacion</option>
            </select>
          </label>

          <div className="flex gap-3">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-full bg-[var(--module-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95"
            >
              Aplicar filtros
            </button>
            <Link
              href="/asignaciones"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
            >
              Limpiar
            </Link>
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
            {formatCalendarMonthLabel(data.filtrosCalendario.month)}
          </span>
          <span>{data.calendarioMensual?.totalEmpleados ?? 0} dermoconsejeras visibles</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            PDV / FORM / VAC / INC / JUST / SIN
          </span>
        </div>

        {data.mensajeCalendario && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {data.mensajeCalendario}
          </div>
        )}

        {data.calendarioMensual ? (
          <div className="overflow-x-auto rounded-[24px] border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 font-medium">Dermoconsejera</th>
                  <th className="sticky left-[220px] z-20 bg-slate-50 px-4 py-3 font-medium">Supervisor</th>
                  {data.calendarioMensual.dias.map((fecha) => (
                    <th key={fecha} className="px-2 py-3 text-center font-medium">
                      {Number(fecha.slice(-2))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.calendarioMensual.empleados.length === 0 ? (
                  <tr>
                    <td colSpan={data.calendarioMensual.dias.length + 2} className="px-6 py-8 text-center text-slate-500">
                      No hay dermoconsejeras visibles para los filtros del calendario.
                    </td>
                  </tr>
                ) : (
                  data.calendarioMensual.empleados.map((empleado) => (
                    <tr key={empleado.empleadoId} className="border-t border-slate-100 align-top">
                      <td className="sticky left-0 z-10 min-w-[220px] bg-white px-4 py-4">
                        <div className="font-medium text-slate-950">{empleado.nombreCompleto}</div>
                        <div className="mt-1 text-xs text-slate-400">{empleado.zona ?? 'Sin zona'}</div>
                      </td>
                      <td className="sticky left-[220px] z-10 min-w-[200px] bg-white px-4 py-4 text-slate-600">
                        <div className="font-medium text-slate-900">{empleado.supervisorNombre ?? 'Sin supervisor'}</div>
                        <div className="mt-1 text-xs text-slate-400">{empleado.coordinadorNombre ?? 'Sin coordinador'}</div>
                      </td>
                      {empleado.dias.map((dia) => {
                        const cellKey = buildCellKey(empleado.empleadoId, dia.fecha)
                        const selected = selectedCellKey === cellKey

                        return (
                          <td key={dia.fecha} className="px-2 py-3 text-center">
                            <button
                              type="button"
                              title={dia.mensajeOperativo ?? dia.pdvNombre ?? dia.sedeFormacion ?? dia.estadoOperativo}
                              onClick={() => setSelectedCellKey(cellKey)}
                              className={`mx-auto flex min-h-[52px] min-w-[64px] items-center justify-center rounded-2xl px-2 py-2 text-[11px] font-semibold transition ${getCalendarStateTone(dia.estadoOperativo)} ${selected ? 'ring-2 ring-slate-950 ring-offset-2 ring-offset-white' : 'hover:scale-[1.02]'}`}
                            >
                              <span className="flex flex-col items-center gap-1 leading-none">
                                <span>{getCalendarStateLabel(dia.estadoOperativo, dia.pdvNombre)}</span>
                                {hasBirthdayFlag(dia.flags) && (
                                  <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[9px] font-bold text-amber-900">
                                    CUMP
                                  </span>
                                )}
                              </span>
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <Card className="space-y-4 bg-white p-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
              Detalle del dia
            </p>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">Lectura operativa por celda</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Toca cualquier dia del calendario para ver la sucursal efectiva, el estado del dia y las senales operativas que sobrepusieron la jornada.
            </p>
          </div>

          {selectedCellDetail ? (
            <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-950">{selectedCellDetail.empleado.nombreCompleto}</p>
                  <p className="mt-1 text-sm text-slate-500">{selectedCellDetail.dia.fecha}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getCalendarStateTone(selectedCellDetail.dia.estadoOperativo)}`}>
                  {formatOperationalStateLabel(selectedCellDetail.dia.estadoOperativo)}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <DetailBlock label="PDV efectivo" value={selectedCellDetail.dia.pdvNombre ?? selectedCellDetail.dia.sedeFormacion ?? 'Sin PDV operativo'} />
                <DetailBlock label="Clave / zona" value={selectedCellDetail.dia.pdvClaveBtl ?? selectedCellDetail.dia.pdvZona ?? 'Sin dato'} />
                <DetailBlock label="Horario" value={selectedCellDetail.dia.horarioInicio ? `${selectedCellDetail.dia.horarioInicio}${selectedCellDetail.dia.horarioFin ? ` - ${selectedCellDetail.dia.horarioFin}` : ''}` : 'Sin horario'} />
                <DetailBlock label="Supervisor" value={selectedCellDetail.empleado.supervisorNombre ?? 'Sin supervisor'} />
                <DetailBlock label="Coordinador" value={selectedCellDetail.empleado.coordinadorNombre ?? 'Sin coordinador'} />
                <DetailBlock label="Origen" value={selectedCellDetail.dia.origen} />
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-medium">
                <span className={`rounded-full px-3 py-1 ${selectedCellDetail.dia.laborable ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  {selectedCellDetail.dia.laborable ? 'Dia laborable' : 'Dia no laborable'}
                </span>
                <span className={`rounded-full px-3 py-1 ${selectedCellDetail.dia.trabajaEnTienda ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
                  {selectedCellDetail.dia.trabajaEnTienda ? 'Opera en tienda' : 'No opera en tienda'}
                </span>
                {hasBirthdayFlag(selectedCellDetail.dia.flags) && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">Cumpleanos</span>
                )}
                {selectedCellDetail.dia.sedeFormacion && (
                  <span className="rounded-full bg-cyan-100 px-3 py-1 text-cyan-800">Sede: {selectedCellDetail.dia.sedeFormacion}</span>
                )}
              </div>

              {selectedCellDetail.dia.mensajeOperativo && (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                  {selectedCellDetail.dia.mensajeOperativo}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm text-slate-500">
              Aun no hay una celda seleccionada. Elige un dia del calendario para ver el detalle completo.
            </div>
          )}
        </Card>

        <Card className="space-y-4 bg-white p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
                Vista geografica mensual
              </p>
              <h3 className="mt-2 text-lg font-semibold text-slate-950">Equipo del dia sobre el mapa</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Selecciona un dia del mes para ver donde esta operando el equipo resuelto. El mapa usa la misma asignacion diaria materializada del calendario.
              </p>
            </div>
            <label className="block text-sm text-slate-600">
              Dia visible
              <select
                value={selectedMapDate ?? ''}
                onChange={(event) => setSelectedMapDate(event.target.value || null)}
                className="mt-2 min-w-[180px] rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
              >
                {(data.calendarioMensual?.dias ?? []).map((fecha) => (
                  <option key={fecha} value={fecha}>
                    {fecha}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-slate-500">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
              {selectedDayMap?.points.length ?? 0} punto(s) visibles
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
              {selectedDayMap?.sinCoordenadas ?? 0} sin coordenadas
            </span>
          </div>

          {selectedDayMap && selectedDayMap.points.length > 0 ? (
            <MexicoMap
              points={selectedDayMap.points}
              selectedPointId={selectedCellKey}
              onSelect={(pointId) => setSelectedCellKey(pointId)}
              showCoverageCircles
              heightClassName="h-[360px]"
              minZoom={4}
              maxZoom={12}
            />
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center text-sm text-slate-500">
              No hay puntos geograficos visibles para el dia seleccionado. Esto normalmente significa vacaciones, incapacidad, formacion sin sede georreferenciada o PDVs sin geocerca.
            </div>
          )}
        </Card>
      </div>

      {data.vistaDia.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-950">Vista del dia</h2>
            <p className="mt-1 text-sm text-slate-500">
              Asignaciones activas hoy para seguimiento operativo de coordinacion y supervision.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Empleado</th>
                  <th className="px-6 py-3 font-medium">PDV</th>
                  <th className="px-6 py-3 font-medium">Horario</th>
                  <th className="px-6 py-3 font-medium">Zona</th>
                  <th className="px-6 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.vistaDia.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4 text-slate-900">{item.empleado ?? 'Sin empleado'}</td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{item.pdv ?? 'Sin PDV'}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.pdvClaveBtl ?? 'Sin clave'}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{item.horario ?? 'Sin horario'}</td>
                    <td className="px-6 py-4 text-slate-600">{item.zona ?? 'Sin zona'}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${item.estadoPublicacion === 'PUBLICADA' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                        {item.estadoPublicacion}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
        <MetricCard label="Total visible" value={String(data.resumen.total)} />
        <MetricCard label="Borrador" value={String(data.resumen.borrador)} />
        <MetricCard label="Publicadas" value={String(data.resumen.publicada)} />
        <MetricCard label="Coberturas" value={String(data.resumen.coberturas)} />
        <MetricCard label="Con bloqueo" value={String(data.resumen.conBloqueo)} />
        <MetricCard label="Con alertas" value={String(data.resumen.conAlerta)} />
        <MetricCard label="Con avisos" value={String(data.resumen.conAviso)} />
        <MetricCard label="Publicadas invalidas" value={String(data.resumen.publicadasInvalidas)} />
      </div>

      <Card className="border-slate-200 bg-white">
        <div className="grid gap-4 md:grid-cols-4">
          <Input
            label="Buscar"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Empleado, PDV, cuenta o zona"
          />
          <Select
            label="Estado"
            value={estadoFilter}
            onChange={(event) => setEstadoFilter(event.target.value)}
            options={[
              { value: 'ALL', label: 'Todos' },
              { value: 'BORRADOR', label: 'Borrador' },
              { value: 'PUBLICADA', label: 'Publicada' },
            ]}
          />
          <Select
            label="Tipo"
            value={tipoFilter}
            onChange={(event) => setTipoFilter(event.target.value)}
            options={[
              { value: 'ALL', label: 'Todos' },
              { value: 'FIJA', label: 'Fija' },
              { value: 'ROTATIVA', label: 'Rotativa' },
              { value: 'COBERTURA', label: 'Cobertura' },
            ]}
          />
          <Select
            label="Issues"
            value={issueFilter}
            onChange={(event) => setIssueFilter(event.target.value)}
            options={[
              { value: 'ALL', label: 'Todos' },
              { value: 'ERROR', label: 'Errores' },
              { value: 'ALERTA', label: 'Alertas' },
              { value: 'AVISO', label: 'Avisos' },
            ]}
          />
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Asignaciones</h2>
          <p className="mt-1 text-sm text-slate-500">
            Listado operativo con validacion tipada, filtros y publicacion controlada.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Empleado</th>
                <th className="px-6 py-3 font-medium">PDV</th>
                <th className="px-6 py-3 font-medium">Planeacion</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium">Issues</th>
                <th className="px-6 py-3 font-medium">Accion</th>
              </tr>
            </thead>
            <tbody>
              {asignacionesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Sin asignaciones visibles para los filtros actuales.
                  </td>
                </tr>
              ) : (
                asignacionesFiltradas.map((asignacion) => (
                  <tr key={asignacion.id} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4 text-slate-900">
                      <div className="font-medium">{asignacion.empleado ?? 'Sin empleado'}</div>
                      <div className="mt-1 text-xs text-slate-400">{asignacion.cuentaCliente ?? 'Sin cuenta'}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{asignacion.pdv ?? 'Sin PDV'}</div>
                      <div className="mt-1 text-xs text-slate-400">{asignacion.pdvClaveBtl ?? 'Sin clave'} · {asignacion.cadena ?? 'Sin cadena'}</div>
                      <div className="mt-1 text-xs text-slate-400">{asignacion.zona ?? 'Sin zona'}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{asignacion.tipo}</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-600">
                          {formatNature(asignacion.naturaleza)}
                        </span>
                        {asignacion.retornaABase && (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700">
                            Retorna
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">{asignacion.fechaInicio}{asignacion.fechaFin ? ` -> ${asignacion.fechaFin}` : ''}</div>
                      <div className="mt-1 text-xs text-slate-400">Horario: {asignacion.horario ?? 'Sin referencia'}</div>

                      {asignacion.motivoMovimiento && (
                        <div className="mt-1 text-xs text-slate-400">Motivo: {asignacion.motivoMovimiento}</div>
                      )}
                      <div className="mt-1 text-xs text-slate-400">Dias: {formatDiasLaborales(asignacion.diasLaborales)} / descanso {asignacion.diaDescanso ?? 'sin captura'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${asignacion.estadoPublicacion === 'PUBLICADA' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                        {asignacion.estadoPublicacion}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {asignacion.issues.length === 0 ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                          Lista para publicar
                        </span>
                      ) : (
                        <div className="space-y-2">
                          {asignacion.issues.map((issue) => (
                            <div key={`${asignacion.id}-${issue.code}`} className={`rounded-full px-3 py-1 text-xs font-medium ${issueTone(issue.severity)}`}>
                              {issue.severity}: {issue.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <AsignacionEstadoControls
                        asignacionId={asignacion.id}
                        estadoPublicacion={asignacion.estadoPublicacion}
                        bloqueada={asignacion.bloqueada}
                        puedeGestionar={puedeGestionar}
                        alertasCount={asignacion.alertasCount}
                        requiereConfirmacionAlertas={asignacion.requiereConfirmacionAlertas}
                      />
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

function ImportarCatalogoMaestroCard({ data }: { data: AsignacionesPanelData }) {
  const [state, formAction] = useActionState(
    importarCatalogoMaestroAsignaciones,
    ESTADO_IMPORTACION_ASIGNACIONES_INICIAL
  )
  const [approvalState, approvalAction] = useActionState(
    publicarCatalogoMaestroAsignaciones,
    ESTADO_PUBLICACION_CATALOGO_ASIGNACIONES_INICIAL
  )
  const [monthlyState, monthlyAction] = useActionState(
    publicarOperacionMensualAsignaciones,
    ESTADO_PUBLICACION_CATALOGO_ASIGNACIONES_INICIAL
  )
  const [fileName, setFileName] = useState<string | null>(null)
  const [previewRows, setPreviewRows] = useState<AssignmentCatalogImportRow[]>([])
  const [previewMeta, setPreviewMeta] = useState<{ rows: number; skippedRows: number } | null>(null)
  const [previewIssues, setPreviewIssues] = useState<AssignmentImportConflict[]>([])
  const [previewError, setPreviewError] = useState<string | null>(null)

  const previewVisibleRows = useMemo(() => previewRows.slice(0, 6), [previewRows])
  const previewConflictSummary = useMemo(() => summarizeImportConflicts(previewIssues), [previewIssues])
  const importConflictSummary = useMemo(() => summarizeImportConflicts(state.conflicts), [state.conflicts])
  const approvalConflictSummary = useMemo(() => summarizeImportConflicts(approvalState.conflicts), [approvalState.conflicts])
  const draftBaseCount = useMemo(
    () => data.asignaciones.filter((item) => item.naturaleza === 'BASE' && item.estadoPublicacion === 'BORRADOR').length,
    [data.asignaciones]
  )
  const approvedBaseCount = useMemo(
    () => data.asignaciones.filter((item) => item.naturaleza === 'BASE' && item.estadoPublicacion === 'PUBLICADA').length,
    [data.asignaciones]
  )
  async function handleFilePreview(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null

    setPreviewError(null)
    setPreviewRows([])
    setPreviewMeta(null)
    setPreviewIssues([])
    setFileName(file?.name ?? null)

    if (!file) {
      return
    }

    try {
      const { parseAssignmentCatalogWorkbook } = await import('../lib/assignmentCatalogImport')
      const buffer = new Uint8Array(await file.arrayBuffer())
      const parsed = parseAssignmentCatalogWorkbook(buffer)
      setPreviewRows(parsed.rows)
      setPreviewMeta({ rows: parsed.rows.length, skippedRows: parsed.skippedRows })
      setPreviewIssues(
        parsed.issues.map((issue) => ({
          rowNumber: issue.rowNumber,
          claveBtl: null,
          referenciaDc: null,
          tipo: null,
          severity: issue.severity,
          code: issue.code,
          label:
            issue.code === 'FILA_SIN_BTL'
              ? 'Fila sin BTL CVE'
              : issue.code === 'FILA_SIN_REFERENCIA_DC'
                ? 'Fila sin referencia de DC'
                : issue.code === 'FILA_DUPLICADA'
                  ? 'Fila duplicada'
                  : issue.code === 'DESCANSO_INVALIDO'
                    ? 'Descanso invalido'
                    : 'Dias laborales invalidos',
          message: issue.message,
          source: 'PARSER',
        }))
      )
    } catch (error) {
      setPreviewError(
        error instanceof Error
          ? error.message
          : 'No fue posible leer el archivo del catalogo maestro.'
      )
    }
  }

  return (
    <Card className="border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Cargar catalogo maestro inicial</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Este paso se usa una sola vez para poblar la base viva de asignaciones. Despues,
            la operacion diaria debe continuar solo con movimientos puntuales, cierres de
            vigencia y retornos automaticos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/api/asignaciones/template"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Descargar plantilla
          </Link>
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-sky-700">
            Catalogo inicial
          </span>
        </div>
      </div>

      <form action={formAction} className="mt-6 space-y-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <label className="block text-sm text-slate-700">
              <span className="font-medium text-slate-900">Archivo Excel</span>
              <input
                name="catalogo_asignaciones_file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFilePreview}
                className="mt-2 block w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
              />
            </label>

            <div className="rounded-[18px] border border-sky-100 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
              <p className="font-medium">Columnas esperadas</p>
              <p className="mt-2">
                Usa la plantilla oficial para respetar los encabezados que hoy reconoce el importador:
                `BTL CVE`, una referencia de la dermoconsejera (`IDNOM`, `USUARIO` o
                `NOMBRE DC`), tipo opcional, horario, dias laborales, descanso y observaciones.
                Esta carga ya no pide fecha fin: se trata como la base general abierta y el sistema
                asigna fecha de inicio al dia de la carga.
              </p>
              <p className="mt-3 text-xs text-sky-800">
                La nomenclatura de dias ya acepta formas compactas como `L-M-X-J-V`, listas completas
                como `LUN, MAR, MIE` y rangos como `LUN-SAB` o `JUE-MAR`.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Importar catalogo maestro
              </button>
              {state.message && (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    state.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}
                >
                  {state.message}
                </div>
              )}
            </div>

            {state.summary && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Filas</p>
                  <p className="mt-1 font-semibold text-slate-950">{state.summary.parsedRows} parseadas</p>
                  <p className="text-xs text-slate-500">{state.summary.skippedRows} omitidas en parser</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Resultado</p>
                  <p className="mt-1 font-semibold text-slate-950">{state.summary.insertedRows} nuevas · {state.summary.updatedRows} actualizadas</p>
                  <p className="text-xs text-slate-500">PDVs sin resolver: {state.summary.unresolvedPdvs} · DCs sin resolver: {state.summary.unresolvedEmployees}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Conflictos</p>
                  <p className="mt-1 font-semibold text-slate-950">{state.summary.conflictCount} errores · {state.summary.alertCount} alertas</p>
                  <p className="text-xs text-slate-500">Avisos: {state.summary.noticeCount}</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="rounded-[18px] border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-emerald-950">Aprobacion del catalogo maestro</p>
                    <p className="mt-1 leading-6 text-emerald-900">
                      Cuando el catalogo ya no tenga errores bloqueantes, apruebalo para volverlo la base viva de asignaciones. Esta accion publica las bases en borrador y materializa solo la ventana operativa del mes actual y el siguiente.
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {draftBaseCount} borrador(es) base
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      formAction={approvalAction}
                      type="submit"
                      disabled={draftBaseCount === 0}
                      className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                    >
                      Aprobar catalogo maestro
                    </button>
                    {approvalState.message && (
                      <div
                        className={
                          approvalState.ok
                            ? 'rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-800'
                            : 'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800'
                        }
                      >
                        {approvalState.message}
                      </div>
                    )}
                  </div>

                  {(approvalState.publishedRows > 0 || approvalState.materializedEmployees > 0) && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-600">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Bases aprobadas</p>
                        <p className="mt-1 font-semibold text-slate-950">{approvalState.publishedRows} asignaciones base</p>
                      </div>
                      <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-600">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Ventana operativa</p>
                        <p className="mt-1 font-semibold text-slate-950">
                          {approvalState.materializedEmployees} empleado(s) · {approvalState.materializedWindowLabel ?? 'mes actual + siguiente'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[18px] border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sky-950">Publicacion operativa mensual</p>
                    <p className="mt-1 leading-6 text-sky-900">
                      Usa esta accion para generar o regenerar un mes puntual cuando haya nuevos ingresos, bajas o movimientos ya corregidos sobre la base aprobada. Ademas, la publicacion automatica de backend puede asegurar mes actual + siguiente sin depender del frontend. La dermoconsejera seguira consultando solo la asignacion diaria resuelta del mes vigente.
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                    {approvedBaseCount} base(s) aprobada(s)
                  </span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(180px,220px)_auto_1fr] md:items-end">
                  <label className="block text-sm text-sky-950">
                    <span className="font-medium">Mes operativo</span>
                    <input
                      type="month"
                      name="operational_month"
                      defaultValue={data.filtrosCalendario.month}
                      className="mt-2 w-full rounded-[14px] border border-sky-200 bg-white px-4 py-3 text-sm text-slate-900"
                    />
                  </label>

                  <button
                    formAction={monthlyAction}
                    type="submit"
                    disabled={approvedBaseCount === 0}
                    className="inline-flex items-center justify-center rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
                  >
                    Publicar operacion mensual
                  </button>

                  <div className="flex min-h-[52px] items-center">
                    {monthlyState.message && (
                      <div
                        className={
                          monthlyState.ok
                            ? 'rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm text-sky-800'
                            : 'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800'
                        }
                      >
                        {monthlyState.message}
                      </div>
                    )}
                  </div>
                </div>

                {(monthlyState.publishedRows > 0 || monthlyState.materializedEmployees > 0) && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm text-slate-600">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Bases cubiertas</p>
                      <p className="mt-1 font-semibold text-slate-950">{monthlyState.publishedRows} asignaciones base</p>
                    </div>
                    <div className="rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm text-slate-600">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Mes materializado</p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {monthlyState.materializedEmployees} empleado(s) · {monthlyState.materializedWindowLabel ?? formatCalendarMonthLabel(data.filtrosCalendario.month)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Validacion previa</p>
                <p className="mt-1 text-sm text-slate-500">
                  {fileName ? `Archivo: ${fileName}` : 'Selecciona un XLSX para validar antes de importar.'}
                </p>
              </div>
              {previewMeta && (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                  {previewMeta.rows} fila(s) validas · {previewMeta.skippedRows} omitida(s)
                </span>
              )}
            </div>

            {previewError ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {previewError}
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {previewIssues.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Conflictos del archivo</p>
                        <p className="mt-1 text-xs text-slate-600">
                          Revisa este bloque primero. Aqui aparecen los problemas de nomenclatura, filas incompletas o duplicadas antes de importar.
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700">
                        {previewConflictSummary.errors} errores · {previewConflictSummary.alerts} alertas
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {previewIssues.slice(0, 8).map((issue) => (
                        <div key={`preview-${issue.rowNumber}-${issue.code}`} className="rounded-2xl border border-white bg-white px-4 py-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${issueTone(issue.severity)}`}>
                              {issue.severity}
                            </span>
                            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fila {issue.rowNumber}</span>
                          </div>
                          <p className="mt-2 font-medium text-slate-950">{issue.label}</p>
                          <p className="mt-1 text-sm text-slate-600">{issue.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {state.conflicts.length > 0 && (
                  <div className="rounded-2xl border border-rose-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Conflictos de importacion</p>
                        <p className="mt-1 text-xs text-slate-600">
                          Este cuadro concentra empalmes, DC/PDV no resueltos y todas las validaciones operativas detectadas antes de escribir el catalogo maestro.
                        </p>
                      </div>
                      <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
                        {importConflictSummary.errors} errores · {importConflictSummary.alerts} alertas · {importConflictSummary.notices} avisos
                      </span>
                    </div>
                    <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                      {state.conflicts.map((conflict) => (
                        <div key={`state-${conflict.rowNumber}-${conflict.code}-${conflict.source}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${issueTone(conflict.severity)}`}>
                              {conflict.severity}
                            </span>
                            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{conflict.source}</span>
                            {conflict.rowNumber && (
                              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fila {conflict.rowNumber}</span>
                            )}
                          </div>
                          <p className="mt-2 font-medium text-slate-950">{conflict.label}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatImportConflictReference(conflict)}</p>
                          <p className="mt-1 text-sm text-slate-600">{conflict.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {approvalState.conflicts.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Conflictos de aprobacion del catalogo</p>
                        <p className="mt-1 text-xs text-slate-600">
                          Este cuadro muestra lo que todavia bloquea o alerta la aprobacion del catalogo maestro cargado en borrador.
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                        {approvalConflictSummary.errors} errores · {approvalConflictSummary.alerts} alertas · {approvalConflictSummary.notices} avisos
                      </span>
                    </div>
                    <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                      {approvalState.conflicts.map((conflict, index) => (
                        <div key={`publish-${index}-${conflict.code}-${conflict.source}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${issueTone(conflict.severity)}`}>
                              {conflict.severity}
                            </span>
                            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{conflict.source}</span>
                          </div>
                          <p className="mt-2 font-medium text-slate-950">{conflict.label}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatImportConflictReference(conflict)}</p>
                          <p className="mt-1 text-sm text-slate-600">{conflict.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {previewVisibleRows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                    Aun no hay filas para previsualizar.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Filas validas del catalogo</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Este listado solo muestra las filas parseadas. Los conflictos quedan arriba, en un cuadro separado.
                      </p>
                    </div>
                    {previewVisibleRows.map((row) => (
                      <div key={`${row.rowNumber}-${row.claveBtl}-${row.tipo}`} className="rounded-2xl border border-white bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-950">{row.claveBtl}</p>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-600">
                            {row.tipo}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{formatImportMatch(row)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.fechaInicio ? `Base desde ${row.fechaInicio}` : 'Base general sin vigencia capturada'} · Horario:{' '}
                          {row.horarioReferencia ?? 'sin referencia'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Dias: {row.diasLaborales ?? 'sin captura'} · Descanso:{' '}
                          {row.diaDescanso ?? 'sin captura'}
                        </p>
                      </div>
                    ))}

                    {previewRows.length > previewVisibleRows.length && (
                      <p className="text-xs text-slate-500">
                        Se muestran {previewVisibleRows.length} de {previewRows.length} filas validas.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </form>
    </Card>
  )
}

function ImportarHorariosSanPabloCard() {
  const [state, formAction] = useActionState(
    importarHorariosSanPabloSemanales,
    ESTADO_IMPORTACION_ASIGNACIONES_INICIAL
  )
  const [fileName, setFileName] = useState<string | null>(null)
  const [previewRows, setPreviewRows] = useState<AssignmentWeeklyScheduleImportRow[]>([])
  const [previewMeta, setPreviewMeta] = useState<{ rows: number; skippedRows: number } | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const previewVisibleRows = useMemo(() => previewRows.slice(0, 6), [previewRows])

  async function handleFilePreview(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null

    setPreviewError(null)
    setPreviewRows([])
    setPreviewMeta(null)
    setFileName(file?.name ?? null)

    if (!file) {
      return
    }

    try {
      const { parseAssignmentWeeklyScheduleWorkbook } = await import('../lib/assignmentWeeklyScheduleImport')
      const buffer = new Uint8Array(await file.arrayBuffer())
      const parsed = parseAssignmentWeeklyScheduleWorkbook(buffer)
      setPreviewRows(parsed.rows)
      setPreviewMeta({ rows: parsed.rows.length, skippedRows: parsed.skippedRows })
    } catch (error) {
      setPreviewError(
        error instanceof Error
          ? error.message
          : 'No fue posible leer el archivo semanal de horarios.'
      )
    }
  }

  return (
    <Card className="border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Subir horarios semanales San Pablo</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Esta carga semanal escribe horarios por fecha especifica en `horario_pdv` para los PDVs de San Pablo. Se usa cuando la cadena cambia turnos por semana y la operacion necesita resolverlos desde asignaciones.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/api/asignaciones/horarios-template"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Descargar plantilla semanal
          </Link>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-violet-700">
            San Pablo
          </span>
        </div>
      </div>

      <form action={formAction} className="mt-6 space-y-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <label className="block text-sm text-slate-700">
              <span className="font-medium text-slate-900">Archivo Excel</span>
              <input
                name="horarios_san_pablo_file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFilePreview}
                className="mt-2 block w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
              />
            </label>

            <div className="rounded-[18px] border border-violet-100 bg-violet-50 p-4 text-sm leading-6 text-violet-900">
              <p className="font-medium">Columnas esperadas</p>
              <p className="mt-2">
                Usa la plantilla oficial semanal con `SEMANA_INICIO`, `BTL CVE`, `DIA`, `CODIGO_TURNO`, `HORA_ENTRADA`, `HORA_SALIDA` y `OBSERVACIONES`. Si mandas `CODIGO_TURNO`, el sistema puede resolver horas desde el catalogo de turnos San Pablo. Si una fila ya tiene horario especifico para esa semana, se reemplaza.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Importar horarios semanales
              </button>
              {state.message && (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    state.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}
                >
                  {state.message}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Vista previa</p>
                <p className="mt-1 text-sm text-slate-500">
                  {fileName ? `Archivo: ${fileName}` : 'Selecciona un XLSX para validar la semana antes de importar.'}
                </p>
              </div>
              {previewMeta && (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                  {previewMeta.rows} fila(s) validas · {previewMeta.skippedRows} omitida(s)
                </span>
              )}
            </div>

            {previewError ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {previewError}
              </div>
            ) : previewVisibleRows.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                Aun no hay filas para previsualizar.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {previewVisibleRows.map((row) => (
                  <div key={`${row.rowNumber}-${row.claveBtl}-${row.fechaEspecifica}`} className="rounded-2xl border border-white bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-950">{row.claveBtl}</p>
                      <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-violet-700">
                        {row.diaLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">Semana {row.semanaInicio} · Fecha {row.fechaEspecifica}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Turno: {row.codigoTurno ?? 'sin codigo'} · Horario: {row.horaEntrada ?? 'por catalogo'}-{row.horaSalida ?? 'por catalogo'}
                    </p>
                  </div>
                ))}

                {previewRows.length > previewVisibleRows.length && (
                  <p className="text-xs text-slate-500">
                    Se muestran {previewVisibleRows.length} de {previewRows.length} filas validas.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </form>
    </Card>
  )
}
function NuevaAsignacionCard({ data }: { data: AsignacionesPanelData }) {
  const [state, formAction] = useActionState(
    guardarAsignacionPlanificada,
    ESTADO_ASIGNACION_INICIAL
  )

  return (
    <Card className="border-slate-200 bg-white">
      <h2 className="text-lg font-semibold text-slate-950">Nueva asignacion</h2>
      <p className="mt-1 text-sm text-slate-500">
        Alta de movimientos derivados sobre la base general, con validacion previa, auditoria y salida inicial en BORRADOR.
      </p>

      <form action={formAction} className="mt-6 space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Select
            label="Empleado"
            name="empleado_id"
            defaultValue=""
            options={[
              { value: '', label: 'Selecciona un dermoconsejero' },
              ...data.empleadosDisponibles.map((item) => ({
                value: item.id,
                label: `${item.nombre}${item.zona ? ` - ${item.zona}` : ''}`,
              })),
            ]}
          />
          <Select
            label="PDV"
            name="pdv_id"
            defaultValue=""
            options={[
              { value: '', label: 'Selecciona un PDV activo' },
              ...data.pdvsDisponibles.map((item) => ({
                value: item.id,
                label: `${item.claveBtl} - ${item.nombre}`,
              })),
            ]}
          />
          <Select
            label="Tipo"
            name="tipo"
            defaultValue="FIJA"
            options={[
              { value: 'FIJA', label: 'Fija' },
              { value: 'ROTATIVA', label: 'Rotativa' },
              { value: 'COBERTURA', label: 'Cobertura' },
            ]}
          />
          <Select
            label="Naturaleza del movimiento"
            name="naturaleza"
            defaultValue="COBERTURA_TEMPORAL"
            options={[
              { value: 'COBERTURA_TEMPORAL', label: 'Cobertura temporal' },
              { value: 'COBERTURA_PERMANENTE', label: 'Cobertura permanente' },
            ]}
          />

          <Select
            label="Horario"
            name="horario_referencia"
            defaultValue=""
            options={[
              { value: '', label: 'Sin referencia explicita' },
              ...data.turnosDisponibles,
            ]}
          />
          <Input label="Fecha inicio" name="fecha_inicio" type="date" required />
          <Input label="Fecha fin" name="fecha_fin" type="date" />

          <Select
            label="Dia descanso"
            name="dia_descanso"
            defaultValue=""
            options={[
              { value: '', label: 'Sin captura' },
              ...DIA_LABORAL_CODES.map((item) => ({ value: item, label: item })),
            ]}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <span className="flex items-center gap-3">
              <input type="checkbox" name="retorna_a_base" value="true" className="rounded border-slate-300" />
              Retorno automatico a la base al vencer el movimiento
            </span>
            <span className="mt-2 block text-xs text-slate-500">
              Usalo solo para movimientos temporales. Si la vigencia termina, el motor intentara regresar a la DC a su base anterior.
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-900">Motivo del movimiento</span>
            <textarea
              name="motivo_movimiento"
              rows={4}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              placeholder="Cobertura, apoyo temporal, cambio operativo, regreso a base, etc."
            />
          </label>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-900">Dias laborales</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {DIA_LABORAL_CODES.map((dia) => (
              <label key={dia} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input type="checkbox" name="dias_laborales" value={dia} className="rounded border-slate-300" />
                {dia}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900" htmlFor="asignacion-observaciones">
            Observaciones
          </label>
          <textarea
            id="asignacion-observaciones"
            name="observaciones"
            rows={3}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 focus:border-slate-950 focus:outline-none"
            placeholder="Notas operativas, coberturas o restricciones del punto."
          />
        </div>

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Guardar en borrador
        </button>

        {state.message && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${state.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
            <p>{state.message}</p>
            {state.issues.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {state.issues.map((issue) => (
                  <span key={issue.code} className={`rounded-full px-3 py-1 text-xs font-medium ${issueTone(issue.severity)}`}>
                    {issue.severity}: {issue.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </form>
    </Card>
  )
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
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
