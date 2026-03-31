'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { BitacoraPanelData } from '../services/bitacoraService'

function buildCursorHref(
  data: BitacoraPanelData,
  options: { cursor: number | null; history: number[] }
) {
  const params = new URLSearchParams()
  if (data.filtros.usuario) params.set('usuario', data.filtros.usuario)
  if (data.filtros.modulo) params.set('modulo', data.filtros.modulo)
  if (data.filtros.accion) params.set('accion', data.filtros.accion)
  if (data.filtros.fechaDesde) params.set('fechaDesde', data.filtros.fechaDesde)
  if (data.filtros.fechaHasta) params.set('fechaHasta', data.filtros.fechaHasta)
  params.set('pageSize', String(data.paginacion.pageSize))
  if (options.cursor) params.set('cursor', String(options.cursor))
  if (options.history.length > 0) params.set('history', options.history.join(','))
  return `/bitacora?${params.toString()}`
}

function buildExportHref(data: BitacoraPanelData, format: 'csv' | 'xlsx') {
  const params = new URLSearchParams({ format })
  if (data.filtros.usuario) params.set('usuario', data.filtros.usuario)
  if (data.filtros.modulo) params.set('modulo', data.filtros.modulo)
  if (data.filtros.accion) params.set('accion', data.filtros.accion)
  if (data.filtros.fechaDesde) params.set('fechaDesde', data.filtros.fechaDesde)
  if (data.filtros.fechaHasta) params.set('fechaHasta', data.filtros.fechaHasta)
  return `/api/bitacora/export?${params.toString()}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function BitacoraPanel({ data }: { data: BitacoraPanelData }) {
  const canPrev = data.paginacion.hasPreviousPage
  const canNext = data.paginacion.hasNextPage

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-slate-50">
        <form action="/bitacora" method="get" className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-[1fr_1fr_180px_180px_140px_auto] xl:items-end">
          <div>
            <label htmlFor="usuario" className="mb-1.5 block text-sm font-medium text-slate-900">Usuario</label>
            <input id="usuario" name="usuario" defaultValue={data.filtros.usuario} placeholder="admin, supervisor..." className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900" />
          </div>
          <div>
            <label htmlFor="modulo" className="mb-1.5 block text-sm font-medium text-slate-900">Modulo</label>
            <input id="modulo" name="modulo" defaultValue={data.filtros.modulo} placeholder="venta, gasto, cuenta_cliente..." className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900" />
          </div>
          <div>
            <label htmlFor="accion" className="mb-1.5 block text-sm font-medium text-slate-900">Accion</label>
            <select id="accion" name="accion" defaultValue={data.filtros.accion} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900">
              <option value="">Todas</option>
              <option value="INSERT">INSERT</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="EVENTO">EVENTO</option>
            </select>
          </div>
          <div>
            <label htmlFor="fechaDesde" className="mb-1.5 block text-sm font-medium text-slate-900">Fecha desde</label>
            <input id="fechaDesde" name="fechaDesde" type="date" defaultValue={data.filtros.fechaDesde} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900" />
          </div>
          <div>
            <label htmlFor="fechaHasta" className="mb-1.5 block text-sm font-medium text-slate-900">Fecha hasta</label>
            <input id="fechaHasta" name="fechaHasta" type="date" defaultValue={data.filtros.fechaHasta} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900" />
          </div>
          <div className="flex gap-3">
            <input type="hidden" name="cursor" value="" />
            <input type="hidden" name="history" value="" />
            <input type="hidden" name="pageSize" value={String(data.paginacion.pageSize)} />
            <Button type="submit">Aplicar</Button>
          </div>
        </form>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Registros" value={String(data.resumen.registros)} />
        <MetricCard label="Integridad valida" value={String(data.resumen.integridadValida)} tone="emerald" />
        <MetricCard label="Integridad invalida" value={String(data.resumen.integridadInvalida)} tone="rose" />
      </div>

      {data.alertaIntegridad && (
        <Card className="border-rose-200 bg-rose-50">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-rose-800">Alerta de integridad</p>
              <p className="mt-1 text-sm text-rose-700">{data.alertaIntegridad.mensaje}</p>
            </div>
            <div className="text-xs text-rose-700">
              <div>IDs: {data.alertaIntegridad.ids.join(', ')}</div>
              {data.alertaIntegridad.ultimaFecha && <div>Ultimo evento: {formatDate(data.alertaIntegridad.ultimaFecha)}</div>}
            </div>
          </div>
        </Card>
      )}

      <Card className="border-slate-200 bg-white">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">Caja Negra administrativa</p>
            <p className="mt-1 text-xs text-slate-500">Sin cache. Lectura directa desde `audit_log` con verificacion de integridad por hash y exportacion CSV firmada para auditoria externa.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ExportLink href={buildExportHref(data, 'csv')} label="CSV firmado" />
            <ExportLink href={buildExportHref(data, 'xlsx')} label="XLSX" />
          </div>
        </div>
      </Card>

      <Card className="border-slate-200 bg-white">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">Retencion minima de auditoria</p>
            <p className="mt-1 text-xs text-slate-500">Politica configurable por tipo de registro desde configuracion central. Default conservador: 730 dias.</p>
          </div>
          <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
            {data.retencion.map((item) => (
              <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="font-medium text-slate-900">{item.label}</div>
                <div className="mt-1">{item.dias} dias</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                {['Fecha', 'Modulo', 'Accion', 'Usuario', 'Cuenta', 'Integridad', 'Hash', 'Resumen'].map((header) => (
                  <th key={header} className="px-6 py-3 font-medium">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-500">Sin eventos para los filtros seleccionados.</td>
                </tr>
              ) : (
                data.items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4 text-slate-600">{formatDate(item.fecha)}</td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{item.tabla}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.registroId ?? 'sin registro'}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{item.accion}</td>
                    <td className="px-6 py-4 text-slate-600">{item.usuario ?? 'sistema'}</td>
                    <td className="px-6 py-4 text-slate-600">{item.cuentaCliente ?? 'sin cuenta'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.integridad === 'VALIDO' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {item.integridad}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      <div>{item.hashGuardado.slice(0, 16)}...</div>
                      {item.integridad === 'INVALIDO' && <div className="mt-1 text-rose-600">calc: {item.hashCalculado.slice(0, 16)}...</div>}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{item.resumen}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="border-slate-200 bg-white">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">Paginacion incremental</p>
            <p className="mt-1 text-xs text-slate-500">Tramo {data.paginacion.page} | maximo {data.paginacion.pageSize} registros por pagina | total {data.paginacion.totalItems}</p>
          </div>
          <div className="flex gap-3">
            <PaginationLink
              href={buildCursorHref(data, {
                cursor: data.paginacion.previousCursor,
                history: data.paginacion.previousHistory,
              })}
              disabled={!canPrev}
            >
              Anterior
            </PaginationLink>
            <PaginationLink
              href={buildCursorHref(data, {
                cursor: data.paginacion.nextCursor,
                history: [...data.filtros.history, data.filtros.cursor ?? 0],
              })}
              disabled={!canNext}
            >
              Siguiente
            </PaginationLink>
          </div>
        </div>
      </Card>
    </div>
  )
}

function MetricCard({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'emerald' | 'rose' }) {
  const toneClass = tone === 'emerald' ? 'text-emerald-700' : tone === 'rose' ? 'text-rose-700' : 'text-slate-950'
  return <Card className="border-slate-200 bg-white"><p className="text-sm text-slate-500">{label}</p><p className={`mt-2 text-3xl font-semibold ${toneClass}`}>{value}</p></Card>
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} prefetch={false} className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50">{label}</Link>
}

function PaginationLink({ href, disabled, children }: { href: string; disabled: boolean; children: string }) {
  if (disabled) {
    return <span className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-400">{children}</span>
  }

  return <Link href={href} prefetch={false} className="inline-flex items-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50">{children}</Link>
}
