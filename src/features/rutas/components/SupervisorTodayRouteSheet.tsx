'use client';

import { type ReactNode, useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ModalPanel } from '@/components/ui/modal-panel';
import { NativeCameraSelfieDialog } from '@/features/asistencias/components/NativeCameraSelfieDialog';
import {
  calcularHashArchivo,
  captureAttendancePosition,
  stampAttendanceSelfie,
  type AttendanceGpsState,
  type CapturedPosition,
} from '@/features/asistencias/lib/attendanceCapture';
import {
  registrarInicioVisitaRutaSemanal,
  registrarEvidenciaEventoAgendaRutaSemanal,
  registrarSalidaVisitaRutaSemanal,
} from '../actions';
import { injectDirectR2Upload } from '@/lib/storage/directR2Client';
import { ESTADO_RUTA_INICIAL } from '../state';
import {
  shouldRecoverFromChunkLoadError,
  recoverFromChunkLoadError,
} from '@/lib/runtime/chunkRecovery';
import {
  SUPERVISOR_CHECKLIST_ITEMS,
  calculateSupervisorChecklistCompletion,
  isSupervisorChecklistItemNotApplicable,
  type SupervisorChecklistKey,
} from '../lib/supervisorVisitChecklist';
import type {
  SupervisorTodayRouteData,
  RutaAgendaEventoItem,
  RutaSemanalVisitItem,
} from '../services/rutaSemanalService';
import { getWeekDateIso } from '../lib/weeklyRoute';
import { getIsoDateInMexicoCity } from '@/lib/geo/mexicoStateTimezone';

interface SupervisorTodayRouteSheetProps {
  data: SupervisorTodayRouteData | null;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  dayEventActionSlot?: ReactNode;
  onDayEventModalClose?: () => void;
}

interface CapturedDraft {
  file: File;
  previewUrl: string;
  hash: string;
  capturedAt: string;
  position: CapturedPosition;
  gpsState: AttendanceGpsState;
}

interface SupervisorVisitLocalDraft {
  schemaVersion: 1;
  visitId: string;
  checklist: Partial<Record<SupervisorChecklistKey, boolean>>;
  checklistComments: Record<string, string>;
  loveIsdinRecordsCount: string;
  comments: string;
  updatedAt: string;
}

const SUPERVISOR_VISIT_DRAFT_PREFIX = 'supervisor-route-visit-draft';

function buildSupervisorVisitDraftKey(visitId: string) {
  return `${SUPERVISOR_VISIT_DRAFT_PREFIX}:${visitId}`;
}

function readSupervisorVisitDraft(visitId: string): SupervisorVisitLocalDraft | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(buildSupervisorVisitDraftKey(visitId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SupervisorVisitLocalDraft>;
    if (parsed.schemaVersion !== 1 || parsed.visitId !== visitId) {
      return null;
    }

    return {
      schemaVersion: 1,
      visitId,
      checklist: parsed.checklist ?? {},
      checklistComments: parsed.checklistComments ?? {},
      loveIsdinRecordsCount: parsed.loveIsdinRecordsCount ?? '',
      comments: parsed.comments ?? '',
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function writeSupervisorVisitDraft(
  visitId: string,
  draft: Omit<SupervisorVisitLocalDraft, 'schemaVersion' | 'visitId' | 'updatedAt'>
) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      buildSupervisorVisitDraftKey(visitId),
      JSON.stringify({
        schemaVersion: 1,
        visitId,
        ...draft,
        updatedAt: new Date().toISOString(),
      } satisfies SupervisorVisitLocalDraft)
    );
  } catch {
    // localStorage can be full or disabled; the server-side submit remains the source of truth.
  }
}

function clearSupervisorVisitDraft(visitId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(buildSupervisorVisitDraftKey(visitId));
  } catch {
    // Best effort cleanup only.
  }
}

function handleActionError(
  error: unknown,
  fallbackMessage: string,
  onError: (message: string) => void
) {
  console.error('Error en acción operativa:', error);
  const message = error instanceof Error ? error.message : '';
  const normalized = message.toLowerCase();

  if (normalized.includes('next_redirect') || normalized.includes('redirect')) {
    onError(
      'Tu sesión expiró o se requiere autenticación. Redirigiendo a la pantalla de acceso...'
    );
    setTimeout(() => {
      window.location.href = '/login';
    }, 1200);
    return;
  }

  if (shouldRecoverFromChunkLoadError(message)) {
    void recoverFromChunkLoadError();
    return;
  }

  onError(message || fallbackMessage);
}

function formatHoraOperativa(isoString?: string | null): string | null {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return null;
  }
}

