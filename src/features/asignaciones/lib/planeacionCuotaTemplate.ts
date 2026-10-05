import ExcelJS from 'exceljs';

export interface PlaneacionCuotaTemplatePdv {
  claveBtl: string;
  cadenaNombre: string | null;
  pdvNombre: string;
  cuotaMensualActual: number | null;
}

interface BuildPlaneacionCuotaTemplateInput {
  mes: string;
  pdvs: PlaneacionCuotaTemplatePdv[];
}

const HEADERS = [
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
] as const;

const HEADER_FILL = '0F766E';
const ACCENT_FILL = 'E6FFFB';
const INPUT_FILL = 'FFF7D6';
const BORDER_COLOR = 'CBD5E1';

function applyThinBottomBorder(cell: ExcelJS.Cell) {
  cell.border = {
    bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
  };
}

export async function buildPlaneacionCuotaTemplateWorkbook({
  mes,
  pdvs,
}: BuildPlaneacionCuotaTemplateInput): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Retail · Planeación mensual';
  workbook.subject = 'Carga mensual de cuotas por PDV';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Cuotas_Mensuales', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 2, showGridLines: false }],
    properties: { defaultRowHeight: 22 },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  sheet.columns = [
    { key: 'mes', width: 13 },
    { key: 'claveBtl', width: 23 },
    { key: 'cadena', width: 24 },
    { key: 'pdv', width: 36 },
    { key: 'cuota', width: 18 },
    ...Array.from({ length: 7 }, (_, index) => ({ key: `peso${index}`, width: 12 })),
    { key: 'observaciones', width: 42 },
  ];

  const header = sheet.addRow([...HEADERS]);
  header.height = 30;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  const monthLabel = mes.slice(0, 7);
  const orderedPdvs = [...pdvs].sort(
    (left, right) =>
      (left.cadenaNombre ?? '').localeCompare(right.cadenaNombre ?? '', 'es') ||
      left.pdvNombre.localeCompare(right.pdvNombre, 'es')
  );

  for (const pdv of orderedPdvs) {
    const row = sheet.addRow([
      monthLabel,
      pdv.claveBtl,
      pdv.cadenaNombre ?? 'Sin cadena',
      pdv.pdvNombre,
      pdv.cuotaMensualActual,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      '',
    ]);
    row.eachCell((cell) => {
      applyThinBottomBorder(cell);
      cell.alignment = { vertical: 'middle' };
    });
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_FILL } };
    row.getCell(2).font = { bold: true, color: { argb: '0F766E' } };
    row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } };
    row.getCell(5).numFmt = '$#,##0.00;[Red]-$#,##0.00';
    row.getCell(5).dataValidation = {
      type: 'decimal',
      operator: 'greaterThanOrEqual',
      formulae: [0],
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Cuota inválida',
      error: 'Captura un monto mayor o igual a cero.',
    };
    for (let column = 6; column <= 12; column += 1) {
      row.getCell(column).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: INPUT_FILL },
      };
      row.getCell(column).numFmt = '0.00';
      row.getCell(column).dataValidation = {
        type: 'decimal',
        operator: 'between',
        formulae: [0, 100],
        allowBlank: false,
        showErrorMessage: true,
        errorTitle: 'Peso inválido',
        error: 'El peso debe estar entre 0 y 100.',
      };
    }
  }

  const firstDataRow = 2;
  const lastDataRow = Math.max(sheet.rowCount, 2);
  sheet.autoFilter = { from: 'A1', to: 'M1' };
  sheet.getColumn(5).alignment = { horizontal: 'right' };
  sheet.getColumn(13).alignment = { wrapText: true };
  sheet.addConditionalFormatting({
    ref: `E${firstDataRow}:E${lastDataRow}`,
    rules: [
      {
        type: 'cellIs',
        priority: 1,
        operator: 'lessThan',
        formulae: ['0'],
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FEE2E2' } },
          font: { color: { argb: '991B1B' }, bold: true },
        },
      },
    ],
  });

  const instructions = workbook.addWorksheet('Instrucciones', {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 22 },
  });
  instructions.columns = [{ width: 24 }, { width: 105 }];
  instructions.mergeCells('A1:B1');
  instructions.getCell('A1').value = 'Carga mensual de cuotas por PDV';
  instructions.getCell('A1').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEADER_FILL },
  };
  instructions.getCell('A1').font = { bold: true, color: { argb: 'FFFFFF' }, size: 16 };
  instructions.getCell('A1').alignment = { vertical: 'middle' };
  instructions.getRow(1).height = 38;

  const instructionRows: Array<[string, string]> = [
    ['Propósito', 'Asignar la cuota mensual del PDV y distribuirla por día sin perder centavos.'],
    ['MES', 'Debe coincidir con el mes abierto en Planeación. Formatos: YYYY-MM o MM/YYYY.'],
    ['BTL CVE', 'No modificar. Debe existir y pertenecer a la cuenta activa.'],
    ['CUOTA MENSUAL', 'Monto no negativo. Una celda vacía omite ese PDV del lote.'],
    [
      'PESOS LUN–DOM',
      '1 reparte de forma uniforme. Usa un valor mayor para días de tráfico alto y 0 para excluir un día; al menos uno debe ser mayor que 0.',
    ],
    [
      'Distribución',
      'El motor reparte la cuota exacta entre todos los días del mes según los pesos y conserva la suma mensual al centavo.',
    ],
    [
      'Cuota individual',
      'Sólo se atribuye a la DC que tenga trabajo efectivo resuelto en ese PDV y fecha. Ausencias y días sin cobertura permanecen no atribuidos.',
    ],
    [
      'Aplicación',
      'La pantalla muestra una vista previa. Si cualquier fila contiene errores, el lote completo se rechaza y no se escriben cuotas parciales.',
    ],
    [
      'Idempotencia',
      'Volver a cargar el mismo contenido no duplica cuotas. Un archivo modificado publica una nueva versión y reemplaza únicamente los PDVs incluidos.',
    ],
  ];
  instructionRows.forEach(([label, detail], index) => {
    const row = instructions.addRow([label, detail]);
    row.getCell(1).font = { bold: true, color: { argb: '0F766E' } };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    row.height = index >= 4 ? 42 : 28;
    row.eachCell(applyThinBottomBorder);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export function getPlaneacionCuotaTemplateFilename(mes: string) {
  return `plantilla-cuotas-pdv-${mes.slice(0, 7)}.xlsx`;
}
