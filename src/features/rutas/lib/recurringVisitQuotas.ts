export interface RecurringVisitQuotaVersion {
  pdvId: string;
  visitasMensuales: number;
  vigenteDesde: string;
  vigenteHasta: string | null;
}

export function normalizeQuotaMonthStart(value: string) {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value.trim());
  if (!match) {
    throw new Error('La vigencia de cuotas debe usar el formato YYYY-MM.');
  }

  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error('El mes de vigencia de cuotas no es válido.');
  }

  return `${match[1]}-${match[2]}-01`;
}

export function resolveRecurringVisitQuota(
  versions: RecurringVisitQuotaVersion[],
  monthValue: string
) {
  const monthStart = normalizeQuotaMonthStart(monthValue);

  return (
    versions
      .filter(
        (version) =>
          version.vigenteDesde <= monthStart &&
          (!version.vigenteHasta || version.vigenteHasta >= monthStart)
      )
      .sort((left, right) => right.vigenteDesde.localeCompare(left.vigenteDesde))[0] ?? null
  );
}

export function buildRecurringQuotaMap(
  rows: Array<RecurringVisitQuotaVersion & { supervisorEmpleadoId: string }>
) {
  const result = new Map<string, Map<string, RecurringVisitQuotaVersion>>();

  for (const row of rows) {
    const supervisorQuotas = result.get(row.supervisorEmpleadoId) ?? new Map();
    supervisorQuotas.set(row.pdvId, row);
    result.set(row.supervisorEmpleadoId, supervisorQuotas);
  }

  return result;
}
