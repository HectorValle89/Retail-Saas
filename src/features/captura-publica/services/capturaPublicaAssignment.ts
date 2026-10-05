import {
  compareAssignmentOperationalPriority,
  isAssignmentScheduledForDate,
  normalizeAssignmentNature,
  type AssignmentEngineNature,
  type AssignmentScheduleLike,
} from '@/features/asignaciones/lib/assignmentEngine';

export interface CapturaPublicaAssignmentCandidate extends AssignmentScheduleLike {
  pdv_id: string;
  empleadoNombre: string;
  empleadoDisponible: boolean;
}

export interface CapturaPublicaAssignmentResolution {
  pdvId: string;
  estado: 'ASIGNADA' | 'SELECCIONABLE' | 'CONFLICTO';
  empleadoId: string | null;
  empleadoNombre: string | null;
  asignacionId: string | null;
  origen: Exclude<AssignmentEngineNature, 'MOVIMIENTO'> | null;
  candidatos: Array<{
    empleadoId: string;
    empleadoNombre: string;
  }>;
}

function getOperationalPriority(candidate: CapturaPublicaAssignmentCandidate) {
  if (Number.isFinite(candidate.prioridad)) {
    return Number(candidate.prioridad);
  }

  const nature = normalizeAssignmentNature(candidate.naturaleza);
  if (nature === 'COBERTURA_TEMPORAL') {
    return 200;
  }
  if (nature === 'COBERTURA_PERMANENTE') {
    return 150;
  }
  return 100;
}

export function resolveCapturaPublicaAssignments(
  candidates: CapturaPublicaAssignmentCandidate[],
  targetDate: string
): CapturaPublicaAssignmentResolution[] {
  const candidatesByEmployee = new Map<string, CapturaPublicaAssignmentCandidate[]>();
  for (const candidate of candidates) {
    if (!isAssignmentScheduledForDate(candidate, targetDate)) {
      continue;
    }

    const current = candidatesByEmployee.get(candidate.empleado_id) ?? [];
    current.push(candidate);
    candidatesByEmployee.set(candidate.empleado_id, current);
  }
  const effectiveByEmployee = Array.from(candidatesByEmployee.values()).map(
    (employeeCandidates) => employeeCandidates.sort(compareAssignmentOperationalPriority)[0]
  );
  const byPdv = new Map<string, CapturaPublicaAssignmentCandidate[]>();

  for (const candidate of effectiveByEmployee) {
    const current = byPdv.get(candidate.pdv_id) ?? [];
    current.push(candidate);
    byPdv.set(candidate.pdv_id, current);
  }

  return Array.from(byPdv.entries())
    .map(([pdvId, pdvCandidates]) => {
      const highestPriority = Math.max(...pdvCandidates.map(getOperationalPriority));
      const leaders = pdvCandidates.filter(
        (candidate) => getOperationalPriority(candidate) === highestPriority
      );
      const uniqueLeaders = Array.from(
        new Map(leaders.map((candidate) => [candidate.empleado_id, candidate])).values()
      );
      const selected = uniqueLeaders.length === 1 ? uniqueLeaders[0] : null;

      const availableLeaders = uniqueLeaders.filter((candidate) => candidate.empleadoDisponible);

      if (availableLeaders.length > 1) {
        return {
          pdvId,
          estado: 'SELECCIONABLE' as const,
          empleadoId: null,
          empleadoNombre: null,
          asignacionId: null,
          origen: null,
          candidatos: availableLeaders.map((candidate) => ({
            empleadoId: candidate.empleado_id,
            empleadoNombre: candidate.empleadoNombre,
          })),
        };
      }

      if (!selected || !selected.empleadoDisponible) {
        return {
          pdvId,
          estado: 'CONFLICTO' as const,
          empleadoId: null,
          empleadoNombre: null,
          asignacionId: null,
          origen: null,
          candidatos: uniqueLeaders.map((candidate) => ({
            empleadoId: candidate.empleado_id,
            empleadoNombre: candidate.empleadoNombre,
          })),
        };
      }

      return {
        pdvId,
        estado: 'ASIGNADA' as const,
        empleadoId: selected.empleado_id,
        empleadoNombre: selected.empleadoNombre,
        asignacionId: selected.id,
        origen: normalizeAssignmentNature(selected.naturaleza),
        candidatos: [
          {
            empleadoId: selected.empleado_id,
            empleadoNombre: selected.empleadoNombre,
          },
        ],
      };
    })
    .sort((left, right) => left.pdvId.localeCompare(right.pdvId));
}
