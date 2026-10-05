import { getIsoDateInMexicoCity } from '@/lib/geo/mexicoStateTimezone';

type ScheduledOffboardingEmployee = {
  fecha_baja?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function getFirstInactiveDate(lastWorkingDate: string) {
  const date = new Date(`${lastWorkingDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function isScheduledOffboardingEffective(
  employee: ScheduledOffboardingEmployee | null | undefined,
  operationDate = getIsoDateInMexicoCity()
) {
  if (!employee?.fecha_baja || employee.fecha_baja > operationDate) {
    return false;
  }

  return String(employee.metadata?.workflow_stage ?? '').trim() === 'BAJA_PROGRAMADA';
}
