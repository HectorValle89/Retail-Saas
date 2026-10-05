'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
    '',
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
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

  const maxVal = Math.max(1, ...data.flatMap((d) => activeKeys.map((k) => d[k])));

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
            <path
              d={buildPath(key)}
              fill="none"
              stroke={colors.line}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </g>
        );
      })}

      {/* Dots on last data point with value */}
      {activeKeys.map((key) => {
        const colors = CHART_COLORS[key];
        const lastIdx = data.length - 1;
        const todayData = data.find((d) => {
          const val = d[key] as number;
          return val > 0;
        });
        if (!todayData) return null;
        const idx = data.indexOf(todayData);
        const lastWithData = [...data].reverse().find((d) => (d[key] as number) > 0);
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
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-bold leading-none tracking-tight text-white sm:text-3xl">
            {value}
          </p>
          {subtitle && <p className="mt-1.5 text-[11px] font-medium text-white/60">{subtitle}</p>}
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
        <p className="text-sm font-semibold text-slate-800 line-clamp-1">
          {material.materialNombre}
        </p>
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
          Entregados:{' '}
          <strong className="text-slate-700">{formatNum(material.canjesEntregados)}</strong>
        </span>
        <span>
          Inventario:{' '}
          <strong className="text-slate-700">{formatNum(material.inventarioInicial)}</strong>
        </span>
        <span>
          Restante: <strong className="text-slate-700">{formatNum(material.stockActual)}</strong>
        </span>
      </div>
    </div>
  );
}

/* ─────────────── Desabasto Row Component ─────────────────────── */

function DesabastoRow({ item }: { item: ClienteDashboardDesabastoItem }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50/30 px-3.5 py-2.5 transition-all hover:bg-red-50/60">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100">
        <svg
          className="h-4 w-4 text-red-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
          />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-red-900 line-clamp-1">{item.productoNombre}</p>
        <p className="text-[11px] text-red-700 line-clamp-1">
          {item.pdvNombre} {item.pdvClaveBtl ? `(${item.pdvClaveBtl})` : ''}
          <span className="ml-1.5 text-red-500">· {item.fecha}</span>
        </p>
        {item.observaciones && (
          <p className="mt-0.5 text-[10px] italic text-red-500 line-clamp-1">
            {item.observaciones}
          </p>
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
  supervisores,
  selectedCadenaId,
  selectedPdvId,
  selectedSupervisorId,
  periodo,
  fecha,
  onCadenaChange,
  onPdvChange,
  onSupervisorChange,
  onPeriodoChange,
  onFechaChange,
  isSupervisorMode = false,
}: {
  cadenas: ClienteDashboardCatalogOption[];
  tiendas: ClienteDashboardCatalogOption[];
  supervisores: ClienteDashboardCatalogOption[];
  selectedCadenaId: string;
  selectedPdvId: string;
  selectedSupervisorId: string;
  periodo: string;
  fecha: string;
  onCadenaChange: (id: string) => void;
  onPdvChange: (id: string) => void;
  onSupervisorChange: (id: string) => void;
  onPeriodoChange: (p: string) => void;
  onFechaChange: (f: string) => void;
  isSupervisorMode?: boolean;
}) {
  const dateLimits = useMemo(() => {
    if (!periodo) return { min: undefined, max: undefined };
    const [y, m] = periodo.split('-');
    const lastDay = new Date(Number(y), Number(m), 0).getDate();
    return {
      min: `${periodo}-01`,
      max: `${periodo}-${String(lastDay).padStart(2, '0')}`,
    };
  }, [periodo]);

  const handleDayOffset = (offset: number) => {
    const baseDateStr = fecha || `${periodo}-01`;
    const current = new Date(baseDateStr + 'T12:00:00');
    current.setDate(current.getDate() + offset);

    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const formatted = `${y}-${m}-${d}`;

    if (dateLimits.min && formatted < dateLimits.min) return;
    if (dateLimits.max && formatted > dateLimits.max) return;

    onFechaChange(formatted);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/90 p-2 shadow-2xs backdrop-blur-xs">
      {/* Selector de Mes/Periodo */}
      <div className="relative flex items-center">
        <span className="pointer-events-none absolute left-3 text-slate-400 text-xs">📅</span>
        <input
          type="month"
          value={periodo}
          onChange={(e) => {
            onPeriodoChange(e.target.value);
            onFechaChange(''); // Resetear fecha al cambiar de mes
          }}
          className="h-9 rounded-xl border border-slate-200/90 bg-slate-50/70 pl-8 pr-2.5 text-xs font-bold text-slate-700 shadow-2xs transition-all hover:bg-white hover:border-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 cursor-pointer"
        />
      </div>

      {/* Navegador de Día con flechas elegantes */}
      <div className="flex items-center rounded-xl border border-slate-200/90 bg-slate-50/70 shadow-2xs p-0.5">
        <button
          type="button"
          onClick={() => handleDayOffset(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-xs active:scale-95 transition-all text-xs font-bold"
          title="Día anterior"
        >
          ◀
        </button>
        <div className="relative flex items-center">
          <input
            type="date"
            value={fecha}
            min={dateLimits.min}
            max={dateLimits.max}
            onChange={(e) => onFechaChange(e.target.value)}
            className="h-8 rounded-lg border-0 bg-transparent px-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-0 cursor-pointer"
          />
          {fecha && (
            <button
              type="button"
              onClick={() => onFechaChange('')}
              className="mr-1 text-slate-400 hover:text-slate-700 text-xs font-bold p-1 rounded-md hover:bg-slate-200/60"
              title="Ver todo el mes"
            >
              ✕
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => handleDayOffset(1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-xs active:scale-95 transition-all text-xs font-bold"
          title="Siguiente día"
        >
          ▶
        </button>
      </div>

      {/* Supervisor (Oculto en modo supervisor) */}
      {!isSupervisorMode && (
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-3 text-slate-400 text-xs">👤</span>
          <select
            value={selectedSupervisorId}
            onChange={(e) => onSupervisorChange(e.target.value)}
            className="h-9 min-w-[140px] max-w-[190px] truncate rounded-xl border border-slate-200/90 bg-slate-50/70 pl-8 pr-7 text-xs font-bold text-slate-700 shadow-2xs transition-all hover:bg-white hover:border-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 cursor-pointer appearance-none"
          >
            <option value="">Todos los supervisores</option>
            {supervisores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 text-slate-400 text-[10px]">▼</span>
        </div>
      )}

      {/* Cadena */}
      <div className="relative flex items-center">
        <span className="pointer-events-none absolute left-3 text-slate-400 text-xs">🏢</span>
        <select
          value={selectedCadenaId}
          onChange={(e) => onCadenaChange(e.target.value)}
          className="h-9 min-w-[130px] rounded-xl border border-slate-200/90 bg-slate-50/70 pl-8 pr-7 text-xs font-bold text-slate-700 shadow-2xs transition-all hover:bg-white hover:border-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 cursor-pointer appearance-none"
        >
          <option value="">Todas las cadenas</option>
          {cadenas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 text-slate-400 text-[10px]">▼</span>
      </div>

      {/* Tienda */}
      <div className="relative flex items-center">
        <span className="pointer-events-none absolute left-3 text-slate-400 text-xs">🏪</span>
        <select
          value={selectedPdvId}
          onChange={(e) => onPdvChange(e.target.value)}
          className="h-9 min-w-[150px] max-w-[220px] truncate rounded-xl border border-slate-200/90 bg-slate-50/70 pl-8 pr-7 text-xs font-bold text-slate-700 shadow-2xs transition-all hover:bg-white hover:border-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 cursor-pointer appearance-none"
        >
          <option value="">Todas las tiendas</option>
          {tiendas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 text-slate-400 text-[10px]">▼</span>
      </div>
    </div>
  );
}

/* ═════════════════════ MAIN DASHBOARD ═════════════════════════ */

export function ClienteDashboardPanel({
  initialData,
  isSupervisorMode = false,
}: {
  initialData: ClienteDashboardData;
  isSupervisorMode?: boolean;
}) {
  const [data, setData] = useState(initialData);
  const [periodo, setPeriodo] = useState(initialData.periodoSeleccionado || getCurrentPeriod());
  const [fecha, setFecha] = useState(initialData.fechaSeleccionada || '');
  const [cadenaId, setCadenaId] = useState('');
  const [pdvId, setPdvId] = useState('');
  const [supervisorId, setSupervisorId] = useState(() => {
    if (isSupervisorMode && initialData.supervisoresProgress?.[0]?.id) {
      return initialData.supervisoresProgress[0].id;
    }
    return '';
  });
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(
    new Set(['ventas', 'canjes', 'loveIsdin', 'desabasto'])
  );
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Nuevo estado para la navegación por pestañas
  const [activeTab, setActiveTab] = useState<'resumen' | 'pendientes'>('resumen');
  // Estado para rastrear el ID del supervisor que se está copiando
  const [copiandoId, setCopiandoId] = useState<string | null>(null);

  const fetchData = useCallback(
    async (p: string, c: string, pdv: string, sup: string, f: string) => {
      setLoading(true);
      setLastError(null);
      try {
        const params = new URLSearchParams();
        if (p) params.set('periodo', p);
        if (c) params.set('cadenaId', c);
        if (pdv) params.set('pdvId', pdv);
        if (sup) params.set('supervisorId', sup);
        if (f) params.set('fecha', f);
        const res = await fetch(`/api/dashboard/cliente-panel?${params.toString()}`);
        if (!res.ok) throw new Error('Error al cargar datos');
        const json = await res.json();
        setData(json.data);
      } catch (err) {
        setLastError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Refetch on filter change
  useEffect(() => {
    fetchData(periodo, cadenaId, pdvId, supervisorId, fecha);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, cadenaId, pdvId, supervisorId, fecha]);

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

  const {
    resumen,
    materiales,
    tendencia,
    alertas,
    desabastos,
    supervisoresProgress = [],
    catalogos,
  } = data;

  // Estado para sub-pestaña activa dentro de la tarjeta de cada supervisor (pendientes | cumplidas | todos)
  const [subTabMap, setSubTabMap] = useState<Record<string, 'pendientes' | 'cumplidas' | 'todos'>>({});

  // Agrupar las alertas y dermoes al día por supervisor
  const alertasAgrupadas = useMemo(() => {
    const map = new Map<
      string,
      {
        supervisorId: string;
        supervisorNombre: string;
        totalCumplidas: number;
        totalProgramadas: number;
        pendientes: ClienteDashboardAlertItem[];
        cumplidas: ClienteDashboardAlertItem[];
      }
    >();

    // Inicializar con la lista de supervisores y su avance
    for (const sup of supervisoresProgress) {
      map.set(sup.id, {
        supervisorId: sup.id,
        supervisorNombre: sup.nombre,
        totalCumplidas: sup.totalCumplidas,
        totalProgramadas: sup.totalProgramadas,
        pendientes: [],
        cumplidas: [],
      });
    }

    // Agregar las alertas a sus respectivos supervisores
    for (const alert of alertas) {
      const supId = alert.supervisorId || 'SIN_SUPERVISOR';
      if (!map.has(supId)) {
        map.set(supId, {
          supervisorId: supId,
          supervisorNombre: alert.supervisorNombre || 'Sin supervisor asignado',
          totalCumplidas: 0,
          totalProgramadas: 0,
          pendientes: [],
          cumplidas: [],
        });
      }
      map.get(supId)!.pendientes.push(alert);
    }

    // Agregar las cumplidas a sus respectivos supervisores
    for (const item of (data.cumplidas ?? [])) {
      const supId = item.supervisorId || 'SIN_SUPERVISOR';
      if (!map.has(supId)) {
        map.set(supId, {
          supervisorId: supId,
          supervisorNombre: item.supervisorNombre || 'Sin supervisor asignado',
          totalCumplidas: 0,
          totalProgramadas: 0,
          pendientes: [],
          cumplidas: [],
        });
      }
      map.get(supId)!.cumplidas.push(item);
    }

    let result = Array.from(map.values());

    // Si es modo supervisor o hay supervisor seleccionado, FILTRAMOS ESTRICTAMENTE
    // para que SOLAMENTE se muestre el equipo del supervisor autenticado (o seleccionado)
    if (isSupervisorMode || supervisorId) {
      const targetId = supervisorId || (isSupervisorMode && result[0]?.supervisorId);
      if (targetId) {
        result = result.filter((g) => g.supervisorId === targetId);
      }
    }

    return result.sort((a, b) =>
      a.supervisorNombre.localeCompare(b.supervisorNombre, 'es')
    );
  }, [alertas, data.cumplidas, supervisoresProgress, isSupervisorMode, supervisorId]);

  // Copiar reporte para WhatsApp con formato limpio, minimalista y ordenado
  const handleCopiarWhatsApp = useCallback(
    (
      supNombre: string,
      fechaDia: string,
      pendientes: ClienteDashboardAlertItem[],
      cumplidas: ClienteDashboardAlertItem[],
      id: string
    ) => {
      const diaFormatted = fechaDia ? fechaDia.split('-').reverse().join('/') : 'Hoy';
      const totalProg = pendientes.length + cumplidas.length;
      const pct = totalProg > 0 ? Math.round((cumplidas.length / totalProg) * 100) : 0;

      let texto = `*📊 REPORTE DE CAMPO (${diaFormatted})*\n`;
      texto += `👤 *Supervisor:* ${supNombre}\n`;
      texto += `📈 *Avance:* ${cumplidas.length} de ${totalProg} dermos (${pct}%)\n`;

      if (cumplidas.length > 0) {
        texto += `\n✅ *REPORTES ENVIADOS (${cumplidas.length}):*\n`;
        cumplidas.forEach((c) => {
          const btl = c.pdvClaveBtl ? ` (${c.pdvClaveBtl})` : '';
          const ventasText = c.ventasOLove ? ` - ${c.ventasOLove} ventas/love` : '';
          texto += `• *${c.empleadoNombre}* - ${c.pdvNombre}${btl}${ventasText}\n`;
        });
      }

      if (pendientes.length === 0) {
        texto += `\n✨ *¡100% de reportes completados! Todo el equipo al día.*`;
      } else {
        const vacios = pendientes.filter((p) => p.tipo === 'vacio' || !p.tipo);
        const incompletos = pendientes.filter((p) => p.tipo === 'incompleto');

        if (vacios.length > 0) {
          texto += `\n🚫 *SIN REPORTES HOY (${vacios.length}):*\n`;
          vacios.forEach((p) => {
            const btl = p.pdvClaveBtl ? ` (${p.pdvClaveBtl})` : '';
            texto += `• *${p.empleadoNombre}* - ${p.pdvNombre}${btl}\n`;
          });
        }

        if (incompletos.length > 0) {
          texto += `\n⚠️ *FALTA VENTAS O LOVE ISDIN (${incompletos.length}):*\n`;
          incompletos.forEach((p) => {
            const btl = p.pdvClaveBtl ? ` (${p.pdvClaveBtl})` : '';
            texto += `• *${p.empleadoNombre}* - ${p.pdvNombre}${btl}\n`;
          });
        }
      }

      navigator.clipboard.writeText(texto).then(() => {
        setCopiandoId(id);
        setTimeout(() => setCopiandoId(null), 2500);
      });
    },
    []
  );

  // Totales de la pestaña de pendientes
  const totalPendientesProgramadas = useMemo(() => {
    return supervisoresProgress.reduce((acc, curr) => acc + curr.totalProgramadas, 0);
  }, [supervisoresProgress]);

  const totalPendientesCumplidas = useMemo(() => {
    return supervisoresProgress.reduce((acc, curr) => acc + curr.totalCumplidas, 0);
  }, [supervisoresProgress]);

  const porcentajePendientesCumplidas = useMemo(() => {
    return totalPendientesProgramadas > 0
      ? Math.round((totalPendientesCumplidas / totalPendientesProgramadas) * 100)
      : 0;
  }, [totalPendientesCumplidas, totalPendientesProgramadas]);

  return (
    <div className="animate-fade-in space-y-6">
      {/* ──── Header ──── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {isSupervisorMode ? 'Reportes de Campo' : 'Panel del Cliente'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {periodLabel(data.periodoSeleccionado)} · Actualizado{' '}
            {new Date(data.refreshedAt).toLocaleTimeString('es-MX', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <FilterBar
          cadenas={catalogos.cadenas}
          tiendas={catalogos.tiendas}
          supervisores={catalogos.supervisores}
          selectedCadenaId={cadenaId}
          selectedPdvId={pdvId}
          selectedSupervisorId={supervisorId}
          periodo={periodo}
          fecha={fecha}
          onCadenaChange={(id) => {
            setCadenaId(id);
            setPdvId('');
          }}
          onPdvChange={setPdvId}
          onSupervisorChange={setSupervisorId}
          onPeriodoChange={setPeriodo}
          onFechaChange={setFecha}
          isSupervisorMode={isSupervisorMode}
        />
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2 text-sm text-primary-700">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth={3}
              strokeDasharray="31.4"
              strokeLinecap="round"
            />
          </svg>
          Actualizando datos…
        </div>
      )}

      {lastError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {lastError}
        </div>
      )}

      {/* ──── Botones de Navegación de Secciones (Visibles y Táctiles) ──── */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/80 w-full sm:w-auto shadow-2xs select-none">
        <button
          type="button"
          onClick={() => setActiveTab('resumen')}
          className={cls(
            'flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs active:scale-95',
            activeTab === 'resumen'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          )}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75M15 6.75v6" />
          </svg>
          <span>Resumen General</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pendientes')}
          className={cls(
            'flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs active:scale-95',
            activeTab === 'pendientes'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          )}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
          <span>{isSupervisorMode ? 'Avance de mi Equipo' : 'Dermos Pendientes'}</span>
          {alertas.length > 0 ? (
            <span className="inline-flex items-center justify-center rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-extrabold text-white leading-none">
              {alertas.length}
            </span>
          ) : (
            <span className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-extrabold text-white leading-none">
              ✓ 100%
            </span>
          )}
        </button>
      </div>

      {activeTab === 'resumen' ? (
        <>
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
                <svg
                  className="h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
                  />
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
                <svg
                  className="h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"
                  />
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
                <svg
                  className="h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
                  />
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
                <svg
                  className="h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                  />
                </svg>
              }
            />
          </div>

          {/* ──── Avance Diario por Supervisor ──── */}
          {supervisoresProgress.length > 0 && !isSupervisorMode && (
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-heading text-base font-bold text-slate-800 flex items-center gap-2">
                    <span>Avance Diario por Supervisor</span>
                    <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {fecha ? `Día: ${fecha}` : 'Hoy'}
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Dermoconsejeras con capturas registradas vs programadas hoy en tienda
                  </p>
                </div>
                {supervisorId && (
                  <button
                    type="button"
                    onClick={() => setSupervisorId('')}
                    className="text-xs font-semibold text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full select-none"
                  >
                    Limpiar filtro de supervisor
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {supervisoresProgress.map((sup) => {
                  const isActive = supervisorId === sup.id;
                  const isPerfect = sup.completado100;
                  return (
                    <button
                      key={sup.id}
                      type="button"
                      onClick={() => setSupervisorId(isActive ? '' : sup.id)}
                      className={cls(
                        'flex flex-col justify-between p-3.5 rounded-xl border text-left transition-all duration-300',
                        'hover:-translate-y-0.5 hover:shadow-md focus:outline-none select-none',
                        isActive
                          ? 'bg-slate-900 border-slate-900 text-white shadow-sm ring-2 ring-slate-900/10'
                          : isPerfect
                            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900 shadow-[0_0_12px_rgba(16,185,129,0.05)]'
                            : 'bg-slate-50/50 border-slate-200 text-slate-700 hover:bg-slate-50'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 w-full">
                        <p
                          className={cls(
                            'text-xs font-bold truncate',
                            isActive ? 'text-white' : 'text-slate-900'
                          )}
                        >
                          {sup.nombre}
                        </p>
                        {isPerfect && (
                          <span
                            className={cls(
                              'shrink-0 text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-full select-none',
                              isActive
                                ? 'bg-white/20 text-white'
                                : 'bg-emerald-100 text-emerald-800'
                            )}
                          >
                            ✨ 100%
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-between w-full">
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-extrabold leading-none tracking-tight">
                            {sup.totalCumplidas}
                          </span>
                          <span
                            className={cls(
                              'text-[10px] font-medium',
                              isActive ? 'text-white/60' : 'text-slate-400'
                            )}
                          >
                            / {sup.totalProgramadas}
                          </span>
                        </div>

                        <span
                          className={cls(
                            'text-xs font-bold',
                            isActive
                              ? 'text-white'
                              : isPerfect
                                ? 'text-emerald-700'
                                : 'text-slate-500'
                          )}
                        >
                          {sup.porcentaje}%
                        </span>
                      </div>

                      {/* Tiny progress bar */}
                      <div
                        className={cls(
                          'mt-2 h-1 w-full rounded-full overflow-hidden',
                          isActive ? 'bg-white/10' : 'bg-slate-200/60'
                        )}
                      >
                        <div
                          className={cls(
                            'h-full rounded-full transition-all duration-500',
                            isActive ? 'bg-white' : isPerfect ? 'bg-emerald-500' : 'bg-violet-500'
                          )}
                          style={{ width: `${Math.min(sup.porcentaje, 100)}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ──── Trend Chart ──── */}
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-heading text-base font-bold text-slate-800">
                  Tendencia Diaria
                </h2>
                <p className="text-[11px] text-slate-500">Evolución de indicadores día a día</p>
              </div>
              <SeriesLegend visibleSeries={visibleSeries} onToggle={handleToggleSeries} />
            </div>
            <div className="mt-4">
              <MiniTrendChart data={tendencia} visibleSeries={visibleSeries} />
            </div>
          </div>

          {/* ──── Two-Column Section ──── */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-heading text-base font-bold text-slate-800">
                    Avance por Material de Canje
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    {materiales.length} material{materiales.length !== 1 ? 'es' : ''} activo
                    {materiales.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                {materiales.length > 0 ? (
                  materiales.map((m) => <MaterialProgressBar key={m.materialId} material={m} />)
                ) : (
                  <p className="py-8 text-center text-sm text-slate-400">
                    Sin materiales de canje cargados
                  </p>
                )}
              </div>
            </div>

            {/* Desabastos List */}
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="font-heading text-base font-bold text-slate-800">
                  Reportes de Desabasto
                  {desabastos.length > 0 && (
                    <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      {desabastos.length}
                    </span>
                  )}
                </h2>
                <p className="text-[11px] text-slate-500">
                  Productos sin existencia reportados por el equipo de campo
                </p>
              </div>
              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {desabastos.length > 0 ? (
                  desabastos.map((d) => <DesabastoRow key={d.id} item={d} />)
                ) : (
                  <p className="py-12 text-center text-sm text-slate-400">
                    Sin reportes de desabasto en este periodo
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        /* ──── Pestaña: Dermoconsejeras Faltantes y Al Día (Avance de Equipo) ──── */
        <div className="space-y-6 animate-fade-in">
          {/* Card Resumen de la Fecha */}
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 sm:p-5 shadow-2xs space-y-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-heading text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span>{isSupervisorMode ? 'Avance de mi Equipo' : 'Estatus de Reportes'}</span>
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    {fecha ? fecha.split('-').reverse().join('/') : 'Día de Hoy'}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Seguimiento de dermoconsejeras en tienda, reportes recibidos y pendientes por enviar.
                </p>
              </div>
              <div className="flex items-baseline gap-1 md:text-right">
                <span className="text-2xl font-extrabold text-slate-900">
                  {totalPendientesCumplidas}
                </span>
                <span className="text-sm font-semibold text-slate-400">
                  / {totalPendientesProgramadas} dermoes
                </span>
                <span className={cls(
                  'ml-2 text-xs font-bold px-2.5 py-1 rounded-full',
                  porcentajePendientesCumplidas === 100
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-700'
                )}>
                  {porcentajePendientesCumplidas}% de avance
                </span>
              </div>
            </div>

            {/* Barra de progreso global */}
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className={cls(
                  'h-full rounded-full transition-all duration-700 ease-out',
                  porcentajePendientesCumplidas === 100
                    ? 'bg-emerald-500'
                    : 'bg-gradient-to-r from-violet-500 to-indigo-600'
                )}
                style={{ width: `${porcentajePendientesCumplidas}%` }}
              />
            </div>
          </div>

          {/* Grid de Supervisores / Tarjeta de Equipo */}
          <div className={cls(
            'grid gap-6',
            alertasAgrupadas.length === 1 ? 'grid-cols-1 max-w-4xl mx-auto w-full' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          )}>
            {alertasAgrupadas.map((group) => {
              const total = group.totalProgramadas || (group.pendientes.length + group.cumplidas.length);
              const cumplidasList = group.cumplidas;
              const pendientesList = group.pendientes;
              const cumplidasCount = cumplidasList.length;
              const isPerfect = total > 0 && cumplidasCount === total && pendientesList.length === 0;
              const currentSubTab = subTabMap[group.supervisorId] || (pendientesList.length > 0 ? 'pendientes' : 'cumplidas');

              let listToDisplay: Array<ClienteDashboardAlertItem & { statusType: 'cumplido' | 'incompleto' | 'vacio' }> = [];
              if (currentSubTab === 'pendientes') {
                listToDisplay = pendientesList.map((p) => ({
                  ...p,
                  statusType: p.tipo === 'incompleto' ? 'incompleto' : 'vacio',
                }));
              } else if (currentSubTab === 'cumplidas') {
                listToDisplay = cumplidasList.map((c) => ({
                  ...c,
                  statusType: 'cumplido',
                }));
              } else {
                listToDisplay = [
                  ...pendientesList.map((p) => ({
                    ...p,
                    statusType: (p.tipo === 'incompleto' ? 'incompleto' : 'vacio') as 'incompleto' | 'vacio',
                  })),
                  ...cumplidasList.map((c) => ({
                    ...c,
                    statusType: 'cumplido' as const,
                  })),
                ];
              }

              return (
                <div
                  key={group.supervisorId}
                  className={cls(
                    'rounded-2xl border p-5 shadow-xs transition-all duration-300 hover:shadow-md flex flex-col justify-between',
                    isPerfect
                      ? 'bg-emerald-50/20 border-emerald-200'
                      : 'bg-white border-slate-200/80'
                  )}
                >
                  <div className="space-y-4">
                    {/* Header del Supervisor con botón minimalista WhatsApp */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-base leading-tight">
                            {group.supervisorNombre}
                          </h3>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            {isSupervisorMode ? 'Mi Equipo' : 'Supervisor'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {cumplidasCount} de {total} dermos han reportado hoy
                        </p>
                      </div>

                      {/* Botón WhatsApp minimalista */}
                      <button
                        type="button"
                        onClick={() =>
                          handleCopiarWhatsApp(
                            group.supervisorNombre,
                            fecha,
                            pendientesList,
                            cumplidasList,
                            group.supervisorId
                          )
                        }
                        className={cls(
                          'inline-flex items-center justify-center gap-2 rounded-xl py-2 px-3.5 text-xs font-bold transition-all select-none active:scale-95 shadow-2xs shrink-0',
                          copiandoId === group.supervisorId
                            ? 'bg-emerald-600 text-white ring-2 ring-emerald-600/30'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300'
                        )}
                        title="Copiar resumen para WhatsApp"
                      >
                        {copiandoId === group.supervisorId ? (
                          <>
                            <span>¡Copiado con éxito! ✓</span>
                          </>
                        ) : (
                          <>
                            <svg className="h-4 w-4 shrink-0 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.007c.106.005.249-.04.39.299.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.087-.177.181-.076.355.101.174.449.741.964 1.2.662.591 1.221.774 1.394.861.174.086.275.072.376-.044.101-.116.433-.506.549-.68.116-.173.231-.144.39-.086s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.099.824zm-3.423-10.416c-4.408 0-7.994 3.585-7.995 7.993 0 1.41.368 2.788 1.066 4.004l-1.134 4.143 4.244-1.113c1.175.641 2.502.979 3.821.98h.003c4.406 0 7.993-3.586 7.994-7.994-.001-4.41-3.59-7.997-7.999-7.997z" />
                            </svg>
                            <span>Copiar WhatsApp</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Sub-Tabs de Filtrado de Equipo */}
                    <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/60 select-none">
                      <button
                        type="button"
                        onClick={() =>
                          setSubTabMap((prev) => ({ ...prev, [group.supervisorId]: 'pendientes' }))
                        }
                        className={cls(
                          'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all',
                          currentSubTab === 'pendientes'
                            ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                            : 'text-slate-500 hover:text-slate-800'
                        )}
                      >
                        <span>Pendientes</span>
                        <span className={cls(
                          'px-1.5 py-0.2 rounded-full text-[10px]',
                          pendientesList.length > 0 ? 'bg-amber-100 text-amber-800 font-extrabold' : 'bg-slate-200 text-slate-600'
                        )}>
                          {pendientesList.length}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setSubTabMap((prev) => ({ ...prev, [group.supervisorId]: 'cumplidas' }))
                        }
                        className={cls(
                          'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all',
                          currentSubTab === 'cumplidas'
                            ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                            : 'text-slate-500 hover:text-slate-800'
                        )}
                      >
                        <span>Al día</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-extrabold">
                          {cumplidasCount}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setSubTabMap((prev) => ({ ...prev, [group.supervisorId]: 'todos' }))
                        }
                        className={cls(
                          'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all',
                          currentSubTab === 'todos'
                            ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                            : 'text-slate-500 hover:text-slate-800'
                        )}
                      >
                        <span>Todos</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700 font-extrabold">
                          {total}
                        </span>
                      </button>
                    </div>

                    {/* Lista Dinámica de Dermoconsejeras */}
                    <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                      {listToDisplay.length > 0 ? (
                        listToDisplay.map((item) => {
                          const isCumplido = item.statusType === 'cumplido';
                          const isIncompleto = item.statusType === 'incompleto';

                          return (
                            <div
                              key={item.id}
                              className={cls(
                                'p-2.5 sm:p-3 rounded-xl border text-left transition-all',
                                isCumplido
                                  ? 'border-emerald-200/80 bg-emerald-50/30 hover:bg-emerald-50/50'
                                  : isIncompleto
                                    ? 'border-amber-200/80 bg-amber-50/40 hover:bg-amber-50/60'
                                    : 'border-red-200/70 bg-red-50/20 hover:bg-red-50/40'
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                                  {item.empleadoNombre}
                                </p>
                                <span
                                  className={cls(
                                    'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-extrabold tracking-tight uppercase select-none',
                                    isCumplido
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : isIncompleto
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-red-100 text-red-800'
                                  )}
                                >
                                  {isCumplido
                                    ? `✓ Enviado (${item.ventasOLove ?? 0} ventas/love)`
                                    : isIncompleto
                                      ? '⚠️ Falta Ventas/Love'
                                      : '🚫 Sin reportes'}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                                <span className="truncate">
                                  {item.pdvNombre} {item.pdvClaveBtl ? `(${item.pdvClaveBtl})` : ''}
                                </span>
                                {item.totalCapturas !== undefined && item.totalCapturas > 0 && (
                                  <span className="shrink-0 font-medium text-slate-400">
                                    {item.totalCapturas} reg.
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                          <span className="text-2xl mb-1">
                            {currentSubTab === 'pendientes' ? '🎉' : '📋'}
                          </span>
                          <p className="text-xs font-bold text-slate-700">
                            {currentSubTab === 'pendientes'
                              ? '¡Todo el equipo está al día!'
                              : 'No hay registros en esta categoría.'}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {currentSubTab === 'pendientes'
                              ? 'No hay reportes pendientes para esta fecha.'
                              : 'Consulta las otras pestañas.'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────── Server Wrapper for initial SSR load ─────── */

export { ClienteDashboardPanel as default };