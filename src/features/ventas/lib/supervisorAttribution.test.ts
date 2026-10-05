import { describe, expect, it } from 'vitest';
import {
  buildResolvedSupervisorLookup,
  resolveEffectiveSupervisorId,
} from './supervisorAttribution';

describe('atribución temporal de supervisor', () => {
  const assignments = [
    {
      empleado_id: 'dc-1',
      pdv_id: 'pdv-1',
      supervisor_empleado_id: 'supervisor-agosto',
      fecha_inicio: '2026-08-01',
      fecha_fin: '2026-08-31',
    },
    {
      empleado_id: 'dc-1',
      pdv_id: 'pdv-1',
      supervisor_empleado_id: 'supervisor-septiembre',
      fecha_inicio: '2026-09-01',
      fecha_fin: null,
    },
  ];

  it('conserva agosto con el supervisor anterior aunque el empleado ya apunte al sucesor', () => {
    expect(
      resolveEffectiveSupervisorId({
        empleadoId: 'dc-1',
        pdvId: 'pdv-1',
        operationDate: '2026-08-31',
        assignments,
        supervisorPdvs: [],
        employeeSupervisorId: 'supervisor-septiembre',
      })
    ).toBe('supervisor-agosto');
  });

  it('atribuye septiembre al nuevo supervisor desde su fecha efectiva', () => {
    expect(
      resolveEffectiveSupervisorId({
        empleadoId: 'dc-1',
        pdvId: 'pdv-1',
        operationDate: '2026-09-01',
        assignments,
        supervisorPdvs: [],
        employeeSupervisorId: 'supervisor-agosto',
      })
    ).toBe('supervisor-septiembre');
  });

  describe('atribución histórica con asignacion_diaria_resuelta (resolvedMap)', () => {
    const jacquelineId = 'sup-jacqueline';
    const zenaidaId = 'sup-zenaida';
    const xochitlId = 'sup-xochitl';

    const dermoAna = 'dermo-ana-lilia';
    const pdvCamarones = 'pdv-camarones';

    const dermoMartha = 'dermo-martha';
    const pdvTecamachalco = 'pdv-tecamachalco';

    const adrRecordsSep = [
      {
        fecha: '2026-09-03',
        empleado_id: dermoAna,
        pdv_id: pdvCamarones,
        supervisor_empleado_id: jacquelineId,
      },
      {
        fecha: '2026-09-04',
        empleado_id: dermoAna,
        pdv_id: pdvCamarones,
        supervisor_empleado_id: jacquelineId,
      },
      {
        fecha: '2026-09-03',
        empleado_id: dermoMartha,
        pdv_id: pdvTecamachalco,
        supervisor_empleado_id: xochitlId,
      },
    ];

    it('construye correctamente las estructuras de búsqueda rápida (buildResolvedSupervisorLookup)', () => {
      const lookup = buildResolvedSupervisorLookup(adrRecordsSep);

      expect(lookup.byDate.get(`${dermoAna}_${pdvCamarones}_2026-09-03`)).toBe(jacquelineId);
      expect(lookup.byPair.get(`${dermoAna}_${pdvCamarones}`)).toBe(jacquelineId);
      expect(lookup.byEmpleado.get(dermoAna)).toBe(jacquelineId);
      expect(lookup.byPdv.get(pdvTecamachalco)).toBe(xochitlId);
    });

    it('atribuye la venta de septiembre a Jacqueline aunque la dermo ahora tenga supervisor Zenaida en ficha estática', () => {
      const lookupSep = buildResolvedSupervisorLookup(adrRecordsSep);

      const resolvedSupervisor = resolveEffectiveSupervisorId({
        empleadoId: dermoAna,
        pdvId: pdvCamarones,
        operationDate: '2026-09-03',
        resolvedMap: lookupSep,
        employeeSupervisorId: zenaidaId, // En octubre se cambió a Zenaida
      });

      expect(resolvedSupervisor).toBe(jacquelineId);
    });

    it('resuelve por par (empleado, pdv) del mes si la fecha exacta no tuvo jornada en el mapa diario', () => {
      const lookupSep = buildResolvedSupervisorLookup(adrRecordsSep);

      // Domingo o día sin registro en adrRecordsSep
      const resolvedSupervisor = resolveEffectiveSupervisorId({
        empleadoId: dermoAna,
        pdvId: pdvCamarones,
        operationDate: '2026-09-20',
        resolvedMap: lookupSep,
        employeeSupervisorId: zenaidaId,
      });

      expect(resolvedSupervisor).toBe(jacquelineId);
    });

    it('no mezcla tiendas entre meses: Tecamachalco en septiembre pertenece a Xochitl, no a Jacqueline', () => {
      const lookupSep = buildResolvedSupervisorLookup(adrRecordsSep);

      const resolvedSupervisor = resolveEffectiveSupervisorId({
        empleadoId: dermoMartha,
        pdvId: pdvTecamachalco,
        operationDate: '2026-09-03',
        resolvedMap: lookupSep,
        employeeSupervisorId: jacquelineId, // En octubre se pasó a Jacqueline
      });

      expect(resolvedSupervisor).toBe(xochitlId);
    });
  });
});

