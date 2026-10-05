import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { obtenerActorActual } from '@/lib/auth/session';
import {
  buildOperationalDocumentUploadLimitMessage,
  EXPEDIENTE_RAW_UPLOAD_MAX_BYTES,
  exceedsOperationalDocumentUploadLimit,
} from '@/lib/files/documentOptimization';
import { storeOptimizedEvidence } from '@/lib/files/evidenceStorage';
import { createServiceClient } from '@/lib/supabase/server';
import { publishUiChanges } from '@/lib/ui-change/server';
import { buildUiChangeScope, buildUiChangeTargetsFromBusinessEvent } from '@/lib/ui-change/types';
import {
  validateLastMileCorrection,
  validateLastMileDelivery,
  type LastMileValidationDetail,
} from '@/features/materiales/lib/materialLastMileValidation';

const MATERIALES_BUCKET = 'operacion-evidencias';
const MATERIALES_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>;

interface PayloadEvidenceMeta {
  capturedAt?: string;
  fileName?: string;
  evidenceRole?: string;
}

interface StoredLastMileEvidence {
  tipo: 'ENTREGA_FISICA' | 'ACUSE_FIRMADO';
  archivo_hash_id: string | null;
  bucket: string | null;
  ruta_archivo: string | null;
  thumbnail_url: string | null;
  capturada_en: string;
  latitud: number | null;
  longitud: number | null;
  gps_accuracy_metros: number | null;
  orden: number;
  metadata: Record<string, unknown>;
}

interface ExistingLastMileDelivery {
  id: string;
  cuenta_cliente_id: string;
  distribucion_id: string;
  pdv_id: string;
  supervisor_empleado_id: string;
  dermoconsejero_empleado_id: string | null;
}

interface ExistingLastMileEvidence {
  id: string;
  tipo: 'ENTREGA_FISICA' | 'ACUSE_FIRMADO';
}

function parsePayload(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    throw new Error('El payload de entrega de ultima milla es obligatorio.');
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('El payload de entrega de ultima milla no es valido.');
  }

  return parsed as Record<string, unknown>;
}

function asString(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asEvidenceMeta(value: unknown): PayloadEvidenceMeta {
  return asObject(value) as PayloadEvidenceMeta;
}

function asUploadedFile(value: FormDataEntryValue | null) {
  if (!value || typeof value === 'string' || !(value instanceof File) || value.size === 0) {
    return null;
  }

  return value;
}

function isCorrectionMode(payload: Record<string, unknown>) {
  return (
    asString(payload.modo) === 'CORRECCION' || Boolean(asString(payload.correccion_entrega_id))
  );
}

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7) + '-01';
}

async function ensureBucket(service: TypedSupabaseClient) {
  const { error } = await service.storage.createBucket(MATERIALES_BUCKET, {
    public: false,
    fileSizeLimit: `${EXPEDIENTE_RAW_UPLOAD_MAX_BYTES}`,
    allowedMimeTypes: MATERIALES_ALLOWED_MIME_TYPES,
  });

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error;
  }
}

function splitStorageUrl(value: string) {
  const [bucket, ...routeParts] = value.split('/');
  return {
    bucket: bucket || null,
    route: routeParts.join('/') || null,
  };
}

async function resolveArchivoHashId(service: TypedSupabaseClient, sha256: string) {
  const { data, error } = await service
    .from('archivo_hash')
    .select('id')
    .eq('sha256', sha256)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as { id?: string } | null)?.id ?? null;
}

