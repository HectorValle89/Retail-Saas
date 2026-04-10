'use client'

import Link from 'next/link'
import { useActionState, useMemo, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EvidencePreview } from '@/components/ui/evidence-preview'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import { ExtemporaneoQueueSection } from '@/features/solicitudes/components/ExtemporaneoQueueSection'
import {
  getSingleTenantAccountLabel,
  isSingleTenantUiEnabled,
  resolveSingleTenantAccountOption,
} from '@/lib/tenant/singleTenant'
import { asignarQrDisponibleLoveIsdin, registrarCargaMasivaQrIncremental } from '../actions'
import { ESTADO_LOVE_ISDIN_INICIAL } from '../state'
import type {
  LoveAggregateItem,
  LoveIsdinListadoItem,
  LoveIsdinPanelData,
  LoveKpiDatasetItem,
  LoveQrImportLotItem,
} from '../services/loveIsdinService'

type LoveSection = 'kpis' | 'inventario' | 'carga'
type LoveRange = 'hoy' | 'semana' | 'mes'

function getMexicoDateIso(value: string | Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(typeof value === 'string' ? new Date(value) : value)
}

function getTodayMexicoIso() {
  return getMexicoDateIso(new Date())
}

function getWeekStartIso(dayIso: string) {
  const [year, month, day] = dayIso.split('-').map((value) => Number.parseInt(value, 10))
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - weekday + 1)
  return date.toISOString().slice(0, 10)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('es-MX').format(value)
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    month: 'short',
    day: '2-digit',
  }).format(new Date(`${value}T12:00:00`))
}

function formatDateTimeLabel(value: string | null) {
  if (!value) {
    return 'Sin registro'
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatWeekBucket(value: string) {
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10))
  const start = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)

  return `${new Intl.DateTimeFormat('es-MX', {
    month: 'short',
    day: '2-digit',
  }).format(start)} - ${new Intl.DateTimeFormat('es-MX', {
    month: 'short',
    day: '2-digit',
  }).format(end)}`
}

function buildPageHref(page: number, pageSize: number) {
  return `/love-isdin?page=${page}&pageSize=${pageSize}`
}

function chartWidth(value: number, max: number) {
  if (max <= 0) {
    return '0%'
  }

  const percent = Math.round((value / max) * 100)
  return `${Math.max(percent, value > 0 ? 8 : 0)}%`
}

