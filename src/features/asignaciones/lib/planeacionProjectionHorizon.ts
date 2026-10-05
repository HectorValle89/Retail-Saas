export const PLANEACION_FUTURE_MONTHS = 4;
export const PLANEACION_MATERIALIZATION_BATCH_SIZE = 25;

export interface PlaneacionProjectionAssignment {
  empleado_id: string;
  fecha_inicio: string;
  fecha_fin: string | null;
}

export interface PlaneacionProjectionState {
  hasSnapshot: boolean;
  expectedMaterializedRows: number;
  materializedRows: number;
}

export function addPlaneacionUtcMonths(month: string, offset: number) {
  const date = new Date(`${month.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset, 1);
  return date.toISOString().slice(0, 7);
}

export function getPlaneacionMonthRange(month: string) {
  const normalizedMonth = month.slice(0, 7);
  const end = new Date(`${normalizedMonth}-01T12:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return {
    fechaInicio: `${normalizedMonth}-01`,
    fechaFin: end.toISOString().slice(0, 10),
    days: end.getUTCDate(),
  };
}

export function buildPlaneacionProjectionMonths(
  baseMonth: string,
  futureMonths = PLANEACION_FUTURE_MONTHS
) {
  return Array.from({ length: futureMonths + 1 }, (_, index) =>
    addPlaneacionUtcMonths(baseMonth, index)
  );
}

export function getPlaneacionEligibleEmployeeIds(
  rows: PlaneacionProjectionAssignment[],
  month: string
) {
  const { fechaInicio, fechaFin } = getPlaneacionMonthRange(month);
  return Array.from(
    new Set(
      rows
        .filter((row) => {
          const assignmentStart = row.fecha_inicio.slice(0, 10);
          const assignmentEnd = row.fecha_fin?.slice(0, 10) ?? fechaFin;
          return assignmentStart <= fechaFin && assignmentEnd >= fechaInicio;
        })
        .map((row) => row.empleado_id)
        .filter(Boolean)
    )
  ).sort();
}

export function isPlaneacionProjectionComplete(state: PlaneacionProjectionState) {
  return state.hasSnapshot && state.materializedRows >= state.expectedMaterializedRows;
}

export function chunkPlaneacionEmployees(employeeIds: string[]) {
  const uniqueIds = Array.from(new Set(employeeIds.filter(Boolean))).sort();
  const chunks: string[][] = [];
  for (let index = 0; index < uniqueIds.length; index += PLANEACION_MATERIALIZATION_BATCH_SIZE) {
    chunks.push(uniqueIds.slice(index, index + PLANEACION_MATERIALIZATION_BATCH_SIZE));
  }
  return chunks;
}
