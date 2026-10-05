import { describe, expect, it } from 'vitest';
import {
  buildLaborDaysFromRestDay,
  normalizeDiaLaboralCode,
  parseDiasLaborales,
} from './assignmentPlanning';

describe('assignmentPlanning - descanso recurrente y dias laborales', () => {
  it('genera correctamente los 6 dias laborales activos cuando el descanso es MIE', () => {
    const laborDays = buildLaborDaysFromRestDay('MIE');
    expect(laborDays).toBe('LUN,MAR,JUE,VIE,SAB,DOM');

    const parsed = parseDiasLaborales(laborDays);
    expect(parsed.dias).toEqual(['LUN', 'MAR', 'JUE', 'VIE', 'SAB', 'DOM']);
    expect(parsed.dias.includes('DOM')).toBe(true);
    expect(parsed.dias.includes('MIE')).toBe(false);
  });

  it('genera correctamente los 6 dias laborales activos cuando el descanso es DOM', () => {
    const laborDays = buildLaborDaysFromRestDay('DOM');
    expect(laborDays).toBe('LUN,MAR,MIE,JUE,VIE,SAB');

    const parsed = parseDiasLaborales(laborDays);
    expect(parsed.dias).toEqual(['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB']);
    expect(parsed.dias.includes('DOM')).toBe(false);
  });

  it('normaliza correctamente nombres y alias de dias', () => {
    expect(normalizeDiaLaboralCode('miercoles')).toBe('MIE');
    expect(normalizeDiaLaboralCode('MIERCOLES')).toBe('MIE');
    expect(normalizeDiaLaboralCode('Miércoles')).toBe('MIE');
    expect(normalizeDiaLaboralCode('domingo')).toBe('DOM');
    expect(normalizeDiaLaboralCode('DOMINGO')).toBe('DOM');
    expect(normalizeDiaLaboralCode('sabado')).toBe('SAB');
  });

  it('retorna valor por defecto seguro si el descanso es vacio o nulo', () => {
    expect(buildLaborDaysFromRestDay(null)).toBe('LUN,MAR,MIE,JUE,VIE,SAB');
    expect(buildLaborDaysFromRestDay('')).toBe('LUN,MAR,MIE,JUE,VIE,SAB');
  });
});
