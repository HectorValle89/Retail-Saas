// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx');

export const QUOTA_WEEKDAY_CODES = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'] as const;

export type QuotaWeekdayCode = (typeof QUOTA_WEEKDAY_CODES)[number];
export type PlaneacionCuotaPesos = Record<QuotaWeekdayCode, number>;

export interface PlaneacionCuotaImportRow {
  rowNumber: number;
  mes: string;
  claveBtl: string;
  cuotaMensual: number;
  pesos: PlaneacionCuotaPesos;
}

export type PlaneacionCuotaImportIssueCode =
  | 'FILA_SIN_BTL'
  | 'FILA_DUPLICADA'
  | 'MES_INVALIDO'
  | 'MES_NO_COINCIDE'
  | 'MONTO_INVALIDO'
  | 'MONTO_NEGATIVO'
  | 'PESO_INVALIDO'
  | 'PESOS_SIN_DIAS';

export interface PlaneacionCuotaImportIssue {
  rowNumber: number;
  code: PlaneacionCuotaImportIssueCode;
  severity: 'ERROR';
  message: string;
}

export interface PlaneacionCuotaImportResult {
  rows: PlaneacionCuotaImportRow[];
  skippedRows: number;
  issues: PlaneacionCuotaImportIssue[];
}

export interface PlaneacionCuotaDiaDistribuido {
  fecha: string;
  montoCuota: number;
  pesoDia: number;
}

const DEFAULT_WEIGHTS: PlaneacionCuotaPesos = {
  LUN: 1,
  MAR: 1,
  MIE: 1,
  JUE: 1,
  VIE: 1,
  SAB: 1,
  DOM: 1,
};

const MAX_QUOTA_AMOUNT = 999_999_999_999.99;

function stripDiacritics(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeHeaderKey(header: unknown) {
  return stripDiacritics(String(header ?? ''))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeText(value: unknown) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeClaveBtl(value: unknown) {
  const normalized = normalizeText(value);
  return normalized ? normalized.toUpperCase() : null;
}

function parseMonth(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getUTCFullYear()).padStart(4, '0')}-${String(
      value.getUTCMonth() + 1
    ).padStart(2, '0')}-01`;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-01`;
    }
  }

  const normalized = normalizeText(value);
  if (!normalized) return null;

  const isoMatch = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(normalized);
  const slashMatch = /^(\d{1,2})\/(\d{4})$/.exec(normalized);
  const year = Number(isoMatch?.[1] ?? slashMatch?.[2]);
  const month = Number(isoMatch?.[2] ?? slashMatch?.[1]);

  if (!Number.isInteger(year) || year < 2000 || year > 2100 || month < 1 || month > 12) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

function parseLocalizedNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const text = normalizeText(value);
  if (!text) return null;

  let normalized = text.replace(/[$%\s]/g, '');
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    const decimalDigits = normalized.length - lastComma - 1;
    normalized =
      decimalDigits > 0 && decimalDigits <= 2
        ? normalized.replace(/\./g, '').replace(',', '.')
        : normalized.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const decimalDigits = normalized.length - lastDot - 1;
    if (decimalDigits > 2) normalized = normalized.replace(/\./g, '');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function lookupValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return null;
}

function isBlankRow(row: Record<string, unknown>) {
  return Object.values(row).every((value) => normalizeText(value) === null);
}

function parseWeights(
  row: Record<string, unknown>,
  rowNumber: number,
  issues: PlaneacionCuotaImportIssue[]
) {
  const pesos = { ...DEFAULT_WEIGHTS };
  let invalid = false;

  for (const code of QUOTA_WEEKDAY_CODES) {
    const raw = lookupValue(row, [`PESO_${code}`, `PONDERACION_${code}`]);
    if (raw === null) continue;

    const parsed = parseLocalizedNumber(raw);
    if (parsed === null || parsed < 0 || parsed > 100) {
      issues.push({
        rowNumber,
        code: 'PESO_INVALIDO',
        severity: 'ERROR',
        message: `El peso ${code} debe ser un número entre 0 y 100.`,
      });
      invalid = true;
      continue;
    }
    pesos[code] = parsed;
  }

  if (!invalid && QUOTA_WEEKDAY_CODES.every((code) => pesos[code] === 0)) {
    issues.push({
      rowNumber,
      code: 'PESOS_SIN_DIAS',
      severity: 'ERROR',
      message: 'Al menos un día de la semana debe tener un peso mayor que cero.',
    });
    invalid = true;
  }

  return { pesos, invalid };
}

