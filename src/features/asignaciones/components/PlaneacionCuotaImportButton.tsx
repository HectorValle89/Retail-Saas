'use client';

import {
  CheckCircle,
  DownloadSimple,
  FileXls,
  SpinnerGap,
  UploadSimple,
  WarningCircle,
} from '@phosphor-icons/react';
import { startTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ModalPanel } from '@/components/ui/modal-panel';
import {
  aplicarCuotasMensualesAction,
  previsualizarCuotasMensualesAction,
} from '@/features/asignaciones/planeacionCuotaActions';
import type { PlaneacionCuotaImportActionState } from '@/features/asignaciones/types/planeacionMensual';

const EMPTY_STATE: PlaneacionCuotaImportActionState = {
  ok: false,
  readyToApply: false,
  applied: false,
  idempotent: false,
  message: '',
  hash: null,
  loteId: null,
  issues: [],
  rows: [],
  summary: null,
  refreshPending: false,
};

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(value);
}

export function PlaneacionCuotaImportButton({
  cuentaClienteId,
  mes,
}: {
  cuentaClienteId: string;
  mes: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState(EMPTY_STATE);
  const [pending, setPending] = useState(false);

  const templateUrl = `/api/asignaciones/cuotas-template?${new URLSearchParams({
    cuentaClienteId,
    mes,
  })}`;

  function reset() {
    setFile(null);
    setResult(EMPTY_STATE);
    setPending(false);
  }

  function close() {
    setOpen(false);
    window.setTimeout(reset, 200);
  }

  function buildFormData(includeHash = false) {
    if (!file) return null;
    const formData = new FormData();
    formData.set('cuentaClienteId', cuentaClienteId);
    formData.set('mes', mes);
    formData.set('archivo', file);
    if (includeHash && result.hash) formData.set('hash', result.hash);
    return formData;
  }

  function preview() {
    const formData = buildFormData();
    if (!formData) return;
    setPending(true);
    startTransition(async () => {
      try {
        setResult(await previsualizarCuotasMensualesAction(formData));
      } finally {
        setPending(false);
      }
    });
  }

  function apply() {
    const formData = buildFormData(true);
    if (!formData || !result.readyToApply || !result.hash) return;
    setPending(true);
    startTransition(async () => {
      try {
        const next = await aplicarCuotasMensualesAction(formData);
        setResult(next);
        if (next.applied) router.refresh();
      } finally {
        setPending(false);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        data-testid="abrir-importador-cuotas"
        className="xl:min-h-8 xl:px-3 xl:text-[11px]"
      >
        <FileXls className="h-4 w-4" aria-hidden="true" />
        Importar cuotas
      </Button>

      <ModalPanel
        open={open}
        onClose={close}
        title="Importar cuotas mensuales"
        subtitle={`${mes.slice(0, 7)} · publicación por lote con vista previa`}
        maxWidthClassName="max-w-5xl"
      >
        <div className="space-y-5" data-testid="importador-cuotas-mensuales">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">1</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Descarga la plantilla</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Incluye los PDVs vigentes y pesos editables por día de semana.
              </p>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">2</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Valida el archivo</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Ninguna fila se escribe hasta que el lote completo esté limpio.
              </p>
            </div>
            <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-violet-700">3</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Publica y recalcula</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Sólo se actualizan el mes y los PDVs contenidos en el archivo.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">Plantilla oficial del mes</p>
              <p className="mt-1 text-xs text-slate-500">
                Cuotas vacías se omiten; los pesos predeterminados distribuyen uniformemente.
              </p>
            </div>
            <a
              href={templateUrl}
              download
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-teal-100"
            >
              <DownloadSimple className="h-4 w-4" aria-hidden="true" />
              Descargar XLSX
            </a>
          </div>

          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Archivo XLSX
            <span className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 text-center transition hover:border-teal-400 hover:bg-teal-50/40">
              <UploadSimple className="h-7 w-7 text-teal-700" aria-hidden="true" />
              <span className="mt-2 text-sm font-bold text-slate-900">
                {file?.name ?? 'Selecciona el archivo de cuotas'}
              </span>
              <span className="mt-1 text-xs font-normal text-slate-500">XLSX · máximo 8 MB</span>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setResult(EMPTY_STATE);
                }}
              />
            </span>
          </label>

          {result.message ? (
            <div
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
                result.ok || result.applied
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
              role="status"
            >
              {result.ok || result.applied ? (
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              ) : (
                <WarningCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              )}
              <span>{result.message}</span>
            </div>
          ) : null}

          {result.summary ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500">PDVs válidos</p>
                <p className="mt-1 text-xl font-bold text-slate-950">{result.summary.pdvs}</p>
              </div>
              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500">Días generados</p>
                <p className="mt-1 text-xl font-bold text-slate-950">{result.summary.dias}</p>
              </div>
              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500">Cuota mensual</p>
                <p className="mt-1 text-xl font-bold text-teal-700">
                  {formatMoney(result.summary.cuotaMensual)}
                </p>
              </div>
            </div>
          ) : null}

          {result.issues.length > 0 ? (
            <div className="max-h-48 overflow-auto rounded-2xl border border-rose-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-rose-50 text-rose-900">
                  <tr>
                    <th className="px-3 py-2">Fila</th>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {result.issues.map((issue, index) => (
                    <tr
                      key={`${issue.rowNumber}-${issue.code}-${index}`}
                      className="border-t border-rose-100"
                    >
                      <td className="px-3 py-2 font-bold">{issue.rowNumber || '—'}</td>
                      <td className="px-3 py-2 font-semibold">{issue.code}</td>
                      <td className="px-3 py-2">{issue.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {result.rows.length > 0 ? (
            <div className="max-h-72 overflow-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Fila</th>
                    <th className="px-3 py-2">Cadena / PDV</th>
                    <th className="px-3 py-2">BTL</th>
                    <th className="px-3 py-2 text-right">Cuota mensual</th>
                    <th className="px-3 py-2 text-right">Rango diario</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, 200).map((row) => (
                    <tr key={row.pdvId} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-bold text-slate-500">{row.rowNumber}</td>
                      <td className="px-3 py-2">
                        <span className="font-bold text-slate-900">{row.pdvNombre}</span>
                        <span className="block text-slate-500">
                          {row.cadenaNombre ?? 'Sin cadena'}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-semibold text-teal-700">{row.claveBtl}</td>
                      <td className="px-3 py-2 text-right font-bold">
                        {formatMoney(row.cuotaMensual)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {formatMoney(row.cuotaDiariaMinima)} – {formatMoney(row.cuotaDiariaMaxima)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.rows.length > 200 ? (
                <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                  Se muestran 200 de {result.rows.length} filas válidas.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              {result.applied ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!result.applied ? (
              <Button type="button" variant="outline" onClick={preview} disabled={!file || pending}>
                {pending ? <SpinnerGap className="h-4 w-4 animate-spin" /> : null}
                Validar archivo
              </Button>
            ) : null}
            {result.readyToApply && !result.applied ? (
              <Button type="button" onClick={apply} disabled={pending}>
                {pending ? <SpinnerGap className="h-4 w-4 animate-spin" /> : null}
                Publicar lote completo
              </Button>
            ) : null}
          </div>
        </div>
      </ModalPanel>
    </>
  );
}
