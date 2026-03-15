'use client'

import { useState, type FormEvent } from 'react'
import { OfflineStatusCard } from '@/components/pwa/OfflineStatusCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { queueOfflineVenta } from '@/lib/offline/syncQueue'
import type { VentasPanelData } from '../services/ventaService'

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

export function VentasPanel({ data }: { data: VentasPanelData }) {
  const offline = useOfflineSync()
  const jornadasDisponibles = data.jornadasContexto.filter((jornada) => jornada.estatus !== 'RECHAZADA')
  const [jornadaId, setJornadaId] = useState(jornadasDisponibles[0]?.id ?? '')
  const [productoNombre, setProductoNombre] = useState(data.ventas[0]?.producto ?? '')
  const [productoCorto, setProductoCorto] = useState(data.ventas[0]?.productoCorto ?? '')
  const [productoSku, setProductoSku] = useState(data.ventas[0]?.productoSku ?? '')
  const [fechaVenta, setFechaVenta] = useState(getLocalDateValue())
  const [horaVenta, setHoraVenta] = useState(getLocalTimeValue())
  const [totalUnidades, setTotalUnidades] = useState('1')
  const [totalMonto, setTotalMonto] = useState('0')
  const [confirmada, setConfirmada] = useState(false)
  const [observaciones, setObservaciones] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)

  const selectedJornada = jornadasDisponibles.find((item) => item.id === jornadaId) ?? null

  const handleQueueDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!selectedJornada) {
      setFeedback({ tone: 'error', message: 'Selecciona una jornada reciente para ligar la venta.' })
      return
    }

    const units = Number(totalUnidades)
    const amount = Number(totalMonto)

    if (!productoNombre.trim()) {
      setFeedback({ tone: 'error', message: 'El nombre del producto es obligatorio.' })
      return
    }

    if (!Number.isFinite(units) || units <= 0) {
      setFeedback({ tone: 'error', message: 'Las unidades deben ser mayores a cero.' })
      return
    }

    if (!Number.isFinite(amount) || amount < 0) {
      setFeedback({ tone: 'error', message: 'El monto debe ser cero o mayor.' })
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
        producto_id: null,
        producto_sku: productoSku.trim() || null,
        producto_nombre: productoNombre.trim(),
        producto_nombre_corto: productoCorto.trim() || null,
        fecha_utc: new Date(`${fechaVenta}T${horaVenta}:00`).toISOString(),
        total_unidades: units,
        total_monto: amount,
        confirmada,
        validada_por_empleado_id: confirmada ? selectedJornada.empleadoId : null,
        validada_en: confirmada ? new Date().toISOString() : null,
        observaciones: observaciones.trim() || null,
        origen: 'OFFLINE_SYNC',
        metadata: {
          captura_local: true,
          origen_panel: 'ventas',
          jornada_contexto_id: selectedJornada.id,
        },
      })

      if (offline.isOnline) {
        await offline.syncNow()
      }

      setFeedback({
        tone: 'success',
        message: offline.isOnline
          ? 'Borrador comercial enviado a la cola local con intento de sync inmediato.'
          : 'Venta guardada en local. Quedara pendiente hasta recuperar conectividad.',
      })
      setObservaciones('')
      setConfirmada(false)
      setTotalUnidades('1')
      setTotalMonto('0')
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
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
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
        <MetricCard label="Ventas visibles" value={String(data.resumen.total)} />
        <MetricCard label="Confirmadas" value={String(data.resumen.confirmadas)} />
        <MetricCard
          label="Pendientes confirmar"
          value={String(data.resumen.pendientesConfirmacion)}
        />
        <MetricCard label="Unidades" value={String(data.resumen.unidades)} />
        <MetricCard label="Monto" value={`$${data.resumen.monto.toFixed(2)}`} />
      </div>

      <Card className="border-slate-200 bg-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
              Captura local
            </p>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">
              Nuevo borrador de venta
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              La venta se liga a una jornada existente para respetar la validacion de backend. Si
              no hay red, la captura queda en IndexedDB hasta sincronizarse.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Jornadas disponibles: <span className="font-semibold text-slate-950">{jornadasDisponibles.length}</span>
          </div>
        </div>

        {jornadasDisponibles.length === 0 ? (
          <p className="mt-6 text-sm text-amber-700">
            Aun no hay jornadas validas recientes para tomar como contexto de venta.
          </p>
        ) : (
          <form className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleQueueDraft}>
            <label className="block text-sm text-slate-600 xl:col-span-2">
              Jornada base
              <select
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
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
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                type="date"
                value={fechaVenta}
                onChange={(event) => setFechaVenta(event.target.value)}
              />
            </label>

            <label className="block text-sm text-slate-600">
              Hora venta
              <input
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                type="time"
                value={horaVenta}
                onChange={(event) => setHoraVenta(event.target.value)}
              />
            </label>

            <label className="block text-sm text-slate-600 xl:col-span-2">
              Producto
              <input
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                list="ventas-productos"
                value={productoNombre}
                onChange={(event) => setProductoNombre(event.target.value)}
                placeholder="Fotoprotector Fusion Water"
              />
              <datalist id="ventas-productos">
                {Array.from(new Set(data.ventas.map((venta) => venta.producto))).map((producto) => (
                  <option key={producto} value={producto} />
                ))}
              </datalist>
            </label>

            <label className="block text-sm text-slate-600">
              Nombre corto
              <input
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                value={productoCorto}
                onChange={(event) => setProductoCorto(event.target.value)}
                placeholder="Fusion Water"
              />
            </label>

            <label className="block text-sm text-slate-600">
              SKU
              <input
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                value={productoSku}
                onChange={(event) => setProductoSku(event.target.value)}
                placeholder="SKU-001"
              />
            </label>

            <label className="block text-sm text-slate-600">
              Unidades
              <input
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                type="number"
                min="1"
                value={totalUnidades}
                onChange={(event) => setTotalUnidades(event.target.value)}
              />
            </label>

            <label className="block text-sm text-slate-600">
              Monto total
              <input
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                type="number"
                min="0"
                step="0.01"
                value={totalMonto}
                onChange={(event) => setTotalMonto(event.target.value)}
              />
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 xl:col-span-4">
              <input
                type="checkbox"
                checked={confirmada}
                onChange={(event) => setConfirmada(event.target.checked)}
              />
              Marcar como confirmada al sincronizar
            </label>

            <label className="block text-sm text-slate-600 xl:col-span-4">
              Observaciones
              <textarea
                className="mt-2 min-h-28 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                value={observaciones}
                onChange={(event) => setObservaciones(event.target.value)}
                placeholder="Notas de cierre, detalle comercial o validacion pendiente."
              />
            </label>

            <div className="xl:col-span-4 flex flex-wrap items-center gap-3">
              <Button type="submit" isLoading={isSaving} disabled={!offline.isSupported}>
                Guardar borrador local
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

      <Card className="border-slate-200 bg-white">
        <p className="text-sm text-slate-500">Cobertura funcional</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Registro diario de ventas ligado a asistencia existente. La cola offline ya cubre
          captura local; la siguiente iteracion debe cerrar confirmacion al check-out y detalle por
          producto o linea.
        </p>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Ventas recientes</h2>
          <p className="mt-1 text-sm text-slate-500">
            Base comercial diaria ligada a jornada y lista para alimentar cuotas, reportes y nomina.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
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
                  <tr key={venta.id} className="border-t border-slate-100 align-top">
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
                      <div className="mt-1 text-xs text-slate-400">
                        ${venta.totalMonto.toFixed(2)}
                      </div>
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
                      {venta.observaciones && (
                        <div className="mt-2 text-xs text-slate-500">{venta.observaciones}</div>
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-slate-200 bg-white">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </Card>
  )
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
