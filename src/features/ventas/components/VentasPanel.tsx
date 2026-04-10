'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { OfflineStatusCard } from '@/components/pwa/OfflineStatusCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { queueOfflineVenta } from '@/lib/offline/syncQueue'
import type { VentasPanelData } from '../services/ventaService'
import { ExtemporaneoQueueSection } from '@/features/solicitudes/components/ExtemporaneoQueueSection'

function getLocalDateValue() {
  return new Intl.DateTimeFormat('en-CA').format(new Date())
}

function getLocalTimeValue() {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

function buildPageHref(data: VentasPanelData, page: number) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('pageSize', String(data.paginacion.pageSize))
  return `/ventas?${params.toString()}`
}

export function VentasPanel({ data }: { data: VentasPanelData }) {
  const offline = useOfflineSync()
  const todayOperationDate = getLocalDateValue()
  const jornadasDisponibles = data.jornadasContexto.filter(
    (jornada) => jornada.estatus !== 'RECHAZADA' && jornada.fechaOperacion === todayOperationDate
  )
  const [jornadaId, setJornadaId] = useState(jornadasDisponibles[0]?.id ?? '')
  const [productoId, setProductoId] = useState(data.catalogoProductos[0]?.id ?? '')
  const [fechaVenta, setFechaVenta] = useState('')
  const [horaVenta, setHoraVenta] = useState('')
  const [totalUnidades, setTotalUnidades] = useState('1')
  const [confirmada, setConfirmada] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)
  const canPrev = data.paginacion.page > 1
  const canNext = data.paginacion.page < data.paginacion.totalPages

  const selectedJornada = jornadasDisponibles.find((item) => item.id === jornadaId) ?? null
  const selectedProducto =
    data.catalogoProductos.find((item) => item.id === productoId) ?? null

  useEffect(() => {
    setFechaVenta((current) => current || getLocalDateValue())
    setHoraVenta((current) => current || getLocalTimeValue())
  }, [])

  const handleQueueDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!selectedJornada) {
      setFeedback({ tone: 'error', message: 'Selecciona una jornada reciente para ligar la venta.' })
      return
    }

    const units = Number(totalUnidades)
    if (!selectedProducto) {
      setFeedback({
        tone: 'error',
        message: 'Selecciona un producto del catalogo activo antes de guardar la venta.',
      })
      return
    }

    if (!Number.isFinite(units) || units <= 0) {
      setFeedback({ tone: 'error', message: 'Las unidades deben ser mayores a cero.' })
      return
    }

    setIsSaving(true)
    setFeedback(null)

    try {
      await queueOfflineVenta({
        id: crypto.randomUUID(),
        cuenta_cliente_id: selectedJornada.cuentaClienteId,
        asistencia_id: selectedJornada.id,
        empleado_id: selectedJornada.empleadoId,
        pdv_id: selectedJornada.pdvId,
        producto_id: selectedProducto.id,
        producto_sku: selectedProducto.sku,
        producto_nombre: selectedProducto.nombre,
        producto_nombre_corto: selectedProducto.nombreCorto,
        fecha_utc: new Date(`${fechaVenta}T${horaVenta}:00`).toISOString(),
        total_unidades: units,
        total_monto: 0,
        confirmada,
        validada_por_empleado_id: confirmada ? selectedJornada.empleadoId : null,
        validada_en: confirmada ? new Date().toISOString() : null,
        observaciones: null,
        origen: 'OFFLINE_SYNC',
        metadata: {
          captura_local: true,
          origen_panel: 'ventas',
          jornada_contexto_id: selectedJornada.id,
          fecha_operativa: selectedJornada.fechaOperacion,
          metodo_ingreso: offline.isOnline ? 'APP_ONLINE' : 'APP_OFFLINE',
        },
      })

      if (offline.isOnline) {
        await offline.syncNow()
      }

      setFeedback({
        tone: 'success',
        message: offline.isOnline
          ? `${selectedProducto.nombreCorto} guardado. Puedes registrar otra venta.`
          : `${selectedProducto.nombreCorto} guardado en local. Puedes registrar otra venta.`,
      })
      setConfirmada(false)
      setTotalUnidades('1')
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'No fue posible guardar la venta offline.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && (
        <Card className="bg-amber-50 text-amber-900 ring-1 ring-amber-200">
          <p className="font-medium">Infraestructura pendiente</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      <OfflineStatusCard
        offline={offline}
        title="Operacion offline de ventas"
        description="La PWA ya puede persistir capturas comerciales locales y reintentarlas cuando vuelva la red."
      />

      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard label="Ventas totales" value={String(data.resumen.total)} />
        <MetricCard label="Confirmadas" value={String(data.resumen.confirmadas)} />
        <MetricCard
          label="Pendientes confirmar"
          value={String(data.resumen.pendientesConfirmacion)}
        />
        <MetricCard label="Unidades" value={String(data.resumen.unidades)} />
      </div>

      <Card className="bg-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
              Captura local
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">
              Nuevo borrador de venta
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              La venta se liga al check-in valido del dia. Puedes capturarla incluso despues del
              check-out, siempre que sigas dentro de la ventana digital local del mismo dia.
            </p>
          </div>
          <div className="surface-soft px-4 py-3 text-sm text-slate-600">
            Jornadas disponibles: <span className="font-semibold text-slate-950">{jornadasDisponibles.length}</span>
          </div>
        </div>

        {jornadasDisponibles.length === 0 ? (
          <p className="mt-6 text-sm text-amber-700">
            Aun no hay un check-in valido del dia para tomar como contexto de venta.
          </p>
        ) : (
          <form className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleQueueDraft}>
            <label className="block text-sm text-slate-600 xl:col-span-2">
              Jornada base
              <select
                className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
                value={jornadaId}
                onChange={(event) => setJornadaId(event.target.value)}
              >
                {jornadasDisponibles.map((jornada) => (
                  <option key={jornada.id} value={jornada.id}>
                    {jornada.empleado} - {jornada.pdvClaveBtl} - {jornada.fechaOperacion}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-slate-600">
              Fecha venta
              <input
                className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
                type="date"
                value={fechaVenta}
                onChange={(event) => setFechaVenta(event.target.value)}
              />
            </label>

            <label className="block text-sm text-slate-600">
              Hora venta
              <input
                className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
                type="time"
                value={horaVenta}
                onChange={(event) => setHoraVenta(event.target.value)}
              />
            </label>

            <label className="block text-sm text-slate-600 xl:col-span-2">
              Producto
              <select
                className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
                value={productoId}
                onChange={(event) => setProductoId(event.target.value)}
              >
                <option value="">Selecciona un producto</option>
                {data.catalogoProductos.map((producto) => (
                  <option key={producto.id} value={producto.id}>
                    {producto.nombreCorto}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-slate-600 xl:col-span-2">
              Nombre corto
              <input
                className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
                value={selectedProducto?.nombreCorto ?? ''}
                readOnly
                placeholder="Se llena desde el catalogo"
              />
            </label>

            <label className="block text-sm text-slate-600">
              Unidades
              <input
                className="mt-2 w-full rounded-[12px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
                type="number"
                min="1"
                value={totalUnidades}
                onChange={(event) => setTotalUnidades(event.target.value)}
              />
            </label>

            <label className="flex items-center gap-3 rounded-[16px] border border-border bg-surface-subtle px-4 py-3 text-sm text-slate-700 xl:col-span-4">
              <input
                type="checkbox"
                checked={confirmada}
                onChange={(event) => setConfirmada(event.target.checked)}
              />
              Marcar como confirmada al sincronizar
            </label>

            <div className="xl:col-span-4 flex flex-wrap items-center gap-3">
              <Button type="submit" isLoading={isSaving} disabled={!offline.isSupported}>
                Guardar y capturar otra
              </Button>
              {feedback && (
                <p
                  className={`text-sm ${
                    feedback.tone === 'success' ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {feedback.message}
                </p>
              )}
            </div>
          </form>
        )}
      </Card>

      <Card className="bg-white">
        <p className="text-sm text-slate-500">Cobertura funcional</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Registro diario ligado a asistencia y a catalogo maestro de productos ISDIN.
        </p>
      </Card>

      <ExtemporaneoQueueSection
        title="Ventas tardias"
        description="Registros comerciales fuera de ventana pendientes de aprobacion o ya consolidados en ventas."
        emptyMessage="Todavia no hay ventas tardias visibles para esta cuenta."
        resumen={data.resumenExtemporaneo}
        registros={data.registrosExtemporaneos}
      />

      <Card className="overflow-hidden p-0">
        <div className="border-b border-border/60 px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-950">Ventas recientes</h2>
          <p className="mt-1 text-sm text-slate-500">
            Base comercial diaria ligada a jornada y lista para alimentar cuotas, reportes y nomina.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">Cuenta cliente</th>
                <th className="px-6 py-3 font-medium">Producto</th>
                <th className="px-6 py-3 font-medium">Volumen</th>
                <th className="px-6 py-3 font-medium">Confirmacion</th>
                <th className="px-6 py-3 font-medium">Jornada</th>
              </tr>
            </thead>
            <tbody>
              {data.ventas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Sin ventas visibles todavia.
                  </td>
                </tr>
              ) : (
                data.ventas.map((venta) => (
                  <tr key={venta.id} className="border-t border-border/40 align-top">
                    <td className="px-6 py-4 text-slate-600">{venta.fechaUtc}</td>
                    <td className="px-6 py-4 text-slate-600">
                      {venta.cuentaCliente ?? 'Sin cliente'}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{venta.producto}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {venta.productoCorto ?? 'Sin nombre corto'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>{venta.totalUnidades} unidades</div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill
                        active={venta.confirmada}
                        label={venta.confirmada ? 'CONFIRMADA' : 'PENDIENTE'}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill
                        active={venta.jornadaAbierta || venta.jornadaEstatus === 'CERRADA'}
                        label={venta.jornadaEstatus ?? 'SIN JORNADA'}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="bg-white">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">Paginacion incremental</p>
            <p className="mt-1 text-xs text-slate-500">
              Pagina {data.paginacion.page} de {data.paginacion.totalPages} | maximo{' '}
              {data.paginacion.pageSize} registros por pagina | total {data.paginacion.totalItems}
            </p>
          </div>
          <div className="flex gap-3">
            <PaginationLink
              href={buildPageHref(data, Math.max(1, data.paginacion.page - 1))}
              disabled={!canPrev}
            >
              Anterior
            </PaginationLink>
            <PaginationLink
              href={buildPageHref(
                data,
                Math.min(data.paginacion.totalPages, data.paginacion.page + 1)
              )}
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return <SharedMetricCard label={label} value={value} />
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
      }`}
    >
      {label}
    </span>
  )
}

function PaginationLink({ href, disabled, children }: { href: string; disabled: boolean; children: string }) {
  if (disabled) {
    return (
      <span className="inline-flex items-center rounded-[14px] border border-border bg-white px-4 py-2 text-sm text-slate-400">
        {children}
      </span>
    )
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-[14px] border border-border bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-[var(--module-border)] hover:bg-[var(--module-soft-bg)]"
    >
      {children}
    </Link>
  )
}
