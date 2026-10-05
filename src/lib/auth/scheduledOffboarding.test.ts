import { describe, expect, it } from 'vitest';
import { getFirstInactiveDate, isScheduledOffboardingEffective } from './scheduledOffboarding';

describe('isScheduledOffboardingEffective', () => {
  const employee = {
    fecha_baja: '2026-09-01',
    metadata: { workflow_stage: 'BAJA_PROGRAMADA' },
  };

  it('mantiene el acceso hasta el ultimo dia laborado', () => {
    expect(isScheduledOffboardingEffective(employee, '2026-08-31')).toBe(false);
  });

  it('corta el acceso desde el primer dia inactivo aunque el cron aun no corra', () => {
    expect(isScheduledOffboardingEffective(employee, '2026-09-01')).toBe(true);
    expect(isScheduledOffboardingEffective(employee, '2026-09-02')).toBe(true);
  });

  it('no altera expedientes que no sean una baja programada', () => {
    expect(
      isScheduledOffboardingEffective(
        { ...employee, metadata: { workflow_stage: 'PENDIENTE_BAJA_IMSS' } },
        '2026-09-01'
      )
    ).toBe(false);
  });
});

describe('getFirstInactiveDate', () => {
  it('convierte el ultimo dia laborado en el primer dia inactivo', () => {
    expect(getFirstInactiveDate('2026-08-31')).toBe('2026-09-01');
  });
});
