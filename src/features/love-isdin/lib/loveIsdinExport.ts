'use client';

export interface LoveIsdinExportData {
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
    objetivo: number;
    validas: number;
    pendientes: number;
    rechazadas: number;
    duplicadas: number;
    cumplimientoPct: number;
    restante: number;
  };
  kpiDataset?: Array<{
    fechaOperacion: string;
    weekBucket: string;
    pdvId: string;
    pdvLabel: string;
    empleadoId: string;
    empleadoLabel: string;
    supervisorId: string | null;
    supervisorLabel: string;
    zona: string;
    cadena: string;
    total: number;
    objetivo: number;
    validas: number;
    pendientes: number;
    rechazadas: number;
    duplicadas: number;
    ausenciaTipo?: string | null;
    ausenciaDescuento?: number;
    ausenciaObservacion?: string | null;
    estatusLaboral?: string;
  }>;
  porPdv: Array<{
    id: string;
    label: string;
    helper: string | null;
    total: number;
    objetivo: number;
    validas: number;
    pendientes: number;
    rechazadas: number;
    duplicadas: number;
  }>;
  porDc: Array<{
    id: string;
    label: string;
    helper: string | null;
    total: number;
    objetivo: number;
    validas: number;
    pendientes: number;
    rechazadas: number;
    duplicadas: number;
  }>;
  porSupervisor: Array<{
    id: string;
    label: string;
    helper: string | null;
    total: number;
    objetivo: number;
    validas: number;
    pendientes: number;
    rechazadas: number;
    duplicadas: number;
  }>;
  porCadena: Array<{
    id: string;
    label: string;
    helper: string | null;
    total: number;
    objetivo: number;
    validas: number;
    pendientes: number;
    rechazadas: number;
    duplicadas: number;
  }>;
  diaria: Array<{
    bucket: string;
    total: number;
    objetivo: number;
    validas: number;
    pendientes: number;
    rechazadas: number;
    duplicadas: number;
  }>;
  semanal: Array<{
    bucket: string;
    total: number;
    objetivo: number;
    validas: number;
    pendientes: number;
    rechazadas: number;
    duplicadas: number;
  }>;
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

function groupConsecutiveDates(dates: string[]): string {
  if (dates.length === 0) return '';
  const parsedDates = dates.map(d => new Date(`${d}T12:00:00Z`)).sort((a, b) => a.getTime() - b.getTime());
  
  const ranges: string[] = [];
  let startRange = parsedDates[0];
  let endRange = parsedDates[0];
  
  for (let i = 1; i < parsedDates.length; i++) {
    const current = parsedDates[i];
    const diffTime = current.getTime() - endRange.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      endRange = current;
    } else {
      if (startRange.getTime() === endRange.getTime()) {
        ranges.push(formatDateToDiaMes(startRange));
      } else {
        ranges.push(`${formatDateToDiaMes(startRange)} al ${formatDateToDiaMes(endRange)}`);
      }
      startRange = current;
      endRange = current;
    }
  }
  
  if (startRange.getTime() === endRange.getTime()) {
    ranges.push(formatDateToDiaMes(startRange));
  } else {
    ranges.push(`${formatDateToDiaMes(startRange)} al ${formatDateToDiaMes(endRange)}`);
  }
  
  return ranges.join(', ');
}

