'use client'

import Link from 'next/link'
import { useActionState, useEffect, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { resolveKpiSemantic, withAlpha } from '@/components/ui/kpi-semantics'
import { ModalPanel } from '@/components/ui/modal-panel'
import { PremiumLineIcon } from '@/components/ui/premium-icons'
import { Select } from '@/components/ui/select'
import {
  guardarAsignacionPlanificada,
  guardarDescansoPermanenteAsignacion,
  importarCatalogoMaestroAsignaciones,
  importarHorariosSanPabloSemanales,
  importarRotacionMaestraPdvs,
  publicarCatalogoMaestroAsignaciones,
  publicarOperacionMensualAsignaciones,
} from '../actions'
import { WEEKDAY_MONTHLY_RULES } from '../lib/assignmentRestOverride'
import { DIA_LABORAL_CODES } from '../lib/assignmentPlanning'
import type { AssignmentIssue } from '../lib/assignmentValidation'
import {
  ESTADO_ASIGNACION_INICIAL,
  ESTADO_DESCANSO_PERMANENTE_INICIAL,
  ESTADO_IMPORTACION_ASIGNACIONES_INICIAL,
  ESTADO_PUBLICACION_CATALOGO_ASIGNACIONES_INICIAL,
  type AssignmentImportConflict,
  type AssignmentImportPreviewRow,
} from '../state'
import { ESTADO_IMPORTACION_ROTACION_MAESTRA_INICIAL } from '../rotationState'
import type {
  AssignmentPdvPanel,
  AsignacionesPanelData,
} from '../services/asignacionService'
import { AsignacionBulkDraftCleanupButton } from './AsignacionBulkDraftCleanupButton'
import { AsignacionDraftCleanupButton } from './AsignacionDraftCleanupButton'
import { AsignacionEstadoControls } from './AsignacionEstadoControls'
import { VacantesFuturasBoard } from './VacantesFuturasBoard'

function issueTone(severity: AssignmentIssue['severity']) {
  if (severity === 'ERROR') return 'bg-rose-100 text-rose-700'
  if (severity === 'ALERTA') return 'bg-amber-100 text-amber-700'
  return 'bg-sky-100 text-sky-700'
}

function formatNature(value: string) {
  if (value === 'COBERTURA_PERMANENTE') return 'Cobertura permanente'
  if (value === 'COBERTURA_TEMPORAL' || value === 'MOVIMIENTO') return 'Cobertura temporal'
  return 'Base'
}

function formatDate(value: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(`${value}T12:00:00Z`))
}

function countDatesInMonth(dates: string[], month: string) {
  return dates.filter((date) => date.startsWith(`${month}-`)).length
}

function formatDatesPreview(dates: string[]) {
  if (dates.length === 0) {
    return 'Sin fechas'
  }

  return dates.map((date) => formatDate(date)).join(', ')
}

function formatOverrideMode(value: 'EXPLICITO' | 'REGLA_MENSUAL') {
  return value === 'REGLA_MENSUAL' ? 'Regla mensual' : 'Fechas explicitas'
}

function formatConflictContext(conflict: AssignmentImportConflict) {
  const parts = [
    conflict.rowNumber !== null ? `Fila ${conflict.rowNumber}` : 'Fila no identificada',
    conflict.claveBtl ? `BTL ${conflict.claveBtl}` : null,
    conflict.referenciaDc ? conflict.referenciaDc : null,
    conflict.tipo ? conflict.tipo : null,
  ].filter((part): part is string => Boolean(part))

  return parts.join(' · ')
}

function formatPreviewAction(value: AssignmentImportPreviewRow['accion']) {
  return value === 'ACTUALIZADA' ? 'Actualiza borrador' : 'Nuevo borrador'
}

type ConflictSeverityFilter = 'ERROR' | 'ALERTA' | 'AVISO'

function getConflictSeverityLabel(severity: ConflictSeverityFilter) {
  if (severity === 'ERROR') return 'Bloqueantes'
  if (severity === 'ALERTA') return 'Alertas'
  return 'Avisos'
}

function getConflictSeverityCount(conflicts: AssignmentImportConflict[], severity: ConflictSeverityFilter) {
  return conflicts.filter((item) => item.severity === severity).length
}

function getConflictSeverityButtonClass(active: boolean, severity: ConflictSeverityFilter) {
  if (severity === 'ERROR') {
    return active
      ? 'border-rose-600 bg-rose-600 text-white shadow-[0_10px_24px_rgba(225,29,72,0.22)]'
      : 'border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50'
  }

  if (severity === 'ALERTA') {
    return active
      ? 'border-amber-500 bg-amber-500 text-white shadow-[0_10px_24px_rgba(245,158,11,0.22)]'
      : 'border-amber-200 bg-white text-amber-700 hover:border-amber-300 hover:bg-amber-50'
  }

  return active
    ? 'border-sky-600 bg-sky-600 text-white shadow-[0_10px_24px_rgba(2,132,199,0.22)]'
    : 'border-sky-200 bg-white text-sky-700 hover:border-sky-300 hover:bg-sky-50'
}

function getInitialConflictSeverity(conflicts: AssignmentImportConflict[]): ConflictSeverityFilter {
  if (conflicts.some((item) => item.severity === 'ERROR')) return 'ERROR'
  if (conflicts.some((item) => item.severity === 'ALERTA')) return 'ALERTA'
  return 'AVISO'
}

function filterConflictsBySeverity(
  conflicts: AssignmentImportConflict[],
  severity: ConflictSeverityFilter
) {
  return conflicts.filter((item) => item.severity === severity)
}