async function storeLastMileEvidence(
  service: TypedSupabaseClient,
  input: {
    file: File;
    actorUsuarioId: string;
    cuentaClienteId: string;
    empleadoId: string;
    offlineClientId: string;
    tipo: 'ENTREGA_FISICA' | 'ACUSE_FIRMADO';
    orden: number;
    meta: PayloadEvidenceMeta;
    latitud: number | null;
    longitud: number | null;
    gpsAccuracyMetros: number | null;
  }
): Promise<StoredLastMileEvidence> {
  if (exceedsOperationalDocumentUploadLimit(input.file)) {
    throw new Error(buildOperationalDocumentUploadLimitMessage('evidencia', input.file));
  }

  const stored = await storeOptimizedEvidence({
    service,
    bucket: MATERIALES_BUCKET,
    actorUsuarioId: input.actorUsuarioId,
    storagePrefix: `materiales/ultima-milla/${input.cuentaClienteId}/${input.empleadoId}/${input.offlineClientId}`,
    file: input.file,
  });
  const archivoRoute = splitStorageUrl(stored.archivo.url);
  const archivoHashId = await resolveArchivoHashId(service, stored.archivo.hash);

  return {
    tipo: input.tipo,
    archivo_hash_id: archivoHashId,
    bucket: archivoRoute.bucket,
    ruta_archivo: archivoRoute.route,
    thumbnail_url: stored.miniatura?.url ?? null,
    capturada_en:
      input.meta.capturedAt && !Number.isNaN(Date.parse(input.meta.capturedAt))
        ? new Date(input.meta.capturedAt).toISOString()
        : new Date().toISOString(),
    latitud: input.latitud,
    longitud: input.longitud,
    gps_accuracy_metros: input.gpsAccuracyMetros,
    orden: input.orden,
    metadata: {
      archivo_url: stored.archivo.url,
      archivo_hash: stored.archivo.hash,
      archivo_nombre: input.meta.fileName ?? input.file.name,
      evidencia_rol: input.meta.evidenceRole ?? null,
      miniatura_hash: stored.miniatura?.hash ?? null,
      optimizado_bytes: stored.optimization.optimizedBytes,
      deduplicado: stored.deduplicated,
    },
  };
}

