import { describe, expect, it } from 'vitest';
import {
  resolveLastMileRealQuantity,
  validateLastMileCorrection,
  validateLastMileDelivery,
  type LastMileValidationDetail,
} from './materialLastMileValidation';

const baseDetail: LastMileValidationDetail = {
  distribucion_detalle_id: 'detalle-1',
  material_catalogo_id: 'material-1',
  cantidad_teorica: 10,
  estado_item: 'COMPLETO',
  cantidad_real_recibida: null,
};

describe('validateLastMileDelivery', () => {
  it('bloquea entrega sin foto fisica', () => {
    expect(() =>
      validateLastMileDelivery({
        detalles: [baseDetail],
        hasEntregaFisica: false,
        acuseCount: 1,
      })
    ).toThrow('entrega fisica');
  });

  it('bloquea entrega sin acuse firmado', () => {
    expect(() =>
      validateLastMileDelivery({
        detalles: [baseDetail],
        hasEntregaFisica: true,
        acuseCount: 0,
      })
    ).toThrow('acuse firmado');
  });

  it('permite modo por cubrir sin acuse firmado si hay foto de resguardo', () => {
    expect(() =>
      validateLastMileDelivery({
        detalles: [baseDetail],
        hasEntregaFisica: true,
        acuseCount: 0,
        modoEntrega: 'POR_CUBRIR',
      })
    ).not.toThrow();
  });

  it('permite entrega sin acuse firmado si el receptor es de cobertura general (TODOS)', () => {
    expect(() =>
      validateLastMileDelivery({
        detalles: [baseDetail],
        hasEntregaFisica: true,
        acuseCount: 0,
        modoEntrega: 'ENTREGA_DC',
        receptorOrigen: 'TODOS',
      })
    ).not.toThrow();
  });

  it('bloquea entrega sin materiales configurados', () => {
    expect(() =>
      validateLastMileDelivery({
        detalles: [],
        hasEntregaFisica: true,
        acuseCount: 1,
      })
    ).toThrow('al menos un material');
  });

  it('exige cantidad real cuando hay discrepancia', () => {
    expect(() =>
      validateLastMileDelivery({
        detalles: [
          {
            ...baseDetail,
            estado_item: 'CON_DISCREPANCIA',
            cantidad_real_recibida: null,
          },
        ],
        hasEntregaFisica: true,
        acuseCount: 1,
      })
    ).toThrow('cantidad real');
  });

  it('usa cantidad teorica como real cuando el item esta completo', () => {
    expect(resolveLastMileRealQuantity(baseDetail)).toBe(10);
  });
});

describe('validateLastMileCorrection', () => {
  it('permite corregir datos conservando evidencias existentes', () => {
    expect(() =>
      validateLastMileCorrection({
        detalles: [baseDetail],
        hasEffectiveEntregaFisica: true,
        effectiveAcuseCount: 1,
      })
    ).not.toThrow();
  });

  it('bloquea correccion sin acuse efectivo', () => {
    expect(() =>
      validateLastMileCorrection({
        detalles: [baseDetail],
        hasEffectiveEntregaFisica: true,
        effectiveAcuseCount: 0,
      })
    ).toThrow('acuse firmado');
  });

  it('permite correccion por cubrir sin acuse efectivo', () => {
    expect(() =>
      validateLastMileCorrection({
        detalles: [baseDetail],
        hasEffectiveEntregaFisica: true,
        effectiveAcuseCount: 0,
        modoEntrega: 'POR_CUBRIR',
      })
    ).not.toThrow();
  });

  it('permite correccion sin acuse efectivo si el receptor es de cobertura general (TODOS)', () => {
    expect(() =>
      validateLastMileCorrection({
        detalles: [baseDetail],
        hasEffectiveEntregaFisica: true,
        effectiveAcuseCount: 0,
        modoEntrega: 'ENTREGA_DC',
        receptorOrigen: 'TODOS',
      })
    ).not.toThrow();
  });
});
