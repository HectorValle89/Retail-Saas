import type { PdvListadoItem } from '../services/pdvService';

export type PdvMapStatusFilter = 'ALL' | 'ACTIVO' | 'INACTIVO';
export type PdvMapCoverageFilter = 'ALL' | 'CON_DC' | 'VACANTE';
export type PdvMapTerritoryScope = 'ALL' | 'CDMX' | 'FORANEO';

export interface PdvMapFilterOptions {
  territoryScope: PdvMapTerritoryScope;
  cdmxSupervisorIds: Set<string>;
  selectedSupervisorIds: Set<string>;
  statusFilter: PdvMapStatusFilter;
  coverageFilter: PdvMapCoverageFilter;
}

/**
 * Filtra los PDVs para su visualización y conteo en el Mapa Operacional de Supervisión.
 */
export function filterPdvsForOperationalMap(
  pdvs: PdvListadoItem[],
  options: PdvMapFilterOptions
): PdvListadoItem[] {
  return pdvs.filter((pdv) => {
    // 1. Debe tener geolocalización y geocerca completa
    if (pdv.latitud === null || pdv.longitud === null || !pdv.geocercaCompleta) {
      return false;
    }

    // 2. Filtro de territorio (CDMX vs Foráneo)
    if (options.territoryScope === 'CDMX') {
      if (!pdv.supervisorActualId || !options.cdmxSupervisorIds.has(pdv.supervisorActualId)) {
        return false;
      }
    } else if (options.territoryScope === 'FORANEO') {
      if (pdv.supervisorActualId && options.cdmxSupervisorIds.has(pdv.supervisorActualId)) {
        return false;
      }
    }

    // 3. Filtro de supervisores específicos (selección múltiple)
    const hasSpecificSupervisors =
      options.selectedSupervisorIds.size > 0 && !options.selectedSupervisorIds.has('ALL');

    if (hasSpecificSupervisors) {
      const matchUnassigned =
        options.selectedSupervisorIds.has('UNASSIGNED') && !pdv.supervisorActualId;
      const matchSupervisor =
        Boolean(pdv.supervisorActualId && options.selectedSupervisorIds.has(pdv.supervisorActualId));

      if (!matchUnassigned && !matchSupervisor) {
        return false;
      }
    }

    // 4. Filtro por estatus de tienda (Activos vs Inactivos)
    if (options.statusFilter === 'ACTIVO') {
      if (pdv.estatus !== 'ACTIVO' && pdv.estatus !== 'TEMPORAL') {
        return false;
      }
    } else if (options.statusFilter === 'INACTIVO') {
      if (pdv.estatus !== 'INACTIVO') {
        return false;
      }
    }

    // 5. Filtro por asignación de DC (Con DC asignada vs Vacantes)
    if (options.coverageFilter === 'CON_DC') {
      const hasDc =
        pdv.publicacionMensualDiasAsignados > 0 ||
        pdv.publicacionMensualEstado === 'ASIGNADO' ||
        pdv.publicacionMensualEstado === 'PARCIAL';
      if (!hasDc) {
        return false;
      }
    } else if (options.coverageFilter === 'VACANTE') {
      const isVacant =
        pdv.publicacionMensualDiasAsignados === 0 ||
        pdv.publicacionMensualEstado === 'SIN_ASIGNACION';
      if (!isVacant) {
        return false;
      }
    }

    return true;
  });
}
