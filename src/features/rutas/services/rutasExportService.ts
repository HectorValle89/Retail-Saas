import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActorActual } from '@/lib/auth/session';
import { parseRutaSemanalWorkflowMetadata } from '../lib/routeWorkflow';

interface RutasExportFilterOptions {
  semanaInicio?: string | null;
  supervisorId?: string | null;
  incluirTodas?: boolean;
}

export interface RutaVisitaExportRow {
  semanaInicio: string;
  clavePdv: string;
  cadena: string;
  nombrePdv: string;
  diaSemanaLabel: string;
  fechaVisita: string;
  supervisorNombre: string;
  supervisorCorreo: string;
  supervisorTelefono: string;
  estatusRuta: string;
  estatusVisita: string;
}

const DIA_SEMANA_NOMBRES: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

function calcularFechaVisita(semanaInicio: string, diaSemana: number): string {
  const date = new Date(`${semanaInicio}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + (diaSemana - 1));
  return date.toISOString().slice(0, 10);
}

function formatearFechaLegible(fechaIso: string): string {
  if (!fechaIso) return '';
  const [year, month, day] = fechaIso.split('-');
  if (!year || !month || !day) return fechaIso;
  return `${day}/${month}/${year}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabase = SupabaseClient<any>;

export async function obtenerVisitasAprobadasParaExportar(
  supabase: TypedSupabase,
  actor: ActorActual,
  options: RutasExportFilterOptions = {}
): Promise<RutaVisitaExportRow[]> {
  let query = supabase
    .from('ruta_semanal')
    .select(
      `
      id,
      cuenta_cliente_id,
      supervisor_empleado_id,
      semana_inicio,
      estatus,
      metadata,
      supervisor:supervisor_empleado_id(
        id,
        nombre_completo,
        correo_electronico,
        telefono
      )
    `
    )
    .order('semana_inicio', { ascending: false });

  if (actor.cuentaClienteId) {
    query = query.eq('cuenta_cliente_id', actor.cuentaClienteId);
  }

  if (options.semanaInicio) {
    // Si viene como mes (ej. "2026-08") usamos un rango de fechas, si es semana exacta usamos EQ
    if (options.semanaInicio.length === 7) {
      const [yearStr, monthStr] = options.semanaInicio.split('-');
      const lastDay = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
      const startDate = `${options.semanaInicio}-01`;
      const endDate = `${options.semanaInicio}-${lastDay}`;
      
      query = query.gte('semana_inicio', startDate).lte('semana_inicio', endDate);
    } else {
      query = query.eq('semana_inicio', options.semanaInicio);
    }
  }

  if (options.supervisorId) {
    query = query.eq('supervisor_empleado_id', options.supervisorId);
  }

  const { data: rutasRaw, error: rutasError } = await query;
  if (rutasError) {
    throw new Error(`Error al consultar rutas semanales: ${rutasError.message}`);
  }

  if (!rutasRaw || rutasRaw.length === 0) {
    return [];
  }

  // Filtrar solo las rutas aprobadas (o según filtro incluirTodas)
  const rutasValidas = (rutasRaw as unknown as Array<Record<string, unknown>>).filter((ruta) => {
    if (options.incluirTodas) {
      return true;
    }
    const workflow = parseRutaSemanalWorkflowMetadata(ruta.metadata);
    return (
      workflow.approval.state === 'APROBADA' ||
      ruta.estatus === 'PUBLICADA' ||
      ruta.estatus === 'EN_PROGRESO' ||
      ruta.estatus === 'CERRADA'
    );
  });

  if (rutasValidas.length === 0) {
    return [];
  }

  const rutaIds = rutasValidas.map((r) => String(r.id));

  // Consultar visitas asociadas a las rutas seleccionadas en lotes para superar el límite de 1,000 de Supabase
  const BATCH_SIZE = 20; // 20 rutas * ~30 visitas = ~600 registros por query
  const todasLasVisitas: any[] = [];
  
  for (let i = 0; i < rutaIds.length; i += BATCH_SIZE) {
    const chunkIds = rutaIds.slice(i, i + BATCH_SIZE);
    const { data: chunkVisitas, error: chunkError } = await supabase
      .from('ruta_semanal_visita')
      .select(
        `
        id,
        ruta_semanal_id,
        pdv_id,
        dia_semana,
        orden,
        estatus,
        pdv:pdv_id(
          id,
          clave_btl,
          nombre,
          cadena:cadena_id(id, codigo, nombre)
        )
      `
      )
      .in('ruta_semanal_id', chunkIds);

    if (chunkError) {
      throw new Error(`Error al consultar visitas de ruta (lote): ${chunkError.message}`);
    }

    if (chunkVisitas && chunkVisitas.length > 0) {
      todasLasVisitas.push(...chunkVisitas);
    }
  }

  // Ordenar en memoria
  todasLasVisitas.sort((a, b) => {
    if (a.dia_semana !== b.dia_semana) return a.dia_semana - b.dia_semana;
    return a.orden - b.orden;
  });

  const visitasRaw = todasLasVisitas;

  if (!visitasRaw || visitasRaw.length === 0) {
    return [];
  }

  const rutasMap = new Map<string, Record<string, unknown>>(
    rutasValidas.map((r) => [String(r.id), r])
  );

  const rows: RutaVisitaExportRow[] = [];

  for (const visitaItem of visitasRaw as unknown as Array<Record<string, unknown>>) {
    const rutaId = String(visitaItem.ruta_semanal_id);
    const ruta = rutasMap.get(rutaId);
    if (!ruta) continue;

    const semanaInicio = String(ruta.semana_inicio);
    const diaSemana = Number(visitaItem.dia_semana) || 1;
    const fechaVisitaRaw = calcularFechaVisita(semanaInicio, diaSemana);
    const fechaVisita = formatearFechaLegible(fechaVisitaRaw);
    const diaSemanaLabel = DIA_SEMANA_NOMBRES[diaSemana] || `Día ${diaSemana}`;

    // Supervisor details
    const supervisorObj = (ruta.supervisor as Record<string, unknown>) || {};
    const supervisorNombre = String(supervisorObj.nombre_completo || 'Sin supervisor');
    const supervisorCorreo = String(supervisorObj.correo_electronico || 'N/A');
    const supervisorTelefono = String(supervisorObj.telefono || 'N/A');

    // PDV details
    const pdvObj = (visitaItem.pdv as Record<string, unknown>) || {};
    const clavePdv = String(pdvObj.clave_btl || pdvObj.id || 'N/A');
    const nombrePdv = String(pdvObj.nombre || 'PDV Sin Nombre');

    const cadenaObj = (pdvObj.cadena as Record<string, unknown>) || {};
    const cadena = String(cadenaObj.nombre || cadenaObj.codigo || 'S/N');

    rows.push({
      semanaInicio,
      clavePdv,
      cadena,
      nombrePdv,
      diaSemanaLabel,
      fechaVisita,
      supervisorNombre,
      supervisorCorreo,
      supervisorTelefono,
      estatusRuta: String(ruta.estatus || 'ACTIVA'),
      estatusVisita: String(visitaItem.estatus || 'PENDIENTE'),
    });
  }

  return rows;
}

export async function generarExcelRutasAprobadas(
  visitas: RutaVisitaExportRow[],
  options?: { semanaInicio?: string | null }
): Promise<{ buffer: Uint8Array; filename: string }> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();

  const borderThin = {
    top: { style: 'thin' as const, color: { argb: 'FFD7E1EA' } },
    left: { style: 'thin' as const, color: { argb: 'FFD7E1EA' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFD7E1EA' } },
    right: { style: 'thin' as const, color: { argb: 'FFD7E1EA' } },
  };

  // -------------------------------------------------------------
  // HOJA 1: RESUMEN POR CADENA Y SUPERVISOR
  // -------------------------------------------------------------
  const summarySheet = workbook.addWorksheet('Resumen por Cadena');
  summarySheet.views = [{ showGridLines: true }];

  // Calcular métricas agrupadas por Cadena
  const cadenaMap = new Map<
    string,
    {
      cadena: string;
      pdvs: Set<string>;
      totalVisitas: number;
      supervisores: Set<string>;
    }
  >();

  // Calcular métricas agrupadas por Supervisor
  const supervisorMap = new Map<
    string,
    {
      nombre: string;
      correo: string;
      telefono: string;
      pdvs: Set<string>;
      totalVisitas: number;
      cadenas: Set<string>;
    }
  >();

  visitas.forEach((v) => {
    // Cadena group
    const cadenaEntry = cadenaMap.get(v.cadena) || {
      cadena: v.cadena,
      pdvs: new Set<string>(),
      totalVisitas: 0,
      supervisores: new Set<string>(),
    };
    cadenaEntry.pdvs.add(v.clavePdv);
    cadenaEntry.totalVisitas += 1;
    if (v.supervisorNombre) cadenaEntry.supervisores.add(v.supervisorNombre);
    cadenaMap.set(v.cadena, cadenaEntry);

    // Supervisor group
    const sEntry = supervisorMap.get(v.supervisorNombre) || {
      nombre: v.supervisorNombre,
      correo: v.supervisorCorreo,
      telefono: v.supervisorTelefono,
      pdvs: new Set<string>(),
      totalVisitas: 0,
      cadenas: new Set<string>(),
    };
    sEntry.pdvs.add(v.clavePdv);
    sEntry.totalVisitas += 1;
    if (v.cadena) sEntry.cadenas.add(v.cadena);
    supervisorMap.set(v.supervisorNombre, sEntry);
  });

  // Encabezado principal de la Hoja de Resumen
  summarySheet.mergeCells('A1:E1');
  const titleCell = summarySheet.getCell('A1');
  titleCell.value = 'RESUMEN EJECUTIVO DE OPERACIÓN DE SUPERVISORES POR CADENA';
  titleCell.font = { name: 'Aptos', size: 12, bold: true, color: { argb: 'FFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  summarySheet.getRow(1).height = 32;

  // Fila de KPIs
  const totalPdvsUnicos = new Set(visitas.map((v) => v.clavePdv)).size;
  summarySheet.mergeCells('A3:B3');
  summarySheet.getCell('A3').value = `Total PDVs Distintos: ${totalPdvsUnicos}`;
  summarySheet.getCell('A3').font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FF0369A1' } };
  summarySheet.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };

  summarySheet.mergeCells('C3:D3');
  summarySheet.getCell('C3').value = `Total Visitas Programadas: ${visitas.length}`;
  summarySheet.getCell('C3').font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FF047857' } };
  summarySheet.getCell('C3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };

  summarySheet.getCell('E3').value = `Cadenas Atendidas: ${cadenaMap.size}`;
  summarySheet.getCell('E3').font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FF4338CA' } };
  summarySheet.getCell('E3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };

  // Subtítulo Tabla 1: Cadenas
  summarySheet.getRow(5).height = 24;
  summarySheet.mergeCells('A5:E5');
  const sub1 = summarySheet.getCell('A5');
  sub1.value = '1. CONSOLIDADO POR CADENA COMERCIAL';
  sub1.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FFFFFF' } };
  sub1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

  // Headers Tabla Cadenas
  const chainHeaders = [
    'CADENA COMERCIAL',
    'TIENDAS DISTINTAS (PDVS)',
    'TOTAL VISITAS PROGRAMADAS',
    'FRECUENCIA PROMEDIO / TIENDA',
    'SUPERVISORES ASIGNADOS',
  ];
  const headerRow1 = summarySheet.getRow(6);
  headerRow1.height = 24;
  chainHeaders.forEach((h, colIdx) => {
    const cell = headerRow1.getCell(colIdx + 1);
    cell.value = h;
    cell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  let currentRowIdx = 7;
  const cadenasSorted = Array.from(cadenaMap.values()).sort(
    (a, b) => b.totalVisitas - a.totalVisitas
  );

  cadenasSorted.forEach((cItem, i) => {
    const row = summarySheet.getRow(currentRowIdx);
    row.height = 20;

    const pdvCount = cItem.pdvs.size;
    const freqProm = pdvCount > 0 ? (cItem.totalVisitas / pdvCount).toFixed(1) : '0';

    row.getCell(1).value = cItem.cadena;
    row.getCell(2).value = pdvCount;
    row.getCell(3).value = cItem.totalVisitas;
    row.getCell(4).value = `${freqProm} visitas/tienda`;
    row.getCell(5).value = Array.from(cItem.supervisores).join(', ');

    row.eachCell((cell, colNum) => {
      cell.border = borderThin;
      cell.font = { name: 'Aptos', size: 9.5 };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNum === 2 || colNum === 3 || colNum === 4 ? 'center' : 'left',
      };
      if (i % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFD' } };
      }
    });

    currentRowIdx += 1;
  });

  // Espaciador y Subtítulo Tabla 2: Supervisores
  currentRowIdx += 2;
  summarySheet.getRow(currentRowIdx).height = 24;
  summarySheet.mergeCells(`A${currentRowIdx}:E${currentRowIdx}`);
  const sub2 = summarySheet.getCell(`A${currentRowIdx}`);
  sub2.value = '2. RESUMEN POR SUPERVISOR';
  sub2.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FFFFFF' } };
  sub2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

  currentRowIdx += 1;
  const supHeaders = [
    'SUPERVISOR',
    'CORREO / TELÉFONO',
    'TIENDAS DISTINTAS',
    'TOTAL VISITAS',
    'CADENAS ATENDIDAS',
  ];
  const headerRow2 = summarySheet.getRow(currentRowIdx);
  headerRow2.height = 24;
  supHeaders.forEach((h, colIdx) => {
    const cell = headerRow2.getCell(colIdx + 1);
    cell.value = h;
    cell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  currentRowIdx += 1;
  const supervisoresSorted = Array.from(supervisorMap.values()).sort(
    (a, b) => b.totalVisitas - a.totalVisitas
  );

  supervisoresSorted.forEach((sItem, i) => {
    const row = summarySheet.getRow(currentRowIdx);
    row.height = 20;

    row.getCell(1).value = sItem.nombre;
    row.getCell(2).value = `${sItem.correo} | ${sItem.telefono}`;
    row.getCell(3).value = sItem.pdvs.size;
    row.getCell(4).value = sItem.totalVisitas;
    row.getCell(5).value = Array.from(sItem.cadenas).join(', ');

    row.eachCell((cell, colNum) => {
      cell.border = borderThin;
      cell.font = { name: 'Aptos', size: 9.5 };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNum === 3 || colNum === 4 ? 'center' : 'left',
      };
      if (i % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFD' } };
      }
    });

    currentRowIdx += 1;
  });

  summarySheet.getColumn(1).width = 28;
  summarySheet.getColumn(2).width = 34;
  summarySheet.getColumn(3).width = 26;
  summarySheet.getColumn(4).width = 28;
  summarySheet.getColumn(5).width = 38;

  // -------------------------------------------------------------
  // HOJA 2: DETALLE DE VISITAS
  // -------------------------------------------------------------
  const worksheet = workbook.addWorksheet('Detalle de Visitas');
  worksheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: true }];

  worksheet.columns = [
    { header: 'CLAVE PDV', key: 'clavePdv', width: 16 },
    { header: 'CADENA', key: 'cadena', width: 22 },
    { header: 'NOMBRE PDV', key: 'nombrePdv', width: 34 },
    { header: 'DÍA', key: 'diaSemanaLabel', width: 14 },
    { header: 'FECHA VISITA', key: 'fechaVisita', width: 16 },
    { header: 'SUPERVISOR', key: 'supervisorNombre', width: 30 },
    { header: 'CORREO SUPERVISOR', key: 'supervisorCorreo', width: 32 },
    { header: 'TELÉFONO SUPERVISOR', key: 'supervisorTelefono', width: 20 },
    { header: 'ESTATUS RUTA', key: 'estatusRuta', width: 16 },
    { header: 'ESTATUS VISITA', key: 'estatusVisita', width: 16 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;
  headerRow.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2F3E4E' }, // Slate/Navy oscuro
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  visitas.forEach((visita, index) => {
    const row = worksheet.addRow({
      clavePdv: visita.clavePdv,
      cadena: visita.cadena,
      nombrePdv: visita.nombrePdv,
      diaSemanaLabel: visita.diaSemanaLabel,
      fechaVisita: visita.fechaVisita,
      supervisorNombre: visita.supervisorNombre,
      supervisorCorreo: visita.supervisorCorreo,
      supervisorTelefono: visita.supervisorTelefono,
      estatusRuta: visita.estatusRuta,
      estatusVisita: visita.estatusVisita,
    });

    row.height = 22;
    row.font = { name: 'Aptos', size: 10, color: { argb: 'FF132238' } };

    // Formato zebra sutil en filas pares
    if (index % 2 === 1) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FBFD' },
      };
    }

    // Alineación por celda
    row.eachCell((cell, colNumber) => {
      cell.border = borderThin;
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNumber === 1 || colNumber === 4 || colNumber === 5 ? 'center' : 'left',
      };
    });
  });

  // -------------------------------------------------------------
  // HOJA 3: FRECUENCIA POR PDV (CALENDARIO)
  // -------------------------------------------------------------
  const freqSheet = workbook.addWorksheet('Frecuencia por PDV');
  freqSheet.views = [{ state: 'frozen', ySplit: 3, xSplit: 8, showGridLines: true }];

  const MESES: Record<string, string> = {
    '01': 'ENERO', '02': 'FEBRERO', '03': 'MARZO', '04': 'ABRIL', '05': 'MAYO', '06': 'JUNIO',
    '07': 'JULIO', '08': 'AGOSTO', '09': 'SEPTIEMBRE', '10': 'OCTUBRE', '11': 'NOVIEMBRE', '12': 'DICIEMBRE'
  };

  let targetYear = new Date().getFullYear();
  let targetMonth = new Date().getMonth() + 1;

  if (options?.semanaInicio && options.semanaInicio.length >= 7) {
    const [y, m] = options.semanaInicio.split('-');
    targetYear = parseInt(y, 10);
    targetMonth = parseInt(m, 10);
  } else if (visitas.length > 0) {
    const parts = visitas[0].fechaVisita.split('/');
    if (parts.length === 3) {
      targetYear = parseInt(parts[2], 10);
      targetMonth = parseInt(parts[1], 10);
    }
  }

  const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
  const monthKey = targetMonth.toString().padStart(2, '0');
  const monthName = MESES[monthKey] || 'MES';

  const freqColumns: any[] = [
    { key: 'clavePdv', width: 16 },
    { key: 'cadena', width: 22 },
    { key: 'idPdv', width: 16 },
    { key: 'nombrePdv', width: 34 },
    { key: 'supervisorNombre', width: 30 },
    { key: 'supervisorCorreo', width: 32 },
    { key: 'supervisorTelefono', width: 20 },
    { key: 'mes', width: 16 },
  ];

  for (let i = 1; i <= daysInMonth; i++) {
    freqColumns.push({ key: `d${i}`, width: 4 });
  }
  freqColumns.push({ key: 'diasTotal', width: 10 });
  freqSheet.columns = freqColumns;

  const freqHeaderRow1 = freqSheet.getRow(1);
  const freqHeaderRow2 = freqSheet.getRow(2);
  const freqHeaderRow3 = freqSheet.getRow(3);
  
  const fixedHeaders = ['CLAVE BTL', 'CADENA', 'ID PDV', 'SUCURSAL', 'SUPERVISOR', 'CORREO SUPERVISOR', 'TELÉFONO SUPERVISOR', 'MES'];
  fixedHeaders.forEach((val, idx) => {
    freqSheet.mergeCells(1, idx + 1, 3, idx + 1);
    const cell = freqSheet.getCell(1, idx + 1);
    cell.value = val;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F3E4E' } };
    cell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: 'FFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = borderThin;
  });

  const colStart = 9;
  const colEnd = 9 + daysInMonth - 1;
  freqSheet.mergeCells(1, colStart, 1, colEnd);
  const monthCell = freqSheet.getCell(1, colStart);
  monthCell.value = monthName;
  monthCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF60A5FA' } }; // Azul claro
  monthCell.font = { name: 'Aptos', size: 12, bold: true, color: { argb: 'FF000000' } };
  monthCell.alignment = { vertical: 'middle', horizontal: 'center' };
  monthCell.border = borderThin;

  freqSheet.mergeCells(1, colEnd + 1, 3, colEnd + 1);
  const diasCell = freqSheet.getCell(1, colEnd + 1);
  diasCell.value = '# DÍAS';
  diasCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF701A75' } }; // Morado oscuro
  diasCell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: 'FFFFFF' } };
  diasCell.alignment = { vertical: 'middle', horizontal: 'center', textRotation: 90 };
  diasCell.border = borderThin;

  const diasSemana = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  for (let i = 1; i <= daysInMonth; i++) {
    const colIdx = colStart + i - 1;
    const date = new Date(targetYear, targetMonth - 1, i);
    const dayOfWeek = diasSemana[date.getDay()];
    
    const cellRow2 = freqSheet.getCell(2, colIdx);
    cellRow2.value = dayOfWeek;
    cellRow2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    cellRow2.font = { name: 'Aptos', size: 8, bold: true, color: { argb: 'FFFFFF' } };
    cellRow2.alignment = { vertical: 'middle', horizontal: 'center' };
    cellRow2.border = borderThin;

    const cellRow3 = freqSheet.getCell(3, colIdx);
    cellRow3.value = i;
    cellRow3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
    cellRow3.font = { name: 'Aptos', size: 8, bold: true, color: { argb: 'FFFFFF' } };
    cellRow3.alignment = { vertical: 'middle', horizontal: 'center' };
    cellRow3.border = borderThin;
  }

  freqHeaderRow1.height = 24;
  freqHeaderRow2.height = 18;
  freqHeaderRow3.height = 18;

  const pdvFreqMap = new Map<string, {
    clavePdv: string;
    cadena: string;
    nombrePdv: string;
    supervisorNombre: string;
    supervisorCorreo: string;
    supervisorTelefono: string;
    diasVisita: number[];
  }>();

  visitas.forEach((v) => {
    const parts = v.fechaVisita.split('/');
    if (parts.length !== 3) return;
    const [day, month, year] = parts;
    
    // Ignorar si la visita no es del mes que estamos graficando
    if (parseInt(month, 10) !== targetMonth || parseInt(year, 10) !== targetYear) {
      return; 
    }

    const key = `${v.clavePdv}_${v.supervisorCorreo}`;

    if (!pdvFreqMap.has(key)) {
      pdvFreqMap.set(key, {
        clavePdv: v.clavePdv,
        cadena: v.cadena,
        nombrePdv: v.nombrePdv,
        supervisorNombre: v.supervisorNombre,
        supervisorCorreo: v.supervisorCorreo,
        supervisorTelefono: v.supervisorTelefono,
        diasVisita: [],
      });
    }

    const entry = pdvFreqMap.get(key)!;
    const diaNum = parseInt(day, 10);
    if (!entry.diasVisita.includes(diaNum)) {
      entry.diasVisita.push(diaNum);
    }
  });

  const freqSorted = Array.from(pdvFreqMap.values()).sort((a, b) => a.clavePdv.localeCompare(b.clavePdv));

  freqSorted.forEach((frecuenciaItem) => {
    const rowData: any = {
      clavePdv: frecuenciaItem.clavePdv,
      cadena: frecuenciaItem.cadena,
      idPdv: frecuenciaItem.clavePdv,
      nombrePdv: frecuenciaItem.nombrePdv,
      supervisorNombre: frecuenciaItem.supervisorNombre,
      supervisorCorreo: frecuenciaItem.supervisorCorreo,
      supervisorTelefono: frecuenciaItem.supervisorTelefono,
      mes: monthName,
      diasTotal: frecuenciaItem.diasVisita.length,
    };

    for (let i = 1; i <= daysInMonth; i++) {
      rowData[`d${i}`] = frecuenciaItem.diasVisita.includes(i) ? 'V' : '';
    }

    const row = freqSheet.addRow(rowData);
    row.height = 18;
    row.font = { name: 'Aptos', size: 9, color: { argb: 'FF132238' } };

    for (let i = 1; i <= daysInMonth; i++) {
      const cell = row.getCell(colStart + i - 1);
      if (frecuenciaItem.diasVisita.includes(i)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF86EFAC' } };
        cell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: 'FF166534' } };
      }
    }

    row.eachCell((cell, colNumber) => {
      cell.border = borderThin;
      if (colNumber < colStart) {
        cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 || colNumber === 3 || colNumber === 8 ? 'center' : 'left' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });
  });

  const fechaHoy = new Date().toISOString().slice(0, 10);
  const filename = `Reporte_Rutas_Semanales_${fechaHoy}.xlsx`;
  const bufferArray = await workbook.xlsx.writeBuffer();
  const buffer = new Uint8Array(bufferArray);

  return { buffer, filename };
}