function formatDateToDiaMes(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0');
  const monthNum = d.getUTCMonth();
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${day}-${months[monthNum]}`;
}

function getPercentStyle(pct: number, benchmark: number, is0SinJustif: boolean) {
  if (is0SinJustif) {
    return {
      fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFC00000' } },
      font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } }
    };
  }
  if (pct >= 1.0) {
    return {
      fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE2EFDA' } },
      font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF375623' } }
    };
  }
  if (pct >= benchmark) {
    return {
      fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFDDEBF7' } },
      font: { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF1F4E78' } }
    };
  }
  return {
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFCE4D6' } },
    font: { name: 'Segoe UI', size: 9.5, color: { argb: 'FFC65911' } }
  };
}

interface SemanaRango {
  numero: number;
  fechaInicio: string;
  fechaFin: string;
  label: string;
}

function obtenerSemanasDelPeriodo(startIso: string, endIso: string): SemanaRango[] {
  const start = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  
  const semanas: SemanaRango[] = [];
  
  // Si es un mes completo exacto (ej. del 1 al 28/30/31 del mismo mes)
  const isStartOfMonth = start.getUTCDate() === 1;
  const isEndOfMonth = new Date(start.getUTCFullYear(), start.getUTCMonth() + 1, 0).getDate() === end.getUTCDate() && start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  
  if (isStartOfMonth && isEndOfMonth) {
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth(); // 0-indexed
    const lastDay = end.getUTCDate();
    
    const monthNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const mLabel = monthNames[month];
    
    return [
      { numero: 1, fechaInicio: `${startIso.slice(0, 8)}01`, fechaFin: `${startIso.slice(0, 8)}07`, label: `SEM 1 (1-7 ${mLabel})` },
      { numero: 2, fechaInicio: `${startIso.slice(0, 8)}08`, fechaFin: `${startIso.slice(0, 8)}14`, label: `SEM 2 (8-14 ${mLabel})` },
      { numero: 3, fechaInicio: `${startIso.slice(0, 8)}15`, fechaFin: `${startIso.slice(0, 8)}21`, label: `SEM 3 (15-21 ${mLabel})` },
      { numero: 4, fechaInicio: `${startIso.slice(0, 8)}22`, fechaFin: endIso, label: `SEM 4 (22-${lastDay} ${mLabel})` },
    ];
  }
  
  // Si no es mes completo, dividimos en intervalos de 7 dias
  let current = new Date(start);
  let numSemana = 1;
  while (current <= end) {
    const semStartStr = current.toISOString().slice(0, 10);
    const semEnd = new Date(current);
    semEnd.setUTCDate(semEnd.getUTCDate() + 6);
    if (semEnd > end) {
      semEnd.setTime(end.getTime());
    }
    const semEndStr = semEnd.toISOString().slice(0, 10);
    
    const startDay = current.getUTCDate();
    const startMonth = current.getUTCMonth();
    const endDay = semEnd.getUTCDate();
    const endMonth = semEnd.getUTCMonth();
    
    const monthNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const label = startMonth === endMonth
      ? `SEM ${numSemana} (${startDay}-${endDay} ${monthNames[startMonth]})`
      : `SEM ${numSemana} (${startDay} ${monthNames[startMonth]}-${endDay} ${monthNames[endMonth]})`;
      
    semanas.push({
      numero: numSemana,
      fechaInicio: semStartStr,
      fechaFin: semEndStr,
      label,
    });
    
    current.setUTCDate(current.getUTCDate() + 7);
    numSemana++;
  }
  
  return semanas;
}

function encodeCell(cellObj: { r: number; c: number }): string {
  return `${encodeCol(cellObj.c)}${cellObj.r + 1}`;
}

export async function exportarLoveIsdinKpisToExcel(data: LoveIsdinExportData) {
  // Cargar dinámicamente ExcelJS en el cliente
  const ExcelJS = await import('exceljs');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Field Force Platform';
  wb.lastModifiedBy = 'Field Force Platform';
  wb.created = new Date();
  wb.modified = new Date();

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

  const activeFiltersDesc = [
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
  titleCell.value = 'LOVE ISDIN — TABLERO DE RENDIMIENTO';
  titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FF2E2E2E' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  wsGlobal.getRow(2).height = 30;

  wsGlobal.getCell('B3').value = `Periodo: ${rangeLabels[data.range] || data.range}  |  Descargado: ${hoyMexico}  |  Filtros: ${activeFiltersDesc}`;
  wsGlobal.getCell('B3').font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF6B7280' } };
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

  // Dibujar las 4 tarjetas de KPI
  drawKpiCard(wsGlobal, 2, data.kpiSummary.total, 'Afiliaciones', 'FFFFF0F3', '#,##0', 'FFFF7FA5'); // Rosa
  drawKpiCard(wsGlobal, 5, data.kpiSummary.objetivo, 'Meta', 'FFEBF8FF', '#,##0', 'FF2B6CB0'); // Azul
  // Cumplimiento usa fórmula
  drawKpiCard(wsGlobal, 8, { formula: 'B5/E5', result: data.kpiSummary.cumplimientoPct / 100 }, 'Cumplimiento', 'FFE6FFFA', '0.00%', 'FF047857'); // Verde
  drawKpiCard(wsGlobal, 11, data.kpiSummary.restante, 'Restante', 'FFFFFBEB', '#,##0', 'FFB45309'); // Amarillo

  wsGlobal.getRow(5).height = 22;
  wsGlobal.getRow(6).height = 22;
  wsGlobal.getRow(7).height = 18;

  // ------------------ TENDENCIAS DIARIAS ------------------
  const tdiariaTitleRow = 10;
  wsGlobal.getCell(`B${tdiariaTitleRow}`).value = 'TENDENCIA DIARIA';
  wsGlobal.getCell(`B${tdiariaTitleRow}`).font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFF7FA5' } };

  const tdiariaHeaderRow = 11;
  const trendHeaders = ['Fecha', 'Afiliaciones', 'Meta', 'Cumplimiento'];
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

    const rowValues = [
      pt.bucket,
      pt.total,
      pt.objetivo,
      null, // Cumplimiento por fórmula
    ];

    rowValues.forEach((val, i) => {
      const cell = wsGlobal.getCell(r, 2 + i);
      if (i === 3) {
        // Cumplimiento = C/D
        const totRef = encodeCell({ r: r - 1, c: 2 });
        const objRef = encodeCell({ r: r - 1, c: 3 });
        cell.value = { formula: `IF(${objRef}>0, ${totRef}/${objRef}, 0)`, result: pt.objetivo > 0 ? pt.total / pt.objetivo : 0 };
        cell.numFmt = '0.00%';
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true };
      } else {
        cell.value = val;
        if (i > 0) {
          cell.numFmt = '#,##0';
        }
        cell.font = { name: 'Segoe UI', size: 9.5 };
      }

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
  wsGlobal.getCell(`B${tsemanalTitleRow}`).font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFF7FA5' } };

  const tsemanalHeaderRow = nextRow++;
  const trendSemHeaders = ['Semana', 'Afiliaciones', 'Meta', 'Cumplimiento'];
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

    const rowValues = [
      weekLabel,
      pt.total,
      pt.objetivo,
      null,
    ];

    rowValues.forEach((val, i) => {
      const cell = wsGlobal.getCell(r, 2 + i);
      if (i === 3) {
        const totRef = encodeCell({ r: r - 1, c: 2 });
        const objRef = encodeCell({ r: r - 1, c: 3 });
        cell.value = { formula: `IF(${objRef}>0, ${totRef}/${objRef}, 0)`, result: pt.objetivo > 0 ? pt.total / pt.objetivo : 0 };
        cell.numFmt = '0.00%';
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true };
      } else {
        cell.value = val;
        if (i > 0) {
          cell.numFmt = '#,##0';
        }
        cell.font = { name: 'Segoe UI', size: 9.5 };
      }

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
  wsGlobal.getColumn(3).width = 14; // Valor / Cantidad
  wsGlobal.getColumn(4).width = 12; // Meta
  wsGlobal.getColumn(5).width = 15; // Cumplimiento
  for (let c = 6; c <= 15; c++) {
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
      objetivo: number;
      validas: number;
      pendientes: number;
      rechazadas: number;
      duplicadas: number;
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
    sheetTitle.value = `REPORTE DE ALCANCE — ${nombreHoja.toUpperCase()}`;
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
      'Afiliaciones Totales',
      'Meta',
      'Cumplimiento',
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
    const colIdxObj = hasHelper ? 4 : 3;
    const colIdxCump = hasHelper ? 5 : 4;

    items.forEach((item, idx) => {
      const r = dataStartRow + idx;
      ws.getRow(r).height = 20;

      const rowValues = [
        item.label,
        ...(hasHelper ? [item.helper || '—'] : []),
        item.total,
        item.objetivo,
        null, // Cumplimiento por fórmula
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

        if (1 + i === colIdxCump) {
          // Columna de Cumplimiento (Fórmula + Formato Condicional)
          const totRef = encodeCell({ r: r - 1, c: colIdxTotal - 1 });
          const objRef = encodeCell({ r: r - 1, c: colIdxObj - 1 });
          cell.value = { formula: `IF(${objRef}>0, ${totRef}/${objRef}, 0)`, result: item.objetivo > 0 ? item.total / item.objetivo : 0 };
          cell.numFmt = '0.00%';

          // Formato condicional dinámico simulado con colores pastel
          const pct = item.objetivo > 0 ? item.total / item.objetivo : 0;
          let condBg = 'FFFFFFFF';
          let condFg = 'FF2E2E2E';

          if (item.objetivo <= 0) {
            condBg = 'FFF3F4F6'; // Gris para metas en cero
            condFg = 'FF6B7280';
          } else if (pct >= 1) {
            condBg = 'FFE6FFFA'; // Verde suave
            condFg = 'FF047857';
          } else if (pct >= 0.5) {
            condBg = 'FFFFFBEB'; // Amarillo suave
            condFg = 'FFB45309';
          } else {
            condBg = 'FFFFF5F5'; // Rojo suave
            condFg = 'FFB91C1C';
          }

          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: condBg },
          };
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: condFg } };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.value = val;
          // Alinear a la izquierda nombres, el resto centrado
          cell.alignment = {
            vertical: 'middle',
            horizontal: i === 0 || (hasHelper && i === 1) ? 'left' : 'center',
          };
          if (1 + i !== 1 && (!hasHelper || 1 + i !== 2)) {
            cell.numFmt = '#,##0';
          }
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
      { col: colIdxObj, letter: encodeCol(colIdxObj - 1), fmt: '#,##0' },
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

    // Cumplimiento total = Totales/Metas
    const cellCumpTotal = ws.getCell(totalRowIndex, colIdxCump);
    const letterTot = encodeCol(colIdxTotal - 1);
    const letterObj = encodeCol(colIdxObj - 1);
    const totRowRef = totalRowIndex;
    cellCumpTotal.value = {
      formula: `IF(${letterObj}${totRowRef}>0, ${letterTot}${totRowRef}/${letterObj}${totRowRef}, 0)`,
    };
    cellCumpTotal.numFmt = '0.00%';
    cellCumpTotal.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF047857' } };
    cellCumpTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6FFFA' } }; // Fondo verde suave para la celda total
    cellCumpTotal.alignment = { vertical: 'middle', horizontal: 'center' };
    cellCumpTotal.border = {
      top: { style: 'thin', color: { argb: 'FF9CA3AF' } },
      bottom: { style: 'double', color: { argb: 'FF2E2E2E' } },
      left: BORDER_THIN.left,
      right: BORDER_THIN.right,
    };

    // Ajustar anchos de columnas
    ws.getColumn(1).width = 32; // Columna Nombre
    if (hasHelper) {
      ws.getColumn(2).width = 20; // Columna Helper (Zona / Cadena)
    }
    const offset = hasHelper ? 1 : 0;
    ws.getColumn(2 + offset).width = 20; // Afiliaciones Totales
    ws.getColumn(3 + offset).width = 12; // Meta
    ws.getColumn(4 + offset).width = 16; // Cumplimiento
  }

  const dates = data.kpiDataset && data.kpiDataset.length > 0 ? data.kpiDataset.map((d) => d.fechaOperacion).sort() : [];
  const dateFrom = dates.length > 0 ? dates[0] : '2026-06-01';
  const dateTo = dates.length > 0 ? dates[dates.length - 1] : '2026-06-30';
  const semanas = obtenerSemanasDelPeriodo(dateFrom, dateTo);

  interface SupervisorSummary {
    supervisorLabel: string;
    supervisorId: string;
    totalDc: number;
    excluidas: number;
    activas: number;
    semanasData: Array<{ reg: number; meta: number }>;
    totReg: number;
    metaTot: number;
    bajas: number;
    incapacidades: number;
    vacaciones: number;
    noPermiten: number;
    sinJustificacion: number;
  }

  function buildConsolidadoSupervisoresSheet(wb: any, data: LoveIsdinExportData, semanas: SemanaRango[]) {
    const ws = wb.addWorksheet('RESUMEN GENERAL', {
      views: [
        {
          state: 'frozen',
          ySplit: 4,
          xSplit: 1,
          showGridLines: true,
        },
      ],
    });
    
    const dates = data.kpiDataset!.map((d) => d.fechaOperacion).sort();
    const dateFrom = dates[0];
    const dateTo = dates[dates.length - 1];
    
    const supervisorMap = new Map<string, SupervisorSummary>();
    const supervisorGroupsRaw = new Map<string, any[]>();
    for (const row of data.kpiDataset!) {
      const supId = row.supervisorId || 'sin-supervisor';
      const group = supervisorGroupsRaw.get(supId) || [];
      group.push(row);
      supervisorGroupsRaw.set(supId, group);
    }
    
    for (const [supId, groupRows] of supervisorGroupsRaw.entries()) {
      const supervisorLabel = groupRows[0].supervisorLabel || 'Sin Supervisor';
      const employeeGroups = new Map<string, any[]>();
      for (const r of groupRows) {
        const empId = r.empleadoId;
        const eGroup = employeeGroups.get(empId) || [];
        eGroup.push(r);
        employeeGroups.set(empId, eGroup);
      }
      
      let totalDc = employeeGroups.size;
      let excluidas = 0;
      let bajas = 0;
      let incapacidades = 0;
      let vacaciones = 0;
      let noPermiten = 0;
      let sinJustificacion = 0;
      
      const weeksData = Array.from({ length: semanas.length }, () => ({ reg: 0, meta: 0 }));
      let totReg = 0;
      let metaTot = 0;
      
      for (const [empId, empRows] of employeeGroups.entries()) {
        const pdvLabel = empRows[0]?.pdvLabel || '';
        const isSanapielSephora = pdvLabel.toLowerCase().includes('sanapiel') || pdvLabel.toLowerCase().includes('sephora');
        const estatusLaboral = empRows[0].estatusLaboral || 'ACTIVO';
        const isBaja = estatusLaboral === 'BAJA';
        
        let hasIncActual = false;
        let hasVacActual = false;
        let hasNoPermActual = false;
        
        const lastSem = semanas[semanas.length - 1];
        const lastSemRows = empRows.filter(r => r.fechaOperacion >= lastSem.fechaInicio && r.fechaOperacion <= lastSem.fechaFin);
        
        for (const r of lastSemRows) {
          if (r.ausenciaTipo === 'INCAPACIDAD') hasIncActual = true;
          if (r.ausenciaTipo === 'VACACIONES') hasVacActual = true;
          
          const obs = (r.ausenciaObservacion || '').toLowerCase();
          if (obs.includes('no permite') || obs.includes('no permiten') || obs.includes('no permi')) {
            hasNoPermActual = true;
          }
        }
        
        // Exclusiones semana actual
        const isExcludedBaja = isBaja;
        const isExcludedInc = hasIncActual;
        const isExcludedVac = hasVacActual;
        const isExcludedNoPerm = hasNoPermActual || isSanapielSephora;
        const isExcludedWeekActual = isExcludedBaja || isExcludedInc || isExcludedVac || isExcludedNoPerm;
        
        let empReg = 0;
        let empMeta = 0;
        
        semanas.forEach((sem, sIdx) => {
          const semRows = empRows.filter(r => r.fechaOperacion >= sem.fechaInicio && r.fechaOperacion <= sem.fechaFin);
          const workedDays = semRows.length;
          
          const diasVacaciones = semRows.filter(r => r.ausenciaTipo === 'VACACIONES').length;
          const diasIncapacidad = semRows.filter(r => r.ausenciaTipo === 'INCAPACIDAD').length;
          const diasFormacion = semRows.filter(r => r.ausenciaTipo === 'FORMACION' || r.ausenciaTipo === 'FORMACIÓN').length;
          
          let semRegVal = semRows.reduce((sum, r) => sum + r.total, 0);
          let semMetaVal = isSanapielSephora ? 0 : Math.max(0, (workedDays - (diasVacaciones + diasIncapacidad + diasFormacion)) * 3);
          
          const isWeekExcluded = isSanapielSephora || (semMetaVal === 0 && semRegVal === 0);
          if (!isWeekExcluded) {
            empReg += semRegVal;
            empMeta += semMetaVal;
            
            if (!isSanapielSephora) {
              weeksData[sIdx].reg += semRegVal;
              weeksData[sIdx].meta += semMetaVal;
            }
          }
        });
        
        if (!isSanapielSephora) {
          totReg += empReg;
          metaTot += empMeta;
        }
        
        if (isExcludedBaja) bajas++;
        if (isExcludedInc) incapacidades++;
        if (isExcludedVac) vacaciones++;
        if (isExcludedNoPerm) noPermiten++;
        
        if (isExcludedWeekActual) {
          excluidas++;
        } else {
          if (empReg === 0 && empMeta > 0) {
            sinJustificacion++;
          }
        }
      }
      
      supervisorMap.set(supId, {
        supervisorLabel,
        supervisorId: supId,
        totalDc,
        excluidas,
        activas: totalDc - excluidas,
        semanasData: weeksData,
        totReg,
        metaTot,
        bajas,
        incapacidades,
        vacaciones,
        noPermiten,
        sinJustificacion,
      });
    }
    
    const W = semanas.length;
    const totalColsCount = 4 + W * 3 + 3 + 6;
    const lastColLetter = encodeCol(totalColsCount - 1);
    
    ws.mergeCells(`A1:${lastColLetter}1`);
    const titleCell = ws.getCell('A1');
    
    let totalRegGrupo = 0;
    let totalMetaGrupo = 0;
    for (const sup of supervisorMap.values()) {
      totalRegGrupo += sup.totReg;
      totalMetaGrupo += sup.metaTot;
    }
    const pctGrupo = totalMetaGrupo > 0 ? Math.round((totalRegGrupo / totalMetaGrupo) * 100) : 0;
    
    titleCell.value = `CIERRE DE PERIODO (${dateFrom} al ${dateTo}) | % AVANCE DEL GRUPO: ${pctGrupo}% (${totalRegGrupo.toLocaleString('es-MX')} de ${totalMetaGrupo.toLocaleString('es-MX')} meta)`;
    titleCell.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FF9C0006' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC5D3' } };
    ws.getRow(1).height = 30;
    
    ws.getRow(2).height = 24;
    ws.mergeCells('A2:A3');
    ws.getCell('A2').value = 'SUPERVISOR';
    ws.mergeCells('B2:B3');
    ws.getCell('B2').value = 'TOTAL DC';
    ws.mergeCells('C2:C3');
    ws.getCell('C2').value = 'EXCLUIDAS';
    ws.mergeCells('D2:D3');
    ws.getCell('D2').value = 'ACTIVAS';
    
    semanas.forEach((sem, i) => {
      const startColIdx = 5 + i * 3;
      const endColIdx = 7 + i * 3;
      ws.mergeCells(2, startColIdx, 2, endColIdx);
      const cell = ws.getCell(2, startColIdx);
      cell.value = sem.label;
    });
    
    const acumStartIdx = 5 + W * 3;
    ws.mergeCells(2, acumStartIdx, 2, acumStartIdx + 2);
    ws.getCell(2, acumStartIdx).value = 'ACUMULADO MES';
    
    const exclStartIdx = 8 + W * 3;
    ws.mergeCells(2, exclStartIdx, 2, exclStartIdx + 5);
    ws.getCell(2, exclStartIdx).value = 'EXCLUSIONES';
    
    ws.getRow(3).height = 24;
    for (let i = 0; i < W; i++) {
      ws.getCell(3, 5 + i * 3).value = 'REG';
      ws.getCell(3, 6 + i * 3).value = 'META';
      ws.getCell(3, 7 + i * 3).value = '%';
    }
    ws.getCell(3, acumStartIdx).value = 'TOT REG';
    ws.getCell(3, acumStartIdx + 1).value = 'META TOT';
    ws.getCell(3, acumStartIdx + 2).value = '% MES';
    
    ws.getCell(3, exclStartIdx).value = 'TOTAL';
    ws.getCell(3, exclStartIdx + 1).value = 'Bajas';
    ws.getCell(3, exclStartIdx + 2).value = 'Incapacidad';
    ws.getCell(3, exclStartIdx + 3).value = 'Vacaciones';
    ws.getCell(3, exclStartIdx + 4).value = 'No permiten';
    ws.getCell(3, exclStartIdx + 5).value = '0 sin justif.';
    
    for (let r = 2; r <= 3; r++) {
      for (let c = 1; c <= totalColsCount; c++) {
        const cell = ws.getCell(r, c);
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B365D' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = BORDER_THIN;
      }
    }
    
    const supervisorsList = Array.from(supervisorMap.values()).sort((a, b) =>
      a.supervisorLabel.localeCompare(b.supervisorLabel, 'es-MX')
    );
    const lastRowIndex = 4 + supervisorsList.length;
    
    ws.getRow(4).height = 24;
    const cellTotLabel = ws.getCell(4, 1);
    cellTotLabel.value = 'TOTAL GENERAL';
    cellTotLabel.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cellTotLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B365D' } };
    cellTotLabel.alignment = { vertical: 'middle', horizontal: 'left' };
    cellTotLabel.border = BORDER_THIN;
    
    ws.getCell(4, 2).value = { formula: `SUM(B5:B${lastRowIndex})` };
    ws.getCell(4, 3).value = { formula: `SUM(C5:C${lastRowIndex})` };
    ws.getCell(4, 4).value = { formula: `SUM(D5:D${lastRowIndex})` };
    
    for (let i = 0; i < W; i++) {
      const regLetter = encodeCol(4 + i * 3);
      const metaLetter = encodeCol(5 + i * 3);
      ws.getCell(4, 5 + i * 3).value = { formula: `SUM(${regLetter}5:${regLetter}${lastRowIndex})` };
      ws.getCell(4, 6 + i * 3).value = { formula: `SUM(${metaLetter}5:${metaLetter}${lastRowIndex})` };
      ws.getCell(4, 7 + i * 3).value = { formula: `IF(${metaLetter}4>0, ${regLetter}4/${metaLetter}4, 0)` };
    }
    
    const totRegLetter = encodeCol(acumStartIdx - 1);
    const metaTotLetter = encodeCol(acumStartIdx);
    ws.getCell(4, acumStartIdx).value = { formula: `SUM(${totRegLetter}5:${totRegLetter}${lastRowIndex})` };
    ws.getCell(4, acumStartIdx + 1).value = { formula: `SUM(${metaTotLetter}5:${metaTotLetter}${lastRowIndex})` };
    ws.getCell(4, acumStartIdx + 2).value = { formula: `IF(${metaTotLetter}4>0, ${totRegLetter}4/${metaTotLetter}4, 0)` };
    
    for (let i = 0; i < 6; i++) {
      const colLetter = encodeCol(exclStartIdx - 1 + i);
      ws.getCell(4, exclStartIdx + i).value = { formula: `SUM(${colLetter}5:${colLetter}${lastRowIndex})` };
    }
    
    for (let c = 2; c <= totalColsCount; c++) {
      const cell = ws.getCell(4, c);
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B365D' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = BORDER_THIN;
      const isPctCol = (c >= 5 && c < acumStartIdx && (c - 5) % 3 === 2) || (c === acumStartIdx + 2);
      if (isPctCol) {
        cell.numFmt = '0%';
      } else {
        cell.numFmt = '#,##0';
      }
    }
    
    supervisorsList.forEach((sup, idx) => {
      const r = 5 + idx;
      ws.getRow(r).height = 20;
      
      const isOdd = idx % 2 === 1;
      const rowBgColor = isOdd ? 'FFF9FAFB' : 'FFFFFFFF';
      
      ws.getCell(r, 1).value = sup.supervisorLabel;
      ws.getCell(r, 2).value = sup.totalDc;
      ws.getCell(r, 3).value = sup.excluidas;
      ws.getCell(r, 4).value = sup.activas;
      
      for (let i = 0; i < W; i++) {
        const regVal = sup.semanasData[i].reg;
        const metaVal = sup.semanasData[i].meta;
        const regLetter = encodeCol(4 + i * 3);
        const metaLetter = encodeCol(5 + i * 3);
        
        ws.getCell(r, 5 + i * 3).value = regVal;
        ws.getCell(r, 6 + i * 3).value = metaVal;
        ws.getCell(r, 7 + i * 3).value = { formula: `IF(${metaLetter}${r}>0, ${regLetter}${r}/${metaLetter}${r}, 0)` };
      }
      
      ws.getCell(r, acumStartIdx).value = sup.totReg;
      ws.getCell(r, acumStartIdx + 1).value = sup.metaTot;
      ws.getCell(r, acumStartIdx + 2).value = { formula: `IF(${metaTotLetter}${r}>0, ${totRegLetter}${r}/${metaTotLetter}${r}, 0)` };
      
      ws.getCell(r, exclStartIdx).value = { formula: `C${r}` };
      ws.getCell(r, exclStartIdx + 1).value = sup.bajas;
      ws.getCell(r, exclStartIdx + 2).value = sup.incapacidades;
      ws.getCell(r, exclStartIdx + 3).value = sup.vacaciones;
      ws.getCell(r, exclStartIdx + 4).value = sup.noPermiten;
      ws.getCell(r, exclStartIdx + 5).value = sup.sinJustificacion;
      
      for (let c = 1; c <= totalColsCount; c++) {
        const cell = ws.getCell(r, c);
        cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF2E2E2E' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgColor } };
        cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'center' };
        cell.border = BORDER_THIN;
        
        if (c > 1) {
          const isWeeklyPct = c >= 5 && c < acumStartIdx && (c - 5) % 3 === 2;
          if (isWeeklyPct) {
            cell.numFmt = '0%';
            
            const wIdx = Math.floor((c - 5) / 3);
            const val = sup.semanasData[wIdx].meta;
            const reg = sup.semanasData[wIdx].reg;
            const pct = val > 0 ? reg / val : 0;
            const is0SinJustif = reg === 0 && val > 0;
            
            const style = getPercentStyle(pct, pctGrupo / 100, is0SinJustif);
            cell.fill = style.fill;
            cell.font = style.font;
          } else if (c === acumStartIdx + 2) {
            cell.numFmt = '0%';
            const pct = sup.metaTot > 0 ? sup.totReg / sup.metaTot : 0;
            const is0SinJustif = sup.totReg === 0 && sup.metaTot > 0;
            
            const style = getPercentStyle(pct, pctGrupo / 100, is0SinJustif);
            cell.fill = style.fill;
            cell.font = style.font;
          } else {
            cell.numFmt = '#,##0';
          }
        }
        
        if (c === exclStartIdx + 5) {
          const val = sup.sinJustificacion;
          if (val > 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } };
            cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
          }
        }
      }
    });
    
    ws.autoFilter = `A4:${lastColLetter}${lastRowIndex}`;
    
    ws.getColumn(1).width = 30;
    ws.getColumn(2).width = 11;
    ws.getColumn(3).width = 11;
    ws.getColumn(4).width = 11;
    for (let c = 5; c <= totalColsCount; c++) {
      ws.getColumn(c).width = 10;
    }
  }

  buildConsolidadoSupervisoresSheet(wb, data, semanas);
  buildAggregateSheet('Por Dermoconsejera', 'Dermoconsejera', data.porDc, true, 'Zona / Región');
  buildAggregateSheet('Por Cadena', 'Cadena', data.porCadena, false);
  buildAggregateSheet('Por PDV', 'Punto de Venta', data.porPdv, true, 'Cadena / Región');

  // AGREGAR HOJAS DE DETALLE POR SUPERVISOR (SEMANAL CON AUSENCIAS Y OBSERVACIONES SEGUN IMAGENES)
  if (data.kpiDataset && data.kpiDataset.length > 0) {
    const dataset = data.kpiDataset;
    interface FilaReporte {
      empleadoNombre: string;
      empleadoId: string;
      pdvLabel: string;
      zona: string;
      estatusLaboral: string;
      semanas: Array<{
        afiliaciones: number;
        meta: number;
        diasVacaciones: number;
        diasIncapacidad: number;
        diasFormacion: number;
      }>;
      observaciones: string;
    }
    
    const supervisorGroups = new Map<string, { supervisorLabel: string; filas: FilaReporte[] }>();
    
    for (const row of dataset) {
      const supId = row.supervisorId || 'sin-supervisor';
      const supLabel = row.supervisorLabel || 'Sin Supervisor';
      
      let supGroup = supervisorGroups.get(supId);
      if (!supGroup) {
        supGroup = { supervisorLabel: supLabel, filas: [] };
        supervisorGroups.set(supId, supGroup);
      }
      
      let fila = supGroup.filas.find(f => f.pdvLabel === row.pdvLabel && f.empleadoNombre === row.empleadoLabel);
      if (!fila) {
        fila = {
          empleadoNombre: row.empleadoLabel,
          empleadoId: row.empleadoId,
          pdvLabel: row.pdvLabel,
          zona: row.zona,
          estatusLaboral: row.estatusLaboral || 'ACTIVO',
          semanas: Array.from({ length: semanas.length }, () => ({
            afiliaciones: 0,
            meta: 0,
            diasVacaciones: 0,
            diasIncapacidad: 0,
            diasFormacion: 0,
          })),
          observaciones: '',
        };
        supGroup.filas.push(fila);
      }
      
      const fechaOp = row.fechaOperacion;
      const indexSemana = semanas.findIndex(s => fechaOp >= s.fechaInicio && fechaOp <= s.fechaFin);
      if (indexSemana !== -1) {
        const sem = fila.semanas[indexSemana];
        sem.afiliaciones += row.total;
        sem.meta += row.objetivo;
        
        if (row.ausenciaTipo === 'VACACIONES') {
          sem.diasVacaciones += 1;
        } else if (row.ausenciaTipo === 'INCAPACIDAD') {
          sem.diasIncapacidad += 1;
        } else if (row.ausenciaTipo === 'FORMACION' || row.ausenciaTipo === 'FORMACIÓN') {
          sem.diasFormacion += 1;
        }
      }
    }
    
    // Calcular los summaries por supervisor para usarlos en sus encabezados
    const supervisorMap = new Map<string, SupervisorSummary>();
    const supervisorGroupsRaw = new Map<string, any[]>();
    for (const row of dataset) {
      const supId = row.supervisorId || 'sin-supervisor';
      const group = supervisorGroupsRaw.get(supId) || [];
      group.push(row);
      supervisorGroupsRaw.set(supId, group);
    }
    
    for (const [supId, groupRows] of supervisorGroupsRaw.entries()) {
      const supervisorLabel = groupRows[0].supervisorLabel || 'Sin Supervisor';
      const employeeGroups = new Map<string, any[]>();
      for (const r of groupRows) {
        const empId = r.empleadoId;
        const eGroup = employeeGroups.get(empId) || [];
        eGroup.push(r);
        employeeGroups.set(empId, eGroup);
      }
      
      let totalDc = employeeGroups.size;
      let excluidas = 0;
      let bajas = 0;
      let incapacidades = 0;
      let vacaciones = 0;
      let noPermiten = 0;
      let sinJustificacion = 0;
      
      const weeksData = Array.from({ length: semanas.length }, () => ({ reg: 0, meta: 0 }));
      let totReg = 0;
      let metaTot = 0;
      
      for (const [empId, empRows] of employeeGroups.entries()) {
        const pdvLabel = empRows[0]?.pdvLabel || '';
        const isSanapielSephora = pdvLabel.toLowerCase().includes('sanapiel') || pdvLabel.toLowerCase().includes('sephora');
        const estatusLaboral = empRows[0].estatusLaboral || 'ACTIVO';
        const isBaja = estatusLaboral === 'BAJA';
        
        let hasIncActual = false;
        let hasVacActual = false;
        let hasNoPermActual = false;
        
        const lastSem = semanas[semanas.length - 1];
        const lastSemRows = empRows.filter(r => r.fechaOperacion >= lastSem.fechaInicio && r.fechaOperacion <= lastSem.fechaFin);
        
        for (const r of lastSemRows) {
          if (r.ausenciaTipo === 'INCAPACIDAD') hasIncActual = true;
          if (r.ausenciaTipo === 'VACACIONES') hasVacActual = true;
          
          const obs = (r.ausenciaObservacion || '').toLowerCase();
          if (obs.includes('no permite') || obs.includes('no permiten') || obs.includes('no permi')) {
            hasNoPermActual = true;
          }
        }
        
        // Exclusiones semana actual
        const isExcludedBaja = isBaja;
        const isExcludedInc = hasIncActual;
        const isExcludedVac = hasVacActual;
        const isExcludedNoPerm = hasNoPermActual || isSanapielSephora;
        const isExcludedWeekActual = isExcludedBaja || isExcludedInc || isExcludedVac || isExcludedNoPerm;
        
        let empReg = 0;
        let empMeta = 0;
        
        semanas.forEach((sem, sIdx) => {
          const semRows = empRows.filter(r => r.fechaOperacion >= sem.fechaInicio && r.fechaOperacion <= sem.fechaFin);
          const workedDays = semRows.length;
          
          const diasVacaciones = semRows.filter(r => r.ausenciaTipo === 'VACACIONES').length;
          const diasIncapacidad = semRows.filter(r => r.ausenciaTipo === 'INCAPACIDAD').length;
          const diasFormacion = semRows.filter(r => r.ausenciaTipo === 'FORMACION' || r.ausenciaTipo === 'FORMACIÓN').length;
          
          let semRegVal = semRows.reduce((sum, r) => sum + r.total, 0);
          let semMetaVal = isSanapielSephora ? 0 : Math.max(0, (workedDays - (diasVacaciones + diasIncapacidad + diasFormacion)) * 3);
          
          const isWeekExcluded = isSanapielSephora || (semMetaVal === 0 && semRegVal === 0);
          if (!isWeekExcluded) {
            empReg += semRegVal;
            empMeta += semMetaVal;
            
            if (!isSanapielSephora) {
              weeksData[sIdx].reg += semRegVal;
              weeksData[sIdx].meta += semMetaVal;
            }
          }
        });
        
        if (!isSanapielSephora) {
          totReg += empReg;
          metaTot += empMeta;
        }
        
        if (isExcludedBaja) bajas++;
        if (isExcludedInc) incapacidades++;
        if (isExcludedVac) vacaciones++;
        if (isExcludedNoPerm) noPermiten++;
        
        if (isExcludedWeekActual) {
          excluidas++;
        } else {
          if (empReg === 0 && empMeta > 0) {
            sinJustificacion++;
          }
        }
      }
      
      supervisorMap.set(supId, {
        supervisorLabel,
        supervisorId: supId,
        totalDc,
        excluidas,
        activas: totalDc - excluidas,
        semanasData: weeksData,
        totReg,
        metaTot,
        bajas,
        incapacidades,
        vacaciones,
        noPermiten,
        sinJustificacion,
      });
    }

    // Resolver observaciones por dermoconsejera
    for (const [supId, group] of supervisorGroups.entries()) {
      for (const fila of group.filas) {
        const pdvLabel = fila.pdvLabel || '';
        const isSanapielSephora = pdvLabel.toLowerCase().includes('sanapiel') || pdvLabel.toLowerCase().includes('sephora');
        
        if (isSanapielSephora) {
          fila.observaciones = 'Sanapiel/Sephora — sin meta de registros';
          continue;
        }
        
        const empDailyRows = dataset.filter(r => r.empleadoId === fila.empleadoId && (r.supervisorId || 'sin-supervisor') === supId);
        const obsParts: string[] = [];
        
        if (fila.estatusLaboral === 'BAJA') {
          obsParts.push('BAJA');
        }
        
        const uniqueAbsences = Array.from(new Set(empDailyRows.map(r => r.ausenciaTipo).filter((t): t is string => typeof t === 'string' && t.trim() !== '')));
        for (const abs of uniqueAbsences) {
          const absRows = empDailyRows.filter(r => r.ausenciaTipo === abs);
          const dates = absRows.map(r => r.fechaOperacion);
          const datesStr = groupConsecutiveDates(dates);
          
          if (abs === 'VACACIONES') {
            obsParts.push(`VACACIONES (${datesStr})`);
          } else if (abs === 'INCAPACIDAD') {
            obsParts.push(`INCAPACIDAD (${datesStr})`);
          } else {
            obsParts.push(`${abs} (${datesStr})`);
          }
        }
        
        const uniqueComments = Array.from(new Set(empDailyRows.map(r => r.ausenciaObservacion).filter((c): c is string => typeof c === 'string' && c.trim() !== '')));
        for (const comment of uniqueComments) {
          obsParts.push(comment);
        }
        
        fila.observaciones = obsParts.join(' | ') || '';
      }
    }
    
    // Renderizar hojas Sup. [Name]
    for (const [supId, group] of supervisorGroups.entries()) {
      const safeLabel = group.supervisorLabel.replace(/[\\\/*?:\[\]]/g, '');
      const supNameShort = safeLabel.substring(0, 25);
      const sheetName = `Sup. ${supNameShort}`;
      
      const supSummary = supervisorMap.get(supId) || {
        supervisorLabel: group.supervisorLabel,
        totalDc: group.filas.length,
        excluidas: 0,
        activas: group.filas.length,
        totReg: 0,
        metaTot: 0,
        bajas: 0,
        incapacidades: 0,
        vacaciones: 0,
        noPermiten: 0,
        sinJustificacion: 0,
      };
      
      const W = semanas.length;
      const totalColsCount = 4 + W * 3 + 3 + 1;
      const lastColLetter = encodeCol(totalColsCount - 1);
      
      const ws = wb.addWorksheet(sheetName, {
        views: [
          {
            state: 'frozen',
            ySplit: 4,
            xSplit: 2,
            showGridLines: true,
          },
        ],
      });
      
      ws.mergeCells(`A1:${lastColLetter}1`);
      const titleCell = ws.getCell('A1');
      const supAvance = supSummary.metaTot > 0 ? Math.round((supSummary.totReg / supSummary.metaTot) * 100) : 0;
      titleCell.value = `% AVANCE MES: ${supAvance}% (${supSummary.totReg.toLocaleString('es-MX')} de ${supSummary.metaTot.toLocaleString('es-MX')} meta) | ${group.supervisorLabel.toUpperCase()} | DC: ${supSummary.totalDc} Activas S4: ${supSummary.activas} Excluidas S4: ${supSummary.excluidas}`;
      titleCell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF9C0006' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC5D3' } };
      ws.getRow(1).height = 30;
      
      ws.getRow(2).height = 24;
      ws.mergeCells('A2:A3');
      ws.getCell('A2').value = '#';
      ws.mergeCells('B2:B3');
      ws.getCell('B2').value = 'DERMOCONSEJERA';
      ws.mergeCells('C2:C3');
      ws.getCell('C2').value = 'CADENA / SUCURSAL';
      ws.mergeCells('D2:D3');
      ws.getCell('D2').value = 'TERRITORIO';
      
      semanas.forEach((sem, i) => {
        const startColIdx = 5 + i * 3;
        const endColIdx = 7 + i * 3;
        ws.mergeCells(2, startColIdx, 2, endColIdx);
        ws.getCell(2, startColIdx).value = sem.label;
      });
      
      const acumStartIdx = 5 + W * 3;
      ws.mergeCells(2, acumStartIdx, 2, acumStartIdx + 2);
      ws.getCell(2, acumStartIdx).value = 'ACUMULADO MES';
      
      const exclColIdx = 8 + W * 3;
      ws.mergeCells(2, exclColIdx, 3, exclColIdx);
      ws.getCell(2, exclColIdx).value = 'EXCLUSION / OBS';
      
      ws.getRow(3).height = 24;
      for (let i = 0; i < W; i++) {
        ws.getCell(3, 5 + i * 3).value = 'REG';
        ws.getCell(3, 6 + i * 3).value = 'META';
        ws.getCell(3, 7 + i * 3).value = '%';
      }
      ws.getCell(3, acumStartIdx).value = 'TOT REG';
      ws.getCell(3, acumStartIdx + 1).value = 'META TOT';
      ws.getCell(3, acumStartIdx + 2).value = '% MES';
      
      for (let r = 2; r <= 3; r++) {
        for (let c = 1; c <= totalColsCount; c++) {
          const cell = ws.getCell(r, c);
          cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B365D' } };
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          cell.border = BORDER_THIN;
        }
      }
      
      const lastRowIndex = 4 + group.filas.length;
      
      ws.getRow(4).height = 24;
      ws.getCell(4, 1).value = 'TOT ALE';
      ws.getCell(4, 2).value = supSummary.totalDc;
      const distinctPdvs = new Set(group.filas.map(f => f.pdvLabel));
      const distinctZonas = new Set(group.filas.map(f => f.zona));
      ws.getCell(4, 3).value = distinctPdvs.size;
      ws.getCell(4, 4).value = distinctZonas.size;
      
      for (let i = 0; i < W; i++) {
        const regLetter = encodeCol(4 + i * 3);
        const metaLetter = encodeCol(5 + i * 3);
        ws.getCell(4, 5 + i * 3).value = { formula: `SUM(${regLetter}5:${regLetter}${lastRowIndex})` };
        ws.getCell(4, 6 + i * 3).value = { formula: `SUM(${metaLetter}5:${metaLetter}${lastRowIndex})` };
        ws.getCell(4, 7 + i * 3).value = { formula: `IF(${metaLetter}4>0, ${regLetter}4/${metaLetter}4, 0)` };
      }
      
      const totRegLetter = encodeCol(acumStartIdx - 1);
      const metaTotLetter = encodeCol(acumStartIdx);
      ws.getCell(4, acumStartIdx).value = { formula: `SUM(${totRegLetter}5:${totRegLetter}${lastRowIndex})` };
      ws.getCell(4, acumStartIdx + 1).value = { formula: `SUM(${metaTotLetter}5:${metaTotLetter}${lastRowIndex})` };
      ws.getCell(4, acumStartIdx + 2).value = { formula: `IF(${metaTotLetter}4>0, ${totRegLetter}4/${metaTotLetter}4, 0)` };
      
      const exclLabelParts: string[] = [];
      if (supSummary.bajas > 0) exclLabelParts.push(`Bajas:${supSummary.bajas}`);
      if (supSummary.incapacidades > 0) exclLabelParts.push(`Incap:${supSummary.incapacidades}`);
      if (supSummary.vacaciones > 0) exclLabelParts.push(`Vac:${supSummary.vacaciones}`);
      if (supSummary.noPermiten > 0) exclLabelParts.push(`No perm:${supSummary.noPermiten}`);
      ws.getCell(4, exclColIdx).value = exclLabelParts.join(' | ') || 'Ninguna';
      
      for (let c = 1; c <= totalColsCount; c++) {
        const cell = ws.getCell(4, c);
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
        cell.alignment = { vertical: 'middle', horizontal: c <= 4 ? 'left' : 'center' };
        cell.border = BORDER_THIN;
        if (c >= 5 && c < exclColIdx) {
          const isPctCol = (c >= 5 && c < acumStartIdx && (c - 5) % 3 === 2) || (c === acumStartIdx + 2);
          if (isPctCol) {
            cell.numFmt = '0%';
          } else {
            cell.numFmt = '#,##0';
          }
        }
      }
      
      group.filas.sort((a, b) => {
        const getFilaGroup = (f: FilaReporte) => {
          const pdvLabel = f.pdvLabel || '';
          const isSanapielSephora = pdvLabel.toLowerCase().includes('sanapiel') || pdvLabel.toLowerCase().includes('sephora');
          const isBaja = f.estatusLaboral === 'BAJA' || f.observaciones.includes('BAJA');
          
          const lastSem = semanas[semanas.length - 1];
          const lastSemData = f.semanas[semanas.length - 1];
          const hasVacActual = lastSemData ? lastSemData.diasVacaciones > 0 : false;
          const hasIncActual = lastSemData ? lastSemData.diasIncapacidad > 0 : false;
          const isExcludedWeekActual = isBaja || isSanapielSephora || hasVacActual || hasIncActual || (lastSemData && lastSemData.meta === 0 && f.observaciones !== '');
          
          const totReg = f.semanas.reduce((acc, s) => acc + s.afiliaciones, 0);
          const metaTot = f.semanas.reduce((acc, s) => acc + s.meta, 0);
          const is0SinJustif = totReg === 0 && metaTot > 0 && !isBaja && !isSanapielSephora && !f.semanas.some(s => s.diasVacaciones > 0 || s.diasIncapacidad > 0);
          
          if (is0SinJustif) return 3;
          if (isExcludedWeekActual) return 2;
          return 1;
        };
        
        const groupA = getFilaGroup(a);
        const groupB = getFilaGroup(b);
        
        if (groupA !== groupB) {
          return groupA - groupB;
        }
        
        const getPct = (f: FilaReporte) => {
          const pdvLabel = f.pdvLabel || '';
          const isSanapielSephora = pdvLabel.toLowerCase().includes('sanapiel') || pdvLabel.toLowerCase().includes('sephora');
          if (isSanapielSephora) return 0;
          
          let empReg = 0;
          let empMeta = 0;
          semanas.forEach((sem, sIdx) => {
            const semData = f.semanas[sIdx];
            const isWeekExcluded = isSanapielSephora || (semData.meta === 0 && semData.afiliaciones === 0);
            if (!isWeekExcluded) {
              empReg += semData.afiliaciones;
              empMeta += semData.meta;
            }
          });
          return empMeta > 0 ? empReg / empMeta : 0;
        };
        
        const pctA = getPct(a);
        const pctB = getPct(b);
        
        if (pctA !== pctB) {
          return pctB - pctA;
        }
        
        return a.empleadoNombre.localeCompare(b.empleadoNombre, 'es-MX');
      });
      
      group.filas.forEach((fila, idx) => {
        const r = 5 + idx;
        ws.getRow(r).height = 20;
        
        const isOdd = idx % 2 === 1;
        const rowBgColor = isOdd ? 'FFF9FAFB' : 'FFFFFFFF';
        
        ws.getCell(r, 1).value = idx + 1;
        ws.getCell(r, 2).value = fila.empleadoNombre;
        ws.getCell(r, 3).value = fila.pdvLabel;
        ws.getCell(r, 4).value = fila.zona;
        
        const pdvLabel = fila.pdvLabel || '';
        const isSanapielSephora = pdvLabel.toLowerCase().includes('sanapiel') || pdvLabel.toLowerCase().includes('sephora');
        const isBaja = fila.estatusLaboral === 'BAJA';
        
        semanas.forEach((sem, sIdx) => {
          const semData = fila.semanas[sIdx];
          const empDailyRows = dataset.filter(r => r.empleadoId === fila.empleadoId && (r.supervisorId || 'sin-supervisor') === supId);
          const semRows = empDailyRows.filter(r => r.fechaOperacion >= sem.fechaInicio && r.fechaOperacion <= sem.fechaFin);
          const workedDays = semRows.length;
          
          const semReg = semData.afiliaciones;
          const semMeta = isSanapielSephora ? 0 : Math.max(0, (workedDays - (semData.diasVacaciones + semData.diasIncapacidad + semData.diasFormacion)) * 3);
          semData.meta = semMeta;
          
          const colRegIdx = 5 + sIdx * 3;
          const colMetaIdx = 6 + sIdx * 3;
          const colPctIdx = 7 + sIdx * 3;
          
          const cellReg = ws.getCell(r, colRegIdx);
          const cellMeta = ws.getCell(r, colMetaIdx);
          const cellPct = ws.getCell(r, colPctIdx);
          
          const isWeekExcluded = isSanapielSephora || (semMeta === 0 && semReg === 0);
          
          if (isWeekExcluded) {
            cellReg.value = '—';
            cellMeta.value = '—';
            cellPct.value = null;
          } else {
            cellReg.value = semReg;
            cellMeta.value = semMeta;
            const regLetter = encodeCol(colRegIdx - 1);
            const metaLetter = encodeCol(colMetaIdx - 1);
            cellPct.value = { formula: `IF(${metaLetter}${r}>0, ${regLetter}${r}/${metaLetter}${r}, 0)` };
            cellPct.numFmt = '0%';
          }
        });
        
        let empReg = 0;
        let empMeta = 0;
        semanas.forEach((sem, sIdx) => {
          const semData = fila.semanas[sIdx];
          const isWeekExcluded = isSanapielSephora || (semData.meta === 0 && semData.afiliaciones === 0);
          if (!isWeekExcluded) {
            empReg += semData.afiliaciones;
            empMeta += semData.meta;
          }
        });
        
        if (isSanapielSephora) {
          ws.getCell(r, acumStartIdx).value = '—';
          ws.getCell(r, acumStartIdx + 1).value = '—';
          ws.getCell(r, acumStartIdx + 2).value = null;
        } else {
          ws.getCell(r, acumStartIdx).value = empReg;
          ws.getCell(r, acumStartIdx + 1).value = empMeta;
          
          const totRegLetter = encodeCol(acumStartIdx - 1);
          const metaTotLetter = encodeCol(acumStartIdx);
          ws.getCell(r, acumStartIdx + 2).value = { formula: `IF(${metaTotLetter}${r}>0, ${totRegLetter}${r}/${metaTotLetter}${r}, 0)` };
          ws.getCell(r, acumStartIdx + 2).numFmt = '0%';
        }
        
        if (isSanapielSephora) {
          ws.getCell(r, exclColIdx).value = 'Sanapiel/Sephora — sin meta de registros';
        } else {
          ws.getCell(r, exclColIdx).value = fila.observaciones || '';
        }
        
        const isRowExcluded = isSanapielSephora || (fila.observaciones !== '' && !isSanapielSephora);
        const finalRowBgColor = isRowExcluded ? 'FFFFF2CC' : rowBgColor;
        const supBenchmark = supSummary.metaTot > 0 ? supSummary.totReg / supSummary.metaTot : 0;
        
        for (let c = 1; c <= totalColsCount; c++) {
          const cell = ws.getCell(r, c);
          cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF2E2E2E' } };
          
          if (c !== 2) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: finalRowBgColor } };
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
          }
          
          cell.alignment = { vertical: 'middle', horizontal: c === 1 || c === 2 ? 'left' : 'center' };
          cell.border = BORDER_THIN;
          
          if (c >= 5 && c < exclColIdx) {
            const cellValue = cell.value;
            if (cellValue !== '—') {
              const isWeeklyPct = c >= 5 && c < acumStartIdx && (c - 5) % 3 === 2;
              if (isWeeklyPct) {
                cell.numFmt = '0%';
                
                const wIdx = Math.floor((c - 5) / 3);
                const semData = fila.semanas[wIdx];
                const val = semData.meta;
                const reg = semData.afiliaciones;
                const pct = val > 0 ? reg / val : 0;
                
                if (val > 0) {
                  const is0SinJustif = reg === 0 && !isBaja && !isSanapielSephora && !(semData.diasVacaciones > 0 || semData.diasIncapacidad > 0);
                  const style = getPercentStyle(pct, supBenchmark, is0SinJustif);
                  cell.fill = style.fill;
                  cell.font = style.font;
                }
              }
            }
          }
          
          if (c === acumStartIdx + 2 && !isSanapielSephora) {
            cell.numFmt = '0%';
            const pct = empMeta > 0 ? empReg / empMeta : 0;
            const is0SinJustif = empReg === 0 && empMeta > 0 && !isBaja && !isSanapielSephora && !fila.semanas.some(s => s.diasVacaciones > 0 || s.diasIncapacidad > 0);
            
            const style = getPercentStyle(pct, supBenchmark, is0SinJustif);
            cell.fill = style.fill;
            cell.font = style.font;
          }
        }
      });
      
      ws.autoFilter = `A4:${lastColLetter}${lastRowIndex}`;
      
      ws.getColumn(1).width = 9;
      ws.getColumn(2).width = 30;
      ws.getColumn(3).width = 38;
      ws.getColumn(4).width = 20;
      for (let c = 5; c < exclColIdx; c++) {
        ws.getColumn(c).width = 10;
      }
      ws.getColumn(exclColIdx).width = 45;
    }
  }

  // Escribir el buffer de ExcelJS y descargar el archivo
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const fileDate = new Date().toISOString().slice(0, 10);
  const fileName = `Reporte_LOVE_ISDIN_${data.range.toUpperCase()}_${fileDate}.xlsx`;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
