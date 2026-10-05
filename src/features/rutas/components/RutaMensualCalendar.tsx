'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ModalPanel } from '@/components/ui/modal-panel';
import { Select } from '@/components/ui/select';
import { getIsoDateInMexicoCity } from '@/lib/geo/mexicoStateTimezone';
import { formatearDistanciaMetrica } from '@/lib/geo/distanceFormat';
import { ejecutarGestionRutasMes, previsualizarGestionRutasMes } from '../actions';
import {
  getRutaMesActionLabel,
  type RutaMesManagementAction,
  type RutaMesManagementSummary,
} from '../lib/monthlyRouteManagement';
import {
  formatRouteCalendarDate,
  formatRouteCalendarMonth,
  normalizeRouteCalendarMonth,
  shiftRouteCalendarMonth,
} from '../lib/rutaCalendar';
import type {
  GeocercaEvaluacionEstado,
  RutaCalendarioCell,
  RutaCalendarioDiaDetail,
  RutaCalendarioEventDetail,
  RutaCalendarioMensualData,
  RutaCalendarioSupervisorRow,
  RutaCalendarioVisitDetail,
} from '../services/rutaCalendarioMensualService';

interface SupervisorOption {
  supervisorEmpleadoId: string;
  supervisor: string;
  zona: string | null;
}

interface RutaMensualCalendarProps {
  supervisorOptions: SupervisorOption[];
  actorPuesto: string;
  refreshToken?: string | null;
  month?: string | null;
  onMonthChange?: (monthIso: string) => void;
  onExportMonth?: () => void;
  isExportingMonth?: boolean;
}

function cellToneClass(cell: RutaCalendarioCell) {
  const tone = {
    neutral: 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:bg-slate-50',
    slate: 'border-slate-300 bg-slate-100 text-slate-700 hover:border-slate-400',
    sky: 'border-sky-200 bg-sky-50 text-sky-800 hover:border-sky-300',
    violet: 'border-violet-200 bg-violet-50 text-violet-800 hover:border-violet-300',
    amber: 'border-amber-300 bg-amber-100 text-amber-900 hover:border-amber-400 font-bold',
    rose: 'border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-300',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300',
  }[cell.tone];

  return `flex min-h-11 min-w-11 w-full flex-col items-center justify-center overflow-hidden rounded-lg border px-0.5 py-0.5 text-[9px] font-bold leading-none transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-400 lg:min-h-8 lg:min-w-0 xl:text-[10px] ${tone}`;
}

function buildEmptyRow(
  supervisor: SupervisorOption,
  days: RutaCalendarioMensualData['days']
): RutaCalendarioSupervisorRow {
  return {
    supervisorEmpleadoId: supervisor.supervisorEmpleadoId,
    supervisor: supervisor.supervisor,
    zona: supervisor.zona,
    cells: days.map((day) => ({
      fecha: day.fecha,
      numero: day.numero,
      letra: day.letra,
      routeId: null,
      routeStatus: null,
      approvalState: 'SIN_RUTA',
      plannedCount: 0,
      completedCount: 0,
      pendingCount: 0,
      replacementPendingCount: 0,
      eventCount: 0,
      displacedCount: 0,
      tone: 'neutral',
      label: 'Sin ruta',
    })),
  };
}

function mergeSupervisorRows(
  data: RutaCalendarioMensualData,
  supervisorOptions: SupervisorOption[],
  selectedSupervisorId: string
) {
  const routeRows = new Map(data.supervisors.map((row) => [row.supervisorEmpleadoId, row]));
  const candidates = supervisorOptions.length > 0 ? supervisorOptions : data.supervisors;
  const rows = candidates.map(
    (option) => routeRows.get(option.supervisorEmpleadoId) ?? buildEmptyRow(option, data.days)
  );

  for (const row of data.supervisors) {
    if (!rows.some((item) => item.supervisorEmpleadoId === row.supervisorEmpleadoId)) {
      const hasMonthActivity = row.cells.some(
        (cell) =>
          cell.plannedCount > 0 ||
          cell.completedCount > 0 ||
          cell.eventCount > 0 ||
          cell.replacementPendingCount > 0
      );
      if (hasMonthActivity) {
        rows.push(row);
      }
    }
  }

  return rows
    .filter((row) => !selectedSupervisorId || row.supervisorEmpleadoId === selectedSupervisorId)
    .sort((left, right) => left.supervisor.localeCompare(right.supervisor, 'es'));
}

function getCellAriaLabel(row: RutaCalendarioSupervisorRow, cell: RutaCalendarioCell) {
  const status =
    cell.approvalState === 'SIN_RUTA'
      ? 'sin ruta'
      : cell.approvalState.toLowerCase().replaceAll('_', ' ');
  return `${row.supervisor}, ${cell.fecha}, ${status}, ${cell.plannedCount} planeadas, ${cell.completedCount} realizadas, ${cell.pendingCount} pendientes`;
}

function getCompactCellLabel(cell: RutaCalendarioCell) {
  if (cell.approvalState === 'SIN_RUTA') return '—';
  return cell.label;
}

function DetailMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function GeocercaBadge({
  estado,
  resumen,
  compact = false,
}: {
  estado: GeocercaEvaluacionEstado;
  resumen: string;
  compact?: boolean;
}) {
  if (estado === 'DENTRO') {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800"
        title={resumen}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {compact ? 'Dentro geocerca' : resumen}
      </span>
    );
  }

  if (estado === 'FUERA') {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800"
        title={resumen}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        {compact ? 'Fuera geocerca' : resumen}
      </span>
    );
  }

  if (estado === 'SIN_GPS') {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600"
        title={resumen}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        Sin GPS
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500"
      title={resumen}
    >
      GPS no registrado
    </span>
  );
}

