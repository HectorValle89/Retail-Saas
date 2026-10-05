import type { PlaneacionMensualOperacion } from '@/features/asignaciones/types/planeacionMensual';

export type PlaneacionRotacionPatron = 'LMX_JVS' | 'JVS_LMX' | 'PERSONALIZADA';

export interface PlaneacionRotacionMiembro {
  slot: 'A' | 'B' | 'C';
  pdvId: string;
  empleadoId: string;
  empleadoActualId: string;
  asignacionActualId: string;
  diasLaborales: string;
  horarioReferencia: string;
}

export interface PlaneacionRotacionLiberacion {
  pdvId: string;
  empleadoId: string;
  asignacionId: string;
}

export interface PlaneacionRotacionGrupoIssue {
  code:
    | 'PDV_REQUERIDO'
    | 'PDV_REPETIDO'
    | 'DIAS_REQUERIDOS'
    | 'HORARIO_REQUERIDO'
    | 'DC_DIAS_TRASLAPADOS';
  slot?: PlaneacionRotacionMiembro['slot'];
  empleadoId?: string;
}

const DAY_ORDER = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'] as const;
const VALID_DAYS = new Set<string>(DAY_ORDER);

function normalizeDays(value: string) {
  const upper = value.trim().toUpperCase();
  if (upper === 'LUN-SAB') return DAY_ORDER.slice(0, 6);
  if (upper === 'LUN-DOM') return [...DAY_ORDER];
  return [...new Set(upper.split(/[\s,;/]+/).filter((day) => VALID_DAYS.has(day)))].sort(
    (left, right) =>
      DAY_ORDER.indexOf(left as (typeof DAY_ORDER)[number]) -
      DAY_ORDER.indexOf(right as (typeof DAY_ORDER)[number])
  );
}

export function getPlaneacionRotacionPatternDays(
  pattern: PlaneacionRotacionPatron,
  slot: PlaneacionRotacionMiembro['slot']
) {
  if (pattern === 'PERSONALIZADA') return '';
  if (slot === 'C') return 'DOM';
  const first = pattern === 'LMX_JVS' ? 'LUN,MAR,MIE' : 'JUE,VIE,SAB';
  const second = pattern === 'LMX_JVS' ? 'JUE,VIE,SAB' : 'LUN,MAR,MIE';
  return slot === 'A' ? first : second;
}

export function buildPlaneacionRotationGroupCode(pdvIds: string[], fechaInicio: string) {
  const identity = [...pdvIds]
    .sort()
    .map((id) => id.replaceAll('-', '').slice(0, 12).toUpperCase())
    .join('-');
  return `ROT-MAN-${fechaInicio.replaceAll('-', '')}-${identity}`;
}

export function validatePlaneacionRotacionGrupo(
  members: PlaneacionRotacionMiembro[]
): PlaneacionRotacionGrupoIssue[] {
  const issues: PlaneacionRotacionGrupoIssue[] = [];
  const pdvIds = new Set<string>();
  const employeeDays = new Map<string, Set<string>>();

  for (const member of members) {
    if (!member.pdvId) {
      issues.push({ code: 'PDV_REQUERIDO', slot: member.slot });
    } else if (pdvIds.has(member.pdvId)) {
      issues.push({ code: 'PDV_REPETIDO', slot: member.slot });
    } else {
      pdvIds.add(member.pdvId);
    }

    const days = normalizeDays(member.diasLaborales);
    if (days.length === 0) issues.push({ code: 'DIAS_REQUERIDOS', slot: member.slot });
    if (member.empleadoId && !member.horarioReferencia.trim()) {
      issues.push({ code: 'HORARIO_REQUERIDO', slot: member.slot });
    }

    if (!member.empleadoId) continue;
    const occupied = employeeDays.get(member.empleadoId) ?? new Set<string>();
    if (days.some((day) => occupied.has(day))) {
      issues.push({
        code: 'DC_DIAS_TRASLAPADOS',
        slot: member.slot,
        empleadoId: member.empleadoId,
      });
    }
    days.forEach((day) => occupied.add(day));
    employeeDays.set(member.empleadoId, occupied);
  }

  return issues;
}

export function buildPlaneacionRotacionOperations(input: {
  tipo: 'FIJA' | 'ROTATIVA';
  fechaInicio: string;
  motivo: string;
  members: PlaneacionRotacionMiembro[];
  additionalReleases?: PlaneacionRotacionLiberacion[];
}): { operations: PlaneacionMensualOperacion[]; issues: PlaneacionRotacionGrupoIssue[] } {
  const members = input.tipo === 'FIJA' ? input.members.slice(0, 1) : input.members;
  const issues = validatePlaneacionRotacionGrupo(members);
  if (issues.length > 0) return { operations: [], issues };

  const groupCode =
    input.tipo === 'ROTATIVA'
      ? buildPlaneacionRotationGroupCode(
          members.map((member) => member.pdvId),
          input.fechaInicio
        )
      : null;
  const operations: PlaneacionMensualOperacion[] = [];

  const releases = [
    ...members
      .filter((member) => member.empleadoActualId && member.asignacionActualId)
      .map((member) => ({
        pdvId: member.pdvId,
        empleadoId: member.empleadoActualId,
        asignacionId: member.asignacionActualId,
      })),
    ...(input.additionalReleases ?? []),
  ];
  const uniqueReleases = [
    ...new Map(releases.map((release) => [release.asignacionId, release])).values(),
  ];

  for (const release of uniqueReleases) {
    if (release.empleadoId && release.asignacionId) {
      operations.push({
        tipoOperacion: 'LIBERAR_DC',
        empleadoId: release.empleadoId,
        pdvOrigenId: release.pdvId,
        pdvDestinoId: null,
        fechaInicio: input.fechaInicio,
        fechaFin: null,
        motivo: input.motivo,
        payload: { asignacionId: release.asignacionId },
      });
    }
  }

  members.forEach((member) => {
    operations.push({
      tipoOperacion: 'CAMBIAR_ROTACION',
      empleadoId: null,
      pdvOrigenId: member.pdvId,
      pdvDestinoId: null,
      fechaInicio: input.fechaInicio,
      fechaFin: null,
      motivo: input.motivo,
      payload: {
        tipo: input.tipo,
        factorTiempo: input.tipo === 'ROTATIVA' ? 0.5 : 1,
        grupoRotacion: groupCode,
        grupoTamano: input.tipo === 'ROTATIVA' ? (members.length as 2 | 3) : null,
        slotRotacion: input.tipo === 'ROTATIVA' ? member.slot : null,
      },
    });

    if (!member.empleadoId) return;
    operations.push({
      tipoOperacion: 'ASIGNAR_DC',
      empleadoId: member.empleadoId,
      pdvOrigenId: null,
      pdvDestinoId: member.pdvId,
      fechaInicio: input.fechaInicio,
      fechaFin: null,
      motivo: input.motivo,
      payload: {
        asignacionId: null,
        naturaleza: 'BASE',
        tipo: input.tipo,
        factorTiempo: input.tipo === 'ROTATIVA' ? 0.5 : 1,
        diasLaborales: member.diasLaborales.trim().toUpperCase(),
        diaDescanso: null,
        horarioReferencia: member.horarioReferencia.trim().toUpperCase(),
        grupoRotacion: groupCode,
        grupoTamano: input.tipo === 'ROTATIVA' ? (members.length as 2 | 3) : null,
        slotRotacion: input.tipo === 'ROTATIVA' ? member.slot : null,
      },
    });
  });

  return { operations, issues: [] };
}
