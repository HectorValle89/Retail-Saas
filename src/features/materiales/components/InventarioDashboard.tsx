'use client';

import { useMemo, useState } from 'react';
import { Card, Select } from '@/components/ui';
import type { ActorActual } from '@/lib/auth/session';
import type { StockActual, EstadoCaducidad, CategoriaProducto } from '../types/inventario';

// ─── Types ───────────────────────────────────────────

interface InventarioKpis {
  stock_total_fisico: number;
  stock_total_comprometido: number;
  stock_total_disponible: number;
  productos_por_vencer: number;
  productos_vencidos: number;
  skus_activos: number;
  lotes_activos: number;
}

interface DispersionResumen {
  planeadas: number;
  en_transito: number;
  entregadas: number;
  canceladas: number;
}

export interface InventarioDashboardData {
  kpis: InventarioKpis;
  stock: StockActual[];
  dispersiones: DispersionResumen;
  categorias: CategoriaProducto[];
}

// ─── Main Component ──────────────────────────────────

export function InventarioDashboard({
  actor,
  data,
}: {
  actor: ActorActual;
  data: InventarioDashboardData;
}) {
  const [filtroCategoria, setFiltroCategoria] = useState<string>('');
  const [filtroCaducidad, setFiltroCaducidad] = useState<string>('');
  const [busqueda, setBusqueda] = useState('');

  const stockFiltrado = useMemo(() => {
    let resultado = data.stock;
    if (filtroCategoria) {
      resultado = resultado.filter((s) => s.categoria === filtroCategoria);
    }
    if (filtroCaducidad) {
      resultado = resultado.filter((s) => s.estado_caducidad === filtroCaducidad);
    }
    if (busqueda.trim()) {
      const term = busqueda.toLowerCase();
      resultado = resultado.filter(
        (s) =>
          s.sku.toLowerCase().includes(term) ||
          s.descripcion.toLowerCase().includes(term) ||
          (s.numero_lote?.toLowerCase().includes(term) ?? false)
      );
    }
    return resultado;
  }, [data.stock, filtroCategoria, filtroCaducidad, busqueda]);

  return (
    <div className="space-y-6">
      {/* KPIs principales */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-7">
        <KpiCard
          label="Stock físico"
          value={formatNumber(data.kpis.stock_total_fisico)}
          tone="slate"
        />
        <KpiCard
          label="Comprometido"
          value={formatNumber(data.kpis.stock_total_comprometido)}
          tone="amber"
        />
        <KpiCard
          label="Disponible"
          value={formatNumber(data.kpis.stock_total_disponible)}
          tone="emerald"
        />
        <KpiCard
          label="Por vencer"
          value={formatNumber(data.kpis.productos_por_vencer)}
          tone="amber"
          alert={data.kpis.productos_por_vencer > 0}
        />
        <KpiCard
          label="Vencidos"
          value={formatNumber(data.kpis.productos_vencidos)}
          tone="rose"
          alert={data.kpis.productos_vencidos > 0}
        />
        <KpiCard label="SKUs activos" value={String(data.kpis.skus_activos)} tone="sky" />
        <KpiCard label="Lotes activos" value={String(data.kpis.lotes_activos)} tone="sky" />
      </div>

      {/* Dispersiones resumen */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <DispersionCard label="Planeadas" value={data.dispersiones.planeadas} tone="sky" />
        <DispersionCard label="En tránsito" value={data.dispersiones.en_transito} tone="amber" />
        <DispersionCard label="Entregadas" value={data.dispersiones.entregadas} tone="emerald" />
        <DispersionCard label="Canceladas" value={data.dispersiones.canceladas} tone="slate" />
      </div>

      {/* Filtros */}
      <Card className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Buscar</label>
          <input
            type="text"
            placeholder="SKU, descripción o lote..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
        </div>
        <Select
          label="Categoría"
          options={[
            { value: '', label: 'Todas' },
            ...data.categorias.map((c) => ({ value: c, label: c })),
          ]}
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
        />
        <Select
          label="Caducidad"
          options={[
            { value: '', label: 'Todos' },
            { value: 'VIGENTE', label: '🟢 Vigente' },
            { value: 'PROXIMO_VENCER', label: '🟡 Próximo a vencer' },
            { value: 'VENCIDO', label: '🔴 Vencido' },
          ]}
          value={filtroCaducidad}
          onChange={(e) => setFiltroCaducidad(e.target.value)}
        />
      </Card>

      {/* Tabla de stock */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
                Stock por producto y lote
              </p>
              <p className="mt-1 text-sm text-slate-500">{stockFiltrado.length} registros</p>
            </div>
          </div>
        </div>

        {stockFiltrado.length === 0 ? (
          <div className="px-6 py-10 text-center text-slate-500">
            No hay productos que coincidan con los filtros actuales.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Lote</th>
                  <th className="px-4 py-3">Caducidad</th>
                  <th className="px-4 py-3 text-right">Físico</th>
                  <th className="px-4 py-3 text-right">Comprometido</th>
                  <th className="px-4 py-3 text-right">Disponible</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stockFiltrado.slice(0, 100).map((row, idx) => (
                  <StockRow
                    key={`${row.producto_catalogo_id}-${row.producto_lote_id ?? idx}`}
                    row={row}
                  />
                ))}
              </tbody>
            </table>
            {stockFiltrado.length > 100 && (
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-center text-xs text-slate-500">
                Mostrando 100 de {stockFiltrado.length} registros. Usa los filtros para refinar.
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────

function StockRow({ row }: { row: StockActual }) {
  const caducidadConfig = CADUCIDAD_CONFIG[row.estado_caducidad];

  return (
    <tr className="hover:bg-slate-50 transition-colors duration-100">
      <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700">{row.sku}</td>
      <td className="px-4 py-3 text-slate-900">{row.descripcion}</td>
      <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.numero_lote ?? '—'}</td>
      <td className="px-4 py-3 text-xs text-slate-600">
        {row.fecha_caducidad ? formatDate(row.fecha_caducidad) : '—'}
      </td>
      <td className="px-4 py-3 text-right font-medium text-slate-900">
        {formatNumber(row.stock_fisico)}
      </td>
      <td className="px-4 py-3 text-right text-amber-700">
        {row.stock_comprometido > 0 ? formatNumber(row.stock_comprometido) : '—'}
      </td>
      <td
        className={`px-4 py-3 text-right font-semibold ${
          row.stock_disponible <= 0 ? 'text-rose-600' : 'text-emerald-700'
        }`}
      >
        {formatNumber(row.stock_disponible)}
      </td>
      <td className="px-4 py-3 text-center">
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${caducidadConfig.className}`}
        >
          {caducidadConfig.label}
        </span>
      </td>
    </tr>
  );
}

function KpiCard({
  label,
  value,
  tone,
  alert,
}: {
  label: string;
  value: string;
  tone: 'slate' | 'emerald' | 'amber' | 'rose' | 'sky';
  alert?: boolean;
}) {
  const bgClass = alert
    ? tone === 'rose'
      ? 'border-rose-200 bg-rose-50'
      : 'border-amber-200 bg-amber-50'
    : 'border-slate-200 bg-white';

  const valueClass =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : tone === 'rose'
          ? 'text-rose-600'
          : tone === 'sky'
            ? 'text-sky-700'
            : 'text-slate-900';

  return (
    <div className={`rounded-[18px] border p-4 ${bgClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-bold ${valueClass}`}>
        {alert ? '⚠️ ' : ''}
        {value}
      </p>
    </div>
  );
}

function DispersionCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'sky' | 'amber' | 'emerald' | 'slate';
}) {
  const colorClass =
    tone === 'sky'
      ? 'border-sky-200 bg-sky-50 text-sky-800'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : tone === 'emerald'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <div className={`rounded-[18px] border p-4 ${colorClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}

// ─── Config & Helpers ────────────────────────────────

const CADUCIDAD_CONFIG: Record<EstadoCaducidad, { label: string; className: string }> = {
  VIGENTE: { label: 'Vigente', className: 'bg-emerald-100 text-emerald-700' },
  PROXIMO_VENCER: { label: 'Por vencer', className: 'bg-amber-100 text-amber-800' },
  VENCIDO: { label: 'Vencido', className: 'bg-rose-100 text-rose-700' },
  SIN_LOTE: { label: 'Sin lote', className: 'bg-slate-100 text-slate-600' },
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('es-MX').format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(
    new Date(`${value}T00:00:00`)
  );
}