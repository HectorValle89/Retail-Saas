'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ModalPanel } from '@/components/ui/modal-panel';
import type { VisitasSupervisoresData } from '../services/reporteVisitasSupervisoresService';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: VisitasSupervisoresData }
  | { status: 'error'; message: string };

function formatInteger(value: number) {
  return new Intl.NumberFormat('es-MX').format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Sin cierre';
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

type PreviewMedia = {
  title: string;
  fullUrl: string;
  previewUrl: string | null;
};

export function VisitasSupervisoresDemandCard({ periodoInicial }: { periodoInicial: string }) {
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [supervisorEmpleadoId, setSupervisorEmpleadoId] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<
    'TODAS' | 'COMPLETADA' | 'PLANIFICADA' | 'CANCELADA'
  >('COMPLETADA');
  const [limit, setLimit] = useState('25');
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [previewMedia, setPreviewMedia] = useState<PreviewMedia | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextPeriodo = String(form.get('periodo') ?? periodoInicial).trim() || periodoInicial;
    const nextSupervisorEmpleadoId = String(form.get('supervisorEmpleadoId') ?? '').trim();
    const nextEstadoFiltro = String(form.get('estadoFiltro') ?? 'COMPLETADA') as
      | 'TODAS'
      | 'COMPLETADA'
      | 'PLANIFICADA'
      | 'CANCELADA';
    const nextLimit = String(form.get('limit') ?? '25').trim() || '25';

    setPeriodo(nextPeriodo);
    setSupervisorEmpleadoId(nextSupervisorEmpleadoId);
    setEstadoFiltro(nextEstadoFiltro);
    setLimit(nextLimit);
    setState({ status: 'loading' });

    try {
      const params = new URLSearchParams({
        periodo: nextPeriodo,
        estadoFiltro: nextEstadoFiltro,
        limit: nextLimit,
      });

      if (nextSupervisorEmpleadoId) {
        params.set('supervisorEmpleadoId', nextSupervisorEmpleadoId);
      }

      const response = await fetch(`/api/reportes/visitas-supervisores?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const payload = (await response.json()) as {
        data?: VisitasSupervisoresData;
        message?: string;
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.message ?? 'No fue posible generar el detalle de visitas.');
      }

      setState({ status: 'loaded', data: payload.data });
    } catch (error) {
      setState({
        status: 'error',
        message:
          error instanceof Error ? error.message : 'No fue posible generar el detalle de visitas.',
      });
    }
  };

  return (
    <Card className="border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-6 py-4">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">
          Bajo demanda
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">
          Visitas y evidencias de supervisores
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Consulta las visitas operativas, selfies, evidencias y checklist sin cargar la ruta
          semanal. El detalle se genera cuando lo pides.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 px-6 py-5 md:grid-cols-[1fr_220px_220px_180px_auto] md:items-end"
      >
        <div>
          <label
            htmlFor="visitas-supervisores-periodo"
            className="mb-1.5 block text-sm font-medium text-slate-900"
          >
            Periodo
          </label>
          <input
            id="visitas-supervisores-periodo"
            name="periodo"
            type="month"
            value={periodo}
            onChange={(event) => setPeriodo(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900"
          />
        </div>
        <div>
          <label
            htmlFor="visitas-supervisores-estado"
            className="mb-1.5 block text-sm font-medium text-slate-900"
          >
            Estado de visita
          </label>
          <select
            id="visitas-supervisores-estado"
            name="estadoFiltro"
            value={estadoFiltro}
            onChange={(event) => setEstadoFiltro(event.target.value as typeof estadoFiltro)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900"
          >
            <option value="COMPLETADA">Completadas</option>
            <option value="TODAS">Todas</option>
            <option value="PLANIFICADA">Planificadas</option>
            <option value="CANCELADA">Canceladas</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="visitas-supervisores-supervisor"
            className="mb-1.5 block text-sm font-medium text-slate-900"
          >
            Supervisor
          </label>
          <select
            id="visitas-supervisores-supervisor"
            name="supervisorEmpleadoId"
            value={supervisorEmpleadoId}
            onChange={(event) => setSupervisorEmpleadoId(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900"
          >
            <option value="">Todos</option>
            {state.status === 'loaded' &&
              state.data.supervisores.map((item) => (
                <option key={item.supervisorEmpleadoId} value={item.supervisorEmpleadoId}>
                  {item.supervisor}
                </option>
              ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Si generas el reporte primero, aquí aparecerán los supervisores con actividad en el
            periodo.
          </p>
        </div>
        <div>
          <label
            htmlFor="visitas-supervisores-limit"
            className="mb-1.5 block text-sm font-medium text-slate-900"
          >
            Filas visibles
          </label>
          <select
            id="visitas-supervisores-limit"
            name="limit"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900"
          >
            {[10, 25, 50, 100].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" className="min-h-11">
          {state.status === 'loading' ? 'Generando...' : 'Generar detalle'}
        </Button>
      </form>

      <div className="px-6 pb-6">
        {state.status === 'idle' && (
          <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50 px-4 py-5 text-sm text-sky-900">
            Selecciona un periodo y presiona <span className="font-semibold">Generar detalle</span>{' '}
            para revisar las fotos y evidencias de visitas sin abrir Ruta semanal.
          </div>
        )}

        {state.status === 'error' && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-800">
            {state.message}
          </div>
        )}

        {state.status === 'loaded' && (
          <div className="space-y-5">
            {!state.data.infraestructuraLista && state.data.mensajeInfraestructura && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                {state.data.mensajeInfraestructura}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
              <SummaryTile
                label="Supervisores"
                value={formatInteger(state.data.resumen.supervisores)}
              />
              <SummaryTile label="Rutas" value={formatInteger(state.data.resumen.rutas)} />
              <SummaryTile label="Visitas" value={formatInteger(state.data.resumen.visitas)} />
              <SummaryTile
                label="Completadas"
                value={formatInteger(state.data.resumen.completadas)}
              />
              <SummaryTile label="Con selfie" value={formatInteger(state.data.resumen.selfies)} />
              <SummaryTile
                label="Con evidencia"
                value={formatInteger(state.data.resumen.evidencias)}
              />
              <SummaryTile
                label="Checklist"
                value={formatPercent(state.data.resumen.checklistPromedio)}
              />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    {['Fecha', 'Supervisor', 'PDV', 'Estado', 'Fotos', 'Checklist', 'Detalle'].map(
                      (header) => (
                        <th key={header} className="px-5 py-3 font-medium">
                          {header}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {state.data.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                        No hay visitas visibles con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    state.data.items.map((item) => (
                      <tr key={item.visitId} className="border-t border-slate-100 align-top">
                        <td className="px-5 py-4 text-slate-600">
                          <div className="font-medium text-slate-950">{item.diaLabel}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {item.fechaOperacion} / {formatDateTime(item.completadaEn)}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          <div className="font-medium text-slate-950">{item.supervisor}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {item.idNomina ?? 'sin nomina'} / {item.puesto ?? 'sin puesto'}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          <div className="font-medium text-slate-950">{item.pdv}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {item.pdvClaveBtl ?? 'sin clave'}
                            {item.zona ? ` · ${item.zona}` : ''}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              item.estatus === 'COMPLETADA'
                                ? 'bg-emerald-100 text-emerald-700'
                                : item.estatus === 'CANCELADA'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {item.estatus}
                          </span>
                          <div className="mt-2 text-xs text-slate-400">{item.rutaEstatus}</div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <PreviewTile
                              title="Selfie"
                              previewUrl={item.selfieThumbnailUrl ?? item.selfieUrl}
                              fullUrl={item.selfieUrl}
                              onOpen={() =>
                                item.selfieUrl &&
                                setPreviewMedia({
                                  title: `${item.supervisor} · Selfie`,
                                  fullUrl: item.selfieUrl,
                                  previewUrl: item.selfieThumbnailUrl ?? null,
                                })
                              }
                            />
                            <PreviewTile
                              title="Evidencia"
                              previewUrl={item.evidenciaThumbnailUrl ?? item.evidenciaUrl}
                              fullUrl={item.evidenciaUrl}
                              onOpen={() =>
                                item.evidenciaUrl &&
                                setPreviewMedia({
                                  title: `${item.supervisor} · Evidencia`,
                                  fullUrl: item.evidenciaUrl,
                                  previewUrl: item.evidenciaThumbnailUrl ?? null,
                                })
                              }
                            />
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          <div className="font-medium text-slate-950">
                            {item.checklistCompletado}/{item.checklistTotal}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">Checklist de calidad</div>
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          <div className="max-w-xs text-sm text-slate-700">
                            {item.comentarios ?? 'Sin comentarios'}
                          </div>
                          <div className="mt-2 text-xs text-slate-400">
                            Ruta {item.semanaInicio} · visita #{item.orden}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate-500">
              Mostrando {formatInteger(state.data.items.length)} de{' '}
              {formatInteger(state.data.resumen.visitas)} visitas filtradas. El detalle se obtiene
              solo cuando lo solicitas para no recargar la planeación semanal.
            </p>
          </div>
        )}
      </div>

      <ModalPanel
        open={Boolean(previewMedia)}
        onClose={() => setPreviewMedia(null)}
        title={previewMedia?.title ?? 'Evidencia'}
        subtitle="Vista previa compacta de la foto de la visita."
        maxWidthClassName="max-w-3xl"
      >
        {previewMedia && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50">
              <img
                src={previewMedia.fullUrl}
                alt={previewMedia.title}
                className="h-auto w-full max-h-[70vh] object-contain"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                La miniatura se muestra en la fila; aquí abrimos la versión completa.
              </p>
              <a
                href={previewMedia.fullUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-200"
              >
                Abrir en nueva pestaña
              </a>
            </div>
          </div>
        )}
      </ModalPanel>
    </Card>
  );
}

function PreviewTile({
  title,
  previewUrl,
  fullUrl,
  onOpen,
}: {
  title: string;
  previewUrl: string | null;
  fullUrl: string | null;
  onOpen: () => void;
}) {
  if (!fullUrl) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs font-medium text-slate-500">
        {title} pendiente
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md"
    >
      <div className="aspect-square overflow-hidden bg-slate-100">
        <img
          src={previewUrl ?? fullUrl}
          alt={`${title} de la visita`}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          loading="lazy"
        />
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="text-xs font-semibold text-slate-800">{title}</span>
        <span className="text-xs font-medium text-sky-700">Abrir</span>
      </div>
    </button>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}
