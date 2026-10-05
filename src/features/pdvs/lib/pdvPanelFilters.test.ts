import { describe, expect, it } from 'vitest';
import {
  formatMonthLabel,
  normalizePdvsPanelFilters,
  resolveDefaultPdvsPanelFilters,
} from './pdvPanelFilters';

describe('resolveDefaultPdvsPanelFilters', () => {
  it('usa estatus activo por defecto para administracion', () => {
    expect(
      resolveDefaultPdvsPanelFilters(
        { empleadoId: 'emp-1', puesto: 'ADMINISTRADOR' },
        {
          month: '2026-05',
          search: '',
          cadenaId: '',
          ciudadId: '',
          estado: '',
          zona: '',
          supervisorId: '',
          estatus: '',
          publicacionEstado: '',
        }
      )
    ).toEqual({
      month: '2026-05',
      search: '',
      cadenaId: '',
      ciudadId: '',
      estado: '',
      zona: '',
      supervisorId: '',
      estatus: '',
      publicacionEstado: '',
    });
  });

  it('usa el supervisor propio como vista base cuando el actor es supervisor', () => {
    expect(
      resolveDefaultPdvsPanelFilters(
        { empleadoId: 'sup-1', puesto: 'SUPERVISOR' },
        {
          month: '2026-05',
          search: '',
          cadenaId: '',
          ciudadId: '',
          estado: '',
          zona: '',
          supervisorId: '',
          estatus: '',
          publicacionEstado: '',
        }
      )
    ).toEqual({
      month: '2026-05',
      search: '',
      cadenaId: '',
      ciudadId: '',
      estado: '',
      zona: '',
      supervisorId: 'sup-1',
      estatus: '',
      publicacionEstado: '',
    });
  });

  it('respeta filtros ya activos', () => {
    expect(
      resolveDefaultPdvsPanelFilters(
        { empleadoId: 'emp-1', puesto: 'ADMINISTRADOR' },
        {
          month: '2026-05',
          search: 'mazatlan',
          cadenaId: '',
          ciudadId: '',
          estado: '',
          zona: '',
          supervisorId: '',
          estatus: '',
          publicacionEstado: '',
        }
      )
    ).toEqual({
      month: '2026-05',
      search: 'mazatlan',
      cadenaId: '',
      ciudadId: '',
      estado: '',
      zona: '',
      supervisorId: '',
      estatus: '',
      publicacionEstado: '',
    });
  });

  it('normaliza el mes y el estado mensual de publicacion', () => {
    const filters = normalizePdvsPanelFilters({
      month: '2026-05',
      publicacionEstado: ' parcial ',
    });

    expect(filters.month).toBe('2026-05');
    expect(filters.publicacionEstado).toBe('PARCIAL');
  });

  it('formatea correctamente etiquetas de mes con formatMonthLabel', () => {
    expect(formatMonthLabel('2026-09')).toBe('septiembre de 2026');
    expect(formatMonthLabel('2026-10')).toBe('octubre de 2026');
    expect(formatMonthLabel(null)).toBe('Sin mes');
    expect(formatMonthLabel('')).toBe('Sin mes');
    expect(formatMonthLabel('invalido')).toBe('Sin mes');
  });
});
