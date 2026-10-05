import type { VentaCapturaDetalleItem, VentaDatasetItem } from '../services/ventaService';

export interface DayActivityDetail {
  dateStr: string;
  dayNum: number;
  weekdayShort: string;
  piezas: number;
  monto: number;
  incidencia?: string;
  productos: Array<{
    nombre: string;
    sku?: string | null;
    piezas: number;
    monto: number;
  }>;
  loveRegistros: Array<{
    id: string;
    subtipo?: string | null;
    cantidad: number;
    observaciones?: string | null;
    createdAt?: string;
  }>;
  canjesRegistros: Array<{
    id: string;
    material: string;
    materialCorto: string;
    cantidad: number;
    subtipo?: string | null;
    observaciones?: string | null;
  }>;
  desabastos: Array<{
    id: string;
    producto: string;
    observaciones?: string | null;
  }>;
  notas: string[];
}

export interface DermoPdvGroup {
  key: string;
  empleadoId: string;
  nombreDc: string;
  idNomina: string;
  pdvId: string;
  sucursal: string;
  cadena: string;
  btlCve: string;
  supervisor: string;
  zona: string;
  totalPiezas: number;
  totalMonto: number;
  totalLove: number;
  totalCanjes: number;
  diasConVenta: number;
  diasActivos: number;
  daysMap: Map<string, DayActivityDetail>;
}

export interface MonthDayItem {
  dateStr: string;
  dayNum: number;
  weekdayShort: string;
  dayOfWeekIndex: number;
}

