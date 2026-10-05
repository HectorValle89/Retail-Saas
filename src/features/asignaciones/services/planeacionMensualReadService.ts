import { unstable_cache } from 'next/cache';
import type {
  PlaneacionMensualDetalleDia,
  PlaneacionMensualDetallePersona,
  PlaneacionMensualDia,
  PlaneacionMensualDiaCodigo,
  PlaneacionMensualFila,
  PlaneacionMensualFiltros,
  PlaneacionMensualPdvEstatus,
  PlaneacionMensualResumen,
} from '@/features/asignaciones/types/planeacionMensual';

interface RpcErrorLike {
  message: string;
}

export interface PlaneacionMensualReadRpcClient {
  rpc(
    name:
      | 'refrescar_planeacion_mensual_snapshot'
      | 'obtener_planeacion_mensual_resumen'
      | 'obtener_planeacion_mensual_dia',
    params: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: RpcErrorLike | null }>;
}

const DAY_CODES = new Set<PlaneacionMensualDiaCodigo>([
  '1',
  'D',
  'COV',
  'FOR',
  'I',
  'IS',
  'VAC',
  'JUS',
  'SIN',
  'PC',
  '—',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readPdvStatus(value: unknown): PlaneacionMensualPdvEstatus | null {
  if (value === 'TEMPORAL' || value === 'PAUSADO') return 'PAUSADO';
  if (value === 'ACTIVO' || value === 'INACTIVO') return value;
  return null;
}

function readNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return readNumber(value);
}

function parseDay(value: unknown): PlaneacionMensualDia {
  if (!Array.isArray(value) || value.length < 6) {
    throw new Error('La planeación mensual contiene una celda diaria inválida.');
  }

  const rawCode = readString(value[1], 'SIN');
  const codigo: PlaneacionMensualDiaCodigo = DAY_CODES.has(rawCode as PlaneacionMensualDiaCodigo)
    ? (rawCode as PlaneacionMensualDiaCodigo)
    : 'SIN';

  return [
    readString(value[0]),
    codigo,
    readNullableString(value[2]),
    readNullableString(value[3]),
    readNumber(value[4]),
    readNumber(value[5]),
  ];
}

function parseRow(value: unknown): PlaneacionMensualFila {
  if (!isRecord(value)) {
    throw new Error('La planeación mensual contiene una fila inválida.');
  }

  const segmentoTipo = value.segmentoTipo === 'VACANTE' ? 'VACANTE' : 'DC';
  return {
    segmentoClave: readString(value.segmentoClave),
    segmentoTipo,
    cadenaId: readNullableString(value.cadenaId),
    cadenaNombre: readNullableString(value.cadenaNombre),
    pdvId: readString(value.pdvId),
    pdvClave: readNullableString(value.pdvClave),
    pdvNombre: readString(value.pdvNombre),
    pdvEstatus: readPdvStatus(value.pdvEstatus),
    ciudadId: readNullableString(value.ciudadId),
    ciudadNombre: readNullableString(value.ciudadNombre),
    zona: readNullableString(value.zona),
    empleadoId: readNullableString(value.empleadoId),
    empleadoNomina: readNullableString(value.empleadoNomina),
    empleadoNombre: readString(value.empleadoNombre),
    rol: readString(value.rol),
    factorTiempo: readNumber(value.factorTiempo),
    naturaleza: readString(value.naturaleza),
    asignacionId: readNullableString(value.asignacionId),
    rangoFechaInicio: readString(value.rangoFechaInicio),
    rangoFechaFin: readString(value.rangoFechaFin),
    diasLaborales: readNullableString(value.diasLaborales),
    diaDescanso: readNullableString(value.diaDescanso),
    horarioReferencia: readNullableString(value.horarioReferencia),
    supervisorId: readNullableString(value.supervisorId),
    supervisorNombre: readNullableString(value.supervisorNombre),
    diasLaborados: readNumber(value.diasLaborados),
    diasProgramados: readNumber(value.diasProgramados),
    cuotaMensual: readNumber(value.cuotaMensual),
    cuotaIndividual: readNumber(value.cuotaIndividual),
    dias: Array.isArray(value.dias) ? value.dias.map(parseDay) : [],
  };
}

export function parsePlaneacionMensualResumen(value: unknown): PlaneacionMensualResumen {
  if (!isRecord(value) || value.ok !== true) {
    throw new Error('La consulta mensual devolvió un contrato inválido.');
  }

  return {
    ok: true,
    mes: readString(value.mes),
    version: readNumber(value.version),
    generatedAt: readNullableString(value.generatedAt),
    total: readNumber(value.total),
    truncated: value.truncated === true,
    empleadosDisponibles: parseCatalogOptions(value.empleadosDisponibles),
    supervisoresDisponibles: parseCatalogOptions(value.supervisoresDisponibles),
    rows: Array.isArray(value.rows) ? value.rows.map(parseRow) : [],
  };
}

function parseCatalogOptions(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((item) => ({ id: readString(item.id), label: readString(item.label) }))
    .filter((item) => item.id.length > 0 && item.label.length > 0);
}

function parseDetailPerson(value: unknown): PlaneacionMensualDetallePersona {
  if (!isRecord(value)) {
    throw new Error('El detalle diario contiene una persona inválida.');
  }

  return {
    empleado_id: readString(value.empleado_id),
    nombre_completo: readString(value.nombre_completo),
    estado_operativo: readNullableString(value.estado_operativo),
    origen: readNullableString(value.origen),
    pdv_resuelto_id: readNullableString(value.pdv_resuelto_id),
    horario_inicio: readNullableString(value.horario_inicio),
    horario_fin: readNullableString(value.horario_fin),
    mensaje_operativo: readNullableString(value.mensaje_operativo),
    referencia_tabla: readNullableString(value.referencia_tabla),
    referencia_id: readNullableString(value.referencia_id),
    asignacion_id: readNullableString(value.asignacion_id),
    tipo: readNullableString(value.tipo),
    factor_tiempo: readNullableNumber(value.factor_tiempo),
    naturaleza: readNullableString(value.naturaleza),
    dias_laborales: readNullableString(value.dias_laborales),
    dia_descanso: readNullableString(value.dia_descanso),
    horario_referencia: readNullableString(value.horario_referencia),
    programada: typeof value.programada === 'boolean' ? value.programada : null,
  };
}

export function parsePlaneacionMensualDetalle(value: unknown): PlaneacionMensualDetalleDia {
  if (!isRecord(value)) {
    throw new Error('El detalle diario devolvió un contrato inválido.');
  }

  const pdv = isRecord(value.pdv)
    ? {
        id: readString(value.pdv.id),
        clave: readNullableString(value.pdv.clave),
        nombre: readString(value.pdv.nombre),
        cadenaNombre: readNullableString(value.pdv.cadenaNombre),
        ciudadNombre: readNullableString(value.pdv.ciudadNombre),
      }
    : null;

  return {
    ok: value.ok === true,
    fecha: readString(value.fecha),
    pdv,
    cuotaDia: readNumber(value.cuotaDia),
    personas: Array.isArray(value.personas) ? value.personas.map(parseDetailPerson) : [],
  };
}

function normalizeFilters(filters: PlaneacionMensualFiltros) {
  return {
    busqueda: filters.busqueda?.trim() || null,
    cadenaIds: [...new Set(filters.cadenaIds ?? [])].sort(),
    supervisorIds: [...new Set(filters.supervisorIds ?? [])].sort(),
    estados: [...new Set(filters.estados ?? [])].sort(),
    limit: Math.max(1, Math.min(filters.limit ?? 1000, 1000)),
  };
}

export function getPlaneacionMensualCacheTag(cuentaClienteId: string, mes: string): string {
  return `planeacion-mensual:${cuentaClienteId}:${mes.slice(0, 7)}`;
}

export async function obtenerPlaneacionMensualResumen(
  client: PlaneacionMensualReadRpcClient,
  cuentaClienteId: string,
  mes: string,
  filters: PlaneacionMensualFiltros = {}
): Promise<PlaneacionMensualResumen> {
  const normalized = normalizeFilters(filters);
  const cacheKey = JSON.stringify([cuentaClienteId, mes, normalized]);
  const cachedQuery = unstable_cache(
    async () => {
      const { data, error } = await client.rpc('obtener_planeacion_mensual_resumen', {
        p_cuenta_cliente_id: cuentaClienteId,
        p_mes: mes,
        p_busqueda: normalized.busqueda,
        p_cadena_ids: normalized.cadenaIds.length ? normalized.cadenaIds : null,
        p_supervisor_ids: normalized.supervisorIds.length ? normalized.supervisorIds : null,
        p_estados: normalized.estados.length ? normalized.estados : null,
        p_limit: normalized.limit,
      });

      if (error) throw new Error(error.message);
      return parsePlaneacionMensualResumen(data);
    },
    ['planeacion-mensual-resumen-v2', cacheKey],
    {
      revalidate: false,
      tags: [getPlaneacionMensualCacheTag(cuentaClienteId, mes)],
    }
  );

  return cachedQuery();
}

export async function obtenerPlaneacionMensualDetalleDia(
  client: PlaneacionMensualReadRpcClient,
  cuentaClienteId: string,
  pdvId: string,
  fecha: string
): Promise<PlaneacionMensualDetalleDia> {
  const { data, error } = await client.rpc('obtener_planeacion_mensual_dia', {
    p_cuenta_cliente_id: cuentaClienteId,
    p_pdv_id: pdvId,
    p_fecha: fecha,
  });

  if (error) throw new Error(error.message);
  return parsePlaneacionMensualDetalle(data);
}

export async function refrescarPlaneacionMensualSnapshot(
  client: PlaneacionMensualReadRpcClient,
  cuentaClienteId: string,
  mes: string,
  pdvIds: string[]
): Promise<void> {
  const uniquePdvIds = [...new Set(pdvIds)].filter(Boolean);
  const { error } = await client.rpc('refrescar_planeacion_mensual_snapshot', {
    p_cuenta_cliente_id: cuentaClienteId,
    p_mes: mes,
    p_pdv_ids: uniquePdvIds.length ? uniquePdvIds : null,
  });

  if (error) throw new Error(error.message);
}
