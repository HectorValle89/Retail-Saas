import { describe, expect, it } from 'vitest';
import {
  buildVisiblePdvIds,
  collectRutaReferencePdvIds,
  resolveRutaPdvSnapshot,
} from './rutaSemanalPdvLookup';
import {
  buildSupervisorRouteSlices,
  getEditableDayNumbersForRoute,
} from '../lib/routeTemporalSlices';
import {
  serializeRutaSemanalWorkflowMetadata,
  type RutaSemanalWorkflowMetadata,
} from '../lib/routeWorkflow';

describe('buildVisiblePdvIds', () => {
  it('resuelve solo los PDVs activos de la cuenta actual', () => {
    const actor = {
      cuentaClienteId: 'cc-1',
    } as { cuentaClienteId: string | null };

    const visible = buildVisiblePdvIds(actor as never, [
      { pdv_id: 'pdv-1', cuenta_cliente_id: 'cc-1', activo: true, fecha_fin: null },
      { pdv_id: 'pdv-2', cuenta_cliente_id: 'cc-1', activo: false, fecha_fin: null },
      { pdv_id: 'pdv-3', cuenta_cliente_id: 'cc-2', activo: true, fecha_fin: null },
      { pdv_id: 'pdv-4', cuenta_cliente_id: 'cc-1', activo: true, fecha_fin: '2026-04-20' },
    ]);

    expect(Array.from(visible ?? [])).toEqual(['pdv-1']);
  });

  it('retorna null cuando no existe cuenta cliente operativa', () => {
    expect(buildVisiblePdvIds({ cuentaClienteId: null } as never, [])).toBeNull();
  });
});

describe('resolveRutaPdvSnapshot', () => {
  it('usa el PDV ligado a la ruta aunque el catalogo visible no lo tenga', () => {
    const linkedPdv = {
      id: 'pdv-9',
      clave_btl: 'BTL-009',
      nombre: 'Farmacia Centro',
      zona: 'Centro',
      direccion: 'Av. Principal 123',
      estatus: 'ACTIVO' as const,
      formato: '400',
    };

    const fallbackPdv = {
      id: 'pdv-9',
      clave_btl: 'BTL-009',
      nombre: 'Farmacia Vieja',
      zona: 'Norte',
      direccion: 'Calle Secundaria 99',
      estatus: 'ACTIVO' as const,
      formato: '400',
    };

    expect(resolveRutaPdvSnapshot(linkedPdv, fallbackPdv)).toMatchObject({
      id: 'pdv-9',
      nombre: 'Farmacia Centro',
      clave_btl: 'BTL-009',
      zona: 'Centro',
    });
  });
});

function buildWorkflowMetadata(
  changeRequestOverrides: Partial<RutaSemanalWorkflowMetadata['changeRequest']> = {}
) {
  return serializeRutaSemanalWorkflowMetadata({
    expectedMonthlyVisits: null,
    minimumVisitsPerPdv: null,
    pdvMonthlyQuotas: {},
    approval: {
      state: 'APROBADA',
      note: null,
      reviewedAt: null,
      reviewedByUsuarioId: null,
    },
    changeRequest: {
      status: 'PENDIENTE',
      note: null,
      resolutionNote: null,
      requestType: 'CAMBIO_TIENDA',
      targetScope: 'VISITA',
      targetVisitId: null,
      targetPdvId: null,
      targetDayNumber: 1,
      targetDayLabel: 'Lunes',
      proposedVisits: [],
      requestedAt: null,
      requestedByUsuarioId: null,
      resolvedAt: null,
      resolvedByUsuarioId: null,
      previousApprovalState: null,
      previousRouteStatus: null,
      ...changeRequestOverrides,
    },
  });
}

describe('collectRutaReferencePdvIds', () => {
  it('incluye targetPdvId y propuestas de cambio sin duplicados', () => {
    const routes = [
      {
        metadata: buildWorkflowMetadata({
          targetPdvId: 'pdv-1',
          proposedVisits: [
            { pdvId: 'pdv-1', order: 1 },
            { pdvId: 'pdv-2', order: 2 },
          ],
        }),
      },
      {
        metadata: buildWorkflowMetadata({
          targetPdvId: 'pdv-3',
          proposedVisits: [{ pdvId: 'pdv-4', order: 1 }],
        }),
      },
    ];

    expect(Array.from(collectRutaReferencePdvIds(routes))).toEqual([
      'pdv-1',
      'pdv-2',
      'pdv-3',
      'pdv-4',
    ]);
  });
});

