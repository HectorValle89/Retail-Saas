import { describe, expect, it } from 'vitest';
import {
  cloneWeeklyPlanToMonthVisits,
  formatPlanningMonthLabel,
  getPlanningMonthIso,
  getPlanningMonthOptions,
  getPlanningMonthDays,
  getPlanningMonthWeeks,
  isDateInPlanningMonth,
} from './monthPlanning';

describe('monthPlanning', () => {
  it('debe obtener la clave YYYY-MM del mes de planificación', () => {
    expect(getPlanningMonthIso('2026-09-15')).toBe('2026-09');
  });

  it('debe formatear nombres de meses correctamente', () => {
    expect(formatPlanningMonthLabel('2026-09')).toBe('Septiembre 2026');
    expect(formatPlanningMonthLabel('2026-12')).toBe('Diciembre 2026');
    expect(formatPlanningMonthLabel('2026-01')).toBe('Enero 2026');
  });

  it('debe desglosar las semanas de un mes de planificación', () => {
    const weeks = getPlanningMonthWeeks('2026-09');
    expect(weeks.length).toBeGreaterThanOrEqual(4);
    expect(weeks[0].weekIndex).toBe(1);
    expect(weeks[0].label).toContain('Semana 1');
  });

  it('desglosa cada fecha del mes sin días externos', () => {
    const days = getPlanningMonthDays('2026-02');

    expect(days).toHaveLength(28);
    expect(days[0]).toMatchObject({ fecha: '2026-02-01', numero: 1, letra: 'D' });
    expect(days.at(-1)).toMatchObject({ fecha: '2026-02-28', numero: 28, letra: 'S' });
  });

  it('distingue los días del mes seleccionado en una semana compartida', () => {
    expect(isDateInPlanningMonth('2026-08-31', '2026-09')).toBe(false);
    expect(isDateInPlanningMonth('2026-09-01', '2026-09')).toBe(true);
  });

  it('debe generar opciones de meses incluyendo el mes actual y meses futuros', () => {
    const options = getPlanningMonthOptions('2026-08-05');
    expect(options.length).toBe(5);
    const hasAugust = options.some((opt) => opt.value === '2026-08');
    const hasSeptember = options.some((opt) => opt.value === '2026-09');
    expect(hasAugust).toBe(true);
    expect(hasSeptember).toBe(true);
  });

  it('debe clonar los borradores de una semana hacia múltiples semanas del mes', () => {
    const sourceDrafts = [
      { visitId: null, pdvId: 'pdv-1', day: 1 },
      { visitId: null, pdvId: 'pdv-2', day: 3 },
    ];
    const targetWeeks = ['2026-09-07', '2026-09-14'];

    const cloned = cloneWeeklyPlanToMonthVisits(sourceDrafts, targetWeeks);

    expect(Object.keys(cloned)).toHaveLength(2);
    expect(cloned['2026-09-07']).toHaveLength(2);
    expect(cloned['2026-09-14']).toHaveLength(2);
    expect(cloned['2026-09-07'][0].pdvId).toBe('pdv-1');
  });

  it('no replica visitas fuera del mes al cubrir una semana compartida', () => {
    const cloned = cloneWeeklyPlanToMonthVisits(
      [{ visitId: null, pdvId: 'pdv-1', day: 1 }],
      ['2026-08-31'],
      '2026-09'
    );

    expect(cloned['2026-08-31']).toEqual([]);
  });
});
