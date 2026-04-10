'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MetricCard } from '@/components/ui/metric-card'
import { ModalPanel } from '@/components/ui/modal-panel'
import type {
  AttendanceAdminDayCell,
  AttendanceAdminDayDetail,
  AttendanceAdminMonthData,
} from '@/features/asistencias/services/attendanceAdminService'

function buildSearchHref(data: AttendanceAdminMonthData, overrides: Record<string, string | null | undefined>) {
  const params = new URLSearchParams()
  const next = {
    month: data.filters.month,
    supervisorId: data.filters.supervisorId ?? '',
    cadena: data.filters.cadena ?? '',
    ciudad: data.filters.ciudad ?? '',
    zona: data.filters.zona ?? '',
    estadoDia: data.filters.estadoDia ?? '',
    ...overrides,
  }

  for (const [key, value] of Object.entries(next)) {
    if (!value) continue
    params.set(key, value)
  }

  return `/asistencias${params.size > 0 ? `?${params.toString()}` : ''}`
}

function shiftMonth(month: string, offset: number) {
  const value = new Date(`${month}-01T12:00:00Z`)
  value.setUTCMonth(value.getUTCMonth() + offset, 1)
  return value.toISOString().slice(0, 7)
}

function cellClassName(cell: AttendanceAdminDayCell) {
  const tone = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    rose: 'border-rose-200 bg-rose-50 text-rose-800',
    violet: 'border-violet-200 bg-violet-50 text-violet-800',
    sky: 'border-sky-200 bg-sky-50 text-sky-800',
    slate: 'border-slate-200 bg-slate-100 text-slate-700',
    neutral: 'border-slate-200 bg-white text-slate-500',
  }[cell.tone]

  return `flex h-10 w-12 items-center justify-center rounded-xl border text-[11px] font-semibold tracking-[0.04em] transition hover:shadow-sm ${tone}`
}

