import { describe, it, expect } from 'vitest';
import {
  validateSupervisorSucesor,
  buildSupervisorBajaMessage,
  buildSupervisorPdvPayload,
} from './supervisorTransfer';

describe('validateSupervisorSucesor', () => {
  it('rechaza si no se proporciona supervisor sucesor', () => {
    const result = validateSupervisorSucesor('sup-1', null, null);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Debes seleccionar un supervisor sucesor');
  });

  it('rechaza si el supervisor sucesor es el mismo que se da de baja', () => {
    const result = validateSupervisorSucesor('sup-1', 'sup-1', {
      id: 'sup-1',
      puesto: 'SUPERVISOR',
      estatus_laboral: 'ACTIVO',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('distinto al que se da de baja');
  });

  it('rechaza si el colaborador seleccionado no es supervisor', () => {
    const result = validateSupervisorSucesor('sup-1', 'dc-2', {
      id: 'dc-2',
      puesto: 'DERMOCONSEJERO',
      estatus_laboral: 'ACTIVO',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('no es un supervisor activo');
  });

  it('rechaza si el supervisor seleccionado está en baja', () => {
    const result = validateSupervisorSucesor('sup-1', 'sup-2', {
      id: 'sup-2',
      puesto: 'SUPERVISOR',
      estatus_laboral: 'BAJA',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('no es un supervisor activo');
  });

  it('aprueba si el supervisor sucesor es válido, activo y distinto', () => {
    const result = validateSupervisorSucesor('sup-1', 'sup-2', {
      id: 'sup-2',
      puesto: 'SUPERVISOR',
      estatus_laboral: 'ACTIVO',
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

describe('buildSupervisorBajaMessage', () => {
  it('genera mensaje con detalle de tiendas y colaboradoras traspasadas', () => {
    const msg = buildSupervisorBajaMessage('MIGUEL ANGEL MONTAGNER', 15, 22);
    expect(msg).toContain('MIGUEL ANGEL MONTAGNER');
    expect(msg).toContain('15 tienda(s)');
    expect(msg).toContain('22 colaboradora(s)');
  });

  it('genera mensaje estándar si no hubo tiendas ni colaboradoras', () => {
    const msg = buildSupervisorBajaMessage('JUAN PEREZ', 0, 0);
    expect(msg).toBe(
      'La baja de JUAN PEREZ ha sido procesada de forma directa e inmediata.'
    );
  });
});

describe('buildSupervisorPdvPayload', () => {
  it('genera payload exacto sin columnas inexistentes como observaciones o cuenta_cliente_id', () => {
    const payload = buildSupervisorPdvPayload('pdv-123', 'sup-456', '2026-10-01');
    expect(payload).toEqual({
      pdv_id: 'pdv-123',
      empleado_id: 'sup-456',
      activo: true,
      fecha_inicio: '2026-10-01',
      fecha_fin: null,
    });
    expect((payload as unknown as Record<string, unknown>).observaciones).toBeUndefined();
    expect((payload as unknown as Record<string, unknown>).cuenta_cliente_id).toBeUndefined();
  });
});
