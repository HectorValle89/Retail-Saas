'use server';

import { headers } from 'next/headers';
import { revalidateTag } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';
import { storeOptimizedEvidence } from '@/lib/files/evidenceStorage';
import { buildModuleCacheTags } from '@/lib/cache/moduleTags';
import {
  loadCapturaPublicaAssignmentsForDate,
  loadCapturaPublicaPdvsForDate,
  obtenerCapturaPublicaLinkParaRegistro,
  type CapturaPublicaData,
  type CapturaPublicaOption,
  type CapturaPublicaTipo,
} from './capturaPublicaService';
import { validatePreparedEvidenceFile } from './capturaPublicaEvidence';

export interface CapturaPublicaActionState {
  ok: boolean;
  message: string;
  registroId?: string;
}

export interface CapturaPublicaAssignmentsActionState {
  ok: boolean;
  message?: string;
  pdvs: CapturaPublicaOption[];
  asignaciones: NonNullable<CapturaPublicaData['asignaciones']>;
}

export interface CapturaPublicaEmpleadosActionState {
  ok: boolean;
  message?: string;
  empleados: CapturaPublicaOption[];
}

const INITIAL_ERROR = 'No fue posible guardar el registro. Revisa los datos e intenta de nuevo.';

function normalizeText(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function requireText(value: FormDataEntryValue | null, label: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error(`${label} es obligatorio.`);
  }

  return normalized;
}

function revalidateCapturaPublicaCache(params: {
  cuentaClienteId?: string | null;
  empleadoId?: string | null;
}) {
  const modules = ['ventas', 'love-isdin', 'dashboard', 'reportes', 'materiales'];
  for (const moduleName of modules) {
    const tags = buildModuleCacheTags({
      module: moduleName,
      accountId: params.cuentaClienteId ?? null,
      employeeId: params.empleadoId ?? null,
    });
    for (const tag of tags) {
      try {
        revalidateTag(tag, 'max');
      } catch {
        // En entornos sin soporte para revalidateTag o testing, ignorar
      }
    }
  }
}

function normalizeTipo(value: FormDataEntryValue | null): CapturaPublicaTipo {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();
  if (!['VENTA', 'CANJE', 'DESABASTO', 'LOVE_ISDIN'].includes(normalized)) {
    throw new Error('La accion seleccionada no es valida.');
  }

  return normalized as CapturaPublicaTipo;
}

function normalizePositiveInteger(value: FormDataEntryValue | null, label: string) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  const numeric = Number(raw);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${label} debe ser un numero entero mayor a cero.`);
  }

  return numeric;
}

function normalizeNonNegativeNumber(value: FormDataEntryValue | null, label: string) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${label} no puede ser negativo.`);
  }

  return numeric;
}

function assertDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('La fecha operativa no es valida.');
  }

  return value;
}

function includesOrOpen(allowedIds: string[], value: string) {
  return allowedIds.length === 0 || allowedIds.includes(value);
}

async function resolvePdv(
  service: ReturnType<typeof createServiceClient>,
  cuentaClienteId: string,
  pdvId: string,
  fechaOperativa: string
) {
  const [relationResult, pdvResult] = await Promise.all([
    service
      .from('cuenta_cliente_pdv')
      .select('id')
      .eq('cuenta_cliente_id', cuentaClienteId)
      .eq('pdv_id', pdvId)
      .eq('activo', true)
      .lte('fecha_inicio', fechaOperativa)
      .or(`fecha_fin.gte.${fechaOperativa},fecha_fin.is.null`)
      .limit(1)
      .maybeSingle(),
    service.from('pdv').select('id, nombre, estatus').eq('id', pdvId).maybeSingle(),
  ]);

  const pdv = pdvResult.data as {
    id: string;
    nombre: string | null;
    estatus: string | null;
  } | null;
  if (relationResult.error || pdvResult.error || !relationResult.data || !pdv) {
    throw new Error('El punto de venta seleccionado no esta disponible para este link.');
  }

  if (pdv.estatus === 'ACTIVO') {
    return { id: pdv.id, nombre: pdv.nombre ?? 'PDV sin nombre' };
  }

  // La vista versionada aun no forma parte del tipo Database generado.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detailBuilder = service.from('pdv_detalle_vigencia') as any;
  if (!detailBuilder || typeof detailBuilder.select !== 'function') {
    throw new Error('El punto de venta seleccionado no esta disponible para este link.');
  }
  const detailResult = await detailBuilder
    .select('pdv_id, nombre, estatus, vigente_desde')
    .eq('cuenta_cliente_id', cuentaClienteId)
    .eq('pdv_id', pdvId)
    .lte('vigente_desde', fechaOperativa)
    .or(`vigente_hasta.gte.${fechaOperativa},vigente_hasta.is.null`)
    .order('vigente_desde', { ascending: false })
    .limit(1)
    .maybeSingle();
  const detail = detailResult.data as {
    pdv_id: string;
    nombre: string | null;
    estatus: string | null;
  } | null;
  if (
    detailResult.error ||
    !detail ||
    (detail.estatus !== 'ACTIVO' && detail.estatus !== 'TEMPORAL')
  ) {
    throw new Error('El punto de venta seleccionado no esta disponible para este link.');
  }

  return {
    id: pdv.id,
    nombre: detail?.nombre ?? pdv.nombre ?? 'PDV sin nombre',
  };
}

