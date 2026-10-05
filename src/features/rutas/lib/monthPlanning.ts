import { getIsoDateInMexicoCity } from '@/lib/geo/mexicoStateTimezone';
import { getWeekDateIso, getWeekEndIso, getWeekStartIso, normalizeWeekStart } from './weeklyRoute';

const PLANNING_WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

export interface PlanningMonthDay {
  fecha: string;
  numero: number;
  letra: (typeof PLANNING_WEEKDAY_LETTERS)[number];
  weekdayNumber: number;
  weekStart: string;
}

export interface PlanningMonthWeek {
  weekIndex: number;
  weekStart: string;
  weekEnd: string;
  label: string;
  shortLabel: string;
  isCurrentWeek: boolean;
}

export interface PlanningMonthOption {
  value: string; // YYYY-MM
  label: string; // Ej: 'Septiembre 2026'
  isCurrentMonth: boolean;
}

const MESES_NOMBRES: Record<number, string> = {
  1: 'Enero',
  2: 'Febrero',
  3: 'Marzo',
  4: 'Abril',
  5: 'Mayo',
  6: 'Junio',
  7: 'Julio',
  8: 'Agosto',
  9: 'Septiembre',
  10: 'Octubre',
  11: 'Noviembre',
  12: 'Diciembre',
};

function formatShortDate(dateIso: string): string {
  if (!dateIso) return '';
  const [, month, day] = dateIso.split('-');
  return `${day}/${month}`;
}

export function formatPlanningMonthLabel(monthIso: string): string {
  if (!monthIso || !/^\d{4}-\d{2}$/.test(monthIso)) {
    const today = getIsoDateInMexicoCity();
    monthIso = today.slice(0, 7);
  }
  const [yearRaw, monthRaw] = monthIso.split('-');
  const monthNum = Number(monthRaw);
  const nombreMes = MESES_NOMBRES[monthNum] || `Mes ${monthNum}`;
  return `${nombreMes} ${yearRaw}`;
}

export function getPlanningMonthIso(referenceIso?: string): string {
  const safeDateIso =
    typeof referenceIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(referenceIso)
      ? referenceIso
      : getIsoDateInMexicoCity();
  return safeDateIso.slice(0, 7);
}

export function isDateInPlanningMonth(dateIso: string, monthIso: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateIso) && /^\d{4}-\d{2}$/.test(monthIso)
    ? dateIso.slice(0, 7) === monthIso
    : false;
}

export function getPlanningMonthWeeks(monthIso: string): PlanningMonthWeek[] {
  if (!monthIso || !/^\d{4}-\d{2}$/.test(monthIso)) {
    monthIso = getPlanningMonthIso();
  }

  const [yearNum, monthNum] = monthIso.split('-').map(Number);
  const currentWeekStart = getWeekStartIso();

  // Encontrar el primer día del mes
  const firstDayOfMonth = new Date(Date.UTC(yearNum, monthNum - 1, 1));
  // Primer lunes del mes o lunes previo si el 1ro no es lunes
  let currentMondayIso = getWeekStartIso(firstDayOfMonth.toISOString().slice(0, 10));

  const weeks: PlanningMonthWeek[] = [];
  let weekIndex = 1;

  // Recorrer las semanas mientras el lunes o al menos 4 días de la semana caigan en el mes
  while (true) {
    const weekStart = currentMondayIso;
    const weekEnd = getWeekEndIso(weekStart);

    // Revisar si la semana pertenece a este mes (el lunes cae en el mes o la mitad de la semana)
    const weekStartMonth = Number(weekStart.slice(5, 7));
    const weekEndMonth = Number(weekEnd.slice(5, 7));

    if (weekStartMonth !== monthNum && weekEndMonth !== monthNum) {
      break;
    }

    // Si el lunes pertenece al mes siguiente, detener
    if (weekStart.slice(0, 7) > monthIso) {
      break;
    }

    weeks.push({
      weekIndex,
      weekStart,
      weekEnd,
      label: `Semana ${weekIndex} (${formatShortDate(weekStart)} - ${formatShortDate(weekEnd)})`,
      shortLabel: `Sem. ${weekIndex}`,
      isCurrentWeek: weekStart === currentWeekStart,
    });

    weekIndex += 1;

    // Siguiente lunes
    const nextMondayDate = new Date(`${weekStart}T12:00:00Z`);
    nextMondayDate.setUTCDate(nextMondayDate.getUTCDate() + 7);
    currentMondayIso = nextMondayDate.toISOString().slice(0, 10);
  }

  return weeks;
}

export function getPlanningMonthDays(monthIso: string): PlanningMonthDay[] {
  const normalizedMonth = /^\d{4}-\d{2}$/.test(monthIso) ? monthIso : getPlanningMonthIso();
  const year = Number(normalizedMonth.slice(0, 4));
  const month = Number(normalizedMonth.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return Array.from({ length: lastDay }, (_, index) => {
    const numero = index + 1;
    const fecha = `${normalizedMonth}-${String(numero).padStart(2, '0')}`;
    const weekdayNumber = new Date(`${fecha}T12:00:00.000Z`).getUTCDay() || 7;
    return {
      fecha,
      numero,
      letra: PLANNING_WEEKDAY_LETTERS[weekdayNumber - 1],
      weekdayNumber,
      weekStart: getWeekStartIso(fecha),
    } satisfies PlanningMonthDay;
  });
}

export function getPlanningMonthOptions(referenceIso?: string): PlanningMonthOption[] {
  const todayIso = getIsoDateInMexicoCity();
  const currentMonthIso = getPlanningMonthIso(referenceIso || todayIso);

  const [yearNum, monthNum] = currentMonthIso.split('-').map(Number);
  const options: PlanningMonthOption[] = [];

  // Incluir mes anterior, mes actual, y 2 meses siguientes
  for (let offset = -1; offset <= 3; offset += 1) {
    const targetDate = new Date(Date.UTC(yearNum, monthNum - 1 + offset, 1));
    const targetMonthIso = targetDate.toISOString().slice(0, 7);
    const isCurrent = targetMonthIso === todayIso.slice(0, 7);

    options.push({
      value: targetMonthIso,
      label: formatPlanningMonthLabel(targetMonthIso),
      isCurrentMonth: isCurrent,
    });
  }

  return options;
}

export interface MinimalDraftVisit {
  visitId: string | null;
  pdvId: string;
  day: number;
}

export function cloneWeeklyPlanToMonthVisits<T extends MinimalDraftVisit>(
  sourceDrafts: T[],
  targetWeekStarts: string[],
  planningMonth?: string
): Record<string, T[]> {
  const result: Record<string, T[]> = {};

  for (const weekStart of targetWeekStarts) {
    const normalizedWeek = normalizeWeekStart(weekStart);
    result[normalizedWeek] = sourceDrafts
      .filter(
        (draft) =>
          !planningMonth ||
          isDateInPlanningMonth(getWeekDateIso(normalizedWeek, draft.day), planningMonth)
      )
      .map((draft, idx) => ({
        ...draft,
        // Generar cliente ID / visit ID nulo para nuevos inserts
        visitId: null,
        clientId: `cloned-${normalizedWeek}-${draft.pdvId}-${draft.day}-${idx}`,
      }));
  }

  return result;
}
