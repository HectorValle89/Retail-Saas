'use client'

import Link from 'next/link'
import { useActionState, type ReactNode } from 'react'
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
  importarCatalogoMaestroAsignaciones,
  importarHorariosSanPabloSemanales,
  importarRotacionMaestraPdvs,
  publicarCatalogoMaestroAsignaciones,
  publicarOperacionMensualAsignaciones,
} from '../actions'
import { DIA_LABORAL_CODES } from '../lib/assignmentPlanning'
import type { AssignmentIssue } from '../lib/assignmentValidation'
import {
  ESTADO_ASIGNACION_INICIAL,
  ESTADO_IMPORTACION_ASIGNACIONES_INICIAL,
  ESTADO_PUBLICACION_CATALOGO_ASIGNACIONES_INICIAL,
} from '../state'
import { ESTADO_IMPORTACION_ROTACION_MAESTRA_INICIAL } from '../rotationState'
import type {
  AssignmentPdvPanel,
  AssignmentWorkspaceView,
  AsignacionesPanelData,
} from '../services/asignacionService'
import { AsignacionBulkDraftCleanupButton } from './AsignacionBulkDraftCleanupButton'
import { AsignacionDraftCleanupButton } from './AsignacionDraftCleanupButton'
import { AsignacionEstadoControls } from './AsignacionEstadoControls'

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

function SectionShell({ title, description, actions, children }: { title: string; description: string; actions?: ReactNode; children: ReactNode }) {
  return (
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
  )
}

