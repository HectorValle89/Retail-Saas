import type { ActorActual } from '@/lib/auth/session';

export interface PdvsPanelFilters {
  month: string;
  search: string;
  cadenaId: string;
  ciudadId: string;
  estado: string;
  zona: string;
  supervisorId: string;
  estatus: string;
  publicacionEstado: string;
}

export function hasActivePdvsPanelFilters(filters: PdvsPanelFilters) {
  return [
    filters.search,
    filters.cadenaId,
    filters.ciudadId,
    filters.estado,
    filters.zona,
    filters.supervisorId,
    filters.estatus,
    filters.publicacionEstado,
  ].some((value) => value.length > 0);
}

function getCurrentMonthValue() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
}

function normalizeMonth(value: string | null | undefined) {
  return /^\d{4}-\d{2}$/.test(String(value ?? '').trim())
    ? String(value).trim()
    : getCurrentMonthValue();
}

export function formatMonthLabel(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    return 'Sin mes';
  }

  const [year, month] = normalized.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, 1));

  return new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function normalizePublicationState(value: string | null | undefined) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();
  if (
    normalized === 'ASIGNADO' ||
    normalized === 'PARCIAL' ||
    normalized === 'SIN_ASIGNACION' ||
    normalized === 'INACTIVO'
  ) {
    return normalized;
  }

  return '';
}

export function resolveDefaultPdvsPanelFilters(
  actor: Pick<ActorActual, 'empleadoId' | 'puesto'>,
  filters: PdvsPanelFilters
): PdvsPanelFilters {
  if (hasActivePdvsPanelFilters(filters)) {
    return filters;
  }

  if (actor.puesto === 'SUPERVISOR') {
    return {
      ...filters,
      supervisorId: actor.empleadoId,
    };
  }

  return filters;
}

export function normalizePdvsPanelFilters(filters?: Partial<PdvsPanelFilters>): PdvsPanelFilters {
  return {
    month: normalizeMonth(filters?.month),
    search: typeof filters?.search === 'string' ? filters.search.trim() : '',
    cadenaId:
      typeof filters?.cadenaId === 'string' && filters.cadenaId !== 'ALL'
        ? filters.cadenaId.trim()
        : '',
    ciudadId:
      typeof filters?.ciudadId === 'string' && filters.ciudadId !== 'ALL'
        ? filters.ciudadId.trim()
        : '',
    estado:
      typeof filters?.estado === 'string' && filters.estado !== 'ALL' ? filters.estado.trim() : '',
    zona: typeof filters?.zona === 'string' && filters.zona !== 'ALL' ? filters.zona.trim() : '',
    supervisorId:
      typeof filters?.supervisorId === 'string' && filters.supervisorId !== 'ALL'
        ? filters.supervisorId.trim()
        : '',
    estatus:
      typeof filters?.estatus === 'string' && filters.estatus !== 'ALL'
        ? filters.estatus.trim()
        : '',
    publicacionEstado:
      typeof filters?.publicacionEstado === 'string' && filters.publicacionEstado !== 'ALL'
        ? normalizePublicationState(filters.publicacionEstado)
        : '',
  };
}
