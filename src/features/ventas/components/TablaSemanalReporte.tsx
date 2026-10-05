'use client';

import React from 'react';
import { getSucursalCorta, formatNombreDcCorto } from './VentasPanel';

export interface FilaDetalleSemanal {
  sucursal: string;
  btlCve: string;
  cadena: string;
  nombreDc: string;
  sem1: number;
  sem2: number;
  sem3: number;
  sem4: number;
  sem5: number;
  total: number;
}

export interface FilaDermoSemanal {
  nombreDc: string;
  sem1: number;
  sem2: number;
  sem3: number;
  sem4: number;
  sem5: number;
  total: number;
}

export interface FilaSucursalSemanal {
  sucursal: string;
  btlCve: string;
  cadena: string;
  sem1: number;
  sem2: number;
  sem3: number;
  sem4: number;
  sem5: number;
  total: number;
}

export interface TotalesSemana {
  sem1: number | string;
  sem2: number | string;
  sem3: number | string;
  sem4: number | string;
  sem5: number | string;
  grand: number | string;
}

interface TablaSemanalReporteProps {
  tipo: 'ventas' | 'love';
  activeTab: 'detalle' | 'dermo' | 'sucursal';
  dataDetalle: FilaDetalleSemanal[];
  dataDermo: FilaDermoSemanal[];
  dataSucursal: FilaSucursalSemanal[];
  totalsDetalle: TotalesSemana;
  totalsDermo: TotalesSemana;
  totalsSucursal: TotalesSemana;
  isFullscreen?: boolean;
  onOpenFullscreen?: () => void;
}

