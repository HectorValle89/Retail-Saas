'use client';

import { useMemo, useState } from 'react';
import type { VentaDatasetItem, VentaCapturaDetalleItem } from '../services/ventaService';

export interface VentasVerticalDrillDownProps {
  dataset: VentaDatasetItem[];
  capturasDetalle?: VentaCapturaDetalleItem[];
  activeMonth: string; // e.g. "2026-06"
  searchTerm: string;
  onClearSearch?: () => void;
  actorPuesto?: string | null;
}

export type { DayActivityDetail, DermoPdvGroup } from '../lib/ventasVerticalAggregation';
import {
  aggregateDermoPdvGroups,
  generateMonthDays,
  MESES,
  type DermoPdvGroup,
} from '../lib/ventasVerticalAggregation';

export function VentasVerticalDrillDown({
  dataset,
  capturasDetalle = [],
  activeMonth,
  searchTerm,
  onClearSearch,
}: VentasVerticalDrillDownProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [selectedDateMap, setSelectedDateMap] = useState<Record<string, string>>({});

  const { days: monthDays, year, month, firstDayMondayOffset } = useMemo(() => {
    return generateMonthDays(activeMonth);
  }, [activeMonth]);
  const mesNombre = MESES[month - 1] || activeMonth;

  // Build groups by DC + PDV using canonical dataset
  const dermoPdvList = useMemo(() => {
    return aggregateDermoPdvGroups({ dataset, capturasDetalle, monthDays });
  }, [dataset, capturasDetalle, monthDays]);

  // Filter by user search input
  const filteredList = useMemo(() => {
    if (!searchTerm.trim()) return dermoPdvList;
    const term = searchTerm.toLowerCase().trim();
    return dermoPdvList.filter((g) => {
      return (
        g.nombreDc.toLowerCase().includes(term) ||
        g.sucursal.toLowerCase().includes(term) ||
        g.cadena.toLowerCase().includes(term) ||
        g.btlCve.toLowerCase().includes(term) ||
        g.supervisor.toLowerCase().includes(term) ||
        g.idNomina.toLowerCase().includes(term)
      );
    });
  }, [dermoPdvList, searchTerm]);

  const handleToggleCard = (group: DermoPdvGroup) => {
    if (expandedKey === group.key) {
      setExpandedKey(null);
    } else {
      setExpandedKey(group.key);
      // Auto select latest day with sales or activity if not set
      if (!selectedDateMap[group.key]) {
        let bestDate = monthDays[0].dateStr;
        // Search for the last day with pieces or activity
        for (let i = monthDays.length - 1; i >= 0; i--) {
          const dStr = monthDays[i].dateStr;
          const dayInfo = group.daysMap.get(dStr);
          if (
            dayInfo &&
            (dayInfo.piezas > 0 ||
              dayInfo.loveRegistros.length > 0 ||
              dayInfo.canjesRegistros.length > 0)
          ) {
            bestDate = dStr;
            break;
          }
        }
        setSelectedDateMap((prev) => ({ ...prev, [group.key]: bestDate }));
      }
    }
  };

  const handleSelectDay = (groupKey: string, dateStr: string) => {
    setSelectedDateMap((prev) => ({ ...prev, [groupKey]: dateStr }));
  };

  return (
    <div className="space-y-4 w-full min-w-0 max-w-full">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-1 w-full min-w-0">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span>📱</span> Vista Vertical: Registros por Dermo y Punto de Venta
          </h3>
          <p className="text-xs text-slate-500">
            {filteredList.length} dermoconsejeras y sucursales en {mesNombre} {year}
          </p>
        </div>
        {searchTerm && (
          <div className="flex items-center gap-2 text-xs flex-wrap min-w-0">
            <span className="text-slate-500 truncate">
              Filtrado por: <strong className="text-slate-800 font-semibold">{searchTerm}</strong>
            </span>
            {onClearSearch && (
              <button
                type="button"
                onClick={onClearSearch}
                className="text-pink-600 hover:text-pink-700 font-bold underline cursor-pointer shrink-0"
              >
                Limpiar búsqueda
              </button>
            )}
          </div>
        )}
      </div>

      {filteredList.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-xs">
          <p className="text-2xl mb-2">🔍</p>
          <p className="text-sm font-bold text-slate-700">No se encontraron registros</p>
          <p className="text-xs text-slate-400 mt-1">
            Intenta con otro término de búsqueda o selecciona otro mes en los filtros.
          </p>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-3.5 w-full min-w-0 max-w-full">
          {filteredList.map((group) => {
            const isExpanded = expandedKey === group.key;
            const selectedDate = selectedDateMap[group.key] || monthDays[0].dateStr;
            const selectedDayDetail = group.daysMap.get(selectedDate);

            return (
              <div
                key={group.key}
                className="rounded-2xl border border-slate-200 bg-white shadow-xs hover:border-slate-300 transition-all overflow-hidden w-full min-w-0 max-w-full"
              >
                {/* NIVEL 1: Resumen Principal (DC + PDV) */}
                <div className="p-3 sm:p-5 w-full min-w-0 max-w-full">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 w-full min-w-0">
                    <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                      <div className="h-10 w-10 shrink-0 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center text-xl shadow-xs">
                        👩‍💼
                      </div>
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                          <h4 className="text-sm font-bold text-slate-900 leading-tight break-words">
                            {group.nombreDc}
                          </h4>
                          {group.idNomina && (
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                              #{group.idNomina}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 flex-wrap min-w-0 break-words">
                          <span>🏪 {group.sucursal}</span>
                          <span className="text-[10px] text-slate-400">•</span>
                          <span className="text-[10px] font-mono text-slate-500 font-bold">
                            {group.btlCve}
                          </span>
                          <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-700">
                            {group.cadena}
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-500 break-words">
                          Supervisor: <span className="font-medium text-slate-700">{group.supervisor}</span>
                        </p>
                      </div>
                    </div>

                    {/* Quick Totals Badges */}
                    <div className="flex items-center gap-1 sm:gap-1.5 sm:self-center flex-wrap shrink-0">
                      <div className="inline-flex items-center gap-1 sm:gap-1.5 rounded-xl bg-pink-50 border border-pink-200/80 px-2 sm:px-3 py-1 sm:py-1.5 shadow-2xs">
                        <span className="text-xs">🛍️</span>
                        <div>
                          <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-pink-600">
                            Piezas
                          </p>
                          <p className="text-xs font-black text-[#FF7FA5] leading-none">
                            {group.totalPiezas.toLocaleString('es-MX')}
                          </p>
                        </div>
                      </div>

                      <div className="inline-flex items-center gap-1 sm:gap-1.5 rounded-xl bg-rose-50 border border-rose-200/80 px-2 sm:px-3 py-1 sm:py-1.5 shadow-2xs">
                        <span className="text-xs">❤️</span>
                        <div>
                          <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-rose-600">
                            Love
                          </p>
                          <p className="text-xs font-black text-rose-700 leading-none">
                            {group.totalLove}
                          </p>
                        </div>
                      </div>

                      <div className="inline-flex items-center gap-1 sm:gap-1.5 rounded-xl bg-amber-50 border border-amber-200/80 px-2 sm:px-3 py-1 sm:py-1.5 shadow-2xs">
                        <span className="text-xs">🎁</span>
                        <div>
                          <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-amber-700">
                            Canjes
                          </p>
                          <p className="text-xs font-black text-amber-800 leading-none">
                            {group.totalCanjes}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Summary Footer bar & Toggle button */}
                  <div className="mt-3 pt-2.5 sm:mt-3.5 sm:pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 w-full min-w-0">
                    <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-500 flex-wrap min-w-0">
                      <span>
                        📅 <strong>{group.diasConVenta}</strong> días con venta
                      </span>
                      <span>•</span>
                      <span>
                        📈 <strong>{group.diasActivos}</strong> días activos
                      </span>
                      {group.totalMonto > 0 && (
                        <>
                          <span>•</span>
                          <span>
                            Total: <strong>${group.totalMonto.toLocaleString('es-MX')}</strong>
                          </span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleCard(group)}
                      className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all shadow-xs ${
                        isExpanded
                          ? 'bg-[#FF7FA5] text-white hover:bg-[#ff6694]'
                          : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span>{isExpanded ? '▲ Ocultar calendario' : '▼ Ver calendario y detalle por día'}</span>
                    </button>
                  </div>
                </div>

                {/* NIVEL 2: Calendario Minimalista de Piezas */}
                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50/70 p-2 sm:p-6 space-y-4 sm:space-y-5 w-full min-w-0 max-w-full">
                    <div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3 w-full min-w-0">
                        <div className="min-w-0">
                          <h5 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 break-words">
                            <span>📅</span> Calendario de Piezas Vendidas — {mesNombre} {year}
                          </h5>
                          <p className="text-[11px] text-slate-500 break-words">
                            Toca cualquier día para consultar los productos vendidos, registros LOVE ISDIN y canjes realizados:
                          </p>
                        </div>
                        <div className="flex items-center gap-2.5 sm:gap-3 text-[10px] text-slate-500 mt-1 sm:mt-0 flex-wrap shrink-0">
                          <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-pink-400"></span> Con venta
                          </span>
                          <span className="flex items-center gap-1">
                            <span>❤️</span> Love ISDIN
                          </span>
                          <span className="flex items-center gap-1">
                            <span>🎁</span> Canje
                          </span>
                        </div>
                      </div>

                      {/* Calendar Grid (7 columns: Lun - Dom) */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-2 sm:p-3 shadow-xs w-full min-w-0 max-w-full">
                        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1.5 text-center">
                          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((dName) => (
                            <div
                              key={dName}
                              className="text-[10px] font-extrabold text-slate-400 py-1 uppercase tracking-wider"
                            >
                              {dName}
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                          {/* Blank padding cells before 1st day of month */}
                          {Array.from({ length: firstDayMondayOffset }).map((_, i) => (
                            <div key={`blank-${i}`} className="min-h-11 sm:min-h-12 rounded-xl bg-slate-50/40" />
                          ))}

                          {/* Day cells */}
                          {monthDays.map((mDay) => {
                            const dayInfo = group.daysMap.get(mDay.dateStr);
                            const hasVenta = dayInfo && dayInfo.piezas > 0;
                            const hasLove = dayInfo && dayInfo.loveRegistros.length > 0;
                            const hasCanje = dayInfo && dayInfo.canjesRegistros.length > 0;
                            const hasIncidencia = dayInfo && dayInfo.incidencia;
                            const isSelected = selectedDate === mDay.dateStr;

                            // Style determination
                            let cellBg = 'bg-slate-50/50 hover:bg-slate-100 text-slate-600 border-slate-200/70';
                            if (isSelected) {
                              cellBg = 'bg-pink-100/90 border-[#FF7FA5] ring-2 ring-[#FF7FA5] text-pink-950 font-black shadow-sm scale-102 z-10';
                            } else if (hasVenta) {
                              cellBg = 'bg-pink-50/80 hover:bg-pink-100 border-pink-200 text-slate-900 font-bold';
                            } else if (hasIncidencia === 'V') {
                              cellBg = 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900';
                            } else if (hasIncidencia === 'I') {
                              cellBg = 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-900';
                            } else if (hasIncidencia === 'F') {
                              cellBg = 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-900';
                            } else if (hasIncidencia === '0') {
                              cellBg = 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-500';
                            }

                            return (
                              <button
                                key={mDay.dateStr}
                                type="button"
                                onClick={() => handleSelectDay(group.key, mDay.dateStr)}
                                className={`min-h-11 sm:min-h-14 rounded-xl border p-0.5 sm:p-1.5 flex flex-col justify-between transition-all cursor-pointer text-left ${cellBg}`}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <span className="text-[10px] sm:text-[11px] font-extrabold">{mDay.dayNum}</span>
                                  {hasIncidencia && !hasVenta && (
                                    <span className="text-[8px] sm:text-[9px] font-black uppercase px-0.5 sm:px-1 rounded bg-black/10">
                                      {hasIncidencia}
                                    </span>
                                  )}
                                </div>

                                <div className="my-0.5 text-center">
                                  {hasVenta ? (
                                    <span className="text-[10px] sm:text-xs font-extrabold text-[#FF7FA5] leading-tight block">
                                      {dayInfo!.piezas}
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-slate-300 font-medium block">-</span>
                                  )}
                                </div>

                                <div className="flex items-center justify-center gap-0.5 text-[8px] sm:text-[9px] leading-none h-3">
                                  {hasLove && <span title="Registros Love ISDIN">❤️</span>}
                                  {hasCanje && <span title="Canjes realizados">🎁</span>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* NIVEL 3: Detalle Completo del Día Seleccionado */}
                    {selectedDayDetail && (
                      <div className="rounded-2xl border border-pink-200 bg-white p-2.5 sm:p-5 shadow-sm space-y-3.5 sm:space-y-4 w-full min-w-0 max-w-full">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2.5 sm:pb-3 border-b border-slate-100 w-full min-w-0">
                          <div className="min-w-0 flex-1">
                            <h6 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 sm:gap-2 break-words">
                              <span>📅</span> Detalle del día: {selectedDayDetail.weekdayShort}{' '}
                              {selectedDayDetail.dayNum} de {mesNombre} {year}
                            </h6>
                            <p className="text-[11px] text-slate-500 mt-0.5 break-words">
                              {group.nombreDc} en {group.sucursal}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap shrink-0">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-pink-50 border border-pink-200 px-2 py-0.5 sm:px-2.5 sm:py-1 text-xs font-extrabold text-[#FF7FA5]">
                              🛍️ {selectedDayDetail.piezas} {selectedDayDetail.piezas === 1 ? 'pieza' : 'piezas'}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 border border-rose-200 px-2 py-0.5 sm:px-2.5 sm:py-1 text-xs font-extrabold text-rose-700">
                              ❤️ {selectedDayDetail.loveRegistros.length} Love
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-2 py-0.5 sm:px-2.5 sm:py-1 text-xs font-extrabold text-amber-800">
                              🎁 {selectedDayDetail.canjesRegistros.length} canjes
                            </span>
                          </div>
                        </div>

                        {/* SECCIÓN 1: Ventas por Producto */}
                        <div className="w-full min-w-0">
                          <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5 mb-2">
                            <span>🛍️</span> Productos Vendidos ({selectedDayDetail.piezas} piezas)
                          </p>

                          {selectedDayDetail.productos.length === 0 ? (
                            <div className="rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-400">
                              No hay piezas de venta registradas en este día.
                            </div>
                          ) : (
                            <div className="space-y-1.5 w-full min-w-0">
                              {selectedDayDetail.productos.map((prod, pIdx) => (
                                <div
                                  key={pIdx}
                                  className="flex items-center justify-between gap-2 py-1.5 px-2.5 sm:px-3 rounded-xl bg-slate-50/90 border border-slate-100/90 hover:border-slate-200 transition w-full min-w-0"
                                >
                                  <span
                                    className="text-xs font-semibold text-slate-800 leading-snug line-clamp-2 break-words flex-1 min-w-0"
                                    title={prod.nombre}
                                  >
                                    {prod.nombre}
                                  </span>
                                  <span className="inline-flex shrink-0 items-center justify-center rounded-lg bg-pink-50 border border-pink-200/90 px-2 py-0.5 text-xs font-black text-[#FF7FA5]">
                                    {prod.piezas} {prod.piezas === 1 ? 'pza' : 'pzas'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* SECCIÓN 2: Registros LOVE ISDIN */}
                        <div className="w-full min-w-0">
                          <p className="text-[11px] font-extrabold uppercase tracking-wider text-rose-800 flex items-center gap-1.5 mb-2">
                            <span>❤️</span> Registros LOVE ISDIN ({selectedDayDetail.loveRegistros.length})
                          </p>

                          {selectedDayDetail.loveRegistros.length === 0 ? (
                            <div className="rounded-xl bg-rose-50/30 border border-rose-100/50 p-2.5 text-center text-xs text-rose-400">
                              Sin registros LOVE ISDIN en este día.
                            </div>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2 w-full min-w-0">
                              {selectedDayDetail.loveRegistros.map((love, lIdx) => (
                                <div
                                  key={lIdx}
                                  className="flex items-center justify-between gap-2 p-2 sm:p-2.5 rounded-xl bg-rose-50/50 border border-rose-100 w-full min-w-0"
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className="text-base shrink-0">❤️</span>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-bold text-rose-950 truncate">
                                        {love.subtipo === 'LOVE_EXITOSO'
                                          ? 'Afiliación Exitosa'
                                          : love.subtipo || 'Registro Love'}
                                      </p>
                                      {love.observaciones && (
                                        <p className="text-[10px] text-rose-700 line-clamp-2 break-words leading-tight">
                                          {love.observaciones}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-xs font-bold text-rose-700 bg-rose-100/60 px-2 py-0.5 rounded-lg shrink-0 ml-auto">
                                    +{love.cantidad} reg
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* SECCIÓN 3: Canjes Realizados */}
                        <div className="w-full min-w-0">
                          <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800 flex items-center gap-1.5 mb-2">
                            <span>🎁</span> Canjes Realizados ({selectedDayDetail.canjesRegistros.length})
                          </p>

                          {selectedDayDetail.canjesRegistros.length === 0 ? (
                            <div className="rounded-xl bg-amber-50/30 border border-amber-100/50 p-2.5 text-center text-xs text-amber-500">
                              Sin canjes de productos registrados en este día.
                            </div>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2 w-full min-w-0">
                              {selectedDayDetail.canjesRegistros.map((canje, cIdx) => (
                                <div
                                  key={cIdx}
                                  className="flex items-center justify-between gap-2 p-2 sm:p-2.5 rounded-xl bg-amber-50/50 border border-amber-100 w-full min-w-0"
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className="text-base shrink-0">🎁</span>
                                    <div className="min-w-0 flex-1">
                                      <p
                                        className="text-xs font-bold text-amber-950 leading-snug line-clamp-2 break-words"
                                        title={canje.material}
                                      >
                                        {canje.materialCorto || canje.material}
                                      </p>
                                      <div className="flex items-center gap-1.5 text-[10px] text-amber-700 flex-wrap">
                                        <span className="shrink-0 font-medium">
                                          {canje.subtipo === 'CANJE_CON_TICKET'
                                            ? 'Con ticket'
                                            : canje.subtipo === 'CANJE_SIN_TICKET'
                                            ? 'Sin ticket'
                                            : canje.subtipo || 'Canje'}
                                        </span>
                                        {canje.observaciones && (
                                          <span className="line-clamp-1 break-words">• {canje.observaciones}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <span className="text-xs font-bold text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded-lg shrink-0 ml-auto">
                                    {canje.cantidad} {canje.cantidad === 1 ? 'canje' : 'canjes'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* SECCIÓN 4: Incidencias / Notas */}
                        {(selectedDayDetail.incidencia ||
                          selectedDayDetail.notas.length > 0 ||
                          selectedDayDetail.desabastos.length > 0) && (
                          <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 sm:p-3 space-y-1.5 text-xs w-full min-w-0 break-words">
                            <p className="font-extrabold text-slate-700 flex items-center gap-1.5">
                              <span>ℹ️</span> Observaciones e Incidencias del Día
                            </p>
                            {selectedDayDetail.incidencia && (
                              <p className="text-slate-600">
                                Estatus registrado:{' '}
                                <strong className="text-slate-800">
                                  {selectedDayDetail.incidencia === 'V'
                                    ? 'Vacaciones aprobadas'
                                    : selectedDayDetail.incidencia === 'I'
                                    ? 'Incapacidad médica aprobada'
                                    : selectedDayDetail.incidencia === 'F'
                                    ? 'Falta'
                                    : 'Sin ventas registradas'}
                                </strong>
                              </p>
                            )}
                            {selectedDayDetail.desabastos.length > 0 && (
                              <div className="space-y-1">
                                {selectedDayDetail.desabastos.map((d, dIdx) => (
                                  <p key={dIdx} className="text-amber-800">
                                    ⚠️ Desabasto reportado: <strong>{d.producto}</strong>
                                    {d.observaciones && ` (${d.observaciones})`}
                                  </p>
                                ))}
                              </div>
                            )}
                            {selectedDayDetail.notas.length > 0 && (
                              <div className="space-y-1">
                                {selectedDayDetail.notas.map((n, nIdx) => (
                                  <p key={nIdx} className="text-slate-600">
                                    📝 Nota: {n}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
