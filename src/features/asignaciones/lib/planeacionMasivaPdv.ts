import type {
  PlaneacionMensualFila,
  PlaneacionMensualOperacion,
} from '@/features/asignaciones/types/planeacionMensual';

export type PlaneacionMasivaPdvTipo = 'LIBERAR_DCS' | 'REASIGNAR_SUPERVISOR';

export interface PlaneacionMasivaPdvIssue {
  code:
    | 'FECHA_REQUERIDA'
    | 'MOTIVO_REQUERIDO'
    | 'PDVS_REQUERIDOS'
    | 'PDV_SIN_DC_VIGENTE'
    | 'PDV_SIN_SUPERVISOR_VIGENTE'
    | 'SUPERVISOR_DESTINO_REQUERIDO'
    | 'SUPERVISOR_SIN_CAMBIO'
    | 'LOTE_SUPERA_100_OPERACIONES';
  pdvId?: string;
}

interface BuildPlaneacionMasivaPdvInput {
  rows: PlaneacionMensualFila[];
  pdvIds: Iterable<string>;
  tipo: PlaneacionMasivaPdvTipo;
  fechaInicio: string;
  motivo: string;
  supervisorDestinoId?: string | null;
}

function effectiveRows(rows: PlaneacionMensualFila[], pdvId: string, fecha: string) {
  return rows.filter(
    (row) => row.pdvId === pdvId && row.rangoFechaInicio <= fecha && row.rangoFechaFin >= fecha
  );
}

export function buildPlaneacionMasivaPdvOperations(input: BuildPlaneacionMasivaPdvInput): {
  operations: PlaneacionMensualOperacion[];
  issues: PlaneacionMasivaPdvIssue[];
} {
  const pdvIds = [...new Set(input.pdvIds)].sort();
  const motivo = input.motivo.trim();
  const issues: PlaneacionMasivaPdvIssue[] = [];

  if (!input.fechaInicio) issues.push({ code: 'FECHA_REQUERIDA' });
  if (!motivo) issues.push({ code: 'MOTIVO_REQUERIDO' });
  if (pdvIds.length === 0) issues.push({ code: 'PDVS_REQUERIDOS' });
  if (input.tipo === 'REASIGNAR_SUPERVISOR' && !input.supervisorDestinoId) {
    issues.push({ code: 'SUPERVISOR_DESTINO_REQUERIDO' });
  }
  if (issues.length > 0) return { operations: [], issues };

  const operations: PlaneacionMensualOperacion[] = [];

  for (const pdvId of pdvIds) {
    const rows = effectiveRows(input.rows, pdvId, input.fechaInicio);

    if (input.tipo === 'LIBERAR_DCS') {
      const assignments = [
        ...new Map(
          rows
            .filter((row) => row.segmentoTipo === 'DC' && Boolean(row.empleadoId))
            .map((row) => [row.asignacionId ?? `${row.pdvId}:${row.empleadoId}`, row])
        ).values(),
      ];
      if (assignments.length === 0) {
        issues.push({ code: 'PDV_SIN_DC_VIGENTE', pdvId });
        continue;
      }
      operations.push(
        ...assignments.map<PlaneacionMensualOperacion>((row) => ({
          tipoOperacion: 'LIBERAR_DC',
          empleadoId: row.empleadoId,
          pdvOrigenId: row.pdvId,
          pdvDestinoId: null,
          fechaInicio: input.fechaInicio,
          fechaFin: null,
          motivo,
          payload: { asignacionId: row.asignacionId },
        }))
      );
      continue;
    }

    const row = rows.find((candidate) => Boolean(candidate.supervisorId));
    if (!row?.supervisorId) {
      issues.push({ code: 'PDV_SIN_SUPERVISOR_VIGENTE', pdvId });
      continue;
    }
    if (row.supervisorId === input.supervisorDestinoId) {
      issues.push({ code: 'SUPERVISOR_SIN_CAMBIO', pdvId });
      continue;
    }
    operations.push({
      tipoOperacion: 'REASIGNAR_SUPERVISOR',
      empleadoId: null,
      pdvOrigenId: pdvId,
      pdvDestinoId: null,
      fechaInicio: input.fechaInicio,
      fechaFin: null,
      motivo,
      payload: {
        supervisorOrigenId: row.supervisorId,
        supervisorDestinoId: input.supervisorDestinoId,
      },
    });
  }

  if (operations.length > 100) {
    issues.push({ code: 'LOTE_SUPERA_100_OPERACIONES' });
  }

  return { operations, issues };
}
