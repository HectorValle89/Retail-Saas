'use client';

import React, { useEffect } from 'react';
import {
  TablaSemanalReporte,
  type FilaDetalleSemanal,
  type FilaDermoSemanal,
  type FilaSucursalSemanal,
  type TotalesSemana,
} from './TablaSemanalReporte';

interface ModalTablaSemanalFullscreenProps {
  isOpen: boolean;
  onClose: () => void;
  titulo: string;
  tipo: 'ventas' | 'love';
  activeTab: 'detalle' | 'dermo' | 'sucursal';
  onTabChange: (tab: 'detalle' | 'dermo' | 'sucursal') => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  dataDetalle: FilaDetalleSemanal[];
  dataDermo: FilaDermoSemanal[];
  dataSucursal: FilaSucursalSemanal[];
  totalsDetalle: TotalesSemana;
  totalsDermo: TotalesSemana;
  totalsSucursal: TotalesSemana;
  totalRegistros: number;
}

export function ModalTablaSemanalFullscreen({
  isOpen,
  onClose,
  titulo,
  tipo,
  activeTab,
  onTabChange,
  searchTerm,
  onSearchChange,
  dataDetalle,
  dataDermo,
  dataSucursal,
  totalsDetalle,
  totalsDermo,
  totalsSucursal,
  totalRegistros,
}: ModalTablaSemanalFullscreenProps) {
  // Manejo de tecla Escape para cerrar
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Evitar scroll en el fondo cuando el modal esté abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm p-1.5 sm:p-4 flex flex-col animate-in fade-in duration-200"
    >
      <div className="w-full h-full max-w-7xl mx-auto bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-300">
        {/* Encabezado Superior */}
        <div className="px-3 sm:px-5 py-2.5 sm:py-3 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2 truncate">
              <span>⛶</span>
              <span className="truncate">{titulo}</span>
            </h3>
            <p className="text-[11px] text-slate-300 truncate hidden sm:block">
              Modo pantalla completa: Desliza libremente o gira tu teléfono para ver todas las semanas al mismo tiempo.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-extrabold bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition flex items-center gap-1.5 shrink-0 shadow-sm"
          >
            <span>✕</span>
            <span>Cerrar</span>
          </button>
        </div>

        {/* Barra de herramientas: Botones pequeños fuera de la tabla + Buscador */}
        <div className="p-2.5 sm:px-5 sm:py-3 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1 hidden sm:inline">
              Agrupar:
            </span>
            <button
              type="button"
              onClick={() => onTabChange('detalle')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5 ${
                activeTab === 'detalle'
                  ? 'bg-[#FF7FA5] text-white shadow-pink-200 ring-2 ring-[#FF7FA5]/20'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>📋</span>
              <span>Dermo + Tienda</span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange('dermo')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5 ${
                activeTab === 'dermo'
                  ? 'bg-[#FF7FA5] text-white shadow-pink-200 ring-2 ring-[#FF7FA5]/20'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>👩‍💼</span>
              <span>Por Dermo</span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange('sucursal')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5 ${
                activeTab === 'sucursal'
                  ? 'bg-[#FF7FA5] text-white shadow-pink-200 ring-2 ring-[#FF7FA5]/20'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>🏪</span>
              <span>Por Tienda</span>
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="🔍 Filtrar resultados..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-7 py-1.5 text-xs text-slate-700 shadow-sm focus:border-[var(--module-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--module-focus-ring)]"
            />
            {searchTerm && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
                type="button"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Helper tip */}
        <div className="px-3 sm:px-5 py-1.5 bg-pink-50/70 border-b border-pink-100 text-[11px] text-pink-900 flex items-center justify-between shrink-0">
          <span className="flex items-center gap-1">
            <span>💡</span>
            <span>
              Tip móvil: Desliza la tabla o gira tu celular horizontalmente para mayor comodidad.
            </span>
          </span>
          <span className="font-bold hidden sm:inline">{totalRegistros} registros cargados</span>
        </div>

        {/* Contenedor de la Tabla Fullscreen */}
        <div className="flex-1 overflow-auto p-2 sm:p-4 bg-slate-50/40">
          <TablaSemanalReporte
            tipo={tipo}
            activeTab={activeTab}
            dataDetalle={dataDetalle}
            dataDermo={dataDermo}
            dataSucursal={dataSucursal}
            totalsDetalle={totalsDetalle}
            totalsDermo={totalsDermo}
            totalsSucursal={totalsSucursal}
            isFullscreen={true}
          />
        </div>
      </div>
    </div>
  );
}