export const MESES = [
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

export const WEEKDAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function recortarNombreProducto(nombreLargo?: string | null, nombreCorto?: string | null): string {
  if (nombreCorto && nombreCorto.trim().length > 0) {
    if (!nombreLargo || nombreCorto.trim().toUpperCase() !== nombreLargo.trim().toUpperCase()) {
      return nombreCorto.trim();
    }
  }
  if (!nombreLargo) return 'Producto';

  let clean = nombreLargo.trim();

  // Eliminar prefijos técnicos de marca que causan ruido visual
  clean = clean
    .replace(/^FOTOPROTECTOR\s+ISDIN\s+/i, 'FP ')
    .replace(/^FOTOPROTECTOR\s+/i, 'FP ')
    .replace(/^ISDINCEUTICS\s+/i, '')
    .replace(/^ISDIN\s+/i, '')
    .replace(/^WOMAN\s+ISDIN\s+/i, 'WOMAN ')
    .replace(/^BEXIDENT\s+/i, 'BEX ')
    .replace(/^LAMBDAPIL\s+/i, 'LAMBDAPIL ')
    .replace(/^UREADIN\s+/i, 'UREADIN ')
    .replace(/\s+/g, ' ')
    .trim();

  return clean || nombreLargo;
}

export function recortarNombreMaterial(nombreLargo?: string | null, nombreCorto?: string | null): string {
  if (nombreCorto && nombreCorto.trim().length > 0) {
    if (!nombreLargo || nombreCorto.trim().toUpperCase() !== nombreLargo.trim().toUpperCase()) {
      return nombreCorto.trim();
    }
  }
  if (!nombreLargo) return 'Canje';

  let clean = nombreLargo.trim();

  clean = clean
    .replace(/^MAGIC\s+REPAIR\s+FP\s+FW\s+MAGIC\s+REPAIR\s+COLOR\s+SPF\d+\s+/i, 'FW REPAIR COLOR ')
    .replace(/^PROM\s+FP\s+FUSION\s+WATER\s+MAGIC\s+REPAIR\s+SPF\d+\s+/i, 'FW REPAIR ')
    .replace(/^PROM\s+FP\s+FW\s+MAGIC\s+REPAIR\s+SPF\d+\s+/i, 'FW REPAIR ')
    .replace(/^MCON\s+FP\s+FUSION\s+WATER\s+MAGIC\s+ALCARAZ\s+SPF\d+\s+/i, 'FW ALCARAZ ')
    .replace(/^MCON\s+FP\s+FW\s+MAGIC\s+ALCARAZ\s+SPF\d+\s+/i, 'FW ALCARAZ ')
    .replace(/^MCON\s+FP\s+FW\s+MAGIC\s+SIN\s+COLOR\s+SPF\d+\s+/i, 'FW SIN COLOR ')
    .replace(/^PROM\s+FP\s+FW\s+MAGIC\s+COL\s+BROZE\s+SPF\d+\s+/i, 'FW COLOR BRONZE ')
    .replace(/^PROM\s+FP\s+FW\s+MAGIC\s+GLOW\s+SPF\d+\s+/i, 'FW GLOW ')
    .replace(/^PROM\s+FP\s+FWM\s+COL\s+LIGHT\s+SPF\d+\s+/i, 'FW COLOR LIGHT ')
    .replace(/^PROM\s+FP\s+FWM\s+COL\s+MEDIUM\s+SPF\d+\s+/i, 'FW COLOR MED ')
    .replace(/^GORRA\s+ISDIN\s+/i, 'GORRA ')
    .replace(/\s+ISDINCEUTICS\s+/i, ' ')
    .replace(/\s+ISDIN\s+/i, ' ')
    .replace(/\s+ISDIN$/i, '')
    .replace(/^ISDINCEUTICS\s+/i, '')
    .replace(/^ISDUNCEUTICS\s+/i, '')
    .replace(/^ISDIN\s+/i, '')
    .replace(/\bFOTOPROTECCIÓN\b/i, 'FOTOPROT.')
    .replace(/\bFOTOPROTECCION\b/i, 'FOTOPROT.')
    .replace(/\bFUSION\s+WATER\b/i, 'FW')
    .replace(/C\/AFTERSUN\s+Y\s+MINIS/i, 'C/MINIS')
    .replace(/\bTUBO\s+\d+U\s+/i, '')
    .replace(/\bSCH\s+\d+U\s+/i, '')
    .replace(/\bSACHET\s+\d+U\s+/i, '')
    .replace(/\b\d+U\s+/i, '')
    .replace(/\b\d+\s*U\b/i, '')
    .replace(/\s+A\s+1\s+TINTA/i, '')
    .replace(/\bANTI\s+STRETCH\s+CREAM\b/i, 'ANTIESTRIAS')
    .replace(/\bFIRMING\s+CREAM\b/i, 'REAFIRMANTE')
    .replace(/\bINTIMATE\s+HYGENE\s+GEL\b/i, 'HIGIENE INTIMA')
    .replace(/\bHAIR\s+LOSS\s+SHAMPOO\b/i, 'SHP ANTICAIDA')
    .replace(/\bSHP\s+OILY\s+DANDRUFF\b/i, 'SHP CASPA')
    .replace(/\bBABY\s+NATURALS\s+GEL\s+SHAMPOO\b/i, 'BABY GEL SHP')
    .replace(/\bPORTA\s+TOTTLE\b/i, 'PORTATOTTLE')
    .replace(/\bSILICONE\b/i, 'SILICON')
    .replace(/\bFWM\s+ALCARAZ\b/i, 'ALCARAZ')
    .replace(/\bSTICK\s+PEDIATRICS\b/i, 'STICK PED')
    .replace(/\bTRANSPARENT\s+SPRAY\s+WS\s+SPF\d+\s+/i, 'TRANSP SPRAY ')
    .replace(/\s+/g, ' ')
    .trim();

  return clean || nombreLargo;
}

export function generateMonthDays(activeMonth: string): {
  days: MonthDayItem[];
  year: number;
  month: number;
  daysInMonth: number;
  firstDayMondayOffset: number;
} {
  const [yearStr, monthStr] = (activeMonth || '2026-06').split('-');
  const year = parseInt(yearStr || '2026', 10);
  const month = parseInt(monthStr || '6', 10);
  const daysInMonth = new Date(year, month, 0).getDate();

  const days: MonthDayItem[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${yearStr}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dt = new Date(Date.UTC(year, month - 1, d, 12, 0, 0));
    const dayOfWeekIndex = dt.getUTCDay();
    days.push({
      dateStr,
      dayNum: d,
      weekdayShort: WEEKDAY_NAMES[dayOfWeekIndex],
      dayOfWeekIndex,
    });
  }

  const firstDt = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  const day = firstDt.getUTCDay();
  const firstDayMondayOffset = (day + 6) % 7;

  return { days, year, month, daysInMonth, firstDayMondayOffset };
}

export function aggregateDermoPdvGroups(params: {
  dataset: VentaDatasetItem[];
  capturasDetalle?: VentaCapturaDetalleItem[];
  monthDays: MonthDayItem[];
}): DermoPdvGroup[] {
  const { dataset, capturasDetalle = [], monthDays } = params;
  const groups = new Map<string, DermoPdvGroup>();

  // 1. Process dataset from table venta + consolidated absences
  dataset.forEach((row) => {
    const empId = row.empleadoId;
    const pdvId = row.pdvId;
    if (!empId && !pdvId) return;

    const key = `${empId}||${pdvId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        empleadoId: empId,
        nombreDc: row.empleadoLabel || 'Sin dermoconsejera',
        idNomina: row.empleadoIdNomina || '',
        pdvId,
        sucursal: row.pdvNombre || 'Sin tienda',
        cadena: row.cadena || 'Sin cadena',
        btlCve: row.pdvClaveBtl || 'SIN BTL',
        supervisor: row.supervisorLabel || 'Sin supervisor',
        zona: row.zona || 'Sin zona',
        totalPiezas: 0,
        totalMonto: 0,
        totalLove: 0,
        totalCanjes: 0,
        diasConVenta: 0,
        diasActivos: 0,
        daysMap: new Map(),
      };

      monthDays.forEach((md) => {
        group!.daysMap.set(md.dateStr, {
          dateStr: md.dateStr,
          dayNum: md.dayNum,
          weekdayShort: md.weekdayShort,
          piezas: 0,
          monto: 0,
          incidencia: undefined,
          productos: [],
          loveRegistros: [],
          canjesRegistros: [],
          desabastos: [],
          notas: [],
        });
      });

      groups.set(key, group);
    }

    if (row.fechaOperacion && group.daysMap.has(row.fechaOperacion)) {
      const dayData = group.daysMap.get(row.fechaOperacion)!;
      if (row.totalUnidades > 0) {
        dayData.piezas += row.totalUnidades;
        dayData.monto += Number(row.totalMonto || 0);

        if (row.productoNombre || row.productoNombreCorto) {
          const shortName = recortarNombreProducto(row.productoNombre, row.productoNombreCorto);
          const existing = dayData.productos.find((p) => p.nombre === shortName);
          if (existing) {
            existing.piezas += row.totalUnidades;
            existing.monto += Number(row.totalMonto || 0);
          } else {
            dayData.productos.push({
              nombre: shortName,
              sku: null,
              piezas: row.totalUnidades,
              monto: Number(row.totalMonto || 0),
            });
          }
        }
      }
      if (row.subtipoIncidencia) {
        dayData.incidencia = row.subtipoIncidencia;
      }
    }
  });

  // 2. Process capturasDetalle from captura_publica_registro for non-sales events
  (capturasDetalle ?? []).forEach((c) => {
    const empId = c.empleadoId;
    const pdvId = c.pdvId || '';
    const key = `${empId}||${pdvId}`;

    let group = groups.get(key);
    if (!group) {
      const matchingKey = Array.from(groups.keys()).find((k) => k.startsWith(`${empId}||`));
      if (matchingKey) {
        group = groups.get(matchingKey);
      }
    }

    if (!group) return;

    const dateStr = c.fechaOperativa;
    if (!group.daysMap.has(dateStr)) return;

    const dayData = group.daysMap.get(dateStr)!;

    // NOTE: c.tipoRegistro === 'VENTA' is deliberately NOT accumulated here because sales units,
    // amounts, and products are already 100% sourced from the canonical `dataset` above.
    if (c.tipoRegistro === 'LOVE_ISDIN') {
      dayData.loveRegistros.push({
        id: c.id,
        subtipo: c.subtipoRegistro,
        cantidad: c.cantidad || 1,
        observaciones: c.observaciones,
        createdAt: c.createdAt,
      });
    } else if (c.tipoRegistro === 'CANJE') {
      const materialCorto = recortarNombreMaterial(c.materialNombre, c.materialNombreCorto);
      dayData.canjesRegistros.push({
        id: c.id,
        material: c.materialNombre || 'Material de canje',
        materialCorto,
        cantidad: c.cantidad || 1,
        subtipo: c.subtipoRegistro,
        observaciones: c.observaciones,
      });
    } else if (c.tipoRegistro === 'DESABASTO') {
      dayData.desabastos.push({
        id: c.id,
        producto: c.productoNombre || 'Producto en desabasto',
        observaciones: c.observaciones,
      });
    }

    // Incidences / Absences
    if (c.subtipoRegistro === 'VACACIONES') dayData.incidencia = 'V';
    else if (c.subtipoRegistro === 'INCAPACIDAD') dayData.incidencia = 'I';
    else if (c.subtipoRegistro === 'FALTA') dayData.incidencia = 'F';
    else if (c.subtipoRegistro === 'SIN_VENTAS') dayData.incidencia = '0';

    if (c.observaciones && !dayData.notas.includes(c.observaciones)) {
      dayData.notas.push(c.observaciones);
    }
  });

  // 3. Aggregate totals per group
  const result: DermoPdvGroup[] = [];
  groups.forEach((group) => {
    let totalP = 0;
    let totalM = 0;
    let totalL = 0;
    let totalC = 0;
    let diasVenta = 0;
    let diasActivos = 0;

    group.daysMap.forEach((d) => {
      totalP += d.piezas;
      totalM += d.monto;
      totalL += d.loveRegistros.reduce((acc, l) => acc + l.cantidad, 0);
      totalC += d.canjesRegistros.reduce((acc, c) => acc + c.cantidad, 0);
      if (d.piezas > 0) diasVenta++;
      if (
        d.piezas > 0 ||
        d.loveRegistros.length > 0 ||
        d.canjesRegistros.length > 0 ||
        d.incidencia
      ) {
        diasActivos++;
      }
    });

    group.totalPiezas = totalP;
    group.totalMonto = totalM;
    group.totalLove = totalL;
    group.totalCanjes = totalC;
    group.diasConVenta = diasVenta;
    group.diasActivos = diasActivos;

    result.push(group);
  });

  // Sort alphabetically by DC name then store
  return result.sort((a, b) => {
    const cmp = a.nombreDc.localeCompare(b.nombreDc, 'es-MX');
    if (cmp !== 0) return cmp;
    return a.sucursal.localeCompare(b.sucursal, 'es-MX');
  });
}
