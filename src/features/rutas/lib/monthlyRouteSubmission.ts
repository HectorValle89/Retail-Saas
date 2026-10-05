export interface MonthlyRouteSubmissionVisit {
  fecha: string;
  pdvId: string;
  orden: number;
  notas: string | null;
}

export interface MonthlyRouteSubmissionResult {
  ok: boolean;
  submissionId: string;
  month: string;
  revision: number;
  routesAffected: number;
  visits: number;
  plannedDays: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNonNegativeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

export function normalizeMonthlyRouteSubmission(
  raw: string,
  monthIso: string
): MonthlyRouteSubmissionVisit[] {
  const parsedMonth = new Date(`${monthIso}-01T12:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}$/.test(monthIso) ||
    Number.isNaN(parsedMonth.getTime()) ||
    parsedMonth.toISOString().slice(0, 7) !== monthIso
  ) {
    throw new Error('Selecciona un mes válido para enviar la ruta.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('La planeación mensual no tiene un formato válido.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('La planeación mensual debe ser una lista de visitas.');
  }

  const visits = parsed.map((item, index) => {
    const source = asRecord(item);
    const fecha = typeof source.fecha === 'string' ? source.fecha.trim() : '';
    const pdvId = typeof source.pdvId === 'string' ? source.pdvId.trim() : '';
    const orden = Number(source.orden);
    const notas =
      typeof source.notas === 'string' && source.notas.trim() ? source.notas.trim() : null;

    const parsedDate = new Date(`${fecha}T12:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== fecha
    ) {
      throw new Error(`La visita ${index + 1} no tiene una fecha válida.`);
    }
    if (fecha.slice(0, 7) !== monthIso) {
      throw new Error(`La visita del ${fecha} queda fuera del mes seleccionado.`);
    }
    if (!pdvId) {
      throw new Error(`La visita ${index + 1} no tiene un PDV válido.`);
    }
    if (!Number.isInteger(orden) || orden < 1 || orden > 99) {
      throw new Error(`La visita ${index + 1} no tiene un orden válido.`);
    }

    return { fecha, pdvId, orden, notas } satisfies MonthlyRouteSubmissionVisit;
  });

  const pdvKeys = new Set<string>();
  const orderKeys = new Set<string>();
  for (const visit of visits) {
    const pdvKey = `${visit.fecha}:${visit.pdvId}`;
    const orderKey = `${visit.fecha}:${visit.orden}`;
    if (pdvKeys.has(pdvKey)) {
      throw new Error('No puedes repetir la misma tienda en un mismo día.');
    }
    if (orderKeys.has(orderKey)) {
      throw new Error('No puedes repetir el mismo orden de visita en un día.');
    }
    pdvKeys.add(pdvKey);
    orderKeys.add(orderKey);
  }

  return visits.sort(
    (left, right) =>
      left.fecha.localeCompare(right.fecha) ||
      left.orden - right.orden ||
      left.pdvId.localeCompare(right.pdvId)
  );
}

export function normalizeMonthlyRouteSubmissionResult(
  value: unknown
): MonthlyRouteSubmissionResult {
  const source = asRecord(value);
  return {
    ok: source.ok === true,
    submissionId: typeof source.envioId === 'string' ? source.envioId : '',
    month: typeof source.mes === 'string' ? source.mes.slice(0, 7) : '',
    revision: asNonNegativeInteger(source.revision),
    routesAffected: asNonNegativeInteger(source.rutasAfectadas),
    visits: asNonNegativeInteger(source.visitas),
    plannedDays: asNonNegativeInteger(source.diasPlaneados),
  };
}
