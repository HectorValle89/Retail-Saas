'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { MexicoMap, type MexicoMapPoint } from '@/components/maps/MexicoMap';
import { SafeMapBoundary } from '@/components/maps/SafeMapBoundary';
import {
  aprobarRutaSupervisorMesDirecto,
  solicitarCambiosRutaSupervisorMesDirecto,
} from '../actions';
import type {
  RutaCalendarioCell,
  RutaCalendarioDiaDetail,
  RutaCalendarioMensualData,
  RutaCalendarioSupervisorRow,
  RutaCalendarioVisitDetail,
} from '../services/rutaCalendarioMensualService';
import { formatRouteCalendarMonth } from '../lib/rutaCalendar';

export interface SupervisorOption {
  supervisorEmpleadoId: string;
  supervisor: string;
  zona: string | null;
}

interface RutaMensualRevisionDiaProps {
  month: string;
  supervisors: SupervisorOption[];
  actorPuesto: string;
  initialSupervisorId?: string | null;
  onRouteApproved?: () => void;
}

function getApprovalBadge(approvalState: string | null | undefined, routeStatus: string | null | undefined) {
  if (approvalState === 'APROBADA' || routeStatus === 'PUBLICADA') {
    return {
      label: 'Aprobada',
      badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      dotClass: 'bg-emerald-500',
      icon: '✓',
    };
  }
  if (approvalState === 'CAMBIOS_SOLICITADOS') {
    return {
      label: 'Cambios solicitados',
      badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
      dotClass: 'bg-amber-500',
      icon: '⚠️',
    };
  }
  if (approvalState === 'PENDIENTE_COORDINACION' || routeStatus === 'BORRADOR') {
    return {
      label: 'Pendiente de coordinación',
      badgeClass: 'border-violet-200 bg-violet-50 text-violet-700',
      dotClass: 'bg-violet-500',
      icon: '⏳',
    };
  }
  return {
    label: 'Sin ruta programada',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-500',
    dotClass: 'bg-slate-400',
    icon: '—',
  };
}

function getVisitStatusBadge(estatus: string) {
  if (estatus === 'COMPLETADA') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (estatus === 'CANCELADA') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-sky-200 bg-sky-50 text-sky-700';
}