export async function obtenerAsignacionesPublicadasCaptura(
  slug: string,
  fechaOperativaInput: string
): Promise<CapturaPublicaAssignmentsActionState> {
  try {
    const fechaOperativa = assertDate(fechaOperativaInput.trim());
    const service = createServiceClient();
    const link = await obtenerCapturaPublicaLinkParaRegistro(service, slug);
    const [pdvs, asignaciones] = await Promise.all([
      loadCapturaPublicaPdvsForDate(service, link, fechaOperativa),
      loadCapturaPublicaAssignmentsForDate(service, link, fechaOperativa),
    ]);

    return {
      ok: true,
      pdvs,
      asignaciones,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'No fue posible consultar la asignación pública de la fecha.',
      asignaciones: [],
      pdvs: [],
    };
  }
}

async function resolveEmpleado(
  service: ReturnType<typeof createServiceClient>,
  cuentaClienteId: string,
  empleadoId: string
) {
  const { data, error } = await service
    .from('usuario')
    .select('id, empleado_id, empleado:empleado_id(id, nombre_completo, puesto, estatus_laboral)')
    .eq('cuenta_cliente_id', cuentaClienteId)
    .eq('empleado_id', empleadoId)
    .limit(1)
    .maybeSingle();

  const empleadoValue = (
    data as {
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
    } | null
  )?.empleado;
  const empleado = Array.isArray(empleadoValue) ? (empleadoValue[0] ?? null) : empleadoValue;

  const puestoUpper = (empleado?.puesto ?? '').toUpperCase();
  const isDermo = puestoUpper.includes('DERMO') || puestoUpper.includes('LOVE');

  if (error || !empleado || !isDermo || empleado.estatus_laboral !== 'ACTIVO') {
    throw new Error('La dermoconsejera seleccionada no esta disponible para este link.');
  }

  return {
    id: empleado.id,
    nombre: empleado.nombre_completo ?? 'Dermoconsejera sin nombre',
    usuarioId: (data as { id?: string })?.id ?? null,
  };
}

interface CapturaPublicaEmpleadoOption {
  id: string;
  nombre_completo: string | null;
  puesto: string | null;
  estatus_laboral: string | null;
}

interface CapturaPublicaEmpleadoOptionRow {
  empleado_id: string | null;
  empleado: CapturaPublicaEmpleadoOption | CapturaPublicaEmpleadoOption[] | null;
}

function firstEmpleadoOption(
  value: CapturaPublicaEmpleadoOptionRow['empleado']
): CapturaPublicaEmpleadoOption | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * El padrón alterno se carga únicamente cuando la DC declara que la asignación
 * publicada no corresponde a la jornada real. No forma parte de la carga inicial
 * del formulario para evitar exponer ni transferir el padrón completo sin uso.
 */