export async function POST(request: Request) {
  const actor = await obtenerActorActual();

  if (!actor || actor.estadoCuenta !== 'ACTIVA') {
    return NextResponse.json(
      { error: 'La sesion activa no es valida para sincronizar materiales.' },
      { status: 401 }
    );
  }

  if (!['SUPERVISOR', 'ADMINISTRADOR', 'LOGISTICA', 'COORDINADOR'].includes(actor.puesto)) {
    return NextResponse.json(
      { error: 'No tienes permiso para sincronizar entregas de ultima milla.' },
      { status: 403 }
    );
  }

  const service = createServiceClient() as TypedSupabaseClient;

  try {
    const formData = await request.formData();
    const payload = parsePayload(formData.get('payload'));
    const cuentaClienteId = asString(payload.cuenta_cliente_id) ?? actor.cuentaClienteId;
    const supervisorEmpleadoId = asString(payload.supervisor_empleado_id) ?? actor.empleadoId;
    const offlineClientId =
      asString(payload.offline_client_id) ||
      `offline_auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    payload.offline_client_id = offlineClientId;

    const correctionMode = isCorrectionMode(payload);
    const correctionDeliveryId = asString(payload.correccion_entrega_id);
    const correctionClientId = asString(payload.correccion_client_id) ?? offlineClientId;

    const rawEntregaFisica =
      asUploadedFile(formData.get('evidencia_entrega_fisica_file')) ||
      asUploadedFile(formData.get('evidencia_1')) ||
      asUploadedFile(formData.get('evidencia_0'));

    const rawAcuseList = formData
      .getAll('acuse_firmado_files')
      .map(asUploadedFile)
      .filter((file): file is File => Boolean(file));

    if (rawAcuseList.length === 0) {
      const fallbackAcuse = asUploadedFile(formData.get('evidencia_0'));
      if (fallbackAcuse) rawAcuseList.push(fallbackAcuse);
    }

    const entregaFisicaFile = rawEntregaFisica;
    const acuseFiles = rawAcuseList;

    if (!cuentaClienteId) {
      throw new Error('La cuenta cliente es obligatoria para sincronizar la entrega.');
    }
    if (correctionMode && !correctionDeliveryId) {
      throw new Error('La entrega a corregir es obligatoria.');
    }
    if (!correctionMode && !entregaFisicaFile) {
      throw new Error('La evidencia de entrega fisica es obligatoria.');
    }
    // Resolve virtual/draft distributions or PDV IDs on-the-fly
    let distribucionId = asString(payload.distribucion_id);
    const payloadMetadata = asObject(payload.metadata);
    const pdvId = asString(payload.pdv_id);

    // Verify if distribucionId is actually a valid material_distribucion_mensual record
    let isRealDistribution = false;
    if (distribucionId && distribucionId !== 'virtual') {
      const { data: checkDist } = await service
        .from('material_distribucion_mensual')
        .select('id')
        .eq('id', distribucionId)
        .maybeSingle();
      if (checkDist) {
        isRealDistribution = true;
      }
    }

    const isVirtual = !isRealDistribution;

    if (!correctionMode && isVirtual) {
      const mesOperacion =
        asString(payloadMetadata.mes_operacion) ||
        asString(payload.mes_operacion) ||
        getCurrentMonth();
      const tipoDispersion = asString(payloadMetadata.tipo_dispersion) || 'MENSUAL';

      if (!pdvId) {
        throw new Error('El punto de venta es obligatorio para la entrega.');
      }

      // 1. Check if a distribution already exists
      const { data: existingDist, error: distError } = await service
        .from('material_distribucion_mensual')
        .select('id')
        .eq('cuenta_cliente_id', cuentaClienteId)
        .eq('pdv_id', pdvId)
        .eq('mes_operacion', mesOperacion)
        .maybeSingle();

      if (distError) {
        throw new Error('Error al buscar distribución: ' + distError.message);
      }

      if (existingDist) {
        distribucionId = existingDist.id;
      } else {
        // Fetch pdv info for snapshot fields
        const { data: pdvInfo, error: pdvError } = await service
          .from('pdv')
          .select('nombre, clave_btl, zona, id_cadena, cadena:cadena_id(nombre)')
          .eq('id', pdvId)
          .maybeSingle();

        if (pdvError || !pdvInfo) {
          throw new Error('Error al obtener datos del PDV: ' + (pdvError?.message || 'No encontrado'));
        }

        const pdvChain = Array.isArray(pdvInfo.cadena) ? pdvInfo.cadena[0] : pdvInfo.cadena;
        const cadenaName = pdvChain?.nombre ?? null;

        // Insert new distribution
        const { data: newDist, error: insertDistError } = await service
          .from('material_distribucion_mensual')
          .insert({
            cuenta_cliente_id: cuentaClienteId,
            pdv_id: pdvId,
            supervisor_empleado_id: supervisorEmpleadoId,
            mes_operacion: mesOperacion,
            tipo_dispersion: tipoDispersion,
            estado: 'PENDIENTE_RECEPCION',
            sucursal_snapshot: pdvInfo.nombre,
            cadena_snapshot: cadenaName,
            id_pdv_cadena_snapshot: pdvInfo.id_cadena,
            territorio_snapshot: pdvInfo.zona,
            hoja_origen: 'VIRTUAL',
            metadata: {
              creado_al_vuelo: true,
              creado_en: new Date().toISOString(),
            },
          })
          .select('id')
          .single();

        if (insertDistError || !newDist) {
          throw new Error('Error al crear distribución al vuelo: ' + insertDistError?.message);
        }

        distribucionId = newDist.id;
      }

      // Update payload
      payload.distribucion_id = distribucionId;
    }

    // Map/expand payload.detalles dynamically based on database details
    if (distribucionId) {
      const frontendDetail = Array.isArray(payload.detalles) ? payload.detalles[0] : null;
      const isCompleto = frontendDetail?.estado_item !== 'CON_DISCREPANCIA';
      const observaciones = frontendDetail?.observaciones || null;

      if (correctionMode) {
        // Query existing delivery details
        const { data: currentDetails, error: currentDetailsError } = await service
          .from('material_entrega_ultima_milla_detalle')
          .select('id, distribucion_detalle_id, material_catalogo_id, cantidad_teorica')
          .eq('entrega_id', correctionDeliveryId);

        if (currentDetailsError) {
          throw new Error('Error al buscar detalles de la entrega a corregir: ' + currentDetailsError.message);
        }

        if (currentDetails && currentDetails.length > 0) {
          payload.detalles = currentDetails.map((dbDetail) => ({
            distribucion_detalle_id: dbDetail.distribucion_detalle_id,
            material_catalogo_id: dbDetail.material_catalogo_id,
            cantidad_teorica: dbDetail.cantidad_teorica,
            estado_item: isCompleto ? 'COMPLETO' : 'CON_DISCREPANCIA',
            cantidad_real_recibida: isCompleto ? dbDetail.cantidad_teorica : 0,
            observaciones: observaciones,
          }));
        }
      } else {
        // Query distribution details
        const { data: dbDetails, error: detailsError } = await service
          .from('material_distribucion_detalle')
          .select('id, material_catalogo_id, cantidad_enviada, material_nombre_snapshot, material_tipo_mes')
          .eq('distribucion_id', distribucionId);

        if (detailsError) {
          throw new Error('Error al buscar detalles de la distribución: ' + detailsError.message);
        }

        let finalDetails = dbDetails || [];
        if (finalDetails.length === 0) {
          // Fetch a default active material
          const { data: catalogMaterial, error: materialError } = await service
            .from('material_catalogo')
            .select('id, nombre, tipo')
            .eq('cuenta_cliente_id', cuentaClienteId)
            .eq('activo', true)
            .limit(1);

          if (materialError) {
            throw new Error('Error al buscar material de catálogo: ' + materialError.message);
          }

          const material = Array.isArray(catalogMaterial) ? catalogMaterial[0] : catalogMaterial;
          if (!material) {
            throw new Error('No se encontró ningún material activo en el catálogo de esta cuenta.');
          }

          const { data: newDetail, error: insertDetailError } = await service
            .from('material_distribucion_detalle')
            .insert({
              distribucion_id: distribucionId,
              material_catalogo_id: material.id,
              cantidad_enviada: 1,
              cantidad_recibida: 0,
              cantidad_entregada: 0,
              cantidad_observada: 0,
              material_nombre_snapshot: material.nombre,
              material_tipo_mes: material.tipo,
              requiere_ticket_mes: false,
              requiere_evidencia_entrega_mes: true,
              requiere_evidencia_mercadeo: false,
              es_regalo_dc: false,
              excluir_de_registrar_entrega: false,
              metadata: {
                creado_al_vuelo: true,
              },
            })
            .select('id, material_catalogo_id, cantidad_enviada, material_nombre_snapshot, material_tipo_mes')
            .single();

          if (insertDetailError || !newDetail) {
            throw new Error('Error al crear detalle genérico: ' + insertDetailError?.message);
          }

          finalDetails = [newDetail];
        }

        payload.detalles = finalDetails.map((dbDetail) => ({
          distribucion_detalle_id: dbDetail.id,
          material_catalogo_id: dbDetail.material_catalogo_id,
          cantidad_teorica: dbDetail.cantidad_enviada,
          estado_item: isCompleto ? 'COMPLETO' : 'CON_DISCREPANCIA',
          cantidad_real_recibida: isCompleto ? dbDetail.cantidad_enviada : 0,
          observaciones: observaciones,
        }));
      }
    }

    const payloadModoEntrega =
      asString(payloadMetadata.modo_entrega) === 'POR_CUBRIR' ? 'POR_CUBRIR' : 'ENTREGA_DC';
    const receptorOrigen = asString(payloadMetadata.receptor_origen);
    if (!correctionMode && payloadModoEntrega !== 'POR_CUBRIR' && receptorOrigen !== 'TODOS' && acuseFiles.length === 0) {
      throw new Error('Al menos un acuse firmado es obligatorio.');
    }

    const detalles = Array.isArray(payload.detalles)
      ? (payload.detalles as LastMileValidationDetail[])
      : [];
    const metadata = payloadMetadata;
    const modoEntrega = payloadModoEntrega;

    let existingDelivery: ExistingLastMileDelivery | null = null;
    let existingEvidenceRows: ExistingLastMileEvidence[] = [];

    if (correctionMode) {
      const { data: existingDeliveryRaw, error: existingDeliveryError } = await service
        .from('material_entrega_ultima_milla')
        .select(
          'id, cuenta_cliente_id, distribucion_id, pdv_id, supervisor_empleado_id, dermoconsejero_empleado_id'
        )
        .eq('id', correctionDeliveryId)
        .maybeSingle();

      if (existingDeliveryError) {
        throw new Error(existingDeliveryError.message);
      }

      existingDelivery = (existingDeliveryRaw as ExistingLastMileDelivery | null) ?? null;
      if (!existingDelivery) {
        throw new Error('No existe la entrega de ultima milla que quieres corregir.');
      }

      if (
        actor.puesto === 'SUPERVISOR' &&
        existingDelivery.supervisor_empleado_id !== actor.empleadoId
      ) {
        return NextResponse.json(
          { error: 'Solo puedes corregir entregas registradas por tu usuario supervisor.' },
          { status: 403 }
        );
      }

      if (actor.cuentaClienteId && existingDelivery.cuenta_cliente_id !== actor.cuentaClienteId) {
        return NextResponse.json(
          { error: 'La entrega pertenece a otra cuenta cliente.' },
          { status: 403 }
        );
      }

      const { data: existingEvidenceRaw, error: existingEvidenceError } = await service
        .from('material_entrega_ultima_milla_evidencia')
        .select('id, tipo')
        .eq('entrega_id', existingDelivery.id);

      if (existingEvidenceError) {
        throw new Error(existingEvidenceError.message);
      }

      existingEvidenceRows = (existingEvidenceRaw ?? []) as ExistingLastMileEvidence[];
      validateLastMileCorrection({
        detalles,
        hasEffectiveEntregaFisica:
          Boolean(entregaFisicaFile) ||
          existingEvidenceRows.some((item) => item.tipo === 'ENTREGA_FISICA'),
        effectiveAcuseCount:
          acuseFiles.length > 0
            ? acuseFiles.length
            : existingEvidenceRows.filter((item) => item.tipo === 'ACUSE_FIRMADO').length,
        modoEntrega,
        receptorOrigen,
      });
    } else {
      validateLastMileDelivery({
        detalles,
        hasEntregaFisica: Boolean(entregaFisicaFile),
        acuseCount: acuseFiles.length,
        modoEntrega,
        receptorOrigen,
      });
    }

    await ensureBucket(service);

    const latitud = asNumber(payload.latitud);
    const longitud = asNumber(payload.longitud);
    const gpsAccuracyMetros = asNumber(payload.gps_accuracy_metros);
    const entregaFisicaMeta = asEvidenceMeta(payload.evidencia_entrega_fisica);
    const acuseMetas = Array.isArray(payload.evidencias_acuse_firmado)
      ? payload.evidencias_acuse_firmado.map(asEvidenceMeta)
      : [];

    const evidencias = [
      ...(entregaFisicaFile
        ? [
            await storeLastMileEvidence(service, {
              file: entregaFisicaFile,
              actorUsuarioId: actor.usuarioId,
              cuentaClienteId,
              empleadoId: actor.empleadoId,
              offlineClientId,
              tipo: 'ENTREGA_FISICA',
              orden: 1,
              meta: entregaFisicaMeta,
              latitud,
              longitud,
              gpsAccuracyMetros,
            }),
          ]
        : []),
      ...(await Promise.all(
        acuseFiles.map((file, index) =>
          storeLastMileEvidence(service, {
            file,
            actorUsuarioId: actor.usuarioId,
            cuentaClienteId,
            empleadoId: actor.empleadoId,
            offlineClientId,
            tipo: 'ACUSE_FIRMADO',
            orden: index + 1,
            meta: acuseMetas[index] ?? {},
            latitud,
            longitud,
            gpsAccuracyMetros,
          })
        )
      )),
    ];

    const rpcPayload = {
      ...payload,
      cuenta_cliente_id: existingDelivery?.cuenta_cliente_id ?? cuentaClienteId,
      distribucion_id: existingDelivery?.distribucion_id ?? payload.distribucion_id,
      pdv_id: existingDelivery?.pdv_id ?? payload.pdv_id,
      supervisor_empleado_id: existingDelivery?.supervisor_empleado_id ?? supervisorEmpleadoId,
      dermoconsejero_empleado_id:
        payload.dermoconsejero_empleado_id ?? existingDelivery?.dermoconsejero_empleado_id,
      entrega_id: correctionDeliveryId,
      correccion_client_id: correctionClientId,
      reemplazar_evidencia_entrega: Boolean(entregaFisicaFile),
      reemplazar_acuses: acuseFiles.length > 0,
      evidencias,
      metadata: {
        ...metadata,
        sincronizado_desde: 'api_materiales_ultima_milla_sync',
        sincronizado_por_usuario_id: actor.usuarioId,
      },
    };

    const rpcName = correctionMode
      ? 'rpc_corregir_entrega_ultima_milla'
      : 'rpc_registrar_entrega_ultima_milla';
    const { data: rpcResult, error: rpcError } = await service.rpc(rpcName, {
      p_datos: rpcPayload,
    });

    if (rpcError || !rpcResult?.ok) {
      throw new Error(rpcError?.message ?? 'No fue posible consolidar la entrega de ultima milla.');
    }

    await publishUiChanges(
      buildUiChangeTargetsFromBusinessEvent({
        eventType: correctionMode
          ? 'material_ultima_milla_corregida'
          : 'material_ultima_milla_sincronizada',
        modules: ['materiales', 'dashboard', 'reportes'],
        surfaces: ['panel', 'insights'],
        scopes: [
          buildUiChangeScope('global'),
          buildUiChangeScope('cuenta', cuentaClienteId),
          buildUiChangeScope('empleado', actor.empleadoId),
          buildUiChangeScope('supervisor', supervisorEmpleadoId),
          buildUiChangeScope('pdv', asString(payload.pdv_id)),
          buildUiChangeScope('periodo', getCurrentMonth()),
        ],
        cuentaClienteId,
        empleadoId: actor.empleadoId,
        supervisorEmpleadoId,
        roleTargets: ['ADMINISTRADOR', 'LOGISTICA', 'COORDINADOR', 'SUPERVISOR', 'DERMOCONSEJERO'],
        metadata: {
          periodo: getCurrentMonth(),
          pdv_id: asString(payload.pdv_id),
          distribucion_id: asString(payload.distribucion_id),
          entrega_id: rpcResult.id,
          estado: rpcResult.estado ?? null,
          modo: correctionMode ? 'CORRECCION' : 'ALTA',
        },
      }),
      { service }
    );

    return NextResponse.json({
      ok: true,
      id: rpcResult.id,
      inserted: rpcResult.inserted,
      estado: rpcResult.estado ?? null,
    });
  } catch (error) {
    const errorMsg =
      error instanceof Error
        ? error.message
        : 'No fue posible sincronizar la entrega de ultima milla.';
    console.error('Error en /api/materiales/ultima-milla/sync:', error);
    return NextResponse.json(
      {
        ok: false,
        message: errorMsg,
        error: errorMsg,
      },
      { status: 400 }
    );
  }
}
