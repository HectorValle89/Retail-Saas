'use client'

import Link from 'next/link'
import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { actualizarEstadoVacanteOperativaFutura } from '../actions'
import { ESTADO_ACTUALIZACION_VACANTE_OPERATIVA_INICIAL } from '../state'
import type {
  VacanteOperativaFuturaListItem,
  VacantesOperativasFuturasData,
} from '../services/vacanteOperativaFuturaService'

function formatDate(value: string | null) {
  if (!value) {
    return 'Sin fecha'
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(`${value}T12:00:00Z`))
}

function formatVacancyType(value: VacanteOperativaFuturaListItem['tipoVacante']) {
  return value === 'VACANTE_ACTUAL_POR_BAJA' ? 'Vacante actual por baja' : 'Vacante futura por movimiento cancelado'
}

function vacancyTypeTone(value: VacanteOperativaFuturaListItem['tipoVacante']) {
  return value === 'VACANTE_ACTUAL_POR_BAJA'
    ? 'bg-rose-100 text-rose-700'
    : 'bg-sky-100 text-sky-700'
}

function statusTone(value: VacanteOperativaFuturaListItem['estadoSeguimiento']) {
  switch (value) {
    case 'NUEVA':
      return 'bg-amber-100 text-amber-700'
    case 'EN_REVISION':
      return 'bg-sky-100 text-sky-700'
    case 'EN_REASIGNACION':
      return 'bg-violet-100 text-violet-700'
    case 'RESUELTA':
      return 'bg-emerald-100 text-emerald-700'
    default:
      return 'bg-slate-200 text-slate-700'
  }
}

function buildMovementLabel(item: VacanteOperativaFuturaListItem) {
  if (!item.asignacionCanceladaId) {
    return item.tipoVacante === 'VACANTE_ACTUAL_POR_BAJA'
      ? 'La baja libera el PDV actual desde la fecha efectiva.'
      : 'Sin movimiento cancelado vinculado.'
  }

  return [
    `Movimiento cancelado desde ${formatDate(item.movimientoCanceladoFechaInicio)}`,
    item.movimientoCanceladoFechaFin ? `hasta ${formatDate(item.movimientoCanceladoFechaFin)}` : 'sin fecha fin',
    item.movimientoCanceladoMotivo ? `· ${item.movimientoCanceladoMotivo}` : null,
  ]
    .filter(Boolean)
    .join(' ')
}

function SubmitActionButton({ label }: { label: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" variant="outline" isLoading={pending}>
      {pending ? 'Guardando...' : label}
    </Button>
  )
}

function VacanteSeguimientoForm({
  item,
}: {
  item: VacanteOperativaFuturaListItem
}) {
  const router = useRouter()
  const [state, action] = useActionState(
    actualizarEstadoVacanteOperativaFutura,
    ESTADO_ACTUALIZACION_VACANTE_OPERATIVA_INICIAL
  )

  useEffect(() => {
    if (state.ok) {
      router.refresh()
    }
  }, [router, state.ok])

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="vacante_id" value={item.id} />
      <Select
        name="estado_seguimiento"
        label="Seguimiento"
        defaultValue={item.estadoSeguimiento}
        options={[
          { value: 'NUEVA', label: 'Nueva' },
          { value: 'EN_REVISION', label: 'En revisión' },
          { value: 'EN_REASIGNACION', label: 'En reasignación' },
          { value: 'RESUELTA', label: 'Resuelta' },
          { value: 'DESCARTADA', label: 'Descartada' },
        ]}
      />
      <div className="flex items-center gap-3">
        <SubmitActionButton label="Marcar seguimiento" />
      </div>
      {state.message ? (
        <p className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>
      ) : null}
    </form>
  )
}