export async function obtenerDermoconsejerasDisponiblesCaptura(
  slug: string
): Promise<CapturaPublicaEmpleadosActionState> {
  try {
    const service = createServiceClient();
    const link = await obtenerCapturaPublicaLinkParaRegistro(service, slug);
    let query = service
      .from('usuario')
      .select('empleado_id, empleado:empleado_id(id, nombre_completo, puesto, estatus_laboral)')
      .eq('cuenta_cliente_id', link.cuentaClienteId)
      .limit(500);

    if (link.empleadoIdsPermitidos.length > 0) {
      query = query.in('empleado_id', link.empleadoIdsPermitidos);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const empleados = Array.from(
      new Map(
        ((data ?? []) as CapturaPublicaEmpleadoOptionRow[])
          .map((row) => firstEmpleadoOption(row.empleado))
          .filter((empleado): empleado is CapturaPublicaEmpleadoOption => {
            if (!empleado) {
              return false;
            }
            const puesto = empleado.puesto?.toUpperCase() ?? '';
            return (
              empleado.estatus_laboral === 'ACTIVO' &&
              (puesto.includes('DERMO') || puesto.includes('LOVE'))
            );
          })
          .map((empleado) => [
            empleado.id,
            {
              id: empleado.id,
              nombre: empleado.nombre_completo ?? 'Dermoconsejera sin nombre',
            },
          ])
      ).values()
    ).sort((left, right) => left.nombre.localeCompare(right.nombre, 'es'));

    return { ok: true, empleados };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'No fue posible consultar las dermoconsejeras disponibles.',
      empleados: [],
    };
  }
}

async function resolveProducto(
  service: ReturnType<typeof createServiceClient>,
  productoId: string | null
) {
  if (!productoId) {
    return null;
  }

  const { data, error } = await service
    .from('producto')
    .select('id, nombre, nombre_corto, activo')
    .eq('id', productoId)
    .maybeSingle();

  const producto = data as {
    id: string;
    nombre: string;
    nombre_corto: string | null;
    activo: boolean;
  } | null;

  if (error || !producto || !producto.activo) {
    throw new Error('El producto seleccionado no esta disponible.');
  }

  return {
    id: producto.id,
    nombre: producto.nombre,
  };
}

async function resolveMaterial(
  service: ReturnType<typeof createServiceClient>,
  cuentaClienteId: string,
  materialId: string | null
) {
  if (!materialId) {
    return null;
  }

  const { data, error } = await service
    .from('material_catalogo')
    .select('id, nombre, activo')
    .eq('cuenta_cliente_id', cuentaClienteId)
    .eq('id', materialId)
    .maybeSingle();

  const material = data as { id: string; nombre: string; activo: boolean } | null;

  if (error || !material || !material.activo) {
    throw new Error('El material de canje seleccionado no esta disponible.');
  }

  return {
    id: material.id,
    nombre: material.nombre,
  };
}

interface ComparableItem {
  producto_id: string | null;
  material_catalogo_id: string | null;
  cantidad: number | null;
  subtipo_registro: string | null;
  observaciones: string | null;
}

function checkDuplicateSubmission(
  currentItems: ComparableItem[],
  recentRecords: ComparableItem[] | null
): boolean {
  if (!recentRecords || recentRecords.length < currentItems.length) {
    return false;
  }

  const remaining = [...recentRecords];

  for (const item of currentItems) {
    const idx = remaining.findIndex(
      (r) =>
        r.producto_id === item.producto_id &&
        r.material_catalogo_id === item.material_catalogo_id &&
        (r.cantidad === null
          ? item.cantidad === null
          : Number(r.cantidad) === Number(item.cantidad)) &&
        r.subtipo_registro === item.subtipo_registro &&
        String(r.observaciones || '').trim() === String(item.observaciones || '').trim()
    );

    if (idx === -1) {
      return false;
    }
    remaining.splice(idx, 1);
  }

  return true;
}

async function buildRequestMetadata() {
  const requestHeaders = await headers();
  return {
    canal: 'FORMULARIO_PUBLICO',
    host: requestHeaders.get('host'),
    user_agent: requestHeaders.get('user-agent'),
    forwarded_for_present: Boolean(requestHeaders.get('x-forwarded-for')),
  };
}

