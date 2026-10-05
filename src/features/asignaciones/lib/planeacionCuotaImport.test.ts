import { expect, test } from 'vitest';
import * as XLSX from 'xlsx';
import fc from 'fast-check';
import {
  distributeMonthlyQuota,
  parsePlaneacionCuotaWorkbook,
  validateQuotaImportMonth,
} from './planeacionCuotaImport';
import { buildPlaneacionCuotaTemplateWorkbook } from './planeacionCuotaTemplate';

function buildWorkbook(rows: Record<string, unknown>[]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Cuotas_Mensuales');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test('parsea una cuota mensual por PDV y normaliza mes, moneda y pesos semanales', () => {
  const result = parsePlaneacionCuotaWorkbook(
    buildWorkbook([
      {
        MES: '2026-08',
        'BTL CVE': ' BTL-001 ',
        'CUOTA MENSUAL': '$31,000.00',
        'PESO LUN': 1,
        'PESO MAR': 1,
        'PESO MIE': 1,
        'PESO JUE': 1,
        'PESO VIE': 1.25,
        'PESO SAB': 1.5,
        'PESO DOM': 1.5,
      },
    ])
  );

  expect(result.issues).toEqual([]);
  expect(result.rows).toEqual([
    {
      rowNumber: 2,
      mes: '2026-08-01',
      claveBtl: 'BTL-001',
      cuotaMensual: 31000,
      pesos: {
        LUN: 1,
        MAR: 1,
        MIE: 1,
        JUE: 1,
        VIE: 1.25,
        SAB: 1.5,
        DOM: 1.5,
      },
    },
  ]);
});

test('distribuye todos los centavos del mes de forma determinista, incluido febrero bisiesto', () => {
  const days = distributeMonthlyQuota({
    mes: '2028-02-01',
    cuotaMensual: 1000,
    pesos: { LUN: 1, MAR: 1, MIE: 1, JUE: 1, VIE: 1, SAB: 1, DOM: 1 },
  });

  expect(days).toHaveLength(29);
  expect(days.reduce((total, day) => total + Math.round(day.montoCuota * 100), 0)).toBe(100_000);
  expect(days[0]).toEqual({ fecha: '2028-02-01', montoCuota: 34.49, pesoDia: 1 });
  expect(days.at(-1)).toEqual({ fecha: '2028-02-29', montoCuota: 34.48, pesoDia: 1 });
});

test('propiedad: cualquier cuota y ponderación válida conserva el total exacto al centavo', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 2024, max: 2032 }),
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 0, max: 100_000_000 }),
      fc
        .array(fc.integer({ min: 0, max: 10 }), { minLength: 7, maxLength: 7 })
        .filter((weights) => weights.some((weight) => weight > 0)),
      (year, month, quotaCents, weights) => {
        const pesos = Object.fromEntries(
          ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'].map((code, index) => [
            code,
            weights[index],
          ])
        ) as {
          LUN: number;
          MAR: number;
          MIE: number;
          JUE: number;
          VIE: number;
          SAB: number;
          DOM: number;
        };
        const days = distributeMonthlyQuota({
          mes: `${year}-${String(month).padStart(2, '0')}-01`,
          cuotaMensual: quotaCents / 100,
          pesos,
        });

        expect(days.reduce((total, day) => total + Math.round(day.montoCuota * 100), 0)).toBe(
          quotaCents
        );
        expect(days.every((day) => day.montoCuota >= 0)).toBe(true);
      }
    ),
    { numRuns: 150 }
  );
});

test('pondera días de mayor tráfico sin alterar la cuota mensual total', () => {
  const days = distributeMonthlyQuota({
    mes: '2026-08-01',
    cuotaMensual: 31000,
    pesos: { LUN: 1, MAR: 1, MIE: 1, JUE: 1, VIE: 2, SAB: 2, DOM: 0 },
  });

  const friday = days.find((day) => day.fecha === '2026-08-07');
  const monday = days.find((day) => day.fecha === '2026-08-03');
  const sunday = days.find((day) => day.fecha === '2026-08-02');

  expect(friday?.montoCuota).toBeGreaterThan(monday?.montoCuota ?? 0);
  expect(sunday?.montoCuota).toBe(0);
  expect(days.reduce((total, day) => total + Math.round(day.montoCuota * 100), 0)).toBe(3_100_000);
});

test('rechaza duplicados, montos negativos, meses inválidos y semanas sin peso', () => {
  const result = parsePlaneacionCuotaWorkbook(
    buildWorkbook([
      { MES: '2026-08', 'BTL CVE': 'BTL-001', 'CUOTA MENSUAL': 1000 },
      { MES: '2026-08-01', 'BTL CVE': 'btl-001', 'CUOTA MENSUAL': 2000 },
      { MES: 'mes roto', 'BTL CVE': 'BTL-002', 'CUOTA MENSUAL': -1 },
      {
        MES: '2026-08',
        'BTL CVE': 'BTL-003',
        'CUOTA MENSUAL': 100,
        'PESO LUN': 0,
        'PESO MAR': 0,
        'PESO MIE': 0,
        'PESO JUE': 0,
        'PESO VIE': 0,
        'PESO SAB': 0,
        'PESO DOM': 0,
      },
    ])
  );

  expect(result.issues.map((issue) => issue.code)).toEqual([
    'FILA_DUPLICADA',
    'MES_INVALIDO',
    'MONTO_NEGATIVO',
    'PESOS_SIN_DIAS',
  ]);
  expect(result.issues.every((issue) => issue.severity === 'ERROR')).toBe(true);
});

test('valida que todas las filas pertenezcan al mes seleccionado', () => {
  const parsed = parsePlaneacionCuotaWorkbook(
    buildWorkbook([
      { MES: '2026-08', 'BTL CVE': 'BTL-001', 'CUOTA MENSUAL': 1000 },
      { MES: '2026-09', 'BTL CVE': 'BTL-002', 'CUOTA MENSUAL': 1000 },
    ])
  );

  expect(validateQuotaImportMonth(parsed, '2026-08-01').map((issue) => issue.code)).toEqual([
    'MES_NO_COINCIDE',
  ]);
});

test('genera una plantilla editable con contrato, catálogo e instrucciones visibles', async () => {
  const bytes = await buildPlaneacionCuotaTemplateWorkbook({
    mes: '2026-08-01',
    pdvs: [
      {
        claveBtl: 'BTL-001',
        cadenaNombre: 'Cadena Norte',
        pdvNombre: 'Sucursal Centro',
        cuotaMensualActual: 31000,
      },
    ],
  });
  const workbook = XLSX.read(bytes, { type: 'buffer' });
  const sheet = workbook.Sheets.Cuotas_Mensuales;
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][];

  expect(workbook.SheetNames).toEqual(['Cuotas_Mensuales', 'Instrucciones']);
  expect(rows[0]).toEqual([
    'MES',
    'BTL CVE',
    'CADENA',
    'PDV',
    'CUOTA MENSUAL',
    'PESO LUN',
    'PESO MAR',
    'PESO MIE',
    'PESO JUE',
    'PESO VIE',
    'PESO SAB',
    'PESO DOM',
    'OBSERVACIONES',
  ]);
  expect(rows[1].slice(0, 6)).toEqual([
    '2026-08',
    'BTL-001',
    'Cadena Norte',
    'Sucursal Centro',
    31000,
    1,
  ]);
});
