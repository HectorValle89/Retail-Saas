'use client'

import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { VisitasOperativasRankingData } from '../services/reporteVisitasOperativasService'

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: VisitasOperativasRankingData }
  | { status: 'error'; message: string }

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('es-MX').format(value)
}

export function VisitasOperativasDemandCard({
  periodoInicial,
}: {
  periodoInicial: string
}) {
  const [periodo, setPeriodo] = useState(periodoInicial)
  const [top, setTop] = useState('10')
  const [state, setState] = useState<LoadState>({ status: 'idle' })

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const nextPeriodo = String(form.get('periodo') ?? periodoInicial).trim() || periodoInicial
    const nextTop = String(form.get('top') ?? '10').trim() || '10'

    setPeriodo(nextPeriodo)
    setTop(nextTop)
    setState({ status: 'loading' })

    try {
      const params = new URLSearchParams({
        periodo: nextPeriodo,
        top: nextTop,
      })
      const response = await fetch(`/api/reportes/visitas-operativas?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      const payload = (await response.json()) as { data?: VisitasOperativasRankingData; message?: string }

      if (!response.ok || !payload.data) {
        throw new Error(payload.message ?? 'No fue posible generar el ranking de visitas.')
      }

      setState({ status: 'loaded', data: payload.data })
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'No fue posible generar el ranking de visitas.',
      })
    }
  }

  return (
    <Card className="border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-6 py-4">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">Bajo demanda</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">Ranking operativo de visitas</h2>
        <p className="mt-1 text-sm text-slate-600">
          Genera el ranking cuando lo necesites. No se consulta al entrar a Reportes.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 px-6 py-5 md:grid-cols-[1fr_180px_auto] md:items-end">
        <div>
          <label htmlFor="visitas-periodo" className="mb-1.5 block text-sm font-medium text-slate-900">
            Periodo
          </label>
          <input
            id="visitas-periodo"
            name="periodo"
            type="month"
            value={periodo}
            onChange={(event) => setPeriodo(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900"
          />
        </div>
        <div>
          <label htmlFor="visitas-top" className="mb-1.5 block text-sm font-medium text-slate-900">
            Top supervisores
          </label>
          <select
            id="visitas-top"
            name="top"
            value={top}
            onChange={(event) => setTop(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900"
          >
            {[5, 10, 15, 20, 30].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" className="min-h-11">
          {state.status === 'loading' ? 'Generando...' : 'Generar ranking'}
        </Button>
      </form>

      <div className="px-6 pb-6">
        {state.status === 'idle' && (
          <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50 px-4 py-5 text-sm text-sky-900">
            Selecciona un periodo y presiona <span className="font-semibold">Generar ranking</span> para ver cuántas visitas asignadas alcanzó cada supervisor.
          </div>
        )}

        {state.status === 'error' && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-800">
            {state.message}
          </div>
        )}

        {state.status === 'loaded' && (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <SummaryTile label="Supervisores" value={formatInteger(state.data.resumen.supervisores)} />
              <SummaryTile label="Rutas" value={formatInteger(state.data.resumen.rutas)} />
              <SummaryTile label="Asignadas" value={formatInteger(state.data.resumen.visitasAsignadas)} />
              <SummaryTile label="Completadas" value={formatInteger(state.data.resumen.visitasCompletadas)} />
              <SummaryTile label="Pendientes" value={formatInteger(state.data.resumen.visitasPendientes)} />
              <SummaryTile label="Cumplimiento" value={formatPercent(state.data.resumen.cumplimientoPromedio)} />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    {['Supervisor', 'Rutas', 'Asignadas', 'Completadas', 'Pendientes', '% Cumplimiento'].map((header) => (
                      <th key={header} className="px-5 py-3 font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.data.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                        No hay visitas publicadas en el periodo seleccionado.
                      </td>
                    </tr>
                  ) : (
                    state.data.items.map((item) => (
                      <tr key={item.supervisorEmpleadoId} className="border-t border-slate-100 align-top">
                        <td className="px-5 py-4 text-slate-600">
                          <div className="font-medium text-slate-950">{item.supervisor}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {item.idNomina ?? 'sin nomina'} / {item.puesto ?? 'sin puesto'}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-600">{formatInteger(item.rutas)}</td>
                        <td className="px-5 py-4 text-slate-600">{formatInteger(item.visitasAsignadas)}</td>
                        <td className="px-5 py-4 text-emerald-700">{formatInteger(item.visitasCompletadas)}</td>
                        <td className="px-5 py-4 text-amber-700">{formatInteger(item.visitasPendientes)}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-slate-950">{formatPercent(item.cumplimientoPct)}</span>
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                item.cumplimientoPct >= 100
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {item.cumplimientoPct >= 100 ? 'Alcanzado' : 'En avance'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate-500">
              Periodo consultado: {state.data.periodo}. El ranking usa rutas publicadas y visitas completadas para evitar lecturas adicionales al abrir la pagina.
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  )
}
