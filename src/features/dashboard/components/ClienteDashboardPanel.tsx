'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import type {
  ClienteDashboardData,
  ClienteDashboardMaterialProgress,
  ClienteDashboardTrendDay,
  ClienteDashboardAlertItem,
  ClienteDashboardDesabastoItem,
  ClienteDashboardCatalogOption,
} from '@/features/dashboard/services/clienteDashboardService';

/* ─────────────────────────── Helpers ─────────────────────────── */

function cls(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function formatNum(n: number) {
  return n.toLocaleString('es-MX');
}

function pctLabel(pct: number) {
  return `${pct.toFixed(1)}%`;
}

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function periodLabel(periodo: string) {
  const [y, m] = periodo.split('-');
  const months = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  return `${months[Number(m)] ?? m} ${y}`;
}

/* ────────────────────── SVG Trend Chart ──────────────────────── */

const CHART_COLORS = {
  ventas: { line: '#2CB67D', fill: 'rgba(44,182,125,0.10)' },
  canjes: { line: '#7C5DFA', fill: 'rgba(124,93,250,0.08)' },
  loveIsdin: { line: '#F59E0B', fill: 'rgba(245,158,11,0.08)' },
  desabasto: { line: '#EF4444', fill: 'rgba(239,68,68,0.08)' },
};

function MiniTrendChart({
  data,
  visibleSeries,
}: {
  data: ClienteDashboardTrendDay[];
  visibleSeries: Set<string>;
}) {
  if (!data.length) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400">
        Sin datos de tendencia disponibles
      </div>
    );
  }

  const W = 800;
  const H = 200;
  const PAD_L = 48;
  const PAD_R = 16;
  const PAD_T = 12;
  const PAD_B = 36;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const seriesKeys = ['ventas', 'canjes', 'loveIsdin', 'desabasto'] as const;
  const activeKeys = seriesKeys.filter((k) => visibleSeries.has(k));

  const maxVal = Math.max(
    1,
    ...data.flatMap((d) => activeKeys.map((k) => d[k]))
  );

  const xStep = data.length > 1 ? plotW / (data.length - 1) : plotW;

  function buildPath(key: keyof ClienteDashboardTrendDay) {
    let d = '';
    for (let i = 0; i < data.length; i++) {
      const x = PAD_L + i * xStep;
      const y = PAD_T + plotH - ((data[i][key] as number) / maxVal) * plotH;
      d += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
    }
    return d;
  }

  function buildAreaPath(key: keyof ClienteDashboardTrendDay) {
    const linePath = buildPath(key);
    const lastX = PAD_L + (data.length - 1) * xStep;
    const baseY = PAD_T + plotH;
    return `${linePath} L${lastX},${baseY} L${PAD_L},${baseY} Z`;
  }

  // Y-axis grid lines
  const gridLines = 4;
  const gridYs = Array.from({ length: gridLines + 1 }, (_, i) => ({
    y: PAD_T + (plotH / gridLines) * i,
    label: formatNum(Math.round(maxVal - (maxVal / gridLines) * i)),
  }));

  // X-axis labels (show every ~5th day to avoid clutter)
  const labelStep = Math.max(1, Math.floor(data.length / 7));
  const xLabels = data
    .filter((_, i) => i % labelStep === 0 || i === data.length - 1)
    .map((d, idx, arr) => ({
      x: PAD_L + data.indexOf(d) * xStep,
      label: d.diaLabel,
    }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Grid */}
      {gridYs.map((g, i) => (
        <g key={i}>
          <line
            x1={PAD_L}
            y1={g.y}
            x2={W - PAD_R}
            y2={g.y}
            stroke="#E2E8F0"
            strokeWidth={0.5}
            strokeDasharray={i === gridLines ? undefined : '4 3'}
          />
          <text x={PAD_L - 8} y={g.y + 3} textAnchor="end" fontSize="9" fill="#94A3B8">
            {g.label}
          </text>
        </g>
      ))}

      {/* X labels */}
      {xLabels.map((xl, i) => (
        <text key={i} x={xl.x} y={H - 8} textAnchor="middle" fontSize="9" fill="#94A3B8">
          {xl.label}
        </text>
      ))}

      {/* Series areas and lines */}
      {activeKeys.map((key) => {
        const colors = CHART_COLORS[key];
        return (
          <g key={key}>
            <path d={buildAreaPath(key)} fill={colors.fill} />
            <path d={buildPath(key)} fill="none" stroke={colors.line} strokeWidth={2} strokeLinejoin="round" />
          </g>
        );
      })}

      {/* Dots on last data point with value */}
      {activeKeys.map((key) => {
        const colors = CHART_COLORS[key];
        const lastIdx = data.length - 1;
        const todayData = data.find(d => {
          const val = d[key] as number;
          return val > 0;
        });
        if (!todayData) return null;
        const idx = data.indexOf(todayData);
        const lastWithData = [...data].reverse().find(d => (d[key] as number) > 0);
        if (!lastWithData) return null;
        const lastDataIdx = data.indexOf(lastWithData);
        const x = PAD_L + lastDataIdx * xStep;
        const y = PAD_T + plotH - ((lastWithData[key] as number) / maxVal) * plotH;
        return (
          <g key={`dot-${key}`}>
            <circle cx={x} cy={y} r={4} fill="white" stroke={colors.line} strokeWidth={2} />
          </g>
        );
      })}
    </svg>
  );
}

