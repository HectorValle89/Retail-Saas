'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ModalPanel } from '@/components/ui/modal-panel';
import {
  formatRouteCalendarDate,
  formatRouteCalendarMonth,
  normalizeRouteCalendarMonth,
  shiftRouteCalendarMonth,
} from '../lib/rutaCalendar';
import {
  calculateSupervisorMonthlyStatus,
  summarizeMonthlyRouteStatuses,
  type SupervisorMonthlyEstado,
  type SupervisorMonthlyStatus,
} from '../lib/monthlyRouteStatus';
import type {
  RutaCalendarioCell,
  RutaCalendarioDiaDetail,
  RutaCalendarioMensualData,
  RutaCalendarioSupervisorRow,
  RutaCalendarioVisitDetail,
} from '../services/rutaCalendarioMensualService';
import {
  aprobarRutaSupervisorMesDirecto,
  solicitarCambiosRutaSupervisorMesDirecto,
} from '../actions';
import { RutaMensualCalendar } from './RutaMensualCalendar';

interface SupervisorOption {
  supervisorEmpleadoId: string;
  supervisor: string;
  zona: string | null;
}

interface SupervisorMonthlyRouteBoardProps {
  actorPuesto: string;
  month: string;
  onMonthChange: (monthIso: string) => void;
  supervisorOptions: SupervisorOption[];
  onExportMonth?: () => void;
  isExportingMonth?: boolean;
  refreshToken?: string | null;
}

function getEstadoBadge(estado: SupervisorMonthlyEstado) {
  switch (estado) {
    case 'APROBADA':
      return {
        label: 'Aprobada',
        bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        dot: 'bg-emerald-500',
        icon: '✓',
      };
    case 'ENVIADA':
      return {
        label: 'Enviada / Por revisar',
        bg: 'bg-sky-50 text-sky-800 border-sky-200',
        dot: 'bg-sky-500',
        icon: '📨',
      };
    case 'CAMBIOS_SOLICITADOS':
      return {
        label: 'Cambios solicitados',
        bg: 'bg-amber-50 text-amber-900 border-amber-200',
        dot: 'bg-amber-500',
        icon: '✏️',
      };
    case 'FALTANTE':
    default:
      return {
        label: 'Sin ruta enviada',
        bg: 'bg-rose-50 text-rose-800 border-rose-200',
        dot: 'bg-rose-400',
        icon: '⚠️',
      };
  }
}