export function VacantesFuturasBoard({
  data,
  selectedVacancyId,
  detailHrefBuilder,
  reassignmentHrefBuilder,
  showAssignmentsShortcut = false,
}: {
  data: VacantesOperativasFuturasData | null
  selectedVacancyId?: string | null
  detailHrefBuilder: (item: VacanteOperativaFuturaListItem) => string
  reassignmentHrefBuilder: (item: VacanteOperativaFuturaListItem) => string
  showAssignmentsShortcut?: boolean
}) {
  if (!data) {
    return (
      <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-5 py-8 text-sm text-slate-500">
        La bandeja de vacantes futuras aún no está disponible.
      </div>
    )
  }

  const summaryCards = [
    { label: 'Total', value: data.summary.total, tone: 'bg-white' },
    { label: 'Nuevas', value: data.summary.nuevas, tone: 'bg-amber-50' },
    { label: 'En revisión', value: data.summary.enRevision, tone: 'bg-sky-50' },
    { label: 'En reasignación', value: data.summary.enReasignacion, tone: 'bg-violet-50' },
    { label: 'Actuales', value: data.summary.vacantesActuales, tone: 'bg-rose-50' },
    { label: 'Futuras', value: data.summary.vacantesFuturas, tone: 'bg-emerald-50' },
  ]

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {summaryCards.map((card) => (
          <Card key={card.label} className={`rounded-[24px] border border-slate-200 p-4 ${card.tone}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{card.label}</p>
            <p className="mt-3 text-2xl font-semibold text-slate-950">{card.value}</p>
          </Card>
        ))}
      </div>

      {data.items.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-5 py-8 text-sm text-slate-500">
          No hay vacantes derivadas de bajas por atender en este momento.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.items.map((item) => {
            const selected = selectedVacancyId === item.id

            return (
              <Card
                key={item.id}
                id={`vacante-${item.id}`}
                className={`rounded-[28px] border p-5 shadow-[0_12px_28px_rgba(15,23,42,0.08)] ${
                  selected
                    ? 'border-[var(--module-primary)] bg-[var(--module-soft-bg)]'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${vacancyTypeTone(item.tipoVacante)}`}>
                        {formatVacancyType(item.tipoVacante)}
                      </span>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusTone(item.estadoSeguimiento)}`}>
                        {item.estadoSeguimiento.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-950">
                        {item.pdvNombre ?? 'PDV sin nombre'}{' '}
                        <span className="text-slate-400">· {item.pdvClaveBtl ?? item.pdvId}</span>
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {[item.cadena, item.ciudad, item.zona].filter(Boolean).join(' · ') || 'Sin ubicación operativa'}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <p>
                      <span className="font-semibold text-slate-900">Vacante desde:</span> {formatDate(item.fechaVacanteDesde)}
                    </p>
                    <p className="mt-1">
                      <span className="font-semibold text-slate-900">Baja efectiva:</span> {formatDate(item.fechaBajaEfectiva)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="space-y-3 text-sm text-slate-600">
                    <p>
                      <span className="font-semibold text-slate-900">Empleado origen:</span>{' '}
                      {item.empleadoOrigenNombre ?? item.empleadoOrigenId}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-900">Motivo:</span>{' '}
                      {item.motivo ?? 'Sin motivo especificado'}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-900">Movimiento cancelado:</span>{' '}
                      {buildMovementLabel(item)}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-900">Acción recomendada:</span>{' '}
                      {item.accionRecomendada ?? 'Abrir reasignación y coordinar cobertura.'}
                    </p>
                    {showAssignmentsShortcut ? (
                      <p className="text-xs text-slate-500">
                        La acción operativa principal vive en Asignaciones y este espejo ayuda a coordinar cobertura con Reclutamiento.
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                    <VacanteSeguimientoForm item={item} />
                    <div className="flex flex-wrap gap-3">
                      <Link
                        href={detailHrefBuilder(item)}
                        className="inline-flex min-h-11 items-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Ver detalle
                      </Link>
                      <Link
                        href={reassignmentHrefBuilder(item)}
                        className="inline-flex min-h-11 items-center rounded-[16px] bg-[var(--module-primary)] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_var(--module-shadow)] transition hover:bg-[var(--module-hover)]"
                      >
                        Abrir reasignación
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