function WorkspaceTabs({
  activeView,
  hrefBuilder,
}: {
  activeView: AssignmentWorkspaceView
  hrefBuilder: (overrides: Record<string, string | null | undefined>) => string
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {[
        { id: 'asignaciones', label: 'Asignaciones' },
        { id: 'pdvs', label: 'PDVs' },
        { id: 'calendario', label: 'Calendario mensual' },
      ].map((item) => {
        const active = activeView === item.id
        return (
          <Link
            key={item.id}
            href={hrefBuilder({ vista: item.id, page: null })}
            className={
              active
                ? 'inline-flex min-h-11 items-center rounded-full bg-[var(--module-primary)] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_var(--module-shadow)]'
                : 'inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950'
            }
          >
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}

export function AsignacionesPanel({
  data,
  puedeGestionar,
}: {
  data: AsignacionesPanelData
  puedeGestionar: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const hrefBuilder = (overrides: Record<string, string | null | undefined>) =>
    buildHref(pathname, searchParams, overrides)

  const shellCards = [
    { label: 'Total visibles', value: String(data.shell.total), accentClass: 'bg-white' },
    { label: 'Borrador', value: String(data.shell.borrador), accentClass: 'bg-amber-50/80' },
    { label: 'Publicada', value: String(data.shell.publicada), accentClass: 'bg-emerald-50/80' },
    { label: 'Activas', value: String(data.shell.activas), accentClass: 'bg-sky-50/80' },
  ]

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista ? (
        <Card className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="font-semibold">Infraestructura parcial</p>
          <p className="mt-1">{data.mensajeInfraestructura ?? 'Faltan tablas o relaciones para mostrar toda la experiencia de asignaciones.'}</p>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {shellCards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} accentClass={card.accentClass} />
        ))}
      </section>

      <SectionShell
        title="Workspace de asignaciones"
        description="Cargamos primero el resumen y diferimos cada vista pesada para que la ruta se sienta mas ligera y mas barata de operar."
        actions={
          <>
            <Link href={hrefBuilder({ modal: 'catalogo' })} className="inline-flex min-h-11 items-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
              Cargar catalogo maestro
            </Link>
            <Link href={hrefBuilder({ modal: 'horarios' })} className="inline-flex min-h-11 items-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
              Horarios San Pablo
            </Link>
            <Link href={hrefBuilder({ modal: 'manual' })} className="inline-flex min-h-11 items-center rounded-[16px] bg-[var(--module-primary)] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_var(--module-shadow)] transition hover:bg-[var(--module-hover)]">
              Nueva asignacion
            </Link>
          </>
        }
      >
        <WorkspaceTabs activeView={data.activeView} hrefBuilder={hrefBuilder} />
      </SectionShell>

      {data.activeView === 'asignaciones' ? (
        <AssignmentsSection data={data} puedeGestionar={puedeGestionar} hrefBuilder={hrefBuilder} />
      ) : null}
      {data.activeView === 'pdvs' ? (
        <PdvsSection data={data} pathname={pathname} hrefBuilder={hrefBuilder} />
      ) : null}
      {data.activeView === 'calendario' ? (
        <CalendarSection data={data} pathname={pathname} hrefBuilder={hrefBuilder} />
      ) : null}

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
      title="Asignaciones"
      description="Separadas por estado para no mezclar borradores, publicadas y vigentes en la misma lectura."
      actions={
        view.estado === 'BORRADOR' ? <AsignacionBulkDraftCleanupButton total={data.shell.borrador} puedeGestionar={puedeGestionar} /> : null
      }
    >
      <div className="flex flex-wrap gap-3">
        {tabs.map((tab) => {
          const active = view.estado === tab.id
          return (
            <Link
              key={tab.id}
              href={hrefBuilder({ vista: 'asignaciones', estado: tab.id, page: null })}
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
            href={hrefBuilder({ vista: 'asignaciones', estado: view.estado, page: String(Math.max(1, view.page - 1)) })}
            className={`inline-flex min-h-10 items-center rounded-[14px] border px-4 font-medium ${view.page <= 1 ? 'pointer-events-none border-slate-100 text-slate-300' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            Anterior
          </Link>
          <Link
            href={hrefBuilder({ vista: 'asignaciones', estado: view.estado, page: String(view.page + 1) })}
            className={`inline-flex min-h-10 items-center rounded-[14px] border px-4 font-medium ${view.page * view.pageSize >= view.total ? 'pointer-events-none border-slate-100 text-slate-300' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            Siguiente
          </Link>
        </div>
      </div>
    </SectionShell>
  )
}
function PdvsSection({
  data,
  pathname,
  hrefBuilder,
}: {
  data: AsignacionesPanelData
  pathname: string
  hrefBuilder: (overrides: Record<string, string | null | undefined>) => string
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
          vista: 'pdvs',
          pdv_panel: 'COBERTURA',
          pdv_estado: null,
          cadena: null,
          ciudad: null,
          zona: null,
          rotacion_clasificacion: null,
          grupo_rotacion: null,
        })
      : hrefBuilder({
          vista: 'pdvs',
          pdv_panel: 'ROTACION',
          pdv_estado: null,
          cadena: null,
          ciudad: null,
          zona: null,
          rotacion_clasificacion: null,
          grupo_rotacion: null,
        })

  return (
    <SectionShell title="PDVs" description="Partimos cobertura y rotacion maestra en sublecturas para que esta vista no cargue dos tableros pesados al mismo tiempo.">
      <div className="flex flex-wrap gap-3">
        {panelTabs.map((tab) => {
          const active = view.panel === tab.id
          return (
            <Link
              key={tab.id}
              href={hrefBuilder({
                vista: 'pdvs',
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
        <input type="hidden" name="vista" value="pdvs" />
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
}: {
  data: AsignacionesPanelData
  pathname: string
  hrefBuilder: (overrides: Record<string, string | null | undefined>) => string
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
    <SectionShell title="Calendario mensual" description="Cargamos solo el mes visible y diferimos el resto de vistas para no sobrecargar la pantalla inicial.">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Mes visible" value={formatMonthLabel(month)} accentClass="bg-white" />
        <MetricCard label="Dermoconsejeras" value={String(totalEmpleados)} accentClass="bg-sky-50/80" />
        <MetricCard label="Dias visibles" value={String(dias.length)} accentClass="bg-violet-50/80" />
      </div>

      <form action={pathname} method="get" className="mt-5 grid gap-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-4">
        <input type="hidden" name="vista" value="calendario" />
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
          <Link href={hrefBuilder({ vista: 'calendario', month: null, supervisor_empleado_id: null, estado_operativo: null })} className="inline-flex min-h-11 items-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            Limpiar
          </Link>
        </div>
      </form>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link href={hrefBuilder({ vista: 'calendario', month: shiftMonth(month, -1) })} className="inline-flex min-h-10 items-center rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
          Mes anterior
        </Link>
        <Link href={hrefBuilder({ vista: 'calendario', month: shiftMonth(month, 1) })} className="inline-flex min-h-10 items-center rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
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
        : 'Nueva asignacion'
  const subtitle =
    data.activeModal === 'catalogo'
      ? 'Importa, aprueba y materializa la base estructural.'
      : data.activeModal === 'horarios'
        ? 'Importa la semana operativa exclusiva de San Pablo.'
        : 'Crea asignaciones manuales sin recargar el resto del workspace.'

  return (
    <ModalPanel open onClose={onClose} title={title} subtitle={subtitle} maxWidthClassName="max-w-6xl">
      {data.activeModal === 'catalogo' ? <CatalogModalContent data={data} /> : null}
      {data.activeModal === 'horarios' ? <HorariosModalContent /> : null}
      {data.activeModal === 'manual' ? <ManualModalContent data={data} hrefBuilder={hrefBuilder} /> : null}
    </ModalPanel>
  )
}
function CatalogModalContent({ data }: { data: AsignacionesPanelData }) {
  const [importState, importAction] = useActionState(importarCatalogoMaestroAsignaciones, ESTADO_IMPORTACION_ASIGNACIONES_INICIAL)
  const [rotationState, rotationAction] = useActionState(importarRotacionMaestraPdvs, ESTADO_IMPORTACION_ROTACION_MAESTRA_INICIAL)
  const [approveState, approveAction] = useActionState(publicarCatalogoMaestroAsignaciones, ESTADO_PUBLICACION_CATALOGO_ASIGNACIONES_INICIAL)
  const [monthlyState, monthlyAction] = useActionState(publicarOperacionMensualAsignaciones, ESTADO_PUBLICACION_CATALOGO_ASIGNACIONES_INICIAL)
  const defaultMonth = data.calendarView?.filtros.month ?? getCurrentMonthValue()

  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-5">
        <Card className="rounded-[24px] border border-slate-200 p-5">
          <h3 className="text-lg font-semibold text-slate-950">Importar catalogo maestro</h3>
          <p className="mt-2 text-sm text-slate-500">Carga la base estructural inicial en borrador antes de aprobarla.</p>
          <form action={importAction} className="mt-4 space-y-4">
            <Input name="catalogo_asignaciones_file" type="file" accept=".xlsx" label="Archivo XLSX" />
            <div className="flex flex-wrap items-center gap-3">
              <ActionButton label="Importar catalogo" pendingLabel="Importando..." />
              <a href="/api/asignaciones/template" className="text-sm font-semibold text-sky-700 hover:text-sky-900">Descargar plantilla</a>
            </div>
            <ActionFeedback ok={importState.ok} message={importState.message} />
            {importState.summary ? (
              <div className="grid gap-3 rounded-[20px] bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-2">
                <p>Filas parseadas: <span className="font-semibold text-slate-900">{importState.summary.parsedRows}</span></p>
                <p>Insertadas: <span className="font-semibold text-slate-900">{importState.summary.insertedRows}</span></p>
                <p>Actualizadas: <span className="font-semibold text-slate-900">{importState.summary.updatedRows}</span></p>
                <p>Conflictos: <span className="font-semibold text-slate-900">{importState.summary.conflictCount}</span></p>
              </div>
            ) : null}
          </form>
        </Card>

        <Card className="rounded-[24px] border border-slate-200 p-5">
          <h3 className="text-lg font-semibold text-slate-950">Importar rotacion maestra</h3>
          <p className="mt-2 text-sm text-slate-500">Define la topologia FIJO / ROTATIVO como reemplazo total de la cuenta activa, sin inferirla en tiempo real.</p>
          <form action={rotationAction} className="mt-4 space-y-4">
            <Input name="rotacion_maestra_file" type="file" accept=".xlsx" label="Archivo XLSX" />
            <div className="flex flex-wrap items-center gap-3">
              <ActionButton label="Importar rotacion" pendingLabel="Importando..." />
              <a href="/api/asignaciones/rotacion-template" className="text-sm font-semibold text-sky-700 hover:text-sky-900">Descargar plantilla</a>
              <a href="/api/asignaciones/rotacion-propuesta" className="text-sm font-semibold text-violet-700 hover:text-violet-900">Descargar propuesta</a>
            </div>
            <ActionFeedback ok={rotationState.ok} message={rotationState.message} />
            {rotationState.summary ? (
              <div className="grid gap-3 rounded-[20px] bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-2">
                <p>Filas parseadas: <span className="font-semibold text-slate-900">{rotationState.summary.parsedRows}</span></p>
                <p>Fijos: <span className="font-semibold text-slate-900">{rotationState.summary.fijos}</span></p>
                <p>Rotativos: <span className="font-semibold text-slate-900">{rotationState.summary.rotativos}</span></p>
                <p>Grupos incompletos: <span className="font-semibold text-slate-900">{rotationState.summary.incompleteGroups}</span></p>
                <p>PDVs faltantes: <span className="font-semibold text-slate-900">{rotationState.summary.missingOperablePdvs}</span></p>
                <p>Conflictos: <span className="font-semibold text-slate-900">{rotationState.summary.conflictCount}</span></p>
              </div>
            ) : null}
            {rotationState.conflicts.length > 0 ? (
              <div className="rounded-[20px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                <p className="font-semibold">Conflictos detectados</p>
                <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                  {rotationState.conflicts.slice(0, 12).map((conflict, index) => (
                    <div key={String(conflict.rowNumber) + '-' + conflict.code + '-' + index} className="rounded-[16px] border border-rose-200 bg-white px-3 py-2">
                      <p className="font-medium text-rose-900">{conflict.label}{conflict.claveBtl ? ' · ' + conflict.claveBtl : ''}</p>
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
          <p className="mt-2 text-sm text-slate-500">Usa archivos operativos como <span className="font-semibold text-slate-700">PDV ROTATIVOS Y FIJOS.xlsx</span> para descargar el XLSX oficial de rotacion maestra antes de importarlo.</p>
          <form action="/api/asignaciones/rotacion-legacy-convert" method="post" encType="multipart/form-data" target="_blank" className="mt-4 space-y-4">
            <Input name="legacy_rotacion_file" type="file" accept=".xlsx" label="Archivo legacy XLSX" />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit">Convertir y descargar</Button>
            </div>
            <p className="text-xs leading-5 text-slate-500">La conversion aplica las parejas manuales aprobadas para los PDVs rotativos `POR CUBRIR` y valida el resultado contra el contrato oficial antes de descargar.</p>
          </form>
        </Card>

        <Card className="rounded-[24px] border border-slate-200 p-5">
          <h3 className="text-lg font-semibold text-slate-950">Aprobar catalogo maestro</h3>
          <p className="mt-2 text-sm text-slate-500">Publica la base aprobada y materializa el mes actual y el siguiente.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <MetricCard label="Bases en borrador" value={String(data.catalogModal?.draftBaseCount ?? 0)} accentClass="bg-amber-50/80" />
            <MetricCard label="Bases aprobadas" value={String(data.catalogModal?.approvedBaseCount ?? 0)} accentClass="bg-emerald-50/80" />
          </div>
          <form action={approveAction} className="mt-4 space-y-4">
            <ActionButton label="Aprobar catalogo" pendingLabel="Aprobando..." />
            <ActionFeedback ok={approveState.ok} message={approveState.message} />
          </form>
        </Card>
      </div>

      <Card className="rounded-[24px] border border-slate-200 p-5">
        <h3 className="text-lg font-semibold text-slate-950">Publicacion mensual</h3>
        <p className="mt-2 text-sm text-slate-500">Materializa un mes puntual sin recalcular toda la ruta de asignaciones.</p>
        <form action={monthlyAction} className="mt-4 space-y-4">
          <Input type="month" name="operational_month" label="Mes operativo" defaultValue={defaultMonth} />
          <ActionButton label="Publicar operacion mensual" pendingLabel="Publicando..." />
          <ActionFeedback ok={monthlyState.ok} message={monthlyState.message} />
        </form>
      </Card>
    </div>
  )
}

function HorariosModalContent() {
  const [state, action] = useActionState(importarHorariosSanPabloSemanales, ESTADO_IMPORTACION_ASIGNACIONES_INICIAL)

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

function ManualModalContent({
  data,
  hrefBuilder,
}: {
  data: AsignacionesPanelData
  hrefBuilder: (overrides: Record<string, string | null | undefined>) => string
}) {
  const [state, action] = useActionState(guardarAsignacionPlanificada, ESTADO_ASIGNACION_INICIAL)
  const manual = data.manualModal

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
            <Select name="pdv_id" label="PDV" defaultValue="" options={[{ value: '', label: 'Selecciona un PDV' }, ...manual.pdvsDisponibles.map((item) => ({ value: item.id, label: `${item.claveBtl} · ${item.nombre}` }))]} />
            <div className="grid gap-4 md:grid-cols-2">
              <Select name="tipo" label="Tipo" defaultValue="COBERTURA" options={[{ value: 'COBERTURA', label: 'Cobertura' }, { value: 'FIJA', label: 'Fija' }, { value: 'ROTATIVA', label: 'Rotativa' }]} />
              <Select name="naturaleza" label="Naturaleza" defaultValue="COBERTURA_TEMPORAL" options={[{ value: 'COBERTURA_TEMPORAL', label: 'Cobertura temporal' }, { value: 'COBERTURA_PERMANENTE', label: 'Cobertura permanente' }]} />
            </div>
            <Select name="horario_referencia" label="Horario" defaultValue="" options={[{ value: '', label: 'Sin horario de referencia' }, ...manual.turnosDisponibles]} />
          </div>
        </Card>

        <Card className="rounded-[24px] border border-slate-200 p-5">
          <h3 className="text-lg font-semibold text-slate-950">Vigencia y reglas</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Input type="date" name="fecha_inicio" label="Fecha inicio" defaultValue={`${getCurrentMonthValue()}-01`} />
            <Input type="date" name="fecha_fin" label="Fecha fin" />
            <Select name="dia_descanso" label="Descanso" defaultValue="" options={[{ value: '', label: 'Sin descanso fijo' }, ...DIA_LABORAL_CODES.map((item) => ({ value: item, label: item }))]} />
            <Input name="motivo_movimiento" label="Motivo del movimiento" placeholder="Cobertura por acceso, apoyo temporal, etc." />
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
          <Input name="observaciones" label="Observaciones" placeholder="Notas operativas para esta asignacion" className="mt-4" />
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