export async function registrarCapturaPublica(
  slug: string,
  _prevState: CapturaPublicaActionState,
  formData: FormData
): Promise<CapturaPublicaActionState> {
  try {
    if (normalizeText(formData.get('website'))) {
      return {
        ok: true,
        message: 'Registro recibido.',
      };
    }

    const service = createServiceClient();
    const link = await obtenerCapturaPublicaLinkParaRegistro(service, slug);
    const tipoRegistro = normalizeTipo(formData.get('tipo_registro'));

    if (!link.accionesHabilitadas.includes(tipoRegistro)) {
      throw new Error('Este link no permite esa accion.');
    }

    const fechaOperativa = assertDate(requireText(formData.get('fecha_operativa'), 'Fecha'));
    const pdvId = requireText(formData.get('pdv_id'), 'Punto de venta');
    const empleadoId = requireText(formData.get('empleado_id'), 'Dermoconsejera');
    const atribucionManualSolicitada = formData.get('atribucion_manual_dc') === 'true';

    if (!includesOrOpen(link.pdvIdsPermitidos, pdvId)) {
      throw new Error('El punto de venta no esta permitido para este link.');
    }

    if (!includesOrOpen(link.empleadoIdsPermitidos, empleadoId)) {
      throw new Error('La dermoconsejera no esta permitida para este link.');
    }

    const [pdv, empleado, asignacionesPublicadas] = await Promise.all([
      resolvePdv(service, link.cuentaClienteId, pdvId, fechaOperativa),
      resolveEmpleado(service, link.cuentaClienteId, empleadoId),
      loadCapturaPublicaAssignmentsForDate(service, link, fechaOperativa),
    ]);
    const asignacionPublicada = asignacionesPublicadas.find(
      (assignment) => assignment.pdvId === pdvId
    );

    const empleadoEnAsignacionPublicada = Boolean(
      asignacionPublicada &&
      (asignacionPublicada.estado === 'SELECCIONABLE'
        ? asignacionPublicada.candidatos.some((candidate) => candidate.empleadoId === empleadoId)
        : asignacionPublicada.empleadoId === empleadoId)
    );
    const atribucionManual = !empleadoEnAsignacionPublicada && atribucionManualSolicitada;

    if (!empleadoEnAsignacionPublicada && !atribucionManualSolicitada) {
      throw new Error(
        'La dermoconsejera enviada no corresponde a la asignación pública vigente. Activa la atribución manual si la jornada real fue distinta.'
      );
    }

    if (!atribucionManual && (!asignacionPublicada || asignacionPublicada.estado === 'CONFLICTO')) {
      throw new Error(
        'El punto de venta no tiene una asignación pública disponible para la fecha. Declara tu nombre si realizaste la jornada real.'
      );
    }

    const atribucionCaptura = {
      manual_declarada: atribucionManual,
      origen: atribucionManual ? 'DC_DECLARADA_EN_FORMULARIO_PUBLICO' : 'ASIGNACION_PUBLICADA',
      fecha_operativa: fechaOperativa,
      pdv_id: pdv.id,
      empleado_declarado_id: empleado.id,
      empleado_publicado_id: asignacionPublicada?.empleadoId ?? null,
      asignacion_publicada_id: asignacionPublicada?.asignacionId ?? null,
    };

    // Buscar registros idénticos creados hace menos de 15 segundos para evitar duplicidad por doble envío
    let recentRecords = null;
    const tableBuilder = service.from('captura_publica_registro');
    if (tableBuilder && typeof tableBuilder.select === 'function') {
      const timeWindowLimit = new Date(Date.now() - 15000).toISOString();
      const { data } = await tableBuilder
        .select('producto_id, material_catalogo_id, cantidad, subtipo_registro, observaciones')
        .eq('empleado_id', empleado.id)
        .eq('pdv_id', pdv.id)
        .eq('tipo_registro', tipoRegistro)
        .eq('fecha_operativa', fechaOperativa)
        .gte('created_at', timeWindowLimit);
      recentRecords = data;
    }

    const itemsJson = formData.get('items_json');
    const requestMetadata = await buildRequestMetadata();

    if (itemsJson) {
      const itemsRaw = JSON.parse(String(itemsJson));
      if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
        throw new Error('El lote de captura no contiene articulos validos.');
      }

      const productoCache = new Map<string, { id: string; nombre: string }>();
      const materialCache = new Map<string, { id: string; nombre: string }>();
      const inserts = [];

      for (const item of itemsRaw) {
        const itemProductoId = item.producto_id ? String(item.producto_id).trim() : null;
        const itemMaterialId = item.material_catalogo_id
          ? String(item.material_catalogo_id).trim()
          : null;

        let resolvedProducto = null;
        if (itemProductoId) {
          if (productoCache.has(itemProductoId)) {
            resolvedProducto = productoCache.get(itemProductoId);
          } else {
            resolvedProducto = await resolveProducto(service, itemProductoId);
            if (resolvedProducto) productoCache.set(itemProductoId, resolvedProducto);
          }
        }

        let resolvedMaterial = null;
        if (itemMaterialId) {
          if (materialCache.has(itemMaterialId)) {
            resolvedMaterial = materialCache.get(itemMaterialId);
          } else {
            resolvedMaterial = await resolveMaterial(service, link.cuentaClienteId, itemMaterialId);
            if (resolvedMaterial) materialCache.set(itemMaterialId, resolvedMaterial);
          }
        }

        const esVenta = tipoRegistro === 'VENTA';
        const esLove = tipoRegistro === 'LOVE_ISDIN';

        // El subtipo puede venir configurado por renglón
        const subtipo = item.subtipo_registro ? String(item.subtipo_registro).trim() : null;

        const esVentaSinActividad =
          esVenta &&
          (subtipo === 'SIN_VENTAS' ||
            subtipo === 'VACACIONES' ||
            subtipo === 'INCAPACIDAD' ||
            subtipo === 'FALTA');
        const esLoveSinActividad =
          esLove &&
          (subtipo === 'SIN_REGISTROS' ||
            subtipo === 'VACACIONES' ||
            subtipo === 'INCAPACIDAD' ||
            subtipo === 'FALTA');

        // Cantidad por defecto para Love ISDIN es 1 si no se especifica
        const cantidad =
          esVentaSinActividad || esLoveSinActividad
            ? null
            : esLove
              ? item.cantidad
                ? Number(item.cantidad)
                : 1
              : item.cantidad
                ? Number(item.cantidad)
                : null;
        const monto = esVenta || esLove ? null : item.monto ? Number(item.monto) : null;

        const observaciones = item.observaciones ? String(item.observaciones).trim() : null;

        if (
          (tipoRegistro === 'VENTA' || tipoRegistro === 'DESABASTO') &&
          !itemProductoId &&
          !esVentaSinActividad
        ) {
          throw new Error('Todos los articulos del lote deben tener un producto seleccionado.');
        }

        if (tipoRegistro === 'CANJE' && !itemMaterialId) {
          throw new Error('Todos los canjes deben tener un material seleccionado.');
        }

        if (tipoRegistro === 'LOVE_ISDIN' && !subtipo) {
          throw new Error('Todos los registros de Love ISDIN deben seleccionar un subtipo.');
        }

        if (
          !esVentaSinActividad &&
          !esLoveSinActividad &&
          (tipoRegistro === 'VENTA' || tipoRegistro === 'CANJE' || tipoRegistro === 'LOVE_ISDIN') &&
          (!cantidad || cantidad <= 0)
        ) {
          throw new Error('La cantidad de cada articulo debe ser mayor a cero.');
        }

        // Subir fotografías de evidencia si vienen adjuntas en la clave dinámica de este renglón.
        // El formulario del cliente envía con sufijos según el tipo:
        //   CANJE:     foto_evidencia__ITEM_ID-con_ticket
        //   LOVE_ISDIN: foto_evidencia__ITEM_ID-exitoso / foto_evidencia__ITEM_ID-fallido
        // También intentamos la clave base sin sufijo por retrocompatibilidad.
        let fotoUrl = null;
        let fotoHash = null;
        const suffixes = ['', '-con_ticket', '-exitoso', '-fallido'];
        const allRowFiles: File[] = [];

        for (const suffix of suffixes) {
          const key = `foto_evidencia__${item.id}${suffix}`;
          const files = formData.getAll(key);
          for (const file of files) {
            if (file && file instanceof File && file.size > 0) {
              const evidenceError = validatePreparedEvidenceFile(file);
              if (evidenceError) {
                throw new Error(evidenceError);
              }
              allRowFiles.push(file);
            }
          }
        }

        const uploadedUrls: string[] = [];
        const uploadedHashes: string[] = [];

        for (const file of allRowFiles) {
          const stored = await storeOptimizedEvidence({
            service,
            bucket: 'operacion-evidencias',
            actorUsuarioId: empleado.usuarioId ?? null,
            storagePrefix: `captura-publica/${link.cuentaClienteId}/${empleadoId}`,
            file: file,
          });
          uploadedUrls.push(stored.archivo.url);
          uploadedHashes.push(stored.archivo.hash);
        }

        if (uploadedUrls.length > 0) {
          fotoUrl = uploadedUrls.join(',');
          fotoHash = uploadedHashes.join(',');
        }

        // Regla de Negocio: Si un canje fue registrado con ticket pero no tiene evidencia fotográfica,
        // se normaliza automáticamente a CANJE_SIN_TICKET.
        let resolvedSubtipo = subtipo;
        if (
          tipoRegistro === 'CANJE' &&
          subtipo === 'CANJE_CON_TICKET' &&
          (!fotoUrl || uploadedUrls.length === 0)
        ) {
          resolvedSubtipo = 'CANJE_SIN_TICKET';
        }

        const payload = {
          tipo_registro: tipoRegistro,
          producto_id: resolvedProducto?.id ?? null,
          producto_nombre: resolvedProducto?.nombre ?? null,
          material_catalogo_id: resolvedMaterial?.id ?? null,
          material_nombre: resolvedMaterial?.nombre ?? null,
          cantidad,
          monto,

          observaciones,
          subtipo_registro: resolvedSubtipo,
          foto_evidencia_url: fotoUrl,
          foto_evidencia_hash: fotoHash,
          fotos_evidencia: uploadedUrls, // Array estructurado para auditoría premium
        };

        inserts.push({
          link_id: link.id,
          cuenta_cliente_id: link.cuentaClienteId,
          pdv_id: pdv.id,
          empleado_id: empleado.id,
          fecha_operativa: fechaOperativa,
          tipo_registro: tipoRegistro,
          estatus: 'RECIBIDO',
          pdv_nombre_snapshot: pdv.nombre,
          empleado_nombre_snapshot: empleado.nombre,
          producto_id: resolvedProducto?.id ?? null,
          producto_nombre_snapshot: resolvedProducto?.nombre ?? null,
          material_catalogo_id: resolvedMaterial?.id ?? null,
          material_nombre_snapshot: resolvedMaterial?.nombre ?? null,
          cantidad,
          monto,

          observaciones,
          subtipo_registro: resolvedSubtipo,
          foto_evidencia_url: fotoUrl,
          foto_evidencia_hash: fotoHash,
          payload,
          metadata: {
            ...requestMetadata,
            link_slug: link.slug,
            link_nombre: link.nombre,
            cuenta_cliente_nombre: link.cuentaClienteNombre,
            captura_manual_pdv_dc: true,
            atribucion_manual_declarada: atribucionManual,
            atribucion_captura: atribucionCaptura,
            atribucion_operativa_resuelta_en_bd: true,
            lote_batch: true,
            lote_tamano: itemsRaw.length,
          },
        });
      }

      // Validar si este lote ya se registro recientemente
      const currentItems: ComparableItem[] = inserts.map((ins) => ({
        producto_id: ins.producto_id,
        material_catalogo_id: ins.material_catalogo_id,
        cantidad: ins.cantidad,
        subtipo_registro: ins.subtipo_registro,
        observaciones: ins.observaciones,
      }));

      if (recentRecords && checkDuplicateSubmission(currentItems, recentRecords)) {
        return {
          ok: true,
          message: `¡Listo! Se registraron exitosamente ${inserts.length} capturas en tu reporte del dia.`,
          registroId: 'DUPLICATE_OMITTED',
        };
      }

      const { data: createdBatch, error: errorBatch } = await service
        .from('captura_publica_registro')
        .insert(inserts)
        .select('id');

      if (errorBatch || !createdBatch || createdBatch.length === 0) {
        throw new Error(errorBatch?.message ?? 'No fue posible guardar el lote de registros.');
      }

      revalidateCapturaPublicaCache({
        cuentaClienteId: link.cuentaClienteId,
        empleadoId: empleado.id,
      });

      return {
        ok: true,
        message: `¡Listo! Se registraron exitosamente ${createdBatch.length} capturas en tu reporte del dia.`,
        registroId: String(createdBatch[0].id),
      };
    }

    const esVenta = tipoRegistro === 'VENTA';
    const esLove = tipoRegistro === 'LOVE_ISDIN';
    const productoId = normalizeText(formData.get('producto_id'));
    const materialId = normalizeText(formData.get('material_catalogo_id'));

    // Subtipo y cantidad para Love ISDIN
    const subtipo = normalizeText(formData.get('subtipo_registro'));
    const esVentaSinActividad =
      esVenta &&
      (subtipo === 'SIN_VENTAS' ||
        subtipo === 'VACACIONES' ||
        subtipo === 'INCAPACIDAD' ||
        subtipo === 'FALTA');
    const esLoveSinActividad =
      esLove &&
      (subtipo === 'SIN_REGISTROS' ||
        subtipo === 'VACACIONES' ||
        subtipo === 'INCAPACIDAD' ||
        subtipo === 'FALTA');

    const cantidad =
      esVentaSinActividad || esLoveSinActividad
        ? null
        : esLove
          ? (normalizePositiveInteger(formData.get('cantidad'), 'Cantidad') ?? 1)
          : normalizePositiveInteger(formData.get('cantidad'), 'Cantidad');

    const monto =
      esVenta || esLove ? null : normalizeNonNegativeNumber(formData.get('monto'), 'Monto');

    const observaciones = normalizeText(formData.get('observaciones'));

    if (
      (tipoRegistro === 'VENTA' || tipoRegistro === 'DESABASTO') &&
      !productoId &&
      !esVentaSinActividad
    ) {
      throw new Error('Selecciona el producto.');
    }

    if (tipoRegistro === 'CANJE' && !materialId) {
      throw new Error('Selecciona el material.');
    }

    if (tipoRegistro === 'LOVE_ISDIN' && !subtipo) {
      throw new Error('Selecciona el tipo de registro Love ISDIN.');
    }

    if (
      !esVentaSinActividad &&
      !esLoveSinActividad &&
      (tipoRegistro === 'VENTA' || tipoRegistro === 'CANJE' || tipoRegistro === 'LOVE_ISDIN') &&
      !cantidad
    ) {
      throw new Error('Indica la cantidad.');
    }

    const [producto, material] = await Promise.all([
      resolveProducto(service, productoId),
      resolveMaterial(service, link.cuentaClienteId, materialId),
    ]);

    // Cargar fotos de evidencia del fallback si vienen en el FormData
    let fotoUrl = null;
    let fotoHash = null;
    const fallbackFiles = formData.getAll('foto_evidencia');
    const uploadedUrls: string[] = [];
    const uploadedHashes: string[] = [];

    for (const file of fallbackFiles) {
      if (file && file instanceof File && file.size > 0) {
        const evidenceError = validatePreparedEvidenceFile(file);
        if (evidenceError) {
          throw new Error(evidenceError);
        }
        const stored = await storeOptimizedEvidence({
          service,
          bucket: 'operacion-evidencias',
          actorUsuarioId: empleado.usuarioId ?? null,
          storagePrefix: `captura-publica/${link.cuentaClienteId}/${empleadoId}`,
          file: file,
        });
        uploadedUrls.push(stored.archivo.url);
        uploadedHashes.push(stored.archivo.hash);
      }
    }

    if (uploadedUrls.length > 0) {
      fotoUrl = uploadedUrls.join(',');
      fotoHash = uploadedHashes.join(',');
    }

    const payload = {
      tipo_registro: tipoRegistro,
      producto_id: producto?.id ?? null,
      producto_nombre: producto?.nombre ?? null,
      material_catalogo_id: material?.id ?? null,
      material_nombre: material?.nombre ?? null,
      cantidad,
      monto,

      observaciones,
      subtipo_registro: subtipo,
      foto_evidencia_url: fotoUrl,
      foto_evidencia_hash: fotoHash,
      fotos_evidencia: uploadedUrls, // Array estructurado para auditoría premium
    };

    const currentItems: ComparableItem[] = [
      {
        producto_id: producto?.id ?? null,
        material_catalogo_id: material?.id ?? null,
        cantidad,
        subtipo_registro: subtipo,
        observaciones,
      },
    ];

    if (recentRecords && checkDuplicateSubmission(currentItems, recentRecords)) {
      return {
        ok: true,
        message: 'Registro recibido. Quedo listo para revision y reporte.',
        registroId: 'DUPLICATE_OMITTED',
      };
    }

    const { data: created, error } = await service
      .from('captura_publica_registro')
      .insert({
        link_id: link.id,
        cuenta_cliente_id: link.cuentaClienteId,
        pdv_id: pdv.id,
        empleado_id: empleado.id,
        fecha_operativa: fechaOperativa,
        tipo_registro: tipoRegistro,
        estatus: 'RECIBIDO',
        pdv_nombre_snapshot: pdv.nombre,
        empleado_nombre_snapshot: empleado.nombre,
        producto_id: producto?.id ?? null,
        producto_nombre_snapshot: producto?.nombre ?? null,
        material_catalogo_id: material?.id ?? null,
        material_nombre_snapshot: material?.nombre ?? null,
        cantidad,
        monto,

        observaciones,
        subtipo_registro: subtipo,
        foto_evidencia_url: fotoUrl,
        foto_evidencia_hash: fotoHash,
        payload,
        metadata: {
          ...requestMetadata,
          link_slug: link.slug,
          link_nombre: link.nombre,
          cuenta_cliente_nombre: link.cuentaClienteNombre,
          captura_manual_pdv_dc: true,
          atribucion_manual_declarada: atribucionManual,
          atribucion_captura: atribucionCaptura,
          atribucion_operativa_resuelta_en_bd: true,
        },
      })
      .select('id')
      .maybeSingle();

    if (error || !created?.id) {
      throw new Error(error?.message ?? INITIAL_ERROR);
    }

    revalidateCapturaPublicaCache({
      cuentaClienteId: link.cuentaClienteId,
      empleadoId: empleado.id,
    });

    return {
      ok: true,
      message: 'Registro recibido. Quedo listo para revision y reporte.',
      registroId: String(created.id),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : INITIAL_ERROR,
    };
  }
}

