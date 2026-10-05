import { describe, expect, it } from 'vitest';
import {
  formatRouteCalendarMonth,
  getRouteCalendarDateForVisit,
  getRouteCalendarMonthDays,
  getRouteCalendarWeekRange,
  normalizeRouteCalendarMonth,
  shiftRouteCalendarMonth,
} from './rutaCalendar';

describe('rutaCalendar', () => {
  it('genera todos los días del mes con las letras operativas correctas', () => {
    const days = getRouteCalendarMonthDays('2026-08', '2026-08-15');

    expect(days).toHaveLength(31);
    expect(days[0]).toMatchObject({ fecha: '2026-08-01', numero: 1, letra: 'S' });
    expect(days[1]).toMatchObject({ fecha: '2026-08-02', numero: 2, letra: 'D' });
    expect(days[14]?.esHoy).toBe(true);
  });

  it('incluye el lunes de una semana solapada al consultar el mes', () => {
    expect(getRouteCalendarWeekRange('2026-08')).toMatchObject({
      monthStart: '2026-08-01',
      monthEnd: '2026-08-31',
      routeStart: '2026-07-26',
      routeEnd: '2026-08-31',
    });
    expect(getRouteCalendarDateForVisit('2026-07-27', 7)).toBe('2026-08-02');
  });

  it('normaliza y desplaza meses sin alterar la zona horaria operativa', () => {
    expect(normalizeRouteCalendarMonth('2026-99')).toMatch(/^\d{4}-\d{2}$/);
    expect(shiftRouteCalendarMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftRouteCalendarMonth('2026-12', 1)).toBe('2027-01');
    expect(formatRouteCalendarMonth('2026-08')).toBe('Agosto 2026');
  });
});
