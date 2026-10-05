'use client';

import { memo } from 'react';
import { AppGlyph } from '@/components/ui/AppGlyph';
import type { ClienteDashboardKpiSummary } from '@/features/dashboard/services/clienteDashboardService';

interface SupervisorKpiStripProps {
  kpis: ClienteDashboardKpiSummary | null;
  loading?: boolean;
}

function formatNum(value: number | undefined): string {
  if (value === undefined || value === null) return '0';
  return value.toLocaleString('es-MX');
}

export const SupervisorKpiStrip = memo(function SupervisorKpiStrip({
  kpis,
  loading = false,
}: SupervisorKpiStripProps) {
  if (loading && !kpis) {
    return (
      <div className="mb-2.5 grid grid-cols-4 gap-1.5 sm:gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-slate-100 bg-slate-50 p-2"
          >
            <div className="h-2.5 w-10 rounded-md bg-slate-200 mb-1" />
            <div className="h-4 w-12 rounded-md bg-slate-200" />
          </div>
        ))}
      </div>
    );
  }

  const {
    porcentajeAvanceCanjes = 0,
    totalCanjesEntregados = 0,
    totalInventarioInicialCanjes = 0,
    totalVentas = 0,
    totalLoveIsdin = 0,
    totalDesabastos = 0,
  } = kpis ?? {};

  return (
    <div className="mb-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Avance del Mes
        </p>
      </div>

      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {/* Avance Canjes */}
        <div className="flex flex-col justify-center rounded-xl border border-violet-100/90 bg-violet-50/40 p-2 shadow-2xs transition hover:border-violet-200">
          <div className="flex items-center gap-1">
            <AppGlyph name="canjes" size="xs" />
            <span className="text-[10px] font-bold uppercase tracking-tight text-violet-800 truncate">
              Canjes
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">
              {formatNum(totalCanjesEntregados)}
            </span>
            <span className="text-[9px] text-slate-500 font-medium">pzas</span>
            {porcentajeAvanceCanjes > 0 && (
              <span className="hidden sm:inline text-[9px] text-violet-600 font-semibold ml-0.5">
                ({porcentajeAvanceCanjes.toFixed(1)}%)
              </span>
            )}
          </div>
        </div>

        {/* Total Ventas */}
        <div className="flex flex-col justify-center rounded-xl border border-emerald-100/90 bg-emerald-50/40 p-2 shadow-2xs transition hover:border-emerald-200">
          <div className="flex items-center gap-1">
            <AppGlyph name="ventas" size="xs" />
            <span className="text-[10px] font-bold uppercase tracking-tight text-emerald-800 truncate">
              Ventas
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">
              {formatNum(totalVentas)}
            </span>
            <span className="hidden sm:inline text-[9px] text-slate-500 font-medium">uds</span>
          </div>
        </div>

        {/* Love ISDIN */}
        <div className="flex flex-col justify-center rounded-xl border border-amber-100/90 bg-amber-50/40 p-2 shadow-2xs transition hover:border-amber-200">
          <div className="flex items-center gap-1">
            <AppGlyph name="love" size="xs" />
            <span className="text-[10px] font-bold uppercase tracking-tight text-amber-800 truncate">
              Love
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">
              {formatNum(totalLoveIsdin)}
            </span>
            <span className="hidden sm:inline text-[9px] text-slate-500 font-medium">afil</span>
          </div>
        </div>

        {/* Desabastos */}
        <div className="flex flex-col justify-center rounded-xl border border-rose-100/90 bg-rose-50/40 p-2 shadow-2xs transition hover:border-rose-200">
          <div className="flex items-center gap-1">
            <AppGlyph name="desabasto" size="xs" />
            <span className="text-[10px] font-bold uppercase tracking-tight text-rose-800 truncate">
              Desabastos
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">
              {formatNum(totalDesabastos)}
            </span>
            <span className="hidden sm:inline text-[9px] text-slate-500 font-medium">rep</span>
          </div>
        </div>
      </div>
    </div>
  );
});