function DraftPreviewCard({
  rows,
}: {
  rows: AssignmentImportPreviewRow[]
}) {
  if (rows.length === 0) {
    return null
  }

  return (
    <div className="rounded-[20px] border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">Borrador propuesto</p>
          <p className="mt-1 text-xs font-medium text-sky-700">
            {rows.length} asignaciones listas para revisar antes de publicar
          </p>
        </div>
      </div>
      <div className="mt-3 max-h-[28rem] overflow-auto rounded-[16px] border border-sky-200 bg-white">
        <table className="min-w-full border-separate border-spacing-0 text-left text-[11px]">
          <thead className="sticky top-0 z-10 bg-sky-50 text-sky-900">
            <tr>
              <th className="border-b border-sky-200 px-3 py-2 font-semibold uppercase tracking-[0.12em]">Estado</th>
              <th className="border-b border-sky-200 px-3 py-2 font-semibold uppercase tracking-[0.12em]">BTL CVE</th>
              <th className="border-b border-sky-200 px-3 py-2 font-semibold uppercase tracking-[0.12em]">USUARIO</th>
              <th className="border-b border-sky-200 px-3 py-2 font-semibold uppercase tracking-[0.12em]">IDNOM</th>
              <th className="border-b border-sky-200 px-3 py-2 font-semibold uppercase tracking-[0.12em]">NOMBRE DC</th>
              <th className="border-b border-sky-200 px-3 py-2 font-semibold uppercase tracking-[0.12em]">HORARIO</th>
              <th className="border-b border-sky-200 px-3 py-2 font-semibold uppercase tracking-[0.12em]">DÍAS laborales</th>
              <th className="border-b border-sky-200 px-3 py-2 font-semibold uppercase tracking-[0.12em]">DESCANSO</th>
              <th className="border-b border-sky-200 px-3 py-2 font-semibold uppercase tracking-[0.12em]">fecha de inicio</th>
              <th className="border-b border-sky-200 px-3 py-2 font-semibold uppercase tracking-[0.12em]">Origen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.rowNumber}-${row.claveBtl}-${row.accion}`} className="align-top odd:bg-slate-50/60">
                <td className="border-b border-slate-100 px-3 py-2">
                  <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    {row.estadoPublicacion}
                  </span>
                  <span className="mt-1 block text-[11px] font-medium text-slate-500">{formatPreviewAction(row.accion)}</span>
                </td>
                <td className="border-b border-slate-100 px-3 py-2 font-medium text-slate-900">{row.claveBtl}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{row.username ?? 'Sin usuario'}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{row.idNomina ?? 'Sin ID'}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{row.nombreDc ?? 'Sin nombre'}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{row.horarioReferencia ?? 'Sin horario'}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{row.diasLaborales ?? 'Sin dias'}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{row.diaDescanso ?? 'Sin descanso'}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{formatDate(row.fechaInicio)}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-slate-500">Borrador</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ConflictsPreviewCard({
  title,
  conflicts,
}: {
  title: string
  conflicts: AssignmentImportConflict[]
}) {
  if (conflicts.length === 0) {
    return null
  }

  const [selectedSeverity, setSelectedSeverity] = useState<ConflictSeverityFilter>(() =>
    getInitialConflictSeverity(conflicts)
  )

  useEffect(() => {
    setSelectedSeverity(getInitialConflictSeverity(conflicts))
  }, [conflicts])

  const errorCount = getConflictSeverityCount(conflicts, 'ERROR')
  const alertCount = getConflictSeverityCount(conflicts, 'ALERTA')
  const noticeCount = getConflictSeverityCount(conflicts, 'AVISO')
  const visibleConflicts = filterConflictsBySeverity(conflicts, selectedSeverity)

  return (
    <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-[0_12px_30px_rgba(251,113,133,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-xs font-medium text-rose-700">
            {conflicts.length} incidencias detectadas · {errorCount} bloqueante(s) · {alertCount} alerta(s) · {noticeCount} aviso(s)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ['ERROR', errorCount],
            ['ALERTA', alertCount],
            ['AVISO', noticeCount],
          ] as const).map(([severity, count]) => {
            const active = selectedSeverity === severity

            return (
              <button
                key={severity}
                type="button"
                onClick={() => setSelectedSeverity(severity)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition ${getConflictSeverityButtonClass(active, severity)}`}
              >
                <span>{getConflictSeverityLabel(severity)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${active ? 'bg-white/18 text-current' : 'bg-current/10 text-current'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-[18px] border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700">
        <span>Mostrando {visibleConflicts.length} de {conflicts.length} incidencia(s)</span>
        <span>{getConflictSeverityLabel(selectedSeverity)}</span>
      </div>
      <div className="mt-3 max-h-[34rem] space-y-2 overflow-y-auto pr-1">
        {visibleConflicts.length === 0 ? (
          <div className="rounded-[16px] border border-rose-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
            No hay incidencias en este grupo. Cambia de boton para revisar otra categoria.
          </div>
        ) : null}
        {visibleConflicts.map((conflict, index) => (
          <div
            key={`${conflict.rowNumber ?? 'null'}-${conflict.code}-${index}`}
            className="rounded-[16px] border border-rose-200 bg-white px-3 py-3 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${issueTone(conflict.severity)}`}>
                {conflict.severity === 'ERROR' ? 'Error' : conflict.severity === 'ALERTA' ? 'Alerta' : 'Aviso'}
              </span>
              <span className="text-xs font-medium text-slate-500">Fuente: {conflict.source}</span>
            </div>
            <p className="mt-2 font-medium text-rose-950">{conflict.label}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">{formatConflictContext(conflict)}</p>
            <p className="mt-1 text-xs leading-5 text-rose-700">{conflict.message}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatMonthLabel(month: string) {
  const [yearRaw, monthRaw] = month.split('-')
  const value = new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1, 1))
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(value)
}

function shiftMonth(month: string, offset: number) {
  const [yearRaw, monthRaw] = month.split('-')
  const value = new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1 + offset, 1))
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit' }).format(value)
}

function getCurrentMonthValue() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

function getCurrentMxDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function getWeekdayLetter(dateIso: string) {
  const weekday = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    weekday: 'short',
  }).format(new Date(`${dateIso}T12:00:00Z`))

  if (weekday.startsWith('lun')) return 'L'
  if (weekday.startsWith('mar')) return 'M'
  if (weekday.startsWith('mi')) return 'X'
  if (weekday.startsWith('ju')) return 'J'
  if (weekday.startsWith('vie')) return 'V'
  if (weekday.startsWith('s')) return 'S'
  return 'D'
}

function getCalendarCode(estadoOperativo: string) {
  if (estadoOperativo === 'FORMACION') return 'FOR'
  if (estadoOperativo === 'VACACIONES') return 'VAC'
  if (estadoOperativo === 'INCAPACIDAD') return 'INC'
  if (estadoOperativo === 'FALTA_JUSTIFICADA') return 'JUS'
  if (estadoOperativo === 'ASIGNADA_PDV') return 'PDV'
  return 'SIN'
}

function getCalendarTone(estadoOperativo: string) {
  if (estadoOperativo === 'FORMACION') return 'bg-cyan-100 text-cyan-800'
  if (estadoOperativo === 'VACACIONES') return 'bg-amber-100 text-amber-800'
  if (estadoOperativo === 'INCAPACIDAD') return 'bg-rose-100 text-rose-800'
  if (estadoOperativo === 'FALTA_JUSTIFICADA') return 'bg-emerald-100 text-emerald-800'
  if (estadoOperativo === 'ASIGNADA_PDV') return 'bg-slate-100 text-slate-800'
  return 'bg-slate-50 text-slate-500'
}

