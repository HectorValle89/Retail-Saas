import type { PdvsPanelData } from './pdvService';

function escapeCsvValue(value: string | number | null | undefined): string {
  if (value == null) return '';
  const normalized = String(value);
  if (
    normalized.includes('"') ||
    normalized.includes(',') ||
    normalized.includes('\n') ||
    normalized.includes('\r')
  ) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function generarCsvPdvsCobertura(data: PdvsPanelData): {
  csv: string;
  filename: string;
} {
  const headers = [
    'MES',
    'NUM',
    'CLAVE_BTL',
    'ID_CADENA',
    'CADENA_CODIGO',
    'CADENA',
    'PDV',
    'DIRECCION',
    'CIUDAD',
    'ESTADO',
    'ZONA',
    'FORMATO',
    'ESTATUS_TIENDA',
    'COBERTURA_ESTADO',
    'DIAS_CUBIERTOS',
    'PORCENTAJE_COBERTURA',
    'COBERTURA_ETIQUETA',
    'SUPERVISOR_ASIGNADO',
    'SUPERVISOR_VIGENTE_DESDE',
    'LATITUD',
    'LONGITUD',
    'RADIO_METROS',
    'PERMITE_CHECKIN_CON_JUSTIFICACION',
    'GEOCERCA_COMPLETA',
    'HORARIO_MODO',
    'HORARIO_BASE_ENTRADA',
    'HORARIO_BASE_SALIDA',
  ];

  const rows = data.pdvs.map((pdv, index) => [
    data.month,
    index + 1,
    pdv.claveBtl,
    pdv.idCadena ?? '',
    pdv.cadenaCodigo ?? '',
    pdv.cadena ?? '',
    pdv.nombre,
    pdv.direccion ?? '',
    pdv.ciudad ?? '',
    pdv.estado ?? '',
    pdv.zona ?? '',
    pdv.formato ?? '',
    pdv.estatus,
    pdv.publicacionMensualEstado,
    pdv.publicacionMensualDiasAsignados,
    `${pdv.publicacionMensualCoberturaPct}%`,
    pdv.publicacionMensualEtiqueta,
    pdv.supervisorActual ?? 'Sin supervisor',
    pdv.supervisorVigenteDesde ?? 'Sin registro',
    pdv.latitud ?? '',
    pdv.longitud ?? '',
    pdv.radioMetros ?? '',
    pdv.permiteCheckinConJustificacion ? 'SI' : 'NO',
    pdv.geocercaCompleta ? 'SI' : 'NO',
    pdv.horarioMode,
    pdv.horarioEntrada ?? '',
    pdv.horarioSalida ?? '',
  ]);

  // UTF-8 BOM para que Excel en Windows lo abra con acentos y caracteres latinos correctos
  const csv = `\uFEFF${headers.join(',')}\n${rows
    .map((row) => row.map((val) => escapeCsvValue(val)).join(','))
    .join('\n')}\n`;

  const safeMonth = sanitizeFilenamePart(data.month);
  const today = new Date().toISOString().slice(0, 10);
  const filename = `Catalogo_PDVs_Cobertura_${safeMonth}_${today}.csv`;

  return { csv, filename };
}

export async function generarExcelPdvsCobertura(data: PdvsPanelData): Promise<{
  buffer: Uint8Array;
  filename: string;
}> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Field Force Platform';
  workbook.created = new Date();

  const borderThin = {
    top: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
  };

  // -------------------------------------------------------------
  // HOJA 1: CATÁLOGO Y COBERTURA MENSUAL
  // -------------------------------------------------------------
  const sheet = workbook.addWorksheet('Catálogo y Cobertura');
  sheet.views = [{ showGridLines: true }];

  // Título
  sheet.mergeCells('A1:Q1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `Catálogo de Tiendas y Cobertura Operativa - Mes ${data.month}`;
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF0F172A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 34;

  // Subtítulo con KPIs
  sheet.mergeCells('A2:Q2');
  const subtitleCell = sheet.getCell('A2');
  subtitleCell.value = `Total tiendas: ${data.pdvs.length} | Con DC completa: ${data.publicacionMensual.asignados} | Cobertura parcial: ${data.publicacionMensual.parciales} | Sin DC / Vacantes: ${data.publicacionMensual.sinAsignacion} | Inactivas: ${data.publicacionMensual.inactivos}`;
  subtitleCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF475569' } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(2).height = 24;

  // Encabezados de la tabla
  const headers = [
    '#',
    'Mes',
    'Clave BTL',
    'ID Cadena',
    'Cadena',
    'PDV / Tienda',
    'Dirección',
    'Ciudad',
    'Estado',
    'Zona',
    'Formato',
    'Estatus Tienda',
    'Estado Cobertura',
    'Días Cubiertos',
    '% Cobertura',
    'Detalle Cobertura',
    'Supervisor Asignado',
    'Supervisor Vigente Desde',
    'Latitud',
    'Longitud',
    'Radio (m)',
    'Check-in Justif.',
    'Horario Modo',
    'Hora Entrada',
    'Hora Salida',
  ];

  const headerRow = sheet.getRow(4);
  headerRow.values = headers;
  headerRow.height = 28;

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' }, // Slate 900
    };
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = borderThin;
  });

  // Filas de datos
  data.pdvs.forEach((pdv, idx) => {
    const rowNum = 5 + idx;
    const row = sheet.getRow(rowNum);

    row.values = [
      idx + 1,
      data.month,
      pdv.claveBtl,
      pdv.idCadena ?? '',
      pdv.cadena ?? '',
      pdv.nombre,
      pdv.direccion ?? '',
      pdv.ciudad ?? '',
      pdv.estado ?? '',
      pdv.zona ?? '',
      pdv.formato ?? '',
      pdv.estatus,
      pdv.publicacionMensualEstado,
      pdv.publicacionMensualDiasAsignados,
      pdv.publicacionMensualCoberturaPct / 100,
      pdv.publicacionMensualEtiqueta,
      pdv.supervisorActual ?? 'Sin supervisor',
      pdv.supervisorVigenteDesde ?? 'Sin registro',
      pdv.latitud ?? '',
      pdv.longitud ?? '',
      pdv.radioMetros ?? '',
      pdv.permiteCheckinConJustificacion ? 'SÍ' : 'NO',
      pdv.horarioMode,
      pdv.horarioEntrada ?? '',
      pdv.horarioSalida ?? '',
    ];

    row.height = 22;

    // Colores suaves para la celda de Estado Cobertura (columna 13)
    const coberturaCell = row.getCell(13);
    if (pdv.publicacionMensualEstado === 'ASIGNADO') {
      coberturaCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDCFCE7' }, // Emerald 100
      };
      coberturaCell.font = { bold: true, color: { argb: 'FF166534' } };
    } else if (pdv.publicacionMensualEstado === 'PARCIAL') {
      coberturaCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEF3C7' }, // Amber 100
      };
      coberturaCell.font = { bold: true, color: { argb: 'FF92400E' } };
    } else if (pdv.publicacionMensualEstado === 'SIN_ASIGNACION') {
      coberturaCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE4E6' }, // Rose 100
      };
      coberturaCell.font = { bold: true, color: { argb: 'FF9F1239' } };
    } else {
      coberturaCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' }, // Slate 100
      };
    }

    // Porcentaje formato numérico % (columna 15)
    const pctCell = row.getCell(15);
    pctCell.numFmt = '0%';

    // Bordes y alineación
    row.eachCell((cell, colNumber) => {
      cell.border = borderThin;
      if (!cell.font) {
        cell.font = { name: 'Calibri', size: 10 };
      }
      if (
        colNumber === 1 ||
        colNumber === 2 ||
        colNumber === 3 ||
        colNumber === 4 ||
        colNumber === 12 ||
        colNumber === 13 ||
        colNumber === 14 ||
        colNumber === 15 ||
        colNumber === 18 ||
        colNumber === 22 ||
        colNumber === 23 ||
        colNumber === 24 ||
        colNumber === 25
      ) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });

  // Ajuste de ancho de columnas
  sheet.columns = [
    { width: 6 },  // #
    { width: 10 }, // Mes
    { width: 18 }, // Clave BTL
    { width: 12 }, // ID Cadena
    { width: 22 }, // Cadena
    { width: 34 }, // PDV / Tienda
    { width: 36 }, // Dirección
    { width: 20 }, // Ciudad
    { width: 18 }, // Estado
    { width: 14 }, // Zona
    { width: 16 }, // Formato
    { width: 14 }, // Estatus
    { width: 18 }, // Cobertura
    { width: 14 }, // Días Cubiertos
    { width: 14 }, // % Cobertura
    { width: 24 }, // Detalle
    { width: 32 }, // Supervisor Asignado
    { width: 18 }, // Vigente Desde
    { width: 14 }, // Latitud
    { width: 14 }, // Longitud
    { width: 12 }, // Radio
    { width: 14 }, // Check-in
    { width: 16 }, // Horario Modo
    { width: 14 }, // Entrada
    { width: 14 }, // Salida
  ];

  // Auto-filtro en encabezados
  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: headers.length },
  };

  // -------------------------------------------------------------
  // HOJA 2: RESUMEN POR SUPERVISOR
  // -------------------------------------------------------------
  const supSheet = workbook.addWorksheet('Resumen Supervisión');
  supSheet.views = [{ showGridLines: true }];

  supSheet.mergeCells('A1:F1');
  const supTitle = supSheet.getCell('A1');
  supTitle.value = `Resumen de Cobertura de PDVs por Supervisor - Mes ${data.month}`;
  supTitle.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF0F172A' } };
  supTitle.alignment = { vertical: 'middle', horizontal: 'left' };
  supSheet.getRow(1).height = 30;

  const supHeaders = [
    '#',
    'Supervisor',
    'Total Tiendas',
    'Cubiertas (Con DC)',
    'Parciales',
    'Vacantes (Sin DC)',
  ];

  const supHeaderRow = supSheet.getRow(3);
  supHeaderRow.values = supHeaders;
  supHeaderRow.height = 26;

  supHeaderRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' },
    };
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = borderThin;
  });

  // Agrupar por supervisor
  const supervisorAgg = new Map<
    string,
    { nombre: string; total: number; asignadas: number; parciales: number; vacantes: number }
  >();

  data.pdvs.forEach((p) => {
    const sName = p.supervisorActual ?? 'Sin supervisor asignado';
    const entry = supervisorAgg.get(sName) || {
      nombre: sName,
      total: 0,
      asignadas: 0,
      parciales: 0,
      vacantes: 0,
    };
    entry.total++;
    if (p.publicacionMensualEstado === 'ASIGNADO') entry.asignadas++;
    else if (p.publicacionMensualEstado === 'PARCIAL') entry.parciales++;
    else entry.vacantes++;
    supervisorAgg.set(sName, entry);
  });

  const sortedSupervisors = Array.from(supervisorAgg.values()).sort((a, b) => b.total - a.total);

  sortedSupervisors.forEach((sup, idx) => {
    const sRow = supSheet.getRow(4 + idx);
    sRow.values = [
      idx + 1,
      sup.nombre,
      sup.total,
      sup.asignadas,
      sup.parciales,
      sup.vacantes,
    ];
    sRow.height = 20;
    sRow.eachCell((cell, colNumber) => {
      cell.border = borderThin;
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNumber === 2 ? 'left' : 'center',
      };
    });
  });

  supSheet.columns = [
    { width: 6 },
    { width: 34 },
    { width: 16 },
    { width: 20 },
    { width: 16 },
    { width: 20 },
  ];

  const safeMonth = sanitizeFilenamePart(data.month);
  const today = new Date().toISOString().slice(0, 10);
  const filename = `Catalogo_PDVs_Cobertura_${safeMonth}_${today}.xlsx`;

  const bufferArray = await workbook.xlsx.writeBuffer();
  const buffer = new Uint8Array(bufferArray);

  return { buffer, filename };
}
