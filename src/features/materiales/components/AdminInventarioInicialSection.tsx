'use client';

import { useFormStatus } from 'react-dom';
import { Card, Button } from '@/components/ui';
import { useState } from 'react';
import {
  getSingleTenantAccountLabel,
  resolveSingleTenantAccountOption,
} from '@/lib/tenant/singleTenant';

export interface MaterialActionState {
  ok: boolean;
  message: string | null;
  metadata?: {
    errores?: Array<{
      fila: number;
      pdv: string;
      material: string;
      cantidad: any;
      errores: string[];
    }>;
    procesados?: Array<{
      fila: number;
      pdvNombre: string;
      materialNombre: string;
      cantidad: number;
    }>;
  } | null;
}

interface Props {
  data: {
    accountOptions: any[];
  };
  state: MaterialActionState;
  action: (formData: FormData) => void;
}

function SubmitButton({
  label,
  pendingLabel,
  disabled,
}: {
  label: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" isLoading={pending} disabled={disabled} className="min-w-[200px]">
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function AdminInventarioInicialSection({ data, state, action }: Props) {
  const fixedAccount = resolveSingleTenantAccountOption(data.accountOptions);
  const [vistaErrores, setVistaErrores] = useState(false);
  const [vistaProcesados, setVistaProcesados] = useState(true);

  const errores = state.metadata?.errores || [];
  const procesados = state.metadata?.procesados || [];

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">
          Inventario Inicial
        </p>
        <h3 className="mt-2 text-lg font-semibold text-slate-950">
          Establecer saldo inicial de canjes
        </h3>
      </div>

      <form action={action} className="grid gap-4">
        <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-900">Plantilla de Inventario Inicial</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Carga el inventario físico de canjes por Punto de Venta (PDV). Esta carga actuará como{' '}
            <strong>"Borrón y Cuenta Nueva"</strong>, estableciendo la línea base de stock
            disponible. Las columnas del Excel deben ser: <strong>PUNTO DE VENTA</strong> (nombre de
            tienda o clave BTL), <strong>CANJE</strong> (nombre del material) y{' '}
            <strong>CANTIDAD</strong>.
          </p>
          <div className="mt-3">
            <a
              href="/api/materiales/inventario-inicial-template"
              className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-slate-200 bg-white px-4.5 py-2.5 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50"
            >
              Descargar plantilla de Inventario Inicial
            </a>
          </div>
        </div>

        <input type="hidden" name="cuenta_cliente_id" value={fixedAccount?.id ?? ''} />

        <div>
          <p className="mb-1.5 block text-sm font-medium text-slate-700">Cliente ISDIN</p>
          <div className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900">
            {getSingleTenantAccountLabel()}
          </div>
        </div>

        <label className="block text-sm text-slate-600">
          Archivo Excel (XLSX)
          <input
            name="archivo_excel"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            className="mt-2 block w-full rounded-[14px] border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
          />
        </label>

        <div className="rounded-[18px] border border-sky-100 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
          ⚠️ Al confirmar la carga, se registrarán estos saldos iniciales en la base de datos de
          producción y comenzará la deducción automática por cada canje realizado por el equipo de
          campo.
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton label="Cargar inventario inicial" pendingLabel="Procesando Excel..." />
        </div>

        {/* Mensaje de Estado principal */}
        {state.message && (
          <div
            className={`rounded-[18px] border p-4 text-sm leading-6 ${
              state.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            {state.message}
          </div>
        )}

        {/* Mostrar Errores de Validación */}
        {errores.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-rose-800">
                ⚠️ Se encontraron {errores.length} filas con detalles por corregir
              </p>
              <button
                type="button"
                onClick={() => setVistaErrores(!vistaErrores)}
                className="text-sm font-medium text-sky-700 hover:text-sky-900 transition-colors"
              >
                {vistaErrores ? 'Ocultar errores' : 'Ver errores a detalle'}
              </button>
            </div>

            {vistaErrores && (
              <div className="overflow-x-auto rounded-[18px] border border-rose-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-rose-200 bg-rose-50 text-left text-xs font-semibold uppercase tracking-[0.14em] text-rose-600">
                      <th className="px-4 py-3">Fila</th>
                      <th className="px-4 py-3">Punto de Venta</th>
                      <th className="px-4 py-3">Canje / Material</th>
                      <th className="px-4 py-3 text-right">Cant.</th>
                      <th className="px-4 py-3">Detalle del Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100">
                    {errores.map((err, idx) => (
                      <tr
                        key={idx}
                        className="bg-white hover:bg-rose-50/50 transition duration-150"
                      >
                        <td className="px-4 py-3 font-mono text-xs font-bold text-rose-600">
                          {err.fila}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{err.pdv || '—'}</td>
                        <td className="px-4 py-3 text-slate-700">{err.material || '—'}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-950">
                          {err.cantidad ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-rose-700">
                          <ul className="list-disc pl-4 space-y-1">
                            {err.errores.map((item, keyIdx) => (
                              <li key={keyIdx}>{item}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Mostrar Filas Procesadas con Éxito */}
        {state.ok && procesados.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-emerald-800">
                ✅ Resumen de inventarios cargados ({procesados.length} PDVs)
              </p>
              <button
                type="button"
                onClick={() => setVistaProcesados(!vistaProcesados)}
                className="text-sm font-medium text-sky-700 hover:text-sky-900 transition-colors"
              >
                {vistaProcesados ? 'Ocultar listado' : 'Ver listado cargado'}
              </button>
            </div>

            {vistaProcesados && (
              <div className="overflow-x-auto rounded-[18px] border border-emerald-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-emerald-200 bg-emerald-50 text-left text-xs font-semibold uppercase tracking-[0.14em] text-emerald-600">
                      <th className="px-4 py-3">Fila</th>
                      <th className="px-4 py-3">Punto de Venta</th>
                      <th className="px-4 py-3">Canje / Material</th>
                      <th className="px-4 py-3 text-right">Cant. Cargada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-100">
                    {procesados.map((item, idx) => (
                      <tr
                        key={idx}
                        className="bg-white hover:bg-emerald-50/30 transition duration-150"
                      >
                        <td className="px-4 py-3 font-mono text-xs font-medium text-slate-500">
                          {item.fila}
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-950">
                          {item.pdvNombre}
                        </td>
                        <td className="px-4 py-3 text-slate-800">{item.materialNombre}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-700">
                          {item.cantidad}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </form>
    </Card>
  );
}
