export interface SupervisorAssignmentRange {
  empleado_id: string;
  pdv_id: string;
  supervisor_empleado_id: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
}

export interface SupervisorPdvRange {
  pdv_id: string;
  empleado_id: string;
  fecha_inicio: string;
  fecha_fin: string | null;
}

export interface ResolvedDailyRecord {
  fecha: string;
  empleado_id: string;
  pdv_id: string | null;
  supervisor_empleado_id: string | null;
}

export interface ResolvedSupervisorLookup {
  byDate: Map<string, string>;
  byPair: Map<string, string>;
  byEmpleado: Map<string, string>;
  byPdv: Map<string, string>;
}

export function buildResolvedSupervisorLookup(
  records: ResolvedDailyRecord[]
): ResolvedSupervisorLookup {
  const byDate = new Map<string, string>();
  const byPair = new Map<string, string>();
  const byEmpleado = new Map<string, string>();
  const byPdv = new Map<string, string>();

  // Count occurrences to resolve the primary supervisor for employee or pair in this month
  const pairCounts = new Map<string, Map<string, number>>();
  const empCounts = new Map<string, Map<string, number>>();
  const pdvCounts = new Map<string, Map<string, number>>();

  for (const record of records) {
    if (!record.supervisor_empleado_id) continue;
    const dateStr = String(record.fecha).slice(0, 10);
    const supId = record.supervisor_empleado_id;

    if (record.empleado_id && record.pdv_id) {
      const dateKey = `${record.empleado_id}_${record.pdv_id}_${dateStr}`;
      byDate.set(dateKey, supId);

      const pairKey = `${record.empleado_id}_${record.pdv_id}`;
      if (!pairCounts.has(pairKey)) pairCounts.set(pairKey, new Map());
      const pMap = pairCounts.get(pairKey)!;
      pMap.set(supId, (pMap.get(supId) ?? 0) + 1);
    }

    if (record.empleado_id && record.pdv_id) {
      if (!empCounts.has(record.empleado_id)) empCounts.set(record.empleado_id, new Map());
      const eMap = empCounts.get(record.empleado_id)!;
      eMap.set(supId, (eMap.get(supId) ?? 0) + 1);
    }

    if (record.pdv_id) {
      if (!pdvCounts.has(record.pdv_id)) pdvCounts.set(record.pdv_id, new Map());
      const pMap = pdvCounts.get(record.pdv_id)!;
      pMap.set(supId, (pMap.get(supId) ?? 0) + 1);
    }
  }

  for (const [pairKey, sups] of pairCounts.entries()) {
    let topSup = '';
    let maxCount = -1;
    for (const [sId, cnt] of sups.entries()) {
      if (cnt > maxCount) {
        maxCount = cnt;
        topSup = sId;
      }
    }
    if (topSup) byPair.set(pairKey, topSup);
  }

  for (const [empId, sups] of empCounts.entries()) {
    let topSup = '';
    let maxCount = -1;
    for (const [sId, cnt] of sups.entries()) {
      if (cnt > maxCount) {
        maxCount = cnt;
        topSup = sId;
      }
    }
    if (topSup) byEmpleado.set(empId, topSup);
  }

  for (const [pdvId, sups] of pdvCounts.entries()) {
    let topSup = '';
    let maxCount = -1;
    for (const [sId, cnt] of sups.entries()) {
      if (cnt > maxCount) {
        maxCount = cnt;
        topSup = sId;
      }
    }
    if (topSup) byPdv.set(pdvId, topSup);
  }

  return { byDate, byPair, byEmpleado, byPdv };
}

function isEffectiveOnDate(
  range: Pick<SupervisorAssignmentRange, 'fecha_inicio' | 'fecha_fin'>,
  dateIso: string
) {
  return (
    range.fecha_inicio.slice(0, 10) <= dateIso &&
    (!range.fecha_fin || range.fecha_fin.slice(0, 10) >= dateIso)
  );
}

export function resolveEffectiveSupervisorId({
  empleadoId,
  pdvId,
  operationDate,
  resolvedMap,
  assignments,
  supervisorPdvs,
  employeeSupervisorId,
}: {
  empleadoId: string;
  pdvId: string;
  operationDate: string;
  resolvedMap?: ResolvedSupervisorLookup;
  assignments?: SupervisorAssignmentRange[];
  supervisorPdvs?: SupervisorPdvRange[];
  employeeSupervisorId?: string | null;
}) {
  const dateStr = operationDate ? operationDate.slice(0, 10) : '';

  // 1. Prioridad máxima: asignación diaria resuelta en esa fecha exacta
  if (resolvedMap && dateStr) {
    const dailyKey = `${empleadoId}_${pdvId}_${dateStr}`;
    const directDaily = resolvedMap.byDate.get(dailyKey);
    if (directDaily) {
      return directDaily;
    }
  }

  // 2. Par (empleado, pdv) resuelto en el mes consultado
  if (resolvedMap && empleadoId && pdvId) {
    const pairKey = `${empleadoId}_${pdvId}`;
    const pairResolved = resolvedMap.byPair.get(pairKey);
    if (pairResolved) {
      return pairResolved;
    }
  }

  // 3. PDV resuelto en el mes consultado
  if (resolvedMap && pdvId) {
    const pdvResolved = resolvedMap.byPdv.get(pdvId);
    if (pdvResolved) {
      return pdvResolved;
    }
  }

  // 4. Empleado resuelto en el mes consultado
  if (resolvedMap && empleadoId) {
    const empResolved = resolvedMap.byEmpleado.get(empleadoId);
    if (empResolved) {
      return empResolved;
    }
  }

  // 5. Rango de asignaciones base / publicadas
  if (assignments && assignments.length > 0 && dateStr) {
    const assignment = assignments.find(
      (item) =>
        item.empleado_id === empleadoId &&
        item.pdv_id === pdvId &&
        isEffectiveOnDate(item, dateStr)
    );
    if (assignment?.supervisor_empleado_id) {
      return assignment.supervisor_empleado_id;
    }
  }

  // 6. Relación de supervisor_pdv por fecha
  if (supervisorPdvs && supervisorPdvs.length > 0 && dateStr) {
    const pdvRelation = supervisorPdvs.find(
      (item) => item.pdv_id === pdvId && isEffectiveOnDate(item, dateStr)
    );
    if (pdvRelation?.empleado_id) {
      return pdvRelation.empleado_id;
    }
  }

  // 7. Fallback final al supervisor estático de la ficha
  return employeeSupervisorId ?? null;
}