export function SupervisorTodayRouteSheet({
  data,
  onSuccess,
  onError,
  dayEventActionSlot: dayEventActionContent,
  onDayEventModalClose,
}: SupervisorTodayRouteSheetProps) {
  const [selectedVisit, setSelectedVisit] = useState<RutaSemanalVisitItem | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<RutaAgendaEventoItem | null>(null);
  const [visitItems, setVisitItems] = useState<RutaSemanalVisitItem[]>(
    () => data?.visitasHoy ?? []
  );
  const [eventItems, setEventItems] = useState<RutaAgendaEventoItem[]>(
    () => data?.eventosHoy ?? []
  );

  useEffect(() => {
    setVisitItems(data?.visitasHoy ?? []);
    setEventItems(data?.eventosHoy ?? []);
  }, [data]);

  const visits = visitItems;
  const completedTodayCount = visits.filter(
    (visit) => Boolean(visit.checkInAt && visit.checkOutAt)
  ).length;
  const actionableEvents = eventItems.filter((event) => event.estatusAprobacion !== 'RECHAZADO');

  if (!data) {
    return (
      <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        La ruta mensual todavía no está disponible para este supervisor.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <Card className="bg-white p-3.5 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
                  Ruta de hoy
                </p>
                {visits.length > 0 && (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    {completedTodayCount}/{visits.length} completadas
                  </span>
                )}
              </div>
              <h3 className="mt-1 text-base sm:text-lg font-semibold text-slate-950">
                {visits.length === 0
                  ? 'Sin tiendas programadas'
                  : completedTodayCount === visits.length
                    ? '¡Todas las tiendas completadas hoy!'
                    : `${visits.length - completedTodayCount} tienda(s) por visitar hoy`}
              </h3>
            </div>
            {data.resumenMensual ? (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800">
                  {data.resumenMensual.monthlyVisitsCompleted} de {data.resumenMensual.expectedMonthlyVisits} mes
                </span>
                <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">
                  {data.resumenMensual.monthlyPendingVisits} faltantes
                </span>
              </div>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-500">
            Toca cada tienda para registrar tu llegada, checklist y salida. Cada visita completada descuenta automáticamente de tus visitas pendientes del mes.
          </p>
        </Card>

        <TodayRouteDayEventSection content={dayEventActionContent} onClose={onDayEventModalClose} />

        {visits.length === 0 ? (
          <Card className="bg-slate-50 p-5 text-sm text-slate-500">
            No hay tiendas planificadas para hoy dentro de la ruta mensual aprobada.
          </Card>
        ) : (
          <div className="space-y-2.5">
            {visits.map((visit) => {
              const isCompleted = Boolean(visit.checkInAt && visit.checkOutAt);
              const isInProgress = Boolean(visit.checkInAt && !visit.checkOutAt);
              const horaLlegada = formatHoraOperativa(visit.checkInAt);
              const horaSalida = formatHoraOperativa(visit.checkOutAt);

              return (
                <button
                  key={visit.id}
                  type="button"
                  onClick={() => setSelectedVisit(visit)}
                  className={`group w-full rounded-2xl border text-left shadow-sm transition-all duration-150 active:scale-[0.99] p-3.5 sm:p-4 ${
                    isCompleted
                      ? 'border-emerald-200/90 bg-emerald-50/20 hover:border-emerald-300 hover:bg-emerald-50/40'
                      : isInProgress
                        ? 'border-sky-300 bg-sky-50/25 ring-1 ring-sky-200/60 hover:border-sky-400 hover:bg-sky-50/40'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          isCompleted
                            ? 'bg-emerald-600 text-white'
                            : isInProgress
                              ? 'bg-sky-600 text-white'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {isCompleted ? (
                          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        ) : (
                          `#${visit.orden}`
                        )}
                      </span>

                      <div className="min-w-0">
                        <h4 className="text-sm sm:text-base font-semibold text-slate-900 leading-snug line-clamp-1 group-hover:text-sky-700 transition-colors">
                          {visit.pdv ?? 'PDV sin nombre'}
                        </h4>
                        <p className="mt-0.5 text-[11px] text-slate-400 font-medium tracking-tight truncate">
                          {visit.pdvClaveBtl ?? 'Sin clave'} {visit.zona ? `· ${visit.zona}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          isCompleted
                            ? 'bg-emerald-100/90 text-emerald-800'
                            : isInProgress
                              ? 'bg-sky-100/90 text-sky-800'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isCompleted
                              ? 'bg-emerald-600'
                              : isInProgress
                                ? 'bg-sky-600 animate-ping'
                                : 'bg-slate-400'
                          }`}
                        />
                        {isCompleted ? 'Completada' : isInProgress ? 'En tienda' : 'Pendiente'}
                      </span>
                      <svg
                        className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-1.5 pt-2.5 border-t border-slate-100">
                    <div className="flex flex-col items-center justify-center rounded-lg bg-slate-50/90 px-2 py-1.5 text-center">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Llegada
                      </span>
                      <span
                        className={`text-xs font-semibold mt-0.5 ${
                          visit.checkInAt ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {horaLlegada ?? (visit.checkInAt ? 'Registrada' : 'Pendiente')}
                      </span>
                    </div>

                    <div className="flex flex-col items-center justify-center rounded-lg bg-slate-50/90 px-2 py-1.5 text-center">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Checklist
                      </span>
                      <span
                        className={`text-xs font-semibold mt-0.5 ${
                          visit.checklistCompletion === 100
                            ? 'text-emerald-700'
                            : visit.checklistCompletion > 0
                              ? 'text-sky-700'
                              : 'text-slate-500'
                        }`}
                      >
                        {visit.checklistCompletion}%
                      </span>
                    </div>

                    <div className="flex flex-col items-center justify-center rounded-lg bg-slate-50/90 px-2 py-1.5 text-center">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Salida
                      </span>
                      <span
                        className={`text-xs font-semibold mt-0.5 ${
                          visit.checkOutAt ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {horaSalida ?? (visit.checkOutAt ? 'Cerrada' : 'Pendiente')}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {actionableEvents.length > 0 ? (
          <Card className="bg-white p-3.5 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--module-text)]">
                  Eventos del dia
                </p>
                <h3 className="mt-1 text-base sm:text-lg font-semibold text-slate-950">
                  {actionableEvents.length} evento(s) por ejecutar
                </h3>
              </div>
              <span className="inline-flex items-center rounded-full bg-violet-50 border border-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
                Extraordinarios
              </span>
            </div>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-500">
              Visitas adicionales y eventos extraordinarios registrados para tu jornada de hoy.
            </p>
            <div className="mt-3 space-y-2.5">
              {actionableEvents.map((event) => {
                const isCompleted = event.estatusEjecucion === 'COMPLETADO';
                const isInProgress = event.estatusEjecucion === 'EN_CURSO';

                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedEvent(event)}
                    className={`group w-full rounded-2xl border text-left shadow-sm transition-all duration-150 active:scale-[0.99] p-3.5 sm:p-4 ${
                      isCompleted
                        ? 'border-emerald-200/90 bg-emerald-50/20 hover:border-emerald-300 hover:bg-emerald-50/40'
                        : isInProgress
                          ? 'border-sky-300 bg-sky-50/25 ring-1 ring-sky-200/60 hover:border-sky-400 hover:bg-sky-50/40'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 border border-violet-100">
                            {event.tipoEvento === 'VISITA_ADICIONAL' ? 'Visita extra' : 'Evento'}
                          </span>
                          <h4 className="text-sm sm:text-base font-semibold text-slate-950 leading-snug line-clamp-1 group-hover:text-violet-700 transition-colors">
                            {event.titulo}
                          </h4>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-400 font-medium tracking-tight truncate">
                          {event.tipoLabel} · {event.pdv ?? event.sede ?? 'Sin sede'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            isCompleted
                              ? 'bg-emerald-100/90 text-emerald-800'
                              : isInProgress
                                ? 'bg-sky-100/90 text-sky-800'
                                : 'bg-amber-100/90 text-amber-800'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isCompleted
                                ? 'bg-emerald-600'
                                : isInProgress
                                  ? 'bg-sky-600 animate-ping'
                                  : 'bg-amber-600'
                            }`}
                          />
                          {isCompleted ? 'Cerrado' : isInProgress ? 'En curso' : 'Pendiente'}
                        </span>
                        <svg
                          className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-1.5 pt-2.5 border-t border-slate-100">
                      <div className="flex flex-col items-center justify-center rounded-lg bg-slate-50/90 px-2 py-1.5 text-center">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Hora
                        </span>
                        <span className="text-xs font-semibold text-slate-700 mt-0.5">
                          {event.horaInicio ?? 'Sin hora'}
                        </span>
                      </div>

                      <div className="flex flex-col items-center justify-center rounded-lg bg-slate-50/90 px-2 py-1.5 text-center">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Aprobación
                        </span>
                        <span
                          className={`text-xs font-semibold mt-0.5 ${
                            event.estatusAprobacion === 'APROBADO' || event.estatusAprobacion === 'NO_REQUIERE'
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {event.estatusAprobacion === 'NO_REQUIERE' ? 'Automática' : event.estatusAprobacion}
                        </span>
                      </div>

                      <div className="flex flex-col items-center justify-center rounded-lg bg-slate-50/90 px-2 py-1.5 text-center">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Ejecución
                        </span>
                        <span
                          className={`text-xs font-semibold mt-0.5 ${
                            isCompleted
                              ? 'text-emerald-700'
                              : isInProgress
                                ? 'text-sky-700'
                                : 'text-amber-700'
                          }`}
                        >
                          {isCompleted ? 'Cerrado' : isInProgress ? 'En curso' : 'Pendiente'}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        ) : null}
      </div>

      <ModalPanel
        open={Boolean(selectedVisit)}
        onClose={() => setSelectedVisit(null)}
        title={selectedVisit ? `Visita en ${selectedVisit.pdv ?? 'PDV'}` : 'Visita'}
        subtitle="Registra llegada, checklist y salida de la supervision."
      >
        {selectedVisit && (
          <SupervisorVisitExecutionPanel
            key={selectedVisit.id}
            visit={selectedVisit}
            weekStart={data.semanaActualInicio}
            onClose={() => setSelectedVisit(null)}
            onSuccess={(message, nextVisit) => {
              setSelectedVisit(nextVisit);
              onSuccess(message);
            }}
            onError={onError}
          />
        )}
      </ModalPanel>

      <ModalPanel
        open={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        title={selectedEvent ? selectedEvent.titulo : 'Evento del dia'}
        subtitle="Registra la evidencia operativa del evento con selfie, motivo y GPS silencioso."
      >
        {selectedEvent ? (
          <SupervisorDayEventExecutionPanel
            key={selectedEvent.id}
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onSuccess={(message, nextEvent) => {
              setEventItems((current) =>
                current.map((item) => (item.id === nextEvent.id ? nextEvent : item))
              );
              setSelectedEvent(nextEvent);
              onSuccess(message);
            }}
            onError={onError}
          />
        ) : null}
      </ModalPanel>
    </>
  );
}

function SupervisorDayEventExecutionPanel({
  event,
  onClose,
  onSuccess,
  onError,
}: {
  event: RutaAgendaEventoItem;
  onClose: () => void;
  onSuccess: (message: string, nextEvent: RutaAgendaEventoItem) => void;
  onError: (message: string) => void;
}) {
  const [currentEvent, setCurrentEvent] = useState(event);
  const [comments, setComments] = useState(event.descripcion ?? '');
  const [draft, setDraft] = useState<CapturedDraft | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const todayIso = getIsoDateInMexicoCity();
  const isToday = event.fechaOperacion === todayIso;
  const isFuture = event.fechaOperacion > todayIso;
  const isPast = event.fechaOperacion < todayIso;

  useEffect(() => {
    return () => {
      if (draft?.previewUrl) {
        URL.revokeObjectURL(draft.previewUrl);
      }
    };
  }, [draft]);

  const buildSilentGpsFallback = (): {
    position: CapturedPosition;
    estadoGps: AttendanceGpsState;
  } => ({
    position: {
      latitud: null,
      longitud: null,
      precision: null,
      distanciaMetros: null,
      dentroGeocerca: null,
      capturadaEn: new Date().toISOString(),
    },
    estadoGps: 'SIN_GPS',
  });

  const handleCapture = async (file: File) => {
    const gpsCapture = await captureAttendancePosition({
      geocercaLatitud: null,
      geocercaLongitud: null,
      geocercaRadioMetros: null,
    }).catch(() => buildSilentGpsFallback());
    const capturedAt = new Date().toISOString();
    const stamped = await stampAttendanceSelfie(file, {
      capturedAt,
      latitude: gpsCapture.position.latitud,
      longitude: gpsCapture.position.longitud,
      flowLabel: 'Evidencia',
      hideGpsCoordinates: true,
    });
    const hash = await calcularHashArchivo(stamped.file);
    setDraft((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return {
        file: stamped.file,
        previewUrl: URL.createObjectURL(stamped.file),
        hash,
        capturedAt,
        position: gpsCapture.position,
        gpsState: gpsCapture.estadoGps,
      };
    });
  };

  const submitEvent = () => {
    if (!draft) {
      onError('Primero toma la selfie del evento.');
      return;
    }

    if (!comments.trim()) {
      onError('Agrega el motivo o hallazgo principal del evento.');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set('agenda_evento_id', currentEvent.id);
      formData.set('selfie_file', draft.file);
      formData.set('latitud', String(draft.position.latitud ?? ''));
      formData.set('longitud', String(draft.position.longitud ?? ''));
      formData.set('distancia_metros', String(draft.position.distanciaMetros ?? ''));
      formData.set('estado_gps', draft.gpsState);
      formData.set('comments', comments);

      try {
        try {
          await injectDirectR2Upload(formData, draft.file, {
            modulo: 'rutas',
            removeFieldName: 'selfie_file',
            fieldNames: {
              objectKey: 'selfie_r2_object_key',
              sha256: 'selfie_r2_sha256',
              fileName: 'selfie_r2_file_name',
              contentType: 'selfie_r2_type',
              size: 'selfie_r2_size',
            },
            thumbnailFieldNames: {
              objectKey: 'selfie_thumbnail_r2_object_key',
              sha256: 'selfie_thumbnail_r2_sha256',
              fileName: 'selfie_thumbnail_r2_file_name',
              contentType: 'selfie_thumbnail_r2_type',
              size: 'selfie_thumbnail_r2_size',
            },
          });
        } catch (error) {
          console.error('No fue posible subir la selfie del evento a R2.', error);
        }

        const result = await registrarEvidenciaEventoAgendaRutaSemanal(
          ESTADO_RUTA_INICIAL,
          formData
        );
        if (!result.ok) {
          onError(result.message ?? 'No fue posible registrar el evento.');
          return;
        }

        const nextEvent: RutaAgendaEventoItem = {
          ...currentEvent,
          descripcion: comments,
          estatusEjecucion: 'COMPLETADO',
          selfieUrl: draft.previewUrl,
          checkInAt: draft.capturedAt,
          checkOutAt: draft.capturedAt,
        };

        setCurrentEvent(nextEvent);
        onSuccess(result.message ?? 'Evento operativo registrado.', nextEvent);
        onClose();
      } catch (error) {
        handleActionError(error, 'No fue posible registrar el evento.', onError);
      }
    });
  };

  return (
    <div className="space-y-4">
      <Card className="bg-slate-50 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailItem label="Evento" value={currentEvent.titulo} />
          <DetailItem label="Tipo" value={currentEvent.tipoLabel} />
          <DetailItem
            label="Punto de venta"
            value={currentEvent.pdv ?? currentEvent.sede ?? 'Sin sede'}
          />
          <DetailItem label="Hora" value={currentEvent.horaInicio ?? 'Pendiente'} />
        </div>
      </Card>

      <Card className="bg-white p-4">
        <p className="text-sm font-semibold text-slate-950">Evidencia del evento</p>
        <p className="mt-1 text-sm text-slate-600">
          Captura unica con selfie, motivo y GPS silencioso para dejar trazabilidad del evento
          operativo.
        </p>

        {!isToday && (
          <div
            className={`mt-4 rounded-[14px] border p-4 ${isFuture ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
          >
            <p className="text-sm font-semibold">
              {isFuture
                ? `Este evento esta programado para el futuro (${event.fechaOperacion}). Solo podras registrarlo el dia correspondiente.`
                : `Este evento era para el pasado (${event.fechaOperacion}). Para registrarlo necesitas autorizacion.`}
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => setIsCameraOpen(true)}
            disabled={!isToday}
            className="w-full sm:w-auto"
          >
            {currentEvent.checkInAt ? 'Evento registrado' : 'Abrir selfie'}
          </Button>

          {currentEvent.checkInAt ? (
            <span className="text-sm text-emerald-700">
              Registrado: {new Date(currentEvent.checkInAt).toLocaleString('es-MX')}
            </span>
          ) : null}
        </div>

        {draft ? (
          <div className="mt-4 overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50">
            <img
              src={draft.previewUrl}
              alt="Borrador del evento"
              className="aspect-[4/5] w-full object-cover"
            />
            <div className="space-y-3 px-4 py-4">
              <div className="text-sm text-slate-600">
                <p className="font-semibold text-slate-950">Selfie lista para enviar</p>
                <p>Hora: {new Date(draft.capturedAt).toLocaleString('es-MX')}</p>
              </div>
            </div>
          </div>
        ) : null}

        <label className="mt-4 block text-sm text-slate-700">
          <span className="font-semibold">Motivo y hallazgos del evento</span>
          <textarea
            value={comments}
            onChange={(nextEvent) => setComments(nextEvent.target.value)}
            rows={3}
            className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)]"
          />
        </label>

        {draft ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={submitEvent}
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              {isPending ? 'Enviando...' : 'Confirmar evento'}
            </Button>
          </div>
        ) : null}
      </Card>

      <div className="flex justify-end">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </div>

      <NativeCameraSelfieDialog
        open={isCameraOpen}
        title="Selfie del evento"
        description="Toma la selfie del evento operativo. El GPS se intentara capturar en segundo plano."
        captureLabel="Capturar selfie"
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCapture}
      />
    </div>
  );
}

function SupervisorVisitExecutionPanel({
  visit,
  weekStart,
  onClose,
  onSuccess,
  onError,
}: {
  visit: RutaSemanalVisitItem;
  weekStart: string;
  onClose: () => void;
  onSuccess: (message: string, nextVisit: RutaSemanalVisitItem) => void;
  onError: (message: string) => void;
}) {
  const [localDraft] = useState(() => readSupervisorVisitDraft(visit.id));
  const [currentVisit, setCurrentVisit] = useState(visit);
  const [checklist, setChecklist] = useState<Record<SupervisorChecklistKey, boolean>>(
    () =>
      Object.fromEntries(
        SUPERVISOR_CHECKLIST_ITEMS.map((item) => [
          item.key,
          localDraft?.checklist[item.key] ?? visit.checklistCalidad?.[item.key] ?? false,
        ])
      ) as Record<SupervisorChecklistKey, boolean>
  );
  const [checklistComments, setChecklistComments] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      SUPERVISOR_CHECKLIST_ITEMS.flatMap((item) =>
        'commentKey' in item
          ? [
              [
                item.commentKey,
                localDraft?.checklistComments[item.commentKey] ??
                  visit.checklistComments?.[item.commentKey] ??
                  '',
              ],
            ]
          : []
      )
    )
  );
  const [loveIsdinRecordsCount, setLoveIsdinRecordsCount] = useState(
    localDraft?.loveIsdinRecordsCount ??
      (visit.loveIsdinRecordsCount !== null ? String(visit.loveIsdinRecordsCount) : '')
  );
  const [comments, setComments] = useState(localDraft?.comments ?? visit.comentarios ?? '');
  const [isStartCameraOpen, setIsStartCameraOpen] = useState(false);
  const [isEndCameraOpen, setIsEndCameraOpen] = useState(false);
  const [isEvidenceCameraOpen, setIsEvidenceCameraOpen] = useState(false);
  const [startDraft, setStartDraft] = useState<CapturedDraft | null>(null);
  const [endDraft, setEndDraft] = useState<CapturedDraft | null>(null);
  const [evidenceDraft, setEvidenceDraft] = useState<CapturedDraft | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const gpsPromiseRef = useRef<Promise<{
    position: CapturedPosition;
    estadoGps: AttendanceGpsState;
  }> | null>(null);

  useEffect(() => {
    return () => {
      if (startDraft?.previewUrl) {
        URL.revokeObjectURL(startDraft.previewUrl);
      }
      if (endDraft?.previewUrl) {
        URL.revokeObjectURL(endDraft.previewUrl);
      }
      if (evidenceDraft?.previewUrl) {
        URL.revokeObjectURL(evidenceDraft.previewUrl);
      }
    };
  }, [endDraft, evidenceDraft, startDraft]);

  useEffect(() => {
    if (currentVisit.checkOutAt) {
      clearSupervisorVisitDraft(currentVisit.id);
      return;
    }

    writeSupervisorVisitDraft(currentVisit.id, {
      checklist,
      checklistComments,
      loveIsdinRecordsCount,
      comments,
    });
  }, [
    checklist,
    checklistComments,
    comments,
    currentVisit.checkOutAt,
    currentVisit.id,
    loveIsdinRecordsCount,
  ]);

  const checklistScore = calculateSupervisorChecklistCompletion(checklist);
  const checklistCheckedCount = checklistScore.checkedCount;
  const checklistCompletion = checklistScore.percentage;
  const isSaving = isPending || isSubmitting;

  const todayIso = getIsoDateInMexicoCity();
  const fechaOperacion = getWeekDateIso(weekStart, visit.diaSemana);
  const isToday = fechaOperacion === todayIso;
  const isFuture = fechaOperacion > todayIso;
  const isPast = fechaOperacion < todayIso;

  const canStartVisit = !currentVisit.checkInAt && isToday;
  const canFinishVisit = Boolean(currentVisit.checkInAt) && !currentVisit.checkOutAt && isToday;
  const canOpenChecklist = Boolean(currentVisit.checkInAt);

  const buildSilentGpsFallback = (): {
    position: CapturedPosition;
    estadoGps: AttendanceGpsState;
  } => ({
    position: {
      latitud: null,
      longitud: null,
      precision: null,
      distanciaMetros: null,
      dentroGeocerca: null,
      capturadaEn: new Date().toISOString(),
    },
    estadoGps: 'SIN_GPS',
  });

  const beginGpsCapture = () => {
    if (gpsPromiseRef.current) {
      return gpsPromiseRef.current;
    }

    const pending = captureAttendancePosition({
      geocercaLatitud: currentVisit.latitud,
      geocercaLongitud: currentVisit.longitud,
      geocercaRadioMetros:
        currentVisit.latitud !== null && currentVisit.longitud !== null
          ? (currentVisit.geocercaRadioMetros ?? 100)
          : null,
    })
      .then((result) => {
        return result;
      })
      .catch(() => buildSilentGpsFallback())
      .finally(() => {
        gpsPromiseRef.current = null;
      });

    gpsPromiseRef.current = pending;
    return pending;
  };

  const handleCapture = async (
    file: File,
    flowLabel: 'Check-in' | 'Check-out' | 'Evidencia',
    assignDraft: (draft: CapturedDraft) => void
  ) => {
    const gpsCapture = await beginGpsCapture();
    const capturedAt = new Date().toISOString();
    const stamped = await stampAttendanceSelfie(file, {
      capturedAt,
      latitude: gpsCapture.position.latitud,
      longitude: gpsCapture.position.longitud,
      flowLabel,
      hideGpsCoordinates: true,
    });
    const hash = await calcularHashArchivo(stamped.file);
    assignDraft({
      file: stamped.file,
      previewUrl: URL.createObjectURL(stamped.file),
      hash,
      capturedAt,
      position: gpsCapture.position,
      gpsState: gpsCapture.estadoGps,
    });
  };

  const submitStartVisit = () => {
    if (!startDraft) {
      onError('Primero toma la selfie de llegada.');
      return;
    }

    setIsSubmitting(true);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set('visita_id', currentVisit.id);
        formData.set('selfie_file', startDraft.file);
        formData.set('latitud', String(startDraft.position.latitud ?? ''));
        formData.set('longitud', String(startDraft.position.longitud ?? ''));
        formData.set('distancia_metros', String(startDraft.position.distanciaMetros ?? ''));
        formData.set('estado_gps', startDraft.gpsState);
        formData.set('comments', comments);

        try {
          await injectDirectR2Upload(formData, startDraft.file, {
            modulo: 'rutas',
            removeFieldName: 'selfie_file',
            fieldNames: {
              objectKey: 'selfie_r2_object_key',
              sha256: 'selfie_r2_sha256',
              fileName: 'selfie_r2_file_name',
              contentType: 'selfie_r2_type',
              size: 'selfie_r2_size',
            },
            thumbnailFieldNames: {
              objectKey: 'selfie_thumbnail_r2_object_key',
              sha256: 'selfie_thumbnail_r2_sha256',
              fileName: 'selfie_thumbnail_r2_file_name',
              contentType: 'selfie_thumbnail_r2_type',
              size: 'selfie_thumbnail_r2_size',
            },
          });
        } catch (error) {
          console.error('No fue posible subir la selfie de llegada a R2.', error);
        }

        const result = await registrarInicioVisitaRutaSemanal(ESTADO_RUTA_INICIAL, formData);
        if (!result.ok) {
          onError(result.message ?? 'No fue posible registrar la llegada.');
          return;
        }

        const nextVisit: RutaSemanalVisitItem = {
          ...currentVisit,
          checkInAt: startDraft.capturedAt,
          checkInGpsState: startDraft.gpsState,
          checkInSelfieUrl: startDraft.previewUrl,
        };

        setCurrentVisit(nextVisit);
        onSuccess(result.message ?? 'Llegada registrada.', nextVisit);
      } catch (error) {
        handleActionError(error, 'No fue posible registrar la llegada.', onError);
      } finally {
        setIsSubmitting(false);
      }
    });
  };

  const submitFinishVisit = () => {
    if (!endDraft) {
      onError('Primero toma la selfie de salida.');
      return;
    }

    if (!comments.trim()) {
      onError('Agrega comentarios finales sobre como estuvo la visita y la situacion del PDV.');
      return;
    }

    setIsSubmitting(true);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set('visita_id', currentVisit.id);
        formData.set('selfie_file', endDraft.file);
        if (evidenceDraft) {
          formData.set('evidencia_file', evidenceDraft.file);
        }
        for (const item of SUPERVISOR_CHECKLIST_ITEMS) {
          formData.set(`checklist_${item.key}`, String(checklist[item.key]));
          if ('commentKey' in item) {
            formData.set(
              `checklist_comment_${item.commentKey}`,
              checklistComments[item.commentKey] ?? ''
            );
          }
        }
        formData.set('love_isdin_records_count', loveIsdinRecordsCount);
        formData.set('latitud', String(endDraft.position.latitud ?? ''));
        formData.set('longitud', String(endDraft.position.longitud ?? ''));
        formData.set('distancia_metros', String(endDraft.position.distanciaMetros ?? ''));
        formData.set('estado_gps', endDraft.gpsState);
        formData.set('comments', comments);

        try {
          await injectDirectR2Upload(formData, endDraft.file, {
            modulo: 'rutas',
            removeFieldName: 'selfie_file',
            fieldNames: {
              objectKey: 'selfie_r2_object_key',
              sha256: 'selfie_r2_sha256',
              fileName: 'selfie_r2_file_name',
              contentType: 'selfie_r2_type',
              size: 'selfie_r2_size',
            },
            thumbnailFieldNames: {
              objectKey: 'selfie_thumbnail_r2_object_key',
              sha256: 'selfie_thumbnail_r2_sha256',
              fileName: 'selfie_thumbnail_r2_file_name',
              contentType: 'selfie_thumbnail_r2_type',
              size: 'selfie_thumbnail_r2_size',
            },
          });

          if (evidenceDraft) {
            await injectDirectR2Upload(formData, evidenceDraft.file, {
              modulo: 'rutas',
              removeFieldName: 'evidencia_file',
              fieldNames: {
                objectKey: 'evidencia_r2_object_key',
                sha256: 'evidencia_r2_sha256',
                fileName: 'evidencia_r2_file_name',
                contentType: 'evidencia_r2_type',
                size: 'evidencia_r2_size',
              },
              thumbnailFieldNames: {
                objectKey: 'evidencia_thumbnail_r2_object_key',
                sha256: 'evidencia_thumbnail_r2_sha256',
                fileName: 'evidencia_thumbnail_r2_file_name',
                contentType: 'evidencia_thumbnail_r2_type',
                size: 'evidencia_thumbnail_r2_size',
              },
            });
          }
        } catch (error) {
          console.error('No fue posible subir evidencia de cierre de ruta a R2.', error);
        }

        const result = await registrarSalidaVisitaRutaSemanal(ESTADO_RUTA_INICIAL, formData);
        if (!result.ok) {
          onError(result.message ?? 'No fue posible cerrar la visita.');
          return;
        }

        const nextVisit: RutaSemanalVisitItem = {
          ...currentVisit,
          estatus: 'COMPLETADA',
          checkOutAt: endDraft.capturedAt,
          checkOutGpsState: endDraft.gpsState,
          checkOutSelfieUrl: endDraft.previewUrl,
          checkOutEvidenceUrl: evidenceDraft?.previewUrl ?? currentVisit.checkOutEvidenceUrl,
          checklistCalidad: { ...checklist },
          checklistComments: { ...checklistComments },
          checklistCompletion,
          loveIsdinRecordsCount:
            loveIsdinRecordsCount.trim() === '' ? null : Number.parseInt(loveIsdinRecordsCount, 10),
          comentarios: comments,
          completadaEn: endDraft.capturedAt,
        };

        clearSupervisorVisitDraft(currentVisit.id);
        setCurrentVisit(nextVisit);
        onSuccess(result.message ?? 'Visita cerrada.', nextVisit);
        onClose();
      } catch (error) {
        handleActionError(error, 'No fue posible cerrar la visita.', onError);
      } finally {
        setIsSubmitting(false);
      }
    });
  };

  return (
    <>
      <div className="space-y-4">
      {/* 1. Tarjeta Ejecutiva Compacta del PDV */}
      <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/60 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                #{currentVisit.orden}
              </span>
              <h3 className="text-base font-bold text-slate-950 leading-snug">
                {currentVisit.pdv ?? 'PDV sin nombre'}
              </h3>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 font-medium">
              <span className="font-semibold text-slate-700">{currentVisit.pdvClaveBtl ?? 'Sin clave'}</span>
              {currentVisit.zona && (
                <>
                  <span className="text-slate-300">•</span>
                  <span>{currentVisit.zona}</span>
                </>
              )}
            </div>
            {currentVisit.direccion && (
              <p className="mt-2 text-xs text-slate-500 flex items-start gap-1.5 leading-relaxed">
                <svg className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="line-clamp-2">{currentVisit.direccion}</span>
              </p>
            )}
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shrink-0 ${
              currentVisit.checkOutAt
                ? 'bg-emerald-100/90 text-emerald-800'
                : currentVisit.checkInAt
                  ? 'bg-sky-100/90 text-sky-800'
                  : 'bg-slate-100 text-slate-600'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                currentVisit.checkOutAt
                  ? 'bg-emerald-600'
                  : currentVisit.checkInAt
                    ? 'bg-sky-600 animate-ping'
                    : 'bg-slate-400'
              }`}
            />
            {currentVisit.checkOutAt
              ? 'Completada'
              : currentVisit.checkInAt
                ? 'En tienda'
                : 'Por iniciar'}
          </span>
        </div>

        {localDraft && !currentVisit.checkOutAt ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200/80 px-3 py-2 text-xs font-medium text-emerald-800">
            <svg className="h-4 w-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Borrador local recuperado. Tus respuestas siguen guardadas en este dispositivo.</span>
          </div>
        ) : null}
      </div>

      {!isToday && (
        <Card
          className={`border p-3.5 sm:p-4 rounded-2xl ${isFuture ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
        >
          <p className="text-xs sm:text-sm font-semibold">
            {isFuture
              ? `Esta visita está programada para el futuro (${fechaOperacion}). Solo podrás iniciarla el día correspondiente.`
              : `Esta visita era para el pasado (${fechaOperacion}). Para cerrarla necesitas autorización de coordinación.`}
          </p>
        </Card>
      )}

      {/* 2. PASO 1: LLEGADA A TIENDA */}
      <Card className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                currentVisit.checkInAt
                  ? 'bg-emerald-600 text-white'
                  : 'bg-sky-600 text-white'
              }`}
            >
              {currentVisit.checkInAt ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                '1'
              )}
            </span>
            <h4 className="text-sm sm:text-base font-bold text-slate-950">1. Llegada a tienda</h4>
          </div>
          {currentVisit.checkInAt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              ✓ Registrada
            </span>
          )}
        </div>

        <p className="mt-2 text-xs sm:text-sm text-slate-500">
          Registra tu llegada mostrando tu gafete o el acceso al punto de venta.
        </p>

        {currentVisit.checkInAt ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5 text-xs text-slate-700">
            <span className="font-semibold text-emerald-700">Hora de entrada:</span>
            <span>{new Date(currentVisit.checkInAt).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
          </div>
        ) : (
          <div className="mt-3">
            <Button
              type="button"
              onClick={() => {
                void beginGpsCapture();
                setIsStartCameraOpen(true);
              }}
              disabled={!canStartVisit || isSaving}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition active:scale-[0.99]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Tomar selfie de llegada
            </Button>
          </div>
        )}

        {startDraft && canStartVisit && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <img
              src={startDraft.previewUrl}
              alt="Borrador de llegada"
              className="aspect-[4/3] w-full object-cover sm:max-h-72"
            />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 bg-white border-t border-slate-100">
              <div className="text-xs text-slate-600">
                <p className="font-semibold text-slate-900">Selfie de llegada capturada</p>
                <p className="text-slate-400 mt-0.5">{new Date(startDraft.capturedAt).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true })}</p>
              </div>
              <Button
                type="button"
                onClick={submitStartVisit}
                disabled={isSaving}
                className="w-full sm:w-auto rounded-xl px-4 py-2 font-semibold shadow-sm"
              >
                {isSaving ? 'Guardando llegada...' : 'Confirmar llegada'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 3. PASO 2: CHECKLIST DE SUPERVISIÓN */}
      <Card className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                checklistCompletion === 100
                  ? 'bg-emerald-600 text-white'
                  : canOpenChecklist
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-200 text-slate-500'
              }`}
            >
              {checklistCompletion === 100 ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                '2'
              )}
            </span>
            <h4 className="text-sm sm:text-base font-bold text-slate-950">2. Checklist de visita</h4>
          </div>
          {canOpenChecklist && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                checklistCompletion === 100
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : checklistCompletion > 0
                    ? 'bg-sky-50 text-sky-700 border border-sky-200'
                    : 'bg-slate-100 text-slate-600'
              }`}
            >
              {checklistCheckedCount}/{checklistScore.totalCount} ({checklistCompletion}%)
            </span>
          )}
        </div>

        <p className="mt-2 text-xs sm:text-sm text-slate-500">
          Checklist opcional para documentar la calidad y condiciones operativas del punto de venta.
        </p>

        {!canOpenChecklist ? (
          <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs text-slate-500">
            <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Primero confirma tu llegada a tienda para responder el checklist de supervisión.</span>
          </div>
        ) : (
          <div className="mt-3 grid gap-2.5">
            {SUPERVISOR_CHECKLIST_ITEMS.map((item) => (
              <ChecklistItemCard
                key={item.key}
                checked={checklist[item.key]}
                label={item.label}
                notApplicable={isSupervisorChecklistItemNotApplicable(item.key, checklist)}
                onChange={(checked) =>
                  setChecklist((current) => ({ ...current, [item.key]: checked }))
                }
                disabled={!canOpenChecklist}
                commentLabel={'commentLabel' in item ? item.commentLabel : undefined}
                commentInputType={'commentInputType' in item ? item.commentInputType : undefined}
                commentValue={
                  'commentKey' in item ? (checklistComments[item.commentKey] ?? '') : undefined
                }
                onCommentChange={
                  'commentKey' in item
                    ? (value) => {
                        const commentKey = item.commentKey;
                        setChecklistComments((current) => ({ ...current, [commentKey]: value }));
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </Card>

      {/* 4. PASO 3: SALIDA Y CIERRE DE VISITA */}
      <Card className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                currentVisit.checkOutAt
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 text-slate-500'
              }`}
            >
              {currentVisit.checkOutAt ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                '3'
              )}
            </span>
            <h4 className="text-sm sm:text-base font-bold text-slate-950">3. Salida y cierre de visita</h4>
          </div>
          {currentVisit.checkOutAt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              ✓ Visita cerrada
            </span>
          )}
        </div>

        <p className="mt-2 text-xs sm:text-sm text-slate-500">
          Registra el avance LOVE, evidencia opcional, comentarios finales y por último la selfie de salida para cerrar.
        </p>

        {currentVisit.checkOutAt ? (
          <div className="mt-3 space-y-2 rounded-xl bg-slate-50 border border-slate-100 p-3.5 text-xs text-slate-700">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-emerald-700">Hora de salida:</span>
              <span>{new Date(currentVisit.checkOutAt).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
            </div>
            {currentVisit.loveIsdinRecordsCount !== null && (
              <div className="flex items-center justify-between border-t border-slate-200/60 pt-2">
                <span className="text-slate-500">Registros LOVE ISDIN:</span>
                <span className="font-semibold text-slate-900">{currentVisit.loveIsdinRecordsCount}</span>
              </div>
            )}
            {currentVisit.comentarios && (
              <div className="border-t border-slate-200/60 pt-2">
                <span className="text-slate-500 block">Comentarios registrados:</span>
                <p className="mt-1 text-slate-800 italic font-normal">"{currentVisit.comentarios}"</p>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* 3.1 Registros LOVE ISDIN */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Registros LOVE ISDIN de la DC
              </label>
              <p className="mt-0.5 text-xs text-slate-500">
                Total visible de afiliaciones acumuladas al momento de tu visita.
              </p>
              <input
                type="number"
                min="0"
                step="1"
                value={loveIsdinRecordsCount}
                onChange={(event) => setLoveIsdinRecordsCount(event.target.value)}
                placeholder="Ej. 2"
                disabled={!canFinishVisit}
                className="mt-2.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>

            {/* 3.2 Evidencia Adicional Opcional */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Evidencia fotográfica adicional (opcional)
                  </h5>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Reporta producto roto, anaqueles faltantes o cualquier anomalía en tienda.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEvidenceCameraOpen(true)}
                  disabled={!canFinishVisit || isSaving}
                  className="w-full sm:w-auto rounded-xl px-3.5 py-2 text-xs font-semibold shrink-0"
                >
                  <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {evidenceDraft ? 'Cambiar foto de evidencia' : 'Tomar foto de evidencia'}
                </Button>
              </div>

              {evidenceDraft && (
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <img
                    src={evidenceDraft.previewUrl}
                    alt="Evidencia adicional"
                    className="aspect-[4/3] w-full object-cover sm:max-h-60"
                  />
                  <div className="p-2 text-center text-xs text-emerald-700 font-semibold bg-emerald-50/60">
                    ✓ Foto de evidencia adjunta correctamente
                  </div>
                </div>
              )}
            </div>

            {/* 3.3 Comentarios finales de la visita */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Comentarios y hallazgos finales <span className="text-amber-600">*</span>
                </label>
                <span className="text-[11px] text-slate-400">Requerido para cerrar</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Anota acuerdos con la DC, situación de la tienda y observaciones del día.
              </p>
              <textarea
                value={comments}
                onChange={(event) => setComments(event.target.value)}
                disabled={!canFinishVisit}
                rows={3}
                placeholder="Escribe aquí los comentarios y hallazgos de tu visita..."
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>

            {/* 3.4 Selfie de Salida — ÚLTIMO PASO PARA CERRAR LA VISITA */}
            <div className="rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50/30 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-[11px] font-bold text-white">
                  ★
                </span>
                <h5 className="text-xs font-bold uppercase tracking-wider text-sky-950">
                  Paso final: Selfie de salida y cierre
                </h5>
              </div>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Toma la selfie final con la dermoconsejera para sellar tu salida y cerrar la visita.
              </p>

              {!comments.trim() && (
                <p className="mt-2 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg p-2 border border-amber-200/80">
                  ⚠️ Por favor escribe tus comentarios arriba antes de tomar la selfie de salida.
                </p>
              )}

              <div className="mt-3">
                {!endDraft ? (
                  <Button
                    type="button"
                    onClick={() => {
                      if (!comments.trim()) {
                        onError('Escribe tus comentarios arriba antes de tomar la selfie de salida.');
                        return;
                      }
                      void beginGpsCapture();
                      setIsEndCameraOpen(true);
                    }}
                    disabled={!canFinishVisit || isSaving || !comments.trim()}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold shadow-sm transition active:scale-[0.99]"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Tomar selfie de salida con la DC
                  </Button>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-emerald-300 bg-white shadow-sm">
                    <img
                      src={endDraft.previewUrl}
                      alt="Selfie de salida"
                      className="aspect-[4/3] w-full object-cover sm:max-h-72"
                    />
                    <div className="p-3.5 space-y-3 bg-white">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span className="font-semibold text-slate-900">Selfie de salida lista</span>
                        <button
                          type="button"
                          onClick={() => {
                            void beginGpsCapture();
                            setIsEndCameraOpen(true);
                          }}
                          disabled={isSaving}
                          className="text-sky-600 font-semibold underline text-xs hover:text-sky-800"
                        >
                          Repetir foto
                        </button>
                      </div>

                      <Button
                        type="button"
                        onClick={submitFinishVisit}
                        disabled={isSaving || !comments.trim()}
                        className="w-full rounded-xl py-3 text-sm font-bold shadow-md bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {isSaving ? 'Cerrando visita...' : '✅ Confirmar salida y finalizar visita'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="flex justify-end pt-2">
        <Button type="button" variant="secondary" onClick={onClose} className="rounded-xl px-5 text-sm">
          Cerrar ventana
        </Button>
      </div>
    </div>

      <NativeCameraSelfieDialog
        open={isStartCameraOpen}
        title="Llegada a tienda"
        description="Toma la selfie de entrada mostrando tu gafete o el acceso al punto de venta."
        onClose={() => setIsStartCameraOpen(false)}
        onCapture={(file) => handleCapture(file, 'Check-in', setStartDraft)}
        captureLabel="Capturar llegada"
        onRetryPermissions={() => {
          void beginGpsCapture();
        }}
      />

      <NativeCameraSelfieDialog
        open={isEndCameraOpen}
        title="Salida de tienda"
        description="Toma la selfie con la dermoconsejera para cerrar la visita de supervision."
        onClose={() => setIsEndCameraOpen(false)}
        onCapture={(file) => handleCapture(file, 'Check-out', setEndDraft)}
        captureLabel="Capturar salida"
        onRetryPermissions={() => {
          void beginGpsCapture();
        }}
      />

      <NativeCameraSelfieDialog
        open={isEvidenceCameraOpen}
        title="Evidencia adicional"
        description="Reporta productos rotos, faltantes inconvenientes o algo anomalo en la tienda."
        onClose={() => setIsEvidenceCameraOpen(false)}
        onCapture={(file) => handleCapture(file, 'Evidencia', setEvidenceDraft)}
        facingMode="environment"
        captureLabel="Capturar evidencia"
        onRetryPermissions={() => {
          void beginGpsCapture();
        }}
      />
    </>
  );
}

function TodayRouteDayEventSection({
  content,
  onClose,
}: {
  content: ReactNode | null | undefined;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!content) {
    return null;
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition active:scale-[0.99]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Agregar evento del día
        </Button>
        <span className="text-xs text-slate-500 leading-relaxed">
          Registra fuerza mayor, visita adicional o evidencia operativa sin salir de Mi Ruta Hoy.
        </span>
      </div>
      <ModalPanel
        open={open}
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
        title="Agregar evento del dia"
        subtitle="Captura el evento operativo desde Mi Ruta Hoy con el flujo acordado."
        maxWidthClassName="max-w-[min(1180px,calc(100vw-24px))]"
      >
        <div className="min-h-[68vh]">{content}</div>
      </ModalPanel>
    </>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[18px] border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function ChecklistItemCard({
  checked,
  label,
  notApplicable,
  onChange,
  disabled,
  commentLabel,
  commentInputType,
  commentValue,
  onCommentChange,
}: {
  checked: boolean;
  label: string;
  notApplicable: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
  commentLabel?: string;
  commentInputType?: 'textarea' | 'time';
  commentValue?: string;
  onCommentChange?: (value: string) => void;
}) {
  return (
    <div
      className={`rounded-[18px] border px-4 py-4 ${disabled ? 'border-slate-200 bg-slate-100' : notApplicable ? 'border-slate-200 bg-slate-50/60' : 'border-slate-200 bg-slate-50'}`}
    >
      <label
        className={`flex items-start gap-3 text-sm font-medium ${disabled ? 'text-slate-400' : 'text-slate-700'}`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          className="mt-1 h-4 w-4 rounded border-slate-300"
        />
        <span>
          {label}
          {notApplicable ? (
            <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              No aplica al avance
            </span>
          ) : null}
        </span>
      </label>
      {commentLabel && onCommentChange && (
        <label className={`mt-3 block text-sm ${disabled ? 'text-slate-400' : 'text-slate-700'}`}>
          <span className="font-semibold">{commentLabel}</span>
          {commentInputType === 'time' ? (
            <input
              type="time"
              value={commentValue ?? ''}
              onChange={(event) => onCommentChange(event.target.value)}
              disabled={disabled}
              className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)] disabled:bg-slate-100 disabled:text-slate-400"
            />
          ) : (
            <textarea
              value={commentValue ?? ''}
              onChange={(event) => onCommentChange(event.target.value)}
              disabled={disabled}
              rows={3}
              className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-[var(--module-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--module-focus-ring)] disabled:bg-slate-100 disabled:text-slate-400"
            />
          )}
        </label>
      )}
    </div>
  );
}