export function parsePlaneacionCuotaWorkbook(
  buffer: Buffer | Uint8Array
): PlaneacionCuotaImportResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const preferredSheet = workbook.SheetNames.find(
    (name) => normalizeHeaderKey(name) === 'CUOTAS_MENSUALES'
  );
  const sheetName = preferredSheet ?? workbook.SheetNames[0];
  if (!sheetName) throw new Error('El archivo no contiene hojas legibles.');

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const rows: PlaneacionCuotaImportRow[] = [];
  const issues: PlaneacionCuotaImportIssue[] = [];
  const seen = new Set<string>();
  let skippedRows = 0;

  rawRows.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const normalizedRow = Object.fromEntries(
      Object.entries(rawRow).map(([key, value]) => [normalizeHeaderKey(key), value])
    );
    if (isBlankRow(normalizedRow)) return;

    const issueCountBefore = issues.length;
    const claveBtl = normalizeClaveBtl(
      lookupValue(normalizedRow, ['BTL_CVE', 'CLAVE_BTL', 'PDV_CLAVE_BTL'])
    );
    const mes = parseMonth(lookupValue(normalizedRow, ['MES', 'PERIODO', 'MES_CUOTA']));
    const rawQuota = lookupValue(normalizedRow, ['CUOTA_MENSUAL', 'CUOTA', 'MONTO_CUOTA']);
    const cuotaMensual = parseLocalizedNumber(rawQuota);
    const { pesos, invalid: invalidWeights } = parseWeights(normalizedRow, rowNumber, issues);

    if (rawQuota === null && claveBtl && mes && !invalidWeights) {
      skippedRows += 1;
      return;
    }

    if (!claveBtl) {
      issues.push({
        rowNumber,
        code: 'FILA_SIN_BTL',
        severity: 'ERROR',
        message: 'La fila no contiene una clave BTL de PDV.',
      });
    }
    if (!mes) {
      issues.push({
        rowNumber,
        code: 'MES_INVALIDO',
        severity: 'ERROR',
        message: 'El mes debe usar YYYY-MM, YYYY-MM-01 o MM/YYYY.',
      });
    }
    if (cuotaMensual === null || cuotaMensual > MAX_QUOTA_AMOUNT) {
      issues.push({
        rowNumber,
        code: 'MONTO_INVALIDO',
        severity: 'ERROR',
        message: 'La cuota mensual debe ser un número válido dentro del límite permitido.',
      });
    } else if (cuotaMensual < 0) {
      issues.push({
        rowNumber,
        code: 'MONTO_NEGATIVO',
        severity: 'ERROR',
        message: 'La cuota mensual no puede ser negativa.',
      });
    }

    if (claveBtl && mes) {
      const dedupeKey = `${mes}::${claveBtl}`;
      if (seen.has(dedupeKey)) {
        issues.push({
          rowNumber,
          code: 'FILA_DUPLICADA',
          severity: 'ERROR',
          message: `La combinación ${claveBtl} + ${mes.slice(0, 7)} está repetida.`,
        });
      } else {
        seen.add(dedupeKey);
      }
    }

    if (
      issues.length > issueCountBefore ||
      !claveBtl ||
      !mes ||
      cuotaMensual === null ||
      cuotaMensual < 0 ||
      cuotaMensual > MAX_QUOTA_AMOUNT ||
      invalidWeights
    ) {
      skippedRows += 1;
      return;
    }

    rows.push({
      rowNumber,
      mes,
      claveBtl,
      cuotaMensual: Math.round(cuotaMensual * 100) / 100,
      pesos,
    });
  });

  if (rows.length === 0 && issues.length === 0) {
    throw new Error('El archivo no contiene filas de cuotas para importar.');
  }

  return {
    rows,
    skippedRows,
    issues: issues.sort((left, right) => left.rowNumber - right.rowNumber),
  };
}

export function validateQuotaImportMonth(
  result: PlaneacionCuotaImportResult,
  expectedMonth: string
): PlaneacionCuotaImportIssue[] {
  return result.rows
    .filter((row) => row.mes !== expectedMonth)
    .map((row) => ({
      rowNumber: row.rowNumber,
      code: 'MES_NO_COINCIDE' as const,
      severity: 'ERROR' as const,
      message: `La fila pertenece a ${row.mes.slice(0, 7)} y la pantalla está en ${expectedMonth.slice(0, 7)}.`,
    }));
}

function weekdayCode(date: Date): QuotaWeekdayCode {
  return ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'][date.getUTCDay()] as QuotaWeekdayCode;
}

export function distributeMonthlyQuota(input: {
  mes: string;
  cuotaMensual: number;
  pesos: PlaneacionCuotaPesos;
}): PlaneacionCuotaDiaDistribuido[] {
  const year = Number(input.mes.slice(0, 4));
  const monthIndex = Number(input.mes.slice(5, 7)) - 1;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const dates = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(Date.UTC(year, monthIndex, index + 1));
    const code = weekdayCode(date);
    return {
      fecha: date.toISOString().slice(0, 10),
      pesoDia: input.pesos[code],
    };
  });
  const totalWeight = dates.reduce((total, day) => total + day.pesoDia, 0);
  if (!(totalWeight > 0)) throw new Error('La distribución mensual no contiene días ponderados.');

  const monthlyCents = Math.round(input.cuotaMensual * 100);
  const raw = dates.map((day, index) => {
    const exact = (monthlyCents * day.pesoDia) / totalWeight;
    const base = Math.floor(exact);
    return { ...day, index, base, remainder: exact - base };
  });
  let centsToDistribute = monthlyCents - raw.reduce((total, day) => total + day.base, 0);
  const byRemainder = [...raw].sort(
    (left, right) => right.remainder - left.remainder || left.index - right.index
  );
  const extra = new Set<number>();
  for (const day of byRemainder) {
    if (centsToDistribute <= 0) break;
    if (day.pesoDia > 0) {
      extra.add(day.index);
      centsToDistribute -= 1;
    }
  }

  return raw.map((day) => ({
    fecha: day.fecha,
    montoCuota: (day.base + (extra.has(day.index) ? 1 : 0)) / 100,
    pesoDia: day.pesoDia,
  }));
}