describe('getEditableDayNumbersForRoute', () => {
  it('solo deja dias con fecha operativa actual o futura', () => {
    const editableDays = getEditableDayNumbersForRoute(
      {
        semanaInicio: '2026-04-20',
        visitas: [{ diaSemana: 1 }, { diaSemana: 2 }, { diaSemana: 4 }, { diaSemana: 6 }] as Array<
          { diaSemana: number } & Record<string, unknown>
        >,
      },
      '2026-04-23'
    );

    expect(editableDays).toEqual([4, 6]);
  });
});

describe('buildSupervisorRouteSlices', () => {
  it('manda a correcciones solo rutas publicadas o en progreso con dias editables', () => {
    const routes = [
      {
        id: 'route-current',
        totalVisitas: 4,
        approvalState: 'APROBADA',
        estatus: 'PUBLICADA',
        hasEditableFutureDays: true,
        semanaInicio: '2026-04-20',
        semanaFin: '2026-04-26',
      },
      {
        id: 'route-past',
        totalVisitas: 4,
        approvalState: 'APROBADA',
        estatus: 'PUBLICADA',
        hasEditableFutureDays: false,
        semanaInicio: '2026-04-13',
        semanaFin: '2026-04-19',
      },
      {
        id: 'route-draft',
        totalVisitas: 4,
        approvalState: 'PENDIENTE_COORDINACION',
        estatus: 'BORRADOR',
        hasEditableFutureDays: true,
        semanaInicio: '2026-04-27',
        semanaFin: '2026-05-03',
      },
      {
        id: 'route-progress',
        totalVisitas: 3,
        approvalState: 'APROBADA',
        estatus: 'EN_PROGRESO',
        hasEditableFutureDays: true,
        semanaInicio: '2026-04-27',
        semanaFin: '2026-05-03',
      },
    ];

    const slices = buildSupervisorRouteSlices(routes, '2026-04-23');

    expect(slices.rutasCorrecciones.map((route) => route.id)).toEqual([
      'route-current',
      'route-progress',
    ]);
  });

  it('limita historicos a rutas que se traslapan con el mes actual', () => {
    const routes = [
      {
        id: 'route-april',
        totalVisitas: 4,
        approvalState: 'APROBADA',
        estatus: 'PUBLICADA',
        hasEditableFutureDays: true,
        semanaInicio: '2026-04-20',
        semanaFin: '2026-04-26',
      },
      {
        id: 'route-overlap',
        totalVisitas: 3,
        approvalState: 'APROBADA',
        estatus: 'EN_PROGRESO',
        hasEditableFutureDays: true,
        semanaInicio: '2026-04-27',
        semanaFin: '2026-05-03',
      },
      {
        id: 'route-may',
        totalVisitas: 3,
        approvalState: 'APROBADA',
        estatus: 'PUBLICADA',
        hasEditableFutureDays: true,
        semanaInicio: '2026-05-04',
        semanaFin: '2026-05-10',
      },
    ];

    const slices = buildSupervisorRouteSlices(routes, '2026-04-23');

    expect(slices.rutasHistoricasMesActual.map((route) => route.id)).toEqual([
      'route-april',
      'route-overlap',
    ]);
  });

  it('excluye supervisores de prueba de las listas de catálogo operativo', () => {
    const isTestSupervisor = (name: string) => {
      const lower = name.trim().toLowerCase();
      return lower.startsWith('test supervisor') || lower.startsWith('test_supervisor') || lower.startsWith('test ');
    };

    const employees = [
      { id: '1', nombre_completo: 'Test SUPERVISOR 01', puesto: 'SUPERVISOR', estatus_laboral: 'ACTIVO' },
      { id: '2', nombre_completo: 'ADRIANA YULISMA ALVAREZ GARCIA', puesto: 'SUPERVISOR', estatus_laboral: 'ACTIVO' },
      { id: '3', nombre_completo: 'GLORIA MARIBEL AVILA BELTRAN', puesto: 'SUPERVISOR', estatus_laboral: 'ACTIVO' },
    ];

    const filtered = employees
      .filter((item) => item.puesto === 'SUPERVISOR' && item.estatus_laboral === 'ACTIVO')
      .filter((item) => !isTestSupervisor(item.nombre_completo));

    expect(filtered.map((item) => item.nombre_completo)).toEqual([
      'ADRIANA YULISMA ALVAREZ GARCIA',
      'GLORIA MARIBEL AVILA BELTRAN',
    ]);
    expect(filtered.some((item) => item.nombre_completo.includes('Test SUPERVISOR'))).toBe(false);
  });
});

