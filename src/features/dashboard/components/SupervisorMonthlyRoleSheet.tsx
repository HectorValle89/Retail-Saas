'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type {
  SupervisorMonthlyPdvCalendar,
  SupervisorMonthlyPdvRow,
  SupervisorMonthlyPdvStoreType,
} from '@/features/dashboard/services/supervisorMonthlyRoleService'

interface SupervisorMonthlyRoleSheetProps {
  open: boolean
}

function currentMonthValue() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value ?? new Date().toISOString().slice(0, 4)
  const month = parts.find((part) => part.type === 'month')?.value ?? new Date().toISOString().slice(5, 7)
  return `${year}-${month}`
}

function shiftMonth(month: string, delta: number) {
  const date = new Date(`${month}-01T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + delta, 1)
  return date.toISOString().slice(0, 7)
}

function formatMonthLabel(month: string) {
  return new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T12:00:00Z`))
}

function formatDayLabel(dateIso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${dateIso}T12:00:00Z`))
}

function compactEmployeeName(name: string | null) {
  if (!name) {
    return 'Sin DC'
  }

  const normalized = name.trim().split(/\s+/)
  if (normalized.length <= 2) {
    return name
  }

  return `${normalized[0]} ${normalized[1]}`
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function PdvMonthlyRoleTable({
  title,
  subtitle,
  rows,
  days,
}: {
  title: string
  subtitle?: string
  rows: SupervisorMonthlyPdvRow[]
  days: string[]
}) {
  if (rows.length === 0) {
    return null
  }

  return (
    <section className="space-y-3 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
          {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          {rows.length} PDV{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-max rounded-[18px] border border-slate-200 bg-white">
          <div className="grid border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500" style={{ gridTemplateColumns: `240px repeat(${days.length}, minmax(74px, 74px))` }}>
            <div className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-3 py-3">PDV</div>
            {days.map((day) => (
              <div key={day} className="border-r border-slate-200 px-2 py-3 text-center last:border-r-0">
                {formatDayLabel(day)}
              </div>
            ))}
          </div>
          {rows.map((row) => (
            <div
              key={row.pdvId}
              className="grid border-b border-slate-100 last:border-b-0"
              style={{ gridTemplateColumns: `240px repeat(${days.length}, minmax(74px, 74px))` }}
            >
              <div className="sticky left-0 z-10 border-r border-slate-100 bg-white px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-950">{row.pdvNombre}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      row.clasificacionMaestra === 'ROTATIVO'
                        ? 'bg-sky-100 text-sky-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {row.clasificacionMaestra === 'ROTATIVO' ? 'Rotativo' : 'Fijo'}
                  </span>
                  {row.grupoRotacionCodigo ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {row.grupoRotacionCodigo}
                      {row.slotRotacion ? ` · ${row.slotRotacion}` : ''}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{row.pdvClaveBtl}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {[row.cadena, row.zona].filter(Boolean).join(' · ') || 'Sin clasificacion visible'}
                </p>
              </div>
              {row.days.map((day) => (
                <div key={`${row.pdvId}-${day.fecha}`} className="border-r border-slate-100 px-2 py-2 text-center last:border-r-0">
                  <div
                    className={`min-h-[48px] rounded-[12px] border px-1.5 py-1 text-[11px] leading-4 ${
                      day.empleadoId
                        ? 'border-emerald-100 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                    title={day.empleadoNombre ?? 'Sin DC'}
                  >
                    <p className="font-medium">{compactEmployeeName(day.empleadoNombre)}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.12em] opacity-70">{day.origen}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function SupervisorMonthlyRoleSheet({ open }: SupervisorMonthlyRoleSheetProps) {
  const [month, setMonth] = useState(currentMonthValue)
  const [cadenaCodigo, setCadenaCodigo] = useState('')
  const [storeType, setStoreType] = useState<'TODOS' | SupervisorMonthlyPdvStoreType>('TODOS')
  const [data, setData] = useState<SupervisorMonthlyPdvCalendar | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const controller = new AbortController()
    const params = new URLSearchParams({ month })
    if (cadenaCodigo) {
      params.set('cadena', cadenaCodigo)
    }
    if (storeType !== 'TODOS') {
      params.set('storeType', storeType)
    }

    setLoading(true)
    setError(null)

    fetch(`/api/dashboard/supervisor-monthly-role?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error ?? 'No fue posible cargar el rol mensual.')
        }
        return (await response.json()) as { calendar: SupervisorMonthlyPdvCalendar }
      })
      .then((payload) => {
        setData(payload.calendar)
      })
      .catch((fetchError) => {
        if (controller.signal.aborted) {
          return
        }
        setError(fetchError instanceof Error ? fetchError.message : 'No fue posible cargar el rol mensual.')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [open, month, cadenaCodigo, storeType])

  const fixedRows = useMemo(
    () => (data?.rows ?? []).filter((row) => row.clasificacionMaestra !== 'ROTATIVO'),
    [data]
  )

  const rotationalGroups = useMemo(() => {
    const buckets = new Map<string, SupervisorMonthlyPdvRow[]>()
    for (const row of data?.rows ?? []) {
      if (row.clasificacionMaestra !== 'ROTATIVO') {
        continue
      }
      const key = row.grupoRotacionCodigo ?? 'ROTACION-SIN-GRUPO'
      const current = buckets.get(key) ?? []
      current.push(row)
      buckets.set(key, current)
    }
    return Array.from(buckets.entries())
  }, [data])

  return (
    <div className="space-y-5">
      <div className="rounded-[22px] border border-[var(--module-border)] bg-[var(--module-soft-bg)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">Rol mensual</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Tus PDVs fijos y rotativos del mes</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Consulta solo tus PDVs ordenados por tipo y grupo rotativo. Cada celda muestra la DC asignada por dia sin abrir el calendario general de asignaciones.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setMonth((current) => shiftMonth(current, -1))} className="min-h-10 rounded-[14px] px-3 py-2 text-xs font-semibold">
              Mes anterior
            </Button>
            <Button type="button" variant="outline" onClick={() => setMonth((current) => shiftMonth(current, 1))} className="min-h-10 rounded-[14px] px-3 py-2 text-xs font-semibold">
              Mes siguiente
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(160px,180px)_minmax(160px,220px)_minmax(160px,220px)_1fr]">
          <label className="space-y-1 text-sm text-slate-600">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Mes</span>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-11 w-full rounded-[14px] border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[var(--module-primary)]"
            />
          </label>
          <label className="space-y-1 text-sm text-slate-600">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Cadena</span>
            <select
              value={cadenaCodigo}
              onChange={(event) => setCadenaCodigo(event.target.value)}
              className="h-11 w-full rounded-[14px] border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[var(--module-primary)]"
            >
              <option value="">Todas</option>
              {(data?.cadenasDisponibles ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm text-slate-600">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Tipo de PDV</span>
            <select
              value={storeType}
              onChange={(event) => setStoreType(event.target.value as 'TODOS' | SupervisorMonthlyPdvStoreType)}
              className="h-11 w-full rounded-[14px] border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[var(--module-primary)]"
            >
              <option value="TODOS">Todos</option>
              <option value="FIJO">Fijos</option>
              <option value="ROTATIVO">Rotativos</option>
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <MetricPill label="Mes visible" value={formatMonthLabel(month)} />
            <MetricPill label="PDVs visibles" value={String(data?.totalPdvs ?? 0)} />
            <MetricPill label="Sin DC" value={String(data?.pdvsSinDcVisible ?? 0)} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          Cargando rol mensual del supervisor...
        </div>
      ) : error ? (
        <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
          {error}
        </div>
      ) : data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricPill label="PDVs fijos" value={String(data.totalFijos)} />
            <MetricPill label="PDVs rotativos" value={String(data.totalRotativos)} />
            <MetricPill label="Dias del mes" value={String(data.dias.length)} />
            <MetricPill label="Cobertura sin DC" value={String(data.pdvsSinDcVisible)} />
          </div>

          {data.rows.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              No hay PDVs visibles para los filtros seleccionados.
            </div>
          ) : (
            <>
              <PdvMonthlyRoleTable
                title="PDVs fijos"
                subtitle="Ordenados y visibles solo para el supervisor autenticado."
                rows={fixedRows}
                days={data.dias}
              />
              {rotationalGroups.map(([groupCode, rows]) => (
                <PdvMonthlyRoleTable
                  key={groupCode}
                  title={groupCode === 'ROTACION-SIN-GRUPO' ? 'Rotativos sin grupo visible' : groupCode}
                  subtitle="Pareja o trio rotativo ordenado por slot."
                  rows={rows}
                  days={data.dias}
                />
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}