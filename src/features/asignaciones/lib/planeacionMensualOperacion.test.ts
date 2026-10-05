import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PlaneacionMensualOperacion } from '@/features/asignaciones/types/planeacionMensual';
import {
  collectPlaneacionMensualOperationPdvIds,
  isValidPlaneacionSchedule,
  validatePlaneacionMensualOperacion,
} from './planeacionMensualOperacion';

const base: PlaneacionMensualOperacion = {
  tipoOperacion: 'LIBERAR_DC',
  empleadoId: '11111111-1111-4111-8111-111111111111',
  pdvOrigenId: '22222222-2222-4222-8222-222222222222',
  fechaInicio: '2026-08-24',
  motivo: 'Cambio operativo confirmado',
};

describe('planeacionMensualOperacion', () => {
  it('acepta los turnos estándar y rangos directos, pero rechaza horas ambiguas', () => {
    expect(
      ['M', 'TCM', 'TC', 'TC_12', 'TCV', 'V1', 'V', 'ES1/ACT', 'CAP', 'VC'].every(
        isValidPlaneacionSchedule
      )
    ).toBe(true);
    expect(isValidPlaneacionSchedule('09:00-18:00')).toBe(true);
    expect(isValidPlaneacionSchedule('9 a 6')).toBe(false);
  });

  it('exige grupo para rotación y permite convertir el PDV a fijo sin grupo', () => {
    const rotativa = validatePlaneacionMensualOperacion({
      ...base,
      tipoOperacion: 'CAMBIAR_ROTACION',
      empleadoId: null,
      payload: { tipo: 'ROTATIVA', factorTiempo: 0.5 },
    });
    const fija = validatePlaneacionMensualOperacion({
      ...base,
      tipoOperacion: 'CAMBIAR_ROTACION',
      empleadoId: null,
      payload: { tipo: 'FIJA', factorTiempo: 1 },
    });

    expect(rotativa.map((item) => item.code)).toContain('GRUPO_ROTACION_REQUERIDO');
    expect(fija).toEqual([]);
  });

  it('acepta grupos rotativos completos y evita usar el slot C en grupos de dos', () => {
    const valid = validatePlaneacionMensualOperacion({
      ...base,
      tipoOperacion: 'CAMBIAR_ROTACION',
      empleadoId: null,
      payload: {
        tipo: 'ROTATIVA',
        factorTiempo: 0.5,
        grupoRotacion: 'SAN-PABLO-NORTE',
        grupoTamano: 2,
        slotRotacion: 'A',
      },
    });
    const invalid = validatePlaneacionMensualOperacion({
      ...base,
      tipoOperacion: 'CAMBIAR_ROTACION',
      empleadoId: null,
      payload: {
        tipo: 'ROTATIVA',
        factorTiempo: 0.5,
        grupoRotacion: 'SAN-PABLO-NORTE',
        grupoTamano: 2,
        slotRotacion: 'C',
      },
    });

    expect(valid).toEqual([]);
    expect(invalid.map((item) => item.code)).toContain('SLOT_ROTACION_FUERA_DE_GRUPO');
  });

  it('bloquea una sustitución sin sucesor o con el mismo supervisor', () => {
    expect(
      validatePlaneacionMensualOperacion({
        ...base,
        tipoOperacion: 'REASIGNAR_SUPERVISOR',
        empleadoId: null,
        pdvOrigenId: null,
        payload: {
          supervisorOrigenId: '33333333-3333-4333-8333-333333333333',
          supervisorDestinoId: '33333333-3333-4333-8333-333333333333',
        },
      }).map((item) => item.code)
    ).toContain('SUPERVISORES_IGUALES');
  });

  it('requiere nombre y fecha final para un evento que desplaza la tienda', () => {
    expect(
      validatePlaneacionMensualOperacion({
        ...base,
        tipoOperacion: 'AGREGAR_EVENTO',
        pdvOrigenId: null,
        payload: {},
      }).map((item) => item.code)
    ).toEqual(expect.arrayContaining(['EVENTO_NOMBRE_REQUERIDO', 'EVENTO_FIN_REQUERIDO']));
  });

  it('deduplica los PDVs afectados para rematerialización y caché', () => {
    expect(
      collectPlaneacionMensualOperationPdvIds([
        base,
        { ...base, tipoOperacion: 'MOVER_DC', pdvDestinoId: base.pdvOrigenId },
      ])
    ).toEqual([base.pdvOrigenId]);
  });

  it('propiedad: ningún rango invertido se acepta', () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date('2026-01-02T00:00:00Z'),
          max: new Date('2030-12-31T00:00:00Z'),
          noInvalidDate: true,
        }),
        fc.integer({ min: 1, max: 90 }),
        (start, offset) => {
          const startIso = start.toISOString().slice(0, 10);
          const endIso = new Date(start.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
          const issues = validatePlaneacionMensualOperacion({
            ...base,
            fechaInicio: startIso,
            fechaFin: endIso,
          });
          expect(issues.some((item) => item.code === 'RANGO_INVALIDO')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