export async function obtenerStockMaterialesPdv(
  pdvId: string,
  cuentaClienteId: string
): Promise<{ [materialId: string]: number }> {
  try {
    const service = createServiceClient();

    // 1. Obtener la fecha de la última CARGA_INICIAL por material en el PDV
    const { data: cargas, error: errCargas } = await service
      .from('material_inventario_movimiento')
      .select('material_catalogo_id, created_at')
      .eq('pdv_id', pdvId)
      .eq('tipo_movimiento', 'CARGA_INICIAL')
      .eq('cuenta_cliente_id', cuentaClienteId);

    if (errCargas) {
      throw new Error(errCargas.message);
    }

    // Agrupar para obtener la fecha de carga inicial más reciente de cada material,
    // y también encontrar el corte global (fecha de carga inicial más reciente de TODO el PDV)
    let pdvCorteGlobal: string | null = null;
    const fechaCortePorMaterial = new Map<string, string>();
    for (const carga of cargas ?? []) {
      const cargaTimeStr = new Date(carga.created_at).toISOString();
      const actual = fechaCortePorMaterial.get(carga.material_catalogo_id);
      if (!actual || cargaTimeStr > actual) {
        fechaCortePorMaterial.set(carga.material_catalogo_id, cargaTimeStr);
      }
      if (!pdvCorteGlobal || cargaTimeStr > pdvCorteGlobal) {
        pdvCorteGlobal = cargaTimeStr;
      }
    }

    // 2. Obtener todos los movimientos del PDV
    const { data: movimientos, error: errMovs } = await service
      .from('material_inventario_movimiento')
      .select('material_catalogo_id, cantidad_delta, created_at')
      .eq('pdv_id', pdvId)
      .eq('cuenta_cliente_id', cuentaClienteId);

    if (errMovs) {
      throw new Error(errMovs.message);
    }

    // 3. Filtrar y sumar en memoria
    const stockMap: { [materialId: string]: number } = {};
    for (const mov of movimientos ?? []) {
      const movTimeStr = new Date(mov.created_at).toISOString();

      // Regla del reset de inventario global: Si el PDV tiene al menos una Carga Inicial (ej. Auditoría Junio),
      // se ignora por completo cualquier movimiento con fecha anterior a ese corte global.
      if (pdvCorteGlobal && movTimeStr < pdvCorteGlobal) {
        continue;
      }

      const fechaCorte = fechaCortePorMaterial.get(mov.material_catalogo_id);
      if (!fechaCorte || movTimeStr >= fechaCorte) {
        stockMap[mov.material_catalogo_id] =
          (stockMap[mov.material_catalogo_id] ?? 0) + (mov.cantidad_delta ?? 0);
      }
    }

    // Regla de inventario no negativo: si el stock neto cae por debajo de cero debido a entregas extemporáneas
    // o sin stock inicial cargado, se reporta como 0 (sin valores negativos) para no alarmar o confundir.
    for (const matId in stockMap) {
      stockMap[matId] = Math.max(0, stockMap[matId]);
    }

    return stockMap;
  } catch (err) {
    console.error('[obtenerStockMaterialesPdv] Error calculando stock:', err);
    return {};
  }
}
