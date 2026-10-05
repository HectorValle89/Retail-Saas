'use client';

import { useState, type FormEvent, Fragment } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  SUPERVISOR_CHECKLIST_ITEMS,
  isSupervisorChecklistItemNotApplicable,
} from '@/features/rutas/lib/supervisorVisitChecklist';
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

type PreviewMedia = {
  title: string;
  fullUrl: string;
  previewUrl: string | null;
};

export function VisitasSupervisoresDemandCard({
  periodoInicial,
  supervisoresDisponibles = [],
}: {
  periodoInicial: string;
  supervisoresDisponibles?: Array<{
    supervisorEmpleadoId: string;
    supervisor: string;
    zona?: string | null;
  }>;
}) {
  const [fechaInicio, setFechaInicio] = useState(() => {
    const [y, m] = periodoInicial.split('-');
    return y && m ? `${y}-${m}-01` : '';
  });
  const [fechaFin, setFechaFin] = useState(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const [y, m] = periodoInicial.split('-');
    if (y && m && todayStr.startsWith(`${y}-${m}`)) {
      return todayStr;
    }
    if (y && m) {
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      return `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    }
    return todayStr;
  });
  const [supervisorEmpleadoId, setSupervisorEmpleadoId] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<
    'TODAS' | 'COMPLETADA' | 'PLANIFICADA' | 'CANCELADA'
  >('COMPLETADA');
  const [limit, setLimit] = useState('5000');
  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null);

  const toggleExpand = (visitId: string) => {
    setExpandedVisitId((prev) => (prev === visitId ? null : visitId));
  };

  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [previewMedia, setPreviewMedia] = useState<PreviewMedia | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportExcel = () => {
    setIsExporting(true);
    const params = new URLSearchParams({
      estadoFiltro,
    });

    if (fechaInicio) params.set('fechaInicio', fechaInicio);
    if (fechaFin) params.set('fechaFin', fechaFin);
    if (supervisorEmpleadoId) {
      params.set('supervisorEmpleadoId', supervisorEmpleadoId);
    }

    const downloadUrl = `/api/reportes/visitas-supervisores/export?${params.toString()}`;
    window.location.href = downloadUrl;

    setTimeout(() => setIsExporting(false), 3000);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextFechaInicio = String(form.get('fechaInicio') ?? '').trim();
    const nextFechaFin = String(form.get('fechaFin') ?? '').trim();
    const nextSupervisorEmpleadoId = String(form.get('supervisorEmpleadoId') ?? '').trim();
    const nextEstadoFiltro = String(form.get('estadoFiltro') ?? 'COMPLETADA') as
      | 'TODAS'
      | 'COMPLETADA'
      | 'PLANIFICADA'
      | 'CANCELADA';
    const nextLimit = '5000';
    setFechaInicio(nextFechaInicio);
    setFechaFin(nextFechaFin);
    setSupervisorEmpleadoId(nextSupervisorEmpleadoId);
    setEstadoFiltro(nextEstadoFiltro);
    setLimit(nextLimit);
    setExpandedVisitId(null);
    setState({ status: 'loading' });

    try {
      const params = new URLSearchParams({
        estadoFiltro: nextEstadoFiltro,
        limit: nextLimit,
      });

      if (nextFechaInicio) params.set('fechaInicio', nextFechaInicio);
      if (nextFechaFin) params.set('fechaFin', nextFechaFin);
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
        className="grid gap-4 px-6 py-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[160px_160px_160px_1fr_auto] items-end"
      >
        <div>
          <label
            htmlFor="visitas-supervisores-fechainicio"
            className="mb-1.5 block text-sm font-medium text-slate-900"
          >
            Fecha Inicio
          </label>
          <input
            id="visitas-supervisores-fechainicio"
            name="fechaInicio"
            type="date"
            value={fechaInicio}
            onChange={(event) => setFechaInicio(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="visitas-supervisores-fechafin"
            className="mb-1.5 block text-sm font-medium text-slate-900"
          >
            Fecha Fin
          </label>
          <input
            id="visitas-supervisores-fechafin"
            name="fechaFin"
            type="date"
            value={fechaFin}
            onChange={(event) => setFechaFin(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 text-sm"
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
            <option value="">Todos los supervisores</option>
            {supervisoresDisponibles.length > 0
              ? supervisoresDisponibles.map((item) => (
                  <option key={item.supervisorEmpleadoId} value={item.supervisorEmpleadoId}>
                    {item.supervisor} {item.zona ? `· ${item.zona}` : ''}
                  </option>
                ))
              : state.status === 'loaded' &&
                state.data.supervisores.map((item) => (
                  <option key={item.supervisorEmpleadoId} value={item.supervisorEmpleadoId}>
                    {item.supervisor}
                  </option>
                ))}
          </select>
          {supervisoresDisponibles.length === 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Si generas el reporte primero, aquí aparecerán los supervisores con actividad en el
              periodo.
            </p>
          )}
        </div>
        <div className="flex flex-row gap-3 items-center w-full lg:w-auto">
          <Button type="submit" className="min-h-11 flex-1 lg:flex-none px-5">
            {state.status === 'loading' ? 'Generando...' : 'Generar detalle'}
          </Button>
          <Button
            type="button"
            onClick={handleExportExcel}
            disabled={isExporting}
            className="min-h-11 flex-1 lg:flex-none bg-emerald-700 hover:bg-emerald-600 text-white font-semibold flex items-center justify-center gap-2 px-5"
          >
            {isExporting ? (
              'Exportando...'
            ) : (
              <>
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Exportar Excel
              </>
            )}
          </Button>
        </div>
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
                    {[
                      'Fecha',
                      'Supervisor',
                      'PDV',
                      'Estatus',
                      'Entrada',
                      'Salida',
                      'Fotos',
                      'Comentarios',
                      '',
                    ].map((header) => (
                      <th key={header} className="px-5 py-3 font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.data.items.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-5 py-8 text-center text-slate-500">
                        No hay visitas visibles con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    state.data.items.map((item) => (
                      <Fragment key={item.visitId}>
                        <tr className="border-t border-slate-100 align-top">
                          <td className="px-5 py-4 text-slate-600">
                            <div className="font-medium text-slate-950">{item.diaLabel}</div>
                            <div className="mt-1 text-xs text-slate-400">{item.fechaOperacion}</div>
                          </td>
                          <td className="px-5 py-4 text-slate-600">
                            <div className="font-medium text-slate-950">{item.supervisor}</div>
                            <div className="mt-1 text-xs text-slate-400">
                              {item.idNomina ?? 'sin nomina'}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-slate-600">
                            <div className="font-medium text-slate-950">{item.pdv}</div>
                            <div className="mt-1 text-xs text-slate-400">
                              {item.pdvClaveBtl ?? 'sin clave'}
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
                          </td>
                          <td className="px-5 py-4 text-slate-600">
                            <div className="font-medium text-slate-950">
                              {item.checkInAt
                                ? new Intl.DateTimeFormat('es-MX', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true,
                                    timeZone: 'America/Mexico_City',
                                  }).format(new Date(item.checkInAt))
                                : 'Sin entrada'}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-slate-600">
                            <div className="font-medium text-slate-950">
                              {item.checkOutAt
                                ? new Intl.DateTimeFormat('es-MX', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true,
                                    timeZone: 'America/Mexico_City',
                                  }).format(new Date(item.checkOutAt))
                                : 'Sin salida'}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="grid gap-3 sm:grid-cols-2 max-w-[180px]">
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
                            <div className="max-w-xs text-sm text-slate-700">
                              {item.comentarios ?? 'Sin comentarios'}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => toggleExpand(item.visitId)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                              title="Ver detalle completo"
                            >
                              <svg
                                className={`h-5 w-5 transform transition-transform ${
                                  expandedVisitId === item.visitId ? 'rotate-180' : ''
                                }`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            </button>
                          </td>
                        </tr>
                        {expandedVisitId === item.visitId && (
                          <tr className="bg-slate-50/50">
                            <td colSpan={9} className="px-6 py-5 border-t border-slate-100">
                              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-6">
                                <div className="grid gap-6 md:grid-cols-2">
                                  <div className="space-y-4">
                                    <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                                      <span className="inline-flex h-2 w-2 rounded-full bg-sky-500" />
                                      Evidencia fotográfica
                                    </h4>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center space-y-2">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                          Selfie de Entrada
                                        </p>
                                        {item.selfieUrl ? (
                                          <div
                                            className="relative group cursor-pointer"
                                            onClick={() =>
                                              setPreviewMedia({
                                                title: `${item.supervisor} · Selfie`,
                                                fullUrl: item.selfieUrl!,
                                                previewUrl: item.selfieThumbnailUrl ?? null,
                                              })
                                            }
                                          >
                                            <img
                                              src={item.selfieThumbnailUrl ?? item.selfieUrl}
                                              alt="Selfie Entrada"
                                              className="mx-auto h-32 w-full object-cover rounded-lg border border-slate-200 transition group-hover:opacity-90"
                                            />
                                            <span className="absolute bottom-2 right-2 bg-slate-950/75 text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
                                              Ampliar
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="h-32 flex items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">
                                            Sin selfie
                                          </div>
                                        )}
                                      </div>

                                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center space-y-2">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                          Foto de Salida (Evidencia)
                                        </p>
                                        {item.evidenciaUrl ? (
                                          <div
                                            className="relative group cursor-pointer"
                                            onClick={() =>
                                              setPreviewMedia({
                                                title: `${item.supervisor} · Evidencia`,
                                                fullUrl: item.evidenciaUrl!,
                                                previewUrl: item.evidenciaThumbnailUrl ?? null,
                                              })
                                            }
                                          >
                                            <img
                                              src={item.evidenciaThumbnailUrl ?? item.evidenciaUrl}
                                              alt="Evidencia Salida"
                                              className="mx-auto h-32 w-full object-cover rounded-lg border border-slate-200 transition group-hover:opacity-90"
                                            />
                                            <span className="absolute bottom-2 right-2 bg-slate-950/75 text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
                                              Ampliar
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="h-32 flex items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">
                                            Sin evidencia
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-4 space-y-2.5">
                                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        Comentarios Generales
                                      </p>
                                      <p className="text-sm text-slate-800 leading-relaxed italic">
                                        {item.comentarios || 'Sin comentarios adicionales.'}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="space-y-4">
                                    <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                                      <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                                      Checklist de Calidad ({item.checklistCompletado}/
                                      {item.checklistTotal})
                                    </h4>
                                    <div className="max-h-[340px] overflow-y-auto pr-1 border border-slate-100 rounded-xl p-3 space-y-3 bg-slate-50/50">
                                      {SUPERVISOR_CHECKLIST_ITEMS.map((checkItem) => {
                                        const checklistCalidad = item.checklistCalidad || {};
                                        const checklistComments = item.checklistComments || {};
                                        const isNotApplicable =
                                          isSupervisorChecklistItemNotApplicable(
                                            checkItem.key,
                                            checklistCalidad
                                          );
                                        const isChecked = checklistCalidad[checkItem.key] === true;

                                        let badgeText = 'NO';
                                        let badgeColor = 'bg-rose-100 text-rose-700';
                                        if (isNotApplicable) {
                                          badgeText = 'N/A';
                                          badgeColor = 'bg-slate-100 text-slate-500';
                                        } else if (isChecked) {
                                          badgeText = 'SÍ';
                                          badgeColor = 'bg-emerald-100 text-emerald-700';
                                        }

                                        const commentText =
                                          'commentKey' in checkItem && checkItem.commentKey
                                            ? checklistComments[checkItem.commentKey]
                                            : null;

                                        return (
                                          <div
                                            key={checkItem.key}
                                            className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0"
                                          >
                                            <div className="flex items-start justify-between gap-3">
                                              <span className="text-xs text-slate-700 font-medium leading-relaxed">
                                                {checkItem.label}
                                              </span>
                                              <span
                                                className={`inline-flex min-w-[32px] justify-center rounded px-1.5 py-0.5 text-[10px] font-bold ${badgeColor}`}
                                              >
                                                {badgeText}
                                              </span>
                                            </div>
                                            {commentText && (
                                              <div className="mt-2 pl-3 border-l-2 border-slate-200">
                                                <p className="text-[11px] font-semibold text-slate-500">
                                                  {'commentLabel' in checkItem
                                                    ? String(checkItem.commentLabel)
                                                    : ''}
                                                </p>
                                                <p className="text-xs text-slate-700 mt-0.5">
                                                  {commentText}
                                                </p>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
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