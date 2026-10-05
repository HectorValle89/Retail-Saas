'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SupervisorEvidenciasSheet } from './SupervisorEvidenciasSheet';
import { SupervisorUniformeSheet } from './SupervisorUniformeSheet';
import { SupervisorLastMileForm } from '@/features/materiales/components/SupervisorLastMileForm';
import {
  obtenerHistorialEvidenciasSupervisor,
  type EvidenciaHistorialItem,
} from '@/features/evidencias/actions';
import type { ActorActual } from '@/lib/auth/session';
import type {
  MaterialesPanelData,
  MaterialLastMileDeliveryItem,
} from '@/features/materiales/services/materialService';

interface EvidenciasEntregasHubProps {
  open?: boolean;
  onClose?: () => void;
  actor?: ActorActual;
  materialesData?: MaterialesPanelData | null;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
  isFullPage?: boolean;
}

function getCurrentMonthString() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}`;
}

function formatMonthLabel(monthVal: string) {
  try {
    const [yearStr, monthStr] = monthVal.split('-');
    const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
    return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(date);
  } catch {
    return monthVal;
  }
}

export function EvidenciasEntregasHub({
  onClose,
  actor,
  materialesData,
  onSuccess,
  onError,
}: EvidenciasEntregasHubProps) {
  const router = useRouter();

  // 3 MAIN TOP TABS: dispersiones | evidencias-campo | uniformes
  const [activeMainTab, setActiveMainTab] = useState<
    'dispersiones' | 'evidencias-campo' | 'uniformes'
  >('dispersiones');

  // Sub-view mode under Dispersiones
  const [subView, setSubView] = useState<'avance' | 'registrar'>('avance');

  // Success Notification Banner state (displays evidence registration result inside the Hub)
  const [successMessageBanner, setSuccessMessageBanner] = useState<string | null>(null);

  // Real Database Evidence History State
  const [historialEvidencias, setHistorialEvidencias] = useState<EvidenciaHistorialItem[]>([]);
  const [isLoadingHistorial, setIsLoadingHistorial] = useState<boolean>(true);

  // Fetch real evidence history from database
  const refreshEvidenciaHistory = async () => {
    setIsLoadingHistorial(true);
    try {
      const data = await obtenerHistorialEvidenciasSupervisor();
      setHistorialEvidencias(data);
    } catch (err) {
      console.error('Error al cargar historial de evidencias:', err);
    } finally {
      setIsLoadingHistorial(false);
    }
  };

  useEffect(() => {
    void refreshEvidenciaHistory();
  }, []);

  // Floating Toast state (guaranteed z-[9999] visibility above any overlay)
  const [internalToast, setInternalToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  useEffect(() => {
    if (!internalToast) return;
    const timer = setTimeout(() => setInternalToast(null), 7000);
    return () => clearTimeout(timer);
  }, [internalToast]);

  const handleRegistrationSuccess = (msg: string) => {
    setSuccessMessageBanner(msg);
    setInternalToast({ message: msg, type: 'success' });
    void refreshEvidenciaHistory();
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (onSuccess) onSuccess(msg);
  };

  const handleRegistrationError = (msg: string) => {
    setInternalToast({ message: msg, type: 'error' });
    if (onError) onError(msg);
  };

  // SHARED REACTIVE MONTH STATE (Auto-synced!)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getCurrentMonthString());

  // Month options list (last 12 months + next month)
  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const now = new Date();
    for (let i = -6; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      opts.push(`${year}-${month}`);
    }
    const current = getCurrentMonthString();
    if (!opts.includes(current)) opts.push(current);
    return Array.from(new Set(opts)).sort((a, b) => b.localeCompare(a));
  }, []);

  // Sync selected month if materialesData updates
  useEffect(() => {
    if (materialesData?.currentMonth) {
      setSelectedMonth(materialesData.currentMonth);
    }
  }, [materialesData?.currentMonth]);

  const deliveries: MaterialLastMileDeliveryItem[] = materialesData?.lastMileDeliveries ?? [];

  // Filter real evidence history by selected month
  const filteredHistorial = useMemo(() => {
    if (!selectedMonth) return historialEvidencias;
    return historialEvidencias.filter((item) => {
      const itemMonthOp = item.fechaOperacion ? item.fechaOperacion.slice(0, 7) : '';
      const itemMonthCreated = item.createdAt ? item.createdAt.slice(0, 7) : '';
      return itemMonthOp === selectedMonth || itemMonthCreated === selectedMonth;
    });
  }, [historialEvidencias, selectedMonth]);

  // Summary KPI counts for selected month calculated directly from real database evidence history
  const monthSummary = useMemo(() => {
    let entregados = 0;
    let resguardo = 0;

    for (const d of filteredHistorial) {
      if (d.modoEntrega === 'POR_CUBRIR') {
        resguardo += 1;
      } else {
        entregados += 1;
      }
    }

    return {
      entregados,
      resguardo,
      total: filteredHistorial.length,
    };
  }, [filteredHistorial]);

  const handleBack = () => {
    if (onClose) {
      onClose();
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* HEADER COMPACTO CON RETORNO Y TABS SEGMENTADOS */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 shrink-0 active:scale-95"
            >
              ← Volver
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-950 truncate">
                📸 Centro de Evidencias
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-500 hidden sm:block truncate">
                Dispersiones, evidencias de campo y uniformes
              </p>
            </div>
          </div>
        </div>

        {/* TABS SEGMENTADOS COMPACTOS EN 1 FILA */}
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200/60">
          <button
            type="button"
            onClick={() => setActiveMainTab('dispersiones')}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-1 text-xs font-bold transition-all truncate ${
              activeMainTab === 'dispersiones'
                ? 'bg-white text-sky-900 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <span className="text-sm">📦</span>
            <span className="truncate">Última Milla</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab('evidencias-campo')}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-1 text-xs font-bold transition-all truncate ${
              activeMainTab === 'evidencias-campo'
                ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <span className="text-sm">📸</span>
            <span className="truncate">Evidencias Campo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab('uniformes')}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-1 text-xs font-bold transition-all truncate ${
              activeMainTab === 'uniformes'
                ? 'bg-white text-emerald-900 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <span className="text-sm">👕</span>
            <span className="truncate">Uniformes</span>
          </button>
        </div>
      </div>

      {/* NOTIFICACIÓN COMPACTA DE EVIDENCIA REGISTRADA EXITOSAMENTE */}
      {successMessageBanner && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-50/90 p-3 sm:p-4 text-emerald-950 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white font-black text-sm shadow-xs">
              ✓
            </span>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-emerald-950 truncate">
                {successMessageBanner}
              </p>
              <p className="text-[11px] font-medium text-emerald-700 hidden sm:block">
                El registro ha sido confirmado en la base de datos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessageBanner(null)}
            className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-900 shadow-xs hover:bg-emerald-100 transition"
          >
            OK
          </button>
        </div>
      )}

      {/* 📦 BOTÓN 1: DISPERSIONES DE ÚLTIMA MILLA */}
      {activeMainTab === 'dispersiones' && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-6 shadow-xs space-y-5">
          {/* Sub-view toggle & month selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubView('avance')}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition ${
                  subView === 'avance'
                    ? 'bg-sky-700 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                📊 Avance del Mes
              </button>
              <button
                type="button"
                onClick={() => setSubView('registrar')}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition ${
                  subView === 'registrar'
                    ? 'bg-sky-700 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                ➕ Registrar Dispersión
              </button>
            </div>

            {/* SHARED MONTH SELECTOR */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Mes de Operación:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs sm:text-sm font-bold text-slate-800 shadow-xs focus:border-sky-500 focus:outline-none"
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sub-view 1: Avance y Resumen */}
          {subView === 'avance' && (
            <div className="space-y-5">
              {/* KPIs Header */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-emerald-900">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                    Entregados a DC
                  </p>
                  <p className="mt-1 text-3xl font-black">{monthSummary.entregados}</p>
                  <p className="text-xs text-emerald-800">En {formatMonthLabel(selectedMonth)}</p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-amber-900">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
                    En Resguardo
                  </p>
                  <p className="mt-1 text-3xl font-black">{monthSummary.resguardo}</p>
                  <p className="text-xs text-amber-800">Pendientes por liberar</p>
                </div>
                <div className="col-span-2 sm:col-span-1 rounded-2xl border border-sky-200 bg-sky-50/60 p-4 text-sky-900">
                  <p className="text-xs font-bold uppercase tracking-wider text-sky-700">
                    Total Registros
                  </p>
                  <p className="mt-1 text-3xl font-black">{monthSummary.total}</p>
                  <p className="text-xs text-sky-800">En el mes seleccionado</p>
                </div>
              </div>

              {/* REAL DATABASE EVIDENCE HISTORY LIST */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      📋 Historial de Evidencias Registradas
                    </h3>
                    <p className="text-xs text-slate-500">
                      Evidencias guardadas en la base de datos para tus puntos de venta.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshEvidenciaHistory()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  >
                    🔄 Actualizar
                  </button>
                </div>

                {isLoadingHistorial ? (
                  <div className="p-8 text-center text-sm font-semibold text-slate-500 bg-slate-50 rounded-2xl">
                    Cargando evidencias guardadas de la base de datos...
                  </div>
                ) : filteredHistorial.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    No hay evidencias registradas en {formatMonthLabel(selectedMonth)}. Cambia de
                    mes o haz clic en "+ Registrar Dispersión" para agregar una.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredHistorial.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-sky-300 transition"
                      >
                        <div className="flex items-start gap-3.5">
                          {/* Thumbnail / Foto */}
                          {item.fotos && item.fotos.length > 0 && item.fotos[0].url ? (
                            <img
                              src={item.fotos[0].url}
                              alt="Evidencia"
                              className="h-16 w-16 rounded-xl object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-100 border border-slate-200 text-slate-400 font-bold text-xs">
                              Sin Foto
                            </div>
                          )}

                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-extrabold text-slate-900 text-sm">
                                {item.pdvNombre}
                              </span>
                              {item.pdvClaveBtl && (
                                <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded-md text-slate-600">
                                  {item.pdvClaveBtl}
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                                  item.tipoEvidencia === 'ULTIMA_MILLA'
                                    ? 'bg-sky-100 text-sky-800'
                                    : item.tipoEvidencia === 'UNIFORMES' ||
                                        item.tipoEvidencia === 'ENTREGA_UNIFORMES'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-indigo-100 text-indigo-800'
                                }`}
                              >
                                {item.tipoEvidencia.replace('_', ' ')}
                              </span>
                            </div>

                            {item.receptorNombre && (
                              <p className="text-xs text-slate-600">
                                👤 Recibió:{' '}
                                <span className="font-semibold text-slate-800">
                                  {item.receptorNombre}
                                </span>
                                {item.puestoReceptor ? ` (${item.puestoReceptor})` : ''}
                              </p>
                            )}

                            {item.observaciones && (
                              <p className="text-xs text-slate-500 italic line-clamp-1">
                                "{item.observaciones}"
                              </p>
                            )}

                            <p className="text-[11px] text-slate-400">
                              📅{' '}
                              {new Date(item.createdAt).toLocaleDateString('es-MX', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          {item.fotos && item.fotos.length > 0 && (
                            <span className="text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl">
                              📷 {item.fotos.length} foto(s)
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sub-view 2: Registrar Dispersión */}
          {subView === 'registrar' && (
            <SupervisorLastMileForm
              actor={actor}
              materialesData={materialesData}
              selectedMonth={selectedMonth}
              onSuccess={(msg) => {
                handleRegistrationSuccess(msg);
                setSubView('avance');
              }}
              onError={(msg) => {
                if (onError) onError(msg);
              }}
              onCancel={() => setSubView('avance')}
            />
          )}
        </div>
      )}

      {/* 📸 BOTÓN 2: EVIDENCIAS DE CAMPO */}
      {activeMainTab === 'evidencias-campo' && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">📸 Registrar Evidencias de Campo</h3>
            <p className="text-xs text-slate-500">
              Captura fotos de implementaciones, displays, campañas estacionales, maleta Vanity y material POP en PDV.
            </p>
          </div>

          <SupervisorEvidenciasSheet
            open={true}
            inline={true}
            onClose={() => setActiveMainTab('dispersiones')}
            onSuccess={(msg) => {
              handleRegistrationSuccess(msg);
            }}
            onError={(msg) => {
              if (onError) onError(msg);
            }}
          />
        </div>
      )}

      {/* 👕 BOTÓN 3: ENTREGA DE UNIFORMES */}
      {activeMainTab === 'uniformes' && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">
              👕 Registrar Entrega de Uniformes
            </h3>
            <p className="text-xs text-slate-500">
              Sube la foto del acuse firmado y la foto de la persona recibiendo su kit de prendas.
            </p>
          </div>

          <SupervisorUniformeSheet
            open={true}
            inline={true}
            onClose={() => setActiveMainTab('dispersiones')}
            onSuccess={(msg) => {
              handleRegistrationSuccess(msg);
            }}
            onError={(msg) => {
              if (onError) onError(msg);
            }}
          />
        </div>
      )}

      {/* FLOATING TOAST CON Z-[9999] GARANTIZADO SOBRE CUALQUIER OVERLAY */}
      {internalToast && (
        <div
          className={`fixed bottom-6 right-6 z-[9999] flex max-w-md items-center gap-3 rounded-2xl p-4 font-bold text-white shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-5 ${
            internalToast.type === 'success'
              ? 'bg-slate-900/95 text-emerald-400 border border-emerald-500/50 shadow-emerald-950/40'
              : 'bg-slate-900/95 text-rose-400 border border-rose-500/50 shadow-rose-950/40'
          }`}
        >
          <span className="text-2xl">{internalToast.type === 'success' ? '✅' : '❌'}</span>
          <div className="flex-1 text-xs sm:text-sm">
            <p className="font-bold text-white">{internalToast.message}</p>
            <p className="text-[11px] font-normal text-slate-300 mt-0.5">
              Permaneces en el Centro de Evidencias y Entregas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setInternalToast(null)}
            className="ml-2 rounded-lg bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}