export function SupervisorMonthlyRouteBoard({
  actorPuesto,
  month: controlledMonth,
  onMonthChange,
  supervisorOptions,
  onExportMonth,
  isExportingMonth = false,
  refreshToken = null,
}: SupervisorMonthlyRouteBoardProps) {
  const [data, setData] = useState<RutaCalendarioMensualData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<SupervisorMonthlyEstado | 'TODOS'>('TODOS');
  const [viewMode, setViewMode] = useState<'board' | 'matrix'>('board');
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Modal de revisión de un supervisor
  const [reviewingSupervisor, setReviewingSupervisor] = useState<SupervisorMonthlyStatus | null>(null);
  const [selectedDayFecha, setSelectedDayFecha] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<RutaCalendarioDiaDetail | null>(null);
  const [dayDetailLoading, setDayDetailLoading] = useState(false);
  const [approvalNote, setApprovalNote] = useState('');

  // Modal para solicitar cambios
  const [requestingChangesSupervisor, setRequestingChangesSupervisor] = useState<SupervisorMonthlyStatus | null>(null);
  const [changesNote, setChangesNote] = useState('');

  // Modal para aprobación masiva
  const [isBulkApproveModalOpen, setIsBulkApproveModalOpen] = useState(false);
  const [isBulkApproving, setIsBulkApproving] = useState(false);

  const canManage = actorPuesto === 'ADMINISTRADOR' || actorPuesto === 'COORDINADOR';
  const normalizedMonth = normalizeRouteCalendarMonth(controlledMonth);

  // Carga de datos del mes completo
  const loadMonthData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ month: normalizedMonth });
      const response = await fetch(`/api/ruta-semanal/calendario?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const payload = (await response.json()) as {
        data?: RutaCalendarioMensualData;
        message?: string;
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.message ?? 'No fue posible cargar las rutas del mes.');
      }
      setData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos del mes.');
    } finally {
      setIsLoading(false);
    }
  }, [normalizedMonth]);

  useEffect(() => {
    loadMonthData();
  }, [loadMonthData, refreshToken]);

  // Lista combinada de supervisores con su estado mensual calculado
  const supervisorStatuses = useMemo<SupervisorMonthlyStatus[]>(() => {
    if (!data) return [];

    const rowsMap = new Map<string, RutaCalendarioSupervisorRow>(
      data.supervisors.map((row) => [row.supervisorEmpleadoId, row])
    );

    // Combinar con la lista completa de opciones de supervisores activos
    const allSupervisors = supervisorOptions.length > 0 ? supervisorOptions : data.supervisors;

    const list: SupervisorMonthlyStatus[] = [];

    for (const sup of allSupervisors) {
      const existingRow = rowsMap.get(sup.supervisorEmpleadoId);
      if (existingRow) {
        list.push(calculateSupervisorMonthlyStatus(existingRow));
      } else {
        // Supervisor sin registro de ruta en el mes
        list.push({
          supervisorEmpleadoId: sup.supervisorEmpleadoId,
          supervisor: sup.supervisor,
          zona: sup.zona ?? null,
          estado: 'FALTANTE',
          diasPlaneados: 0,
          totalVisitas: 0,
          visitasCompletadas: 0,
          visitasPendientes: 0,
          porcentajeAvance: 0,
          cells: [],
        });
      }
    }

    // Agregar supervisores que vinieron en data pero no estaban en supervisorOptions
    for (const row of data.supervisors) {
      if (!list.some((item) => item.supervisorEmpleadoId === row.supervisorEmpleadoId)) {
        list.push(calculateSupervisorMonthlyStatus(row));
      }
    }

    return list.sort((a, b) => a.supervisor.localeCompare(b.supervisor, 'es'));
  }, [data, supervisorOptions]);

  // Resumen / KPIs
  const summary = useMemo(() => {
    return summarizeMonthlyRouteStatuses(supervisorStatuses);
  }, [supervisorStatuses]);

  // Supervisores filtrados por estado y búsqueda
  const filteredSupervisors = useMemo(() => {
    return supervisorStatuses.filter((item) => {
      if (estadoFilter !== 'TODOS' && item.estado !== estadoFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = item.supervisor.toLowerCase().includes(query);
        const matchesZona = (item.zona ?? '').toLowerCase().includes(query);
        if (!matchesName && !matchesZona) return false;
      }
      return true;
    });
  }, [supervisorStatuses, estadoFilter, searchQuery]);

  // Carga de detalle de día cuando se selecciona en el modal de revisión
  const handleSelectDay = async (fecha: string, supervisorId: string) => {
    setSelectedDayFecha(fecha);
    setDayDetailLoading(true);
    setDayDetail(null);
    try {
      const params = new URLSearchParams({ fecha, supervisorId });
      const response = await fetch(`/api/ruta-semanal/calendario/dia?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const payload = (await response.json()) as { detail?: RutaCalendarioDiaDetail; message?: string };
      if (response.ok && payload.detail) {
        setDayDetail(payload.detail);
      }
    } catch {
      // Ignorar fallo puntual
    } finally {
      setDayDetailLoading(false);
    }
  };

  // Abrir revisión de un supervisor
  const handleOpenReview = (supervisor: SupervisorMonthlyStatus) => {
    setReviewingSupervisor(supervisor);
    setApprovalNote('');
    // Seleccionar automáticamente el primer día con visitas planeadas
    const firstActiveDay = supervisor.cells.find((c) => c.plannedCount > 0);
    if (firstActiveDay) {
      handleSelectDay(firstActiveDay.fecha, supervisor.supervisorEmpleadoId);
    } else {
      setSelectedDayFecha(null);
      setDayDetail(null);
    }
  };

  // Aprobar mes de un supervisor
  const handleAprobarSupervisor = async (supervisor: SupervisorMonthlyStatus, note?: string) => {
    setActionLoadingId(supervisor.supervisorEmpleadoId);
    setActionMessage(null);
    try {
      const res = await aprobarRutaSupervisorMesDirecto(
        supervisor.supervisorEmpleadoId,
        normalizedMonth,
        note?.trim() || undefined
      );
      if (res.ok) {
        setActionMessage({ text: `Ruta de ${supervisor.supervisor} aprobada con éxito.`, type: 'success' });
        setReviewingSupervisor(null);
        await loadMonthData();
      } else {
        setActionMessage({ text: res.message, type: 'error' });
      }
    } catch (err) {
      setActionMessage({
        text: err instanceof Error ? err.message : 'No fue posible aprobar la ruta.',
        type: 'error',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Solicitar cambios a un supervisor
  const handleSolicitarCambios = async () => {
    if (!requestingChangesSupervisor || !changesNote.trim()) return;

    setActionLoadingId(requestingChangesSupervisor.supervisorEmpleadoId);
    setActionMessage(null);
    try {
      const res = await solicitarCambiosRutaSupervisorMesDirecto(
        requestingChangesSupervisor.supervisorEmpleadoId,
        normalizedMonth,
        changesNote.trim()
      );
      if (res.ok) {
        setActionMessage({
          text: `Se solicitaron cambios a ${requestingChangesSupervisor.supervisor}.`,
          type: 'success',
        });
        setRequestingChangesSupervisor(null);
        setChangesNote('');
        setReviewingSupervisor(null);
        await loadMonthData();
      } else {
        setActionMessage({ text: res.message, type: 'error' });
      }
    } catch (err) {
      setActionMessage({
        text: err instanceof Error ? err.message : 'No fue posible solicitar cambios.',
        type: 'error',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Aprobación masiva de todas las enviadas
  const handleBulkApprove = async () => {
    const enviadas = supervisorStatuses.filter((s) => s.estado === 'ENVIADA');
    if (enviadas.length === 0) return;

    setIsBulkApproving(true);
    setActionMessage(null);
    let aprobadasCount = 0;

    for (const sup of enviadas) {
      try {
        const res = await aprobarRutaSupervisorMesDirecto(
          sup.supervisorEmpleadoId,
          normalizedMonth,
          'Aprobación administrativa masiva del mes.'
        );
        if (res.ok) aprobadasCount += 1;
      } catch {
        // Continuar con los demás
      }
    }

    setIsBulkApproving(false);
    setIsBulkApproveModalOpen(false);
    setActionMessage({
      text: `Se aprobaron ${aprobadasCount} de ${enviadas.length} rutas enviadas del mes.`,
      type: 'success',
    });
    await loadMonthData();
  };

  return (
    <div className="space-y-4">
      {/* Barra de cabecera minimalista: Navegación de mes y exportación */}
      <Card className="border-slate-200/90 bg-white shadow-2xs p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                Planeación Mensual
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {formatRouteCalendarMonth(normalizedMonth)}
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
              Rutas de Supervisores
            </h2>
            <p className="text-xs text-slate-500 max-w-2xl">
              Supervisión, aprobación y descarga de la planeación mensual de todo el equipo de campo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Selector de mes rápido */}
            <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50/80 p-1 shadow-2xs">
              <button
                type="button"
                onClick={() => onMonthChange(shiftRouteCalendarMonth(normalizedMonth, -1))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-700 shadow-2xs transition hover:bg-slate-100 hover:text-slate-950"
                aria-label="Mes anterior"
                title="Mes anterior"
              >
                ‹
              </button>
              <div className="px-3 text-center">
                <span className="block text-xs font-bold capitalize text-slate-900 sm:text-sm">
                  {formatRouteCalendarMonth(normalizedMonth)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onMonthChange(shiftRouteCalendarMonth(normalizedMonth, 1))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-700 shadow-2xs transition hover:bg-slate-100 hover:text-slate-950"
                aria-label="Mes siguiente"
                title="Mes siguiente"
              >
                ›
              </button>
            </div>

            {/* Botón de Excel del Mes */}
            {onExportMonth && (
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl border-emerald-300 bg-emerald-50 px-4 text-xs font-bold text-emerald-900 shadow-2xs hover:bg-emerald-100 hover:text-emerald-950"
                onClick={onExportMonth}
                disabled={isExportingMonth}
              >
                {isExportingMonth ? (
                  <>
                    <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" />
                    Generando Excel...
                  </>
                ) : (
                  <>
                    <span className="mr-1.5 text-base">📊</span>
                    Descargar Excel del Mes
                  </>
                )}
              </Button>
            )}

            {/* Conmutador de vista (Tablero vs Matriz de 31 días) */}
            <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-100/80 p-1 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('board')}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  viewMode === 'board'
                    ? 'bg-white text-slate-950 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📋 Tablero
              </button>
              <button
                type="button"
                onClick={() => setViewMode('matrix')}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  viewMode === 'matrix'
                    ? 'bg-white text-slate-950 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🗓️ Matriz 31 días
              </button>
            </div>
          </div>
        </div>

        {/* Mensaje de acción */}
        {actionMessage && (
          <div
            className={`mt-4 flex items-center justify-between rounded-xl px-4 py-2.5 text-xs font-semibold ${
              actionMessage.type === 'success'
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            <span>{actionMessage.text}</span>
            <button
              type="button"
              onClick={() => setActionMessage(null)}
              className="text-slate-400 hover:text-slate-700 ml-2"
            >
              ✕
            </button>
          </div>
        )}
      </Card>

      {/* Si está en modo Matriz, renderizar el componente de calendario completo */}
      {viewMode === 'matrix' ? (
        <RutaMensualCalendar
          actorPuesto={actorPuesto}
          month={normalizedMonth}
          onMonthChange={onMonthChange}
          refreshToken={refreshToken}
          onExportMonth={onExportMonth}
          isExportingMonth={isExportingMonth}
          supervisorOptions={supervisorOptions}
        />
      ) : (
        <>
          {/* Tarjetas de Estado Mensual (KPIs interactivos para filtrar) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
            {/* 1. Enviadas / Por revisar */}
            <button
              type="button"
              onClick={() => setEstadoFilter((curr) => (curr === 'ENVIADA' ? 'TODOS' : 'ENVIADA'))}
              className={`flex flex-col items-start rounded-2xl border p-4 text-left transition ${
                estadoFilter === 'ENVIADA'
                  ? 'border-sky-500 bg-sky-50/90 ring-2 ring-sky-500 shadow-sm'
                  : 'border-sky-200 bg-sky-50/50 hover:bg-sky-50 hover:border-sky-300'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-800">
                  Por Revisar
                </span>
                <span className="text-lg">📨</span>
              </div>
              <p className="mt-1 text-2xl font-black text-sky-950 sm:text-3xl">
                {summary.enviadas}
              </p>
              <p className="mt-1 text-[11px] font-medium text-sky-700">
                {summary.enviadas === 1 ? '1 supervisor envió' : `${summary.enviadas} supervisores enviaron`}
              </p>
            </button>

            {/* 2. Aprobadas */}
            <button
              type="button"
              onClick={() => setEstadoFilter((curr) => (curr === 'APROBADA' ? 'TODOS' : 'APROBADA'))}
              className={`flex flex-col items-start rounded-2xl border p-4 text-left transition ${
                estadoFilter === 'APROBADA'
                  ? 'border-emerald-500 bg-emerald-50/90 ring-2 ring-emerald-500 shadow-sm'
                  : 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-300'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                  Aprobadas
                </span>
                <span className="text-lg">✅</span>
              </div>
              <p className="mt-1 text-2xl font-black text-emerald-950 sm:text-3xl">
                {summary.aprobadas}
              </p>
              <p className="mt-1 text-[11px] font-medium text-emerald-700">
                {summary.aprobadas === 1 ? '1 ruta lista' : `${summary.aprobadas} rutas listas`}
              </p>
            </button>

            {/* 3. Con cambios solicitados */}
            <button
              type="button"
              onClick={() =>
                setEstadoFilter((curr) => (curr === 'CAMBIOS_SOLICITADOS' ? 'TODOS' : 'CAMBIOS_SOLICITADOS'))
              }
              className={`flex flex-col items-start rounded-2xl border p-4 text-left transition ${
                estadoFilter === 'CAMBIOS_SOLICITADOS'
                  ? 'border-amber-500 bg-amber-50/90 ring-2 ring-amber-500 shadow-sm'
                  : 'border-amber-200 bg-amber-50/50 hover:bg-amber-50 hover:border-amber-300'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900">
                  Con Cambios
                </span>
                <span className="text-lg">✏️</span>
              </div>
              <p className="mt-1 text-2xl font-black text-amber-950 sm:text-3xl">
                {summary.cambiosSolicitados}
              </p>
              <p className="mt-1 text-[11px] font-medium text-amber-800">
                En corrección
              </p>
            </button>

            {/* 4. Faltantes */}
            <button
              type="button"
              onClick={() => setEstadoFilter((curr) => (curr === 'FALTANTE' ? 'TODOS' : 'FALTANTE'))}
              className={`flex flex-col items-start rounded-2xl border p-4 text-left transition ${
                estadoFilter === 'FALTANTE'
                  ? 'border-rose-500 bg-rose-50/90 ring-2 ring-rose-500 shadow-sm'
                  : 'border-rose-200 bg-rose-50/50 hover:bg-rose-50 hover:border-rose-300'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">
                  Sin Ruta
                </span>
                <span className="text-lg">⚠️</span>
              </div>
              <p className="mt-1 text-2xl font-black text-rose-950 sm:text-3xl">
                {summary.faltantes}
              </p>
              <p className="mt-1 text-[11px] font-medium text-rose-700">
                Pendientes de enviar
              </p>
            </button>
          </div>

          {/* Barra de Búsqueda, Filtros y Aprobación Masiva */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                🔍
              </span>
              <input
                type="text"
                placeholder="Buscar supervisor o zona..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-xs font-semibold text-slate-900 shadow-2xs placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {estadoFilter !== 'TODOS' && (
                <button
                  type="button"
                  onClick={() => setEstadoFilter('TODOS')}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Ver todos ({supervisorStatuses.length})
                </button>
              )}

              {/* Botón de Aprobación Masiva */}
              {canManage && summary.enviadas > 0 && (
                <Button
                  type="button"
                  onClick={() => setIsBulkApproveModalOpen(true)}
                  className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700"
                >
                  ⚡ Aprobar todas las enviadas ({summary.enviadas})
                </Button>
              )}
            </div>
          </div>

          {/* Lista de Supervisores (Directorio Mensual Minimalista) */}
          {isLoading ? (
            <Card className="p-8 text-center border-slate-200 bg-white">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
              <p className="mt-2 text-xs font-semibold text-slate-500">Cargando rutas del mes...</p>
            </Card>
          ) : error ? (
            <Card className="border-rose-200 bg-rose-50 p-6 text-center">
              <p className="text-sm font-semibold text-rose-800">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 text-xs"
                onClick={loadMonthData}
              >
                Reintentar
              </Button>
            </Card>
          ) : filteredSupervisors.length === 0 ? (
            <Card className="p-8 text-center border-slate-200 bg-white">
              <p className="text-sm font-semibold text-slate-800">No se encontraron supervisores</p>
              <p className="mt-1 text-xs text-slate-500">
                {searchQuery || estadoFilter !== 'TODOS'
                  ? 'Intenta cambiar los filtros de búsqueda o seleccionar otra categoría.'
                  : 'No hay supervisores registrados para este mes.'}
              </p>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredSupervisors.map((sup) => {
                const badge = getEstadoBadge(sup.estado);
                const isActionLoading = actionLoadingId === sup.supervisorEmpleadoId;

                return (
                  <div
                    key={sup.supervisorEmpleadoId}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs transition hover:border-slate-300 hover:shadow-xs"
                  >
                    <div>
                      {/* Cabecera de la tarjeta: Nombre, zona y badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-bold text-slate-950 sm:text-base">
                            {sup.supervisor}
                          </h3>
                          <p className="text-xs font-medium text-slate-500">
                            {sup.zona ? `Zona ${sup.zona}` : 'Sin zona'}
                          </p>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badge.bg}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                          {badge.label}
                        </span>
                      </div>

                      {/* Métricas clave del mes */}
                      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-center">
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Días
                          </span>
                          <span className="text-sm font-black text-slate-900">
                            {sup.diasPlaneados}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Visitas
                          </span>
                          <span className="text-sm font-black text-slate-900">
                            {sup.totalVisitas}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Hechas
                          </span>
                          <span className="text-sm font-black text-emerald-700">
                            {sup.visitasCompletadas}
                          </span>
                        </div>
                      </div>

                      {/* Barra de progreso de visitas si tiene planeación */}
                      {sup.totalVisitas > 0 && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                            <span>Avance operativo</span>
                            <span>{sup.porcentajeAvance}%</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                              style={{ width: `${sup.porcentajeAvance}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Botones de acción al pie de la tarjeta */}
                    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="flex-1 rounded-xl text-xs font-bold"
                        onClick={() => handleOpenReview(sup)}
                        disabled={isActionLoading}
                      >
                        👁️ Revisar ruta
                      </Button>

                      {canManage && sup.estado === 'ENVIADA' && (
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 shadow-2xs"
                          onClick={() => handleAprobarSupervisor(sup)}
                          disabled={isActionLoading}
                        >
                          {isActionLoading ? 'Aprobando...' : '✓ Aprobar'}
                        </Button>
                      )}

                      {canManage && (sup.estado === 'ENVIADA' || sup.estado === 'APROBADA') && (
                        <button
                          type="button"
                          onClick={() => {
                            setRequestingChangesSupervisor(sup);
                            setChangesNote('');
                          }}
                          disabled={isActionLoading}
                          className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition shadow-2xs"
                          title="Solicitar cambios o corrección"
                        >
                          ✏️
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal de Revisión Completa del Mes de un Supervisor */}
      <ModalPanel
        open={Boolean(reviewingSupervisor)}
        onClose={() => setReviewingSupervisor(null)}
        title={reviewingSupervisor?.supervisor ?? 'Revisión de ruta mensual'}
        subtitle={`Planeación de ${formatRouteCalendarMonth(normalizedMonth)} · ${reviewingSupervisor?.zona ? `Zona ${reviewingSupervisor.zona}` : ''}`}
      >
        {reviewingSupervisor && (
          <div className="space-y-4">
            {/* Resumen del supervisor */}
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3 text-center">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Días con Ruta
                </span>
                <span className="text-base font-black text-slate-900">
                  {reviewingSupervisor.diasPlaneados}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Total Visitas
                </span>
                <span className="text-base font-black text-slate-900">
                  {reviewingSupervisor.totalVisitas}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Estado
                </span>
                <span className="text-xs font-bold text-slate-800">
                  {getEstadoBadge(reviewingSupervisor.estado).label}
                </span>
              </div>
            </div>

            {/* Selector de días con visitas programadas */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                Días programados en el mes:
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 rounded-xl border border-slate-100 bg-slate-50/50">
                {reviewingSupervisor.cells.filter((c) => c.plannedCount > 0).length === 0 ? (
                  <p className="p-3 text-xs text-slate-500 italic">
                    Este supervisor no tiene visitas cargadas en este mes.
                  </p>
                ) : (
                  reviewingSupervisor.cells
                    .filter((c) => c.plannedCount > 0)
                    .map((cell) => {
                      const isSelected = selectedDayFecha === cell.fecha;
                      return (
                        <button
                          key={cell.fecha}
                          type="button"
                          onClick={() =>
                            handleSelectDay(cell.fecha, reviewingSupervisor.supervisorEmpleadoId)
                          }
                          className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-semibold transition ${
                            isSelected
                              ? 'border-sky-500 bg-sky-600 text-white shadow-2xs'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <span>{cell.numero} {cell.letra}</span>
                          <span
                            className={`rounded-md px-1.5 py-0.2 text-[10px] font-bold ${
                              isSelected
                                ? 'bg-sky-700 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {cell.plannedCount}
                          </span>
                        </button>
                      );
                    })
                )}
              </div>
            </div>

            {/* Detalle de las tiendas del día seleccionado */}
            {selectedDayFecha && (() => {
              const dayVisits = dayDetail
                ? dayDetail.plannedVisits.length > 0
                  ? dayDetail.plannedVisits
                  : dayDetail.completedVisits
                : [];

              return (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-900">
                      Tiendas del {formatRouteCalendarDate(selectedDayFecha)}:
                    </p>
                    {dayDetail && (
                      <span className="text-[11px] font-medium text-slate-500">
                        {dayVisits.length} tienda{dayVisits.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {dayDetailLoading ? (
                    <div className="py-6 text-center">
                      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
                      <p className="mt-1 text-xs text-slate-500">Cargando tiendas...</p>
                    </div>
                  ) : !dayDetail || dayVisits.length === 0 ? (
                    <p className="py-4 text-center text-xs text-slate-400 italic">
                      Sin tiendas registradas para esta fecha.
                    </p>
                  ) : (
                    <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                      {dayVisits.map((visita: RutaCalendarioVisitDetail, index: number) => (
                        <div
                          key={visita.id}
                          className="rounded-xl border border-slate-200 bg-white p-2.5 transition hover:border-slate-300"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-700">
                                  #{index + 1}
                                </span>
                                <p className="truncate text-xs font-bold text-slate-900">
                                  {visita.pdv ?? 'Tienda sin nombre'}
                                </p>
                              </div>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {visita.claveBtl ?? 'Sin clave'} {visita.zona ? `· ${visita.zona}` : ''}
                                {visita.direccion ? ` · ${visita.direccion}` : ''}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0 ${
                                visita.estatus === 'COMPLETADA'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {visita.estatus}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Acciones de aprobación dentro del modal */}
            {canManage && (
              <div className="space-y-3 border-t border-slate-100 pt-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Nota u observaciones (opcional)
                  <input
                    type="text"
                    placeholder="Ej. Aprobado para operación mensual..."
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-xl text-xs font-bold border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                    onClick={() => {
                      setRequestingChangesSupervisor(reviewingSupervisor);
                      setChangesNote(approvalNote);
                    }}
                  >
                    ✏️ Solicitar cambios
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 rounded-xl bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700 shadow-2xs"
                    onClick={() => handleAprobarSupervisor(reviewingSupervisor, approvalNote)}
                    disabled={actionLoadingId === reviewingSupervisor.supervisorEmpleadoId}
                  >
                    {actionLoadingId === reviewingSupervisor.supervisorEmpleadoId
                      ? 'Aprobando...'
                      : '✓ Aprobar mes completo'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </ModalPanel>

      {/* Modal para Solicitar Cambios con nota obligatoria */}
      <ModalPanel
        open={Boolean(requestingChangesSupervisor)}
        onClose={() => setRequestingChangesSupervisor(null)}
        title={`Solicitar cambios a ${requestingChangesSupervisor?.supervisor ?? ''}`}
        subtitle="Indica al supervisor los motivos o fechas que debe corregir antes de reenviar su planeación mensual."
      >
        <div className="space-y-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
            Motivo de los cambios (requerido)
            <textarea
              rows={4}
              placeholder="Ej. Por favor agrega las visitas de Farmacia San Pablo en la segunda semana y revisa descansos..."
              value={changesNote}
              onChange={(e) => setChangesNote(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-100"
            />
          </label>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="secondary"
              className="rounded-xl text-xs font-semibold"
              onClick={() => setRequestingChangesSupervisor(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-amber-600 text-xs font-bold text-white hover:bg-amber-700 shadow-2xs"
              onClick={handleSolicitarCambios}
              disabled={!changesNote.trim() || actionLoadingId === requestingChangesSupervisor?.supervisorEmpleadoId}
            >
              {actionLoadingId === requestingChangesSupervisor?.supervisorEmpleadoId
                ? 'Guardando...'
                : 'Enviar solicitud de cambios'}
            </Button>
          </div>
        </div>
      </ModalPanel>

      {/* Modal de Confirmación de Aprobación Masiva */}
      <ModalPanel
        open={isBulkApproveModalOpen}
        onClose={() => setIsBulkApproveModalOpen(false)}
        title="Aprobar todas las rutas enviadas del mes"
        subtitle={`Se autorizarán las planeaciones mensuales de los ${summary.enviadas} supervisores que ya las enviaron.`}
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Esta acción marcará como <strong>APROBADAS</strong> y <strong>PUBLICADAS</strong> las rutas de todos los supervisores que ya mandaron su planeación para <strong>{formatRouteCalendarMonth(normalizedMonth)}</strong>. Los supervisores que no han enviado ruta o tienen cambios solicitados no se verán afectados.
          </p>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="secondary"
              className="rounded-xl text-xs font-semibold"
              onClick={() => setIsBulkApproveModalOpen(false)}
              disabled={isBulkApproving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700 shadow-2xs"
              onClick={handleBulkApprove}
              disabled={isBulkApproving}
            >
              {isBulkApproving ? 'Aprobando en lote...' : `Confirmar aprobación de ${summary.enviadas} rutas`}
            </Button>
          </div>
        </div>
      </ModalPanel>
    </div>
  );
}
