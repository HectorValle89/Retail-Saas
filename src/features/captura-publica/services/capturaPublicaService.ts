import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';

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
  asignacionesHoy?: Array<{ pdvId: string; empleadoId: string }>;
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

interface UsuarioEmpleadoRow {
  empleado_id: string;
  empleado:
    | {
        id: string;
        nombre_completo: string | null;
        puesto: string | null;
        estatus_laboral: string | null;
      }
    | Array<{
        id: string;
        nombre_completo: string | null;
        puesto: string | null;
        estatus_laboral: string | null;
      }>
    | null;
}

type EmpleadoOptionRow = {
  id: string;
  nombre_completo: string | null;
  puesto: string | null;
  estatus_laboral: string | null;
};

interface ProductoRow {
  id: string;
  nombre: string;
  nombre_corto: string | null;
  categoria: string;
  activo: boolean;
  sku: string | null;
}

interface MaterialRow {
  id: string;
  nombre: string;
  activo: boolean;
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

async function loadPdvs(service: TypedSupabaseClient, link: CapturaPublicaLink) {
  let query = service
    .from('cuenta_cliente_pdv')
    .select('pdv_id, pdv:pdv_id(id, nombre, estatus)')
    .eq('cuenta_cliente_id', link.cuentaClienteId)
    .eq('activo', true)
    .order('pdv_id', { ascending: true })
    .limit(1000);

  if (link.pdvIdsPermitidos.length > 0) {
    query = query.in('pdv_id', link.pdvIdsPermitidos);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as CuentaClientePdvRow[])
    .map((row) => first(row.pdv) as PdvOptionRow | null)
    .filter((pdv): pdv is PdvOptionRow => Boolean(pdv && pdv.estatus === 'ACTIVO'))
    .map((pdv) => ({
      id: pdv.id,
      nombre: pdv.nombre ?? 'PDV sin nombre',
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

async function loadEmpleados(service: TypedSupabaseClient, link: CapturaPublicaLink) {
  let query = service
    .from('usuario')
    .select('empleado_id, empleado:empleado_id(id, nombre_completo, puesto, estatus_laboral)')
    .eq('cuenta_cliente_id', link.cuentaClienteId)
    .limit(1000);

  if (link.empleadoIdsPermitidos.length > 0) {
    query = query.in('empleado_id', link.empleadoIdsPermitidos);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as UsuarioEmpleadoRow[])
    .map((row) => first(row.empleado) as EmpleadoOptionRow | null)
    .filter((empleado): empleado is EmpleadoOptionRow =>
      Boolean(
        empleado &&
        (empleado.puesto === 'DERMOCONSEJERO' || empleado.puesto === 'LOVE_IS') &&
        empleado.estatus_laboral === 'ACTIVO'
      )
    )
    .map((empleado) => ({
      id: empleado.id,
      nombre: empleado.nombre_completo ?? 'Dermoconsejera sin nombre',
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
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

  return ((data ?? []) as ProductoRow[]).map((producto) => ({
    id: producto.id,
    nombre: producto.sku
      ? `[${producto.sku}] ${producto.nombre_corto || producto.nombre}`
      : (producto.nombre_corto || producto.nombre),
    categoria: producto.categoria || 'OTRO',
  }));
}

async function loadMateriales(service: TypedSupabaseClient, link: CapturaPublicaLink) {
  if (!link.accionesHabilitadas.includes('CANJE')) {
    return [];
  }

  const { data, error } = await service
    .from('material_catalogo')
    .select('id, nombre, activo')
    .eq('cuenta_cliente_id', link.cuentaClienteId)
    .eq('activo', true)
    .in('tipo', ['PROMOCIONAL', 'CANJE_PROMOCIONAL'])
    .order('nombre', { ascending: true })
    .limit(300);

  if (error) {
    return [];
  }

  const rows = (data ?? []) as MaterialRow[];
  const filtered = rows.filter((m) => {
    const name = m.nombre.toUpperCase().trim();
    
    // 1. Excluir Dosis de Inicio (empiezan con "DI " o contienen "DOSIS")
    if (name.startsWith('DI ') || name.includes('DOSIS')) {
      return false;
    }
    
    // 2. Excluir Testers (contienen "TESTER")
    if (name.includes('TESTER')) {
      return false;
    }
    
    // 3. Excluir todas las de 2ml, 2g, 5ml y 10ml
    const excludePattern = /\b(2\s*ML|2\s*G|5\s*ML|10\s*ML)\b/i;
    if (excludePattern.test(name)) {
      return false;
    }
    
    return true;
  });

  return filtered.map((material) => ({
    id: material.id,
    nombre: material.nombre,
  }));
}

async function loadAsignacionesHoy(service: TypedSupabaseClient, cuentaClienteId: string) {
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(
    new Date()
  );
  const { data, error } = await service
    .from('asignacion')
    .select('pdv_id, empleado_id')
    .eq('cuenta_cliente_id', cuentaClienteId)
    .eq('estado_publicacion', 'PUBLICADA')
    .lte('fecha_inicio', todayIso)
    .or(`fecha_fin.gte.${todayIso},fecha_fin.is.null`)
    .limit(1000);

  if (error) {
    return [];
  }

  return ((data ?? []) as Array<{ pdv_id: string; empleado_id: string }>).map((row) => ({
    pdvId: row.pdv_id,
    empleadoId: row.empleado_id,
  }));
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
  const [pdvs, empleados, productos, materiales, asignacionesHoy] = await Promise.all([
    loadPdvs(service, link),
    loadEmpleados(service, link),
    loadProductos(
      service,
      link.accionesHabilitadas.includes('VENTA') || link.accionesHabilitadas.includes('DESABASTO')
    ),
    loadMateriales(service, link),
    loadAsignacionesHoy(service, link.cuentaClienteId),
  ]);

  return {
    ok: true,
    link,
    pdvs,
    empleados,
    productos,
    materiales,
    asignacionesHoy,
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
