'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MexicoMap, type MexicoMapPoint } from '@/components/maps/MexicoMap';
import { Card } from '@/components/ui/card';
import type { PdvListadoItem, PdvSupervisorOption } from '../services/pdvService';
import {
  UNASSIGNED_SUPERVISOR_COLOR,
  getCdmxSupervisorMeta,
  getSupervisorColor,
  isCdmxSupervisor,
} from '../lib/supervisorColors';
import {
  filterPdvsForOperationalMap,
  type PdvMapCoverageFilter,
  type PdvMapStatusFilter,
  type PdvMapTerritoryScope,
} from '../lib/pdvMapFilters';
import { formatMonthLabel } from '../lib/pdvPanelFilters';
import { reasignarSupervisoresMasivoDesdeMapa } from '../actions';

interface PdvsOperationalMapTabProps {
  pdvs: PdvListadoItem[];
  supervisores: PdvSupervisorOption[];
  selectedPdvId: string | null;
  onSelectPdv: (pdvId: string) => void;
  onOpenDetail: (pdvId: string) => void;
  canEdit?: boolean;
  month?: string;
  onMonthChange?: (newMonth: string) => void;
  isNavigatingMonth?: boolean;
}

function getDefaultEffectiveDate(currentMonth?: string): string {
  if (currentMonth && /^\d{4}-\d{2}$/.test(currentMonth)) {
    return `${currentMonth}-01`;
  }
  const now = new Date();
  // Si estamos a partir del día 20 del mes, sugerir por defecto el 1º del mes siguiente
  if (now.getDate() >= 20) {
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const y = nextMonth.getFullYear();
    const m = String(nextMonth.getMonth() + 1).padStart(2, '0');
    const d = String(nextMonth.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function PdvsOperationalMapTab({
  pdvs,
  supervisores,
  selectedPdvId,
  onSelectPdv,
  onOpenDetail,
  canEdit = false,
  month,
  onMonthChange,
  isNavigatingMonth = false,
}: PdvsOperationalMapTabProps) {
  const router = useRouter();

  // Filtros operativos
  const [selectedSupervisorIds, setSelectedSupervisorIds] = useState<Set<string>>(
    () => new Set(['ALL'])
  );
  const [territoryScope, setTerritoryScope] = useState<PdvMapTerritoryScope>('ALL');
  const [statusFilter, setStatusFilter] = useState<PdvMapStatusFilter>('ALL');
  const [coverageFilter, setCoverageFilter] = useState<PdvMapCoverageFilter>('ALL');
  const [supervisorSearch, setSupervisorSearch] = useState<string>('');
  const [showCoverageCircles, setShowCoverageCircles] = useState<boolean>(false);

  // Ergonomía del mapa: Sidebar colapsable y Modo Pantalla Completa
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  // Modo Asignación Directa y Masiva desde el Mapa
  const [isBatchSelectionMode, setIsBatchSelectionMode] = useState<boolean>(false);
  const [selectedMapPdvIds, setSelectedMapPdvIds] = useState<Set<string>>(() => new Set());
  const [batchTargetSupervisorId, setBatchTargetSupervisorId] = useState<string>('');
  const [individualTargetSupervisorId, setIndividualTargetSupervisorId] = useState<string>('');
  const [batchEffectiveDate, setBatchEffectiveDate] = useState<string>(() =>
    getDefaultEffectiveDate(month)
  );
  const [individualEffectiveDate, setIndividualEffectiveDate] = useState<string>(() =>
    getDefaultEffectiveDate(month)
  );
  const [isAssigning, setIsAssigning] = useState<boolean>(false);
  const [assignmentFeedback, setAssignmentFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (month) {
      setBatchEffectiveDate(getDefaultEffectiveDate(month));
      setIndividualEffectiveDate(getDefaultEffectiveDate(month));
    }
  }, [month]);

  // Estado optimista en memoria para refresco visual instantáneo en mapa
  const [optimisticPdvSupervisorMap, setOptimisticPdvSupervisorMap] = useState<
    Map<string, { supervisorId: string; supervisorNombre: string }>
  >(() => new Map());

  // Limpiar mensaje de feedback automáticamente
  useEffect(() => {
    if (!assignmentFeedback) return;
    const timer = setTimeout(() => {
      setAssignmentFeedback(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [assignmentFeedback]);

  // PDVs enriquecidos con cambios optimistas en memoria
  const enrichedGeocodedPdvs = useMemo(() => {
    return pdvs
      .filter((item) => item.latitud !== null && item.longitud !== null && item.geocercaCompleta)
      .map((pdv) => {
        const override = optimisticPdvSupervisorMap.get(pdv.id);
        if (!override) return pdv;
        return {
          ...pdv,
          supervisorActualId: override.supervisorId,
          supervisorActual: override.supervisorNombre,
        };
      });
  }, [pdvs, optimisticPdvSupervisorMap]);

  // Set de IDs de supervisores de CDMX
  const cdmxSupervisorIds = useMemo(() => {
    const set = new Set<string>();
    supervisores.forEach((s) => {
      if (isCdmxSupervisor(s.id, s.nombreCompleto)) {
        set.add(s.id);
      }
    });
    return set;
  }, [supervisores]);

  // Agrupación de tiendas por supervisor (considerando cambios optimistas)
  const supervisorStats = useMemo(() => {
    const counts = new Map<string, number>();
    let unassignedCount = 0;

    enrichedGeocodedPdvs.forEach((pdv) => {
      if (pdv.supervisorActualId) {
        counts.set(pdv.supervisorActualId, (counts.get(pdv.supervisorActualId) ?? 0) + 1);
      } else {
        unassignedCount++;
      }
    });

    return { counts, unassignedCount };
  }, [enrichedGeocodedPdvs]);

  // Lista de supervisores enriquecida con color, metadatos CDMX y conteo de tiendas
  const supervisorItems = useMemo(() => {
    return supervisores
      .map((supervisor) => {
        const count = supervisorStats.counts.get(supervisor.id) ?? 0;
        const color = getSupervisorColor(supervisor.id, supervisores);
        const isCdmx = isCdmxSupervisor(supervisor.id, supervisor.nombreCompleto);
        const cdmxMeta = getCdmxSupervisorMeta(supervisor.id, supervisor.nombreCompleto);
        return {
          ...supervisor,
          count,
          color,
          isCdmx,
          cdmxMeta,
        };
      })
      .filter((s) => {
        if (territoryScope === 'CDMX' && !s.isCdmx) return false;
        if (territoryScope === 'FORANEO' && s.isCdmx) return false;
        if (!supervisorSearch.trim()) return true;
        const term = supervisorSearch.toLowerCase();
        return (
          s.nombreCompleto.toLowerCase().includes(term) ||
          (s.zona && s.zona.toLowerCase().includes(term)) ||
          (s.cdmxMeta?.zona && s.cdmxMeta.zona.toLowerCase().includes(term)) ||
          (s.cdmxMeta?.label && s.cdmxMeta.label.toLowerCase().includes(term))
        );
      })
      .sort((a, b) => {
        if (territoryScope === 'ALL' && a.isCdmx !== b.isCdmx) {
          return a.isCdmx ? -1 : 1;
        }
        return b.count - a.count || a.nombreCompleto.localeCompare(b.nombreCompleto, 'es-MX');
      });
  }, [supervisores, supervisorStats.counts, supervisorSearch, territoryScope]);

  const isAllSupervisors =
    selectedSupervisorIds.has('ALL') || selectedSupervisorIds.size === 0;

  // Manejadores de selección de supervisores
  const handleToggleSupervisor = (supervisorId: string) => {
    setSelectedSupervisorIds((prev) => {
      const next = new Set(prev);
      if (next.has('ALL')) {
        next.clear();
        next.add(supervisorId);
        return next;
      }

      if (next.has(supervisorId)) {
        next.delete(supervisorId);
        if (next.size === 0) {
          next.add('ALL');
        }
      } else {
        next.add(supervisorId);
      }
      return next;
    });
  };

  const handleSelectOnlySupervisor = (supervisorId: string) => {
    setSelectedSupervisorIds(new Set([supervisorId]));
  };

  const handleSelectAllSupervisors = () => {
    setSelectedSupervisorIds(new Set(['ALL']));
  };

  // PDVs visibles en el mapa calculados con el helper de filtrado unificado
  const visiblePdvs = useMemo(() => {
    return filterPdvsForOperationalMap(enrichedGeocodedPdvs, {
      territoryScope,
      cdmxSupervisorIds,
      selectedSupervisorIds,
      statusFilter,
      coverageFilter,
    });
  }, [
    enrichedGeocodedPdvs,
    territoryScope,
    cdmxSupervisorIds,
    selectedSupervisorIds,
    statusFilter,
    coverageFilter,
  ]);

  // PDVs filtrados solo por territorio y supervisores para calcular contadores en tiempo real
  const pdvsInScope = useMemo(() => {
    return filterPdvsForOperationalMap(enrichedGeocodedPdvs, {
      territoryScope,
      cdmxSupervisorIds,
      selectedSupervisorIds,
      statusFilter: 'ALL',
      coverageFilter: 'ALL',
    });
  }, [enrichedGeocodedPdvs, territoryScope, cdmxSupervisorIds, selectedSupervisorIds]);

  const countsInScope = useMemo(() => {
    const total = pdvsInScope.length;
    let activos = 0;
    let inactivos = 0;
    let conDc = 0;
    let vacantes = 0;

    pdvsInScope.forEach((p) => {
      if (p.estatus === 'INACTIVO') {
        inactivos++;
      } else {
        activos++;
      }

      const hasDc =
        p.publicacionMensualDiasAsignados > 0 ||
        p.publicacionMensualEstado === 'ASIGNADO' ||
        p.publicacionMensualEstado === 'PARCIAL';

      if (hasDc) {
        conDc++;
      } else {
        vacantes++;
      }
    });

    return { total, activos, inactivos, conDc, vacantes };
  }, [pdvsInScope]);

  // Puntos para Leaflet con colores por supervisor, casas y detalles operativos
  const mapPoints: MexicoMapPoint[] = useMemo(() => {
    const pdvPoints: MexicoMapPoint[] = visiblePdvs.map((pdv) => {
      const color = getSupervisorColor(pdv.supervisorActualId, supervisores);
      const isInactive = pdv.estatus === 'INACTIVO';
      const hasDc =
        pdv.publicacionMensualDiasAsignados > 0 ||
        pdv.publicacionMensualEstado === 'ASIGNADO' ||
        pdv.publicacionMensualEstado === 'PARCIAL';

      const dcDetail = hasDc
        ? `DC: ${pdv.publicacionMensualDiasAsignados}d (${pdv.publicacionMensualCoberturaPct}%)`
        : '⚠️ Vacante (Sin DC)';

      return {
        id: pdv.id,
        lat: pdv.latitud ?? 0,
        lng: pdv.longitud ?? 0,
        title: isInactive ? `⚠️ [INACTIVO] ${pdv.nombre}` : pdv.nombre,
        subtitle: `${pdv.claveBtl} · ${pdv.cadena ?? 'Sin cadena'} · ${pdv.ciudad ?? 'Sin ciudad'}${
          isInactive ? ' · (Tienda Inactiva)' : ''
        }`,
        detail: `Supervisor: ${pdv.supervisorActual ?? 'Sin supervisor'} · ${dcDetail}${
          isInactive ? ' · Estatus: ⚠️ INACTIVO' : ''
        }`,
        customColor: color,
        radiusMeters: pdv.radioMetros,
        isInactive,
      };
    });

    const housePoints: MexicoMapPoint[] = [];
    const activeSupervisorsForHouses = isAllSupervisors
      ? supervisorItems
      : supervisorItems.filter((s) => selectedSupervisorIds.has(s.id));

    activeSupervisorsForHouses.forEach((sup) => {
      if (
        typeof sup.latitudDomicilio === 'number' &&
        typeof sup.longitudDomicilio === 'number' &&
        Number.isFinite(sup.latitudDomicilio) &&
        Number.isFinite(sup.longitudDomicilio)
      ) {
        housePoints.push({
          id: `supervisor-house-${sup.id}`,
          lat: sup.latitudDomicilio,
          lng: sup.longitudDomicilio,
          title: `Casa de ${sup.nombreCompleto}`,
          subtitle: `Supervisor ${sup.zona ? `· Zona ${sup.zona}` : ''}`,
          detail: sup.domicilioCompleto
            ? `${sup.domicilioCompleto} (${sup.count} tiendas asignadas)`
            : `Domicilio del supervisor (${sup.count} tiendas asignadas)`,
          customColor: sup.color,
          iconType: 'house',
        });
      }
    });

    return [...pdvPoints, ...housePoints];
  }, [visiblePdvs, supervisores, isAllSupervisors, selectedSupervisorIds, supervisorItems]);

  const activePdv = useMemo(() => {
    return enrichedGeocodedPdvs.find((p) => p.id === selectedPdvId) ?? null;
  }, [enrichedGeocodedPdvs, selectedPdvId]);

  // Inicializar el selector de supervisor individual cuando cambia el PDV activo
  useEffect(() => {
    if (activePdv) {
      setIndividualTargetSupervisorId(activePdv.supervisorActualId ?? '');
    }
  }, [activePdv]);

  const activeSupervisorName = useMemo(() => {
    if (isAllSupervisors) {
      if (territoryScope === 'CDMX') return 'Ciudad de México y Área Metro (8 Supervisores)';
      if (territoryScope === 'FORANEO') return 'Supervisores Foráneos';
      return 'Todos los supervisores';
    }

    const count = selectedSupervisorIds.size;
    if (count === 1) {
      const [id] = Array.from(selectedSupervisorIds);
      if (id === 'UNASSIGNED') return 'Tiendas sin supervisor';
      const found = supervisores.find((s) => s.id === id);
      return found ? found.nombreCompleto : 'Supervisor seleccionado';
    }

    const names = Array.from(selectedSupervisorIds)
      .map((id) => {
        if (id === 'UNASSIGNED') return 'Sin supervisor';
        return supervisores.find((s) => s.id === id)?.nombreCompleto ?? id;
      })
      .slice(0, 2)
      .join(', ');

    return `${names}${count > 2 ? ` y ${count - 2} más` : ''} (${count} supervisores seleccionados)`;
  }, [isAllSupervisors, territoryScope, selectedSupervisorIds, supervisores]);

  const hasAnyFilterActive =
    !isAllSupervisors ||
    territoryScope !== 'ALL' ||
    statusFilter !== 'ALL' ||
    coverageFilter !== 'ALL';

  const resetAllFilters = () => {
    setSelectedSupervisorIds(new Set(['ALL']));
    setTerritoryScope('ALL');
    setStatusFilter('ALL');
    setCoverageFilter('ALL');
    setSupervisorSearch('');
  };

  // Alternar selección de un pin en modo lote
  const toggleMapPdvSelection = (pdvId: string) => {
    setSelectedMapPdvIds((prev) => {
      const next = new Set(prev);
      if (next.has(pdvId)) {
        next.delete(pdvId);
      } else {
        next.add(pdvId);
      }
      return next;
    });
  };

  // Ejecutar asignación de supervisor (individual o masiva) con cascada completa aguas arriba y aguas abajo
  const executeReassignment = async (
    pdvIdsToAssign: string[],
    targetSupervisorId: string,
    fechaEfectiva?: string
  ) => {
    if (pdvIdsToAssign.length === 0) {
      setAssignmentFeedback({ type: 'error', message: 'No hay tiendas seleccionadas.' });
      return;
    }
    if (!targetSupervisorId) {
      setAssignmentFeedback({ type: 'error', message: 'Selecciona un supervisor destino.' });
      return;
    }

    const targetSupervisor = supervisores.find((s) => s.id === targetSupervisorId);
    if (!targetSupervisor) {
      setAssignmentFeedback({ type: 'error', message: 'Supervisor inválido.' });
      return;
    }

    const dateToUse = fechaEfectiva || batchEffectiveDate;

    setIsAssigning(true);
    try {
      const result = await reasignarSupervisoresMasivoDesdeMapa({
        pdvIds: pdvIdsToAssign,
        nuevoSupervisorId: targetSupervisorId,
        fechaEfectiva: dateToUse,
      });

      if (!result.ok) {
        setAssignmentFeedback({ type: 'error', message: result.message });
        return;
      }

      // Actualizar mapa optimista en memoria para que los colores cambien de inmediato
      setOptimisticPdvSupervisorMap((prev) => {
        const next = new Map(prev);
        pdvIdsToAssign.forEach((id) => {
          next.set(id, {
            supervisorId: targetSupervisorId,
            supervisorNombre: targetSupervisor.nombreCompleto,
          });
        });
        return next;
      });

      // Limpiar selección masiva si aplica
      setSelectedMapPdvIds(new Set());
      setBatchTargetSupervisorId('');
      setAssignmentFeedback({
        type: 'success',
        message: result.message,
      });

      // Sincronizar en segundo plano con el servidor
      router.refresh();
    } catch (err) {
      setAssignmentFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al reasignar tiendas.',
      });
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div
      className={
        isMaximized
          ? 'fixed inset-0 z-50 flex flex-col bg-slate-900/40 p-2 sm:p-4 backdrop-blur-xs'
          : 'space-y-4'
      }
    >
      {/* Notificación flotante de feedback */}
      {assignmentFeedback && (
        <div
          className={`fixed top-6 right-6 z-2000 flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-bold shadow-2xl transition animate-in fade-in slide-in-from-top-4 ${
            assignmentFeedback.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
              : 'border-rose-300 bg-rose-50 text-rose-950'
          }`}
        >
          <span>{assignmentFeedback.type === 'success' ? '✅' : '❌'}</span>
          <span>{assignmentFeedback.message}</span>
          <button
            type="button"
            onClick={() => setAssignmentFeedback(null)}
            className="ml-2 text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
      )}

      <div
        className={
          isMaximized
            ? 'flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl'
            : 'space-y-4'
        }
      >
        {/* Barra superior de contexto, resumen y controles de pantalla */}
        <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-950 sm:text-lg">
                Mapa Operacional de Territorios y Supervisión
              </h2>
              {isMaximized && (
                <span className="rounded-lg bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800">
                  ⛶ Pantalla Completa
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Audita rutas, reasigna tiendas tocando los pines en el mapa y filtra por estatus y vacantes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Selector de Mes de Operación Integrado */}
            <div className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/90 px-2.5 py-1 text-xs font-semibold text-indigo-950 shadow-xs">
              <span className="text-sm">📅</span>
              <span className="hidden sm:inline font-bold text-indigo-900">Mes:</span>
              <input
                type="month"
                value={month || ''}
                disabled={isNavigatingMonth}
                onChange={(e) => {
                  if (e.target.value) onMonthChange?.(e.target.value);
                }}
                className="rounded-lg border border-indigo-300 bg-white px-2 py-0.5 text-xs font-bold text-indigo-950 shadow-2xs focus:border-indigo-600 focus:outline-hidden disabled:opacity-50 cursor-pointer"
                title="Cambiar mes de operación del mapa"
              />
              {isNavigatingMonth && (
                <span className="animate-spin text-xs text-indigo-600">⏳</span>
              )}
            </div>

            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-700">
              📍 <strong className="text-slate-900">{visiblePdvs.length}</strong> de {enrichedGeocodedPdvs.length} tiendas
            </span>

            {countsInScope.inactivos > 0 && (
              <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 font-medium text-amber-800">
                ⚠️ <strong className="text-amber-950">{countsInScope.inactivos}</strong> inactivas
              </span>
            )}

            {/* Botón de Modo Selección en Mapa */}
            <button
              type="button"
              onClick={() => {
                setIsBatchSelectionMode((prev) => {
                  const next = !prev;
                  if (!next) setSelectedMapPdvIds(new Set());
                  return next;
                });
                onSelectPdv('');
              }}
              className={`rounded-xl border px-3.5 py-1.5 font-bold transition shadow-xs inline-flex items-center gap-1.5 ${
                isBatchSelectionMode
                  ? 'border-sky-600 bg-sky-600 text-white shadow-md'
                  : 'border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100'
              }`}
              title={
                isBatchSelectionMode
                  ? 'Salir del modo selección'
                  : 'Toca los pines en el mapa para seleccionarlos y reasignarlos en lote'
              }
            >
              <span>{isBatchSelectionMode ? '✓' : '📌'}</span>
              <span>
                {isBatchSelectionMode
                  ? `Modo Selección (${selectedMapPdvIds.size})`
                  : 'Seleccionar pines en mapa'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowCoverageCircles((prev) => !prev)}
              className={`rounded-xl border px-3 py-1.5 font-semibold transition ${
                showCoverageCircles
                  ? 'border-sky-300 bg-sky-50 text-sky-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {showCoverageCircles ? 'Geocercas: Visibles' : 'Geocercas: Ocultas'}
            </button>

            {/* Botón para alternar visibilidad del panel lateral de supervisores */}
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
              title={isSidebarCollapsed ? 'Mostrar lista de supervisores' : 'Ocultar lista para agrandar mapa'}
            >
              {isSidebarCollapsed ? '👥 Mostrar panel lateral' : '◀ Ocultar panel lateral'}
            </button>

            {/* Botón para Modo Pantalla Completa */}
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              className={`rounded-xl border px-3 py-1.5 font-semibold transition shadow-xs ${
                isMaximized
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100'
              }`}
            >
              {isMaximized ? '✕ Salir pantalla completa' : '⛶ Pantalla completa'}
            </button>
          </div>
        </div>

        {/* Barra de Filtros Operativos Rápidos: Mes de Operación, Estatus (Activos/Inactivos) y DC (Con DC/Vacantes) */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-white p-3 shadow-xs">
          <div className="flex flex-wrap items-center gap-4">
            {/* Filtro Rápido por Mes de Operación */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Mes operación:
              </span>
              <div className="inline-flex rounded-xl bg-slate-100 p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => onMonthChange?.('2026-09')}
                  disabled={isNavigatingMonth}
                  className={`rounded-lg px-2.5 py-1 transition ${
                    month === '2026-09'
                      ? 'bg-indigo-600 font-bold text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Ver mapa con asignaciones de septiembre de 2026"
                >
                  Septiembre 2026
                </button>
                <button
                  type="button"
                  onClick={() => onMonthChange?.('2026-10')}
                  disabled={isNavigatingMonth}
                  className={`rounded-lg px-2.5 py-1 transition ${
                    month === '2026-10'
                      ? 'bg-indigo-600 font-bold text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Ver mapa con asignaciones de octubre de 2026"
                >
                  Octubre 2026
                </button>
                {month && month !== '2026-09' && month !== '2026-10' && (
                  <span className="rounded-lg bg-indigo-600 px-2.5 py-1 font-bold text-white shadow-xs capitalize">
                    {formatMonthLabel(month)}
                  </span>
                )}
              </div>
            </div>

            {/* Filtro por Estatus de Tienda */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Estatus:
              </span>
              <div className="inline-flex rounded-xl bg-slate-100 p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`rounded-lg px-2.5 py-1 transition ${
                    statusFilter === 'ALL'
                      ? 'bg-white font-bold text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todos ({countsInScope.total})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ACTIVO')}
                  className={`rounded-lg px-2.5 py-1 transition ${
                    statusFilter === 'ACTIVO'
                      ? 'bg-emerald-600 font-bold text-white shadow-xs'
                      : 'text-emerald-800 hover:text-emerald-950'
                  }`}
                >
                  🟢 Activos ({countsInScope.activos})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('INACTIVO')}
                  className={`rounded-lg px-2.5 py-1 transition ${
                    statusFilter === 'INACTIVO'
                      ? 'bg-amber-600 font-bold text-white shadow-xs'
                      : 'text-amber-800 hover:text-amber-950'
                  }`}
                >
                  ⚠️ Inactivos ({countsInScope.inactivos})
                </button>
              </div>
            </div>

            {/* Filtro por Asignación de Dermoconsejera (DC) */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Dermoconsejera:
              </span>
              <div className="inline-flex rounded-xl bg-slate-100 p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setCoverageFilter('ALL')}
                  className={`rounded-lg px-2.5 py-1 transition ${
                    coverageFilter === 'ALL'
                      ? 'bg-white font-bold text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todas ({countsInScope.total})
                </button>
                <button
                  type="button"
                  onClick={() => setCoverageFilter('CON_DC')}
                  className={`rounded-lg px-2.5 py-1 transition ${
                    coverageFilter === 'CON_DC'
                      ? 'bg-sky-600 font-bold text-white shadow-xs'
                      : 'text-sky-800 hover:text-sky-950'
                  }`}
                >
                  👤 Con DC ({countsInScope.conDc})
                </button>
                <button
                  type="button"
                  onClick={() => setCoverageFilter('VACANTE')}
                  className={`rounded-lg px-2.5 py-1 transition ${
                    coverageFilter === 'VACANTE'
                      ? 'bg-rose-600 font-bold text-white shadow-xs'
                      : 'text-rose-800 hover:text-rose-950'
                  }`}
                >
                  📋 Vacantes ({countsInScope.vacantes})
                </button>
              </div>
            </div>
          </div>

          {/* Reset rápido de filtros si hay alguno activo */}
          {hasAnyFilterActive && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50 transition"
            >
              <span>🔄</span>
              <span>Restablecer todos los filtros</span>
            </button>
          )}
        </div>

        {/* Cuadrícula principal: Panel de supervisores (izquierda) + Mapa grande (derecha) */}
        <div
          className={`grid gap-4 ${
            isSidebarCollapsed
              ? 'grid-cols-1'
              : 'lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]'
          } ${isMaximized ? 'flex-1 min-h-0' : ''}`}
        >
          {/* Panel lateral de selección y auditoría de supervisores */}
          {!isSidebarCollapsed && (
            <Card
              className={`flex flex-col overflow-hidden p-0 ${
                isMaximized ? 'h-full min-h-[500px]' : 'h-[800px] lg:h-[840px]'
              }`}
            >
              <div className="border-b border-slate-100 bg-slate-50/70 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Supervisores ({supervisorItems.length})
                    </span>
                    {month && (
                      <span className="rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-900 capitalize">
                        {formatMonthLabel(month)}
                      </span>
                    )}
                    {!isAllSupervisors && (
                      <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                        {selectedSupervisorIds.size} elegidos
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleSelectAllSupervisors}
                    className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${
                      isAllSupervisors && territoryScope === 'ALL'
                        ? 'bg-slate-900 text-white'
                        : 'text-sky-700 hover:bg-sky-50'
                    }`}
                  >
                    Ver todos
                  </button>
                </div>

                {/* Selector de territorio: Todos / CDMX (8) / Foráneos */}
                <div className="mt-2.5 flex rounded-xl bg-slate-200/80 p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => {
                      setTerritoryScope('ALL');
                      handleSelectAllSupervisors();
                    }}
                    className={`flex-1 rounded-[10px] py-1 text-center transition ${
                      territoryScope === 'ALL'
                        ? 'bg-white text-slate-950 font-bold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todos ({enrichedGeocodedPdvs.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTerritoryScope('CDMX');
                      handleSelectAllSupervisors();
                    }}
                    className={`flex-1 rounded-[10px] py-1 text-center transition ${
                      territoryScope === 'CDMX'
                        ? 'bg-sky-600 text-white font-bold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🏙️ CDMX (8)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTerritoryScope('FORANEO');
                      handleSelectAllSupervisors();
                    }}
                    className={`flex-1 rounded-[10px] py-1 text-center transition ${
                      territoryScope === 'FORANEO'
                        ? 'bg-white text-slate-950 font-bold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Foráneos
                  </button>
                </div>

                <div className="mt-2">
                  <input
                    type="text"
                    placeholder="Filtrar supervisor, zona o color..."
                    value={supervisorSearch}
                    onChange={(e) => setSupervisorSearch(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex-1 space-y-1 overflow-y-auto p-2.5">
                {/* Opción global: Todos los supervisores de la selección actual */}
                <button
                  type="button"
                  onClick={handleSelectAllSupervisors}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition ${
                    isAllSupervisors
                      ? 'bg-slate-900 text-white shadow-xs font-semibold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 via-rose-500 to-sky-500 text-[10px] text-white">
                      ★
                    </span>
                    <span>
                      {territoryScope === 'CDMX'
                        ? 'Todos en CDMX (8)'
                        : territoryScope === 'FORANEO'
                        ? 'Todos los foráneos'
                        : 'Todos los territorios'}
                    </span>
                  </div>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                      isAllSupervisors
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {countsInScope.total}
                  </span>
                </button>

                {/* Opción de tiendas sin supervisor */}
                {territoryScope !== 'CDMX' && supervisorStats.unassignedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleToggleSupervisor('UNASSIGNED')}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition ${
                      !isAllSupervisors && selectedSupervisorIds.has('UNASSIGNED')
                        ? 'bg-rose-600 text-white shadow-xs font-semibold'
                        : 'text-rose-700 hover:bg-rose-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={!isAllSupervisors && selectedSupervisorIds.has('UNASSIGNED')}
                        onChange={() => {}}
                        className="h-3.5 w-3.5 rounded border-rose-300 text-rose-600 pointer-events-none"
                      />
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border border-white"
                        style={{ backgroundColor: UNASSIGNED_SUPERVISOR_COLOR }}
                      />
                      <span>⚠️ Sin supervisor asignado</span>
                    </div>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                        !isAllSupervisors && selectedSupervisorIds.has('UNASSIGNED')
                          ? 'bg-white/20 text-white'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {supervisorStats.unassignedCount}
                    </span>
                  </button>
                )}

                {/* Lista individual de supervisores con checkbox para selección múltiple */}
                {supervisorItems.map((sup) => {
                  const isChecked = !isAllSupervisors && selectedSupervisorIds.has(sup.id);

                  return (
                    <div
                      key={sup.id}
                      className={`group flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition ${
                        isChecked
                          ? 'bg-slate-900 text-white shadow-xs font-semibold'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSupervisor(sup.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-sky-600 pointer-events-none"
                        />
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white shadow-xs"
                          style={{ backgroundColor: sup.color }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{sup.nombreCompleto}</p>
                          {sup.cdmxMeta ? (
                            <div className="flex items-center gap-1.5 truncate text-[10px]">
                              <span
                                className="font-semibold"
                                style={{ color: isChecked ? '#ffffff' : sup.color }}
                              >
                                {sup.cdmxMeta.label}
                              </span>
                              <span className={isChecked ? 'text-slate-300' : 'text-slate-400'}>
                                · {sup.cdmxMeta.zona}
                              </span>
                            </div>
                          ) : sup.zona ? (
                            <p
                              className={`truncate text-[10px] ${
                                isChecked ? 'text-slate-300' : 'text-slate-400'
                              }`}
                            >
                              {sup.zona}
                            </p>
                          ) : null}
                        </div>
                      </button>

                      <div className="ml-2 flex shrink-0 items-center gap-1">
                        {/* Botón rápido "Solo" para enfocar a un solo supervisor con 1 clic */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectOnlySupervisor(sup.id);
                          }}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold opacity-0 transition group-hover:opacity-100 ${
                            isChecked
                              ? 'bg-white/20 text-white hover:bg-white/30'
                              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                          }`}
                          title={`Ver únicamente a ${sup.nombreCompleto}`}
                        >
                          Solo
                        </button>

                        {typeof sup.latitudDomicilio === 'number' &&
                          typeof sup.longitudDomicilio === 'number' && (
                            <span title="Casa del supervisor visible en el mapa" className="text-xs">
                              🏠
                            </span>
                          )}

                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                            isChecked
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {sup.count}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Lienzo panorámico de Leaflet con mapa ampliado */}
          <div
            className={`relative flex flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xs ${
              isMaximized ? 'h-full min-h-[550px]' : 'h-[800px] lg:h-[840px]'
            }`}
          >
            {/* Barra de estado en vivo del mapa */}
            <div className="flex flex-wrap items-center justify-between border-b border-slate-100 bg-slate-50/90 px-4 py-2.5 text-xs gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{activeSupervisorName}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600">
                  {visiblePdvs.length} {visiblePdvs.length === 1 ? 'tienda visible' : 'tiendas visibles'}
                </span>
                {territoryScope === 'CDMX' && (
                  <span className="ml-2 hidden rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 sm:inline">
                    🎨 Paleta CDMX 8 tonos calibrada
                  </span>
                )}
                {statusFilter !== 'ALL' && (
                  <span className="rounded-md bg-slate-200 px-2 py-0.5 font-semibold text-slate-700">
                    Filtro: {statusFilter === 'ACTIVO' ? 'Solo Activos' : 'Solo Inactivos'}
                  </span>
                )}
                {coverageFilter !== 'ALL' && (
                  <span className="rounded-md bg-slate-200 px-2 py-0.5 font-semibold text-slate-700">
                    Filtro: {coverageFilter === 'CON_DC' ? 'Con DC Asignada' : 'Vacantes'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isBatchSelectionMode && (
                  <span className="rounded-lg bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-900">
                    📌 Modo selección activo: {selectedMapPdvIds.size} seleccionadas
                  </span>
                )}
                {hasAnyFilterActive && (
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="text-xs font-semibold text-sky-700 hover:underline"
                  >
                    Restablecer vista general
                  </button>
                )}
              </div>
            </div>

            <div className="relative flex-1">
              <MexicoMap
                points={mapPoints}
                selectedPointId={isBatchSelectionMode ? null : selectedPdvId}
                selectedPointIds={isBatchSelectionMode ? Array.from(selectedMapPdvIds) : undefined}
                onSelect={(pdvId) => {
                  if (isBatchSelectionMode) {
                    toggleMapPdvSelection(pdvId);
                  } else {
                    onSelectPdv(pdvId === selectedPdvId ? '' : pdvId);
                  }
                }}
                onDeselect={() => {
                  if (!isBatchSelectionMode) {
                    onSelectPdv('');
                  }
                }}
                showCoverageCircles={showCoverageCircles}
                heightClassName="h-full w-full"
              />

              {/* Botón flotante para restaurar panel lateral si fue colapsado */}
              {isSidebarCollapsed && (
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(false)}
                  className="absolute top-4 left-4 z-1000 inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white/95 px-3 py-2 text-xs font-bold text-slate-800 shadow-md backdrop-blur-xs hover:bg-slate-50 transition"
                >
                  <span>👥</span>
                  <span>Ver Supervisores {!isAllSupervisors ? `(${selectedSupervisorIds.size})` : ''}</span>
                </button>
              )}

              {/* Banner de instrucción en modo selección múltiple */}
              {isBatchSelectionMode && selectedMapPdvIds.size === 0 && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-1000 flex items-center gap-2 rounded-2xl border border-sky-300 bg-white/95 px-4 py-2 text-xs font-semibold text-sky-900 shadow-lg backdrop-blur-xs">
                  <span>💡</span>
                  <span>Haz clic sobre los pines en el mapa para seleccionarlos y asignarles un supervisor.</span>
                  <button
                    type="button"
                    onClick={() => setIsBatchSelectionMode(false)}
                    className="ml-2 text-slate-400 hover:text-slate-700"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* BARRA FLOTANTE DE ASIGNACIÓN MASIVA EN LOTE */}
              {isBatchSelectionMode && selectedMapPdvIds.size > 0 && (
                <div className="absolute bottom-6 left-4 right-4 z-1000 flex justify-center">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-300 bg-white/98 p-4 shadow-2xl backdrop-blur-md max-w-2xl w-full">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-600 text-sm font-bold text-white shadow-xs">
                        {selectedMapPdvIds.size}
                      </span>
                      <div className="text-xs">
                        <p className="font-bold text-slate-950">
                          {selectedMapPdvIds.size === 1
                            ? '1 tienda seleccionada en mapa'
                            : `${selectedMapPdvIds.size} tiendas seleccionadas en mapa`}
                        </p>
                        <p className="text-slate-500">Asignar supervisor destino con impacto en rutas y cuotas</p>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[280px]">
                      <select
                        value={batchTargetSupervisorId}
                        onChange={(e) => setBatchTargetSupervisorId(e.target.value)}
                        disabled={isAssigning}
                        className="flex-1 min-w-[170px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-sky-500 focus:outline-hidden"
                      >
                        <option value="">Selecciona supervisor destino...</option>
                        {supervisores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nombreCompleto} {s.zona ? `(${s.zona})` : ''}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 shadow-2xs">
                        <span className="text-[11px] font-bold text-slate-600 shrink-0">A partir de:</span>
                        <input
                          type="date"
                          value={batchEffectiveDate}
                          onChange={(e) => setBatchEffectiveDate(e.target.value)}
                          disabled={isAssigning}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs font-bold text-slate-900 focus:border-sky-500 focus:outline-hidden"
                          title="Fecha a partir de la cual entra en vigor la asignación"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={!batchTargetSupervisorId || isAssigning}
                        onClick={() =>
                          executeReassignment(
                            Array.from(selectedMapPdvIds),
                            batchTargetSupervisorId,
                            batchEffectiveDate
                          )
                        }
                        className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-slate-800 disabled:opacity-40 transition shrink-0"
                      >
                        {isAssigning ? 'Asignando...' : 'Asignar tiendas'}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedMapPdvIds(new Set())}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
                      >
                        Limpiar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsBatchSelectionMode(false);
                          setSelectedMapPdvIds(new Set());
                        }}
                        className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition"
                      >
                        ✕ Salir
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Ficha flotante inferior con detalle rápido y reasignación individual */}
              {!isBatchSelectionMode && activePdv && (
                <div className="absolute bottom-4 left-4 right-4 z-1000 sm:left-auto sm:right-4 sm:max-w-md">
                  <div className="rounded-[22px] border border-slate-200/90 bg-white/95 p-4 shadow-xl backdrop-blur-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full shrink-0 border border-white shadow-xs"
                            style={{
                              backgroundColor: getSupervisorColor(
                                activePdv.supervisorActualId,
                                supervisores
                              ),
                            }}
                          />
                          <p className="truncate text-sm font-bold text-slate-950">
                            {activePdv.nombre}
                          </p>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {activePdv.claveBtl} · {activePdv.cadena ?? 'Sin cadena'} · {activePdv.ciudad ?? 'Sin ciudad'}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                          {/* Estatus */}
                          <span
                            className={`rounded-md px-2 py-0.5 font-semibold ${
                              activePdv.estatus === 'INACTIVO'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {activePdv.estatus}
                          </span>

                          {/* Cobertura DC */}
                          <span
                            className={`rounded-md px-2 py-0.5 font-semibold ${
                              activePdv.publicacionMensualDiasAsignados > 0
                                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {activePdv.publicacionMensualDiasAsignados > 0
                              ? `👤 Con DC (${activePdv.publicacionMensualDiasAsignados}d)`
                              : '📋 Vacante / Sin DC'}
                          </span>

                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700 font-medium">
                            Supervisor {month ? `(${formatMonthLabel(month)})` : 'actual'}:{' '}
                            <strong className="text-slate-900 font-semibold">{activePdv.supervisorActual ?? 'Sin supervisor'}</strong>
                          </span>
                          {activePdv.zona && (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">
                              Zona: {activePdv.zona}
                            </span>
                          )}
                        </div>

                        {/* Asignación Directa de Supervisor desde el Pin */}
                        {canEdit && (
                          <div className="mt-3 border-t border-slate-100 pt-2.5">
                            <span className="text-[11px] font-bold text-slate-700">
                              Reasignar supervisor a esta tienda:
                            </span>
                            <div className="mt-1.5 flex flex-col gap-2">
                              <select
                                value={individualTargetSupervisorId}
                                onChange={(e) => setIndividualTargetSupervisorId(e.target.value)}
                                disabled={isAssigning}
                                className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-sky-500 focus:outline-hidden"
                              >
                                <option value="">Seleccionar supervisor...</option>
                                {supervisores.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.nombreCompleto} {s.zona ? `(${s.zona})` : ''}
                                  </option>
                                ))}
                              </select>

                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-slate-500 shrink-0">A partir de:</span>
                                  <input
                                    type="date"
                                    value={individualEffectiveDate}
                                    onChange={(e) => setIndividualEffectiveDate(e.target.value)}
                                    disabled={isAssigning}
                                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-sky-500 focus:outline-hidden"
                                  />
                                </div>
                                <button
                                  type="button"
                                  disabled={
                                    !individualTargetSupervisorId ||
                                    isAssigning
                                  }
                                  onClick={() =>
                                    executeReassignment(
                                      [activePdv.id],
                                      individualTargetSupervisorId,
                                      individualEffectiveDate
                                    )
                                  }
                                  className="rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-sky-700 disabled:opacity-40 transition shrink-0"
                                >
                                  {isAssigning ? '...' : 'Guardar'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onSelectPdv('')}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                          title="Cerrar detalle"
                          aria-label="Cerrar detalle"
                        >
                          ✕
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenDetail(activePdv.id)}
                          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition"
                        >
                          Ver Ficha
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
