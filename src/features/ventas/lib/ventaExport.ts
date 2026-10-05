'use client';

import type { VentaDatasetItem } from '../services/ventaService';

export interface VentaExportData {
  range: 'hoy' | 'semana' | 'mes' | 'personalizado';
  filters: {
    pdvLabel?: string;
    empleadoLabel?: string;
    supervisorLabel?: string;
    zona?: string;
    cadena?: string;
  };
  kpiSummary: {
    total: number;
    confirmadas: number;
    pendientes: number;
    unidades: number;
  };
  porPdv: Array<{
    id: string;
    label: string;
    helper: string | null;
    total: number;
    confirmadas: number;
    pendientes: number;
    unidades: number;
  }>;
  porDc: Array<{
    id: string;
    label: string;
    helper: string | null;
    total: number;
    confirmadas: number;
    pendientes: number;
    unidades: number;
  }>;
  porSupervisor: Array<{
    id: string;
    label: string;
    helper: string | null;
    total: number;
    confirmadas: number;
    pendientes: number;
    unidades: number;
  }>;
  porCadena: Array<{
    id: string;
    label: string;
    helper: string | null;
    total: number;
    confirmadas: number;
    pendientes: number;
    unidades: number;
  }>;
  diaria: Array<{
    bucket: string;
    total: number;
    confirmadas: number;
    pendientes: number;
    unidades: number;
  }>;
  semanal: Array<{
    bucket: string;
    total: number;
    confirmadas: number;
    pendientes: number;
    unidades: number;
  }>;
  dataset?: VentaDatasetItem[];
  selectedMonth?: string;
}

