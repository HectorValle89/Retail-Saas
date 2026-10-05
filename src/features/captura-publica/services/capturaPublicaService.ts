import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import {
  resolveCapturaPublicaAssignments,
  type CapturaPublicaAssignmentCandidate,
  type CapturaPublicaAssignmentResolution,
} from './capturaPublicaAssignment';

type TypedSupabaseClient = ReturnType<typeof createServiceClient>;

export type CapturaPublicaTipo = 'VENTA' | 'CANJE' | 'DESABASTO' | 'LOVE_ISDIN';

export interface CapturaPublicaLink {
  id: string;
  cuentaClienteId: string;
  cuentaClienteNombre: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  accionesHabilitadas: CapturaPublicaTipo[];
  pdvIdsPermitidos: string[];
  empleadoIdsPermitidos: string[];
}

export interface CapturaPublicaOption {
  id: string;
  nombre: string;
  categoria?: string;
}

export interface CapturaPublicaData {
  ok: boolean;
  message?: string;
  link?: CapturaPublicaLink;
  pdvs: CapturaPublicaOption[];
  empleados: CapturaPublicaOption[];
  productos: CapturaPublicaOption[];
  materiales: CapturaPublicaOption[];
  asignaciones?: CapturaPublicaAssignmentResolution[];
}

interface CapturaPublicaLinkRow {
  id: string;
  cuenta_cliente_id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  acciones_habilitadas: string[] | null;
  pdv_ids_permitidos: string[] | null;
  empleado_ids_permitidos: string[] | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  cuenta_cliente:
    | { nombre: string | null; activa: boolean | null }
    | Array<{ nombre: string | null; activa: boolean | null }>
    | null;
}

interface CuentaClientePdvRow {
  pdv_id: string;
  pdv:
    | {
        id: string;
        nombre: string | null;
        estatus: string | null;
      }
    | Array<{
        id: string;
        nombre: string | null;
        estatus: string | null;
      }>
    | null;
}

type PdvOptionRow = {
  id: string;
  nombre: string | null;
  estatus: string | null;
};

type PdvDetailVigenciaRow = {
  pdv_id: string;
  nombre: string | null;
  estatus: string | null;
  vigente_desde: string;
};

interface AssignmentEmployeeRow {
  id: string;
  nombre_completo: string | null;
  puesto: string | null;
  estatus_laboral: string | null;
}

interface CapturaPublicaAssignmentRow {
  id: string;
  empleado_id: string;
  pdv_id: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  dias_laborales: string | null;
  tipo: string | null;
  naturaleza: CapturaPublicaAssignmentCandidate['naturaleza'];
  prioridad: number | null;
  empleado: AssignmentEmployeeRow | AssignmentEmployeeRow[] | null;
}

export interface ProductoRow {
  id: string;
  nombre: string;
  nombre_corto: string | null;
  categoria: string;
  activo: boolean;
  sku: string | null;
}

export interface MaterialRow {
  id: string;
  nombre: string;
  activo: boolean;
  tipo?: string;
}