function toUniqueOptions(items: Array<{ id: string | null; label: string | null }>) {
  const map = new Map<string, string>()

  for (const item of items) {
    if (!item.id || !item.label) {
      continue
    }

    if (!map.has(item.id)) {
      map.set(item.id, item.label)
    }
  }

  return Array.from(map.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((left, right) => left.label.localeCompare(right.label, 'es-MX'))
}

function aggregateDataset(
  dataset: LoveKpiDatasetItem[],
  selector: (item: LoveKpiDatasetItem) => { id: string; label: string; helper?: string | null }
) {
  const map = new Map<string, LoveAggregateItem>()

  for (const item of dataset) {
    const target = selector(item)
    const existing =
      map.get(target.id) ??
      ({
        id: target.id,
        label: target.label,
        helper: target.helper ?? null,
        total: 0,
        objetivo: 0,
        validas: 0,
        pendientes: 0,
        rechazadas: 0,
        duplicadas: 0,
      } satisfies LoveAggregateItem)

    existing.total += item.total
    existing.objetivo += item.objetivo
    existing.validas += item.validas
    existing.pendientes += item.pendientes
    existing.rechazadas += item.rechazadas
    existing.duplicadas += item.duplicadas
    map.set(target.id, existing)
  }

  return Array.from(map.values()).sort((left, right) => {
    if (right.total !== left.total) {
      return right.total - left.total
    }

    return left.label.localeCompare(right.label, 'es-MX')
  })
}

function aggregateTimeline(
  dataset: LoveKpiDatasetItem[],
  selector: (item: LoveKpiDatasetItem) => string
) {
  const map = new Map<
    string,
    {
      bucket: string
      total: number
      objetivo: number
      validas: number
      pendientes: number
      rechazadas: number
      duplicadas: number
    }
  >()

  for (const item of dataset) {
    const bucket = selector(item)
    const existing =
      map.get(bucket) ??
      {
        bucket,
        total: 0,
        objetivo: 0,
        validas: 0,
        pendientes: 0,
        rechazadas: 0,
        duplicadas: 0,
      }

    existing.total += item.total
    existing.objetivo += item.objetivo
    existing.validas += item.validas
    existing.pendientes += item.pendientes
    existing.rechazadas += item.rechazadas
    existing.duplicadas += item.duplicadas
    map.set(bucket, existing)
  }

  return Array.from(map.values()).sort((left, right) => left.bucket.localeCompare(right.bucket, 'es-MX'))
}

function filterAffiliaciones(
  afiliaciones: LoveIsdinListadoItem[],
  filters: {
    pdvId: string
    empleadoId: string
    supervisorId: string
    zona: string
    cadena: string
  },
  supervisorByEmployeeId: Map<string, string | null>,
  range: LoveRange,
  todayIso: string,
  weekStartIso: string
) {
  return afiliaciones.filter((item) => {
    const dayIso = getMexicoDateIso(item.fechaUtc)
    const itemWeek = getWeekStartIso(dayIso)
    const supervisorId = supervisorByEmployeeId.get(item.empleadoId) ?? null

    if (range === 'hoy' && dayIso !== todayIso) {
      return false
    }

    if (range === 'semana' && itemWeek !== weekStartIso) {
      return false
    }

    if (filters.pdvId && item.pdvId !== filters.pdvId) {
      return false
    }

    if (filters.empleadoId && item.empleadoId !== filters.empleadoId) {
      return false
    }

    if (filters.supervisorId && supervisorId !== filters.supervisorId) {
      return false
    }

    if (filters.zona && (item.zona ?? 'Sin zona') !== filters.zona) {
      return false
    }

    if (filters.cadena && (item.cadena ?? 'Sin cadena') !== filters.cadena) {
      return false
    }

    return true
  })
}

function buildImportTone(state: LoveQrImportLotItem['estado']) {
  switch (state) {
    case 'CONFIRMADO':
      return 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
    case 'CANCELADO':
      return 'bg-rose-100 text-rose-800 ring-1 ring-rose-200'
    default:
      return 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
  }
}

function buildQrTone(state: 'DISPONIBLE' | 'ACTIVO' | 'BLOQUEADO' | 'BAJA') {
  switch (state) {
    case 'ACTIVO':
      return 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
    case 'DISPONIBLE':
      return 'bg-sky-100 text-sky-800 ring-1 ring-sky-200'
    case 'BLOQUEADO':
      return 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
    case 'BAJA':
      return 'bg-slate-200 text-slate-700 ring-1 ring-slate-300'
    default:
      return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
  }
}

function fieldClassName() {
  return 'w-full rounded-[14px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]'
}

export function LoveIsdinPanel({ data }: { data: LoveIsdinPanelData }) {
  const [activeSection, setActiveSection] = useState<LoveSection>('kpis')
  const [range, setRange] = useState<LoveRange>('mes')
  const [selectedPdvId, setSelectedPdvId] = useState('')
  const [selectedEmpleadoId, setSelectedEmpleadoId] = useState('')
  const [selectedSupervisorId, setSelectedSupervisorId] = useState('')
  const [selectedZona, setSelectedZona] = useState('')
  const [selectedCadena, setSelectedCadena] = useState('')
  const [inventorySearch, setInventorySearch] = useState('')
  const [inventoryStatus, setInventoryStatus] = useState('')
  const [uploadState, uploadAction] = useActionState(
    registrarCargaMasivaQrIncremental,
    ESTADO_LOVE_ISDIN_INICIAL
  )
  const [assignState, assignAction] = useActionState(
    asignarQrDisponibleLoveIsdin,
    ESTADO_LOVE_ISDIN_INICIAL
  )

  const todayIso = useMemo(() => getTodayMexicoIso(), [])
  const weekStartIso = useMemo(() => getWeekStartIso(todayIso), [todayIso])

  const supervisorByEmployeeId = useMemo(() => {
    const map = new Map<string, string | null>()

    for (const item of data.kpiDataset) {
      if (!map.has(item.empleadoId)) {
        map.set(item.empleadoId, item.supervisorId)
      }
    }

    return map
  }, [data.kpiDataset])

  const supervisorOptions = useMemo(
    () =>
      toUniqueOptions(
        data.kpiDataset.map((item) => ({
          id: item.supervisorId,
          label: item.supervisorLabel,
        }))
      ),
    [data.kpiDataset]
  )

  const zonaOptions = useMemo(
    () =>
      Array.from(new Set(data.kpiDataset.map((item) => item.zona)))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, 'es-MX'))
        .map((value) => ({ id: value, label: value })),
    [data.kpiDataset]
  )

  const cadenaOptions = useMemo(
    () =>
      Array.from(new Set(data.kpiDataset.map((item) => item.cadena)))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, 'es-MX'))
        .map((value) => ({ id: value, label: value })),
    [data.kpiDataset]
  )

  const filteredDataset = useMemo(() => {
    return data.kpiDataset.filter((item) => {
      if (range === 'hoy' && item.fechaOperacion !== todayIso) {
        return false
      }

      if (range === 'semana' && item.weekBucket !== weekStartIso) {
        return false
      }

      if (selectedPdvId && item.pdvId !== selectedPdvId) {
        return false
      }

      if (selectedEmpleadoId && item.empleadoId !== selectedEmpleadoId) {
        return false
      }

      if (selectedSupervisorId && item.supervisorId !== selectedSupervisorId) {
        return false
      }

      if (selectedZona && item.zona !== selectedZona) {
        return false
      }

      if (selectedCadena && item.cadena !== selectedCadena) {
        return false
      }

      return true
    })
  }, [
    data.kpiDataset,
    range,
    selectedCadena,
    selectedEmpleadoId,
    selectedPdvId,
    selectedSupervisorId,
    selectedZona,
    todayIso,
    weekStartIso,
  ])

  const filteredKpi = useMemo(() => {
    return filteredDataset.reduce(
      (acc, item) => {
        acc.total += item.total
        acc.objetivo += item.objetivo
        acc.validas += item.validas
        acc.pendientes += item.pendientes
        acc.rechazadas += item.rechazadas
        acc.duplicadas += item.duplicadas
        return acc
      },
      { total: 0, objetivo: 0, validas: 0, pendientes: 0, rechazadas: 0, duplicadas: 0 }
    )
  }, [filteredDataset])
  const filteredQuota = useMemo(() => {
    if (filteredKpi.objetivo <= 0) {
      return {
        cumplimientoPct: 0,
        restante: 0,
      }
    }

    return {
      cumplimientoPct: Math.round((filteredKpi.total / filteredKpi.objetivo) * 10000) / 100,
      restante: Math.max(filteredKpi.objetivo - filteredKpi.total, 0),
    }
  }, [filteredKpi])

  const afiliacionesFiltradas = useMemo(
    () =>
      filterAffiliaciones(
        data.afiliaciones,
        {
          pdvId: selectedPdvId,
          empleadoId: selectedEmpleadoId,
          supervisorId: selectedSupervisorId,
          zona: selectedZona,
          cadena: selectedCadena,
        },
        supervisorByEmployeeId,
        range,
        todayIso,
        weekStartIso
      ),
    [
      data.afiliaciones,
      range,
      selectedCadena,
      selectedEmpleadoId,
      selectedPdvId,
      selectedSupervisorId,
      selectedZona,
      supervisorByEmployeeId,
      todayIso,
      weekStartIso,
    ]
  )

  const charts = useMemo(
    () => ({
      porPdv: aggregateDataset(filteredDataset, (item) => ({
        id: item.pdvId,
        label: item.pdvLabel,
        helper: item.cadena,
      })),
      porDc: aggregateDataset(filteredDataset, (item) => ({
        id: item.empleadoId,
        label: item.empleadoLabel,
        helper: item.zona,
      })),
      porSupervisor: aggregateDataset(filteredDataset, (item) => ({
        id: item.supervisorId ?? 'sin-supervisor',
        label: item.supervisorLabel,
        helper: item.zona,
      })),
      porZona: aggregateDataset(filteredDataset, (item) => ({
        id: item.zona,
        label: item.zona,
        helper: null,
      })),
      porCadena: aggregateDataset(filteredDataset, (item) => ({
        id: item.cadena,
        label: item.cadena,
        helper: null,
      })),
      diaria: aggregateTimeline(filteredDataset, (item) => item.fechaOperacion),
      semanal: aggregateTimeline(filteredDataset, (item) => item.weekBucket),
    }),
    [filteredDataset]
  )

  const filteredInventory = useMemo(() => {
    const needle = inventorySearch.trim().toLowerCase()

    return data.qrInventario.filter((item) => {
      if (inventoryStatus && item.estado !== inventoryStatus) {
        return false
      }

      if (!needle) {
        return true
      }

      return [
        item.codigo,
        item.empleado ?? '',
        item.idNomina ?? '',
        item.supervisor ?? '',
        item.zona ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [data.qrInventario, inventorySearch, inventoryStatus])

  const availableQrOptions = useMemo(
    () =>
      data.qrInventario
        .filter((item) => item.estado === 'DISPONIBLE')
        .map((item) => ({
          id: item.qrCodigoId,
          label: item.codigo,
        })),
    [data.qrInventario]
  )

  const fixedAccount = resolveSingleTenantAccountOption(data.cuentas)
  const useSingleTenantUi = isSingleTenantUiEnabled() && Boolean(fixedAccount)
  const defaultAccountId = fixedAccount?.id ?? data.cuentas[0]?.id ?? ''

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && (
        <Card className="bg-amber-50 text-amber-950 ring-1 ring-amber-200">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
            Infraestructura pendiente
          </p>
          <p className="mt-3 text-sm leading-6">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-border/70 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--module-text)]">
                Control LOVE ISDIN
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">{data.scopeLabel}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                El QR identifica a la dermoconsejera, pero la afiliacion se registra y se reporta por el
                PDV real donde ocurrio. El modulo se divide en KPIs, inventario QR y carga masiva
                incremental para mantener la operacion mas clara.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Afiliaciones hoy" value={formatNumber(data.afiliacionesKpi.hoy)} tone="rose" />
              <MetricCard label="Afiliaciones semana" value={formatNumber(data.afiliacionesKpi.semana)} tone="sky" />
              <MetricCard label="QR activos" value={formatNumber(data.qrResumen.activos)} tone="emerald" />
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="flex flex-wrap gap-3">
            <SectionButton
              active={activeSection === 'kpis'}
              onClick={() => setActiveSection('kpis')}
              label="KPIs"
              helper="Afiliaciones, tendencias y rankings"
            />
            <SectionButton
              active={activeSection === 'inventario'}
              onClick={() => setActiveSection('inventario')}
              label="Inventario"
              helper="QR activos, disponibles y cobertura"
            />
            <SectionButton
              active={activeSection === 'carga'}
              onClick={() => setActiveSection('carga')}
              label="Carga masiva"
              helper="Manifiesto incremental y ZIP de imagenes"
            />
          </div>
        </div>
      </Card>

      {activeSection === 'kpis' && (
        <section className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Filtros del tablero</CardTitle>
              <CardDescription>
                Estos filtros afectan todas las tarjetas y graficas del bloque de KPIs para leer el
                programa por PDV, dermoconsejera, supervisor, zona, cadena y corte temporal.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-3">
                <RangeButton active={range === 'hoy'} onClick={() => setRange('hoy')}>
                  Hoy
                </RangeButton>
                <RangeButton active={range === 'semana'} onClick={() => setRange('semana')}>
                  Semana
                </RangeButton>
                <RangeButton active={range === 'mes'} onClick={() => setRange('mes')}>
                  Mes
                </RangeButton>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <FilterField label="PDV">
                  <select
                    className={fieldClassName()}
                    value={selectedPdvId}
                    onChange={(event) => setSelectedPdvId(event.target.value)}
                  >
                    <option value="">Todos los PDV</option>
                    {data.pdvs.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </FilterField>

                <FilterField label="Dermoconsejera">
                  <select
                    className={fieldClassName()}
                    value={selectedEmpleadoId}
                    onChange={(event) => setSelectedEmpleadoId(event.target.value)}
                  >
                    <option value="">Todas las DC</option>
                    {data.empleados.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </FilterField>

                <FilterField label="Supervisor">
                  <select
                    className={fieldClassName()}
                    value={selectedSupervisorId}
                    onChange={(event) => setSelectedSupervisorId(event.target.value)}
                  >
                    <option value="">Todos los supervisores</option>
                    {supervisorOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </FilterField>

                <FilterField label="Zona">
                  <select
                    className={fieldClassName()}
                    value={selectedZona}
                    onChange={(event) => setSelectedZona(event.target.value)}
                  >
                    <option value="">Todas las zonas</option>
                    {zonaOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </FilterField>

                <FilterField label="Cadena">
                  <select
                    className={fieldClassName()}
                    value={selectedCadena}
                    onChange={(event) => setSelectedCadena(event.target.value)}
                  >
                    <option value="">Todas las cadenas</option>
                    {cadenaOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </FilterField>
              </div>
            </CardContent>
          </Card>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Afiliaciones" value={formatNumber(filteredKpi.total)} tone="rose" />
            <MetricCard label="Meta" value={formatNumber(filteredKpi.objetivo)} tone="sky" />
            <MetricCard label="Cumplimiento" value={`${filteredQuota.cumplimientoPct.toFixed(2)}%`} tone="emerald" />
            <MetricCard label="Pendiente" value={formatNumber(filteredQuota.restante)} tone="amber" />
            <MetricCard label="Validas" value={formatNumber(filteredKpi.validas)} tone="slate" />
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <KpiBarChartCard
              title="Afiliaciones por PDV"
              description="Acumulado del corte filtrado por punto de venta."
              items={charts.porPdv}
              emptyLabel="Sin afiliaciones acumuladas para este corte."
            />
            <KpiBarChartCard
              title="Afiliaciones por dermoconsejera"
              description="Cuantas afiliaciones esta generando cada DC en el corte actual."
              items={charts.porDc}
              emptyLabel="Sin afiliaciones acumuladas para este corte."
            />
            <KpiBarChartCard
              title="Acumulado por supervisor"
              description="Consolida el resultado operativo del equipo por supervisora."
              items={charts.porSupervisor}
              emptyLabel="Sin afiliaciones acumuladas para este corte."
            />
            <KpiBarChartCard
              title="Acumulado por zona"
              description="Lectura regional para seguimiento comercial y operativo."
              items={charts.porZona}
              emptyLabel="Sin afiliaciones acumuladas para este corte."
            />
            <KpiBarChartCard
              title="Acumulado por cadena"
              description="Visibilidad por cadena para lectura del cliente."
              items={charts.porCadena}
              emptyLabel="Sin afiliaciones acumuladas para este corte."
            />
            <TimelineChartCard
              title="Tendencia diaria"
              description="Evolucion diaria de afiliaciones dentro del corte filtrado."
              items={charts.diaria}
              kind="day"
              emptyLabel="Sin afiliaciones del periodo para graficar."
            />
            <div className="xl:col-span-2">
              <TimelineChartCard
                title="Tendencia semanal"
                description="Agrupacion semanal para visualizar aceleracion o caida de la afiliacion."
                items={charts.semanal}
                kind="week"
                emptyLabel="Sin afiliaciones semanales acumuladas para este periodo."
              />
            </div>
          </section>

          <Card className="overflow-hidden p-0">
            <CardHeader className="border-b border-border/70 px-6 py-5">
              <CardTitle>Afiliaciones recientes del corte</CardTitle>
              <CardDescription>
                Registros recientes filtrados por la misma lectura del tablero. El QR queda como traza
                operativa, pero el hecho se consolida por PDV.
              </CardDescription>
            </CardHeader>

            <CardContent className="px-0 py-0">
              {afiliacionesFiltradas.length === 0 ? (
                <StateMessage label="Sin afiliaciones visibles con los filtros aplicados." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                      <tr>
                        <th className="px-6 py-4">Fecha</th>
                        <th className="px-6 py-4">PDV</th>
                        <th className="px-6 py-4">Dermoconsejera</th>
                        <th className="px-6 py-4">QR</th>
                        <th className="px-6 py-4">Estatus</th>
                        <th className="px-6 py-4">Evidencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {afiliacionesFiltradas.slice(0, 20).map((item) => (
                        <tr key={item.id} className="border-t border-border/60">
                          <td className="px-6 py-4 text-slate-600">{formatDateTimeLabel(item.fechaUtc)}</td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-950">{item.pdvNombre ?? 'Sin PDV'}</div>
                            <div className="text-xs text-slate-500">
                              {[item.pdvClaveBtl, item.cadena].filter(Boolean).join(' · ')}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-950">{item.empleado}</div>
                            <div className="text-xs text-slate-500">
                              {[item.idNomina ? `Nomina ${item.idNomina}` : null, item.zona].filter(Boolean).join(' · ')}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-600">{item.qrPersonal ?? 'Sin QR snapshot'}</td>
                          <td className="px-6 py-4">
                            <StatusPill value={item.estatus} />
                          </td>
                          <td className="px-6 py-4">
                            <EvidencePreview
                              url={item.evidenciaUrl}
                              label={`Evidencia ${item.afiliadoNombre}`}
                              emptyLabel="Sin evidencia"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-col gap-4 border-t border-border/60 px-6 py-4 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
                <p>
                  Mostrando {data.afiliaciones.length} de {formatNumber(data.paginacion.totalItems)} afiliaciones
                  visibles en el listado principal.
                </p>
                <div className="flex items-center gap-3">
                  <Link
                    className={`rounded-[12px] border px-4 py-2 ${
                      data.paginacion.page <= 1
                        ? 'pointer-events-none border-slate-200 text-slate-300'
                        : 'border-border text-slate-700 hover:bg-slate-50'
                    }`}
                    href={buildPageHref(Math.max(1, data.paginacion.page - 1), data.paginacion.pageSize)}
                  >
                    Anterior
                  </Link>
                  <span>
                    Pagina {data.paginacion.page} de {data.paginacion.totalPages}
                  </span>
                  <Link
                    className={`rounded-[12px] border px-4 py-2 ${
                      data.paginacion.page >= data.paginacion.totalPages
                        ? 'pointer-events-none border-slate-200 text-slate-300'
                        : 'border-border text-slate-700 hover:bg-slate-50'
                    }`}
                    href={buildPageHref(
                      Math.min(data.paginacion.totalPages, data.paginacion.page + 1),
                      data.paginacion.pageSize
                    )}
                  >
                    Siguiente
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          <ExtemporaneoQueueSection
            title="LOVE tardio"
            description="Afiliaciones registradas fuera de ventana pendientes de aprobacion o ya consolidadas en LOVE ISDIN."
            emptyMessage="Todavia no hay afiliaciones LOVE tardias visibles para esta cuenta."
            resumen={data.resumenExtemporaneo}
            registros={data.registrosExtemporaneos}
          />
        </section>
      )}

      {activeSection === 'inventario' && (
        <section className="space-y-6">
          {!data.qrInfraestructuraLista && (
            <Card className="bg-amber-50 text-amber-950 ring-1 ring-amber-200">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
                Inventario QR pendiente
              </p>
              <p className="mt-3 text-sm leading-6">{data.qrMensajeInfraestructura}</p>
            </Card>
          )}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard label="QR activos" value={formatNumber(data.qrResumen.activos)} tone="emerald" />
            <MetricCard label="Disponibles" value={formatNumber(data.qrResumen.disponibles)} tone="sky" />
            <MetricCard label="Bloqueados" value={formatNumber(data.qrResumen.bloqueados)} tone="amber" />
            <MetricCard label="Bajas" value={formatNumber(data.qrResumen.bajas)} tone="slate" />
            <MetricCard label="DC activas con QR" value={formatNumber(data.qrResumen.dcActivasConQr)} tone="rose" />
            <MetricCard label="DC activas sin QR" value={formatNumber(data.qrResumen.dcActivasSinQr)} tone="amber" />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Asignar QR disponible a nueva contratación</CardTitle>
              <CardDescription>
                Este flujo toma un QR que ya subiste como <strong>DISPONIBLE</strong> y lo amarra
                despues a una dermoconsejera activa que todavia no tiene QR oficial en ISDIN.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <form action={assignAction} className="space-y-4">
                {useSingleTenantUi ? (
                  <>
                    <input type="hidden" name="cuenta_cliente_id" value={defaultAccountId} />
                    <FilterField label="Cuenta operativa">
                      <div className={`${fieldClassName()} flex items-center font-medium`}>
                        {getSingleTenantAccountLabel()}
                      </div>
                    </FilterField>
                  </>
                ) : data.cuentas.length > 1 ? (
                  <FilterField label="Cuenta cliente">
                    <select name="cuenta_cliente_id" className={fieldClassName()} defaultValue="">
                      <option value="">Selecciona una cuenta</option>
                      {data.cuentas.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </FilterField>
                ) : (
                  <input type="hidden" name="cuenta_cliente_id" value={defaultAccountId} />
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  <FilterField label="QR disponible">
                    <select
                      name="qr_codigo_id"
                      className={fieldClassName()}
                      defaultValue=""
                      disabled={availableQrOptions.length === 0}
                    >
                      {availableQrOptions.length === 0 ? (
                        <option value="">No hay QR disponibles</option>
                      ) : (
                        <>
                          <option value="">Selecciona un QR disponible</option>
                          {availableQrOptions.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </FilterField>

                  <FilterField label="Dermoconsejera sin QR">
                    <select
                      name="empleado_id"
                      className={fieldClassName()}
                      defaultValue=""
                      disabled={data.dermoconsejerasSinQr.length === 0}
                    >
                      {data.dermoconsejerasSinQr.length === 0 ? (
                        <option value="">No hay DC elegibles</option>
                      ) : (
                        <>
                          <option value="">Selecciona una dermoconsejera</option>
                          {data.dermoconsejerasSinQr.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </FilterField>
                </div>

                <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
                  <FilterField label="Fecha de asignacion">
                    <input
                      type="date"
                      name="fecha_inicio"
                      className={fieldClassName()}
                      defaultValue={todayIso}
                    />
                  </FilterField>

                  <FilterField label="Motivo">
                    <input
                      type="text"
                      name="motivo"
                      className={fieldClassName()}
                      defaultValue="ASIGNACION_NUEVA_CONTRATACION"
                      placeholder="Ej. ASIGNACION_NUEVA_CONTRATACION"
                    />
                  </FilterField>
                </div>

                <FilterField label="Observaciones">
                  <textarea
                    name="observaciones"
                    className={`${fieldClassName()} min-h-24 resize-y`}
                    placeholder="Opcional. Ej. Alta nueva, QR entregado en capacitación inicial."
                  />
                </FilterField>

                <div className="rounded-[18px] border border-[var(--module-border)] bg-[var(--module-soft-bg)] px-4 py-4 text-sm leading-6 text-slate-600">
                  <p className="font-medium text-slate-950">Reglas de esta asignación</p>
                  <ul className="mt-2 space-y-1">
                    <li>- Solo aparecen QR que ya estan en inventario como DISPONIBLE.</li>
                    <li>- Solo aparecen dermoconsejeras activas que hoy no tienen QR oficial activo.</li>
                    <li>- Este flujo no reemplaza QR existentes; para eso usaremos un reemplazo dedicado.</li>
                    <li>- En cuanto se confirma, el dashboard de la DC ya debe mostrar su QR oficial.</li>
                  </ul>
                </div>

                {assignState.message && (
                  <div
                    className={`rounded-[18px] border px-4 py-4 text-sm ${
                      assignState.ok
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-rose-200 bg-rose-50 text-rose-900'
                    }`}
                  >
                    {assignState.message}
                  </div>
                )}

                <AssignSubmitButton
                  disabled={availableQrOptions.length === 0 || data.dermoconsejerasSinQr.length === 0}
                />
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inventario oficial de QR</CardTitle>
              <CardDescription>
                Aqui administramos los codigos que identifican a cada dermoconsejera frente al sistema
                externo de ISDIN. Las afiliaciones siguen contando por PDV, pero el QR debe estar
                correctamente asignado para que la captura sea valida.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-[1fr_260px]">
                <FilterField label="Buscar QR, DC, nomina o supervisor">
                  <input
                    className={fieldClassName()}
                    value={inventorySearch}
                    onChange={(event) => setInventorySearch(event.target.value)}
                    placeholder="Ej. BTL-QR-128, Ana, 594, Supervisora Norte"
                  />
                </FilterField>

                <FilterField label="Estado del QR">
                  <select
                    className={fieldClassName()}
                    value={inventoryStatus}
                    onChange={(event) => setInventoryStatus(event.target.value)}
                  >
                    <option value="">Todos los estados</option>
                    <option value="ACTIVO">Activo</option>
                    <option value="DISPONIBLE">Disponible</option>
                    <option value="BLOQUEADO">Bloqueado</option>
                    <option value="BAJA">Baja</option>
                  </select>
                </FilterField>
              </div>

              {filteredInventory.length === 0 ? (
                <StateMessage label="No hay QR visibles con los filtros actuales." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                      <tr>
                        <th className="px-6 py-4">QR</th>
                        <th className="px-6 py-4">Codigo</th>
                        <th className="px-6 py-4">Estado</th>
                        <th className="px-6 py-4">Dermoconsejera</th>
                        <th className="px-6 py-4">Supervisor</th>
                        <th className="px-6 py-4">Zona</th>
                        <th className="px-6 py-4">Asignado desde</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInventory.map((item) => (
                        <tr key={item.qrCodigoId} className="border-t border-border/60">
                          <td className="px-6 py-4">
                            <EvidencePreview
                              url={item.imageUrl}
                              label={`QR ${item.codigo}`}
                              emptyLabel="Sin imagen"
                            />
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-950">{item.codigo}</td>
                          <td className="px-6 py-4">
                            <QrStatusPill value={item.estado} />
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-950">{item.empleado ?? 'Sin asignar'}</div>
                            <div className="text-xs text-slate-500">
                              {item.idNomina ? `Nomina ${item.idNomina}` : 'Sin nomina'}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-600">{item.supervisor ?? 'Sin supervisor'}</td>
                          <td className="px-6 py-4 text-slate-600">{item.zona ?? 'Sin zona'}</td>
                          <td className="px-6 py-4 text-slate-600">{formatDateTimeLabel(item.fechaInicio)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {activeSection === 'carga' && (
        <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <Card>
            <CardHeader>
              <CardTitle>Carga masiva incremental</CardTitle>
              <CardDescription>
                Sube un manifiesto con codigos y asignaciones, junto con el ZIP de imagenes oficiales de
                QR. El sistema procesa la carga en ese momento, convierte TIFF/TIF si hace falta y deja
                el QR realmente asignado a la dermoconsejera para dashboard y LOVE ISDIN.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[var(--module-border)] bg-[var(--module-soft-bg)] px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-slate-950">Plantilla oficial del manifiesto QR</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Descarga el Excel base con columnas, ejemplos y hoja de instrucciones para que el
                    manifiesto y el ZIP empaten desde el primer intento.
                  </p>
                </div>

                <Link
                  href="/api/love-isdin/qr-template"
                  className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-[var(--module-border)] bg-white px-4.5 py-2.5 text-sm font-medium text-[var(--module-text)] transition-all duration-200 hover:bg-[var(--module-soft-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-focus-ring)] focus-visible:ring-offset-2"
                >
                  Descargar plantilla QR
                </Link>
              </div>

              {!data.qrInfraestructuraLista && (
                <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                  {data.qrMensajeInfraestructura}
                </div>
              )}

              <form action={uploadAction} className="space-y-4">
                {useSingleTenantUi ? (
                  <>
                    <input type="hidden" name="cuenta_cliente_id" value={defaultAccountId} />
                    <FilterField label="Cuenta operativa">
                      <div className={`${fieldClassName()} flex items-center font-medium`}>
                        {getSingleTenantAccountLabel()}
                      </div>
                    </FilterField>
                  </>
                ) : data.cuentas.length > 1 ? (
                  <FilterField label="Cuenta cliente">
                    <select name="cuenta_cliente_id" className={fieldClassName()} defaultValue="">
                      <option value="">Selecciona una cuenta</option>
                      {data.cuentas.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </FilterField>
                ) : (
                  <input type="hidden" name="cuenta_cliente_id" value={defaultAccountId} />
                )}

                <FilterField label="Manifiesto QR (Excel o CSV)">
                  <input
                    className={fieldClassName()}
                    type="file"
                    name="manifiesto_qr"
                    accept=".xlsx,.xls,.csv"
                  />
                </FilterField>

                <FilterField label="ZIP de imagenes QR">
                  <input
                    className={fieldClassName()}
                    type="file"
                    name="imagenes_zip"
                    accept=".zip"
                  />
                </FilterField>

                <div className="rounded-[18px] border border-[var(--module-border)] bg-[var(--module-soft-bg)] px-4 py-4 text-sm leading-6 text-slate-600">
                  <p className="font-medium text-slate-950">Reglas de esta carga</p>
                  <ul className="mt-2 space-y-1">
                    <li>- El manifiesto y el ZIP se guardan como lote incremental para trazabilidad.</li>
                    <li>- El sistema procesa la asignacion QR en el momento de la carga.</li>
                    <li>- El QR sigue siendo de la DC, pero las afiliaciones contaran por el PDV real.</li>
                    <li>- `IMAGEN_ARCHIVO` debe coincidir exactamente con el nombre dentro del ZIP.</li>
                    <li>- Se aceptan imagenes `.png`, `.jpg`, `.jpeg`, `.webp`, `.tif` y `.tiff`.</li>
                    <li>- Los TIFF/TIF se convierten automaticamente para que puedan mostrarse en dashboard.</li>
                    <li>- Si el QR ya esta asignado, usa `ESTADO_QR = ACTIVO` y llena la DC.</li>
                    <li>- Si el QR queda libre para futura reasignacion, usa `ESTADO_QR = DISPONIBLE` y deja la DC vacia.</li>
                  </ul>
                </div>

                {uploadState.message && (
                  <div
                    className={`rounded-[18px] border px-4 py-4 text-sm ${
                      uploadState.ok
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-rose-200 bg-rose-50 text-rose-900'
                    }`}
                  >
                    {uploadState.message}
                  </div>
                )}

                <UploadSubmitButton />
              </form>
            </CardContent>
          </Card>

          <Card className="overflow-hidden p-0">
            <CardHeader className="border-b border-border/70 px-6 py-5">
              <CardTitle>Lotes recientes de carga</CardTitle>
              <CardDescription>
                Historial operativo de manifiestos incrementales registrados para inventario QR de LOVE.
              </CardDescription>
            </CardHeader>

            <CardContent className="px-0 py-0">
              {data.qrImportLotes.length === 0 ? (
                <StateMessage label="Todavia no hay cargas masivas registradas en LOVE ISDIN." />
              ) : (
                <div className="divide-y divide-border/60">
                  {data.qrImportLotes.map((item) => (
                    <div key={item.id} className="px-6 py-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-base font-semibold text-slate-950">{item.archivoNombre}</h3>
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${buildImportTone(item.estado)}`}
                            >
                              {item.estado}
                            </span>
                          </div>
                          <div className="mt-2 text-sm text-slate-500">
                            <p>Creado: {formatDateTimeLabel(item.creadoEn)}</p>
                            <p>Confirmado: {formatDateTimeLabel(item.confirmadoEn)}</p>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <MetricMini label="Advertencias" value={formatNumber(item.advertencias)} />
                          <MetricMini label="Tipo" value={item.tipoCarga ?? 'Sin tipo'} />
                          <MetricMini label="ZIP" value={item.zipPath ? 'Cargado' : 'Pendiente'} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  )
}

function SectionButton({
  active,
  label,
  helper,
  onClick,
}: {
  active: boolean
  label: string
  helper: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[18px] border px-4 py-3 text-left transition ${
        active
          ? 'border-[var(--module-border)] bg-[var(--module-soft-bg)] shadow-card'
          : 'border-border/70 bg-white hover:border-[var(--module-border)] hover:bg-[var(--module-soft-bg)]'
      }`}
    >
      <p className="text-sm font-semibold text-slate-950">{label}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </button>
  )
}

function RangeButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        active
          ? 'bg-[var(--module-primary)] text-white shadow-[0_8px_18px_var(--module-shadow)]'
          : 'border border-border bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

function FilterField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  )
}

function MetricCard({
  label,
  value,
  tone = 'emerald',
}: {
  label: string
  value: string
  tone?: 'emerald' | 'rose' | 'sky' | 'amber' | 'slate'
}) {
  return (
    <SharedMetricCard
      label={label}
      value={value}
      tone={tone}
    />
  )
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-border/70 bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function KpiBarChartCard({
  title,
  description,
  items,
  emptyLabel,
}: {
  title: string
  description: string
  items: LoveAggregateItem[]
  emptyLabel: string
}) {
  const visibleItems = items.slice(0, 8)
  const maxValue = visibleItems.reduce((current, item) => Math.max(current, item.objetivo, item.total), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {visibleItems.length === 0 ? (
          <StateMessage label={emptyLabel} minimal />
        ) : (
          <div className="space-y-4">
            {visibleItems.map((item) => (
              <div key={item.id} className="grid gap-3 sm:grid-cols-[1fr_120px] sm:items-center">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-950">{item.label}</p>
                      {item.helper && <p className="text-xs text-slate-500">{item.helper}</p>}
                    </div>
                    <span className="text-sm font-semibold text-slate-950">
                      {formatNumber(item.total)} / {formatNumber(item.objetivo)}
                    </span>
                  </div>
                  <div className="mt-3 h-3 rounded-full bg-slate-100">
                    <div
                      className="h-3 rounded-full bg-[linear-gradient(90deg,var(--module-primary)_0%,rgba(236,72,153,0.35)_100%)]"
                      style={{ width: chartWidth(item.total, maxValue) }}
                    />
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>Meta {formatNumber(item.objetivo)}</p>
                  <p>Validas {formatNumber(item.validas)}</p>
                  <p>Pendientes {formatNumber(item.pendientes)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TimelineChartCard({
  title,
  description,
  items,
  kind,
  emptyLabel,
}: {
  title: string
  description: string
  items: Array<{
    bucket: string
    total: number
    objetivo: number
    validas: number
    pendientes: number
    rechazadas: number
    duplicadas: number
  }>
  kind: 'day' | 'week'
  emptyLabel: string
}) {
  const visibleItems = items.slice(-8)
  const maxValue = visibleItems.reduce((current, item) => Math.max(current, item.objetivo, item.total), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {visibleItems.length === 0 ? (
          <StateMessage label={emptyLabel} minimal />
        ) : (
          <div className="space-y-4">
            {visibleItems.map((item) => (
              <div key={item.bucket} className="grid gap-3 sm:grid-cols-[140px_1fr_110px] sm:items-center">
                <p className="text-sm font-medium text-slate-700">
                  {kind === 'day' ? formatDateLabel(item.bucket) : formatWeekBucket(item.bucket)}
                </p>
                <div className="h-3 rounded-full bg-slate-100">
                  <div
                    className="h-3 rounded-full bg-gradient-to-r from-sky-600 to-emerald-400"
                    style={{ width: chartWidth(item.total, maxValue) }}
                  />
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p className="font-semibold text-slate-950">
                    {formatNumber(item.total)} / {formatNumber(item.objetivo)}
                  </p>
                  <p>Validas {formatNumber(item.validas)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatusPill({ value }: { value: string }) {
  const tone =
    value === 'VALIDA'
      ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
      : value === 'PENDIENTE_VALIDACION'
        ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
        : value === 'DUPLICADA'
          ? 'bg-slate-200 text-slate-700 ring-1 ring-slate-300'
          : 'bg-rose-100 text-rose-800 ring-1 ring-rose-200'

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${tone}`}>
      {value}
    </span>
  )
}

function QrStatusPill({
  value,
}: {
  value: 'DISPONIBLE' | 'ACTIVO' | 'BLOQUEADO' | 'BAJA'
}) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${buildQrTone(value)}`}
    >
      {value}
    </span>
  )
}

function StateMessage({ label, minimal = false }: { label: string; minimal?: boolean }) {
  return (
    <div
      className={`rounded-[18px] border border-dashed border-border/80 px-5 py-8 text-sm text-slate-500 ${
        minimal ? 'bg-slate-50' : 'bg-white'
      }`}
    >
      {label}
    </div>
  )
}

function UploadSubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
      {pending ? 'Registrando carga...' : 'Registrar carga incremental'}
    </Button>
  )
}

function AssignSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="lg" disabled={disabled || pending} className="w-full sm:w-auto">
      {pending ? 'Asignando QR...' : 'Asignar QR disponible'}
    </Button>
  )
}
