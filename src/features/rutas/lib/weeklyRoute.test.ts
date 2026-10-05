import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPreviousWeekStartIso,
  getWeekDateIso,
  getWeekStartIso,
  isAssignmentActiveForMonth,
  isAssignmentActiveForWeek,
} from './weeklyRoute';

describe('weeklyRoute date helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('normaliza una fecha al inicio de la semana', () => {
    expect(getWeekStartIso('2026-04-19')).toBe('2026-04-13');
  });

  it('usa el dia operativo de Mexico cuando calcula la semana actual sin referencia', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-13T02:30:00.000Z'));

    expect(getWeekStartIso()).toBe('2026-04-06');
  });

  it('resuelve la semana anterior al inicio normalizado', () => {
    expect(getPreviousWeekStartIso('2026-04-19')).toBe('2026-04-06');
    expect(getPreviousWeekStartIso('2026-04-13')).toBe('2026-04-06');
  });

  it('convierte un dia operativo de ruta a fecha ISO dentro de la semana', () => {
    expect(getWeekDateIso('2026-04-20', 1)).toBe('2026-04-20');
    expect(getWeekDateIso('2026-04-20', 4)).toBe('2026-04-23');
    expect(getWeekDateIso('2026-04-20', 7)).toBe('2026-04-26');
  });

  it('reconoce asignaciones indefinidas (fecha_fin null) como activas a lo largo de las semanas y meses', () => {
    const indefiniteAssignment = {
      fecha_inicio: '2026-09-01',
      fecha_fin: null,
      estado_publicacion: 'PUBLICADA',
    };

    // Activa en la primera semana de septiembre
    expect(isAssignmentActiveForWeek(indefiniteAssignment, '2026-09-01', '2026-09-07')).toBe(true);
    // Activa a mediados de septiembre (semana 14 a 20)
    expect(isAssignmentActiveForWeek(indefiniteAssignment, '2026-09-14', '2026-09-20')).toBe(true);
    // Activa a finales de septiembre
    expect(isAssignmentActiveForWeek(indefiniteAssignment, '2026-09-28', '2026-10-04')).toBe(true);
    // Activa en todo el mes de septiembre
    expect(isAssignmentActiveForMonth(indefiniteAssignment, '2026-09')).toBe(true);
    // Activa en meses futuros
    expect(isAssignmentActiveForMonth(indefiniteAssignment, '2026-10')).toBe(true);
    // Inactiva en meses anteriores a su inicio
    expect(isAssignmentActiveForMonth(indefiniteAssignment, '2026-08')).toBe(false);
  });

  it('reconoce asignaciones con fecha de fin definida respetando su vigencia exacta', () => {
    const boundedAssignment = {
      fecha_inicio: '2026-09-01',
      fecha_fin: '2026-09-14',
      estado_publicacion: 'PUBLICADA',
    };

    // Activa en semana que se traslapa con el día 14
    expect(isAssignmentActiveForWeek(boundedAssignment, '2026-09-14', '2026-09-20')).toBe(true);
    // Inactiva en semana posterior a su fin
    expect(isAssignmentActiveForWeek(boundedAssignment, '2026-09-21', '2026-09-27')).toBe(false);
    // Activa en el mes de septiembre
    expect(isAssignmentActiveForMonth(boundedAssignment, '2026-09')).toBe(true);
    // Inactiva en octubre
    expect(isAssignmentActiveForMonth(boundedAssignment, '2026-10')).toBe(false);
  });
});