/* ────────────────────── KPI Stat Card ────────────────────────── */

interface KpiStatProps {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  gradientFrom: string;
  gradientTo: string;
  iconBg: string;
}

function KpiStat({ label, value, subtitle, icon, gradientFrom, gradientTo, iconBg }: KpiStatProps) {
  return (
    <div
      className={cls(
        'relative overflow-hidden rounded-2xl border border-white/20 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)]',
        'transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.1)] hover:-translate-y-0.5'
      )}
      style={{
        background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">{label}</p>
          <p className="mt-1.5 text-2xl font-bold leading-none tracking-tight text-white sm:text-3xl">
            {value}
          </p>
          {subtitle && (
            <p className="mt-1.5 text-[11px] font-medium text-white/60">{subtitle}</p>
          )}
        </div>
        <span
          className={cls(
            'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            iconBg
          )}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}

/* ───────────── Progress Bar for Material Canjes ──────────────── */

function MaterialProgressBar({ material }: { material: ClienteDashboardMaterialProgress }) {
  const pct = Math.min(material.porcentajeAvance, 100);
  const isComplete = pct >= 100;
  const isLow = pct < 25;

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800 line-clamp-1">{material.materialNombre}</p>
        <span
          className={cls(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide',
            isComplete
              ? 'bg-emerald-100 text-emerald-700'
              : isLow
                ? 'bg-amber-100 text-amber-700'
                : 'bg-violet-100 text-violet-700'
          )}
        >
          {pctLabel(material.porcentajeAvance)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cls(
            'h-full rounded-full transition-all duration-700 ease-out',
            isComplete
              ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
              : isLow
                ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                : 'bg-gradient-to-r from-violet-400 to-violet-500'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Details row */}
      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
        <span>
          Entregados: <strong className="text-slate-700">{formatNum(material.canjesEntregados)}</strong>
        </span>
        <span>
          Inventario: <strong className="text-slate-700">{formatNum(material.inventarioInicial)}</strong>
        </span>
        <span>
          Restante: <strong className="text-slate-700">{formatNum(material.stockActual)}</strong>
        </span>
      </div>
    </div>
  );
}

/* ─────────────────── Alert Row Component ─────────────────────── */

function AlertRow({ alert }: { alert: ClienteDashboardAlertItem }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/50 px-3.5 py-2.5 transition-all hover:bg-amber-50">
      {/* Warning icon */}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
        <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900 line-clamp-1">
          {alert.empleadoNombre}
        </p>
        <p className="text-[11px] text-amber-700 line-clamp-1">
          {alert.pdvNombre} {alert.pdvClaveBtl ? `(${alert.pdvClaveBtl})` : ''}
          <span className="ml-1.5 text-amber-500">· Sup: {alert.supervisorNombre}</span>
        </p>
      </div>

      <span className="shrink-0 rounded-full bg-amber-200/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800">
        Sin registro
      </span>
    </div>
  );
}

/* ─────────────── Desabasto Row Component ─────────────────────── */

function DesabastoRow({ item }: { item: ClienteDashboardDesabastoItem }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50/30 px-3.5 py-2.5 transition-all hover:bg-red-50/60">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100">
        <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-red-900 line-clamp-1">
          {item.productoNombre}
        </p>
        <p className="text-[11px] text-red-700 line-clamp-1">
          {item.pdvNombre} {item.pdvClaveBtl ? `(${item.pdvClaveBtl})` : ''}
          <span className="ml-1.5 text-red-500">· {item.fecha}</span>
        </p>
        {item.observaciones && (
          <p className="mt-0.5 text-[10px] italic text-red-500 line-clamp-1">{item.observaciones}</p>
        )}
      </div>
    </div>
  );
}

/* ──────────────────── Series Legend Toggle ────────────────────── */

function SeriesLegend({
  visibleSeries,
  onToggle,
}: {
  visibleSeries: Set<string>;
  onToggle: (key: string) => void;
}) {
  const items = [
    { key: 'ventas', label: 'Ventas', color: CHART_COLORS.ventas.line },
    { key: 'canjes', label: 'Canjes', color: CHART_COLORS.canjes.line },
    { key: 'loveIsdin', label: 'Love ISDIN', color: CHART_COLORS.loveIsdin.line },
    { key: 'desabasto', label: 'Desabasto', color: CHART_COLORS.desabasto.line },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active = visibleSeries.has(item.key);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onToggle(item.key)}
            className={cls(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all',
              active
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
            )}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: active ? item.color : '#CBD5E1',
              }}
            />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/* ──────────────────── Filter Bar Component ────────────────────── */

