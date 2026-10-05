'use client';

import { useState } from 'react';
import { Card } from '@/components/ui';
import type { CargaMasivaErrorItem, PreValidacionExcelResult } from '../types/inventario';

// ─── Types ───────────────────────────────────────────

export interface ImportacionExcelPanelProps {
  resultado: PreValidacionExcelResult | null;
  cargando: boolean;
  mensaje: string | null;
  ok: boolean;
}

// ─── Main Component ──────────────────────────────────

export function ImportacionExcelPanel({
  resultado,
  cargando,
  mensaje,
  ok,
}: ImportacionExcelPanelProps) {
  const [vistaErrores, setVistaErrores] = useState(false);

  if (!resultado && !cargando && !mensaje) {
    return null;
  }

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
          Pre-validación
        </p>
        <h3 className="mt-2 text-lg font-semibold text-slate-950">
          Resultado de validación del archivo
        </h3>
      </div>

      {cargando && (
        <div className="flex items-center gap-3 rounded-[18px] border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
          Validando archivo... Esto puede tomar unos segundos.
        </div>
      )}

      {mensaje && (
        <div
          className={`rounded-[18px] border p-4 text-sm ${
            ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {mensaje}
        </div>
      )}

      {resultado && (
        <>
          {/* Resumen */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <ResumenCard label="Filas totales" value={resultado.filas_totales} tone="slate" />
            <ResumenCard label="Filas válidas" value={resultado.filas_validas} tone="emerald" />
            <ResumenCard
              label="Con errores"
              value={resultado.filas_con_error}
              tone={resultado.filas_con_error > 0 ? 'rose' : 'slate'}
            />
            <div
              className={`rounded-[18px] border p-4 ${
                resultado.valido ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Estado
              </p>
              <p
                className={`mt-2 text-lg font-bold ${
                  resultado.valido ? 'text-emerald-700' : 'text-rose-600'
                }`}
              >
                {resultado.valido ? '✅ Listo' : '❌ Con errores'}
              </p>
            </div>
          </div>

          {/* Errores detallados */}
          {resultado.errores.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-rose-800">
                  ⚠️ {resultado.errores.length} errores encontrados
                </p>
                <button
                  type="button"
                  onClick={() => setVistaErrores(!vistaErrores)}
                  className="text-sm font-medium text-sky-700 hover:text-sky-900 transition-colors"
                >
                  {vistaErrores ? 'Ocultar detalle' : 'Ver detalle'}
                </button>
              </div>

              {vistaErrores && (
                <div className="overflow-x-auto rounded-[18px] border border-rose-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-rose-200 bg-rose-50 text-left text-xs font-semibold uppercase tracking-[0.14em] text-rose-600">
                        <th className="px-4 py-3">Fila</th>
                        <th className="px-4 py-3">Campo</th>
                        <th className="px-4 py-3">Código</th>
                        <th className="px-4 py-3">Error</th>
                        <th className="px-4 py-3">Valor actual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-100">
                      {resultado.errores.slice(0, 50).map((error, idx) => (
                        <ErrorRow key={`${error.fila}-${error.campo}-${idx}`} error={error} />
                      ))}
                    </tbody>
                  </table>
                  {resultado.errores.length > 50 && (
                    <div className="border-t border-rose-200 bg-rose-50 px-4 py-3 text-center text-xs text-rose-600">
                      Mostrando 50 de {resultado.errores.length} errores.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Preview de filas */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-950">
              Preview de datos ({resultado.preview.length} filas)
            </p>
            <div className="overflow-x-auto rounded-[18px] border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-4 py-3">Fila</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Descripción</th>
                    <th className="px-4 py-3">Lote</th>
                    <th className="px-4 py-3">Caducidad</th>
                    <th className="px-4 py-3 text-right">Cantidad</th>
                    <th className="px-4 py-3">PDV</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resultado.preview.slice(0, 50).map((fila) => (
                    <tr
                      key={fila.fila}
                      className={`transition-colors duration-100 ${
                        fila.estado === 'ERROR'
                          ? 'bg-rose-50 hover:bg-rose-100'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-4 py-3 text-xs text-slate-500">{fila.fila}</td>
                      <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700">
                        {fila.sku}
                      </td>
                      <td className="px-4 py-3 text-slate-900">{fila.descripcion}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {fila.numero_lote}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{fila.fecha_caducidad}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {fila.cantidad}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{fila.pdv_nombre ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                            fila.estado === 'OK'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {fila.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {resultado.preview.length > 50 && (
                <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-center text-xs text-slate-500">
                  Mostrando 50 de {resultado.preview.length} filas.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Sub-components ──────────────────────────────────

function ErrorRow({ error }: { error: CargaMasivaErrorItem }) {
  return (
    <tr className="bg-white hover:bg-rose-50 transition-colors duration-100">
      <td className="px-4 py-3 font-mono text-xs font-medium text-rose-700">{error.fila}</td>
      <td className="px-4 py-3 text-slate-700">{error.campo}</td>
      <td className="px-4 py-3">
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">
          {error.codigo}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-900">{error.mensaje}</td>
      <td className="px-4 py-3 font-mono text-xs text-slate-500">{error.valor_actual ?? '—'}</td>
    </tr>
  );
}

function ResumenCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'slate' | 'emerald' | 'rose';
}) {
  const colorClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50'
      : tone === 'rose'
        ? 'border-rose-200 bg-rose-50'
        : 'border-slate-200 bg-white';

  const valueClass =
    tone === 'emerald' ? 'text-emerald-700' : tone === 'rose' ? 'text-rose-600' : 'text-slate-900';

  return (
    <div className={`rounded-[18px] border p-4 ${colorClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}