import { getIsoDateInMexicoCity } from '@/lib/geo/mexicoStateTimezone';
import { getWeekDateIso, getWeekStartIso } from './weeklyRoute';

export const RUTA_CALENDAR_WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

export interface RutaCalendarDay {
  fecha: string;
  numero: number;
  letra: (typeof RUTA_CALENDAR_WEEKDAY_LETTERS)[number];
  nombre: string;
  esHoy: boolean;
}

export function normalizeRouteCalendarMonth(value?: string | null) {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const month = Number(value.slice(5, 7));
    if (month >= 1 && month <= 12) {
      return value;
    }
  }

  return getIsoDateInMexicoCity().slice(0, 7);
}

export function formatRouteCalendarMonth(monthIso: string) {
  const normalized = normalizeRouteCalendarMonth(monthIso);
  const monthNumber = Number(normalized.slice(5, 7));
  return `${MONTH_NAMES[monthNumber - 1]} ${normalized.slice(0, 4)}`;
}

export function shiftRouteCalendarMonth(monthIso: string, offset: number) {
  const normalized = normalizeRouteCalendarMonth(monthIso);
  const date = new Date(`${normalized}-01T12:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + offset, 1);
  return date.toISOString().slice(0, 7);
}

export function getRouteCalendarMonthDays(monthIso: string, todayIso = getIsoDateInMexicoCity()) {
  const normalized = normalizeRouteCalendarMonth(monthIso);
  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return Array.from({ length: lastDay }, (_, index) => {
    const numero = index + 1;
    const date = new Date(Date.UTC(year, month - 1, numero));
    const weekdayNumber = date.getUTCDay() || 7;

    return {
      fecha: `${normalized}-${String(numero).padStart(2, '0')}`,
      numero,
      letra: RUTA_CALENDAR_WEEKDAY_LETTERS[weekdayNumber - 1],
      nombre: new Intl.DateTimeFormat('es-MX', {
        weekday: 'long',
        timeZone: 'UTC',
      }).format(date),
      esHoy: `${normalized}-${String(numero).padStart(2, '0')}` === todayIso,
    } satisfies RutaCalendarDay;
  });
}

export function getRouteCalendarWeekRange(monthIso: string) {
  const days = getRouteCalendarMonthDays(monthIso);
  const firstDay = days[0]?.fecha ?? `${normalizeRouteCalendarMonth(monthIso)}-01`;
  const lastDay = days.at(-1)?.fecha ?? firstDay;
  const lowerBound = new Date(`${firstDay}T12:00:00.000Z`);
  lowerBound.setUTCDate(lowerBound.getUTCDate() - 6);

  return {
    monthStart: firstDay,
    monthEnd: lastDay,
    routeStart: lowerBound.toISOString().slice(0, 10),
    routeEnd: lastDay,
  };
}

export function getRouteCalendarDateForVisit(weekStart: string, dayNumber: number) {
  return getWeekDateIso(getWeekStartIso(weekStart), dayNumber);
}

export function isIsoDateInMonth(value: string, monthIso: string) {
  return value.slice(0, 7) === normalizeRouteCalendarMonth(monthIso);
}

export function formatRouteCalendarDate(value: string) {
  const [, month, day] = value.split('-');
  return `${day}/${month}`;
}