export function TablaSemanalReporte({
  tipo,
  activeTab,
  dataDetalle,
  dataDermo,
  dataSucursal,
  totalsDetalle,
  totalsDermo,
  totalsSucursal,
  isFullscreen = false,
  onOpenFullscreen,
}: TablaSemanalReporteProps) {
  const labelTotales = tipo === 'ventas' ? 'UNIDADES VENDIDAS' : 'REGISTROS LOVE ISDIN';
  const labelVacio =
    tipo === 'ventas'
      ? 'No se encontraron registros de ventas que coincidan con la búsqueda.'
      : 'No se encontraron registros de LOVE ISDIN que coincidan con la búsqueda.';

  return (
    <div className="w-full flex flex-col">
      {!isFullscreen && (
        <div className="sm:hidden flex items-center justify-between px-3 py-1.5 bg-slate-100/90 border border-slate-200/90 rounded-xl text-[11px] text-slate-700 mb-2">
          <span className="flex items-center gap-1 font-medium">
            <span>👉</span> Desliza la tabla para ver S4, S5 y Total
          </span>
          {onOpenFullscreen && (
            <button
              type="button"
              onClick={onOpenFullscreen}
              className="font-bold text-[#FF7FA5] hover:text-[#ff6694] underline shrink-0 ml-2"
            >
              Ampliar ⛶
            </button>
          )}
        </div>
      )}

      <div
        className={`overflow-x-auto rounded-xl border border-slate-200 shadow-sm ${
          isFullscreen ? 'max-h-none overflow-y-visible' : 'max-h-[600px] overflow-y-auto'
        }`}
      >
        {activeTab === 'detalle' && (
          <table className="min-w-full border-collapse border border-slate-300 text-xs">
            <thead className="sticky top-0 z-20 text-slate-900 font-bold text-left shadow-sm">
              <tr>
                <th className="border border-slate-300 px-2 sm:px-4 py-2 sm:py-3 bg-[#AEAAAA] uppercase tracking-wider text-[11px] sm:text-xs sticky left-0 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]">
                  <span className="sm:hidden">SUCURSAL</span>
                  <span className="hidden sm:inline">SUCURSAL</span>
                </th>
                <th className="border border-slate-300 px-2 sm:px-4 py-2 sm:py-3 bg-[#AEAAAA] uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">DC</span>
                  <span className="hidden sm:inline">NOMBRE DC</span>
                </th>
                <th className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] w-9 sm:w-20 uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">S1</span>
                  <span className="hidden sm:inline">SEM 1</span>
                </th>
                <th className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] w-9 sm:w-20 uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">S2</span>
                  <span className="hidden sm:inline">SEM 2</span>
                </th>
                <th className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] w-9 sm:w-20 uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">S3</span>
                  <span className="hidden sm:inline">SEM 3</span>
                </th>
                <th className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] w-9 sm:w-20 uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">S4</span>
                  <span className="hidden sm:inline">SEM 4</span>
                </th>
                <th className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] w-9 sm:w-20 uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">S5</span>
                  <span className="hidden sm:inline">SEM 5</span>
                </th>
                <th className="border border-slate-300 px-2 sm:px-4 py-2 sm:py-3 text-right bg-[#F8CBAD] w-12 sm:w-44 uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">TOT</span>
                  <span className="hidden sm:inline">{labelTotales}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {dataDetalle.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400 bg-white text-xs">
                    {labelVacio}
                  </td>
                </tr>
              ) : (
                dataDetalle.map((row, idx) => (
                  <tr
                    key={idx}
                    className="border-t border-slate-200 align-middle bg-white hover:bg-slate-50 transition-colors"
                  >
                    <td className="border border-slate-200 px-2 sm:px-4 py-1.5 sm:py-2.5 font-semibold text-slate-800 text-[11px] sm:text-xs leading-snug sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] max-w-[125px] sm:max-w-none truncate sm:whitespace-normal">
                      <span className="sm:hidden" title={row.sucursal}>
                        {getSucursalCorta(row.sucursal)}
                      </span>
                      <span className="hidden sm:inline">{row.sucursal}</span>
                      <div className="hidden sm:block text-[10px] font-normal text-slate-400 mt-0.5">
                        {row.btlCve} • {row.cadena}
                      </div>
                    </td>
                    <td className="border border-slate-200 px-2 sm:px-4 py-1.5 sm:py-2.5 text-slate-700 font-medium text-[11px] sm:text-xs leading-snug max-w-[110px] sm:max-w-none truncate sm:whitespace-normal">
                      <span className="sm:hidden" title={row.nombreDc}>
                        {formatNombreDcCorto(row.nombreDc)}
                      </span>
                      <span className="hidden sm:inline">{row.nombreDc}</span>
                    </td>
                    <td className="border border-slate-200 px-1 sm:px-4 py-1.5 sm:py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium text-[11px] sm:text-xs tabular-nums">
                      {row.sem1 || '-'}
                    </td>
                    <td className="border border-slate-200 px-1 sm:px-4 py-1.5 sm:py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium text-[11px] sm:text-xs tabular-nums">
                      {row.sem2 || '-'}
                    </td>
                    <td className="border border-slate-200 px-1 sm:px-4 py-1.5 sm:py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium text-[11px] sm:text-xs tabular-nums">
                      {row.sem3 || '-'}
                    </td>
                    <td className="border border-slate-200 px-1 sm:px-4 py-1.5 sm:py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium text-[11px] sm:text-xs tabular-nums">
                      {row.sem4 || '-'}
                    </td>
                    <td className="border border-slate-200 px-1 sm:px-4 py-1.5 sm:py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium text-[11px] sm:text-xs tabular-nums">
                      {row.sem5 || '-'}
                    </td>
                    <td className="border border-slate-200 px-2 sm:px-4 py-1.5 sm:py-2.5 text-right font-bold text-slate-950 bg-[#F8CBAD]/15 text-[11px] sm:text-xs tabular-nums">
                      {row.total}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {dataDetalle.length > 0 && (
              <tfoot className="sticky bottom-0 z-20 bg-slate-50 font-bold border-t-2 border-slate-300 text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
                <tr>
                  <td
                    className="border border-slate-300 px-2 sm:px-4 py-2 sm:py-3 bg-slate-100 font-extrabold text-[11px] sm:text-xs sticky left-0 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]"
                    colSpan={2}
                  >
                    <span className="sm:hidden">TOTAL</span>
                    <span className="hidden sm:inline">TOTAL GENERAL</span>
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] font-extrabold text-[11px] sm:text-xs tabular-nums">
                    {totalsDetalle.sem1}
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] font-extrabold text-[11px] sm:text-xs tabular-nums">
                    {totalsDetalle.sem2}
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] font-extrabold text-[11px] sm:text-xs tabular-nums">
                    {totalsDetalle.sem3}
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] font-extrabold text-[11px] sm:text-xs tabular-nums">
                    {totalsDetalle.sem4}
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] font-extrabold text-[11px] sm:text-xs tabular-nums">
                    {totalsDetalle.sem5}
                  </td>
                  <td className="border border-slate-300 px-2 sm:px-4 py-2 sm:py-3 text-right bg-[#F8CBAD] font-extrabold text-[11px] sm:text-sm tabular-nums">
                    {totalsDetalle.grand}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {activeTab === 'dermo' && (
          <table className="min-w-full border-collapse border border-slate-300 text-xs">
            <thead className="sticky top-0 z-20 text-slate-900 font-bold text-left shadow-sm">
              <tr>
                <th className="border border-slate-300 px-2 sm:px-4 py-2 sm:py-3 bg-[#AEAAAA] uppercase tracking-wider text-[11px] sm:text-xs sticky left-0 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]">
                  <span className="sm:hidden">DC</span>
                  <span className="hidden sm:inline">NOMBRE DC</span>
                </th>
                <th className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] w-9 sm:w-20 uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">S1</span>
                  <span className="hidden sm:inline">SEM 1</span>
                </th>
                <th className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] w-9 sm:w-20 uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">S2</span>
                  <span className="hidden sm:inline">SEM 2</span>
                </th>
                <th className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] w-9 sm:w-20 uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">S3</span>
                  <span className="hidden sm:inline">SEM 3</span>
                </th>
                <th className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] w-9 sm:w-20 uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">S4</span>
                  <span className="hidden sm:inline">SEM 4</span>
                </th>
                <th className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] w-9 sm:w-20 uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">S5</span>
                  <span className="hidden sm:inline">SEM 5</span>
                </th>
                <th className="border border-slate-300 px-2 sm:px-4 py-2 sm:py-3 text-right bg-[#F8CBAD] w-12 sm:w-44 uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">TOT</span>
                  <span className="hidden sm:inline">TOTAL UNIDADES</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {dataDermo.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 bg-white text-xs">
                    {labelVacio}
                  </td>
                </tr>
              ) : (
                dataDermo.map((row, idx) => (
                  <tr
                    key={idx}
                    className="border-t border-slate-200 align-middle bg-white hover:bg-slate-50 transition-colors"
                  >
                    <td className="border border-slate-200 px-2 sm:px-4 py-1.5 sm:py-2.5 text-slate-800 font-semibold text-[11px] sm:text-xs leading-snug sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] max-w-[140px] sm:max-w-none truncate sm:whitespace-normal">
                      <span className="sm:hidden" title={row.nombreDc}>
                        {formatNombreDcCorto(row.nombreDc)}
                      </span>
                      <span className="hidden sm:inline">{row.nombreDc}</span>
                    </td>
                    <td className="border border-slate-200 px-1 sm:px-4 py-1.5 sm:py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium text-[11px] sm:text-xs tabular-nums">
                      {row.sem1 || '-'}
                    </td>
                    <td className="border border-slate-200 px-1 sm:px-4 py-1.5 sm:py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium text-[11px] sm:text-xs tabular-nums">
                      {row.sem2 || '-'}
                    </td>
                    <td className="border border-slate-200 px-1 sm:px-4 py-1.5 sm:py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium text-[11px] sm:text-xs tabular-nums">
                      {row.sem3 || '-'}
                    </td>
                    <td className="border border-slate-200 px-1 sm:px-4 py-1.5 sm:py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium text-[11px] sm:text-xs tabular-nums">
                      {row.sem4 || '-'}
                    </td>
                    <td className="border border-slate-200 px-1 sm:px-4 py-1.5 sm:py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium text-[11px] sm:text-xs tabular-nums">
                      {row.sem5 || '-'}
                    </td>
                    <td className="border border-slate-200 px-2 sm:px-4 py-1.5 sm:py-2.5 text-right font-bold text-slate-950 bg-[#F8CBAD]/15 text-[11px] sm:text-xs tabular-nums">
                      {row.total}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {dataDermo.length > 0 && (
              <tfoot className="sticky bottom-0 z-20 bg-slate-50 font-bold border-t-2 border-slate-300 text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
                <tr>
                  <td className="border border-slate-300 px-2 sm:px-4 py-2 sm:py-3 bg-slate-100 font-extrabold text-[11px] sm:text-xs sticky left-0 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]">
                    <span className="sm:hidden">TOTAL</span>
                    <span className="hidden sm:inline">TOTAL GENERAL</span>
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] font-extrabold text-[11px] sm:text-xs tabular-nums">
                    {totalsDermo.sem1}
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] font-extrabold text-[11px] sm:text-xs tabular-nums">
                    {totalsDermo.sem2}
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] font-extrabold text-[11px] sm:text-xs tabular-nums">
                    {totalsDermo.sem3}
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] font-extrabold text-[11px] sm:text-xs tabular-nums">
                    {totalsDermo.sem4}
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] font-extrabold text-[11px] sm:text-xs tabular-nums">
                    {totalsDermo.sem5}
                  </td>
                  <td className="border border-slate-300 px-2 sm:px-4 py-2 sm:py-3 text-right bg-[#F8CBAD] font-extrabold text-[11px] sm:text-sm tabular-nums">
                    {totalsDermo.grand}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {activeTab === 'sucursal' && (
          <table className="min-w-full border-collapse border border-slate-300 text-xs">
            <thead className="sticky top-0 z-20 text-slate-900 font-bold text-left shadow-sm">
              <tr>
                <th className="border border-slate-300 px-2 sm:px-4 py-2 sm:py-3 bg-[#AEAAAA] uppercase tracking-wider text-[11px] sm:text-xs sticky left-0 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]">
                  <span className="sm:hidden">SUCURSAL</span>
                  <span className="hidden sm:inline">SUCURSAL</span>
                </th>
                <th className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] w-9 sm:w-20 uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">S1</span>
                  <span className="hidden sm:inline">SEM 1</span>
                </th>
                <th className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] w-9 sm:w-20 uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">S2</span>
                  <span className="hidden sm:inline">SEM 2</span>
                </th>
                <th className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] w-9 sm:w-20 uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">S3</span>
                  <span className="hidden sm:inline">SEM 3</span>
                </th>
                <th className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] w-9 sm:w-20 uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">S4</span>
                  <span className="hidden sm:inline">SEM 4</span>
                </th>
                <th className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] w-9 sm:w-20 uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">S5</span>
                  <span className="hidden sm:inline">SEM 5</span>
                </th>
                <th className="border border-slate-300 px-2 sm:px-4 py-2 sm:py-3 text-right bg-[#F8CBAD] w-12 sm:w-44 uppercase tracking-wider text-[11px] sm:text-xs">
                  <span className="sm:hidden">TOT</span>
                  <span className="hidden sm:inline">TOTAL UNIDADES</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {dataSucursal.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 bg-white text-xs">
                    {labelVacio}
                  </td>
                </tr>
              ) : (
                dataSucursal.map((row, idx) => (
                  <tr
                    key={idx}
                    className="border-t border-slate-200 align-middle bg-white hover:bg-slate-50 transition-colors"
                  >
                    <td className="border border-slate-200 px-2 sm:px-4 py-1.5 sm:py-2.5 text-slate-800 font-semibold text-[11px] sm:text-xs leading-snug sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] max-w-[150px] sm:max-w-none truncate sm:whitespace-normal">
                      <span className="sm:hidden" title={row.sucursal}>
                        {getSucursalCorta(row.sucursal)}
                      </span>
                      <span className="hidden sm:inline">{row.sucursal}</span>
                      <div className="hidden sm:block text-[10px] font-normal text-slate-400 mt-0.5">
                        {row.btlCve} • {row.cadena}
                      </div>
                    </td>
                    <td className="border border-slate-200 px-1 sm:px-4 py-1.5 sm:py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium text-[11px] sm:text-xs tabular-nums">
                      {row.sem1 || '-'}
                    </td>
                    <td className="border border-slate-200 px-1 sm:px-4 py-1.5 sm:py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium text-[11px] sm:text-xs tabular-nums">
                      {row.sem2 || '-'}
                    </td>
                    <td className="border border-slate-200 px-1 sm:px-4 py-1.5 sm:py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium text-[11px] sm:text-xs tabular-nums">
                      {row.sem3 || '-'}
                    </td>
                    <td className="border border-slate-200 px-1 sm:px-4 py-1.5 sm:py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium text-[11px] sm:text-xs tabular-nums">
                      {row.sem4 || '-'}
                    </td>
                    <td className="border border-slate-200 px-1 sm:px-4 py-1.5 sm:py-2.5 text-center text-slate-800 bg-[#FCE4D6]/10 font-medium text-[11px] sm:text-xs tabular-nums">
                      {row.sem5 || '-'}
                    </td>
                    <td className="border border-slate-200 px-2 sm:px-4 py-1.5 sm:py-2.5 text-right font-bold text-slate-950 bg-[#F8CBAD]/15 text-[11px] sm:text-xs tabular-nums">
                      {row.total}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {dataSucursal.length > 0 && (
              <tfoot className="sticky bottom-0 z-20 bg-slate-50 font-bold border-t-2 border-slate-300 text-slate-900 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
                <tr>
                  <td className="border border-slate-300 px-2 sm:px-4 py-2 sm:py-3 bg-slate-100 font-extrabold text-[11px] sm:text-xs sticky left-0 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]">
                    <span className="sm:hidden">TOTAL</span>
                    <span className="hidden sm:inline">TOTAL GENERAL</span>
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] font-extrabold text-[11px] sm:text-xs tabular-nums">
                    {totalsSucursal.sem1}
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] font-extrabold text-[11px] sm:text-xs tabular-nums">
                    {totalsSucursal.sem2}
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] font-extrabold text-[11px] sm:text-xs tabular-nums">
                    {totalsSucursal.sem3}
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] font-extrabold text-[11px] sm:text-xs tabular-nums">
                    {totalsSucursal.sem4}
                  </td>
                  <td className="border border-slate-300 px-1 sm:px-4 py-2 sm:py-3 text-center bg-[#FCE4D6] font-extrabold text-[11px] sm:text-xs tabular-nums">
                    {totalsSucursal.sem5}
                  </td>
                  <td className="border border-slate-300 px-2 sm:px-4 py-2 sm:py-3 text-right bg-[#F8CBAD] font-extrabold text-[11px] sm:text-sm tabular-nums">
                    {totalsSucursal.grand}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
