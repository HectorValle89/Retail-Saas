'use client';

import { useState, useEffect } from 'react';
import { obtenerHistorialEvidenciasSupervisor, type EvidenciaHistorialItem } from '../actions';

interface HistorialEvidenciasReadonlyProps {
  periodo?: string;
  pdvId?: string;
  supervisorId?: string;
}

export function HistorialEvidenciasReadonly({
  periodo,
  pdvId,
  supervisorId,
}: HistorialEvidenciasReadonlyProps) {
  const [items, setItems] = useState<EvidenciaHistorialItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const data = await obtenerHistorialEvidenciasSupervisor({
        periodo,
        pdvId,
        supervisorId,
      });
      setItems(data);
    } catch (err) {
      console.error('Error al cargar historial de evidencias:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchHistory();
  }, [periodo, pdvId, supervisorId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">📋 Historial de Evidencias Registradas en BD</h3>
          <p className="text-xs text-slate-500">
            Registros fotográficos guardados en la base de datos para los filtros aplicados.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchHistory()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
        >
          🔄 Actualizar
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm font-semibold text-slate-500 bg-slate-50 rounded-2xl border border-slate-200">
          Cargando registros del historial...
        </div>
      ) : items.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          No hay evidencias registradas en la base de datos para los filtros seleccionados.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-sky-300 transition"
            >
              <div className="flex items-start gap-3.5">
                {item.fotos && item.fotos.length > 0 && item.fotos[0].url ? (
                  <img
                    src={item.fotos[0].url}
                    alt="Evidencia"
                    className="h-16 w-16 rounded-xl object-cover border border-slate-200 shrink-0"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-100 border border-slate-200 text-slate-400 font-bold text-xs font-mono">
                    Sin Foto
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-slate-900 text-sm">{item.pdvNombre}</span>
                    {item.pdvClaveBtl && (
                      <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded-md text-slate-600">
                        {item.pdvClaveBtl}
                      </span>
                    )}
                    <span className="text-[10px] font-extrabold tracking-wide uppercase bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full">
                      {item.tipoEvidencia.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {item.receptorNombre && (
                    <p className="text-xs text-slate-600">
                      👤 Recibió: <span className="font-semibold text-slate-800">{item.receptorNombre}</span>
                      {item.puestoReceptor ? ` (${item.puestoReceptor})` : ''}
                    </p>
                  )}

                  {item.createdAt && (
                    <p className="text-[11px] text-slate-400">
                      📅 {new Date(item.createdAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  )}
                </div>
              </div>

              {item.fotos && item.fotos.length > 0 && (
                <div className="text-xs text-slate-500 font-semibold bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 self-end sm:self-center shrink-0">
                  📷 {item.fotos.length} foto(s)
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