export function AsistenciasAdminPanel({ data }: { data: AttendanceAdminMonthData }) {
  const [selectedCell, setSelectedCell] = useState<{ empleadoId: string; nombre: string; fecha: string } | null>(null)
  const [detail, setDetail] = useState<AttendanceAdminDayDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const exportHref = useMemo(() => {
    const params = new URLSearchParams()
    params.set('month', data.filters.month)
    if (data.filters.supervisorId) params.set('supervisorId', data.filters.supervisorId)
    if (data.filters.cadena) params.set('cadena', data.filters.cadena)
    if (data.filters.ciudad) params.set('ciudad', data.filters.ciudad)
    if (data.filters.zona) params.set('zona', data.filters.zona)
    if (data.filters.estadoDia) params.set('estadoDia', data.filters.estadoDia)
    params.set('format', 'xlsx')
    return `/api/asistencias/export?${params.toString()}`
  }, [data.filters])

  const handleOpenDetail = (empleadoId: string, nombre: string, fecha: string) => {
    setSelectedCell({ empleadoId, nombre, fecha })
    setDetail(null)
    setDetailError(null)
    startTransition(async () => {
      try {
        const params = new URLSearchParams({ empleadoId, fecha, month: data.month })
        const response = await fetch(`/api/asistencias/detalle?${params.toString()}`, { cache: 'no-store' })
        const payload = (await response.json()) as { detail?: AttendanceAdminDayDetail; error?: string }
        if (!response.ok || !payload.detail) {
          setDetailError(payload.error ?? 'No fue posible cargar el detalle.')
          return
        }
        setDetail(payload.detail)
      } catch (error) {
        setDetailError(error instanceof Error ? error.message : 'No fue posible cargar el detalle.')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Colaboradoras visibles" value={String(data.summary.empleadosVisibles)} tone="sky" className="min-h-[94px] px-6 py-4" labelClassName="text-sm" valueClassName="mt-3 text-[2rem] sm:text-[2.2rem]" />
        <MetricCard label="Asistencias" value={String(data.summary.asistencias)} tone="emerald" className="min-h-[94px] px-6 py-4" labelClassName="text-sm" valueClassName="mt-3 text-[2rem] sm:text-[2.2rem]" />
        <MetricCard label="Retardos / FR" value={`${data.summary.retardos} / ${data.summary.faltasPorRetardo}`} tone="amber" className="min-h-[94px] px-6 py-4" labelClassName="text-sm" valueClassName="mt-3 text-[2rem] sm:text-[2.2rem]" />
        <MetricCard label="Faltas" value={String(data.summary.faltas)} tone="rose" className="min-h-[94px] px-6 py-4" labelClassName="text-sm" valueClassName="mt-3 text-[2rem] sm:text-[2.2rem]" />
        <MetricCard label="Vacaciones" value={String(data.summary.vacaciones)} tone="sky" className="min-h-[94px] px-6 py-4" labelClassName="text-sm" valueClassName="mt-3 text-[2rem] sm:text-[2.2rem]" />
        <MetricCard label="Incapacidades" value={String(data.summary.incapacidades)} tone="slate" className="min-h-[94px] px-6 py-4" labelClassName="text-sm" valueClassName="mt-3 text-[2rem] sm:text-[2.2rem]" />
      </div>

      {!data.infraestructuraLista && data.mensajeInfraestructura ? (
        <Card className="rounded-[28px] border border-amber-200 bg-amber-50/90 p-5 shadow-[0_18px_38px_rgba(148,163,184,0.08)]">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-800">Infraestructura pendiente</p>
          <p className="mt-3 text-sm leading-6 text-amber-900">{data.mensajeInfraestructura}</p>
        </Card>
      ) : null}

      <Card className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_18px_38px_rgba(148,163,184,0.12)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Calendario mensual</p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Vista administrativa consolidada del mes, con detalle consultivo por día y exportación mensual.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={buildSearchHref(data, { month: shiftMonth(data.month, -1) })} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Mes anterior</Link>
            <Link href={buildSearchHref(data, { month: shiftMonth(data.month, 1) })} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Mes siguiente</Link>
            {data.canExport ? (
              <a href={exportHref} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-900 bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">Descargar asistencias</a>
            ) : (
              <span className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 px-4 text-sm font-semibold text-slate-500">Exportacion no disponible</span>
            )}
          </div>
        </div>

        <form action="/asistencias" method="get" className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-6">
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Mes
            <input name="month" type="month" defaultValue={data.filters.month} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900" />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Supervisor
            <select name="supervisorId" defaultValue={data.filters.supervisorId ?? ''} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900">
              {data.supervisors.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Cadena
            <select name="cadena" defaultValue={data.filters.cadena ?? ''} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900">
              {data.cadenas.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Ciudad
            <select name="ciudad" defaultValue={data.filters.ciudad ?? ''} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900">
              {data.ciudades.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Zona
            <select name="zona" defaultValue={data.filters.zona ?? ''} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900">
              {data.zonas.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Estado del día
            <select name="estadoDia" defaultValue={data.filters.estadoDia ?? ''} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900">
              {data.estadosDia.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <div className="xl:col-span-6 flex flex-wrap gap-3 pt-2">
            <Button type="submit">Aplicar filtros</Button>
            <Link href="/asistencias" className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Limpiar</Link>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden rounded-[28px] border border-slate-200 bg-white/95 p-0 shadow-[0_18px_38px_rgba(148,163,184,0.12)]">
        <div className="overflow-auto">
          <table className="min-w-max border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-20 bg-white">
              <tr>
                <th className="sticky left-0 z-30 border-b border-r border-slate-200 bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">ID nómina</th>
                <th className="sticky left-[124px] z-30 border-b border-r border-slate-200 bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Nombre</th>
                <th className="sticky left-[364px] z-30 border-b border-r border-slate-200 bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Supervisor</th>
                <th className="sticky left-[564px] z-30 border-b border-r border-slate-200 bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Cadena principal</th>
                {data.days.map((day) => (
                  <th key={day.fecha} className="border-b border-r border-slate-200 bg-slate-50 px-1 py-2 text-center text-[11px] font-semibold text-slate-500">
                    <div>{day.weekdayLetter}</div>
                    <div className="mt-1 text-sm text-slate-900">{day.dayNumber}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={4 + data.days.length} className="px-6 py-10 text-center text-slate-500">No hay asistencias visibles con los filtros actuales.</td>
                </tr>
              ) : data.rows.map((row) => (
                <tr key={row.empleadoId} className="odd:bg-slate-50/35">
                  <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-4 py-3 text-slate-600">{row.idNomina ?? 'Sin nómina'}</td>
                  <td className="sticky left-[124px] z-10 min-w-[240px] border-b border-r border-slate-200 bg-white px-4 py-3">
                    <div className="font-semibold text-slate-950">{row.nombre}</div>
                  </td>
                  <td className="sticky left-[364px] z-10 min-w-[200px] border-b border-r border-slate-200 bg-white px-4 py-3 text-slate-600">{row.supervisor ?? 'Sin supervisor'}</td>
                  <td className="sticky left-[564px] z-10 min-w-[220px] border-b border-r border-slate-200 bg-white px-4 py-3 text-slate-600">{row.cadenaPrincipalMes ?? 'Sin cadena dominante'}</td>
                  {row.dias.map((day) => (
                    <td key={day.fecha} className="border-b border-r border-slate-200 px-1.5 py-2 text-center">
                      <button type="button" onClick={() => handleOpenDetail(row.empleadoId, row.nombre, day.fecha)} className={cellClassName(day)} title={`${day.fecha} · ${day.label}`}>
                        {day.codigo || '·'}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ModalPanel
        open={Boolean(selectedCell)}
        onClose={() => {
          setSelectedCell(null)
          setDetail(null)
          setDetailError(null)
        }}
        title={selectedCell ? `${selectedCell.nombre} · ${selectedCell.fecha}` : 'Detalle del día'}
        subtitle="Detalle consultivo de la jornada o excepción registrada."
        maxWidthClassName="max-w-4xl"
      >
        {isPending ? (
          <p className="text-sm text-slate-500">Cargando detalle...</p>
        ) : detailError ? (
          <p className="text-sm text-rose-700">{detailError}</p>
        ) : detail ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <DetailCard label="Código" value={detail.codigo || 'Pendiente'} />
            <DetailCard label="Descripción" value={detail.descripcion} />
            <DetailCard label="Supervisor" value={detail.supervisor ?? 'Sin supervisor'} />
            <DetailCard label="PDV" value={detail.pdv ?? 'Sin PDV'} />
            <DetailCard label="Cadena / sucursal" value={`${detail.cadena ?? 'Sin cadena'} · ${detail.sucursal ?? 'Sin sucursal'}`} />
            <DetailCard label="Horario esperado" value={detail.horarioEsperado ?? 'Sin horario'} />
            <DetailCard label="Check-in" value={detail.checkIn ?? 'Sin registro'} />
            <DetailCard label="Check-out" value={detail.checkOut ?? 'Sin registro'} />
            <DetailCard label="GPS / biometría" value={`${detail.gps ?? 'Sin GPS'} · ${detail.biometria ?? 'Sin biometría'}`} />
            <DetailCard label="Origen" value={`${detail.sourceType}${detail.sourceId ? ` · ${detail.sourceId}` : ''}`} className="md:col-span-2 xl:col-span-3" />
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4 md:col-span-2 xl:col-span-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Evidencias</p>
              {detail.evidencias.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No hay evidencias visibles para este día.</p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-3">
                  {detail.evidencias.map((item) => (
                    <a key={`${item.kind}-${item.url}`} href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100">
                      {item.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Selecciona una celda para revisar el detalle.</p>
        )}
      </ModalPanel>
    </div>
  )
}

function DetailCard({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-[24px] border border-slate-200 bg-white px-5 py-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-3 text-sm leading-6 text-slate-900">{value}</p>
    </div>
  )
}