function encodeCol(c: number): string {
  let temp = c;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export async function exportarVentasToExcel(data: VentaExportData) {
  // Cargar dinámicamente ExcelJS en el cliente
  const ExcelJS = await import('exceljs');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Field Force Platform';
  wb.lastModifiedBy = 'Field Force Platform';
  wb.created = new Date();
  wb.modified = new Date();

  // ----------------------------------------------------
  // AGRUPACIÓN SEMANAL DE VENTAS (Estructura Solicitada)
  // ----------------------------------------------------
  function getSemanaDelMes(fechaOperacion: string): 1 | 2 | 3 | 4 | 5 {
    if (!fechaOperacion) return 1;
    const parts = fechaOperacion.split('-');
    if (parts.length < 3) return 1;
    const year = parseInt(parts[0], 10);
    const monthIndex = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    const firstDay = new Date(Date.UTC(year, monthIndex, 1));
    const dayOfWeek1st = (firstDay.getUTCDay() + 6) % 7; // Monday = 0, Sunday = 6

    const weekNum = Math.floor((day - 1 + dayOfWeek1st) / 7) + 1;
    return Math.min(Math.max(weekNum, 1), 5) as 1 | 2 | 3 | 4 | 5;
  }

  interface GroupedRow {
    btlCve: string;
    cadena: string;
    idPdv: string;
    sucursal: string;
    nombreDc: string;
    supervisor: string;
    sem1: number;
    sem2: number;
    sem3: number;
    sem4: number;
    total: number;
  }

  const groupedMap = new Map<string, GroupedRow>();
  const dataset = data.dataset || [];

  dataset.forEach((item) => {
    const btlCve = item.pdvClaveBtl || 'SIN BTL';
    const cadena = item.cadena || 'Sin cadena';
    const idPdv = item.pdvIdCadena || '';
    const sucursal = item.pdvNombre || 'PDV sin nombre';
    const nombreDc = item.empleadoLabel || 'Sin dermoconsejera';
    const supervisor = item.supervisorLabel || 'Sin supervisor';

    const key = `${btlCve}||${cadena}||${idPdv}||${sucursal}||${nombreDc}||${supervisor}`;

    let row = groupedMap.get(key);
    if (!row) {
      row = {
        btlCve,
        cadena,
        idPdv,
        sucursal,
        nombreDc,
        supervisor,
        sem1: 0,
        sem2: 0,
        sem3: 0,
        sem4: 0,
        total: 0,
      };
      groupedMap.set(key, row);
    }

    const sem = getSemanaDelMes(item.fechaOperacion);
    const units = item.totalUnidades || 0;

    if (sem === 1) row.sem1 += units;
    else if (sem === 2) row.sem2 += units;
    else if (sem === 3) row.sem3 += units;
    else row.sem4 += units;

    row.total += units;
  });

  const groupedRows = Array.from(groupedMap.values()).sort((a, b) => {
    const compCad = a.cadena.localeCompare(b.cadena, 'es-MX');
    if (compCad !== 0) return compCad;
    const compSuc = a.sucursal.localeCompare(b.sucursal, 'es-MX');
    if (compSuc !== 0) return compSuc;
    return a.nombreDc.localeCompare(b.nombreDc, 'es-MX');
  });

  const borderThin = {
    top: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
    left: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
    right: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
  };

  const totalLabelFill = {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: 'FFE5E7EB' },
  };

  const totalBorder = {
    top: { style: 'thin' as const, color: { argb: 'FF000000' } },
    bottom: { style: 'double' as const, color: { argb: 'FF000000' } },
    left: borderThin.left,
    right: borderThin.right,
  };

  // ----------------------------------------------------
  // HOJA: CALENDARIO DIARIO (Detalle Mensual Día a Día)
  // ----------------------------------------------------
  const activeMonthStr = data.selectedMonth || new Date().toISOString().slice(0, 7);
  const [calYear, calMonth] = activeMonthStr.split('-').map(Number);
  const calTotalDays = new Date(calYear, calMonth, 0).getDate();

  const calMonthNames = [
    'ENERO',
    'FEBRERO',
    'MARZO',
    'ABRIL',
    'MAYO',
    'JUNIO',
    'JULIO',
    'AGOSTO',
    'SEPTIEMBRE',
    'OCTUBRE',
    'NOVIEMBRE',
    'DICIEMBRE',
  ];
  const calMonthLabel = `${calMonthNames[calMonth - 1]} ${calYear}`;

  const wsCalendario = wb.addWorksheet('Calendario Diario', {
    views: [
      {
        state: 'frozen',
        ySplit: 3, // Freeze rows 1, 2, and 3
        xSplit: 5, // Freeze first 5 columns: BTL, Sucursal, ID Nom, Nombre DC, Supervisor
        showGridLines: true,
      },
    ],
  });

  // Calculate day names for each day of the month
  const weekDaysMin = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const sundays: number[] = []; // 1-indexed days of the month

  const dayHeaders: string[] = [];
  const dayNumberHeaders: number[] = [];

  for (let d = 1; d <= calTotalDays; d++) {
    const dDate = new Date(calYear, calMonth - 1, d);
    const dayOfWeek = dDate.getDay();
    if (dayOfWeek === 0) {
      sundays.push(d);
    }
    dayHeaders.push(weekDaysMin[dayOfWeek]);
    dayNumberHeaders.push(d);
  }

  // Row 1: Month title span
  const row1Values = ['', '', '', '', ''];
  const r1 = wsCalendario.addRow(row1Values);
  r1.height = 30;
  wsCalendario.mergeCells(1, 6, 1, 5 + calTotalDays);
  const monthTitleCell = wsCalendario.getCell(1, 6);
  monthTitleCell.value = calMonthLabel;
  monthTitleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1F4E78' } };
  monthTitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  monthTitleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD6EAF8' }, // Light sky blue background
  };

  // Border for merged title cell
  for (let c = 6; c <= 5 + calTotalDays; c++) {
    const cell = r1.getCell(c);
    cell.border = borderThin;
  }

  // Row 2: Weekday letters for days (blank above fixed/summary headers)
  const row2Values = ['', '', '', '', '', ...dayHeaders, '', ''];
  const r2 = wsCalendario.addRow(row2Values);
  r2.height = 20;

  // Row 3: Header labels for fixed columns, day numbers for days, header labels for summary columns
  const row3Values = [
    'CLAVE BTL',
    'SUCURSAL',
    'ID NOM',
    'NOMBRE DC',
    'SUPERVISOR',
    ...dayNumberHeaders,
    'DÍAS',
    'VENTAS TOTALES',
  ];
  const r3 = wsCalendario.addRow(row3Values);
  r3.height = 20;

  // Setup fonts, fills, alignments and borders for Row 2 & 3
  const fillPizarra = {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: 'FF34495E' }, // Slate gray background
  };
  const fillVerde = {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: 'FF1B5E20' }, // Forest green background
  };

  const fillPurple = {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: 'FF512DA8' }, // Indigo/purple background
  };

  const textWhiteBold = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };

  // Format headers
  // Columns 1-5 (Slate)
  for (let c = 1; c <= 5; c++) {
    const cell = r2.getCell(c);
    cell.fill = fillPizarra;
    cell.border = borderThin;

    const cell3 = r3.getCell(c);
    cell3.fill = fillPizarra;
    cell3.font = textWhiteBold;
    cell3.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell3.border = borderThin;
  }

  // Day columns (Verde)
  for (let d = 1; d <= calTotalDays; d++) {
    const colIdx = 5 + d;
    const fill = fillVerde;

    const cell2 = r2.getCell(colIdx);
    cell2.fill = fill;
    cell2.font = textWhiteBold;
    cell2.alignment = { vertical: 'middle', horizontal: 'center' };
    cell2.border = borderThin;

    const cell3 = r3.getCell(colIdx);
    cell3.fill = fill;
    cell3.font = textWhiteBold;
    cell3.alignment = { vertical: 'middle', horizontal: 'center' };
    cell3.border = borderThin;
  }

  // Last 2 columns (Purple)
  for (let c = 5 + calTotalDays + 1; c <= 5 + calTotalDays + 2; c++) {
    const cell = r2.getCell(c);
    cell.fill = fillPurple;
    cell.border = borderThin;

    const cell3 = r3.getCell(c);
    cell3.fill = fillPurple;
    cell3.font = textWhiteBold;
    cell3.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell3.border = borderThin;
  }

  // Group and aggregate data
  interface CalGroupedRow {
    btlCve: string;
    sucursal: string;
    idNomina: string;
    nombreDc: string;
    supervisor: string;
    days: Array<number | string>;
  }

  const calGroupedMap = new Map<string, CalGroupedRow>();

  dataset.forEach((item) => {
    const btlCve = item.pdvClaveBtl || 'SIN BTL';
    const sucursal = item.pdvNombre || 'PDV sin nombre';
    const idNomina = item.empleadoIdNomina || '';
    const nombreDc = item.empleadoLabel || 'Sin dermoconsejera';
    const supervisor = item.supervisorLabel || 'Sin supervisor';

    const key = `${btlCve}||${sucursal}||${idNomina}||${nombreDc}||${supervisor}`;

    let row = calGroupedMap.get(key);
    if (!row) {
      row = {
        btlCve,
        sucursal,
        idNomina,
        nombreDc,
        supervisor,
        days: Array(calTotalDays).fill(''),
      };
      calGroupedMap.set(key, row);
    }

    if (item.fechaOperacion) {
      const parts = item.fechaOperacion.split('-');
      const day = parseInt(parts[2], 10);
      if (day >= 1 && day <= calTotalDays) {
        const subtipo = item.subtipoIncidencia;
        if (subtipo === 'V' || subtipo === 'I' || subtipo === 'F') {
          row.days[day - 1] = subtipo;
        } else if (subtipo === '0') {
          row.days[day - 1] = 0;
        } else {
          const currentVal = row.days[day - 1];
          const salesVal = item.totalUnidades || 0;
          if (typeof currentVal === 'number') {
            row.days[day - 1] = currentVal + salesVal;
          } else {
            row.days[day - 1] = salesVal;
          }
        }
      }
    }
  });

  const calGroupedRows = Array.from(calGroupedMap.values()).sort((a, b) => {
    const compSuc = a.sucursal.localeCompare(b.sucursal, 'es-MX');
    if (compSuc !== 0) return compSuc;
    return a.nombreDc.localeCompare(b.nombreDc, 'es-MX');
  });

  // Populate data rows
  calGroupedRows.forEach((r) => {
    const diasRegistrados = r.days.filter((val) => {
      if (typeof val === 'number') {
        return true;
      }
      return val === 'V' || val === 'I' || val === 'F';
    }).length;

    const ventasTotales = r.days.reduce((a, b) => {
      const aNum = typeof a === 'number' ? a : 0;
      const bNum = typeof b === 'number' ? b : 0;
      return aNum + bNum;
    }, 0);

    const rowValues = [
      r.btlCve,
      r.sucursal,
      r.idNomina,
      r.nombreDc,
      r.supervisor,
      ...r.days,
      diasRegistrados === 0 ? '' : diasRegistrados,
      ventasTotales,
    ];

    const newRow = wsCalendario.addRow(rowValues);
    newRow.height = 20;

    for (let col = 1; col <= 5 + calTotalDays + 2; col++) {
      const cell = newRow.getCell(col);
      cell.border = borderThin;
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF2E2E2E' } };

      if (col === 3) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (col <= 5) {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else if (col <= 5 + calTotalDays) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };

        const valStr = String(cell.value ?? '')
          .trim()
          .toUpperCase();
        if (valStr === 'V') {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFCE5CD' }, // Naranja claro
          };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF7F6000' } };
        } else if (valStr === 'I') {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF4CCCC' }, // Rosa claro
          };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF7F0000' } };
        } else if (valStr === 'F') {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6B8B8' }, // Rojo claro / bordo
          };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF990000' } };
        }
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        if (col === 5 + calTotalDays + 2) {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF2E2E2E' } };
          cell.numFmt = '#,##0';
        } else {
          cell.numFmt = '#,##0';
        }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2EBF9' },
        };
      }
    }
  });

  // Add TOTAL Row
  const totalRowIdx = calGroupedRows.length + 4;
  const calTotalRow = wsCalendario.getRow(totalRowIdx);
  calTotalRow.height = 22;

  calTotalRow.getCell(1).value = 'TOTAL GENERAL';
  calTotalRow.getCell(1).font = { name: 'Calibri', size: 10, bold: true };
  calTotalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  for (let col = 1; col <= 5; col++) {
    const cell = calTotalRow.getCell(col);
    if (col > 1) cell.value = '';
    cell.fill = totalLabelFill;
    cell.border = totalBorder;
  }

  const startRow = 4;
  const endRow = calGroupedRows.length + 3;

  for (let d = 1; d <= calTotalDays; d++) {
    const colIdx = 5 + d;
    const colLetter = encodeCol(colIdx - 1);
    const cell = calTotalRow.getCell(colIdx);

    cell.value = {
      formula: `SUM(${colLetter}${startRow}:${colLetter}${endRow})`,
    };
    cell.numFmt = '#,##0';
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.font = { name: 'Calibri', size: 10, bold: true };
    cell.border = totalBorder;

    cell.fill = totalLabelFill;
  }

  for (let c = 5 + calTotalDays + 1; c <= 5 + calTotalDays + 2; c++) {
    const colLetter = encodeCol(c - 1);
    const cell = calTotalRow.getCell(c);
    cell.value = {
      formula: `SUM(${colLetter}${startRow}:${colLetter}${endRow})`,
    };
    cell.numFmt = '#,##0';
    cell.alignment = { vertical: 'middle', horizontal: 'right' };
    cell.font = { name: 'Calibri', size: 10, bold: true };
    cell.border = totalBorder;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD1C4E9' },
    };
  }

  const colWidths = [
    { width: 18 },
    { width: 28 },
    { width: 12 },
    { width: 28 },
    { width: 24 },
    ...Array(calTotalDays).fill({ width: 6 }),
    { width: 10 },
    { width: 20 },
  ];

  colWidths.forEach((cw, colIdx) => {
    wsCalendario.getColumn(colIdx + 1).width = cw.width;
  });

  const wsSemanales = wb.addWorksheet('Resumen de Ventas', {
    views: [
      {
        state: 'frozen',
        ySplit: 1,
        xSplit: 0,
        showGridLines: true,
      },
    ],
  });

  const weeklyHeaders = [
    'BTL CVE',
    'CADENA',
    'ID PDV',
    'SUCURSAL',
    'NOMBRE DC',
    'SUPERVISOR',
    'SEM 1',
    'SEM 2',
    'SEM 3',
    'SEM 4',
    'VENTA POR SUCURSAL',
  ];

  const headerRow = wsSemanales.addRow(weeklyHeaders);
  headerRow.height = 28;

  const grayHeaderFill = {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: 'FFAEAAAA' },
  };

  const peachHeaderFill = {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: 'FFFCE4D6' },
  };

  const darkPeachHeaderFill = {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: 'FFF8CBAD' },
  };

  weeklyHeaders.forEach((h, colIndex) => {
    const cell = headerRow.getCell(colIndex + 1);
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = borderThin;

    if (colIndex < 6) {
      cell.fill = grayHeaderFill;
    } else if (colIndex < 10) {
      cell.fill = peachHeaderFill;
    } else {
      cell.fill = darkPeachHeaderFill;
    }
  });

  wsSemanales.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: weeklyHeaders.length },
  };

  groupedRows.forEach((r) => {
    const rowValues = [
      r.btlCve,
      r.cadena,
      r.idPdv,
      r.sucursal,
      r.nombreDc,
      r.supervisor,
      r.sem1 === 0 ? '' : r.sem1,
      r.sem2 === 0 ? '' : r.sem2,
      r.sem3 === 0 ? '' : r.sem3,
      r.sem4 === 0 ? '' : r.sem4,
      r.total,
    ];

    const newRow = wsSemanales.addRow(rowValues);
    newRow.height = 20;

    for (let col = 1; col <= weeklyHeaders.length; col++) {
      const cell = newRow.getCell(col);
      cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF000000' } };
      cell.border = borderThin;

      if (col === 3) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (col <= 6) {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else if (col <= 10) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        if (typeof cell.value === 'number') {
          cell.numFmt = '#,##0';
        }
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
        cell.numFmt = '#,##0';
        cell.fill = darkPeachHeaderFill;
      }
    }
  });

  // Totales Row
  const totalRowIndex = groupedRows.length + 2;
  const totalRow = wsSemanales.getRow(totalRowIndex);
  totalRow.height = 22;

  totalRow.getCell(1).value = 'TOTAL';
  totalRow.getCell(1).font = { name: 'Calibri', size: 11, bold: true };
  totalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  for (let col = 1; col <= 6; col++) {
    const cell = totalRow.getCell(col);
    if (col > 1) cell.value = '';
    cell.fill = totalLabelFill;
    cell.border = totalBorder;
  }

  if (groupedRows.length > 0) {
    const colsToSum = [7, 8, 9, 10, 11];
    const startDataRow = 2;
    const endDataRow = groupedRows.length + 1;

    colsToSum.forEach((col) => {
      const colLetter = encodeCol(col - 1);
      const cell = totalRow.getCell(col);
      cell.value = {
        formula: `SUM(${colLetter}${startDataRow}:${colLetter}${endDataRow})`,
      };
      cell.numFmt = '#,##0';
      cell.font = { name: 'Calibri', size: 11, bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
      cell.border = totalBorder;
      if (col === 11) {
        cell.fill = darkPeachHeaderFill;
      } else {
        cell.fill = peachHeaderFill;
      }
    });
  } else {
    for (let col = 7; col <= 11; col++) {
      const cell = totalRow.getCell(col);
      cell.value = 0;
      cell.font = { name: 'Calibri', size: 11, bold: true };
      cell.border = totalBorder;
      if (col === 11) {
        cell.fill = darkPeachHeaderFill;
      } else {
        cell.fill = peachHeaderFill;
      }
    }
  }

  wsSemanales.columns = [
    { width: 20 }, // BTL CVE
    { width: 16 }, // CADENA
    { width: 12 }, // ID PDV
    { width: 28 }, // SUCURSAL
    { width: 28 }, // NOMBRE DC
    { width: 24 }, // SUPERVISOR
    { width: 12 }, // SEM 1
    { width: 12 }, // SEM 2
    { width: 12 }, // SEM 3
    { width: 12 }, // SEM 4
    { width: 20 }, // VENTA POR SUCURSAL
  ];

  // ----------------------------------------------------
  // AGRUPACIÓN SEMANAL POR DERMOCONSEJERA (Nueva Estructura Solicitada)
  // ----------------------------------------------------
  interface DcGroupedRow {
    nombreDc: string;
    supervisor: string;
    sem1: number;
    sem2: number;
    sem3: number;
    sem4: number;
    total: number;
  }

  const dcGroupedMap = new Map<string, DcGroupedRow>();

  dataset.forEach((item) => {
    const nombreDc = item.empleadoLabel || 'Sin dermoconsejera';
    const supervisor = item.supervisorLabel || 'Sin supervisor';
    const key = `${nombreDc}||${supervisor}`;

    let row = dcGroupedMap.get(key);
    if (!row) {
      row = {
        nombreDc,
        supervisor,
        sem1: 0,
        sem2: 0,
        sem3: 0,
        sem4: 0,
        total: 0,
      };
      dcGroupedMap.set(key, row);
    }

    const sem = getSemanaDelMes(item.fechaOperacion);
    const units = item.totalUnidades || 0;

    if (sem === 1) row.sem1 += units;
    else if (sem === 2) row.sem2 += units;
    else if (sem === 3) row.sem3 += units;
    else row.sem4 += units;

    row.total += units;
  });

  const dcGroupedRows = Array.from(dcGroupedMap.values()).sort((a, b) =>
    a.nombreDc.localeCompare(b.nombreDc, 'es-MX')
  );

  const wsDcSemanales = wb.addWorksheet('Resumen por Dermoconsejera', {
    views: [
      {
        state: 'frozen',
        ySplit: 1,
        xSplit: 0,
        showGridLines: true,
      },
    ],
  });

  const dcHeaders = ['NOMBRE DC', 'SUPERVISOR', 'SEM 1', 'SEM 2', 'SEM 3', 'SEM 4', 'TOTAL PIEZAS'];

  const dcHeaderRow = wsDcSemanales.addRow(dcHeaders);
  dcHeaderRow.height = 28;

  dcHeaders.forEach((h, colIndex) => {
    const cell = dcHeaderRow.getCell(colIndex + 1);
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = borderThin;

    if (colIndex < 2) {
      cell.fill = grayHeaderFill;
    } else if (colIndex < 6) {
      cell.fill = peachHeaderFill;
    } else {
      cell.fill = darkPeachHeaderFill;
    }
  });

  wsDcSemanales.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: dcHeaders.length },
  };

  dcGroupedRows.forEach((r) => {
    const rowValues = [
      r.nombreDc,
      r.supervisor,
      r.sem1 === 0 ? '' : r.sem1,
      r.sem2 === 0 ? '' : r.sem2,
      r.sem3 === 0 ? '' : r.sem3,
      r.sem4 === 0 ? '' : r.sem4,
      r.total,
    ];

    const newRow = wsDcSemanales.addRow(rowValues);
    newRow.height = 20;

    for (let col = 1; col <= dcHeaders.length; col++) {
      const cell = newRow.getCell(col);
      cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF000000' } };
      cell.border = borderThin;

      if (col <= 2) {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else if (col <= 6) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        if (typeof cell.value === 'number') {
          cell.numFmt = '#,##0';
        }
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
        cell.numFmt = '#,##0';
        cell.fill = darkPeachHeaderFill;
      }
    }
  });

  // Totales Row
  const dcTotalRowIndex = dcGroupedRows.length + 2;
  const dcTotalRow = wsDcSemanales.getRow(dcTotalRowIndex);
  dcTotalRow.height = 22;

  dcTotalRow.getCell(1).value = 'TOTAL';
  dcTotalRow.getCell(1).font = { name: 'Calibri', size: 11, bold: true };
  dcTotalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  dcTotalRow.getCell(1).fill = totalLabelFill;
  dcTotalRow.getCell(1).border = totalBorder;

  const cell2 = dcTotalRow.getCell(2);
  cell2.value = '';
  cell2.fill = totalLabelFill;
  cell2.border = totalBorder;

  if (dcGroupedRows.length > 0) {
    const colsToSum = [3, 4, 5, 6, 7];
    const startDataRow = 2;
    const endDataRow = dcGroupedRows.length + 1;

    colsToSum.forEach((col) => {
      const colLetter = encodeCol(col - 1);
      const cell = dcTotalRow.getCell(col);
      cell.value = {
        formula: `SUM(${colLetter}${startDataRow}:${colLetter}${endDataRow})`,
      };
      cell.numFmt = '#,##0';
      cell.font = { name: 'Calibri', size: 11, bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
      cell.border = totalBorder;
      if (col === 7) {
        cell.fill = darkPeachHeaderFill;
      } else {
        cell.fill = peachHeaderFill;
      }
    });
  } else {
    for (let col = 3; col <= 7; col++) {
      const cell = dcTotalRow.getCell(col);
      cell.value = 0;
      cell.font = { name: 'Calibri', size: 11, bold: true };
      cell.border = totalBorder;
      if (col === 7) {
        cell.fill = darkPeachHeaderFill;
      } else {
        cell.fill = peachHeaderFill;
      }
    }
  }

  wsDcSemanales.columns = [
    { width: 32 }, // NOMBRE DC
    { width: 24 }, // SUPERVISOR
    { width: 12 }, // SEM 1
    { width: 12 }, // SEM 2
    { width: 12 }, // SEM 3
    { width: 12 }, // SEM 4
    { width: 20 }, // TOTAL PIEZAS
  ];

  // ----------------------------------------------------
  // HOJA: VENTAS POR PRODUCTO
  // ----------------------------------------------------
  const wsVentasProducto = wb.addWorksheet('Ventas por Producto', {
    views: [
      {
        state: 'frozen',
        ySplit: 3,
        xSplit: 0,
        showGridLines: true,
      },
    ],
  });

  // Encabezado principal de la hoja
  wsVentasProducto.mergeCells('A1:E1');
  const titleProdCell = wsVentasProducto.getCell('A1');
  titleProdCell.value = `REPORTE DE VENTAS POR PRODUCTO — ${activeMonthStr.toUpperCase()}`;
  titleProdCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleProdCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  titleProdCell.alignment = { vertical: 'middle', horizontal: 'center' };
  wsVentasProducto.getRow(1).height = 30;

  // Cabecera de columnas
  const prodHeaders = ['SKU', 'PRODUCTO', 'NOMBRE CORTO', 'PIEZAS VENDIDAS', 'MONTO TOTAL ($)'];
  const prodHeaderRow = wsVentasProducto.getRow(3);
  prodHeaderRow.height = 25;

  prodHeaders.forEach((h, idx) => {
    const cell = prodHeaderRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } };
    cell.alignment = { vertical: 'middle', horizontal: idx >= 3 ? 'right' : 'left' };
    cell.border = borderThin;
  });

  // Agrupar ventas por producto
  const productAggMap = new Map<
    string,
    { sku: string; nombre: string; nombreCorto: string; piezas: number; monto: number }
  >();

  (data.dataset ?? []).forEach((item) => {
    if (!item.productoNombre && !item.productoSku) return;
    const sku = item.productoSku ?? 'SIN SKU';
    const nombre = item.productoNombre ?? 'Producto sin nombre';
    const key = `${sku}||${nombre}`;

    if (!productAggMap.has(key)) {
      productAggMap.set(key, {
        sku,
        nombre,
        nombreCorto: item.productoNombreCorto ?? '',
        piezas: 0,
        monto: 0,
      });
    }

    const entry = productAggMap.get(key)!;
    entry.piezas += item.totalUnidades || 0;
    entry.monto += item.totalMonto || 0;
  });

  const productList = Array.from(productAggMap.values()).sort(
    (a, b) => b.piezas - a.piezas || a.nombre.localeCompare(b.nombre, 'es-MX')
  );

  let prodRowIdx = 4;
  productList.forEach((prod, idx) => {
    const row = wsVentasProducto.getRow(prodRowIdx);
    row.height = 20;

    const fillBg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF2F4F7';

    const cellSku = row.getCell(1);
    cellSku.value = prod.sku;
    cellSku.font = { name: 'Segoe UI', size: 9.5 };
    cellSku.alignment = { vertical: 'middle', horizontal: 'left' };
    cellSku.border = borderThin;
    cellSku.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillBg } };

    const cellNombre = row.getCell(2);
    cellNombre.value = prod.nombre;
    cellNombre.font = { name: 'Segoe UI', size: 9.5 };
    cellNombre.alignment = { vertical: 'middle', horizontal: 'left' };
    cellNombre.border = borderThin;
    cellNombre.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillBg } };

    const cellNombreCorto = row.getCell(3);
    cellNombreCorto.value = prod.nombreCorto;
    cellNombreCorto.font = { name: 'Segoe UI', size: 9.5 };
    cellNombreCorto.alignment = { vertical: 'middle', horizontal: 'left' };
    cellNombreCorto.border = borderThin;
    cellNombreCorto.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillBg } };

    const cellPiezas = row.getCell(4);
    cellPiezas.value = prod.piezas;
    cellPiezas.numFmt = '#,##0';
    cellPiezas.font = { name: 'Segoe UI', size: 9.5, bold: true };
    cellPiezas.alignment = { vertical: 'middle', horizontal: 'right' };
    cellPiezas.border = borderThin;
    cellPiezas.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillBg } };

    const cellMonto = row.getCell(5);
    cellMonto.value = prod.monto;
    cellMonto.numFmt = '$#,##0.00';
    cellMonto.font = { name: 'Segoe UI', size: 9.5 };
    cellMonto.alignment = { vertical: 'middle', horizontal: 'right' };
    cellMonto.border = borderThin;
    cellMonto.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillBg } };

    prodRowIdx++;
  });

  // Fila de Totales
  const prodTotalRow = wsVentasProducto.getRow(prodRowIdx);
  prodTotalRow.height = 24;

  prodTotalRow.getCell(1).value = 'TOTAL GENERAL';
  prodTotalRow.getCell(1).font = {
    name: 'Segoe UI',
    size: 10,
    bold: true,
    color: { argb: 'FF000000' },
  };
  prodTotalRow.getCell(1).fill = totalLabelFill;
  prodTotalRow.getCell(1).border = totalBorder;

  prodTotalRow.getCell(2).fill = totalLabelFill;
  prodTotalRow.getCell(2).border = totalBorder;
  prodTotalRow.getCell(3).fill = totalLabelFill;
  prodTotalRow.getCell(3).border = totalBorder;

  const cellPiezasTot = prodTotalRow.getCell(4);
  cellPiezasTot.value = prodRowIdx > 4 ? { formula: `SUM(D4:D${prodRowIdx - 1})` } : 0;
  cellPiezasTot.numFmt = '#,##0';
  cellPiezasTot.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF000000' } };
  cellPiezasTot.alignment = { vertical: 'middle', horizontal: 'right' };
  cellPiezasTot.fill = totalLabelFill;
  cellPiezasTot.border = totalBorder;

  const cellMontoTot = prodTotalRow.getCell(5);
  cellMontoTot.value = prodRowIdx > 4 ? { formula: `SUM(E4:E${prodRowIdx - 1})` } : 0;
  cellMontoTot.numFmt = '$#,##0.00';
  cellMontoTot.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF000000' } };
  cellMontoTot.alignment = { vertical: 'middle', horizontal: 'right' };
  cellMontoTot.fill = totalLabelFill;
  cellMontoTot.border = totalBorder;

  wsVentasProducto.getColumn(1).width = 18; // SKU
  wsVentasProducto.getColumn(2).width = 45; // Producto
  wsVentasProducto.getColumn(3).width = 30; // Nombre corto
  wsVentasProducto.getColumn(4).width = 18; // Piezas
  wsVentasProducto.getColumn(5).width = 20; // Monto

  // ----------------------------------------------------
  // HOJA: VENTAS POR PDV Y PRODUCTO
  // ----------------------------------------------------
  const wsVentasPdvProducto = wb.addWorksheet('Ventas por PDV y Producto', {
    views: [
      {
        state: 'frozen',
        ySplit: 3,
        xSplit: 4,
        showGridLines: true,
      },
    ],
  });

  // Encabezado principal
  wsVentasPdvProducto.mergeCells('A1:J1');
  const titlePdvProdCell = wsVentasPdvProducto.getCell('A1');
  titlePdvProdCell.value = `DESGLOSE DE VENTAS POR PUNTO DE VENTA Y PRODUCTO — ${activeMonthStr.toUpperCase()}`;
  titlePdvProdCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titlePdvProdCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  titlePdvProdCell.alignment = { vertical: 'middle', horizontal: 'center' };
  wsVentasPdvProducto.getRow(1).height = 30;

  // Cabecera de columnas
  const pdvProdHeaders = [
    'CLAVE BTL',
    'CADENA',
    'ID PDV',
    'SUCURSAL',
    'SUPERVISOR',
    'SKU',
    'PRODUCTO',
    'NOMBRE CORTO',
    'PIEZAS VENDIDAS',
    'MONTO TOTAL ($)',
  ];
  const pdvProdHeaderRow = wsVentasPdvProducto.getRow(3);
  pdvProdHeaderRow.height = 25;

  pdvProdHeaders.forEach((h, idx) => {
    const cell = pdvProdHeaderRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } };
    cell.alignment = { vertical: 'middle', horizontal: idx >= 8 ? 'right' : 'left' };
    cell.border = borderThin;
  });

  // Agrupar ventas por PDV + Producto
  const pdvProdAggMap = new Map<
    string,
    {
      btlCve: string;
      cadena: string;
      idPdv: string;
      sucursal: string;
      supervisor: string;
      sku: string;
      producto: string;
      nombreCorto: string;
      piezas: number;
      monto: number;
    }
  >();

  (data.dataset ?? []).forEach((item) => {
    if (!item.productoNombre && !item.productoSku) return;
    const btlCve = item.pdvClaveBtl ?? 'SIN BTL';
    const sucursal = item.pdvNombre ?? 'PDV sin nombre';
    const sku = item.productoSku ?? 'SIN SKU';
    const producto = item.productoNombre ?? 'Producto sin nombre';
    const key = `${btlCve}||${sucursal}||${sku}||${producto}`;

    if (!pdvProdAggMap.has(key)) {
      pdvProdAggMap.set(key, {
        btlCve,
        cadena: item.cadena ?? 'Sin cadena',
        idPdv: item.pdvIdCadena ?? '',
        sucursal,
        supervisor: item.supervisorLabel ?? 'Sin supervisor',
        sku,
        producto,
        nombreCorto: item.productoNombreCorto ?? '',
        piezas: 0,
        monto: 0,
      });
    }

    const entry = pdvProdAggMap.get(key)!;
    entry.piezas += item.totalUnidades || 0;
    entry.monto += item.totalMonto || 0;
  });

  const pdvProdList = Array.from(pdvProdAggMap.values()).sort((a, b) => {
    const cCad = a.cadena.localeCompare(b.cadena, 'es-MX');
    if (cCad !== 0) return cCad;
    const cSuc = a.sucursal.localeCompare(b.sucursal, 'es-MX');
    if (cSuc !== 0) return cSuc;
    return b.piezas - a.piezas;
  });

  let pdvProdRowIdx = 4;
  pdvProdList.forEach((rowItem, idx) => {
    const row = wsVentasPdvProducto.getRow(pdvProdRowIdx);
    row.height = 20;

    const fillBg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF2F4F7';

    const values = [
      rowItem.btlCve,
      rowItem.cadena,
      rowItem.idPdv,
      rowItem.sucursal,
      rowItem.supervisor,
      rowItem.sku,
      rowItem.producto,
      rowItem.nombreCorto,
      rowItem.piezas,
      rowItem.monto,
    ];

    values.forEach((val, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = val;
      cell.font = { name: 'Segoe UI', size: 9.5 };
      cell.border = borderThin;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillBg } };

      if (cIdx === 8) {
        cell.numFmt = '#,##0';
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (cIdx === 9) {
        cell.numFmt = '$#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });

    pdvProdRowIdx++;
  });

  // Fila de Totales
  const pdvProdTotalRow = wsVentasPdvProducto.getRow(pdvProdRowIdx);
  pdvProdTotalRow.height = 24;

  for (let c = 1; c <= 8; c++) {
    const cell = pdvProdTotalRow.getCell(c);
    cell.fill = totalLabelFill;
    cell.border = totalBorder;
    if (c === 1) {
      cell.value = 'TOTAL GENERAL';
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF000000' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    }
  }

  const cellPdvPiezasTot = pdvProdTotalRow.getCell(9);
  cellPdvPiezasTot.value = pdvProdRowIdx > 4 ? { formula: `SUM(I4:I${pdvProdRowIdx - 1})` } : 0;
  cellPdvPiezasTot.numFmt = '#,##0';
  cellPdvPiezasTot.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF000000' } };
  cellPdvPiezasTot.alignment = { vertical: 'middle', horizontal: 'right' };
  cellPdvPiezasTot.fill = totalLabelFill;
  cellPdvPiezasTot.border = totalBorder;

  const cellPdvMontoTot = pdvProdTotalRow.getCell(10);
  cellPdvMontoTot.value = pdvProdRowIdx > 4 ? { formula: `SUM(J4:J${pdvProdRowIdx - 1})` } : 0;
  cellPdvMontoTot.numFmt = '$#,##0.00';
  cellPdvMontoTot.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF000000' } };
  cellPdvMontoTot.alignment = { vertical: 'middle', horizontal: 'right' };
  cellPdvMontoTot.fill = totalLabelFill;
  cellPdvMontoTot.border = totalBorder;

  wsVentasPdvProducto.getColumn(1).width = 20; // BTL
  wsVentasPdvProducto.getColumn(2).width = 22; // Cadena
  wsVentasPdvProducto.getColumn(3).width = 14; // ID PDV
  wsVentasPdvProducto.getColumn(4).width = 32; // Sucursal
  wsVentasPdvProducto.getColumn(5).width = 25; // Supervisor
  wsVentasPdvProducto.getColumn(6).width = 18; // SKU
  wsVentasPdvProducto.getColumn(7).width = 45; // Producto
  wsVentasPdvProducto.getColumn(8).width = 30; // Nombre Corto
  wsVentasPdvProducto.getColumn(9).width = 18; // Piezas
  wsVentasPdvProducto.getColumn(10).width = 20; // Monto

  // ----------------------------------------------------
  // HOJA: VENTAS POR DÍA, PDV Y PRODUCTO
  // ----------------------------------------------------
  const wsVentasDiaPdvProducto = wb.addWorksheet('Ventas por Día, PDV y Prod', {
    views: [
      {
        state: 'frozen',
        ySplit: 3,
        xSplit: 2, // Fija las dos columnas de Fechas (Fecha Venta y Fecha Registro)
        showGridLines: true,
      },
    ],
  });

  // Encabezado principal
  wsVentasDiaPdvProducto.mergeCells('A1:N1');
  const titleDiaPdvProdCell = wsVentasDiaPdvProducto.getCell('A1');
  titleDiaPdvProdCell.value = `DESGLOSE DIARIO DE VENTAS POR PDV, DERMOCONSEJERA Y PRODUCTO — ${activeMonthStr.toUpperCase()}`;
  titleDiaPdvProdCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleDiaPdvProdCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  titleDiaPdvProdCell.alignment = { vertical: 'middle', horizontal: 'center' };
  wsVentasDiaPdvProducto.getRow(1).height = 30;

  // Cabecera de columnas
  const diaPdvProdHeaders = [
    'FECHA VENTA',
    'FECHA REGISTRO',
    'CLAVE BTL',
    'CADENA',
    'ID PDV',
    'SUCURSAL',
    'SUPERVISOR',
    'ID NÓMINA',
    'DERMOCONSEJERA',
    'SKU',
    'PRODUCTO',
    'NOMBRE CORTO',
    'PIEZAS VENDIDAS',
    'MONTO TOTAL ($)',
  ];
  const diaPdvProdHeaderRow = wsVentasDiaPdvProducto.getRow(3);
  diaPdvProdHeaderRow.height = 25;

  diaPdvProdHeaders.forEach((h, idx) => {
    const cell = diaPdvProdHeaderRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } };
    cell.alignment = {
      vertical: 'middle',
      horizontal: idx <= 1 ? 'center' : idx >= 12 ? 'right' : 'left',
    };
    cell.border = borderThin;
  });

  // Agrupar ventas por Fecha Venta + Fecha Registro + PDV + DC + Producto
  interface DailyPdvProdItem {
    fechaVenta: string;
    fechaRegistro: string;
    btlCve: string;
    cadena: string;
    idPdv: string;
    sucursal: string;
    supervisor: string;
    idNomina: string;
    nombreDc: string;
    sku: string;
    producto: string;
    nombreCorto: string;
    piezas: number;
    monto: number;
  }

  const diaPdvProdAggMap = new Map<string, DailyPdvProdItem>();

  (data.dataset ?? []).forEach((item) => {
    if (!item.fechaOperacion) return;
    if (!item.productoNombre && !item.productoSku && (item.totalUnidades || 0) <= 0) return;
    if (item.subtipoIncidencia && (item.totalUnidades || 0) <= 0) return;

    const fechaVenta = item.fechaOperacion;
    const fechaRegistro = item.fechaRegistro || item.fechaOperacion;
    const btlCve = item.pdvClaveBtl ?? 'SIN BTL';
    const cadena = item.cadena ?? 'Sin cadena';
    const idPdv = item.pdvIdCadena ?? '';
    const sucursal = item.pdvNombre ?? 'PDV sin nombre';
    const supervisor = item.supervisorLabel ?? 'Sin supervisor';
    const idNomina = item.empleadoIdNomina ?? '';
    const nombreDc = item.empleadoLabel ?? 'Sin dermoconsejera';
    const sku = item.productoSku ?? 'SIN SKU';
    const producto = item.productoNombre ?? 'Producto sin nombre';
    const nombreCorto = item.productoNombreCorto ?? '';

    const key = `${fechaVenta}||${fechaRegistro}||${btlCve}||${cadena}||${idPdv}||${sucursal}||${idNomina}||${nombreDc}||${sku}||${producto}`;

    if (!diaPdvProdAggMap.has(key)) {
      diaPdvProdAggMap.set(key, {
        fechaVenta,
        fechaRegistro,
        btlCve,
        cadena,
        idPdv,
        sucursal,
        supervisor,
        idNomina,
        nombreDc,
        sku,
        producto,
        nombreCorto,
        piezas: 0,
        monto: 0,
      });
    }

    const entry = diaPdvProdAggMap.get(key)!;
    entry.piezas += item.totalUnidades || 0;
    entry.monto += item.totalMonto || 0;
  });

  const diaPdvProdList = Array.from(diaPdvProdAggMap.values()).sort((a, b) => {
    const cFechaV = a.fechaVenta.localeCompare(b.fechaVenta);
    if (cFechaV !== 0) return cFechaV;
    const cFechaR = a.fechaRegistro.localeCompare(b.fechaRegistro);
    if (cFechaR !== 0) return cFechaR;
    const cCad = a.cadena.localeCompare(b.cadena, 'es-MX');
    if (cCad !== 0) return cCad;
    const cSuc = a.sucursal.localeCompare(b.sucursal, 'es-MX');
    if (cSuc !== 0) return cSuc;
    const cDc = a.nombreDc.localeCompare(b.nombreDc, 'es-MX');
    if (cDc !== 0) return cDc;
    return a.producto.localeCompare(b.producto, 'es-MX');
  });

  let diaPdvProdRowIdx = 4;
  diaPdvProdList.forEach((rowItem, idx) => {
    const row = wsVentasDiaPdvProducto.getRow(diaPdvProdRowIdx);
    row.height = 20;

    const fillBg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF2F4F7';

    const values = [
      rowItem.fechaVenta,
      rowItem.fechaRegistro,
      rowItem.btlCve,
      rowItem.cadena,
      rowItem.idPdv,
      rowItem.sucursal,
      rowItem.supervisor,
      rowItem.idNomina,
      rowItem.nombreDc,
      rowItem.sku,
      rowItem.producto,
      rowItem.nombreCorto,
      rowItem.piezas,
      rowItem.monto,
    ];

    values.forEach((val, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = val;
      cell.font = { name: 'Segoe UI', size: 9.5 };
      cell.border = borderThin;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillBg } };

      if (cIdx <= 1) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (cIdx === 12) {
        cell.numFmt = '#,##0';
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (cIdx === 13) {
        cell.numFmt = '$#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });

    diaPdvProdRowIdx++;
  });

  // Fila de Totales
  const diaPdvProdTotalRow = wsVentasDiaPdvProducto.getRow(diaPdvProdRowIdx);
  diaPdvProdTotalRow.height = 24;

  for (let c = 1; c <= 12; c++) {
    const cell = diaPdvProdTotalRow.getCell(c);
    cell.fill = totalLabelFill;
    cell.border = totalBorder;
    if (c === 1) {
      cell.value = 'TOTAL GENERAL';
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF000000' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    }
  }

  const cellDiaPiezasTot = diaPdvProdTotalRow.getCell(13);
  cellDiaPiezasTot.value = diaPdvProdRowIdx > 4 ? { formula: `SUM(M4:M${diaPdvProdRowIdx - 1})` } : 0;
  cellDiaPiezasTot.numFmt = '#,##0';
  cellDiaPiezasTot.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF000000' } };
  cellDiaPiezasTot.alignment = { vertical: 'middle', horizontal: 'right' };
  cellDiaPiezasTot.fill = totalLabelFill;
  cellDiaPiezasTot.border = totalBorder;

  const cellDiaMontoTot = diaPdvProdTotalRow.getCell(14);
  cellDiaMontoTot.value = diaPdvProdRowIdx > 4 ? { formula: `SUM(N4:N${diaPdvProdRowIdx - 1})` } : 0;
  cellDiaMontoTot.numFmt = '$#,##0.00';
  cellDiaMontoTot.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF000000' } };
  cellDiaMontoTot.alignment = { vertical: 'middle', horizontal: 'right' };
  cellDiaMontoTot.fill = totalLabelFill;
  cellDiaMontoTot.border = totalBorder;

  wsVentasDiaPdvProducto.getColumn(1).width = 15; // Fecha Venta
  wsVentasDiaPdvProducto.getColumn(2).width = 16; // Fecha Registro
  wsVentasDiaPdvProducto.getColumn(3).width = 18; // BTL
  wsVentasDiaPdvProducto.getColumn(4).width = 20; // Cadena
  wsVentasDiaPdvProducto.getColumn(5).width = 14; // ID PDV
  wsVentasDiaPdvProducto.getColumn(6).width = 32; // Sucursal
  wsVentasDiaPdvProducto.getColumn(7).width = 25; // Supervisor
  wsVentasDiaPdvProducto.getColumn(8).width = 14; // ID Nómina
  wsVentasDiaPdvProducto.getColumn(9).width = 30; // Dermoconsejera
  wsVentasDiaPdvProducto.getColumn(10).width = 18; // SKU
  wsVentasDiaPdvProducto.getColumn(11).width = 40; // Producto
  wsVentasDiaPdvProducto.getColumn(12).width = 25; // Nombre Corto
  wsVentasDiaPdvProducto.getColumn(13).width = 16; // Piezas
  wsVentasDiaPdvProducto.getColumn(14).width = 18; // Monto

  const hoyMexico = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());

  const rangeLabels = {
    hoy: 'Hoy',
    semana: 'Esta Semana',
    mes: 'Este Mes',
    personalizado: 'Rango Personalizado',
  };

  if (data.range === 'mes' && data.selectedMonth) {
    const [year, month] = data.selectedMonth.split('-');
    const monthsES = [
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
    ];
    const mIdx = parseInt(month, 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      rangeLabels.mes = `${monthsES[mIdx]} ${year}`;
    }
  }

  const activeFiltersDesc =
    [
      data.filters.pdvLabel ? `PDV: ${data.filters.pdvLabel}` : null,
      data.filters.empleadoLabel ? `Dermoconsejera: ${data.filters.empleadoLabel}` : null,
      data.filters.supervisorLabel ? `Supervisor: ${data.filters.supervisorLabel}` : null,
      data.filters.zona ? `Zona: ${data.filters.zona}` : null,
      data.filters.cadena ? `Cadena: ${data.filters.cadena}` : null,
    ]
      .filter(Boolean)
      .join(' | ') || 'Ninguno';

  const BORDER_THIN = {
    top: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
    left: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
    right: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
  };

  // ----------------------------------------------------
  // HOJA 1: DASHBOARD GLOBAL
  // ----------------------------------------------------
  const wsGlobal = wb.addWorksheet('Dashboard Global', {
    views: [{ showGridLines: false }],
  });

  // Título e Información de Contexto
  wsGlobal.mergeCells('B2:Q2');
  const titleCell = wsGlobal.getCell('B2');
  titleCell.value = 'TABLERO DE RENDIMIENTO DE VENTAS';
  titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FF2E2E2E' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  wsGlobal.getRow(2).height = 30;

  wsGlobal.getCell('B3').value =
    `Periodo: ${rangeLabels[data.range] || data.range}  |  Descargado: ${hoyMexico}  |  Filtros: ${activeFiltersDesc}`;
  wsGlobal.getCell('B3').font = {
    name: 'Segoe UI',
    size: 10,
    italic: true,
    color: { argb: 'FF6B7280' },
  };
  wsGlobal.getCell('B3').alignment = { vertical: 'middle', horizontal: 'left' };
  wsGlobal.getRow(3).height = 20;

  // Función interna para dibujar Tarjetas de KPI
  function drawKpiCard(
    ws: any,
    startCol: number,
    value: any,
    label: string,
    bgColor: string,
    numFmt: string,
    valColor: string
  ) {
    const rStart = 5;
    const rEnd = 6;
    const col1 = startCol;
    const col2 = startCol + 1;

    ws.mergeCells(rStart, col1, rEnd, col2);
    const valCell = ws.getCell(rStart, col1);
    valCell.value = value;
    valCell.numFmt = numFmt;
    valCell.font = { name: 'Segoe UI', size: 20, bold: true, color: { argb: valColor } };
    valCell.alignment = { vertical: 'middle', horizontal: 'center' };

    ws.mergeCells(rEnd + 1, col1, rEnd + 1, col2);
    const lblCell = ws.getCell(rEnd + 1, col1);
    lblCell.value = label.toUpperCase();
    lblCell.font = { name: 'Segoe UI', size: 8.5, bold: true, color: { argb: 'FF6B7280' } };
    lblCell.alignment = { vertical: 'middle', horizontal: 'center' };

    for (let r = rStart; r <= rEnd + 1; r++) {
      for (let c = col1; c <= col2; c++) {
        const cell = ws.getCell(r, c);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: bgColor },
        };
        cell.border = {
          top: r === rStart ? { style: 'thin', color: { argb: 'FFD1D5DB' } } : undefined,
          bottom: r === rEnd + 1 ? { style: 'thin', color: { argb: 'FFD1D5DB' } } : undefined,
          left: c === col1 ? { style: 'thin', color: { argb: 'FFD1D5DB' } } : undefined,
          right: c === col2 ? { style: 'thin', color: { argb: 'FFD1D5DB' } } : undefined,
        };
      }
    }
  }

  // Dibujar las 4 tarjetas de KPI (Ventas Totales, Confirmadas, Pendientes, Unidades)
  drawKpiCard(
    wsGlobal,
    2,
    data.kpiSummary.total,
    'Ventas Totales',
    'FFFFF0F3',
    '#,##0',
    'FFFF7FA5'
  ); // Rosa
  drawKpiCard(
    wsGlobal,
    5,
    data.kpiSummary.confirmadas,
    'Confirmadas',
    'FFE6FFFA',
    '#,##0',
    'FF047857'
  ); // Verde
  drawKpiCard(
    wsGlobal,
    8,
    data.kpiSummary.pendientes,
    'Pendientes',
    'FFFFFBEB',
    '#,##0',
    'FFB45309'
  ); // Amarillo
  drawKpiCard(wsGlobal, 11, data.kpiSummary.unidades, 'Unidades', 'FFEBF8FF', '#,##0', 'FF2B6CB0'); // Azul

  wsGlobal.getRow(5).height = 22;
  wsGlobal.getRow(6).height = 22;
  wsGlobal.getRow(7).height = 18;

  // ------------------ TENDENCIAS DIARIAS ------------------
  const tdiariaTitleRow = 10;
  wsGlobal.getCell(`B${tdiariaTitleRow}`).value = 'TENDENCIA DIARIA';
  wsGlobal.getCell(`B${tdiariaTitleRow}`).font = {
    name: 'Segoe UI',
    size: 12,
    bold: true,
    color: { argb: 'FFFF7FA5' },
  };

  const tdiariaHeaderRow = 11;
  const trendHeaders = ['Fecha', 'Ventas Totales', 'Confirmadas', 'Pendientes', 'Unidades'];
  trendHeaders.forEach((h, i) => {
    const cell = wsGlobal.getCell(tdiariaHeaderRow, 2 + i);
    cell.value = h;
    cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4B5563' } }; // Gris oscuro
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  wsGlobal.getRow(tdiariaHeaderRow).height = 24;

  let nextRow = tdiariaHeaderRow + 1;
  data.diaria.forEach((pt, idx) => {
    const r = nextRow++;
    wsGlobal.getRow(r).height = 20;

    const rowValues = [pt.bucket, pt.total, pt.confirmadas, pt.pendientes, pt.unidades];

    rowValues.forEach((val, i) => {
      const cell = wsGlobal.getCell(r, 2 + i);
      cell.value = val;
      if (i > 0) {
        cell.numFmt = '#,##0';
      }
      cell.font = { name: 'Segoe UI', size: 9.5 };
      cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' };
      cell.border = BORDER_THIN;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: idx % 2 === 0 ? 'FFFFFFFF' : 'FFF9FAFB' }, // Zebra striping
      };
    });
  });

  // ------------------ TENDENCIAS SEMANALES ------------------
  nextRow += 2;
  const tsemanalTitleRow = nextRow++;
  wsGlobal.getCell(`B${tsemanalTitleRow}`).value = 'TENDENCIA SEMANAL';
  wsGlobal.getCell(`B${tsemanalTitleRow}`).font = {
    name: 'Segoe UI',
    size: 12,
    bold: true,
    color: { argb: 'FFFF7FA5' },
  };

  const tsemanalHeaderRow = nextRow++;
  const trendSemHeaders = ['Semana', 'Ventas Totales', 'Confirmadas', 'Pendientes', 'Unidades'];
  trendSemHeaders.forEach((h, i) => {
    const cell = wsGlobal.getCell(tsemanalHeaderRow, 2 + i);
    cell.value = h;
    cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4B5563' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  wsGlobal.getRow(tsemanalHeaderRow).height = 24;

  data.semanal.forEach((pt, idx) => {
    const r = nextRow++;
    wsGlobal.getRow(r).height = 20;

    // Formatear rango semanal
    const [year, month, day] = pt.bucket.split('-').map((part) => Number.parseInt(part, 10));
    const start = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const weekLabel = `${start.getDate()}/${start.getMonth() + 1} - ${end.getDate()}/${end.getMonth() + 1}`;

    const rowValues = [weekLabel, pt.total, pt.confirmadas, pt.pendientes, pt.unidades];

    rowValues.forEach((val, i) => {
      const cell = wsGlobal.getCell(r, 2 + i);
      cell.value = val;
      if (i > 0) {
        cell.numFmt = '#,##0';
      }
      cell.font = { name: 'Segoe UI', size: 9.5 };
      cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' };
      cell.border = BORDER_THIN;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: idx % 2 === 0 ? 'FFFFFFFF' : 'FFF9FAFB' },
      };
    });
  });

  // Configurar columnas de pestaña global
  wsGlobal.getColumn(1).width = 4; // Margen izquierdo
  wsGlobal.getColumn(2).width = 24; // Métrica / Fecha
  wsGlobal.getColumn(3).width = 16; // Ventas Totales
  wsGlobal.getColumn(4).width = 16; // Confirmadas
  wsGlobal.getColumn(5).width = 16; // Pendientes
  wsGlobal.getColumn(6).width = 16; // Unidades
  for (let c = 7; c <= 15; c++) {
    wsGlobal.getColumn(c).width = 12;
  }

  // ----------------------------------------------------
  // HELPER PARA HOJAS DE DESGLOSE (TABLAS DASHBOARD)
  // ----------------------------------------------------
  function buildAggregateSheet(
    nombreHoja: string,
    tituloCabecera: string,
    items: Array<{
      label: string;
      helper: string | null;
      total: number;
      confirmadas: number;
      pendientes: number;
      unidades: number;
    }>,
    hasHelper: boolean,
    helperLabel: string = 'Zona'
  ) {
    const ws = wb.addWorksheet(nombreHoja, {
      views: [
        {
          state: 'frozen',
          ySplit: 5, // Fija las cabeceras y los datos de filtro arriba
          xSplit: 1, // Fija la primera columna (el nombre)
          showGridLines: true,
        },
      ],
    });

    // Título de Hoja
    ws.mergeCells('A1:J1');
    const sheetTitle = ws.getCell('A1');
    sheetTitle.value = `REPORTE DE ALCANCE DE VENTAS — ${nombreHoja.toUpperCase()}`;
    sheetTitle.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FF2E2E2E' } };
    sheetTitle.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(1).height = 26;

    ws.mergeCells('A2:J2');
    const sheetMeta = ws.getCell('A2');
    sheetMeta.value = `Filtros: ${activeFiltersDesc}   |   Mes de consulta: ${rangeLabels[data.range] || data.range}   |   Descargado: ${hoyMexico}`;
    sheetMeta.font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: 'FF6B7280' } };
    sheetMeta.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(2).height = 20;
    ws.getRow(3).height = 10; // Espaciador

    // Encabezados de la Tabla
    const headers = [
      tituloCabecera,
      ...(hasHelper ? [helperLabel] : []),
      'Ventas Totales',
      'Confirmadas',
      'Pendientes',
      'Unidades',
    ];

    const headerRowIdx = 5;
    ws.getRow(headerRowIdx).height = 26;

    headers.forEach((h, i) => {
      const cell = ws.getCell(headerRowIdx, 1 + i);
      cell.value = h;
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF7FA5' }, // Rosa ISDIN
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = BORDER_THIN;
    });

    const dataStartRow = headerRowIdx + 1;
    const colIdxTotal = hasHelper ? 3 : 2;
    const colIdxConf = hasHelper ? 4 : 3;
    const colIdxPend = hasHelper ? 5 : 4;
    const colIdxUnid = hasHelper ? 6 : 5;

    items.forEach((item, idx) => {
      const r = dataStartRow + idx;
      ws.getRow(r).height = 20;

      const rowValues = [
        item.label,
        ...(hasHelper ? [item.helper || '—'] : []),
        item.total,
        item.confirmadas,
        item.pendientes,
        item.unidades,
      ];

      const isOdd = idx % 2 === 1;
      const rowBgColor = isOdd ? 'FFF9FAFB' : 'FFFFFFFF'; // Zebra striping

      rowValues.forEach((val, i) => {
        const cell = ws.getCell(r, 1 + i);

        // Estilos base de celda
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowBgColor },
        };
        cell.border = BORDER_THIN;
        cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF2E2E2E' } };
        cell.value = val;

        // Alinear a la izquierda nombres, el resto centrado
        cell.alignment = {
          vertical: 'middle',
          horizontal: i === 0 || (hasHelper && i === 1) ? 'left' : 'center',
        };
        if (1 + i !== 1 && (!hasHelper || 1 + i !== 2)) {
          cell.numFmt = '#,##0';
        }
      });
    });

    // Fila de TOTALES
    const totalRowIndex = dataStartRow + items.length;
    ws.getRow(totalRowIndex).height = 22;

    const totalHeadersCount = hasHelper ? 2 : 1;
    for (let c = 1; c <= totalHeadersCount; c++) {
      const cell = ws.getCell(totalRowIndex, c);
      cell.value = c === 1 ? 'TOTAL' : '';
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF2E2E2E' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }; // Gris claro
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF9CA3AF' } },
        bottom: { style: 'double', color: { argb: 'FF2E2E2E' } },
        left: BORDER_THIN.left,
        right: BORDER_THIN.right,
      };
    }

    const rangeStart = dataStartRow;
    const rangeEnd = totalRowIndex - 1;

    // Fórmulas para totales
    const totalsCols = [
      { col: colIdxTotal, letter: encodeCol(colIdxTotal - 1), fmt: '#,##0' },
      { col: colIdxConf, letter: encodeCol(colIdxConf - 1), fmt: '#,##0' },
      { col: colIdxPend, letter: encodeCol(colIdxPend - 1), fmt: '#,##0' },
      { col: colIdxUnid, letter: encodeCol(colIdxUnid - 1), fmt: '#,##0' },
    ];

    totalsCols.forEach((tc) => {
      const cell = ws.getCell(totalRowIndex, tc.col);
      cell.value = { formula: `SUM(${tc.letter}${rangeStart}:${tc.letter}${rangeEnd})` };
      cell.numFmt = tc.fmt;
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF2E2E2E' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF9CA3AF' } },
        bottom: { style: 'double', color: { argb: 'FF2E2E2E' } },
        left: BORDER_THIN.left,
        right: BORDER_THIN.right,
      };
    });

    // Ajustar anchos de columnas
    ws.getColumn(1).width = 32; // Columna Nombre
    if (hasHelper) {
      ws.getColumn(2).width = 20; // Columna Helper (Zona / Cadena)
    }
    const offset = hasHelper ? 1 : 0;
    ws.getColumn(2 + offset).width = 20; // Ventas Totales
    ws.getColumn(3 + offset).width = 16; // Confirmadas
    ws.getColumn(4 + offset).width = 16; // Pendientes
    ws.getColumn(5 + offset).width = 16; // Unidades
  }

  // Generar las hojas de desglose solicitadas
  buildAggregateSheet('Por Supervisor', 'Supervisor', data.porSupervisor, true, 'Zona / Región');
  buildAggregateSheet('Por Dermoconsejera', 'Dermoconsejera', data.porDc, true, 'Zona / Región');
  buildAggregateSheet('Por Cadena', 'Cadena', data.porCadena, false);
  buildAggregateSheet('Por PDV', 'Punto de Venta', data.porPdv, true, 'Cadena / Región');

  // Escribir el buffer de ExcelJS y descargar el archivo
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const fileDate = new Date().toISOString().slice(0, 10);
  const fileName = `Reporte_Ventas_${data.range.toUpperCase()}_${fileDate}.xlsx`;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}