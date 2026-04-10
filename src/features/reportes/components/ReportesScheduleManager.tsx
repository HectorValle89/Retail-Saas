'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { desactivarReporteProgramado, programarReporteAutomatico } from '../actions'
import { ESTADO_REPORTE_PROGRAMADO_INICIAL } from '../state'
import type { ProgramacionReportesData } from '../services/reporteScheduleService'

const SECTION_OPTIONS = [
  { value: 'asistencias', label: 'Asistencias' },
  { value: 'ventas', label: 'Ventas' },
  { value: 'campanas', label: 'Campanas' },
  { value: 'ranking_ventas', label: 'Ranking ventas' },
  { value: 'ranking_cuotas', label: 'Ranking cuotas' },
  { value: 'gastos', label: 'Gastos' },
  { value: 'love', label: 'LOVE ISDIN' },
  { value: 'nomina', label: 'Nomina' },
  { value: 'calendario_operativo', label: 'Calendario operativo' },
  { value: 'bitacora', label: 'Bitacora' },
] as const

function formatTimestamp(value: string | null) {
  if (!value) {
    return 'Nunca'
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value))
}

export function ReportesScheduleManager({ data }: { data: ProgramacionReportesData }) {
  const [state, formAction] = useActionState(programarReporteAutomatico, ESTADO_REPORTE_PROGRAMADO_INICIAL)

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-slate-50">
        <div className="border-b border-slate-200 px-6 py-4">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">Programacion automatica</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Reportes por email</h2>
          <p className="mt-1 text-sm text-slate-600">Programa envios semanales o mensuales. El job automatico toma el periodo UTC vigente al momento de ejecutar.</p>
        </div>
        <form action={formAction} className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-[1.2fr_180px_180px_180px_180px_140px_auto] xl:items-end">
          <Field label="Destinatario" htmlFor="destinatario_email"><input id="destinatario_email" name="destinatario_email" type="email" required placeholder="operacion@cliente.com" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900" /></Field>
          <Field label="Seccion" htmlFor="seccion"><select id="seccion" name="seccion" defaultValue="ventas" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900">{SECTION_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
          <Field label="Formato" htmlFor="formato"><select id="formato" name="formato" defaultValue="pdf" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900"><option value="pdf">PDF</option><option value="csv">CSV</option><option value="xlsx">XLSX</option></select></Field>
          <Field label="Periodicidad" htmlFor="periodicidad"><select id="periodicidad" name="periodicidad" defaultValue="SEMANAL" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900"><option value="SEMANAL">Semanal</option><option value="MENSUAL">Mensual</option></select></Field>
          <Field label="Dia" htmlFor="dia_semana"><div className="space-y-2"><select id="dia_semana" name="dia_semana" defaultValue="1" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900"><option value="0">Domingo</option><option value="1">Lunes</option><option value="2">Martes</option><option value="3">Miercoles</option><option value="4">Jueves</option><option value="5">Viernes</option><option value="6">Sabado</option></select><input name="dia_mes" type="number" min="1" max="28" placeholder="Dia mes" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900" /></div></Field>
          <Field label="Hora UTC" htmlFor="hora_utc"><input id="hora_utc" name="hora_utc" type="time" required defaultValue="08:00" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900" /></Field>
          <div className="flex gap-3"><Button type="submit">Programar</Button></div>
        </form>
        <div className="px-6 pb-6 text-xs text-slate-500">
          <p>Para periodicidad semanal se usa `dia_semana`; para mensual se toma `dia_mes` si viene informado. El disparo se evalua en UTC desde el job automatico.</p>
          {state.message && <p className={`mt-2 ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>}
        </div>
      </Card>

      {!data.infraestructuraLista && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-950">Programaciones activas</h3>
          <p className="mt-1 text-sm text-slate-500">Seguimiento de proximas ejecuciones, ultimo envio y errores operativos del scheduler.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                {['Destino', 'Reporte', 'Cadencia', 'Proxima ejecucion', 'Ultimo envio', 'Estado'].map((header) => (
                  <th key={header} className="px-6 py-3 font-medium">{header}</th>
                ))}
                <th className="px-6 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-500">Sin programaciones configuradas todavia.</td></tr>
              ) : (
                data.items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4 text-slate-600">{item.destinatarioEmail}</td>
                    <td className="px-6 py-4 text-slate-600"><div className="font-medium text-slate-900">{item.seccion}</div><div className="mt-1 text-xs text-slate-400">{item.formato.toUpperCase()}</div></td>
                    <td className="px-6 py-4 text-slate-600">{item.periodicidad === 'SEMANAL' ? `Semanal / dia ${item.diaSemana}` : `Mensual / dia ${item.diaMes}`}</td>
                    <td className="px-6 py-4 text-slate-600"><div>{formatTimestamp(item.proximaEjecucionEn)}</div><div className="mt-1 text-xs text-slate-400">hora base {item.horaUtc.slice(0, 5)} UTC</div></td>
                    <td className="px-6 py-4 text-slate-600">{formatTimestamp(item.ultimaEjecucionEn)}</td>
                    <td className="px-6 py-4 text-slate-600"><div className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.activa ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{item.activa ? 'ACTIVA' : 'INACTIVA'}</div>{item.ultimoError && <div className="mt-2 text-xs text-rose-600">{item.ultimoError}</div>}</td>
                    <td className="px-6 py-4">
                      {item.activa ? (
                        <form action={desactivarReporteProgramado}>
                          <input type="hidden" name="schedule_id" value={item.id} />
                          <Button type="submit" variant="outline">Desactivar</Button>
                        </form>
                      ) : (
                        <span className="text-xs text-slate-400">Sin acciones</span>
                      )}
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

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div><label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-900">{label}</label>{children}</div>
}