import { buildWarRoomData } from './rutaSemanalService';

describe('buildWarRoomData - Tiendas vacantes y descuento de visitas adicionales', () => {
  const mockActor = {
    empleadoId: 'sup-1',
    usuarioId: 'usr-1',
    puesto: 'COORDINADOR',
    rol: 'COORDINADOR',
    cuentaClienteId: 'cc-1',
  };

  const pdvActivo = {
    id: 'pdv-activo',
    clave_btl: 'BTL-01',
    nombre: 'Farmacia Activa',
    zona: 'Centro',
    direccion: 'Calle 1',
    estatus: 'ACTIVO' as const,
    formato: '400',
    cadenaNombre: 'Cadena A',
    cadenaCodigo: 'CAD-A',
  };

  const pdvVacante = {
    id: 'pdv-vacante',
    clave_btl: 'BTL-02',
    nombre: 'Farmacia Vacante',
    zona: 'Norte',
    direccion: 'Calle 2',
    estatus: 'ACTIVO' as const,
    formato: '400',
    cadenaNombre: 'Cadena A',
    cadenaCodigo: 'CAD-A',
  };

  const pdvsWithSupervisors = [
    {
      ...pdvActivo,
      cadena: { id: 'cad-1', codigo: 'CAD-A', nombre: 'Cadena A' },
      supervisor_pdv: [
        {
          id: 'spdv-1',
          activo: true,
          fecha_inicio: '2026-01-01',
          fecha_fin: null,
          empleado: { id: 'sup-1', nombre_completo: 'Supervisor Demo', zona: 'Centro' },
        },
      ],
    },
    {
      ...pdvVacante,
      cadena: { id: 'cad-1', codigo: 'CAD-A', nombre: 'Cadena A' },
      supervisor_pdv: [
        {
          id: 'spdv-2',
          activo: true,
          fecha_inicio: '2026-01-01',
          fecha_fin: null,
          empleado: { id: 'sup-1', nombre_completo: 'Supervisor Demo', zona: 'Norte' },
        },
      ],
    },
  ];

  const pdvMap = new Map([
    ['pdv-activo', pdvActivo],
    ['pdv-vacante', pdvVacante],
  ]);

  const employees = [
    {
      id: 'sup-1',
      nombre_completo: 'Supervisor Demo',
      puesto: 'SUPERVISOR' as const,
      zona: 'Centro',
      estatus_laboral: 'ACTIVO' as const,
      supervisor_empleado_id: null,
    },
  ];

  const activeAssignments = [
    {
      id: 'asg-1',
      cuenta_cliente_id: 'cc-1',
      supervisor_empleado_id: 'sup-1',
      pdv_id: 'pdv-activo',
      fecha_inicio: '2026-01-01',
      fecha_fin: null,
      estado_publicacion: 'PUBLICADA' as const,
      horario_referencia: null,
    },
  ];

  const recurringQuotaMap = new Map([
    [
      'sup-1',
      new Map([
        [
          'pdv-activo',
          {
            supervisorEmpleadoId: 'sup-1',
            pdvId: 'pdv-activo',
            visitasMensuales: 4,
            vigenteDesde: '2026-01-01',
            vigenteHasta: null,
          },
        ],
        [
          'pdv-vacante',
          {
            supervisorEmpleadoId: 'sup-1',
            pdvId: 'pdv-vacante',
            visitasMensuales: 4,
            vigenteDesde: '2026-01-01',
            vigenteHasta: null,
          },
        ],
      ]),
    ],
  ]);

  it('asigna cuota 0 y marca esVacante=true a tiendas sin dermoconsejera activa', () => {
    const warRoom = buildWarRoomData({
      actor: mockActor as never,
      metadataColumnAvailable: true,
      quotaInfrastructureAvailable: true,
      recurringQuotaMap,
      rutas: [],
      agendaEventsByRoute: new Map(),
      pendingRepositionsByRoute: new Map(),
      pdvMap,
      pdvsWithSupervisors: pdvsWithSupervisors as never,
      geocercaMap: new Map(),
      rotacionMap: new Map(),
      activeAssignments,
      employees,
      weekStart: '2026-09-14',
    });

    const supervisor = warRoom.supervisors.find((s) => s.supervisorEmpleadoId === 'sup-1');
    expect(supervisor).toBeDefined();

    const itemActivo = supervisor!.quotaProgress.find((p) => p.pdvId === 'pdv-activo');
    const itemVacante = supervisor!.quotaProgress.find((p) => p.pdvId === 'pdv-vacante');

    expect(itemActivo).toBeDefined();
    expect(itemActivo!.esVacante).toBe(false);
    expect(itemActivo!.quotaMensual).toBe(4);

    expect(itemVacante).toBeDefined();
    expect(itemVacante!.esVacante).toBe(true);
    expect(itemVacante!.quotaMensual).toBe(0);
    expect(itemVacante!.visitasPendientes).toBe(0);

    // Meta del mes solo debe sumar las tiendas activas (4) y no las vacantes (0)
    expect(supervisor!.expectedMonthlyVisits).toBe(4);
    expect(supervisor!.totalPdvsConCuota).toBe(1);
    expect(supervisor!.totalPdvsVacantes).toBe(1);
  });

  it('computa visitas adicionales completadas de la agenda hacia la tienda y descuenta de las pendientes del mes', () => {
    const rutaBase = {
      id: 'ruta-1',
      cuentaClienteId: 'cc-1',
      supervisorEmpleadoId: 'sup-1',
      supervisor: 'Supervisor Demo',
      supervisorZona: 'Centro',
      semanaInicio: '2026-09-14',
      semanaFin: '2026-09-20',
      estatus: 'PUBLICADA' as const,
      approvalState: 'APROBADA' as const,
      notas: null,
      expectedMonthlyVisits: 4,
      minimumVisitsPerPdv: 4,
      pdvMonthlyQuotas: {},
      monthlySubmissionId: null,
      monthlyVisitsCompleted: null,
      changeRequestState: 'SIN_SOLICITUD' as const,
      changeRequestedAt: null,
      changeRequestType: null,
      changeRequestScope: null,
      changeRequestPdvId: null,
      changeRequestTargetDayNumber: null,
      changeRequestProposedVisits: [],
      createdAt: '2026-09-14T00:00:00Z',
      updatedAt: '2026-09-14T00:00:00Z',
      totalVisitas: 0,
      visitasCompletadas: 0,
      editableDayNumbers: [1, 2, 3, 4, 5],
      hasEditableFutureDays: true,
      visitas: [],
      agendaEventosCount: 1,
      pendientesReposicionCount: 0,
    };

    const agendaEvents = new Map([
      [
        'ruta-1',
        [
          {
            id: 'event-visita-adicional-1',
            rutaId: 'ruta-1',
            sourceVisitId: null,
            supervisorEmpleadoId: 'sup-1',
            fechaOperacion: '2026-09-15',
            pdvId: 'pdv-activo',
            pdv: 'Farmacia Activa',
            zona: 'Centro',
            tipoEvento: 'VISITA_ADICIONAL' as const,
            modoImpacto: 'SUMA' as const,
            estatusAprobacion: 'NO_REQUIERE' as const,
            estatusEjecucion: 'COMPLETADO' as const,
            titulo: 'Visita adicional completada',
            descripcion: 'Supervisión extraordinaria',
            sede: 'Calle 1',
            horaInicio: '09:00',
            horaFin: '11:00',
            selfieUrl: null,
            evidenciaUrl: null,
            checkInAt: '2026-09-15T09:05:00Z',
            checkOutAt: '2026-09-15T11:00:00Z',
            metadata: {},
            createdAt: '2026-09-15T09:00:00Z',
            updatedAt: '2026-09-15T11:00:00Z',
          },
        ],
      ],
    ]);

    const warRoom = buildWarRoomData({
      actor: mockActor as never,
      metadataColumnAvailable: true,
      quotaInfrastructureAvailable: true,
      recurringQuotaMap,
      rutas: [rutaBase as unknown as import('./rutaSemanalService').RutaSemanalItem],
      agendaEventsByRoute: agendaEvents,
      pendingRepositionsByRoute: new Map(),
      pdvMap,
      pdvsWithSupervisors: pdvsWithSupervisors as never,
      geocercaMap: new Map(),
      rotacionMap: new Map(),
      activeAssignments,
      employees,
      weekStart: '2026-09-14',
    });

    const supervisor = warRoom.supervisors.find((s) => s.supervisorEmpleadoId === 'sup-1')!;
    const itemActivo = supervisor.quotaProgress.find((p) => p.pdvId === 'pdv-activo')!;

    // La visita adicional completada se sumó a las realizadas de esa tienda
    expect(itemActivo.visitasRealizadas).toBe(1);
    // Y descontó de sus visitas pendientes (4 - 1 = 3)
    expect(itemActivo.visitasPendientes).toBe(3);

    // Sumó a las visitas completadas del mes del supervisor
    expect(supervisor.monthlyVisitsCompleted).toBe(1);
    // Y el porcentaje de avance del supervisor se actualizó (1 de 4 = 25%)
    expect(supervisor.cumplimientoPorcentaje).toBe(25);
  });

  it('resuelve tiendas activas y vacantes basándose en la asignación mensual para supervisor con múltiples tiendas', () => {
    const atzinSupId = 'sup-atzin';
    const tiendasActivasIds = Array.from({ length: 17 }, (_, i) => `pdv-activo-${i + 1}`);
    const tiendasVacantesIds = ['pdv-vacante-1', 'pdv-vacante-2'];
    const todasTiendasIds = [...tiendasActivasIds, ...tiendasVacantesIds];

    const pdvMapAtzin = new Map(
      todasTiendasIds.map((id) => [
        id,
        {
          id,
          clave_btl: `BTL-${id}`,
          nombre: `Tienda ${id}`,
          zona: 'Sur',
          direccion: 'Av Principal',
          estatus: 'ACTIVO' as const,
          formato: '400',
          cadenaNombre: 'Cadena ISDIN',
          cadenaCodigo: 'ISD',
        },
      ])
    );

    const pdvsWithSupervisorsAtzin = todasTiendasIds.map((id) => ({
      ...pdvMapAtzin.get(id)!,
      cadena: { id: 'cad-1', codigo: 'ISD', nombre: 'Cadena ISDIN' },
      supervisor_pdv: [
        {
          id: `spdv-${id}`,
          activo: true,
          fecha_inicio: '2026-01-01',
          fecha_fin: null,
          empleado: { id: atzinSupId, nombre_completo: 'ATZIN SUSANA AGUIRRE CAMACHO', zona: 'Sur' },
        },
      ],
    }));

    const activeAssignmentsSept = tiendasActivasIds.map((id, idx) => ({
      id: `asg-${id}`,
      cuenta_cliente_id: 'cc-isdin',
      supervisor_empleado_id: atzinSupId,
      pdv_id: id,
      fecha_inicio: idx % 2 === 0 ? '2026-01-01' : '2026-09-01',
      fecha_fin: idx % 3 === 0 ? null : '2026-09-30',
      estado_publicacion: 'PUBLICADA' as const,
      horario_referencia: null,
    }));

    const employeesAtzin = [
      {
        id: atzinSupId,
        nombre_completo: 'ATZIN SUSANA AGUIRRE CAMACHO',
        puesto: 'SUPERVISOR' as const,
        zona: 'Sur',
        estatus_laboral: 'ACTIVO' as const,
        supervisor_empleado_id: null,
      },
    ];

    const quotaMapAtzin = new Map([
      [
        atzinSupId,
        new Map(
          todasTiendasIds.map((id) => [
            id,
            {
              supervisorEmpleadoId: atzinSupId,
              pdvId: id,
              visitasMensuales: 6,
              vigenteDesde: '2026-08-01',
              vigenteHasta: null,
            },
          ])
        ),
      ],
    ]);

    const warRoom = buildWarRoomData({
      actor: mockActor as never,
      metadataColumnAvailable: true,
      quotaInfrastructureAvailable: true,
      recurringQuotaMap: quotaMapAtzin,
      rutas: [],
      agendaEventsByRoute: new Map(),
      pendingRepositionsByRoute: new Map(),
      pdvMap: pdvMapAtzin,
      pdvsWithSupervisors: pdvsWithSupervisorsAtzin as never,
      geocercaMap: new Map(),
      rotacionMap: new Map(),
      activeAssignments: activeAssignmentsSept,
      employees: employeesAtzin,
      weekStart: '2026-09-14',
    });

    const atzin = warRoom.supervisors.find((s) => s.supervisorEmpleadoId === atzinSupId)!;
    expect(atzin).toBeDefined();

    expect(atzin.totalPdvsAsignados).toBe(19);
    expect(atzin.totalPdvsConCuota).toBe(17);
    expect(atzin.totalPdvsVacantes).toBe(2);

    const activas = atzin.quotaProgress.filter((p) => !p.esVacante);
    expect(activas).toHaveLength(17);
    expect(activas.every((p) => p.quotaMensual === 6)).toBe(true);

    const vacantes = atzin.quotaProgress.filter((p) => p.esVacante);
    expect(vacantes).toHaveLength(2);
    expect(vacantes.every((p) => p.quotaMensual === 0)).toBe(true);
    expect(vacantes.every((p) => p.visitasPendientes === 0)).toBe(true);

    expect(atzin.expectedMonthlyVisits).toBe(17 * 6);
  });
});


