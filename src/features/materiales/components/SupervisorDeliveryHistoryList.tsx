'use client';

import { useState, useMemo } from 'react';
import type { MaterialLastMileDeliveryItem } from '../services/materialService';

function formatTipoDispersionLabel(value?: string | null) {
  const map: Record<string, string> = {
    MENSUAL: 'Mensual (Ordinaria)',
    ADICIONAL: 'Por campaña',
    EXCLUSIVA_CANJES: 'Exclusiva Canjes',
    EXCLUSIVA_TESTERS: 'Exclusiva Testers',
    EXCLUSIVA_REGALOS: 'Exclusiva Regalos',
    ENTREGA_RESGUARDO: 'Entrega de paquete en resguardo',
  };
  return map[value ?? ''] ?? value ?? 'Mensual (Ordinaria)';
}

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

interface SupervisorDeliveryHistoryListProps {
  deliveries: MaterialLastMileDeliveryItem[];
  selectedMonth: string;
  monthLabel: string;
}

export function SupervisorDeliveryHistoryList({
  deliveries,
  selectedMonth,
  monthLabel,
}: SupervisorDeliveryHistoryListProps) {
  const [expandedDeliveryId, setExpandedDeliveryId] = useState<string | null>(null);

  // Filter deliveries belonging strictly to this operational month
  const monthDeliveries = useMemo(() => {
    return deliveries.filter((item) => item.mesOperacion === selectedMonth);
  }, [deliveries, selectedMonth]);

  if (monthDeliveries.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl">
          📦
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-800">
          Sin entregas registradas en {monthLabel}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Las entregas que registres para este mes de operación aparecerán aquí automáticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Entregas realizadas en {monthLabel} ({monthDeliveries.length})
        </p>
      </div>

      <div className="grid gap-3">
        {monthDeliveries.map((item) => {
          const isExpanded = expandedDeliveryId === item.id;
          const isResguardo = item.modoEntrega === 'POR_CUBRIR';
          const totalPiezas = item.totalReal ?? item.totalItems ?? 0;

          return (
            <div
              key={item.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300"
            >
              {/* Header Card */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100">
                      {item.pdvClaveBtl || 'PDV'}
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        isResguardo
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {isResguardo ? '📦 En Resguardo' : '✅ Entregado a DC'}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 leading-snug">
                    {item.pdvNombre}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(item.capturadoEn)} · {formatTipoDispersionLabel(item.tipoDispersion)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setExpandedDeliveryId(isExpanded ? null : item.id)}
                  className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-sky-50 hover:text-sky-800"
                >
                  {isExpanded ? 'Ocultar ▲' : 'Detalles ▼'}
                </button>
              </div>

              {/* Summary Badges */}
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
                <div>
                  <span className="font-semibold text-slate-800">Receptor:</span>{' '}
                  {item.receptor || 'No especificado'}
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Piezas:</span>{' '}
                  <span className="font-bold text-sky-700">{totalPiezas}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Evidencias:</span>{' '}
                  <span className="text-emerald-700 font-semibold">
                    📷 {item.evidencias?.length ?? 0} fotos
                  </span>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="mt-3 border-t border-slate-100 pt-3 space-y-3">
                  {/* Evidence Thumbnails */}
                  {item.evidencias && item.evidencias.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1.5">
                        Fotos de evidencia ({item.evidencias.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {item.evidencias.map((ev, idx) => (
                          <a
                            key={ev.id || idx}
                            href={ev.url ?? '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group relative block h-16 w-16 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-xs"
                          >
                            {/* eslint-disable-next-html-element-suppress */}
                            <img
                              src={ev.url ?? ''}
                              alt={`Evidencia ${idx + 1}`}
                              className="h-full w-full object-cover transition group-hover:scale-105"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Items list */}
                  {item.detalles && item.detalles.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1.5">
                        Materiales entregados
                      </p>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 space-y-1 text-xs">
                        {item.detalles.map((det, idx) => (
                          <div
                            key={det.id || idx}
                            className="flex items-center justify-between border-b border-slate-200/50 pb-1 last:border-b-0 last:pb-0"
                          >
                            <span className="text-slate-700 font-medium">{det.materialNombre}</span>
                            <span className="font-bold text-slate-900">
                              {det.cantidadRealRecibida ?? det.cantidadTeorica ?? 0} pza
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