export function RutaMensualRevisionDia({
  month,
  supervisors,
  actorPuesto,
  initialSupervisorId = null,
  onRouteApproved,
}: RutaMensualRevisionDiaProps) {
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string>(() => {
    if (initialSupervisorId && supervisors.some((s) => s.supervisorEmpleadoId === initialSupervisorId)) {
      return initialSupervisorId;
    }
    return supervisors[0]?.supervisorEmpleadoId ?? '';
  });

  const [calendarData, setCalendarData] = useState<RutaCalendarioMensualData | null>(null);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [dayDetail, setDayDetail] = useState<RutaCalendarioDiaDetail | null>(null);
  const [loadingDayDetail, setLoadingDayDetail] = useState(false);

  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showChangesDialog, setShowChangesDialog] = useState(false);
  const [changesNote, setChangesNote] = useState('');
  const [isPendingAction, startTransition] = useTransition();

  const canManage = actorPuesto === 'COORDINADOR' || actorPuesto === 'ADMINISTRADOR';

  // 1. Cargar el resumen mensual del supervisor seleccionado
  useEffect(() => {
    if (!selectedSupervisorId) return;

    let isMounted = true;
    setLoadingCalendar(true);
    setActionMessage(null);

    const params = new URLSearchParams({
      month,
      supervisorId: selectedSupervisorId,
    });

    fetch(`/api/ruta-semanal/calendario?${params.toString()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.data) throw new Error(json.message ?? 'Error al cargar datos');
        if (isMounted) {
          setCalendarData(json.data);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('[RutaMensualRevisionDia] Error:', err);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingCalendar(false);
      });

    return () => {
      isMounted = false;
    };
  }, [month, selectedSupervisorId]);

  // Supervisor actual
  const currentSupervisorRow: RutaCalendarioSupervisorRow | null = useMemo(() => {
    if (!calendarData) return null;
    return (
      calendarData.supervisors.find(
        (s) => s.supervisorEmpleadoId === selectedSupervisorId
      ) ?? null
    );
  }, [calendarData, selectedSupervisorId]);

  // Días con actividad (visitas planeadas, realizadas o eventos) en el mes
  const activeDays: RutaCalendarioCell[] = useMemo(() => {
    if (!currentSupervisorRow) return [];
    return currentSupervisorRow.cells.filter(
      (cell) => cell.plannedCount > 0 || cell.completedCount > 0 || cell.eventCount > 0
    );
  }, [currentSupervisorRow]);

  // Selección automática de fecha cuando cargan los días activos
  useEffect(() => {
    if (activeDays.length > 0) {
      // Si la fecha seleccionada ya no está en activeDays, seleccionar el primer día activo
      if (!selectedDate || !activeDays.some((d) => d.fecha === selectedDate)) {
        setSelectedDate(activeDays[0].fecha);
      }
    } else {
      setSelectedDate(null);
      setDayDetail(null);
    }
  }, [activeDays, selectedDate]);

  // 2. Cargar detalle de la fecha seleccionada
  useEffect(() => {
    if (!selectedDate || !selectedSupervisorId) {
      setDayDetail(null);
      return;
    }

    let isMounted = true;
    setLoadingDayDetail(true);

    const params = new URLSearchParams({
      fecha: selectedDate,
      supervisorId: selectedSupervisorId,
    });

    fetch(`/api/ruta-semanal/calendario/dia?${params.toString()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.detail) throw new Error(json.message ?? 'Error al cargar detalle');
        if (isMounted) {
          setDayDetail(json.detail);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('[RutaMensualRevisionDia] Error detalle día:', err);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingDayDetail(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedDate, selectedSupervisorId]);

  // Índice del día seleccionado dentro de los días activos
  const selectedDayIndex = useMemo(() => {
    return activeDays.findIndex((d) => d.fecha === selectedDate);
  }, [activeDays, selectedDate]);

  const goToPreviousDay = () => {
    if (selectedDayIndex > 0) {
      setSelectedDate(activeDays[selectedDayIndex - 1].fecha);
    }
  };

  const goToNextDay = () => {
    if (selectedDayIndex < activeDays.length - 1) {
      setSelectedDate(activeDays[selectedDayIndex + 1].fecha);
    }
  };

  // Estado general de aprobación del supervisor para este mes
  const supervisorApprovalStatus = useMemo(() => {
    if (!currentSupervisorRow || activeDays.length === 0) {
      return getApprovalBadge('SIN_RUTA', null);
    }
    // Si todos los días activos están aprobados
    const allApproved = activeDays.every(
      (d) => d.approvalState === 'APROBADA' || d.routeStatus === 'PUBLICADA'
    );
    if (allApproved) {
      return getApprovalBadge('APROBADA', 'PUBLICADA');
    }
    const hasChanges = activeDays.some((d) => d.approvalState === 'CAMBIOS_SOLICITADOS');
    if (hasChanges) {
      return getApprovalBadge('CAMBIOS_SOLICITADOS', 'BORRADOR');
    }
    return getApprovalBadge('PENDIENTE_COORDINACION', 'BORRADOR');
  }, [currentSupervisorRow, activeDays]);

  // Acción: Aprobar ruta del mes
  const handleAprobarRuta = () => {
    if (!selectedSupervisorId || isPendingAction) return;

    startTransition(async () => {
      setActionMessage(null);
      const res = await aprobarRutaSupervisorMesDirecto(selectedSupervisorId, month);
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: '✓ Ruta del mes aprobada con éxito. Se ha reflejado en el calendario mensual.',
        });
        onRouteApproved?.();
        // Recargar datos locales
        setCalendarData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            supervisors: prev.supervisors.map((s) => {
              if (s.supervisorEmpleadoId !== selectedSupervisorId) return s;
              return {
                ...s,
                cells: s.cells.map((c) => ({
                  ...c,
                  approvalState: 'APROBADA',
                  routeStatus: 'PUBLICADA',
                })),
              };
            }),
          };
        });
      } else {
        setActionMessage({ type: 'error', text: res.message });
      }
    });
  };

  // Acción: Solicitar cambios
  const handleSolicitarCambios = () => {
    if (!selectedSupervisorId || isPendingAction || !changesNote.trim()) return;

    startTransition(async () => {
      setActionMessage(null);
      const res = await solicitarCambiosRutaSupervisorMesDirecto(
        selectedSupervisorId,
        month,
        changesNote.trim()
      );
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: 'Se han solicitado cambios al supervisor.',
        });
        setShowChangesDialog(false);
        setChangesNote('');
        onRouteApproved?.();
        // Recargar datos locales
        setCalendarData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            supervisors: prev.supervisors.map((s) => {
              if (s.supervisorEmpleadoId !== selectedSupervisorId) return s;
              return {
                ...s,
                cells: s.cells.map((c) => ({
                  ...c,
                  approvalState: 'CAMBIOS_SOLICITADOS',
                  routeStatus: 'BORRADOR',
                })),
              };
            }),
          };
        });
      } else {
        setActionMessage({ type: 'error', text: res.message });
      }
    });
  };

  // Puntos del mapa para el día actual y territorio completo
  const { mapPoints, counts } = useMemo(() => {
    if (!dayDetail) {
      return {
        mapPoints: [] as MexicoMapPoint[],
        counts: { agendadas: 0, sinVisita: 0, vacantes: 0 },
      };
    }

    const points: MexicoMapPoint[] = [];
    const visitedPdvIds = new Set<string>();

    // 1. Visitas agendadas hoy (Verde / Azul)
    if (dayDetail.plannedVisits) {
      dayDetail.plannedVisits.forEach((v, idx) => {
        visitedPdvIds.add(v.pdvId);
        if (
          typeof v.latitud === 'number' &&
          typeof v.longitud === 'number' &&
          Number.isFinite(v.latitud) &&
          Number.isFinite(v.longitud)
        ) {
          points.push({
            id: v.id,
            lat: v.latitud,
            lng: v.longitud,
            title: `${idx + 1}. ${v.pdv ?? 'Tienda'}`,
            subtitle: `Visita agendada hoy (${v.estatus}) · ${v.claveBtl ?? ''}`,
            detail: `${v.zona ? `Zona: ${v.zona} · ` : ''}${v.direccion ?? ''}`,
            tone: v.estatus === 'COMPLETADA' ? 'emerald' : 'sky',
            inRoute: true,
          });
        }
      });
    }

    let countSinVisita = 0;
    let countVacantes = 0;

    // 2. Tiendas del territorio del supervisor que no tienen visita hoy (Naranjas o Grises)
    if (dayDetail.territoryPdvs) {
      dayDetail.territoryPdvs.forEach((tp) => {
        if (visitedPdvIds.has(tp.pdvId)) return;
        if (
          typeof tp.latitud !== 'number' ||
          typeof tp.longitud !== 'number' ||
          !Number.isFinite(tp.latitud) ||
          !Number.isFinite(tp.longitud)
        ) {
          return;
        }

        if (tp.isVacante) {
          countVacantes += 1;
          points.push({
            id: `vacant-${tp.pdvId}`,
            lat: tp.latitud,
            lng: tp.longitud,
            title: tp.nombre,
            subtitle: `Tienda vacante (sin visita hoy) · ${tp.claveBtl ?? ''}`,
            detail: `${tp.zona ? `Zona: ${tp.zona} · ` : ''}${tp.direccion ?? ''}`,
            tone: 'slate',
            inRoute: false,
          });
        } else {
          countSinVisita += 1;
          points.push({
            id: `territory-${tp.pdvId}`,
            lat: tp.latitud,
            lng: tp.longitud,
            title: tp.nombre,
            subtitle: `Asignada (sin visita hoy) · ${tp.claveBtl ?? ''}`,
            detail: `${tp.zona ? `Zona: ${tp.zona} · ` : ''}${tp.direccion ?? ''}`,
            tone: 'amber',
            inRoute: false,
          });
        }
      });
    }

    return {
      mapPoints: points,
      counts: {
        agendadas: visitedPdvIds.size,
        sinVisita: countSinVisita,
        vacantes: countVacantes,
      },
    };
  }, [dayDetail]);

  const selectedSupervisorName = useMemo(() => {
    return supervisors.find((s) => s.supervisorEmpleadoId === selectedSupervisorId)?.supervisor ?? 'Supervisor';
  }, [supervisors, selectedSupervisorId]);

  return (
    <div className="space-y-6">
      {/* 1. Barra de Control Minimalista: Supervisor + Estado + Botones de Acción */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Selector de Supervisor */}
          <div className="flex flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <label
              htmlFor="supervisor-select"
              className="text-xs font-bold uppercase tracking-wider text-slate-500 shrink-0"
            >
              Supervisor:
            </label>
            <div className="relative flex-1 max-w-md">
              <select
                id="supervisor-select"
                value={selectedSupervisorId}
                onChange={(e) => setSelectedSupervisorId(e.target.value)}
                disabled={loadingCalendar || isPendingAction}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/70 px-3.5 py-2.5 text-sm font-semibold text-slate-900 shadow-2xs transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
              >
                {supervisors.map((sup) => (
                  <option key={sup.supervisorEmpleadoId} value={sup.supervisorEmpleadoId}>
                    {sup.supervisor} {sup.zona ? `(${sup.zona})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-xs font-semibold text-slate-400">
              {formatRouteCalendarMonth(month)}
            </span>
          </div>

          {/* Estado de Aprobación y Botones Directos */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Badge de Estado */}
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${supervisorApprovalStatus.badgeClass}`}
            >
              <span className={`h-2 w-2 rounded-full ${supervisorApprovalStatus.dotClass}`} />
              <span>{supervisorApprovalStatus.label}</span>
            </div>

            {/* Botones de Gestión Directa (solo para Coordinador / Administrador) */}
            {canManage && (
              <div className="flex items-center gap-2">
                {/* Botón: Aprobar Ruta (1 Clic) */}
                <button
                  type="button"
                  onClick={handleAprobarRuta}
                  disabled={isPendingAction || activeDays.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <span>✓</span>
                  <span>Aprobar Ruta</span>
                </button>

                {/* Botón: Pedir Cambios */}
                <button
                  type="button"
                  onClick={() => setShowChangesDialog(true)}
                  disabled={isPendingAction || activeDays.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 shadow-2xs transition hover:bg-amber-100 disabled:opacity-50"
                >
                  <span>⚠️</span>
                  <span>Pedir cambios</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mensaje de Retroalimentación de Acción */}
        {actionMessage && (
          <div
            className={`mt-4 flex items-center justify-between rounded-xl px-4 py-2.5 text-xs font-bold ${
              actionMessage.type === 'success'
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            <span>{actionMessage.text}</span>
            <button
              type="button"
              onClick={() => setActionMessage(null)}
              className="text-xs opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* Modal de Solicitud de Cambios */}
        {showChangesDialog && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
              Solicitar cambios a {selectedSupervisorName}
            </h4>
            <p className="mt-1 text-xs text-slate-600">
              Indica qué ajustes necesita realizar el supervisor en su ruta del mes.
            </p>
            <textarea
              rows={3}
              value={changesNote}
              onChange={(e) => setChangesNote(e.target.value)}
              placeholder="Ej: Favor de reprogramar la visita a Sears Galerías para el viernes..."
              className="mt-3 w-full rounded-xl border border-amber-200 bg-white p-3 text-xs text-slate-800 placeholder-slate-400 focus:border-amber-400 focus:outline-hidden focus:ring-2 focus:ring-amber-100"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowChangesDialog(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSolicitarCambios}
                disabled={isPendingAction}
                className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-amber-700 disabled:opacity-50"
              >
                Enviar Solicitud
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Navegador de Días del Mes */}
      {activeDays.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Flechas de Navegación Anterior / Siguiente */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goToPreviousDay}
                disabled={selectedDayIndex <= 0}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-30"
              >
                <span>‹</span>
                <span>Anterior</span>
              </button>
              <button
                type="button"
                onClick={goToNextDay}
                disabled={selectedDayIndex >= activeDays.length - 1}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-30"
              >
                <span>Siguiente</span>
                <span>›</span>
              </button>
            </div>

            {/* Detalle del Día Seleccionado */}
            <div className="text-left sm:text-right">
              <div className="flex items-center gap-2 sm:justify-end">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-700">
                  Día {selectedDayIndex + 1} de {activeDays.length}
                </span>
                <span className="text-xs text-slate-300">•</span>
                <span className="text-sm font-extrabold text-slate-900">
                  {dayDetail?.fechaLabel ?? selectedDate}
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-500">
                {dayDetail?.plannedVisits.length ?? activeDays[selectedDayIndex]?.plannedCount ?? 0} tiendas programadas
              </p>
            </div>
          </div>

          {/* Fila de Píldoras de Días con Actividad */}
          <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-thin">
            {activeDays.map((day, idx) => {
              const isSelected = day.fecha === selectedDate;
              return (
                <button
                  key={day.fecha}
                  type="button"
                  onClick={() => setSelectedDate(day.fecha)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    isSelected
                      ? 'bg-slate-950 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  <span>{day.letra}</span>
                  <span>{day.numero}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {day.plannedCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-xs">
          <span className="text-3xl">📅</span>
          <h3 className="mt-3 text-base font-bold text-slate-900">
            Sin rutas programadas en {formatRouteCalendarMonth(month)}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {selectedSupervisorName} todavía no tiene visitas cargadas en este mes.
          </p>
        </div>
      )}

      {/* 3. Tiendas Programadas y Mapa del Día (Panorámico) */}
      {selectedDate && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Secuencia de Tiendas (Columna compacta izquierda) */}
          <div className="space-y-3 lg:col-span-5 xl:col-span-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Secuencia de Visitas ({dayDetail?.plannedVisits.length ?? 0})
              </h4>
              {loadingDayDetail && (
                <span className="text-xs font-semibold text-sky-600 animate-pulse">
                  Cargando día...
                </span>
              )}
            </div>

            {dayDetail && dayDetail.plannedVisits.length > 0 ? (
              <div className="max-h-[580px] space-y-2.5 overflow-y-auto pr-1 scrollbar-thin">
                {dayDetail.plannedVisits.map((visit, index) => (
                  <div
                    key={visit.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs transition hover:border-slate-300"
                  >
                    {/* Número de Orden */}
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-extrabold text-white">
                      {index + 1}
                    </div>

                    {/* Información de la Tienda */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs font-bold text-slate-900">
                          {visit.pdv ?? 'Tienda sin nombre'}
                        </p>
                        {visit.claveBtl && (
                          <span className="shrink-0 rounded-md bg-slate-100 px-1 py-0.2 text-[9px] font-semibold text-slate-600">
                            {visit.claveBtl}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {visit.direccion ?? 'Dirección no registrada'}
                      </p>
                    </div>

                    {/* Estatus */}
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase ${getVisitStatusBadge(
                        visit.estatus
                      )}`}
                    >
                      {visit.estatus}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              !loadingDayDetail && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-500">
                  No hay visitas asignadas para esta fecha.
                </div>
              )
            )}
          </div>

          {/* Mapa Panorámico del Territorio (Columna amplia derecha) */}
          <div className="space-y-3 lg:col-span-7 xl:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Ubicación Geográfica y Mapa de Territorio
              </h4>
              {/* Leyenda Visual de los 3 Colores */}
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-500 ring-2 ring-sky-200" />
                  <span>Visita agendada ({counts.agendadas})</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-amber-200" />
                  <span>Sin visita hoy ({counts.sinVisita})</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-400 ring-2 ring-slate-200" />
                  <span>Tienda vacante ({counts.vacantes})</span>
                </span>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              {mapPoints.length > 0 ? (
                <div className="p-3">
                  <SafeMapBoundary heightClassName="h-[560px]">
                    <MexicoMap
                      points={mapPoints}
                      showPath
                      heightClassName="h-[560px]"
                      minZoom={4}
                      maxZoom={15}
                    />
                  </SafeMapBoundary>
                  <div className="mt-2.5 flex flex-wrap items-center justify-between px-1 text-[11px] font-semibold text-slate-400">
                    <span>{mapPoints.length} punto(s) de venta visibles en este territorio</span>
                    <span>Pasa el cursor sobre un punto para ver detalles</span>
                  </div>
                </div>
              ) : (
                <div className="flex h-[560px] flex-col items-center justify-center p-6 text-center text-slate-400">
                  <span className="text-3xl">🗺️</span>
                  <p className="mt-2 text-xs font-semibold">
                    No hay coordenadas GPS registradas para las tiendas de este territorio.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
