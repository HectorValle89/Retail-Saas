import type { PlaneacionMensualOperacion } from '@/features/asignaciones/types/planeacionMensual';

export const OPEN_ENDED_MATERIALIZATION_MONTHS = 4;

export function addPlaneacionUtcDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getOpenEndedPlaneacionMaterializationEnd(dateIso: string) {
  const date = new Date(`${monthStartFromDate(dateIso)}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + OPEN_ENDED_MATERIALIZATION_MONTHS + 1, 0);
  return date.toISOString().slice(0, 10);
}

function monthStartFromDate(dateIso: string) {
  return `${dateIso.slice(0, 7)}-01`;
}

export function collectPlaneacionAffectedMonths(operaciones: PlaneacionMensualOperacion[]) {
  const months = new Set<string>();

  for (const operation of operaciones) {
    const end =
      operation.fechaFin ?? getOpenEndedPlaneacionMaterializationEnd(operation.fechaInicio);
    const cursor = new Date(`${monthStartFromDate(operation.fechaInicio)}T12:00:00Z`);
    const endMonth = monthStartFromDate(end);

    while (cursor.toISOString().slice(0, 10) <= endMonth) {
      months.add(cursor.toISOString().slice(0, 10));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
    }
  }

  return Array.from(months).sort();
}
