'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { getIsoDateInMexicoCity } from '@/lib/geo/mexicoStateTimezone';
import { guardarPlaneacionRutaMensualCanvas } from '../actions';
import {
  formatPlanningMonthLabel,
  getPlanningMonthDays,
  getPlanningMonthIso,
  getPlanningMonthOptions,
} from '../lib/monthPlanning';
import { getWeekDateIso } from '../lib/weeklyRoute';
import type {
  RutaMensualPlannerSnapshot,
  RutaMensualPlannerVisit,
} from '../services/rutaSemanalCatalogoService';
import type {
  RutaSemanalItem,
  RutaSemanalPdvOption,
  RutaSemanalVisitItem,
} from '../services/rutaSemanalService';
import { ESTADO_RUTA_INICIAL } from '../state';

interface MonthlyDraftVisit {
  clientId: string;
  visitId: string | null;
  fecha: string;
  pdvId: string;
  label: string;
  subtitle: string;
  notes: string;
  status: RutaSemanalVisitItem['estatus'];
  locked: boolean;
}

function normalizeFilterText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatDayLabel(fecha: string) {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${fecha}T12:00:00.000Z`));
}

function buildInitialDrafts(routes: RutaSemanalItem[], month: string, todayIso: string) {
  return routes
    .flatMap((route) =>
      route.visitas.map((visit) => {
        const fecha = getWeekDateIso(route.semanaInicio, visit.diaSemana);
        return {
          clientId: visit.id,
          visitId: visit.id,
          fecha,
          pdvId: visit.pdvId,
          label: visit.pdv ?? 'PDV sin nombre',
          subtitle: visit.zona ?? visit.pdvClaveBtl ?? 'Sin zona',
          notes: visit.comentarios ?? '',
          status: visit.estatus,
          locked:
            fecha < todayIso || route.estatus !== 'BORRADOR' || visit.estatus !== 'PLANIFICADA',
        } satisfies MonthlyDraftVisit;
      })
    )
    .filter((visit) => visit.fecha.slice(0, 7) === month)
    .sort((left, right) => left.fecha.localeCompare(right.fecha));
}

function buildSnapshotDrafts(
  visits: RutaMensualPlannerVisit[],
  snapshot: RutaMensualPlannerSnapshot,
  todayIso: string
) {
  const monthProtected = ['APROBADA', 'EN_PROGRESO', 'CERRADA'].includes(snapshot.estado);
  return visits.map(
    (visit) =>
      ({
        clientId: visit.id,
        visitId: visit.id,
        fecha: visit.fecha,
        pdvId: visit.pdvId,
        label: visit.pdv,
        subtitle: visit.zona ?? visit.claveBtl,
        notes: visit.comentarios ?? '',
        status: visit.estatus,
        locked: visit.fecha < todayIso || monthProtected || visit.estatus === 'COMPLETADA',
      }) satisfies MonthlyDraftVisit
  );
}

const EMPTY_MONTHLY_SNAPSHOT: RutaMensualPlannerSnapshot = {
  envioId: null,
  estado: 'BORRADOR',
  revision: null,
  totalVisitas: 0,
  totalDiasPlaneados: 0,
  enviadoEn: null,
  revisadoEn: null,
  visitas: [],
};

function MonthlySubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      className="w-full sm:w-auto rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold shadow-xs"
    >
      {pending ? 'Enviando mes…' : 'Enviar ruta mensual'}
    </Button>
  );
}

export function RutaMensualPlanner({
  routes,
  initialPdvs,
}: {
  routes: RutaSemanalItem[];
  initialPdvs: RutaSemanalPdvOption[];
}) {
  const todayIso = getIsoDateInMexicoCity();
  const currentMonth = getPlanningMonthIso(todayIso);
  const [month, setMonth] = useState(currentMonth);
  const [state, formAction] = useActionState(
    guardarPlaneacionRutaMensualCanvas,
    ESTADO_RUTA_INICIAL
  );
  const monthOptions = useMemo(
    () => getPlanningMonthOptions(todayIso).filter((option) => option.value >= currentMonth),
    [currentMonth, todayIso]
  );
  const days = useMemo(() => getPlanningMonthDays(month), [month]);
  const initialDrafts = useMemo(
    () => buildInitialDrafts(routes, month, todayIso),
    [month, routes, todayIso]
  );
  const [drafts, setDrafts] = useState<MonthlyDraftVisit[]>(initialDrafts);
  const [snapshot, setSnapshot] = useState<RutaMensualPlannerSnapshot>(EMPTY_MONTHLY_SNAPSHOT);
  const [pdvs, setPdvs] = useState<RutaSemanalPdvOption[]>(initialPdvs);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDrafts, setDayDrafts] = useState<MonthlyDraftVisit[]>([]);
  const [storeSearch, setStoreSearch] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/ruta-semanal/pdvs-disponibles?mes=${encodeURIComponent(month)}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          pdvs?: RutaSemanalPdvOption[];
          planeacion?: RutaMensualPlannerSnapshot;
          message?: string;
        };
        if (!response.ok || !payload.pdvs || !payload.planeacion) {
          throw new Error(payload.message ?? 'No fue posible cargar la cartera mensual.');
        }
        setPdvs(payload.pdvs);
        setSnapshot(payload.planeacion);
        setDrafts(buildSnapshotDrafts(payload.planeacion.visitas, payload.planeacion, todayIso));
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== 'AbortError') {
          setCatalogError(error.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false);
      });

    return () => controller.abort();
  }, [initialDrafts, month, todayIso]);

  const monthProtected = ['APROBADA', 'EN_PROGRESO', 'CERRADA'].includes(snapshot.estado);

  const changeMonth = (nextMonth: string) => {
    setMonth(nextMonth);
    setCatalogLoading(true);
    setCatalogError('');
    setPdvs([]);
    setSnapshot(EMPTY_MONTHLY_SNAPSHOT);
    setDrafts(buildInitialDrafts(routes, nextMonth, todayIso));
  };

  const openDay = (fecha: string) => {
    const day = days.find((item) => item.fecha === fecha);
    if (!day || fecha < todayIso || monthProtected) return;
    setSelectedDate(fecha);
    setStoreSearch('');
    setDayDrafts(drafts.filter((visit) => visit.fecha === fecha));
  };

  const saveDay = () => {
    if (!selectedDate) return;
    setDrafts((current) => [
      ...current.filter((visit) => visit.fecha !== selectedDate),
      ...dayDrafts.map((visit) => ({ ...visit, fecha: selectedDate })),
    ]);
    setSelectedDate(null);
  };

  const availablePdvs = useMemo(() => {
    if (!selectedDate) return [];
    const selectedIds = new Set(dayDrafts.map((visit) => visit.pdvId));
    const search = normalizeFilterText(storeSearch);
    return pdvs.filter(
      (pdv) =>
        !selectedIds.has(pdv.id) &&
        (!pdv.diasDisponibles || pdv.diasDisponibles.includes(selectedDate)) &&
        normalizeFilterText(`${pdv.nombre} ${pdv.claveBtl} ${pdv.zona ?? ''}`).includes(search)
    );
  }, [dayDrafts, pdvs, selectedDate, storeSearch]);

  const serializedPlan = JSON.stringify(
    drafts
      .filter((visit) => !visit.locked)
      .sort((left, right) => left.fecha.localeCompare(right.fecha))
      .map((visit, _index, all) => ({
        fecha: visit.fecha,
        pdvId: visit.pdvId,
        orden: all.filter((candidate) => candidate.fecha === visit.fecha).indexOf(visit) + 1,
        notas: visit.notes || null,
      }))
  );
  const editableVisits = drafts.filter((visit) => !visit.locked);
  const plannedDays = new Set(editableVisits.map((visit) => visit.fecha)).size;
  const leadingBlankDays = Math.max(0, (days[0]?.weekdayNumber ?? 1) - 1);
  const monthStatus =
    snapshot.estado === 'CAMBIOS_SOLICITADOS'
      ? 'Cambios solicitados'
      : snapshot.estado === 'PENDIENTE_COORDINACION'
        ? 'En revisión'
        : monthProtected
          ? 'Aprobada / protegida'
          : 'Borrador mensual';

  return (
    <form action={formAction} className="space-y-3 sm:space-y-4" data-testid="monthly-route-planner">
      <input type="hidden" name="planning_month" value={month} />
      <input type="hidden" name="month_plan_json" value={serializedPlan} />
      <input type="hidden" name="expected_revision" value={snapshot.revision ?? ''} />

      {/* Cabecera minimalista: Selector de mes, estado y métricas compactas */}
      <div className="flex flex-col gap-2 rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50/80 to-slate-50/80 p-2.5 sm:p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <div className="w-48 sm:w-56">
            <Select
              aria-label="Mes de la ruta"
              value={month}
              onChange={(event) => changeMonth(event.target.value)}
              options={monthOptions.map((option) => ({ value: option.value, label: option.label }))}
              className="!py-2 text-xs sm:text-sm font-semibold !rounded-xl"
            />
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
              monthProtected
                ? 'border-emerald-200 bg-emerald-100/80 text-emerald-800'
                : snapshot.estado === 'CAMBIOS_SOLICITADOS'
                  ? 'border-rose-200 bg-rose-100 text-rose-800'
                  : snapshot.estado === 'PENDIENTE_COORDINACION'
                    ? 'border-amber-200 bg-amber-100 text-amber-800'
                    : 'border-sky-200 bg-white text-sky-800 shadow-2xs'
            }`}
          >
            {monthProtected ? '🔒 Protegida' : monthStatus}
          </span>
        </div>

        {/* Métricas en mini-pastillas horizontales */}
        <div className="grid grid-cols-3 gap-1.5 sm:flex sm:items-center sm:gap-2">
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200/90 bg-white px-2 py-1 text-center shadow-2xs min-w-[70px]">
            <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-slate-400">Visitas</span>
            <span className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">{editableVisits.length}</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200/90 bg-white px-2 py-1 text-center shadow-2xs min-w-[70px]">
            <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-slate-400">Días</span>
            <span className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">{plannedDays}</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200/90 bg-white px-2 py-1 text-center shadow-2xs min-w-[70px]">
            <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tiendas</span>
            <span className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
              {catalogLoading ? '…' : pdvs.length}
            </span>
          </div>
        </div>
      </div>

      {catalogError ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {catalogError}
        </p>
      ) : null}
      {state.message ? (
        <p
          role="status"
          className={`rounded-2xl border px-4 py-3 text-sm ${
            state.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <div className="rounded-[24px] border border-slate-200 bg-white p-2.5 sm:p-4 shadow-xs">
        <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-xs font-semibold text-slate-500">
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((letter) => (
            <div
              key={letter}
              className="py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 sm:text-xs"
              aria-hidden="true"
            >
              {letter}
            </div>
          ))}
          {Array.from({ length: leadingBlankDays }, (_, index) => (
            <span key={`blank-${index}`} className="h-14 sm:h-20" aria-hidden="true" />
          ))}
          {days.map((day) => {
            const dayVisits = drafts.filter((visit) => visit.fecha === day.fecha);
            const isPast = day.fecha < todayIso;
            const isToday = day.fecha === todayIso;
            const isProtected = monthProtected;
            const isEditable = !isPast && !isProtected;
            const hasVisits = dayVisits.length > 0;

            return (
              <button
                key={day.fecha}
                type="button"
                onClick={() => openDay(day.fecha)}
                disabled={!isEditable}
                aria-label={`${formatDayLabel(day.fecha)}: ${hasVisits ? `${dayVisits.length} visita(s)` : 'sin visitas'}${isProtected ? ', protegido' : ''}${isPast ? ', fecha pasada' : ''}`}
                className={`group relative flex h-14 sm:h-20 flex-col items-center justify-between rounded-xl sm:rounded-2xl border p-1 sm:p-2 transition overflow-hidden ${
                  hasVisits
                    ? 'border-emerald-300 bg-emerald-50/90 text-emerald-950'
                    : 'border-slate-200 bg-slate-50/70 text-slate-700'
                } ${
                  isToday
                    ? 'ring-2 ring-sky-500 ring-offset-1 z-10'
                    : ''
                } ${
                  isEditable
                    ? 'hover:border-sky-300 hover:bg-sky-50/70 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500'
                    : 'cursor-not-allowed opacity-45 bg-slate-100/60 border-slate-100'
                }`}
              >
                {/* Header del día: número e indicador */}
                <div className="flex w-full items-center justify-between px-0.5">
                  <span
                    className={`inline-flex items-center justify-center text-xs sm:text-sm font-bold leading-none ${
                      isToday
                        ? 'h-4.5 w-4.5 sm:h-5 sm:w-5 rounded-full bg-sky-600 text-white shadow-xs'
                        : hasVisits
                          ? 'text-emerald-900'
                          : 'text-slate-800'
                    }`}
                  >
                    {day.numero}
                  </span>
                  {isProtected ? (
                    <span className="text-[10px] text-slate-400" title="Día protegido">
                      🔒
                    </span>
                  ) : (
                    <span className="hidden sm:inline text-[10px] font-semibold text-slate-400 uppercase">
                      {day.letra}
                    </span>
                  )}
                </div>

                {/* Badge minimalista de visitas */}
                <div className="w-full flex items-center justify-center mt-auto pb-0.5">
                  {hasVisits ? (
                    <span className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] sm:text-xs font-bold text-white shadow-xs leading-none">
                      {dayVisits.length}
                      <span className="hidden sm:inline sm:ml-1">
                        visita{dayVisits.length > 1 ? 's' : ''}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[10px] sm:text-xs font-medium text-slate-300 sm:text-slate-400 leading-none">
                      —
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Leyenda minimalista */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500 sm:gap-5 sm:text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-xs" />
            Con tiendas
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="h-2.5 w-2.5 rounded-full border border-slate-300 bg-slate-100" />
            Sin tiendas
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-600 shadow-xs" />
            Hoy
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-400">
            <span>🔒</span>
            Pasado / Protegido
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 sm:p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          Envío para aprobación mensual de {formatPlanningMonthLabel(month)}.
        </p>
        <MonthlySubmitButton
          disabled={editableVisits.length === 0 || catalogLoading || monthProtected}
        />
      </div>

      <BottomSheet
        open={Boolean(selectedDate)}
        onClose={() => setSelectedDate(null)}
        title={selectedDate ? formatDayLabel(selectedDate) : 'Planear día'}
        showBackButton={false}
        initialSnap="expanded"
        footer={
          <div className="flex gap-2.5">
            <Button
              type="button"
              variant="outline"
              className="flex-1 rounded-xl py-2.5 text-xs sm:text-sm font-semibold"
              onClick={() => setSelectedDate(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="flex-1 rounded-xl py-2.5 text-xs sm:text-sm font-semibold shadow-xs"
              onClick={saveDay}
            >
              Guardar día
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <section>
            <div className="flex items-center justify-between gap-3 mb-2">
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-500">
                Orden del día
              </h3>
              <span className="text-xs font-semibold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                {dayDrafts.length} visita(s)
              </span>
            </div>

            {dayDrafts.length === 0 ? (
              <p className="py-2 text-xs text-slate-400 italic">
                Sin tiendas asignadas aún para este día.
              </p>
            ) : (
              <div className="space-y-1.5">
                {dayDrafts.map((visit, index) => (
                  <div
                    key={visit.clientId}
                    className="flex items-center gap-2.5 rounded-xl border border-sky-100 bg-sky-50/50 p-2 sm:p-2.5 shadow-2xs"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-xs font-bold text-white shadow-2xs">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs sm:text-sm font-semibold text-slate-900">{visit.label}</p>
                      <p className="truncate text-[11px] text-slate-500">{visit.subtitle}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Subir ${visit.label}`}
                        disabled={index === 0}
                        onClick={() =>
                          setDayDrafts((current) => moveVisit(current, index, index - 1))
                        }
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-bold shadow-2xs transition active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Bajar ${visit.label}`}
                        disabled={index === dayDrafts.length - 1}
                        onClick={() =>
                          setDayDrafts((current) => moveVisit(current, index, index + 1))
                        }
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-bold shadow-2xs transition active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label={`Quitar ${visit.label}`}
                        onClick={() =>
                          setDayDrafts((current) =>
                            current.filter((item) => item.clientId !== visit.clientId)
                          )
                        }
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 text-sm font-bold shadow-2xs transition hover:bg-rose-50 active:scale-95"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-2">
              <Input
                aria-label="Buscar tienda"
                value={storeSearch}
                onChange={(event) => setStoreSearch(event.target.value)}
                placeholder="🔍 Buscar por nombre, ID PDV o zona..."
                className="!py-2 text-xs sm:text-sm !rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              {availablePdvs.slice(0, 80).map((pdv) => (
                <button
                  key={pdv.id}
                  type="button"
                  onClick={() =>
                    setDayDrafts((current) => [
                      ...current,
                      {
                        clientId: `draft-${selectedDate}-${pdv.id}`,
                        visitId: null,
                        fecha: selectedDate ?? '',
                        pdvId: pdv.id,
                        label: pdv.nombre,
                        subtitle: `${pdv.claveBtl}${pdv.zona ? ` · ${pdv.zona}` : ''}`,
                        notes: '',
                        status: 'PLANIFICADA',
                        locked: false,
                      },
                    ])
                  }
                  className="group flex w-full items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5 sm:px-3 text-left shadow-2xs transition hover:border-sky-300 hover:bg-sky-50/60 active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-xs sm:text-sm font-semibold text-slate-900 group-hover:text-sky-800 transition">
                      {pdv.nombre}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {pdv.claveBtl} · {pdv.zona ?? 'Sin zona'}
                    </span>
                  </div>
                  <span className="shrink-0 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 border border-sky-100 group-hover:bg-sky-600 group-hover:text-white transition">
                    + Agregar
                  </span>
                </button>
              ))}
              {!catalogLoading && availablePdvs.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 text-center">
                  No hay más tiendas disponibles para esta búsqueda.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </BottomSheet>
    </form>
  );
}



function moveVisit(items: MonthlyDraftVisit[], from: number, to: number) {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