function VisitDetailCard({
  visit,
  index,
  title,
  onInspect,
}: {
  visit: RutaCalendarioVisitDetail;
  index?: number;
  title?: string;
  onInspect: (visit: RutaCalendarioVisitDetail) => void;
}) {
  const isDisplaced = visit.desplazamiento?.displaced;
  const visitNumber = index !== undefined ? index + 1 : visit.orden;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-slate-950">
              #{visitNumber} · {visit.pdv ?? 'PDV sin nombre'}
            </p>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                visit.estatus === 'COMPLETADA'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {title ?? visit.estatus}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {visit.claveBtl ?? 'Sin clave'} · {visit.zona ?? 'Sin zona'}
            {visit.direccion ? ` · ${visit.direccion}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <GeocercaBadge estado={visit.geocercaEstado} resumen={visit.geocercaResumen} />
          {visit.fotos.length > 0 ? (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800">
              📷 {visit.fotos.length} foto{visit.fotos.length > 1 ? 's' : ''}
            </span>
          ) : null}
        </div>
      </div>

      {isDisplaced && visit.desplazamiento ? (
        <div className="mt-2.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-900">
          🔄 <strong>Tienda desplazada</strong> por:{' '}
          <span className="font-semibold">{visit.desplazamiento.eventTitulo}</span> (
          {visit.desplazamiento.tipoLabel} · {visit.desplazamiento.modoImpactoLabel})
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
        <span>
          <strong className="text-slate-700">Llegada:</strong>{' '}
          {visit.checkInAt
            ? new Date(visit.checkInAt).toLocaleTimeString('es-MX', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Sin registro'}
        </span>
        <span>
          <strong className="text-slate-700">Salida:</strong>{' '}
          {visit.checkOutAt
            ? new Date(visit.checkOutAt).toLocaleTimeString('es-MX', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Sin registro'}
        </span>
        <span>
          <strong className="text-slate-700">Checklist:</strong> {visit.checklistCompletion}%
        </span>
      </div>

      {visit.pendingReason ? (
        <p className="mt-2 text-xs font-medium text-rose-700">
          Pendiente: {visit.pendingReason}
          {visit.pendingClassification ? ` · ${visit.pendingClassification}` : ''}
        </p>
      ) : null}

      {visit.comentarios ? (
        <p className="mt-2 line-clamp-2 rounded-xl border border-slate-100 bg-slate-50 p-2 text-xs text-slate-600">
          <strong className="text-slate-700">Comentario:</strong> {visit.comentarios}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-end border-t border-slate-100 pt-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onInspect(visit)}
          className="text-xs font-semibold text-sky-700 hover:text-sky-900"
        >
          Ver detalle de visita →
        </Button>
      </div>
    </div>
  );
}

function EventDetailCard({
  event,
  onInspect,
}: {
  event: RutaCalendarioEventDetail;
  onInspect: (event: RutaCalendarioEventDetail) => void;
}) {
  const isVisitaAdicional = event.tipoEvento === 'VISITA_ADICIONAL';

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4 text-sm text-slate-900 transition hover:border-violet-300">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-violet-950">{event.titulo}</p>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                isVisitaAdicional
                  ? 'border border-amber-300 bg-amber-100 text-amber-900'
                  : 'bg-violet-200 text-violet-900'
              }`}
            >
              {event.tipoLabel}
            </span>
          </div>
          <p className="mt-1 text-xs text-violet-900">
            {event.pdv ?? event.sede ?? 'Sin sede'}{' '}
            {event.horaInicio
              ? `· Horario: ${event.horaInicio}${event.horaFin ? ` - ${event.horaFin}` : ''}`
              : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-semibold text-violet-800">
            {event.modoImpactoLabel}
          </span>
          <GeocercaBadge estado={event.geocercaEstado} resumen={event.geocercaResumen} />
          {event.fotos.length > 0 ? (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800">
              📷 {event.fotos.length} foto{event.fotos.length > 1 ? 's' : ''}
            </span>
          ) : null}
        </div>
      </div>

      {event.displacedVisits.length > 0 ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-900">
          <p className="font-bold">Tiendas desplazadas de la ruta principal:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {event.displacedVisits.map((v) => (
              <li key={v.id}>
                #{v.orden} · {v.pdv ?? 'PDV'} {v.claveBtl ? `(${v.claveBtl})` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {event.descripcion ? (
        <p className="mt-2 rounded-xl border border-violet-100 bg-white/70 p-2 text-xs text-violet-950/80">
          {event.descripcion}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-end border-t border-violet-200/60 pt-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onInspect(event)}
          className="text-xs font-semibold text-violet-800 hover:text-violet-950"
        >
          Ver detalle del evento →
        </Button>
      </div>
    </div>
  );
}

function ImageLightboxModal({
  url,
  title,
  onClose,
}: {
  url: string | null;
  title: string | null;
  onClose: () => void;
}) {
  if (!url) return null;

  return (
    <ModalPanel
      open={Boolean(url)}
      onClose={onClose}
      title={title ?? 'Fotografía'}
      maxWidthClassName="max-w-3xl"
    >
      <div className="overflow-hidden rounded-2xl bg-black">
        <img
          src={url}
          alt={title ?? 'Fotografía ampliada'}
          className="mx-auto max-h-[75vh] w-full object-contain"
        />
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cerrar vista previa
        </Button>
      </div>
    </ModalPanel>
  );
}

function VisitInspectionModal({
  visit,
  supervisorName,
  fechaLabel,
  onClose,
  onOpenImage,
}: {
  visit: RutaCalendarioVisitDetail;
  supervisorName?: string | null;
  fechaLabel?: string | null;
  onClose: () => void;
  onOpenImage: (url: string, title: string) => void;
}) {
  return (
    <ModalPanel
      open={true}
      onClose={onClose}
      title={`Detalle de Visita · ${visit.pdv ?? 'PDV'}`}
      subtitle={`${supervisorName ?? 'Supervisor'} · ${fechaLabel ?? ''}`}
      maxWidthClassName="max-w-4xl"
    >
      <div className="space-y-6">
        {/* Cabecera / Info General */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Punto de Venta
              </p>
              <p className="mt-0.5 text-sm font-bold text-slate-950">{visit.pdv ?? 'Sin nombre'}</p>
              <p className="text-xs text-slate-500">{visit.claveBtl ?? 'Sin clave'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Zona / Dirección
              </p>
              <p className="mt-0.5 text-sm font-medium text-slate-900">
                {visit.zona ?? 'Sin zona'}
              </p>
              <p className="line-clamp-1 text-xs text-slate-500">
                {visit.direccion ?? 'Sin dirección'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Estado de Visita
              </p>
              <div className="mt-1">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    visit.estatus === 'COMPLETADA'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {visit.estatus === 'COMPLETADA' ? 'Realizada' : 'Pendiente'}
                </span>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Avance Checklist
              </p>
              <p className="mt-0.5 text-lg font-bold text-slate-950">
                {visit.checklistCompletion}%
              </p>
            </div>
          </div>
        </div>

        {/* Alerta de Desplazamiento si aplica */}
        {visit.desplazamiento?.displaced ? (
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-xs text-violet-950">
            <p className="text-sm font-bold">🔄 Visita desplazada de la ruta programada</p>
            <p className="mt-1">
              Esta tienda fue sobrepuesta o reemplazada por el evento{' '}
              <strong>{visit.desplazamiento.eventTitulo}</strong> ({visit.desplazamiento.tipoLabel}{' '}
              · {visit.desplazamiento.modoImpactoLabel}).
            </p>
          </div>
        ) : null}

        {/* Sección de Validación de Geocerca */}
        <div>
          <h4 className="text-sm font-bold text-slate-950">
            Validación de Geocerca y Ubicación GPS
          </h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Llegada a Tienda (Check-in)
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-950">
                  {visit.checkInAt
                    ? new Date(visit.checkInAt).toLocaleTimeString('es-MX')
                    : 'Sin registro'}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    visit.checkInGpsState === 'DENTRO_GEOCERCA'
                      ? 'bg-emerald-100 text-emerald-800'
                      : visit.checkInGpsState === 'FUERA_GEOCERCA'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {visit.checkInGpsState === 'DENTRO_GEOCERCA'
                    ? 'Dentro de geocerca'
                    : visit.checkInGpsState === 'FUERA_GEOCERCA'
                      ? 'Fuera de geocerca'
                      : visit.checkInGpsState === 'SIN_GPS'
                        ? 'Sin señal GPS'
                        : 'Sin registro'}
                </span>
              </div>
              {visit.checkInDistanciaMetros !== null ? (
                <p className="mt-2 text-xs text-slate-600">
                  Distancia al PDV:{' '}
                  <strong>{formatearDistanciaMetrica(visit.checkInDistanciaMetros)}</strong>
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Salida de Tienda (Check-out)
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-950">
                  {visit.checkOutAt
                    ? new Date(visit.checkOutAt).toLocaleTimeString('es-MX')
                    : 'Sin registro'}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    visit.checkOutGpsState === 'DENTRO_GEOCERCA'
                      ? 'bg-emerald-100 text-emerald-800'
                      : visit.checkOutGpsState === 'FUERA_GEOCERCA'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {visit.checkOutGpsState === 'DENTRO_GEOCERCA'
                    ? 'Dentro de geocerca'
                    : visit.checkOutGpsState === 'FUERA_GEOCERCA'
                      ? 'Fuera de geocerca'
                      : visit.checkOutGpsState === 'SIN_GPS'
                        ? 'Sin señal GPS'
                        : 'Sin registro'}
                </span>
              </div>
              {visit.checkOutDistanciaMetros !== null ? (
                <p className="mt-2 text-xs text-slate-600">
                  Distancia al PDV:{' '}
                  <strong>{formatearDistanciaMetrica(visit.checkOutDistanciaMetros)}</strong>
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Sección de Fotografías y Evidencias */}
        <div>
          <h4 className="text-sm font-bold text-slate-950">Fotografías y Evidencias Visuales</h4>
          {visit.fotos.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
              No hay fotografías registradas para esta visita.
            </div>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {visit.fotos.map((foto, index) => (
                <div
                  key={index}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow"
                >
                  <div
                    className="group relative aspect-[4/3] w-full cursor-pointer overflow-hidden bg-slate-100"
                    onClick={() => onOpenImage(foto.url, foto.titulo)}
                  >
                    <img
                      src={foto.miniaturaUrl || foto.url}
                      alt={foto.titulo}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 opacity-0 transition group-hover:opacity-100">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-950 shadow">
                        Ampliar foto 🔍
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-bold text-slate-950">{foto.titulo}</p>
                    {foto.capturadaEn ? (
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {new Date(foto.capturadaEn).toLocaleTimeString('es-MX')}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sección de Cuestionario / Formulario del Supervisor */}
        <div>
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-950">
              Formulario y Checklist de Supervisión
            </h4>
            {visit.loveIsdinRecordsCount !== null ? (
              <span className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-bold text-pink-900">
                Registros LOVE ISDIN: {visit.loveIsdinRecordsCount}
              </span>
            ) : null}
          </div>

          {visit.comentarios ? (
            <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-sky-900">
                Comentarios finales y hallazgos
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {visit.comentarios}
              </p>
            </div>
          ) : null}

          <div className="mt-3 space-y-2.5">
            {visit.checklistItems.map((item) => (
              <div
                key={item.key}
                className={`rounded-2xl border p-3.5 transition ${
                  item.notApplicable
                    ? 'border-slate-200 bg-slate-50/60 opacity-60'
                    : item.checked
                      ? 'border-emerald-200 bg-emerald-50/30'
                      : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      item.notApplicable
                        ? 'bg-slate-200 text-slate-500'
                        : item.checked
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {item.notApplicable ? '—' : item.checked ? '✓' : '✗'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-medium ${
                        item.notApplicable
                          ? 'text-slate-400 line-through'
                          : item.checked
                            ? 'font-semibold text-slate-900'
                            : 'text-slate-600'
                      }`}
                    >
                      {item.label}
                      {item.notApplicable ? (
                        <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                          No aplica
                        </span>
                      ) : null}
                    </p>

                    {item.commentValue ? (
                      <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2.5 text-xs">
                        <p className="font-bold text-slate-700">
                          {item.commentLabel ?? 'Respuesta'}:
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap text-slate-900">
                          {item.commentValue}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalPanel>
  );
}

function EventInspectionModal({
  event,
  supervisorName,
  fechaLabel,
  onClose,
  onOpenImage,
}: {
  event: RutaCalendarioEventDetail;
  supervisorName?: string | null;
  fechaLabel?: string | null;
  onClose: () => void;
  onOpenImage: (url: string, title: string) => void;
}) {
  const formatTime = (iso: string | null) => {
    if (!iso) return 'Sin registro';
    try {
      return new Date(iso).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return iso;
    }
  };

  return (
    <ModalPanel
      open={true}
      onClose={onClose}
      title={`Detalle de Evento · ${event.titulo}`}
      subtitle={`${supervisorName ?? 'Supervisor'} · ${fechaLabel ?? ''}`}
      maxWidthClassName="max-w-3xl"
    >
      <div className="space-y-6">
        {/* Cabecera del Evento */}
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
                Tipo de Evento
              </p>
              <p className="mt-0.5 text-sm font-bold text-violet-950">{event.tipoLabel}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
                Impacto en Ruta
              </p>
              <p className="mt-0.5 text-sm font-bold text-violet-950">{event.modoImpactoLabel}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
                Punto de Venta / Sede
              </p>
              <p className="mt-0.5 text-sm font-medium text-slate-900">
                {event.pdv ?? event.sede ?? 'Sin sede'}
                {event.claveBtl ? (
                  <span className="ml-1 text-xs text-slate-500">({event.claveBtl})</span>
                ) : null}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
                Horario Planeado
              </p>
              <p className="mt-0.5 text-sm font-medium text-slate-900">
                {event.horaInicio ?? 'Sin horario fijado'}
                {event.horaFin ? ` - ${event.horaFin}` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Bloque de Horarios Registrados de Entrada y Salida */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Registro de Jornada en el Evento
          </h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                Hora de Entrada (Check-In)
              </p>
              <p className="mt-1 text-base font-extrabold text-emerald-950">
                {formatTime(event.checkInAt)}
              </p>
              {event.checkInAt ? (
                <p className="mt-0.5 text-[11px] text-emerald-700">
                  {new Date(event.checkInAt).toLocaleDateString('es-MX', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              ) : (
                <p className="mt-0.5 text-[11px] text-slate-400">Sin registro de llegada</p>
              )}
            </div>

            <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-800">
                Hora de Salida (Check-Out)
              </p>
              <p className="mt-1 text-base font-extrabold text-sky-950">
                {formatTime(event.checkOutAt)}
              </p>
              {event.checkOutAt ? (
                <p className="mt-0.5 text-[11px] text-sky-700">
                  {new Date(event.checkOutAt).toLocaleDateString('es-MX', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              ) : (
                <p className="mt-0.5 text-[11px] text-slate-400">Sin registro de salida</p>
              )}
            </div>
          </div>
        </div>

        {/* Tiendas desplazadas */}
        {event.displacedVisits.length > 0 ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <h5 className="text-xs font-bold uppercase tracking-wider text-rose-900">
              Tiendas de la ruta principal desplazadas por este evento
            </h5>
            <ul className="mt-2 space-y-1.5 text-xs text-rose-950">
              {event.displacedVisits.map((v) => (
                <li key={v.id} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  <strong>
                    #{v.orden} · {v.pdv ?? 'PDV'}
                  </strong>
                  {v.claveBtl ? <span className="text-rose-700">({v.claveBtl})</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Motivo y hallazgos */}
        {event.descripcion ? (
          <div>
            <h4 className="text-sm font-bold text-slate-950">Motivo y Hallazgos</h4>
            <p className="mt-2 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
              {event.descripcion}
            </p>
          </div>
        ) : null}

        {/* Validación de Geocerca y Coordenadas GPS */}
        <div>
          <h4 className="text-sm font-bold text-slate-950">
            Validación de Geocerca y Coordenadas GPS
          </h4>
          <div className="mt-3 space-y-3">
            {/* Check-in GPS */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">Ubicación de Llegada:</span>
                <GeocercaBadge
                  estado={
                    event.checkInGpsState === 'DENTRO_GEOCERCA'
                      ? 'DENTRO'
                      : event.checkInGpsState === 'FUERA_GEOCERCA'
                        ? 'FUERA'
                        : event.checkInLatitud !== null
                          ? 'DENTRO'
                          : 'NO_REGISTRADO'
                  }
                  resumen={event.checkInResumen ?? 'Sin registro GPS'}
                />
              </div>
              <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                {event.checkInLatitud !== null && event.checkInLongitud !== null ? (
                  <p>
                    Coordenadas:{' '}
                    <strong className="font-mono text-slate-900">
                      {event.checkInLatitud.toFixed(5)}, {event.checkInLongitud.toFixed(5)}
                    </strong>
                  </p>
                ) : (
                  <p className="text-slate-400">Coordenadas no disponibles</p>
                )}
                {event.checkInDistanciaMetros !== null ? (
                  <p>
                    Distancia al PDV:{' '}
                    <strong className="text-slate-900">
                      {formatearDistanciaMetrica(event.checkInDistanciaMetros)}
                    </strong>
                  </p>
                ) : null}
              </div>
            </div>

            {/* Check-out GPS (si existe registro) */}
            {event.checkOutAt || event.checkOutLatitud !== null ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900">Ubicación de Salida:</span>
                  <GeocercaBadge
                    estado={
                      event.checkOutGpsState === 'DENTRO_GEOCERCA'
                        ? 'DENTRO'
                        : event.checkOutGpsState === 'FUERA_GEOCERCA'
                          ? 'FUERA'
                          : event.checkOutLatitud !== null
                            ? 'DENTRO'
                            : 'NO_REGISTRADO'
                    }
                    resumen={event.checkOutResumen ?? 'Sin registro GPS'}
                  />
                </div>
                <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                  {event.checkOutLatitud !== null && event.checkOutLongitud !== null ? (
                    <p>
                      Coordenadas:{' '}
                      <strong className="font-mono text-slate-900">
                        {event.checkOutLatitud.toFixed(5)}, {event.checkOutLongitud.toFixed(5)}
                      </strong>
                    </p>
                  ) : (
                    <p className="text-slate-400">Coordenadas no disponibles</p>
                  )}
                  {event.checkOutDistanciaMetros !== null ? (
                    <p>
                      Distancia al PDV:{' '}
                      <strong className="text-slate-900">
                        {formatearDistanciaMetrica(event.checkOutDistanciaMetros)}
                      </strong>
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Fotografías del Evento */}
        <div>
          <h4 className="text-sm font-bold text-slate-950">Fotografías del Evento</h4>
          {event.fotos.length === 0 ? (
            <div className="mt-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
              No se adjuntó fotografía para este evento.
            </div>
          ) : (
            <div className="mt-2 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {event.fotos.map((foto, index) => (
                <div
                  key={index}
                  className="group relative aspect-[4/3] cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm"
                  onClick={() => onOpenImage(foto.url, foto.titulo)}
                >
                  <img
                    src={foto.url}
                    alt={foto.titulo}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 opacity-0 transition group-hover:opacity-100">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-950">
                      Ampliar foto 🔍
                    </span>
                  </div>
                  {foto.titulo ? (
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-white text-[11px] font-medium">
                      {foto.titulo}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalPanel>
  );
}

export function RutaMensualCalendar({
  supervisorOptions,
  actorPuesto,
  refreshToken = null,
  month: controlledMonth = null,
  onMonthChange,
  onExportMonth,
  isExportingMonth = false,
}: RutaMensualCalendarProps) {
  const [internalMonth, setInternalMonth] = useState(() => getIsoDateInMexicoCity().slice(0, 7));
  const [selectedSupervisorId, setSelectedSupervisorId] = useState('');
  const [data, setData] = useState<RutaCalendarioMensualData | null>(null);
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{
    row: RutaCalendarioSupervisorRow;
    cell: RutaCalendarioCell;
  } | null>(null);
  const [detail, setDetail] = useState<RutaCalendarioDiaDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [inspectedVisit, setInspectedVisit] = useState<RutaCalendarioVisitDetail | null>(null);
  const [inspectedEvent, setInspectedEvent] = useState<RutaCalendarioEventDetail | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);
  const [managementRevision, setManagementRevision] = useState(0);
  const [managementLoadingAction, setManagementLoadingAction] =
    useState<RutaMesManagementAction | null>(null);
  const [managementPreview, setManagementPreview] = useState<RutaMesManagementSummary | null>(null);
  const [managementMessage, setManagementMessage] = useState<string | null>(null);
  const [managementScope, setManagementScope] = useState<'TODOS' | 'FILTRADO' | 'SELECCIONADOS'>(
    'TODOS'
  );
  const [selectedSupervisorsForAction, setSelectedSupervisorsForAction] = useState<string[]>([]);
  const [isSupervisorSelectModalOpen, setIsSupervisorSelectModalOpen] = useState(false);
  const [activeTargetSupervisorIds, setActiveTargetSupervisorIds] = useState<string[] | null>(null);
  const masterCheckboxRef = useRef<HTMLInputElement | null>(null);

  const canManage = actorPuesto === 'ADMINISTRADOR' || actorPuesto === 'COORDINADOR';

  const month = normalizeRouteCalendarMonth(controlledMonth ?? internalMonth);
  const setMonth = (nextMonth: string) => {
    const normalized = normalizeRouteCalendarMonth(nextMonth);
    if (controlledMonth === null) {
      setInternalMonth(normalized);
    }
    onMonthChange?.(normalized);
  };
  const normalizedMonth = month;
  const requestKey = `${normalizedMonth}:${selectedSupervisorId}:${managementRevision}`;
  const isLoading = loadedRequestKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();

    const params = new URLSearchParams({ month: normalizedMonth });
    if (selectedSupervisorId) params.set('supervisorId', selectedSupervisorId);

    fetch(`/api/ruta-semanal/calendario?${params.toString()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: RutaCalendarioMensualData;
          message?: string;
        };
        if (!response.ok || !payload.data) {
          throw new Error(payload.message ?? 'No fue posible cargar el calendario mensual.');
        }
        setData(payload.data);
        setError(null);
        setLoadedRequestKey(requestKey);
      })
      .catch((nextError) => {
        if (!controller.signal.aborted) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'No fue posible cargar el calendario mensual.'
          );
          setLoadedRequestKey(requestKey);
        }
      });

    return () => controller.abort();
  }, [normalizedMonth, requestKey, refreshToken, selectedSupervisorId]);

  const rows = useMemo(
    () => (data ? mergeSupervisorRows(data, supervisorOptions, selectedSupervisorId) : []),
    [data, selectedSupervisorId, supervisorOptions]
  );

  const visibleSupervisorIds = useMemo(
    () => rows.map((r) => r.supervisorEmpleadoId),
    [rows]
  );

  const allVisibleSelected = useMemo(
    () =>
      visibleSupervisorIds.length > 0 &&
      visibleSupervisorIds.every((id) => selectedSupervisorsForAction.includes(id)),
    [visibleSupervisorIds, selectedSupervisorsForAction]
  );

  const someVisibleSelected = useMemo(
    () =>
      visibleSupervisorIds.some((id) => selectedSupervisorsForAction.includes(id)) &&
      !allVisibleSelected,
    [visibleSupervisorIds, selectedSupervisorsForAction, allVisibleSelected]
  );

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedSupervisorsForAction((prev) =>
        prev.filter((id) => !visibleSupervisorIds.includes(id))
      );
    } else {
      setSelectedSupervisorsForAction((prev) =>
        Array.from(new Set([...prev, ...visibleSupervisorIds]))
      );
      setManagementScope('SELECCIONADOS');
    }
  };

  const toggleSupervisorSelection = (supervisorEmpleadoId: string) => {
    setSelectedSupervisorsForAction((prev) => {
      const isSelected = prev.includes(supervisorEmpleadoId);
      const next = isSelected
        ? prev.filter((id) => id !== supervisorEmpleadoId)
        : [...prev, supervisorEmpleadoId];
      if (!isSelected && managementScope !== 'SELECCIONADOS') {
        setManagementScope('SELECCIONADOS');
      }
      return next;
    });
  };

  const supervisorSelectOptions = useMemo(
    () => [
      { value: '', label: 'Todos los supervisores' },
      ...supervisorOptions.map((item) => ({
        value: item.supervisorEmpleadoId,
        label: `${item.supervisor}${item.zona ? ` · ${item.zona}` : ''}`,
      })),
    ],
    [supervisorOptions]
  );

  const openCell = (
    row: RutaCalendarioSupervisorRow,
    cell: RutaCalendarioCell,
    button: HTMLButtonElement
  ) => {
    triggerRef.current = button;
    setSelectedCell({ row, cell });
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);

    const params = new URLSearchParams({
      fecha: cell.fecha,
      supervisorId: row.supervisorEmpleadoId,
    });
    fetch(`/api/ruta-semanal/calendario/dia?${params.toString()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          detail?: RutaCalendarioDiaDetail;
          message?: string;
        };
        if (!response.ok || !payload.detail) {
          throw new Error(payload.message ?? 'No fue posible cargar el detalle del día.');
        }
        setDetail(payload.detail);
      })
      .catch((nextError) => {
        setDetailError(
          nextError instanceof Error
            ? nextError.message
            : 'No fue posible cargar el detalle del día.'
        );
      })
      .finally(() => setDetailLoading(false));
  };

  const closeDetail = () => {
    setSelectedCell(null);
    setDetail(null);
    setDetailError(null);
    setInspectedVisit(null);
    setInspectedEvent(null);
    setLightboxImage(null);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const resolveTargetSupervisorIds = (): string[] | null => {
    if (managementScope === 'FILTRADO' && selectedSupervisorId) {
      return [selectedSupervisorId];
    }
    if (managementScope === 'SELECCIONADOS' && selectedSupervisorsForAction.length > 0) {
      return selectedSupervisorsForAction;
    }
    return null;
  };

  const previewMonthManagement = async (action: RutaMesManagementAction) => {
    setManagementLoadingAction(action);
    setManagementMessage(null);

    const targetIds = resolveTargetSupervisorIds();
    setActiveTargetSupervisorIds(targetIds);

    try {
      const preview = await previsualizarGestionRutasMes(action, normalizedMonth, targetIds);
      if (!preview.ok || preview.eligibleCount === 0) {
        setManagementMessage(preview.message);
        return;
      }

      setManagementPreview(preview);
    } catch (nextError) {
      setManagementMessage(
        nextError instanceof Error ? nextError.message : 'No fue posible revisar las rutas del mes.'
      );
    } finally {
      setManagementLoadingAction(null);
    }
  };

  const executeMonthManagement = async () => {
    if (!managementPreview) return;

    setManagementLoadingAction(managementPreview.action);
    setManagementMessage(null);

    try {
      const result = await ejecutarGestionRutasMes(
        managementPreview.action,
        normalizedMonth,
        managementPreview.eligibleCount,
        activeTargetSupervisorIds
      );
      setManagementMessage(result.message);

      if (result.ok && result.executed) {
        setManagementPreview(null);
        setLoadedRequestKey(null);
        setManagementRevision((current) => current + 1);
      }
    } catch (nextError) {
      setManagementMessage(
        nextError instanceof Error
          ? nextError.message
          : 'No fue posible gestionar las rutas del mes.'
      );
    } finally {
      setManagementLoadingAction(null);
    }
  };

  const detailTitle = selectedCell
    ? `${selectedCell.row.supervisor} · ${formatRouteCalendarDate(selectedCell.cell.fecha)}`
    : 'Detalle del día';

  return (
    <section className="space-y-5">
      <Card className="border-slate-200 bg-white">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
              Planeación mensual
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">
              Actividad diaria por supervisor
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Revisa las rutas semanales cargadas, su aprobación y el cumplimiento de cada visita
              sin salir del mes.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setMonth(shiftRouteCalendarMonth(month, -1))}
            >
              Mes anterior
            </Button>
            <label className="block min-w-[170px] text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Mes
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(normalizeRouteCalendarMonth(event.target.value))}
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-4 focus:ring-sky-100"
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setMonth(shiftRouteCalendarMonth(month, 1))}
            >
              Mes siguiente
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,260px)_1fr] md:items-end">
          <Select
            label="Supervisor"
            value={selectedSupervisorId}
            onChange={(event) => setSelectedSupervisorId(event.target.value)}
            options={supervisorSelectOptions}
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
              {formatRouteCalendarMonth(month)}
            </span>
            {data ? (
              <>
                <span>{data.totals.planned} planeadas</span>
                <span>·</span>
                <span>{data.totals.completed} realizadas</span>
                <span>·</span>
                <span>{data.totals.pending} pendientes</span>
              </>
            ) : null}
            <span className="ml-auto text-[11px] text-slate-400">{actorPuesto.toLowerCase()}</span>
          </div>
        </div>
        {(actorPuesto === 'ADMINISTRADOR' || actorPuesto === 'COORDINADOR' || onExportMonth) && (
          <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-bold text-slate-950">Gestión mensual de rutas</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Aplica aprobación o liberación de rutas para todo el mes o supervisores específicos.
                </p>
              </div>

              {(actorPuesto === 'ADMINISTRADOR' || actorPuesto === 'COORDINADOR') && (
                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setManagementScope('TODOS')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      managementScope === 'TODOS'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🌐 Todos ({supervisorOptions.length})
                  </button>
                  <button
                    type="button"
                    disabled={!selectedSupervisorId}
                    onClick={() => setManagementScope('FILTRADO')}
                    title={
                      !selectedSupervisorId
                        ? 'Selecciona un supervisor en el filtro superior'
                        : undefined
                    }
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      managementScope === 'FILTRADO'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    👤 Supervisor activo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManagementScope('SELECCIONADOS');
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      managementScope === 'SELECCIONADOS'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ☑️ Seleccionados ({selectedSupervisorsForAction.length})
                  </button>
                  {selectedSupervisorsForAction.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSupervisorsForAction([]);
                        setManagementScope('TODOS');
                      }}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
                      title="Desmarcar todos los supervisores"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/60 pt-3">
              <div className="text-xs text-slate-600">
                <span className="font-semibold text-slate-700">Objetivo: </span>
                {managementScope === 'TODOS' && 'Todos los supervisores con rutas enviadas del mes.'}
                {managementScope === 'FILTRADO' &&
                  (selectedSupervisorId
                    ? `Solo ${supervisorOptions.find((s) => s.supervisorEmpleadoId === selectedSupervisorId)?.supervisor ?? 'supervisor actual'}.`
                    : 'Ningún supervisor seleccionado en el filtro superior.')}
                {managementScope === 'SELECCIONADOS' &&
                  (selectedSupervisorsForAction.length > 0
                    ? `${selectedSupervisorsForAction.length} supervisor(es) seleccionado(s) con las casillas de la tabla.`
                    : 'Marca las casillas en la columna izquierda de la tabla para seleccionar.')}
              </div>

              <div
                className="flex flex-wrap items-center gap-2"
                role="group"
                aria-label={`Acciones para las rutas de ${formatRouteCalendarMonth(month)}`}
              >
                {(actorPuesto === 'ADMINISTRADOR' || actorPuesto === 'COORDINADOR') && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-9 border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 hover:bg-rose-50"
                      onClick={() => previewMonthManagement('LIBERAR')}
                      disabled={
                        managementLoadingAction !== null ||
                        (managementScope === 'FILTRADO' && !selectedSupervisorId) ||
                        (managementScope === 'SELECCIONADOS' &&
                          selectedSupervisorsForAction.length === 0)
                      }
                    >
                      {managementLoadingAction === 'LIBERAR'
                        ? 'Revisando...'
                        : 'Liberar rutas'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-9 bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700"
                      onClick={() => previewMonthManagement('APROBAR')}
                      disabled={
                        managementLoadingAction !== null ||
                        (managementScope === 'FILTRADO' && !selectedSupervisorId) ||
                        (managementScope === 'SELECCIONADOS' &&
                          selectedSupervisorsForAction.length === 0)
                      }
                    >
                      {managementLoadingAction === 'APROBAR'
                        ? 'Revisando...'
                        : 'Aprobar rutas'}
                    </Button>
                  </>
                )}
                {onExportMonth && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-h-9 px-3 text-xs font-bold"
                    onClick={onExportMonth}
                    disabled={isExportingMonth}
                  >
                    {isExportingMonth ? 'Exportando...' : 'Exportar Excel'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
        {managementMessage ? (
          <p
            className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            role="status"
          >
            {managementMessage}
          </p>
        ) : null}
      </Card>

      {isLoading ? (
        <Card>
          <p className="text-sm text-slate-500">Cargando calendario mensual...</p>
        </Card>
      ) : null}
      {error && !isLoading ? (
        <Card className="border-rose-200 bg-rose-50">
          <p className="text-sm text-rose-800">{error}</p>
        </Card>
      ) : null}

      {data && !isLoading && !error ? (
        <Card className="overflow-hidden border-slate-200 bg-white p-0">
          <div className="border-b border-slate-200 px-5 py-4">
            <p className="text-sm font-semibold text-slate-950">{data.monthLabel}</p>
            <p className="mt-1 text-xs text-slate-500">
              Selecciona cualquier día para abrir las tiendas programadas y el resultado operativo.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              El mes completo se ajusta al ancho en escritorio; en móvil puedes deslizar para
              conservar objetivos táctiles legibles.
            </p>
          </div>
          <div
            data-testid="monthly-calendar-scroll-container"
            className="overflow-x-auto lg:overflow-x-hidden"
          >
            <table
              data-testid="monthly-calendar-table"
              aria-label={`Actividad diaria por supervisor de ${data.monthLabel}`}
              className="min-w-[1560px] table-fixed border-separate border-spacing-0 text-xs lg:w-full lg:min-w-0"
            >
              <colgroup>
                {canManage && <col className="w-11" />}
                <col className="w-[190px] lg:w-[160px] xl:w-[190px]" />
                {data.days.map((day) => (
                  <col key={day.fecha} className="w-11 lg:w-auto" />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-20 bg-white">
                <tr>
                  {canManage && (
                    <th
                      scope="col"
                      className="sticky left-0 z-30 w-11 min-w-11 max-w-11 border-b border-r border-slate-200 bg-white p-0 text-center"
                      aria-label="Seleccionar supervisores"
                    >
                      <label
                        className="flex h-full min-h-11 w-11 cursor-pointer items-center justify-center"
                        title={
                          allVisibleSelected
                            ? 'Desmarcar todos los supervisores'
                            : 'Marcar todos los supervisores visibles'
                        }
                      >
                        <input
                          ref={masterCheckboxRef}
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAllVisible}
                          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-2 focus:ring-sky-500 cursor-pointer"
                          aria-label={
                            allVisibleSelected
                              ? 'Desmarcar todos los supervisores'
                              : 'Marcar todos los supervisores visibles'
                          }
                        />
                      </label>
                    </th>
                  )}
                  <th
                    scope="col"
                    className={`sticky ${canManage ? 'left-11' : 'left-0'} z-30 border-b border-r border-slate-200 bg-white px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500`}
                  >
                    Supervisor
                  </th>
                  {data.days.map((day) => (
                    <th
                      key={day.fecha}
                      className={`border-b border-r border-slate-200 px-px py-1.5 text-center ${day.esHoy ? 'bg-sky-50' : 'bg-slate-50'}`}
                    >
                      <div className="text-[8px] font-bold text-slate-500 xl:text-[9px]">
                        {day.letra}
                      </div>
                      <div className="mt-0.5 text-[10px] font-semibold text-slate-950 xl:text-[11px]">
                        {day.numero}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={data.days.length + (canManage ? 2 : 1)}
                      className="px-5 py-10 text-center text-sm text-slate-500"
                    >
                      No hay supervisores visibles.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const isRowSelected = selectedSupervisorsForAction.includes(
                      row.supervisorEmpleadoId
                    );
                    return (
                      <tr
                        key={row.supervisorEmpleadoId}
                        className={isRowSelected ? 'bg-sky-50/40' : 'odd:bg-slate-50/35'}
                      >
                        {canManage && (
                          <td
                            className={`sticky left-0 z-10 w-11 min-w-11 max-w-11 border-b border-r border-slate-200 p-0 text-center transition ${
                              isRowSelected ? 'bg-sky-100/90' : 'bg-white'
                            }`}
                          >
                            <label
                              className="flex h-full min-h-11 w-11 cursor-pointer items-center justify-center"
                              title={`Seleccionar ${row.supervisor}`}
                            >
                              <input
                                type="checkbox"
                                checked={isRowSelected}
                                onChange={() =>
                                  toggleSupervisorSelection(row.supervisorEmpleadoId)
                                }
                                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-2 focus:ring-sky-500 cursor-pointer"
                                aria-label={`Seleccionar a ${row.supervisor}`}
                              />
                            </label>
                          </td>
                        )}
                        <th
                          scope="row"
                          className={`sticky ${canManage ? 'left-11' : 'left-0'} z-10 border-b border-r border-slate-200 px-3 py-2 text-left transition ${
                            isRowSelected ? 'bg-sky-100/90' : 'bg-white'
                          }`}
                        >
                          <div
                            className="truncate text-[10px] font-semibold text-slate-950 xl:text-[11px]"
                            title={row.supervisor}
                          >
                            {row.supervisor}
                          </div>
                          <div className="mt-0.5 truncate text-[9px] font-normal text-slate-500">
                            {row.zona ?? 'Sin zona'}
                          </div>
                        </th>
                      {row.cells.map((cell) => (
                        <td
                          key={cell.fecha}
                          className="border-b border-r border-slate-200 px-0.5 py-1 text-center lg:px-px"
                        >
                          <button
                            ref={(button) => {
                              if (
                                selectedCell?.cell.fecha === cell.fecha &&
                                selectedCell.row.supervisorEmpleadoId === row.supervisorEmpleadoId
                              ) {
                                triggerRef.current = button;
                              }
                            }}
                            type="button"
                            className={cellToneClass(cell)}
                            aria-label={getCellAriaLabel(row, cell)}
                            title={getCellAriaLabel(row, cell)}
                            onClick={(event) => openCell(row, cell, event.currentTarget)}
                          >
                            <span className="block max-w-full truncate">
                              {getCompactCellLabel(cell)}
                            </span>
                            {cell.eventCount > 0 || cell.replacementPendingCount > 0 ? (
                              <span className="mt-0.5 block max-w-full truncate text-[7px] font-semibold text-slate-500 xl:text-[8px]">
                                {cell.eventCount > 0 ? `E${cell.eventCount}` : ''}
                                {cell.replacementPendingCount > 0
                                  ? `${cell.eventCount > 0 ? '·' : ''}R${cell.replacementPendingCount}`
                                  : ''}
                              </span>
                            ) : null}
                          </button>
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-200 px-5 py-4 text-[11px] text-slate-600">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
              — · Sin ruta
            </span>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 font-semibold text-violet-800">
              P · En revisión (1ª vez)
            </span>
            <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 font-semibold text-amber-900">
              ! · Cambios solicitados (Regresada)
            </span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-semibold text-sky-800">
              Número · Por realizar
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">
              x/y · Parcial
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-800">
              ✓ · Completa
            </span>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 font-semibold text-rose-800">
              ! · No realizada / Vencida
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              E · Evento · R · Reposición
            </span>
          </div>
        </Card>
      ) : null}

      <ModalPanel
        open={Boolean(managementPreview)}
        onClose={() => {
          if (!managementLoadingAction) setManagementPreview(null);
        }}
        title={
          managementPreview ? getRutaMesActionLabel(managementPreview.action) : 'Gestionar mes'
        }
        subtitle={`${formatRouteCalendarMonth(month)} · ${
          activeTargetSupervisorIds && activeTargetSupervisorIds.length > 0
            ? `${activeTargetSupervisorIds.length} supervisor(es) seleccionado(s)`
            : 'todos los supervisores'
        }`}
        maxWidthClassName="max-w-2xl"
      >
        {managementPreview ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <DetailMetric label="Rutas incluidas" value={managementPreview.eligibleCount} />
              <DetailMetric label="Supervisores" value={managementPreview.supervisorCount} />
              <DetailMetric
                label="Rutas protegidas"
                value={
                  managementPreview.protectedByExecutionCount +
                  managementPreview.protectedByDateCount
                }
              />
            </div>

            {activeTargetSupervisorIds && activeTargetSupervisorIds.length > 0 ? (
              <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-3.5 text-xs text-sky-950">
                <p className="font-bold">Supervisores a procesar:</p>
                <p className="mt-1 leading-5 text-sky-900">
                  {supervisorOptions
                    .filter((s) => activeTargetSupervisorIds.includes(s.supervisorEmpleadoId))
                    .map((s) => s.supervisor)
                    .join(', ') || 'Ninguno'}
                </p>
              </div>
            ) : null}

            <div
              className={`rounded-2xl border p-4 text-sm leading-6 ${
                managementPreview.action === 'LIBERAR'
                  ? 'border-rose-200 bg-rose-50 text-rose-950'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-950'
              }`}
            >
              {managementPreview.action === 'LIBERAR' ? (
                <>
                  <p className="font-semibold">
                    Las rutas dejarán de estar disponibles para ejecución.
                  </p>
                  <p className="mt-1">
                    No se borrarán sus tiendas: pasarán a borrador para que cada supervisor las
                    ajuste y vuelva a enviarlas a revisión.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold">Solo se aprobarán rutas reenviadas y pendientes.</p>
                  <p className="mt-1">
                    Las rutas todavía no enviadas, con cambios pendientes o sin tiendas quedarán
                    intactas.
                  </p>
                </>
              )}
            </div>
            <ul className="space-y-1 text-xs leading-5 text-slate-600">
              <li>
                {managementPreview.notReadyCount} rutas no están en el estado requerido y se
                omitirán.
              </li>
              <li>
                {managementPreview.protectedByExecutionCount} rutas iniciadas, cerradas o con
                visitas realizadas están protegidas.
              </li>
              <li>
                {managementPreview.protectedByDateCount} rutas completamente pasadas están
                protegidas.
              </li>
              {managementPreview.boundaryWeekCount > 0 ? (
                <li className="font-semibold text-amber-800">
                  {managementPreview.boundaryWeekCount} rutas pertenecen a semanas que cruzan el
                  límite del mes; la semana completa cambiará de estado.
                </li>
              ) : null}
            </ul>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => setManagementPreview(null)}
                disabled={managementLoadingAction !== null}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className={`min-h-11 font-semibold text-white ${
                  managementPreview.action === 'LIBERAR'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
                onClick={executeMonthManagement}
                disabled={managementLoadingAction !== null}
              >
                {managementLoadingAction
                  ? 'Aplicando cambios...'
                  : `Confirmar ${managementPreview.action === 'LIBERAR' ? 'liberación' : 'aprobación'}`}
              </Button>
            </div>
          </div>
        ) : null}
      </ModalPanel>

      <ModalPanel
        open={isSupervisorSelectModalOpen}
        onClose={() => setIsSupervisorSelectModalOpen(false)}
        title="Seleccionar supervisores para el mes"
        subtitle={`${formatRouteCalendarMonth(month)} · Elige a quiénes aplicar la acción`}
        maxWidthClassName="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs">
            <span className="font-semibold text-slate-700">
              {selectedSupervisorsForAction.length} de {supervisorOptions.length} seleccionados
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setSelectedSupervisorsForAction(
                    supervisorOptions.map((s) => s.supervisorEmpleadoId)
                  )
                }
                className="font-bold text-sky-600 hover:text-sky-800"
              >
                Marcar todos
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => setSelectedSupervisorsForAction([])}
                className="font-bold text-slate-500 hover:text-slate-700"
              >
                Desmarcar todos
              </button>
            </div>
          </div>

          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {supervisorOptions.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                No hay supervisores disponibles en este periodo.
              </p>
            ) : (
              supervisorOptions.map((option) => {
                const isChecked = selectedSupervisorsForAction.includes(
                  option.supervisorEmpleadoId
                );
                return (
                  <label
                    key={option.supervisorEmpleadoId}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition ${
                      isChecked
                        ? 'border-sky-300 bg-sky-50/50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSupervisorsForAction((prev) => [
                              ...prev,
                              option.supervisorEmpleadoId,
                            ]);
                          } else {
                            setSelectedSupervisorsForAction((prev) =>
                              prev.filter((id) => id !== option.supervisorEmpleadoId)
                            );
                          }
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{option.supervisor}</p>
                        {option.zona ? (
                          <p className="text-xs text-slate-500">{option.zona}</p>
                        ) : null}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={() => setIsSupervisorSelectModalOpen(false)}
              className="bg-slate-900 text-xs font-bold text-white hover:bg-slate-800"
            >
              Listo ({selectedSupervisorsForAction.length})
            </Button>
          </div>
        </div>
      </ModalPanel>

      <ModalPanel
        open={Boolean(selectedCell)}
        onClose={closeDetail}
        title={detailTitle}
        subtitle="Detalle consultivo de la jornada y sus visitas."
        maxWidthClassName="max-w-5xl"
      >
        {detailLoading ? <p className="text-sm text-slate-500">Cargando detalle...</p> : null}
        {!detailLoading && detailError ? (
          <p className="text-sm text-rose-700">{detailError}</p>
        ) : null}
        {!detailLoading && !detailError && detail ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {detail.approvalState}
              </span>
              {detail.routeStatus ? (
                <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                  {detail.routeStatus}
                </span>
              ) : null}
              {detail.routeNotes ? (
                <span className="text-xs text-slate-500">{detail.routeNotes}</span>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <DetailMetric label="Planeadas" value={detail.plannedVisits.length} />
              <DetailMetric label="Realizadas" value={detail.completedVisits.length} />
              <DetailMetric label="Pendientes" value={detail.pendingVisits.length} />
              <DetailMetric label="Reposición" value={detail.pendingRepositions.length} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-950">Visitas del supervisor</h4>
              <div className="mt-3 space-y-2">
                {detail.plannedVisits.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                    No hay tiendas programadas para este día.
                  </p>
                ) : null}
                {detail.plannedVisits.map((visit, index) => (
                  <VisitDetailCard
                    key={visit.id}
                    visit={visit}
                    index={index}
                    title={visit.estatus === 'COMPLETADA' ? 'Realizada' : 'Pendiente'}
                    onInspect={setInspectedVisit}
                  />
                ))}
              </div>
            </div>
            {detail.events.length > 0 ? (
              <div>
                <h4 className="text-sm font-semibold text-slate-950">
                  Visitas adicionales y eventos extraordinarios
                </h4>
                <div className="mt-3 space-y-2">
                  {detail.events.map((event) => (
                    <EventDetailCard key={event.id} event={event} onInspect={setInspectedEvent} />
                  ))}
                </div>
              </div>
            ) : null}
            {detail.pendingRepositions.length > 0 ? (
              <div>
                <h4 className="text-sm font-semibold text-slate-950">Pendientes de reposición</h4>
                <div className="mt-3 space-y-2">
                  {detail.pendingRepositions.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm"
                    >
                      <p className="font-semibold text-rose-950">
                        {item.pdv ?? 'PDV sin nombre'} · {item.clasificacion}
                      </p>
                      <p className="mt-1 text-xs text-rose-900">
                        {item.motivo} · {item.estado}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </ModalPanel>

      {inspectedVisit ? (
        <VisitInspectionModal
          visit={inspectedVisit}
          supervisorName={selectedCell?.row.supervisor}
          fechaLabel={selectedCell ? formatRouteCalendarDate(selectedCell.cell.fecha) : ''}
          onClose={() => setInspectedVisit(null)}
          onOpenImage={(url, title) => setLightboxImage({ url, title })}
        />
      ) : null}

      {inspectedEvent ? (
        <EventInspectionModal
          event={inspectedEvent}
          supervisorName={selectedCell?.row.supervisor}
          fechaLabel={selectedCell ? formatRouteCalendarDate(selectedCell.cell.fecha) : ''}
          onClose={() => setInspectedEvent(null)}
          onOpenImage={(url, title) => setLightboxImage({ url, title })}
        />
      ) : null}

      {lightboxImage ? (
        <ImageLightboxModal
          url={lightboxImage.url}
          title={lightboxImage.title}
          onClose={() => setLightboxImage(null)}
        />
      ) : null}
    </section>
  );
}
