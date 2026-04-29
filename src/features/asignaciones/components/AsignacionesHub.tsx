import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { MaterializedDateRangeCalendar } from '../services/asignacionMaterializationService'

function formatRangeLabel(fechaInicio: string, fechaFin: string) {
  const formatter = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return `${formatter.format(new Date(`${fechaInicio}T12:00:00Z`))} - ${formatter.format(new Date(`${fechaFin}T12:00:00Z`))}`
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

export function AsignacionesHub({
  calendar,
  fechaInicio,
  fechaFin,
}: {
  calendar: MaterializedDateRangeCalendar | null
  fechaInicio: string
  fechaFin: string
}) {
  return (
    <div className="space-y-6">
      <Card className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_40px_rgba(148,163,184,0.10)]">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">Planeacion operativa</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-950">Asignaciones</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
              Revisa el calendario publicado por rango de fechas y entra a cada submódulo sin mezclar catálogos, horarios ni PDVs en la misma pantalla.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/asignaciones/asignaciones" className="inline-flex min-h-11 items-center rounded-[16px] bg-[var(--module-primary)] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_var(--module-shadow)] transition hover:bg-[var(--module-hover)]">
              Asignaciones
            </Link>
            <Link href="/asignaciones/horarios" className="inline-flex min-h-11 items-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
              Horarios
            </Link>
            <Link href="/asignaciones/pdvs" className="inline-flex min-h-11 items-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
              PDVs
            </Link>
            <Link href="/asignaciones/vacantes-futuras" className="inline-flex min-h-11 items-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
              Vacantes futuras
            </Link>
          </div>
        </div>

        <form method="get" className="mt-6 grid gap-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1fr_1fr_auto_auto]">
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            <span>Fecha inicial</span>
            <input
              type="date"
              name="fecha_inicio"
              defaultValue={fechaInicio}
              className="min-h-11 rounded-[16px] border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            <span>Fecha final</span>
            <input
              type="date"
              name="fecha_fin"
              defaultValue={fechaFin}
              className="min-h-11 rounded-[16px] border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </label>
          <div className="flex items-end">
            <Button type="submit" className="w-full lg:w-auto">
              Aplicar rango
            </Button>
          </div>
          <div className="flex items-end">
            <Link href="/asignaciones" className="inline-flex min-h-11 items-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Limpiar
            </Link>
          </div>
        </form>
      </Card>

      <Card className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_40px_rgba(148,163,184,0.10)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Calendario publicado</h2>
            <p className="mt-1 text-sm text-slate-500">
              {calendar ? formatRangeLabel(calendar.fechaInicio, calendar.fechaFin) : 'Sin periodo cargado'}
            </p>
          </div>
          <p className="text-sm font-medium text-slate-500">
            {calendar ? `${calendar.totalEmpleados} dermoconsejeras visibles` : 'Sin datos para el rango seleccionado'}
          </p>
        </div>

        {calendar && calendar.empleados.length > 0 ? (
          <div className="mt-5 overflow-x-auto rounded-[24px] border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="sticky left-0 z-20 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left">Dermoconsejera</th>
                  <th className="sticky left-[260px] z-20 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left">Supervisor</th>
                  {calendar.dias.map((day) => (
                    <th key={day} className="border-b border-slate-200 px-2 py-3 text-center">
                      <div>{getWeekdayLetter(day)}</div>
                      <div className="mt-1 text-[11px] font-semibold text-slate-700">{day.slice(-2)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calendar.empleados.map((employee) => (
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
                        <span
                          className={`inline-flex min-w-11 justify-center rounded-full px-2 py-1 text-[11px] font-semibold ${getCalendarTone(day.estadoOperativo)}`}
                          title={`${day.fecha} · ${day.mensajeOperativo ?? day.estadoOperativo}`}
                        >
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
          <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
            <p className="text-sm font-semibold text-slate-900">Sin calendario publicado</p>
            <p className="mt-2 text-sm text-slate-500">Ajusta el rango de fechas o publica asignaciones para ver la operación aquí.</p>
          </div>
        )}
      </Card>
    </div>
  )
}