const EMPTY_DATA: CapturaPublicaData = {
  ok: false,
  pdvs: [],
  empleados: [],
  productos: [],
  materiales: [],
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeActions(value: string[] | null | undefined): CapturaPublicaTipo[] {
  const allowed = new Set<CapturaPublicaTipo>(['VENTA', 'CANJE', 'DESABASTO', 'LOVE_ISDIN']);
  return (value ?? []).filter((item): item is CapturaPublicaTipo =>
    allowed.has(item as CapturaPublicaTipo)
  );
}

function isLinkCurrentlyValid(link: CapturaPublicaLinkRow) {
  const now = Date.now();
  const starts = new Date(link.vigente_desde).getTime();
  const ends = link.vigente_hasta
    ? new Date(link.vigente_hasta).getTime()
    : Number.POSITIVE_INFINITY;
  return link.activo && starts <= now && now < ends;
}

async function resolveLink(service: TypedSupabaseClient, slug: string) {
  const { data, error } = await service
    .from('captura_publica_link')
    .select(
      'id, cuenta_cliente_id, slug, nombre, descripcion, activo, acciones_habilitadas, pdv_ids_permitidos, empleado_ids_permitidos, vigente_desde, vigente_hasta, cuenta_cliente:cuenta_cliente_id(nombre, activa)'
    )
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as CapturaPublicaLinkRow | null;
}

function buildLink(row: CapturaPublicaLinkRow): CapturaPublicaLink {
  const cuenta = first(row.cuenta_cliente);

  return {
    id: row.id,
    cuentaClienteId: row.cuenta_cliente_id,
    cuentaClienteNombre: cuenta?.nombre ?? 'Cuenta operativa',
    slug: row.slug,
    nombre: row.nombre,
    descripcion: row.descripcion,
    accionesHabilitadas: normalizeActions(row.acciones_habilitadas),
    pdvIdsPermitidos: row.pdv_ids_permitidos ?? [],
    empleadoIdsPermitidos: row.empleado_ids_permitidos ?? [],
  };
}

export async function loadCapturaPublicaPdvsForDate(
  service: TypedSupabaseClient,
  link: CapturaPublicaLink,
  fechaOperativa: string
) {
  let relationQuery = service
    .from('cuenta_cliente_pdv')
    .select('pdv_id, pdv:pdv_id(id, nombre, estatus)')
    .eq('cuenta_cliente_id', link.cuentaClienteId)
    .eq('activo', true)
    .lte('fecha_inicio', fechaOperativa)
    .or(`fecha_fin.gte.${fechaOperativa},fecha_fin.is.null`)
    .order('pdv_id', { ascending: true })
    .limit(1000);

  if (link.pdvIdsPermitidos.length > 0) {
    relationQuery = relationQuery.in('pdv_id', link.pdvIdsPermitidos);
  }

  let detailQuery = service
    .from('pdv_detalle_vigencia')
    .select('pdv_id, nombre, estatus, vigente_desde')
    .eq('cuenta_cliente_id', link.cuentaClienteId)
    .lte('vigente_desde', fechaOperativa)
    .or(`vigente_hasta.gte.${fechaOperativa},vigente_hasta.is.null`)
    .order('vigente_desde', { ascending: false })
    .limit(1000);

  if (link.pdvIdsPermitidos.length > 0) {
    detailQuery = detailQuery.in('pdv_id', link.pdvIdsPermitidos);
  }

  const [relationResult, detailResult] = await Promise.all([relationQuery, detailQuery]);
  if (relationResult.error) {
    throw new Error(relationResult.error.message);
  }
  if (detailResult.error) {
    throw new Error(detailResult.error.message);
  }

  const effectiveDetails = new Map<string, PdvDetailVigenciaRow>();
  for (const detail of (detailResult.data ?? []) as PdvDetailVigenciaRow[]) {
    if (!effectiveDetails.has(detail.pdv_id)) {
      effectiveDetails.set(detail.pdv_id, detail);
    }
  }

  const rawPdvs = ((relationResult.data ?? []) as CuentaClientePdvRow[])
    .map((row) => {
      const master = first(row.pdv) as PdvOptionRow | null;
      const detail = effectiveDetails.get(row.pdv_id);
      if (detail) {
        return {
          id: row.pdv_id,
          nombre: detail.nombre ?? master?.nombre ?? 'PDV sin nombre',
          estatus: detail.estatus,
        } satisfies PdvOptionRow;
      }
      return master;
    })
    .filter((pdv): pdv is PdvOptionRow =>
      Boolean(pdv && (pdv.estatus === 'ACTIVO' || pdv.estatus === 'TEMPORAL'))
    )
    .map((pdv) => ({
      id: pdv.id,
      nombre: pdv.nombre ?? 'PDV sin nombre',
    }));

  const uniqueMap = new Map<string, { id: string; nombre: string }>();
  for (const item of rawPdvs) {
    if (!uniqueMap.has(item.id)) {
      uniqueMap.set(item.id, item);
    }
  }

  return Array.from(uniqueMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

async function loadProductos(service: TypedSupabaseClient, enabled: boolean) {
  if (!enabled) {
    return [];
  }

  const { data, error } = await service
    .from('producto')
    .select('id, nombre, nombre_corto, categoria, activo, sku')
    .eq('activo', true)
    .order('nombre_corto', { ascending: true })
    .limit(500);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as ProductoRow[]).map(formatProductoOption);
}

export function formatProductoOption(producto: ProductoRow): CapturaPublicaOption {
  return {
    id: producto.id,
    nombre: producto.sku ? `[${producto.sku}] ${producto.nombre}` : producto.nombre,
    categoria: producto.categoria || 'OTRO',
  };
}

export const LISTA_ORDEN_CANJES_ISDIN = [
  'BOLSA FOTO PLAYA ISDIN  2021',
  'CANGURERAS NEGRAS ISDIN',
  'FP PROTECTOR LABIAL HV ISDIN 46',
  'FP TRANSPARENT SPRAY WS SPF50 250ML',
  'GORRA ISDIN FOTOPROTECCIÓN',
  'MCON FP FW MAGIC SIN COLOR SPF50 10 ML',
  'NECESER ISDINCEUTICS NEGRO 2025',
  'NECESER PLAYA ISDIN',
  'PARAGUAS DE BOLSILLO',
  'PARAGUAS JUMBO',
  'PORTA TOTTLE FWM 2025',
  'PORTATOTTLE FWM ALCARAZ 2025',
  'PORTATOTTLE STICK 2024',
  'PORTATOTTLE STICK PEDIATRICS 2025',
  'PROM ACNIBEN FACIAL CLEANSER GEL 50ML',
  'PROM FP FUSION WATER MAGIC REPAIR SPF50 10 ML',
  'MAGIC REPAIR FP FW MAGIC REPAIR COLOR SPF50 10 ML',
  'PROM FP FW MAGIC COL BROZE SPF50 10 ML',
  'PROM FP FW MAGIC GLOW SPF50 10 ML',
  'PROM FP FWM COL LIGHT SPF50 10 ML',
  'PROM FP FWM COL MEDIUM SPF50 10 ML',
  'TERMO T208 A 1 TINTA',
  'TOTE BAG ISDIN 2024',
  'CAPIBARA',
  'COSMETIQUERAS',
  'NECESER PLAYA C/AFTERSUN Y MINIS',
  'MCON FP FUSION WATER MAGIC ALCARAZ SPF50 10 ML',
  'BEACH BAG FOTO MAGIC 2024',
];

export function ordenarYFiltrarMateriales(
  rows: MaterialRow[]
): Array<{ id: string; nombre: string }> {
  const filtered = rows.filter((m) => {
    const name = m.nombre.toUpperCase().replace(/\s+/g, ' ').trim();

    // Si está en la lista permitida explícitamente, se salta todas las exclusiones
    const isExplicitlyAllowed = LISTA_ORDEN_CANJES_ISDIN.some(
      (item) => item.toUpperCase().replace(/\s+/g, ' ').trim() === name
    );
    if (isExplicitlyAllowed) {
      return true;
    }

    // Exclusiones estándar para otros materiales
    const nameUpper = m.nombre.toUpperCase().trim();
    if (
      nameUpper.startsWith('DI ') ||
      nameUpper.startsWith('D.I ') ||
      nameUpper.startsWith('D.I. ') ||
      nameUpper.includes('DOSIS')
    ) {
      return false;
    }
    if (nameUpper.includes('TESTER')) {
      return false;
    }
    const excludePattern = /\b(2\s*ML|2\s*G|5\s*ML|10\s*ML)\b/i;
    if (excludePattern.test(nameUpper)) {
      return false;
    }
    return true;
  });

  const resolved = filtered.map((material) => ({
    id: material.id,
    nombre: material.nombre,
  }));

  resolved.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return resolved;
}

async function loadMateriales(service: TypedSupabaseClient, link: CapturaPublicaLink) {
  if (!link.accionesHabilitadas.includes('CANJE')) {
    return [];
  }

  const { data, error } = await service
    .from('material_catalogo')
    .select('id, nombre, activo, tipo')
    .eq('cuenta_cliente_id', link.cuentaClienteId)
    .eq('activo', true)
    .in('tipo', ['PROMOCIONAL', 'CANJE_PROMOCIONAL', 'DOSIS'])
    .limit(300);

  if (error) {
    return [];
  }

  return ordenarYFiltrarMateriales((data ?? []) as MaterialRow[]);
}

export async function loadCapturaPublicaAssignmentsForDate(
  service: TypedSupabaseClient,
  link: CapturaPublicaLink,
  fechaOperativa: string
) {
  let query = service
    .from('asignacion')
    .select(
      'id, pdv_id, empleado_id, fecha_inicio, fecha_fin, dias_laborales, tipo, naturaleza, prioridad, empleado!asignacion_empleado_id_fkey(id, nombre_completo, puesto, estatus_laboral)'
    )
    .eq('cuenta_cliente_id', link.cuentaClienteId)
    .eq('estado_publicacion', 'PUBLICADA')
    .lte('fecha_inicio', fechaOperativa)
    .or(`fecha_fin.gte.${fechaOperativa},fecha_fin.is.null`)
    .order('fecha_inicio', { ascending: false })
    .limit(1000);

  if (link.pdvIdsPermitidos.length > 0) {
    query = query.in('pdv_id', link.pdvIdsPermitidos);
  }

  if (link.empleadoIdsPermitidos.length > 0) {
    query = query.in('empleado_id', link.empleadoIdsPermitidos);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const candidates = ((data ?? []) as CapturaPublicaAssignmentRow[]).map((row) => {
    const employee = first(row.empleado);
    const position = employee?.puesto?.toUpperCase() ?? '';

    return {
      id: row.id,
      empleado_id: row.empleado_id,
      empleadoNombre: employee?.nombre_completo ?? 'Dermoconsejera sin nombre',
      empleadoDisponible:
        employee?.estatus_laboral === 'ACTIVO' &&
        (position.includes('DERMO') || position.includes('LOVE')),
      pdv_id: row.pdv_id,
      fecha_inicio: row.fecha_inicio,
      fecha_fin: row.fecha_fin,
      dias_laborales: row.dias_laborales,
      tipo: row.tipo,
      naturaleza: row.naturaleza,
      prioridad: row.prioridad,
    } satisfies CapturaPublicaAssignmentCandidate;
  });

  return resolveCapturaPublicaAssignments(candidates, fechaOperativa);
}

export async function obtenerCapturaPublicaData(
  slug: string,
  service: TypedSupabaseClient = createServiceClient()
): Promise<CapturaPublicaData> {
  const normalizedSlug = slug.trim().toLowerCase();

  if (!normalizedSlug) {
    return {
      ...EMPTY_DATA,
      message: 'El link de captura no es valido.',
    };
  }

  const row = await resolveLink(service, normalizedSlug);
  const cuenta = first(row?.cuenta_cliente);

  if (!row || !cuenta?.activa) {
    return {
      ...EMPTY_DATA,
      message: 'El link de captura no existe o la cuenta esta inactiva.',
    };
  }

  if (!isLinkCurrentlyValid(row)) {
    return {
      ...EMPTY_DATA,
      message: 'Este link de captura no esta vigente.',
    };
  }

  const link = buildLink(row);
  const defaultDate = getCapturaPublicaDefaultDate();
  const [pdvs, productos, materiales, asignaciones] = await Promise.all([
    loadCapturaPublicaPdvsForDate(service, link, defaultDate),
    loadProductos(
      service,
      link.accionesHabilitadas.includes('VENTA') || link.accionesHabilitadas.includes('DESABASTO')
    ),
    loadMateriales(service, link),
    loadCapturaPublicaAssignmentsForDate(service, link, defaultDate),
  ]);
  const empleados = Array.from(
    new Map(
      asignaciones
        .filter(
          (assignment) =>
            assignment.estado === 'ASIGNADA' && assignment.empleadoId && assignment.empleadoNombre
        )
        .map((assignment) => [
          assignment.empleadoId as string,
          {
            id: assignment.empleadoId as string,
            nombre: assignment.empleadoNombre as string,
          },
        ])
    ).values()
  ).sort((left, right) => left.nombre.localeCompare(right.nombre, 'es'));

  return {
    ok: true,
    link,
    pdvs,
    empleados,
    productos,
    materiales,
    asignaciones,
  };
}

export async function obtenerCapturaPublicaLinkParaRegistro(
  service: TypedSupabaseClient,
  slug: string
) {
  const row = await resolveLink(service, slug.trim().toLowerCase());
  const cuenta = first(row?.cuenta_cliente);

  if (!row || !cuenta?.activa || !isLinkCurrentlyValid(row)) {
    throw new Error('El link de captura no existe, no esta activo o ya vencio.');
  }

  return buildLink(row);
}

export function getCapturaPublicaDefaultDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
}