function buildHref(
  pathname: string,
  searchParams: { toString(): string },
  overrides: Record<string, string | null | undefined>
) {
  const params = new URLSearchParams(searchParams.toString())

  for (const [key, value] of Object.entries(overrides)) {
    if (!value) {
      params.delete(key)
      continue
    }

    params.set(key, value)
  }

  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

function MetricCard({
  label,
  value,
  accentClass,
}: {
  label: string
  value: string
  accentClass: string
}) {
  const semantic = resolveKpiSemantic(label)
  const indicatorStyle = {
    borderColor: withAlpha(semantic.color, 0.24),
    backgroundColor: withAlpha(semantic.color, 0.1),
    color: semantic.color,
  }

  return (
    <Card className={`rounded-[24px] border p-5 shadow-[0_10px_26px_rgba(148,163,184,0.12)] ${accentClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-600">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
        </div>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border shadow-sm" style={indicatorStyle}>
          <PremiumLineIcon
            name={semantic.icon}
            className="h-[18px] w-[18px]"
            stroke={semantic.color}
            strokeWidth={1.95}
            variant={semantic.variant}
          />
        </span>
      </div>
    </Card>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  )
}

function SectionShell({
  id,
  title,
  description,
  actions,
  children,
}: {
  id?: string
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <Card className="rounded-[28px] border border-slate-200 p-6 shadow-[0_18px_40px_rgba(148,163,184,0.12)]">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-3">{actions}</div> : null}
        </div>
        <div className="mt-5">{children}</div>
      </Card>
    </section>
  )
}

export type AsignacionesPanelSurface = 'asignaciones' | 'pdvs'

export function AsignacionesPanel({
  data,
  puedeGestionar,
  surface = 'asignaciones',
}: {
  data: AsignacionesPanelData
  puedeGestionar: boolean
  surface?: AsignacionesPanelSurface
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const hrefBuilder = (overrides: Record<string, string | null | undefined>) =>
    buildHref(pathname, searchParams, overrides)

  if (surface === 'pdvs') {
    return (
      <div className="space-y-6">
        {!data.infraestructuraLista ? (
          <Card className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            <p className="font-semibold">Infraestructura parcial</p>
            <p className="mt-1">{data.mensajeInfraestructura ?? 'Faltan tablas o relaciones para mostrar toda la experiencia de asignaciones.'}</p>
          </Card>
        ) : null}
        <PdvsSection data={data} pathname={pathname} hrefBuilder={hrefBuilder} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista ? (
        <Card className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="font-semibold">Infraestructura parcial</p>
          <p className="mt-1">{data.mensajeInfraestructura ?? 'Faltan tablas o relaciones para mostrar toda la experiencia de asignaciones.'}</p>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total visibles" value={String(data.shell.total)} accentClass="bg-white" />
        <MetricCard label="Borrador" value={String(data.shell.borrador)} accentClass="bg-amber-50/80" />
        <MetricCard label="Publicada" value={String(data.shell.publicada)} accentClass="bg-emerald-50/80" />
        <MetricCard label="Activas" value={String(data.shell.activas)} accentClass="bg-sky-50/80" />
      </section>

      <AssignmentsSection data={data} puedeGestionar={puedeGestionar} hrefBuilder={hrefBuilder} />

      <AssignmentsModalLayer data={data} hrefBuilder={hrefBuilder} onClose={() => router.push(hrefBuilder({ modal: null }))} />
    </div>
  )
}

function AssignmentsSection({
  data,
  puedeGestionar,
  hrefBuilder,
}: {
  data: AsignacionesPanelData
  puedeGestionar: boolean
  hrefBuilder: (overrides: Record<string, string | null | undefined>) => string
}) {
  const view = data.assignmentsView

  if (!view) {
    return <EmptyState title="Sin vista de asignaciones" description="Abre esta seccion desde la pestana de Asignaciones." />
  }

  const tabs = [
    { id: 'BORRADOR', label: 'Borrador', count: data.shell.borrador },
    { id: 'PUBLICADA', label: 'Publicada', count: data.shell.publicada },
    { id: 'ACTIVAS', label: 'Activas', count: data.shell.activas },
  ] as const

  return (
    <SectionShell
      id="asignaciones"
      title="Asignaciones"
      description="Gestiona el catalogo maestro, nuevas asignaciones y descansos permanentes sin mezclar otras superficies operativas."
      actions={
        <>
          <Link href={hrefBuilder({ modal: 'catalogo' })} className="inline-flex min-h-11 items-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
            Cargar catalogo maestro
          </Link>
          <Link href={hrefBuilder({ modal: 'manual' })} className="inline-flex min-h-11 items-center rounded-[16px] bg-[var(--module-primary)] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_var(--module-shadow)] transition hover:bg-[var(--module-hover)]">
            Nueva asignacion
          </Link>
          <Link href={hrefBuilder({ modal: 'descansos' })} className="inline-flex min-h-11 items-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
            Descansos permanentes
          </Link>
          <Link href="/asignaciones/vacantes-futuras" className="inline-flex min-h-11 items-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
            Vacantes futuras
          </Link>
        </>
      }
    >
      <div className="mt-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Borrador y publicación</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          El borrador completo se mantiene visible arriba para revisar issues, limpiar masivo o publicar el lote completo cuando ya este correcto.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {tabs.map((tab) => {
          const active = view.estado === tab.id
          return (
            <Link
              key={tab.id}
              href={hrefBuilder({ estado: tab.id, page: null, modal: null })}
              className={
                active
                  ? 'inline-flex min-h-11 items-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white'
                  : 'inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950'
              }
            >
              {tab.label} ({tab.count})
            </Link>
          )
        })}
      </div>

      <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Mostrando {view.items.length} registro(s) de {view.total} en la pagina {view.page}.
      </div>

      {view.items.length === 0 ? (
        <div className="mt-5">
          <EmptyState title="Sin asignaciones en esta vista" description="Cambia de estado o crea nuevas asignaciones desde el modal de alta." />
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-[24px] border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-4 py-3">DC</th>
                <th className="px-4 py-3">PDV</th>
                <th className="px-4 py-3">Naturaleza</th>
                <th className="px-4 py-3">Vigencia</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Issues</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {view.items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-950">{item.empleado ?? 'Sin dermoconsejera'}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.cuentaCliente ?? 'Sin cuenta'} · {item.zona ?? 'Sin zona'}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-950">{item.pdv ?? 'Sin PDV'}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.pdvClaveBtl ?? 'Sin clave'} · {item.cadena ?? 'Sin cadena'}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-slate-900">{formatNature(item.naturaleza)}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.tipo} · prioridad {item.prioridad}</p>
                    {item.retornaABase ? <p className="mt-1 text-xs text-slate-500">Retorna a base</p> : null}
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    <p>{formatDate(item.fechaInicio)}</p>
                    <p className="mt-1 text-xs text-slate-500">a {formatDate(item.fechaFin)}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.horario ?? 'Sin horario'} · {item.diasLaborales ?? 'Sin dias'}</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${item.estadoPublicacion === 'PUBLICADA' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {item.estadoPublicacion}
                    </span>
                    {item.motivoMovimiento ? <p className="mt-2 text-xs text-slate-500">{item.motivoMovimiento}</p> : null}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex max-w-sm flex-wrap gap-2">
                      {item.issues.length === 0 ? <span className="text-xs text-slate-400">Sin issues</span> : null}
                      {item.issues.map((issue) => (
                        <span key={`${item.id}-${issue.code}`} className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${issueTone(issue.severity)}`}>
                          {issue.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-3">
                      <AsignacionEstadoControls
                        asignacionId={item.id}
                        estadoPublicacion={item.estadoPublicacion}
                        bloqueada={item.bloqueada}
                        puedeGestionar={puedeGestionar}
                        alertasCount={item.alertasCount}
                        requiereConfirmacionAlertas={item.requiereConfirmacionAlertas}
                      />
                      {item.estadoPublicacion === 'BORRADOR' ? (
                        <AsignacionDraftCleanupButton asignacionId={item.id} puedeGestionar={puedeGestionar} compact />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3 text-sm text-slate-500">
        <span>Pagina {view.page}</span>
        <div className="flex gap-3">
          <Link
            href={hrefBuilder({ estado: view.estado, page: String(Math.max(1, view.page - 1)), modal: null })}
            className={`inline-flex min-h-10 items-center rounded-[14px] border px-4 font-medium ${view.page <= 1 ? 'pointer-events-none border-slate-100 text-slate-300' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            Anterior
          </Link>
          <Link
            href={hrefBuilder({ estado: view.estado, page: String(view.page + 1), modal: null })}
            className={`inline-flex min-h-10 items-center rounded-[14px] border px-4 font-medium ${view.page * view.pageSize >= view.total ? 'pointer-events-none border-slate-100 text-slate-300' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            Siguiente
          </Link>
        </div>
      </div>
    </SectionShell>
  )
}

function FutureVacanciesSection({
  data,
  hrefBuilder,
  selectedVacancyId,
  hubMode = false,
}: {
  data: AsignacionesPanelData
  hrefBuilder: (overrides: Record<string, string | null | undefined>) => string
  selectedVacancyId?: string | null
  hubMode?: boolean
}) {
  return (
    <SectionShell
      id="vacantes-futuras"
      title="Vacantes futuras"
      description="Centraliza las bajas con impacto en PDVs actuales o movimientos cancelados para reasignar con contexto y sin recalcular agendas ad hoc."
    >
      <VacantesFuturasBoard
        data={data.futureVacanciesView}
        selectedVacancyId={selectedVacancyId}
        detailHrefBuilder={(item) =>
          hrefBuilder({
            vista: hubMode ? 'asignaciones' : 'vacantes-futuras',
            vacante_id: item.id,
            modal: null,
          })
        }
        reassignmentHrefBuilder={(item) =>
          hrefBuilder({
            vista: 'asignaciones',
            modal: 'manual',
            prefill_pdv_id: item.pdvId,
            prefill_fecha_inicio: item.fechaVacanteDesde,
            prefill_tipo: 'COBERTURA',
            prefill_naturaleza: 'COBERTURA_TEMPORAL',
            prefill_motivo: `Cobertura ${item.tipoVacante === 'VACANTE_ACTUAL_POR_BAJA' ? 'inmediata' : 'futura'} por baja de ${item.empleadoOrigenNombre ?? 'empleado'}`,
            prefill_observaciones: `Vacante vinculada a baja ${item.fechaBajaEfectiva}. PDV ${item.pdvClaveBtl ?? item.pdvId}.`,
            vacante_id: item.id,
          })
        }
      />
    </SectionShell>
  )
}

function PdvRotationToolsContent() {
  const [rotationState, rotationAction] = useActionState(
    importarRotacionMaestraPdvs,
    ESTADO_IMPORTACION_ROTACION_MAESTRA_INICIAL
  )
  const router = useRouter()

  useEffect(() => {
    if (rotationState.ok) {
      router.refresh()
    }
  }, [router, rotationState.ok])

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="rounded-[24px] border border-slate-200 p-5">
        <h3 className="text-lg font-semibold text-slate-950">Importar rotación maestra</h3>
        <p className="mt-2 text-sm text-slate-500">
          Define la topología FIJO / ROTATIVO como reemplazo total de la cuenta activa, sin inferirla en tiempo real.
        </p>
        <form action={rotationAction} className="mt-4 space-y-4">
          <Input name="rotacion_maestra_file" type="file" accept=".xlsx" label="Archivo XLSX" />
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton label="Importar rotación" pendingLabel="Importando..." />
            <a href="/api/asignaciones/rotacion-template" className="text-sm font-semibold text-sky-700 hover:text-sky-900">
              Descargar plantilla
            </a>
            <a href="/api/asignaciones/rotacion-propuesta" className="text-sm font-semibold text-violet-700 hover:text-violet-900">
              Descargar propuesta
            </a>
          </div>
          <ActionFeedback ok={rotationState.ok} message={rotationState.message} />
          {rotationState.summary ? (
            <div className="grid gap-3 rounded-[20px] bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-2">
              <p>
                Filas parseadas: <span className="font-semibold text-slate-900">{rotationState.summary.parsedRows}</span>
              </p>
              <p>
                Fijos: <span className="font-semibold text-slate-900">{rotationState.summary.fijos}</span>
              </p>
              <p>
                Rotativos: <span className="font-semibold text-slate-900">{rotationState.summary.rotativos}</span>
              </p>
              <p>
                Grupos incompletos: <span className="font-semibold text-slate-900">{rotationState.summary.incompleteGroups}</span>
              </p>
              <p>
                PDVs faltantes: <span className="font-semibold text-slate-900">{rotationState.summary.missingOperablePdvs}</span>
              </p>
              <p>
                Conflictos: <span className="font-semibold text-slate-900">{rotationState.summary.conflictCount}</span>
              </p>
            </div>
          ) : null}
          {rotationState.conflicts.length > 0 ? (
            <div className="rounded-[20px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <p className="font-semibold">Conflictos detectados</p>
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {rotationState.conflicts.slice(0, 12).map((conflict, index) => (
                  <div
                    key={`${String(conflict.rowNumber)}-${conflict.code}-${index}`}
                    className="rounded-[16px] border border-rose-200 bg-white px-3 py-2"
                  >
                    <p className="font-medium text-rose-900">
                      {conflict.label}
                      {conflict.claveBtl ? ` · ${conflict.claveBtl}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-rose-700">{conflict.message}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </form>
      </Card>

      <Card className="rounded-[24px] border border-slate-200 p-5">
        <h3 className="text-lg font-semibold text-slate-950">Convertir archivo legacy</h3>
        <p className="mt-2 text-sm text-slate-500">
          Usa archivos operativos como <span className="font-semibold text-slate-700">PDV ROTATIVOS Y FIJOS.xlsx</span> para descargar el XLSX oficial de rotación maestra antes de importarlo.
        </p>
        <form
          action="/api/asignaciones/rotacion-legacy-convert"
          method="post"
          encType="multipart/form-data"
          target="_blank"
          className="mt-4 space-y-4"
        >
          <Input name="legacy_rotacion_file" type="file" accept=".xlsx" label="Archivo legacy XLSX" />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit">Convertir y descargar</Button>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            La conversión aplica las parejas manuales aprobadas para los PDVs rotativos `POR CUBRIR` y valida el resultado contra el contrato oficial antes de descargar.
          </p>
        </form>
      </Card>
    </div>
  )
}

function PdvsSection({
  data,
  pathname,
  hrefBuilder,
  hubMode = false,
}: {
  data: AsignacionesPanelData
  pathname: string
  hrefBuilder: (overrides: Record<string, string | null | undefined>) => string
  hubMode?: boolean
}) {
  const view = data.pdvsView

  if (!view) {
    return <EmptyState title="Sin cobertura de PDVs" description="Abre esta seccion desde la pestana de PDVs." />
  }

  const panelTabs: Array<{ id: AssignmentPdvPanel; label: string }> = [
    { id: 'COBERTURA', label: 'Cobertura' },
    { id: 'ROTACION', label: 'Rotacion maestra' },
  ]

  const clearHref =
    view.panel === 'COBERTURA'
      ? hrefBuilder({
          vista: hubMode ? 'asignaciones' : 'pdvs',
          pdv_panel: 'COBERTURA',
          pdv_estado: null,
          cadena: null,
          ciudad: null,
          zona: null,
          rotacion_clasificacion: null,
          grupo_rotacion: null,
        })
      : hrefBuilder({
          vista: hubMode ? 'asignaciones' : 'pdvs',
          pdv_panel: 'ROTACION',
          pdv_estado: null,
          cadena: null,
          ciudad: null,
          zona: null,
          rotacion_clasificacion: null,
          grupo_rotacion: null,
        })

  return (
    <SectionShell
      id="pdvs"
      title="PDVs"
      description="La cobertura, la rotación maestra y sus importaciones viven en una sección independiente para que no se mezclen con el catálogo de asignaciones."
    >
      <PdvRotationToolsContent />

      <div className="flex flex-wrap gap-3">
        {panelTabs.map((tab) => {
          const active = view.panel === tab.id

          return (
            <Link
              key={tab.id}
              href={hrefBuilder({
                vista: hubMode ? 'asignaciones' : 'pdvs',
                pdv_panel: tab.id,
                pdv_estado: null,
                rotacion_clasificacion: null,
                grupo_rotacion: null,
              })}
              className={
                active
                  ? 'inline-flex min-h-11 items-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white'
                  : 'inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950'
              }
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      <form action={pathname} method="get" className="mt-5 grid gap-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-6">
        <input type="hidden" name="vista" value={hubMode ? 'asignaciones' : 'pdvs'} />
        <input type="hidden" name="pdv_panel" value={view.panel} />

        {view.panel === 'COBERTURA' ? (
          <>
            <Select
              name="pdv_estado"
              label="Estado PDV"
              defaultValue={view.estado}
              options={[
                { value: 'ALL', label: 'Todos' },
                { value: 'ASIGNADOS', label: 'Asignados' },
                { value: 'RESERVADOS', label: 'Reservados' },
                { value: 'SIN_ASIGNACION', label: 'Sin asignacion' },
                { value: 'INACTIVOS', label: 'Inactivos' },
              ]}
            />
            <Select
              name="cadena"
              label="Cadena"
              defaultValue={view.cadena}
              options={[{ value: '', label: 'Todas' }, ...view.cadenasDisponibles.map((item) => ({ value: item, label: item }))]}
            />
            <Select
              name="ciudad"
              label="Ciudad"
              defaultValue={view.ciudad}
              options={[{ value: '', label: 'Todas' }, ...view.ciudadesDisponibles.map((item) => ({ value: item, label: item }))]}
            />
            <Select
              name="zona"
              label="Zona"
              defaultValue={view.zona}
              options={[{ value: '', label: 'Todas' }, ...view.zonasDisponibles.map((item) => ({ value: item, label: item }))]}
            />
          </>
        ) : (
          <>
            <Select
              name="rotacion_clasificacion"
              label="Rotacion maestra"
              defaultValue={view.rotacionClasificacion}
              options={[
                { value: 'ALL', label: 'Todas' },
                { value: 'FIJO', label: 'Fijos' },
                { value: 'ROTATIVO', label: 'Rotativos' },
                { value: 'PENDIENTE', label: 'Pendientes' },
                { value: 'INCOMPLETO', label: 'Grupos incompletos' },
              ]}
            />
            <Select
              name="cadena"
              label="Cadena"
              defaultValue={view.cadena}
              options={[{ value: '', label: 'Todas' }, ...view.cadenasDisponibles.map((item) => ({ value: item, label: item }))]}
            />
            <Select
              name="ciudad"
              label="Ciudad"
              defaultValue={view.ciudad}
              options={[{ value: '', label: 'Todas' }, ...view.ciudadesDisponibles.map((item) => ({ value: item, label: item }))]}
            />
            <Select
              name="zona"
              label="Zona"
              defaultValue={view.zona}
              options={[{ value: '', label: 'Todas' }, ...view.zonasDisponibles.map((item) => ({ value: item, label: item }))]}
            />
            <Input name="grupo_rotacion" label="Grupo" defaultValue={view.grupoRotacion} placeholder="ROT-ISDIN-001" />
          </>
        )}

        <div className="md:col-span-2 xl:col-span-6 flex flex-wrap items-end gap-3">
          <Button type="submit">Aplicar filtros</Button>
          <Link href={clearHref} className="inline-flex min-h-11 items-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            Limpiar
          </Link>
        </div>
      </form>

      {view.panel === 'COBERTURA' ? (
        <>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Asignados" value={String(view.summary?.pdvsCubiertos ?? 0)} accentClass="bg-emerald-50/80" />
            <MetricCard label="Reservados" value={String(view.summary?.pdvsReservados ?? 0)} accentClass="bg-amber-50/80" />
            <MetricCard label="Sin asignacion" value={String(view.summary?.pdvsVacantes ?? 0)} accentClass="bg-orange-50/80" />
            <MetricCard label="Inactivos" value={String(view.summary?.pdvsBloqueados ?? 0)} accentClass="bg-slate-100" />
          </div>

          {view.items.length === 0 ? (
            <div className="mt-5">
              <EmptyState title="Sin PDVs en esta combinacion" description="Cambia los filtros para revisar otra cobertura." />
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto rounded-[24px] border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">PDV</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">DC vinculada</th>
                    <th className="px-4 py-3">PDV de paso</th>
                    <th className="px-4 py-3">Espera</th>
                    <th className="px-4 py-3">Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {view.items.map((item) => (
                    <tr key={item.pdvId} className="align-top">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-950">{item.nombre}</p>
                        <p className="mt-1 text-xs text-slate-500">{[item.claveBtl ?? 'Sin clave', item.cadena ?? 'Sin cadena', item.ciudad ?? 'Sin ciudad'].join(' · ')}</p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <span className={
                            'inline-flex rounded-full px-3 py-1 text-xs font-semibold ' +
                            (item.semaforo === 'VERDE'
                              ? 'bg-emerald-100 text-emerald-700'
                              : item.semaforo === 'AMARILLO'
                                ? 'bg-amber-100 text-amber-700'
                                : item.semaforo === 'NARANJA'
                                  ? 'bg-orange-100 text-orange-700'
                                  : 'bg-slate-200 text-slate-700')
                          }>
                            {item.estadoOperativoLabel}
                          </span>
                          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{item.estadoMaestroLabel}</span>
                        </div>
                        {item.motivoOperativoLabel ? <p className="mt-2 text-xs text-slate-500">{item.motivoOperativoLabel}</p> : null}
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-900">{item.employeeName ?? item.candidateName ?? 'Sin vinculacion'}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.employeeSupervisorName ?? item.candidateWorkflowStage ?? 'Sin supervisor visible'}</p>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{item.pdvPasoNombre ?? 'No aplica'}</td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-900">{item.diasEsperandoAcceso != null ? item.diasEsperandoAcceso + ' dia(s)' : 'Sin espera'}</p>
                        {item.proximoRecordatorioAt ? <p className="mt-1 text-xs text-slate-500">Recordatorio {formatDate(item.proximoRecordatorioAt.slice(0, 10))}</p> : null}
                      </td>
                      <td className="px-4 py-4 text-slate-600">{item.responsableSugerido}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Fijos" value={String(view.rotacion?.summary.fijos ?? 0)} accentClass="bg-sky-50/80" />
            <MetricCard label="Rotativos" value={String(view.rotacion?.summary.rotativos ?? 0)} accentClass="bg-violet-50/80" />
            <MetricCard label="Pendientes" value={String(view.rotacion?.summary.pendientes ?? 0)} accentClass="bg-amber-50/80" />
            <MetricCard label="Grupos incompletos" value={String(view.rotacion?.summary.gruposIncompletos ?? 0)} accentClass="bg-rose-50/80" />
          </div>

          {view.rotacion && view.rotacion.groups.length > 0 ? (
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {view.rotacion.groups.map((group) => (
                <Card key={group.codigo} className="rounded-[24px] border border-slate-200 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">{group.codigo}</p>
                      <p className="mt-1 text-sm text-slate-600">Grupo de {group.tamano} PDVs</p>
                    </div>
                    <span className={
                      'inline-flex rounded-full px-3 py-1 text-xs font-semibold ' +
                      (group.completo ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')
                    }>
                      {group.completo ? 'Completo' : 'Incompleto'}
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {group.miembros.map((member) => (
                      <div key={member.pdvId} className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                        <p className="font-semibold text-slate-950">{(member.slotRotacion ?? '-') + ': ' + member.nombre}</p>
                        <p className="mt-1 text-xs text-slate-500">{[member.claveBtl, member.cadena ?? 'Sin cadena', member.ciudad ?? 'Sin ciudad'].filter(Boolean).join(' · ')}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState title="Sin grupos visibles" description="Importa o filtra una rotacion maestra para revisar parejas y trios de PDVs." />
            </div>
          )}

          {view.rotacion && view.rotacion.items.length > 0 ? (
            <div className="mt-5 overflow-x-auto rounded-[24px] border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">PDV</th>
                    <th className="px-4 py-3">Clasificacion</th>
                    <th className="px-4 py-3">Grupo</th>
                    <th className="px-4 py-3">Relacionados</th>
                    <th className="px-4 py-3">Referencia DC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {view.rotacion.items.map((item) => (
                    <tr key={item.pdvId} className="align-top">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-950">{item.nombre}</p>
                        <p className="mt-1 text-xs text-slate-500">{[item.claveBtl, item.cadena ?? 'Sin cadena', item.zona ?? 'Sin zona'].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <span className={
                            'inline-flex rounded-full px-3 py-1 text-xs font-semibold ' +
                            (item.pendienteRevision
                              ? 'bg-amber-100 text-amber-700'
                              : item.grupoIncompleto
                                ? 'bg-rose-100 text-rose-700'
                                : item.clasificacionMaestra === 'ROTATIVO'
                                  ? 'bg-violet-100 text-violet-700'
                                  : 'bg-sky-100 text-sky-700')
                          }>
                            {item.pendienteRevision ? 'Pendiente' : item.clasificacionMaestra ?? 'Sin clasificacion'}
                          </span>
                          {item.grupoIncompleto ? <span className="inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">Grupo incompleto</span> : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{item.grupoRotacionCodigo ? item.grupoRotacionCodigo + (item.slotRotacion ? ' · ' + item.slotRotacion : '') : 'Sin grupo'}</td>
                      <td className="px-4 py-4 text-slate-600">{item.relacionados.length > 0 ? item.relacionados.join(', ') : 'Sin relacionados'}</td>
                      <td className="px-4 py-4 text-slate-600">{item.referenciaDcActual ?? 'Sin referencia actual'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </SectionShell>
  )
}

function CalendarSection({
  data,
  pathname,
  hrefBuilder,
  hubMode = false,
}: {
  data: AsignacionesPanelData
  pathname: string
  hrefBuilder: (overrides: Record<string, string | null | undefined>) => string
  hubMode?: boolean
}) {
  const view = data.calendarView

  if (!view) {
    return <EmptyState title="Sin calendario mensual" description="Abre esta seccion desde la pestana de calendario." />
  }

  const month = view.filtros.month
  const calendario = view.calendarioMensual
  const totalEmpleados = calendario?.totalEmpleados ?? 0
  const dias = calendario?.dias ?? []

  return (
    <SectionShell
      id="calendario"
      title="Calendario mensual"
      description="Cargamos solo el mes visible y diferimos el resto de vistas para no sobrecargar la pantalla inicial."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Mes visible" value={formatMonthLabel(month)} accentClass="bg-white" />
        <MetricCard label="Dermoconsejeras" value={String(totalEmpleados)} accentClass="bg-sky-50/80" />
        <MetricCard label="Dias visibles" value={String(dias.length)} accentClass="bg-violet-50/80" />
      </div>

      <form action={pathname} method="get" className="mt-5 grid gap-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-4">
        <input type="hidden" name="vista" value={hubMode ? 'asignaciones' : 'calendario'} />
        <Input type="month" name="month" label="Mes" defaultValue={month} max={shiftMonth(getCurrentMonthValue(), 12)} />
        <Select
          name="supervisor_empleado_id"
          label="Supervisor"
          defaultValue={view.filtros.supervisorEmpleadoId ?? ''}
          disabled={view.supervisorBloqueado}
          options={[{ value: '', label: 'Todos' }, ...view.supervisores.map((item) => ({ value: item.id, label: item.nombre }))]}
        />
        <Select
          name="estado_operativo"
          label="Estado operativo"
          defaultValue={view.filtros.estadoOperativo ?? ''}
          options={[
            { value: '', label: 'Todos' },
            { value: 'ASIGNADA_PDV', label: 'Asignada a PDV' },
            { value: 'FORMACION', label: 'Formacion' },
            { value: 'VACACIONES', label: 'Vacaciones' },
            { value: 'INCAPACIDAD', label: 'Incapacidad' },
            { value: 'FALTA_JUSTIFICADA', label: 'Falta justificada' },
            { value: 'SIN_ASIGNACION', label: 'Sin asignacion' },
          ]}
        />
        <div className="flex items-end gap-3">
          <Button type="submit" className="flex-1">Aplicar</Button>
          <Link href={hrefBuilder({ vista: hubMode ? 'asignaciones' : 'calendario', month: null, supervisor_empleado_id: null, estado_operativo: null })} className="inline-flex min-h-11 items-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            Limpiar
          </Link>
        </div>
      </form>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link href={hrefBuilder({ vista: hubMode ? 'asignaciones' : 'calendario', month: shiftMonth(month, -1) })} className="inline-flex min-h-10 items-center rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
          Mes anterior
        </Link>
        <Link href={hrefBuilder({ vista: hubMode ? 'asignaciones' : 'calendario', month: shiftMonth(month, 1) })} className="inline-flex min-h-10 items-center rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
          Mes siguiente
        </Link>
      </div>

      {calendario && calendario.empleados.length > 0 ? (
        <div className="mt-5 overflow-x-auto rounded-[24px] border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="sticky left-0 z-20 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left">Dermoconsejera</th>
                <th className="sticky left-[260px] z-20 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left">Supervisor</th>
                {calendario.dias.map((day) => (
                  <th key={day} className="border-b border-slate-200 px-2 py-3 text-center">
                    <div>{getWeekdayLetter(day)}</div>
                    <div className="mt-1 text-[11px] font-semibold text-slate-700">{day.slice(-2)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calendario.empleados.map((employee) => (
                <tr key={employee.empleadoId} className="border-b border-slate-100 align-top">
                  <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3">
                    <p className="font-semibold text-slate-950">{employee.nombreCompleto}</p>
                    <p className="mt-1 text-xs text-slate-500">{employee.zona ?? 'Sin zona'}</p>
                  </td>
                  <td className="sticky left-[260px] z-10 border-r border-slate-200 bg-white px-4 py-3 text-slate-600">
                    {employee.supervisorNombre ?? 'Sin supervisor'}
                  </td>
                  {employee.dias.map((day) => (
                    <td key={`${employee.empleadoId}-${day.fecha}`} className="px-2 py-3 text-center">
                      <span className={`inline-flex min-w-11 justify-center rounded-full px-2 py-1 text-[11px] font-semibold ${getCalendarTone(day.estadoOperativo)}`} title={`${day.fecha} · ${day.mensajeOperativo ?? day.estadoOperativo}`}>
                        {getCalendarCode(day.estadoOperativo)}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-5">
          <EmptyState title="Sin calendario materializado" description={view.mensaje ?? 'No hay filas para el mes y filtros seleccionados.'} />
        </div>
      )}
    </SectionShell>
  )
}

function AssignmentsModalLayer({
  data,
  hrefBuilder,
  onClose,
}: {
  data: AsignacionesPanelData
  hrefBuilder: (overrides: Record<string, string | null | undefined>) => string
  onClose: () => void
}) {
  if (!data.activeModal) {
    return null
  }

    const title =
      data.activeModal === 'catalogo'
        ? 'Catalogo maestro inicial'
        : data.activeModal === 'horarios'
          ? 'Horarios San Pablo'
          : data.activeModal === 'descansos'
            ? 'Descansos permanentes'
          : 'Nueva asignacion'
    const subtitle =
      data.activeModal === 'catalogo'
        ? 'Importa, aprueba y materializa la base estructural.'
        : data.activeModal === 'horarios'
          ? 'Importa la semana operativa exclusiva de San Pablo.'
          : data.activeModal === 'descansos'
            ? 'Define ajustes permanentes sobre la base y previsualiza su impacto mensual antes de guardar.'
          : 'Crea asignaciones manuales sin recargar el resto del workspace.'

  return (
      <ModalPanel open onClose={onClose} title={title} subtitle={subtitle} maxWidthClassName="max-w-[1680px]">
        {data.activeModal === 'catalogo' ? <CatalogModalContent data={data} /> : null}
        {data.activeModal === 'horarios' ? <HorariosModalContent /> : null}
        {data.activeModal === 'descansos' ? <DescansoPermanenteModalContent data={data} hrefBuilder={hrefBuilder} /> : null}
        {data.activeModal === 'manual' ? <ManualModalContent data={data} hrefBuilder={hrefBuilder} /> : null}
      </ModalPanel>
    )
  }
function CatalogModalContent({ data }: { data: AsignacionesPanelData }) {
  const [importState, importAction] = useActionState(importarCatalogoMaestroAsignaciones, ESTADO_IMPORTACION_ASIGNACIONES_INICIAL)
  const [approveState, approveAction] = useActionState(publicarCatalogoMaestroAsignaciones, ESTADO_PUBLICACION_CATALOGO_ASIGNACIONES_INICIAL)
  const [monthlyState, monthlyAction] = useActionState(publicarOperacionMensualAsignaciones, ESTADO_PUBLICACION_CATALOGO_ASIGNACIONES_INICIAL)
  const router = useRouter()
  const defaultMonth = data.calendarView?.filtros.month ?? getCurrentMonthValue()

  useEffect(() => {
    if (importState.redirectTo) {
      router.replace(importState.redirectTo)
    }
  }, [importState.redirectTo, router])

  useEffect(() => {
    if (!approveState.ok) {
      return
    }

    if (approveState.redirectTo) {
      router.replace(approveState.redirectTo)
      return
    }

    router.refresh()
  }, [approveState.ok, approveState.redirectTo, router])

  useEffect(() => {
    if (monthlyState.ok) {
      router.refresh()
    }
  }, [monthlyState.ok, router])

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.75fr)]">
      <div className="space-y-5">
        <Card className="rounded-[28px] border border-slate-200 p-5">
          <h3 className="text-lg font-semibold text-slate-950">Importar catalogo maestro</h3>
          <p className="mt-2 text-sm text-slate-500">Carga la base estructural inicial con BTL CVE, USUARIO, IDNOM, NOMBRE DC, HORARIO, DÍAS laborales, DESCANSO y fecha de inicio antes de aprobarla.</p>
          <form action={importAction} className="mt-4 space-y-4">
            <Input name="catalogo_asignaciones_file" type="file" accept=".xlsx" label="Archivo XLSX" />
            <div className="flex flex-wrap items-center gap-3">
              <ActionButton label="Importar catalogo" pendingLabel="Importando..." />
              <a href="/api/asignaciones/template" className="text-sm font-semibold text-sky-700 hover:text-sky-900">Descargar plantilla</a>
            </div>
            <ActionFeedback ok={importState.ok} message={importState.message} />
            {importState.summary ? (
              <div className="grid gap-3 rounded-[20px] bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-3">
                <p>Filas parseadas: <span className="font-semibold text-slate-900">{importState.summary.parsedRows}</span></p>
                <p>Borradores propuestos: <span className="font-semibold text-slate-900">{importState.previewRows.length}</span></p>
                <p>Bloqueantes: <span className="font-semibold text-slate-900">{importState.summary.conflictCount}</span></p>
                <p>Alertas: <span className="font-semibold text-slate-900">{importState.summary.alertCount}</span></p>
                <p>Avisos: <span className="font-semibold text-slate-900">{importState.summary.noticeCount}</span></p>
                <p>Incidencias totales: <span className="font-semibold text-slate-900">{importState.conflicts.length}</span></p>
              </div>
            ) : null}
            <DraftPreviewCard rows={importState.previewRows} />
            <div className="grid gap-3 rounded-[20px] bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-2">
              <p>
                Bases en borrador: <span className="font-semibold text-slate-900">{data.catalogModal?.draftBaseCount ?? 0}</span>
              </p>
              <p>
                Bases aprobadas: <span className="font-semibold text-slate-900">{data.catalogModal?.approvedBaseCount ?? 0}</span>
              </p>
            </div>
          </form>
          <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-slate-200 bg-slate-50 p-4">
            <AsignacionBulkDraftCleanupButton total={data.shell.borrador} puedeGestionar={data.puedeGestionar} />
            <form action={approveAction} className="space-y-2">
            <ActionButton label="Publicar todo el borrador" pendingLabel="Publicando..." />
            <ActionFeedback ok={approveState.ok} message={approveState.message} />
          </form>
        </div>
      </Card>

      </div>

      <div className="space-y-5">
        <ConflictsPreviewCard title="Incidencias del import" conflicts={importState.conflicts} />

        <Card className="rounded-[28px] border border-slate-200 p-5">
          <h3 className="text-lg font-semibold text-slate-950">Publicacion mensual</h3>
          <p className="mt-2 text-sm text-slate-500">Materializa un mes puntual sin recalcular toda la ruta de asignaciones.</p>
          <form action={monthlyAction} className="mt-4 space-y-4">
            <Input type="month" name="operational_month" label="Mes operativo" defaultValue={defaultMonth} />
            <ActionButton label="Publicar operacion mensual" pendingLabel="Publicando..." />
            <ActionFeedback ok={monthlyState.ok} message={monthlyState.message} />
          </form>
        </Card>
      </div>
    </div>
  )
}

export function HorariosModalContent() {
  const [state, action] = useActionState(importarHorariosSanPabloSemanales, ESTADO_IMPORTACION_ASIGNACIONES_INICIAL)
  const router = useRouter()

  useEffect(() => {
    if (state.ok) {
      router.refresh()
    }
  }, [router, state.ok])

  return (
    <Card className="rounded-[24px] border border-slate-200 p-5">
      <h3 className="text-lg font-semibold text-slate-950">Importar horarios San Pablo</h3>
      <p className="mt-2 text-sm text-slate-500">Sube la semana exclusiva de San Pablo sin tocar el resto de la planeacion.</p>
      <form action={action} className="mt-4 space-y-4">
        <Input name="horarios_san_pablo_file" type="file" accept=".xlsx" label="Archivo XLSX" />
        <div className="flex flex-wrap items-center gap-3">
          <ActionButton label="Importar horarios" pendingLabel="Importando..." />
          <a href="/api/asignaciones/horarios-template" className="text-sm font-semibold text-sky-700 hover:text-sky-900">Descargar plantilla</a>
        </div>
        <ActionFeedback ok={state.ok} message={state.message} />
      </form>
      </Card>
    )
  }

function DescansoPermanenteModalContent({
  data,
  hrefBuilder,
}: {
  data: AsignacionesPanelData
  hrefBuilder: (overrides: Record<string, string | null | undefined>) => string
}) {
  const [state, action] = useActionState(guardarDescansoPermanenteAsignacion, ESTADO_DESCANSO_PERMANENTE_INICIAL)
  const router = useRouter()
  const descansoModal = data.descansoModal

  useEffect(() => {
    if (state.ok) {
      router.refresh()
    }
  }, [router, state.ok])

  if (!descansoModal) {
    return <EmptyState title="Sin datos para descansos" description="Reabre el modal para cargar las asignaciones y versiones activas." />
  }

  const previewMonth = state.preview?.mes ?? descansoModal.defaultMonth
  const previewDescansos = state.preview?.fechasDescanso ?? []
  const previewTrabajos = state.preview?.fechasTrabajo ?? []
  const previewDescansosMes = countDatesInMonth(previewDescansos, previewMonth)
  const previewTrabajosMes = countDatesInMonth(previewTrabajos, previewMonth)
  const previewTotalMes = countDatesInMonth(Array.from(new Set([...previewDescansos, ...previewTrabajos])), previewMonth)

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[24px] border border-slate-200 p-5">
          <h3 className="text-lg font-semibold text-slate-950">Base y vigencia</h3>
          <p className="mt-2 text-sm text-slate-500">
            Define sobre qué base vive el ajuste permanente. El cambio se conserva hasta que alguien lo vuelva a editar.
          </p>
          <div className="mt-4 grid gap-4">
            <Select
              name="override_mode"
              label="Modo de ajuste"
              defaultValue="REGLA_MENSUAL"
              options={[
                { value: 'REGLA_MENSUAL', label: 'Regla mensual persistente' },
                { value: 'EXPLICITO', label: 'Solo fechas explicitas' },
              ]}
            />
            <Select
              name="asignacion_id"
              label="Asignacion base"
              defaultValue={descansoModal.assignmentOptions[0]?.id ?? ''}
              options={[
                { value: '', label: 'Selecciona una asignacion' },
                ...descansoModal.assignmentOptions.map((item) => ({
                  value: item.id,
                  label: item.label,
                })),
              ]}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                type="date"
                name="vigente_desde"
                label="Vigente desde"
                defaultValue={getCurrentMxDate()}
              />
              <Input
                type="month"
                name="preview_month"
                label="Mes de vista previa"
                defaultValue={previewMonth}
              />
            </div>
            <Input
              name="observaciones"
              label="Observaciones"
              placeholder="Ej. Patrón mixto con domingos, lunes y miércoles"
            />
          </div>

          <div className="mt-5 rounded-[20px] border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Versiones activas</p>
            <div className="mt-3 space-y-3">
              {descansoModal.activeOverrides.length === 0 ? (
                <p className="text-sm text-slate-500">Todavía no hay descansos permanentes activos para esta cuenta.</p>
              ) : (
                descansoModal.activeOverrides.slice(0, 5).map((item) => (
                  <div key={item.id} className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-950">{item.asignacionLabel}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Vigencia {formatDate(item.vigenteDesde)} {item.vigenteHasta ? `- ${formatDate(item.vigenteHasta)}` : '- abierta'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{formatOverrideMode(item.modo)}</p>
                    {item.reglaDescanso ? (
                      <p className="mt-1 text-xs text-slate-600">{JSON.stringify(item.reglaDescanso)}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-slate-600">
                      Descanso: {item.fechasDescanso.length > 0 ? formatDatesPreview(item.fechasDescanso.slice(0, 6)) : 'Sin fechas'}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Trabajo: {item.fechasTrabajo.length > 0 ? formatDatesPreview(item.fechasTrabajo.slice(0, 6)) : 'Sin fechas'}
                    </p>
                    {item.observaciones ? <p className="mt-1 text-xs text-slate-500">{item.observaciones}</p> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>

        <Card className="rounded-[24px] border border-slate-200 p-5">
          <h3 className="text-lg font-semibold text-slate-950">Regla, fechas y previsualizacion</h3>
          <p className="mt-2 text-sm text-slate-500">
            Puedes guardar una regla mensual persistente y encima sumar excepciones por fecha. La misma fecha no puede quedar como descanso y trabajo al mismo tiempo.
          </p>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {WEEKDAY_MONTHLY_RULES.map((item) => (
                <Card key={item.code} className="rounded-[18px] border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                  <div className="mt-3 grid gap-3">
                    <Input
                      name={`regla_${item.code}_descanso`}
                      label="Descansan"
                      placeholder="1,3"
                    />
                    <Input
                      name={`regla_${item.code}_trabajo`}
                      label="Trabajan"
                      placeholder="2,4"
                    />
                  </div>
                </Card>
              ))}
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground-tertiary">
                Fechas extra de descanso
              </label>
              <textarea
                name="fechas_descanso"
                rows={6}
                placeholder={`2026-04-07\n2026-04-14\n2026-04-21`}
                className="w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition-all duration-200 placeholder:text-foreground-muted focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)] hover:border-primary-200"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-foreground-tertiary">
                Fechas extra de trabajo
              </label>
              <textarea
                name="fechas_trabajo"
                rows={4}
                placeholder={`2026-04-10\n2026-04-24`}
                className="w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition-all duration-200 placeholder:text-foreground-muted focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)] hover:border-primary-200"
              />
            </div>
          </div>

          <div className="mt-5 rounded-[20px] bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Impacto del mes</p>
            {state.preview ? (
              <div className="mt-3 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                <p>
                  Mes: <span className="font-semibold text-slate-950">{formatMonthLabel(previewMonth)}</span>
                </p>
                <p>
                  Asignacion: <span className="font-semibold text-slate-950">{state.preview.asignacionLabel}</span>
                </p>
                <p>
                  Modo: <span className="font-semibold text-slate-950">{formatOverrideMode(state.preview.modo)}</span>
                </p>
                <p>
                  Descansos en el mes: <span className="font-semibold text-slate-950">{previewDescansosMes}</span>
                </p>
                <p>
                  Trabajos en el mes: <span className="font-semibold text-slate-950">{previewTrabajosMes}</span>
                </p>
                <p>
                  Dias afectados: <span className="font-semibold text-slate-950">{previewTotalMes}</span>
                </p>
                <p>
                  Versión: <span className="font-semibold text-slate-950">{state.overrideId ?? 'Nueva'}</span>
                </p>
                {state.preview.reglaLabel ? (
                  <div className="sm:col-span-2">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Regla</p>
                    <p className="mt-1 text-sm text-slate-700">{state.preview.reglaLabel}</p>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Descansos</p>
                  <p className="mt-1 text-sm text-slate-700">{formatDatesPreview(previewDescansos)}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Trabajos</p>
                  <p className="mt-1 text-sm text-slate-700">{formatDatesPreview(previewTrabajos)}</p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Genera una vista previa para ver cuantas fechas del mes caen en descanso o en regreso a trabajo.
              </p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <NamedActionButton
              name="descanso_action"
              value="preview"
              label="Previsualizar impacto"
              pendingLabel="Calculando..."
              variant="outline"
            />
            <NamedActionButton
              name="descanso_action"
              value="save"
              label="Guardar permanente"
              pendingLabel="Guardando..."
            />
            <Link
              href={hrefBuilder({ modal: null })}
              className="inline-flex min-h-11 items-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancelar
            </Link>
          </div>
          <ActionFeedback ok={state.ok} message={state.message} />
        </Card>
      </div>
    </form>
  )
}

function ManualModalContent({
  data,
  hrefBuilder,
}: {
  data: AsignacionesPanelData
  hrefBuilder: (overrides: Record<string, string | null | undefined>) => string
}) {
  const [state, action] = useActionState(guardarAsignacionPlanificada, ESTADO_ASIGNACION_INICIAL)
  const router = useRouter()
  const manual = data.manualModal

  useEffect(() => {
    if (state.ok) {
      router.refresh()
    }
  }, [router, state.ok])

  if (!manual) {
    return <EmptyState title="Sin datos para alta manual" description="Abre de nuevo el modal para recargar los catalogos minimos." />
  }

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[24px] border border-slate-200 p-5">
          <h3 className="text-lg font-semibold text-slate-950">Datos base</h3>
          <div className="mt-4 grid gap-4">
            <Select name="empleado_id" label="Dermoconsejera" defaultValue="" options={[{ value: '', label: 'Selecciona una DC' }, ...manual.empleadosDisponibles.map((item) => ({ value: item.id, label: `${item.nombre}${item.zona ? ` · ${item.zona}` : ''}` }))]} />
            <Select name="pdv_id" label="PDV" defaultValue={manual.prefill.pdvId ?? ''} options={[{ value: '', label: 'Selecciona un PDV' }, ...manual.pdvsDisponibles.map((item) => ({ value: item.id, label: `${item.claveBtl} · ${item.nombre}` }))]} />
            <div className="grid gap-4 md:grid-cols-2">
              <Select name="tipo" label="Tipo" defaultValue={manual.prefill.tipo ?? 'COBERTURA'} options={[{ value: 'COBERTURA', label: 'Cobertura' }, { value: 'FIJA', label: 'Fija' }, { value: 'ROTATIVA', label: 'Rotativa' }]} />
              <Select name="naturaleza" label="Naturaleza" defaultValue={manual.prefill.naturaleza ?? 'COBERTURA_TEMPORAL'} options={[{ value: 'COBERTURA_TEMPORAL', label: 'Cobertura temporal' }, { value: 'COBERTURA_PERMANENTE', label: 'Cobertura permanente' }]} />
            </div>
            <Select name="horario_referencia" label="Horario" defaultValue="" options={[{ value: '', label: 'Sin horario de referencia' }, ...manual.turnosDisponibles]} />
          </div>
        </Card>

        <Card className="rounded-[24px] border border-slate-200 p-5">
          <h3 className="text-lg font-semibold text-slate-950">Vigencia y reglas</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Input type="date" name="fecha_inicio" label="Fecha inicio" defaultValue={manual.prefill.fechaInicio ?? `${getCurrentMonthValue()}-01`} />
            <Input type="date" name="fecha_fin" label="Fecha fin" />
            <Select name="dia_descanso" label="Descanso" defaultValue="" options={[{ value: '', label: 'Sin descanso fijo' }, ...DIA_LABORAL_CODES.map((item) => ({ value: item, label: item }))]} />
            <Input name="motivo_movimiento" label="Motivo del movimiento" placeholder="Cobertura por acceso, apoyo temporal, etc." defaultValue={manual.prefill.motivoMovimiento ?? ''} />
          </div>
          <div className="mt-4 rounded-[20px] border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Dias laborales</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {DIA_LABORAL_CODES.map((item) => (
                <label key={item} className="flex items-center gap-2 rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <input type="checkbox" name="dias_laborales" value={item} className="h-4 w-4 rounded border-slate-300" />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="mt-4 flex items-center gap-2 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input type="checkbox" name="retorna_a_base" value="true" className="h-4 w-4 rounded border-slate-300" />
            Regresa a la asignacion base al terminar la cobertura temporal
          </label>
          <Input name="observaciones" label="Observaciones" placeholder="Notas operativas para esta asignacion" className="mt-4" defaultValue={manual.prefill.observaciones ?? ''} />
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ActionButton label="Guardar en borrador" pendingLabel="Guardando..." />
        <Link href={hrefBuilder({ modal: null })} className="inline-flex min-h-11 items-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
          Cancelar
        </Link>
      </div>
      <ActionFeedback ok={state.ok} message={state.message} />
      {state.issues.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {state.issues.map((issue) => (
            <span key={issue.code} className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${issueTone(issue.severity)}`}>
              {issue.label}
            </span>
          ))}
        </div>
      ) : null}
    </form>
  )
}

function NamedActionButton({
  name,
  value,
  label,
  pendingLabel,
  variant,
}: {
  name: string
  value: string
  label: string
  pendingLabel: string
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
}) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" name={name} value={value} variant={variant} isLoading={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}

function ActionButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return <Button type="submit" isLoading={pending}>{pending ? pendingLabel : label}</Button>
}

function ActionFeedback({ ok, message }: { ok: boolean; message: string | null }) {
  if (!message) {
    return null
  }

  return <p className={`text-sm ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>{message}</p>
}