function FilterBar({
  cadenas,
  tiendas,
  selectedCadenaId,
  selectedPdvId,
  periodo,
  onCadenaChange,
  onPdvChange,
  onPeriodoChange,
}: {
  cadenas: ClienteDashboardCatalogOption[];
  tiendas: ClienteDashboardCatalogOption[];
  selectedCadenaId: string;
  selectedPdvId: string;
  periodo: string;
  onCadenaChange: (id: string) => void;
  onPdvChange: (id: string) => void;
  onPeriodoChange: (p: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Periodo */}
      <input
        type="month"
        value={periodo}
        onChange={(e) => onPeriodoChange(e.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition-all focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
      />

      {/* Cadena */}
      <select
        value={selectedCadenaId}
        onChange={(e) => onCadenaChange(e.target.value)}
        className="min-w-[140px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition-all focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
      >
        <option value="">Todas las cadenas</option>
        {cadenas.map((c) => (
          <option key={c.id} value={c.id}>{c.nombre}</option>
        ))}
      </select>

      {/* Tienda */}
      <select
        value={selectedPdvId}
        onChange={(e) => onPdvChange(e.target.value)}
        className="min-w-[160px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition-all focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
      >
        <option value="">Todas las tiendas</option>
        {tiendas.map((t) => (
          <option key={t.id} value={t.id}>{t.nombre}</option>
        ))}
      </select>
    </div>
  );
}

/* ═════════════════════ MAIN DASHBOARD ═════════════════════════ */

export function ClienteDashboardPanel({ initialData }: { initialData: ClienteDashboardData }) {
  const [data, setData] = useState(initialData);
  const [periodo, setPeriodo] = useState(initialData.periodoSeleccionado || getCurrentPeriod());
  const [cadenaId, setCadenaId] = useState('');
  const [pdvId, setPdvId] = useState('');
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(
    new Set(['ventas', 'canjes', 'loveIsdin', 'desabasto'])
  );
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: string, c: string, pdv: string) => {
    setLoading(true);
    setLastError(null);
    try {
      const params = new URLSearchParams();
      if (p) params.set('periodo', p);
      if (c) params.set('cadenaId', c);
      if (pdv) params.set('pdvId', pdv);
      const res = await fetch(`/api/dashboard/cliente-panel?${params.toString()}`);
      if (!res.ok) throw new Error('Error al cargar datos');
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch on filter change
  useEffect(() => {
    fetchData(periodo, cadenaId, pdvId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, cadenaId, pdvId]);

  const handleToggleSeries = useCallback((key: string) => {
    setVisibleSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const { resumen, materiales, tendencia, alertas, desabastos, catalogos } = data;

  return (
    <div className="animate-fade-in space-y-6">
      {/* ──── Header ──── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Panel del Cliente
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {periodLabel(data.periodoSeleccionado)} · Actualizado{' '}
            {new Date(data.refreshedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <FilterBar
          cadenas={catalogos.cadenas}
          tiendas={catalogos.tiendas}
          selectedCadenaId={cadenaId}
          selectedPdvId={pdvId}
          periodo={periodo}
          onCadenaChange={(id) => { setCadenaId(id); setPdvId(''); }}
          onPdvChange={setPdvId}
          onPeriodoChange={setPeriodo}
        />
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2 text-sm text-primary-700">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} strokeDasharray="31.4" strokeLinecap="round" />
          </svg>
          Actualizando datos…
        </div>
      )}

      {lastError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {lastError}
        </div>
      )}

      {/* ──── KPI Cards ──── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiStat
          label="Avance de Canjes"
          value={pctLabel(resumen.porcentajeAvanceCanjes)}
          subtitle={`${formatNum(resumen.totalCanjesEntregados)} de ${formatNum(resumen.totalInventarioInicialCanjes)}`}
          gradientFrom="#7C5DFA"
          gradientTo="#A78BFA"
          iconBg="bg-white/20"
          icon={
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
            </svg>
          }
        />
        <KpiStat
          label="Total Ventas"
          value={formatNum(resumen.totalVentas)}
          subtitle="unidades en el periodo"
          gradientFrom="#2CB67D"
          gradientTo="#34D399"
          iconBg="bg-white/20"
          icon={
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
            </svg>
          }
        />
        <KpiStat
          label="Love ISDIN"
          value={formatNum(resumen.totalLoveIsdin)}
          subtitle="registros de fidelización"
          gradientFrom="#F59E0B"
          gradientTo="#FBBF24"
          iconBg="bg-white/20"
          icon={
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
          }
        />
        <KpiStat
          label="Desabastos"
          value={formatNum(resumen.totalDesabastos)}
          subtitle="reportes de falta de producto"
          gradientFrom="#EF4444"
          gradientTo="#F87171"
          iconBg="bg-white/20"
          icon={
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          }
        />
      </div>

      {/* ──── Trend Chart ──── */}
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-base font-bold text-slate-800">Tendencia Diaria</h2>
            <p className="text-[11px] text-slate-500">Evolución de indicadores día a día</p>
          </div>
          <SeriesLegend visibleSeries={visibleSeries} onToggle={handleToggleSeries} />
        </div>
        <div className="mt-4">
          <MiniTrendChart data={tendencia} visibleSeries={visibleSeries} />
        </div>
      </div>

      {/* ──── Two-Column Section: Materials + Alerts ──── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Materials Progress */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-heading text-base font-bold text-slate-800">Avance por Material de Canje</h2>
              <p className="text-[11px] text-slate-500">{materiales.length} material{materiales.length !== 1 ? 'es' : ''} activo{materiales.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
            {materiales.length > 0 ? (
              materiales.map((m) => <MaterialProgressBar key={m.materialId} material={m} />)
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">Sin materiales de canje cargados</p>
            )}
          </div>
        </div>

        {/* Alerts */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-heading text-base font-bold text-slate-800">
                Alertas de Registro
                {alertas.length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                    {alertas.length}
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-500">Dermoconsejeras sin capturas hoy</p>
            </div>
          </div>
          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {alertas.length > 0 ? (
              alertas.map((a) => <AlertRow key={a.id} alert={a} />)
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                  <svg className="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <p className="text-sm font-medium text-emerald-700">Todo al día</p>
                <p className="text-[11px] text-slate-400">Todo el equipo ha reportado actividad hoy</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ──── Desabastos Table ──── */}
      {desabastos.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="font-heading text-base font-bold text-slate-800">
              Reportes de Desabasto
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                {desabastos.length}
              </span>
            </h2>
            <p className="text-[11px] text-slate-500">Productos sin existencia reportados por el equipo de campo</p>
          </div>
          <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
            {desabastos.map((d) => (
              <DesabastoRow key={d.id} item={d} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────── Server Wrapper for initial SSR load ─────── */

export { ClienteDashboardPanel as default };
