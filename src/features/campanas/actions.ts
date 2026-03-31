'use server'

import { revalidatePath } from 'next/cache'
import { requerirActorActivo } from '@/lib/auth/session'
import {
  buildOperationalDocumentUploadLimitMessage,
  EXPEDIENTE_RAW_UPLOAD_MAX_BYTES,
  exceedsOperationalDocumentUploadLimit,
} from '@/lib/files/documentOptimization'
import { storeOptimizedEvidence } from '@/lib/files/evidenceStorage'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizeRequestedAccountId, readRequestAccountScope } from '@/lib/tenant/accountScope'
import {
  ESTADO_CAMPANA_ADMIN_INICIAL,
  type CampanaAdminActionState,
} from './state'
import {
  buildCampaignProgress,
  createCampaignEvidenceRequirement,
  createVisitTaskTemplateItem,
  dedupeStringArray,
  ensureVisitTaskSession,
  getResolvedVisitTaskLabels,
  getVisitTaskExecutionMinutes,
  mergeCampaignEvidenceEntries,
  normalizeLineList,
  readCampaignEvidenceTemplate,
  readCampaignManualDocument,
  readCampaignTaskVariability,
  readCampaignEvidenceEntries,
  readVisitTaskTemplate,
  readVisitTaskExecutionMinutesMap,
  rangesOverlapIso,
  serializeCampaignEvidenceTemplate,
  serializeCampaignProductGoals,
  serializeVisitTaskTemplate,
  serializeVisitTaskExecutionMinutesMap,
  serializeVisitTaskSessions,
  updateVisitTaskSession,
  visitTaskRequiresPhoto,
  type CampaignEvidenceKind,
  type CampaignGoalType,
  type VisitTaskKind,
  type VisitTaskStatus,
} from './lib/campaignProgress'
import { parseCampaignProductQuotaWorkbook } from './lib/campaignProductQuotaImport'

const CAMPANA_EVIDENCIAS_BUCKET = 'operacion-evidencias'
const CAMPANA_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

function buildState(partial: Partial<CampanaAdminActionState>): CampanaAdminActionState {
  return {
    ...ESTADO_CAMPANA_ADMIN_INICIAL,
    ...partial,
  }
}

function normalizeOptionalText(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeRequiredText(value: FormDataEntryValue | null, label: string) {
  const normalized = String(value ?? '').trim()

  if (!normalized) {
    throw new Error(`${label} es obligatorio.`)
  }

  return normalized
}

function normalizeDate(value: FormDataEntryValue | null, label: string) {
  const normalized = normalizeRequiredText(value, label)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${label} debe tener formato YYYY-MM-DD.`)
  }

  return normalized
}

function normalizeNonNegativeNumber(value: FormDataEntryValue | null, label: string) {
  const parsed = Number(String(value ?? '').trim())

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} debe ser cero o mayor.`)
  }

  return Number(parsed.toFixed(2))
}

function normalizeNonNegativeInteger(value: FormDataEntryValue | null, label: string) {
  const parsed = Number(String(value ?? '').trim())

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} debe ser entero positivo.`)
  }

  return parsed
}

function normalizeEstado(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()

  if (!['BORRADOR', 'ACTIVA', 'CERRADA', 'CANCELADA'].includes(normalized)) {
    throw new Error('El estado de campana no es valido.')
  }

  return normalized as 'BORRADOR' | 'ACTIVA' | 'CERRADA' | 'CANCELADA'
}

function getSelectedValues(formData: FormData, key: string) {
  return dedupeStringArray(
    formData
      .getAll(key)
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
  )
}

function getUploadedFiles(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((item): item is File => item instanceof File && item.size > 0)
}

function getTaskTemplateItems(formData: FormData) {
  const labels = formData
    .getAll('task_template_label')
    .map((value) => String(value ?? '').trim())
  const kinds = formData
    .getAll('task_template_kind')
    .map((value) => String(value ?? '').trim() as VisitTaskKind)

  const structured = labels
    .map((label, index) => {
      if (!label) {
        return null
      }

      return createVisitTaskTemplateItem(label, kinds[index] ?? 'OTRA')
    })
    .filter((item): item is ReturnType<typeof createVisitTaskTemplateItem> => item !== null)

  if (structured.length > 0) {
    return structured
  }

  return normalizeLineList(String(formData.get('tareas_template') ?? '')).map((label) =>
    createVisitTaskTemplateItem(label)
  )
}

function getEvidenceTemplateItems(formData: FormData) {
  const labels = formData
    .getAll('evidence_template_label')
    .map((value) => String(value ?? '').trim())
  const kinds = formData
    .getAll('evidence_template_kind')
    .map((value) => String(value ?? '').trim() as CampaignEvidenceKind)

  const structured = labels
    .map((label, index) => {
      if (!label) {
        return null
      }

      return createCampaignEvidenceRequirement(label, kinds[index] ?? 'OTRA')
    })
    .filter((item): item is ReturnType<typeof createCampaignEvidenceRequirement> => item !== null)

  if (structured.length > 0) {
    return structured
  }

  return normalizeLineList(String(formData.get('evidencias_requeridas') ?? '')).map((label) =>
    createCampaignEvidenceRequirement(label)
  )
}

function getProductGoalItems(formData: FormData) {
  const productIds = formData
    .getAll('product_goal_product_id')
    .map((value) => String(value ?? '').trim())
  const quotas = formData
    .getAll('product_goal_quota')
    .map((value) => Number(String(value ?? '').trim()))
  const goalTypes = formData
    .getAll('product_goal_type')
    .map((value) => String(value ?? '').trim() as CampaignGoalType)
  const notes = formData
    .getAll('product_goal_notes')
    .map((value) => String(value ?? '').trim())

  return productIds
    .map((productId, index) => {
      if (!productId) {
        return null
      }

      const quota = quotas[index]
      if (!Number.isFinite(quota) || quota < 0) {
        throw new Error('Cada meta por producto debe tener una cuota valida igual o mayor a cero.')
      }

      return {
        productId,
        quota: Number(quota.toFixed(2)),
        goalType: goalTypes[index] === 'EXHIBICION' ? 'EXHIBICION' : 'VENTA',
        notes: notes[index] ? notes[index] : null,
      }
    })
    .filter((item): item is { productId: string; quota: number; goalType: CampaignGoalType; notes: string | null } => item !== null)
}

function normalizeLookupText(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

type ResolvedImportedCampaignGoal = {
  rowNumber: number
  pdvId: string
  productId: string
  quota: number
  goalType: CampaignGoalType
  notes: string | null
}

function summarizeImportedCampaignGoals(
  rows: ResolvedImportedCampaignGoal[]
): Array<{ productId: string; quota: number; goalType: CampaignGoalType; notes: string | null }> {
  const grouped = new Map<string, { productId: string; quota: number; goalType: CampaignGoalType; notes: string | null }>()

  for (const row of rows) {
    const key = `${row.productId}:${row.goalType}`
    const current = grouped.get(key)
    if (current) {
      current.quota = Number((current.quota + row.quota).toFixed(2))
      current.notes = current.notes ?? row.notes
    } else {
      grouped.set(key, {
        productId: row.productId,
        quota: row.quota,
        goalType: row.goalType,
        notes: row.notes,
      })
    }
  }

  return Array.from(grouped.values())
}

function normalizeMetadataRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, unknown>
  }

  return value as Record<string, unknown>
}

function getTaskSessionUpdates(formData: FormData): Array<{
  key: string
  status: VisitTaskStatus
  justification: string | null
  suspicious?: boolean
  suspiciousReason?: string | null
  evidenceCountIncrement?: number
}> {
  const keys = formData
    .getAll('task_key')
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)

  return keys.map((key) => {
    const rawStatus = String(formData.get(`task_status__${key}`) ?? 'PENDIENTE').trim()
    const status: VisitTaskStatus =
      rawStatus === 'COMPLETADA' || rawStatus === 'JUSTIFICADA' ? rawStatus : 'PENDIENTE'

    return {
      key,
      status,
      justification: String(formData.get(`task_justification__${key}`) ?? '').trim() || null,
    }
  })
}

function normalizeJsonRecord(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim()

  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }

    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function calculateDistanceMeters(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number
) {
  const earthRadius = 6371000
  const toRadians = (value: number) => (value * Math.PI) / 180
  const deltaLat = toRadians(destinationLat - originLat)
  const deltaLng = toRadians(destinationLng - originLng)
  const originLatRad = toRadians(originLat)
  const destinationLatRad = toRadians(destinationLat)

  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2) * Math.cos(originLatRad) * Math.cos(destinationLatRad)

  return 2 * earthRadius * Math.asin(Math.sqrt(haversine))
}

function getTaskEvidencePayloads(formData: FormData) {
  const taskKeys = formData
    .getAll('task_key')
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)

  return taskKeys.flatMap((taskKey) => {
    const file = formData.get(`task_evidence__${taskKey}`)
    if (!(file instanceof File) || file.size === 0) {
      return []
    }

    return [
      {
        taskKey,
        file,
        metadata: normalizeJsonRecord(formData.get(`task_evidence_meta__${taskKey}`)),
      },
    ]
  })
}

async function requerirGestorCampanas() {
  const actor = await requerirActorActivo()

  if (actor.puesto !== 'ADMINISTRADOR' && actor.puesto !== 'VENTAS') {
    throw new Error('Solo ADMINISTRADOR o VENTAS pueden gestionar campanas.')
  }

  return actor
}

async function requerirDermoconsejeroCampana() {
  const actor = await requerirActorActivo()

  if (actor.puesto !== 'DERMOCONSEJERO') {
    throw new Error('Solo DERMOCONSEJERO puede ejecutar tareas de visita en campo.')
  }

  return actor
}

async function resolveCuentaClienteId(
  actor: Awaited<ReturnType<typeof requerirGestorCampanas>>,
  service: ReturnType<typeof createServiceClient>,
  formData: FormData
) {
  const requestedAccountId = normalizeRequestedAccountId(formData.get('cuenta_cliente_id'))
  const requestScope = await readRequestAccountScope()
  const targetAccountId =
    actor.puesto === 'ADMINISTRADOR'
      ? requestedAccountId ?? requestScope.accountId
      : actor.cuentaClienteId ?? requestScope.accountId

  if (!targetAccountId) {
    throw new Error('Selecciona una cuenta cliente activa para la campana.')
  }

  const { data: cuentaCliente, error } = await service
    .from('cuenta_cliente')
    .select('id, nombre, activa')
    .eq('id', targetAccountId)
    .maybeSingle()

  if (error || !cuentaCliente || !cuentaCliente.activa) {
    throw new Error(error?.message ?? 'La cuenta cliente seleccionada no esta activa.')
  }

  if (actor.cuentaClienteId && actor.cuentaClienteId !== targetAccountId) {
    throw new Error('La campana solo puede operarse dentro de la cuenta cliente asignada.')
  }

  return cuentaCliente
}

async function registrarEventoAudit(
  service: ReturnType<typeof createServiceClient>,
  {
    actorUsuarioId,
    cuentaClienteId,
    tabla,
    registroId,
    payload,
  }: {
    actorUsuarioId: string
    cuentaClienteId: string
    tabla: string
    registroId: string
    payload: Record<string, unknown>
  }
) {
  await service.from('audit_log').insert({
    tabla,
    registro_id: registroId,
    accion: 'EVENTO',
    payload,
    usuario_id: actorUsuarioId,
    cuenta_cliente_id: cuentaClienteId,
  })
}

async function ensureCampaignEvidenceBucket(service: ReturnType<typeof createServiceClient>) {
  const { error } = await service.storage.createBucket(CAMPANA_EVIDENCIAS_BUCKET, {
    public: false,
    fileSizeLimit: `${EXPEDIENTE_RAW_UPLOAD_MAX_BYTES}`,
    allowedMimeTypes: CAMPANA_ALLOWED_MIME_TYPES,
  })

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error
  }
}

async function uploadCampaignEvidence(
  service: ReturnType<typeof createServiceClient>,
  {
    actorUsuarioId,
    cuentaClienteId,
    campanaPdvId,
    file,
  }: {
    actorUsuarioId: string
    cuentaClienteId: string
    campanaPdvId: string
    file: File
  }
) {
  if (exceedsOperationalDocumentUploadLimit(file)) {
    throw new Error(buildOperationalDocumentUploadLimitMessage('evidencia', file))
  }

  if (!CAMPANA_ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error('La evidencia debe ser imagen JPEG/PNG/WEBP o PDF.')
  }

  await ensureCampaignEvidenceBucket(service)
  return storeOptimizedEvidence({
    service,
    bucket: CAMPANA_EVIDENCIAS_BUCKET,
    actorUsuarioId,
    storagePrefix: `campanas/${cuentaClienteId}/${campanaPdvId}`,
    file,
  })
}

async function uploadCampaignManual(
  service: ReturnType<typeof createServiceClient>,
  {
    actorUsuarioId,
    cuentaClienteId,
    campanaId,
    file,
  }: {
    actorUsuarioId: string
    cuentaClienteId: string
    campanaId: string
    file: File
  }
) {
  if (file.type !== 'application/pdf') {
    throw new Error('El manual de mercadeo debe cargarse en PDF.')
  }

  const stored = await storeOptimizedEvidence({
    service,
    bucket: CAMPANA_EVIDENCIAS_BUCKET,
    actorUsuarioId,
    storagePrefix: `campanas/${cuentaClienteId}/${campanaId}/manual`,
    file,
  })

  return {
    url: stored.archivo.url,
    hash: stored.archivo.hash,
    fileName: file.name,
    mimeType: file.type || 'application/pdf',
    uploadedAt: new Date().toISOString(),
    uploadedBy: actorUsuarioId,
  }
}

async function notifySuspiciousVisitTask(
  service: ReturnType<typeof createServiceClient>,
  {
    cuentaClienteId,
    actorUsuarioId,
    actorEmpleadoId,
    supervisorEmpleadoId,
    campanaId,
    campanaPdvId,
    pdvId,
    taskLabel,
    suspiciousReason,
  }: {
    cuentaClienteId: string
    actorUsuarioId: string
    actorEmpleadoId: string
    supervisorEmpleadoId: string
    campanaId: string
    campanaPdvId: string
    pdvId: string
    taskLabel: string
    suspiciousReason: string
  }
) {
  const { data: createdMessage, error: messageError } = await service
    .from('mensaje_interno')
    .insert({
      cuenta_cliente_id: cuentaClienteId,
      creado_por_usuario_id: actorUsuarioId,
      titulo: 'Evidencia sospechosa en tarea de visita',
      cuerpo: `Se detectó evidencia sospechosa en la tarea "${taskLabel}" del PDV ${pdvId}. Motivo: ${suspiciousReason}`,
      tipo: 'MENSAJE',
      grupo_destino: 'SUPERVISOR',
      supervisor_empleado_id: supervisorEmpleadoId,
      opciones_respuesta: [],
      metadata: {
        origen: 'campana_tarea_visita',
        campana_id: campanaId,
        campana_pdv_id: campanaPdvId,
        pdv_id: pdvId,
        dc_empleado_id: actorEmpleadoId,
        task_label: taskLabel,
        suspicious_reason: suspiciousReason,
      },
    })
    .select('id')
    .maybeSingle()

  if (messageError || !createdMessage?.id) {
    throw new Error(messageError?.message ?? 'No fue posible notificar la evidencia sospechosa al gestor.')
  }

  const { error: recipientError } = await service.from('mensaje_receptor').insert({
    mensaje_id: createdMessage.id,
    cuenta_cliente_id: cuentaClienteId,
    empleado_id: supervisorEmpleadoId,
    estado: 'PENDIENTE',
    metadata: {
      origen: 'campana_tarea_visita',
      campana_pdv_id: campanaPdvId,
    },
  })

  if (recipientError) {
    throw new Error(recipientError.message)
  }
}

function revalidateCampaignPaths() {
  revalidatePath('/campanas')
  revalidatePath('/dashboard')
  revalidatePath('/reportes')
}

export async function guardarCampana(
  _prevState: CampanaAdminActionState,
  formData: FormData
): Promise<CampanaAdminActionState> {
  try {
    const actor = await requerirGestorCampanas()
    const service = createServiceClient()
    const cuentaCliente = await resolveCuentaClienteId(actor, service, formData)
    const campanaId = normalizeOptionalText(formData.get('campana_id'))
    const nombre = normalizeRequiredText(formData.get('nombre'), 'Nombre')
    const fechaInicio = normalizeDate(formData.get('fecha_inicio'), 'Fecha inicio')
    const fechaFin = normalizeDate(formData.get('fecha_fin'), 'Fecha fin')
    const estado = normalizeEstado(formData.get('estado'))
    const descripcion = normalizeOptionalText(formData.get('descripcion'))
    const cadenaId = normalizeOptionalText(formData.get('cadena_id'))
    const cuotaAdicional = normalizeNonNegativeNumber(formData.get('cuota_adicional'), 'Cuota adicional')
    const instrucciones = normalizeOptionalText(formData.get('instrucciones'))
    const evidenceTemplate = getEvidenceTemplateItems(formData)
    const evidenciasRequeridas = evidenceTemplate.map((item) => item.label)
    const taskTemplate = getTaskTemplateItems(formData)
    const tareasTemplate = taskTemplate.map((item) => item.label)
    const selectedProductoIds = getSelectedValues(formData, 'producto_id')
    const manualProductGoals = getProductGoalItems(formData)
    const selectedPdvIds = getSelectedValues(formData, 'pdv_id')
    const manualMercadeoFile = formData.get('manual_mercadeo')
    const manualMercadeoUpload =
      manualMercadeoFile instanceof File && manualMercadeoFile.size > 0 ? manualMercadeoFile : null
    const metasProductoFile = formData.get('metas_producto_excel')
    const metasProductoUpload =
      metasProductoFile instanceof File && metasProductoFile.size > 0 ? metasProductoFile : null

    if (fechaFin < fechaInicio) {
      throw new Error('La fecha fin no puede ser menor que la fecha inicio.')
    }

    let importedGoalRows: ResolvedImportedCampaignGoal[] = []
    let importedProductoIds: string[] = []
    let importedPdvIds: string[] = []

    if (metasProductoUpload) {
      const parsedImport = parseCampaignProductQuotaWorkbook(
        Buffer.from(await metasProductoUpload.arrayBuffer())
      )

      const importedBtls = dedupeStringArray(parsedImport.rows.map((row) => row.claveBtl))
      const { data: importedPdvs, error: importedPdvsError } = await service
        .from('pdv')
        .select('id, clave_btl, nombre')
        .in('clave_btl', importedBtls)
        .limit(Math.max(importedBtls.length, 1))

      if (importedPdvsError) {
        throw new Error(importedPdvsError.message)
      }

      const importedPdvMap = new Map(
        (importedPdvs ?? []).map((item) => [normalizeLookupText(item.clave_btl), item])
      )

      const importedPdvRelations = importedPdvs?.length
        ? await service
            .from('cuenta_cliente_pdv')
            .select('pdv_id, activo, fecha_fin')
            .eq('cuenta_cliente_id', cuentaCliente.id)
            .in('pdv_id', importedPdvs.map((item) => item.id))
            .limit(Math.max(importedPdvs.length, 1))
        : { data: [], error: null }

      if (importedPdvRelations.error) {
        throw new Error(importedPdvRelations.error.message)
      }

      const importedValidPdvIds = new Set(
        (importedPdvRelations.data ?? [])
          .filter((item) => item.activo && (!item.fecha_fin || item.fecha_fin >= fechaInicio))
          .map((item) => item.pdv_id)
      )

      const { data: activeProducts, error: activeProductsError } = await service
        .from('producto')
        .select('id, sku, nombre, nombre_corto')
        .eq('activo', true)
        .limit(1000)

      if (activeProductsError) {
        throw new Error(activeProductsError.message)
      }

      const productBySku = new Map(
        (activeProducts ?? [])
          .filter((item) => item.sku)
          .map((item) => [normalizeLookupText(item.sku), item] as const)
      )
      const productByName = new Map<string, (typeof activeProducts)[number]>()
      for (const item of activeProducts ?? []) {
        for (const candidate of [item.nombre, item.nombre_corto]) {
          const key = normalizeLookupText(candidate)
          if (key && !productByName.has(key)) {
            productByName.set(key, item)
          }
        }
      }

      importedGoalRows = parsedImport.rows.map((row) => {
        const resolvedPdv = importedPdvMap.get(normalizeLookupText(row.claveBtl))
        if (!resolvedPdv || !importedValidPdvIds.has(resolvedPdv.id)) {
          throw new Error(
            `La fila ${row.rowNumber} referencia el PDV ${row.claveBtl} fuera del alcance activo de ISDIN.`
          )
        }

        const resolvedProduct =
          (row.sku ? productBySku.get(normalizeLookupText(row.sku)) : null) ??
          (row.articulo ? productByName.get(normalizeLookupText(row.articulo)) : null)

        if (!resolvedProduct) {
          throw new Error(
            `La fila ${row.rowNumber} no pudo resolver el artículo ${row.sku ?? row.articulo ?? 'SIN-ARTICULO'}.`
          )
        }

        return {
          rowNumber: row.rowNumber,
          pdvId: resolvedPdv.id,
          productId: resolvedProduct.id,
          quota: row.cuota,
          goalType: row.goalType,
          notes: row.notes,
        } satisfies ResolvedImportedCampaignGoal
      })

      const resolvedKeys = new Set<string>()
      for (const row of importedGoalRows) {
        const key = `${row.pdvId}::${row.productId}`
        if (resolvedKeys.has(key)) {
          throw new Error(
            `La matriz repite una meta para el mismo PDV y producto en la fila ${row.rowNumber}.`
          )
        }
        resolvedKeys.add(key)
      }

      importedProductoIds = dedupeStringArray(importedGoalRows.map((row) => row.productId))
      importedPdvIds = dedupeStringArray(importedGoalRows.map((row) => row.pdvId))
    }

    const productoIds = dedupeStringArray([...selectedProductoIds, ...importedProductoIds])
    const pdvIds = dedupeStringArray([...selectedPdvIds, ...importedPdvIds])
    const productGoals =
      importedGoalRows.length > 0
        ? summarizeImportedCampaignGoals(importedGoalRows)
        : manualProductGoals

    if (pdvIds.length === 0) {
      throw new Error('Selecciona al menos un PDV objetivo para la campana.')
    }

    const { data: pdvRelations, error: pdvRelationsError } = await service
      .from('cuenta_cliente_pdv')
      .select('pdv_id, cuenta_cliente_id, activo, fecha_fin')
      .eq('cuenta_cliente_id', cuentaCliente.id)
      .in('pdv_id', pdvIds)
      .limit(Math.max(pdvIds.length, 1))

    if (pdvRelationsError) {
      throw new Error(pdvRelationsError.message)
    }

    const validPdvIds = new Set(
      (pdvRelations ?? [])
        .filter((item) => item.activo && (!item.fecha_fin || item.fecha_fin >= fechaInicio))
        .map((item) => item.pdv_id)
    )

    if (validPdvIds.size !== pdvIds.length) {
      throw new Error('Todos los PDVs deben pertenecer a la cuenta cliente activa y seguir vigentes.')
    }

    if (productoIds.length > 0) {
      const { data: productos, error: productosError } = await service
        .from('producto')
        .select('id')
        .in('id', productoIds)
        .eq('activo', true)
        .limit(Math.max(productoIds.length, 1))

      if (productosError || (productos ?? []).length !== productoIds.length) {
        throw new Error(productosError?.message ?? 'Uno o mas productos foco no existen o estan inactivos.')
      }
    }

    const invalidGoalProduct = productGoals.find((item) => !productoIds.includes(item.productId))

    if (invalidGoalProduct) {
      throw new Error('Cada meta por producto debe corresponder a un producto foco seleccionado.')
    }

    const existingCampaignMetadata =
      campanaId
        ? normalizeMetadataRecord(
            (
              await service
                .from('campana')
                .select('metadata')
                .eq('id', campanaId)
                .eq('cuenta_cliente_id', cuentaCliente.id)
                .maybeSingle()
            ).data?.metadata
          )
        : {}

    const existingManual = readCampaignManualDocument(existingCampaignMetadata)
    const taskVariability = Math.max(1, tareasTemplate.length)
    const campaignPayload = {
      cuenta_cliente_id: cuentaCliente.id,
      cadena_id: cadenaId,
      nombre,
      descripcion,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      estado,
      productos_foco: productoIds,
      cuota_adicional: cuotaAdicional,
      instrucciones,
      evidencias_requeridas: evidenciasRequeridas,
      metadata: {
        ...existingCampaignMetadata,
        variabilidad_tareas: taskVariability,
        task_template: serializeVisitTaskTemplate(taskTemplate),
        evidence_template: serializeCampaignEvidenceTemplate(evidenceTemplate),
        product_goals: serializeCampaignProductGoals(productGoals),
        manual_mercadeo: existingManual
          ? {
              url: existingManual.url,
              hash: existingManual.hash,
              file_name: existingManual.fileName,
              mime_type: existingManual.mimeType,
              uploaded_at: existingManual.uploadedAt,
              uploaded_by: existingManual.uploadedBy,
            }
          : null,
      },
      updated_by_usuario_id: actor.usuarioId,
      updated_at: new Date().toISOString(),
    }

    const campaignQuery = campanaId
      ? service.from('campana').update(campaignPayload).eq('id', campanaId).eq('cuenta_cliente_id', cuentaCliente.id)
      : service.from('campana').insert({
          ...campaignPayload,
          created_by_usuario_id: actor.usuarioId,
        })

    const { data: campaign, error: campaignError } = await campaignQuery
      .select('id, nombre, fecha_inicio, fecha_fin, cuenta_cliente_id, evidencias_requeridas, metadata')
      .maybeSingle()

    if (campaignError || !campaign) {
      throw new Error(campaignError?.message ?? 'No fue posible guardar la campana.')
    }

    if (manualMercadeoUpload) {
      const storedManual = await uploadCampaignManual(service, {
        actorUsuarioId: actor.usuarioId,
        cuentaClienteId: cuentaCliente.id,
        campanaId: campaign.id,
        file: manualMercadeoUpload,
      })

      const { error: manualUpdateError } = await service
        .from('campana')
        .update({
          metadata: {
            ...campaignPayload.metadata,
            manual_mercadeo: {
              url: storedManual.url,
              hash: storedManual.hash,
              file_name: storedManual.fileName,
              mime_type: storedManual.mimeType,
              uploaded_at: storedManual.uploadedAt,
              uploaded_by: storedManual.uploadedBy,
            },
          },
          updated_by_usuario_id: actor.usuarioId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign.id)

      if (manualUpdateError) {
        throw new Error(manualUpdateError.message)
      }
    }

    const { data: existingRows, error: existingRowsError } = await service
      .from('campana_pdv')
      .select('id, pdv_id, tareas_cumplidas, evidencias_cargadas, comentarios, metadata')
      .eq('campana_id', campaign.id)
      .limit(1000)

    if (existingRowsError) {
      throw new Error(existingRowsError.message)
    }

    const existingMap = new Map((existingRows ?? []).map((item) => [item.pdv_id, item]))

    const { data: assignmentRows, error: assignmentError } = await service
      .from('asignacion')
      .select('pdv_id, empleado_id, supervisor_empleado_id, fecha_inicio, fecha_fin, estado_publicacion, created_at')
      .in('pdv_id', pdvIds)
      .limit(1200)

    if (assignmentError) {
      throw new Error(assignmentError.message)
    }

    const assignmentMap = new Map<string, (typeof assignmentRows)[number][]>()

    for (const assignment of assignmentRows ?? []) {
      const current = assignmentMap.get(assignment.pdv_id) ?? []
      current.push(assignment)
      assignmentMap.set(assignment.pdv_id, current)
    }

    for (const [pdvId, items] of assignmentMap.entries()) {
      assignmentMap.set(
        pdvId,
        [...items].sort((left, right) => right.created_at.localeCompare(left.created_at))
      )
    }

    const rowsToUpsert = pdvIds.map((pdvId) => {
      const previousRow = existingMap.get(pdvId)
      const previousMetadata = normalizeMetadataRecord(previousRow?.metadata)
      const overlappingAssignment = (assignmentMap.get(pdvId) ?? []).find(
        (item) =>
          item.estado_publicacion === 'PUBLICADA' &&
          rangesOverlapIso(item.fecha_inicio, item.fecha_fin, fechaInicio, fechaFin)
      )
      const completedTasks = dedupeStringArray(
        ((previousRow?.tareas_cumplidas ?? []) as string[]).filter((item) => tareasTemplate.includes(item))
      )
      const evidenceUploaded = previousRow?.evidencias_cargadas ?? 0
      const progress = buildCampaignProgress(
        tareasTemplate,
        completedTasks,
        campaign.evidencias_requeridas.length,
        evidenceUploaded,
        fechaFin
      )

      return {
        campana_id: campaign.id,
        cuenta_cliente_id: cuentaCliente.id,
        pdv_id: pdvId,
        dc_empleado_id: overlappingAssignment?.empleado_id ?? null,
        tareas_requeridas: progress.requiredTasks,
        tareas_cumplidas: progress.completedTasks,
        estatus_cumplimiento: progress.status,
        avance_porcentaje: progress.progressPercentage,
        evidencias_cargadas: progress.evidenceUploaded,
        comentarios: previousRow?.comentarios ?? null,
        metadata: {
          ...previousMetadata,
          supervisor_empleado_id: overlappingAssignment?.supervisor_empleado_id ?? null,
        },
        updated_by_usuario_id: actor.usuarioId,
      }
    })

    if (rowsToUpsert.length > 0) {
      const { error: upsertError } = await service
        .from('campana_pdv')
        .upsert(rowsToUpsert, { onConflict: 'campana_id,pdv_id' })

      if (upsertError) {
        throw new Error(upsertError.message)
      }
    }

    const pdvIdsToDelete = Array.from(existingMap.keys()).filter((item) => !pdvIds.includes(item))

    if (pdvIdsToDelete.length > 0) {
      const { error: deleteError } = await service
        .from('campana_pdv')
        .delete()
        .eq('campana_id', campaign.id)
        .in('pdv_id', pdvIdsToDelete)

      if (deleteError) {
        throw new Error(deleteError.message)
      }
    }

    if (metasProductoUpload) {
      const { data: refreshedCampaignPdvs, error: refreshedCampaignPdvsError } = await service
        .from('campana_pdv')
        .select('id, pdv_id')
        .eq('campana_id', campaign.id)
        .limit(1000)

      if (refreshedCampaignPdvsError) {
        throw new Error(refreshedCampaignPdvsError.message)
      }

      const campaignPdvIdByPdv = new Map(
        (refreshedCampaignPdvs ?? []).map((item) => [item.pdv_id, item.id] as const)
      )

      const rowsToUpsert = importedGoalRows.map((row) => {
        const campanaPdvId = campaignPdvIdByPdv.get(row.pdvId)
        if (!campanaPdvId) {
          throw new Error(
            `No fue posible enlazar la meta importada del PDV ${row.pdvId} a la campaña actual.`
          )
        }

        return {
          campana_id: campaign.id,
          campana_pdv_id: campanaPdvId,
          cuenta_cliente_id: cuentaCliente.id,
          pdv_id: row.pdvId,
          producto_id: row.productId,
          cuota: row.quota,
          tipo_meta: row.goalType,
          observaciones: row.notes,
          updated_by_usuario_id: actor.usuarioId,
          created_by_usuario_id: actor.usuarioId,
        }
      })

      const { error: metasUpsertError } = await service
        .from('campana_pdv_producto_meta')
        .upsert(rowsToUpsert, { onConflict: 'campana_id,pdv_id,producto_id' })

      if (metasUpsertError) {
        throw new Error(metasUpsertError.message)
      }

      const { data: existingMetas, error: existingMetasError } = await service
        .from('campana_pdv_producto_meta')
        .select('id, pdv_id, producto_id')
        .eq('campana_id', campaign.id)
        .limit(5000)

      if (existingMetasError) {
        throw new Error(existingMetasError.message)
      }

      const importedKeys = new Set(importedGoalRows.map((row) => `${row.pdvId}::${row.productId}`))
      const staleMetaIds = (existingMetas ?? [])
        .filter((row) => !importedKeys.has(`${row.pdv_id}::${row.producto_id}`))
        .map((row) => row.id)

      if (staleMetaIds.length > 0) {
        const { error: staleMetaDeleteError } = await service
          .from('campana_pdv_producto_meta')
          .delete()
          .in('id', staleMetaIds)

        if (staleMetaDeleteError) {
          throw new Error(staleMetaDeleteError.message)
        }
      }
    }

    await registrarEventoAudit(service, {
      actorUsuarioId: actor.usuarioId,
      cuentaClienteId: cuentaCliente.id,
      tabla: 'campana',
      registroId: campaign.id,
      payload: {
        evento: campanaId ? 'campana_actualizada' : 'campana_creada',
        nombre: campaign.nombre,
        fecha_inicio: campaign.fecha_inicio,
        fecha_fin: campaign.fecha_fin,
        pdvs_objetivo: pdvIds.length,
        productos_foco: productoIds.length,
        metas_producto: productGoals.length,
        metas_producto_por_pdv: importedGoalRows.length,
        manual_cargado: Boolean(manualMercadeoUpload || existingManual),
      },
    })

    revalidateCampaignPaths()

    return buildState({
      ok: true,
      message: campanaId ? 'Campana actualizada.' : 'Campana creada y asignada a PDVs objetivo.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible guardar la campana.',
    })
  }
}

export async function actualizarCumplimientoCampanaPdv(
  _prevState: CampanaAdminActionState,
  formData: FormData
): Promise<CampanaAdminActionState> {
  try {
    const actor = await requerirGestorCampanas()
    const service = createServiceClient()
    const campanaPdvId = normalizeRequiredText(formData.get('campana_pdv_id'), 'Objetivo campana-PDV')
    const completedTasks = getSelectedValues(formData, 'tarea_cumplida')
    const evidenciasCargadas = normalizeNonNegativeInteger(formData.get('evidencias_cargadas'), 'Evidencias cargadas')
    const comentarios = normalizeOptionalText(formData.get('comentarios'))

    const { data: row, error: rowError } = await service
      .from('campana_pdv')
      .select('id, campana_id, cuenta_cliente_id, tareas_requeridas')
      .eq('id', campanaPdvId)
      .maybeSingle()

    if (rowError || !row) {
      throw new Error(rowError?.message ?? 'No fue posible encontrar el objetivo de campana.')
    }

    if (actor.cuentaClienteId && actor.cuentaClienteId !== row.cuenta_cliente_id) {
      throw new Error('No puedes editar campanas fuera de tu cuenta cliente asignada.')
    }

    const { data: campaign, error: campaignError } = await service
      .from('campana')
      .select('id, fecha_fin, evidencias_requeridas')
      .eq('id', row.campana_id)
      .maybeSingle()

    if (campaignError || !campaign) {
      throw new Error(campaignError?.message ?? 'No fue posible encontrar la campana relacionada.')
    }

    const progress = buildCampaignProgress(
      row.tareas_requeridas ?? [],
      completedTasks,
      (campaign.evidencias_requeridas ?? []).length,
      evidenciasCargadas,
      campaign.fecha_fin
    )

    const { error: updateError } = await service
      .from('campana_pdv')
      .update({
        tareas_cumplidas: progress.completedTasks,
        estatus_cumplimiento: progress.status,
        avance_porcentaje: progress.progressPercentage,
        evidencias_cargadas: progress.evidenceUploaded,
        comentarios,
        updated_by_usuario_id: actor.usuarioId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campanaPdvId)

    if (updateError) {
      throw new Error(updateError.message)
    }

    await registrarEventoAudit(service, {
      actorUsuarioId: actor.usuarioId,
      cuentaClienteId: row.cuenta_cliente_id,
      tabla: 'campana_pdv',
      registroId: row.id,
      payload: {
        evento: 'campana_pdv_cumplimiento_actualizado',
        campana_id: row.campana_id,
        avance_porcentaje: progress.progressPercentage,
        estatus: progress.status,
      },
    })

    revalidateCampaignPaths()

    return buildState({
      ok: true,
      message: 'Cumplimiento de campana actualizado.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible actualizar el cumplimiento.',
    })
  }
}

export async function ejecutarTareasCampanaPdv(
  _prevState: CampanaAdminActionState,
  formData: FormData
): Promise<CampanaAdminActionState> {
  try {
    const actor = await requerirDermoconsejeroCampana()
    const service = createServiceClient()
    const campanaPdvId = normalizeRequiredText(formData.get('campana_pdv_id'), 'Objetivo campana-PDV')
    const comentarios = normalizeOptionalText(formData.get('comentarios'))
    const selectedEvidenceRequirementId = normalizeOptionalText(formData.get('evidence_requirement_id'))
    const evidenceFiles = getUploadedFiles(formData, 'evidencia')

    const { data: row, error: rowError } = await service
      .from('campana_pdv')
      .select('id, campana_id, cuenta_cliente_id, pdv_id, dc_empleado_id, tareas_requeridas, metadata')
      .eq('id', campanaPdvId)
      .maybeSingle()

    if (rowError || !row) {
      throw new Error(rowError?.message ?? 'No fue posible encontrar el objetivo de campana.')
    }

    if (row.dc_empleado_id && row.dc_empleado_id !== actor.empleadoId) {
      throw new Error('Esta tarea de visita no corresponde al dermoconsejero autenticado.')
    }

    if (actor.cuentaClienteId && actor.cuentaClienteId !== row.cuenta_cliente_id) {
      throw new Error('No puedes ejecutar tareas fuera de tu cuenta cliente asignada.')
    }

    const todayIso = new Date().toISOString().slice(0, 10)

    const { data: campaign, error: campaignError } = await service
      .from('campana')
      .select('id, fecha_inicio, fecha_fin, evidencias_requeridas, estado, metadata')
      .eq('id', row.campana_id)
      .maybeSingle()

    if (campaignError || !campaign) {
      throw new Error(campaignError?.message ?? 'No fue posible encontrar la campana relacionada.')
    }

    if (campaign.estado !== 'ACTIVA' || campaign.fecha_inicio > todayIso || campaign.fecha_fin < todayIso) {
      throw new Error('La campana no esta activa para la fecha de operacion actual.')
    }

    const { data: activeAttendance, error: attendanceError } = await service
      .from('asistencia')
      .select('id, check_in_utc, supervisor_empleado_id, latitud_check_in, longitud_check_in')
      .eq('cuenta_cliente_id', row.cuenta_cliente_id)
      .eq('empleado_id', actor.empleadoId)
      .eq('pdv_id', row.pdv_id)
      .eq('fecha_operacion', todayIso)
      .eq('estatus', 'VALIDA')
      .is('check_out_utc', null)
      .order('check_in_utc', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (attendanceError) {
      throw new Error(attendanceError.message)
    }

    if (!activeAttendance?.id || !activeAttendance.check_in_utc) {
      throw new Error('Necesitas un check-in valido y activo en este PDV para ejecutar tareas de visita.')
    }

    const nowIso = new Date().toISOString()
    const metadataRecord = normalizeMetadataRecord(row.metadata)
    const variabilityCount = readCampaignTaskVariability(campaign.metadata, (row.tareas_requeridas ?? []).length)
    const visitTaskTemplate = readVisitTaskTemplate(campaign.metadata, row.tareas_requeridas ?? [])
    const evidenceTemplate = readCampaignEvidenceTemplate(campaign.metadata, campaign.evidencias_requeridas ?? [])
    const selectedEvidenceRequirement =
      selectedEvidenceRequirementId
        ? evidenceTemplate.find((item) => item.id === selectedEvidenceRequirementId) ?? null
        : null
    const { sessions, session } = ensureVisitTaskSession(metadataRecord, {
      attendanceId: activeAttendance.id,
      templateTasks: visitTaskTemplate,
      variabilityCount,
      generatedAt: nowIso,
    })
    const updatedSession = updateVisitTaskSession(session, getTaskSessionUpdates(formData), nowIso)
    const existingEntries = readCampaignEvidenceEntries(row.metadata)
    const uploadedEntries = []
    const suspiciousNotifications: Array<{ taskLabel: string; reason: string }> = []
    const taskEvidencePayloads = getTaskEvidencePayloads(formData)
    const resolvedTaskMap = new Map(updatedSession.tasks.map((task) => [task.key, task]))

    for (const task of updatedSession.tasks) {
      if (
        visitTaskRequiresPhoto(task.kind) &&
        task.status === 'COMPLETADA' &&
        !taskEvidencePayloads.some((entry) => entry.taskKey === task.key)
      ) {
        throw new Error(`La tarea "${task.label}" requiere evidencia fotografica capturada desde camara.`)
      }
    }

    for (const file of evidenceFiles) {
      const stored = await uploadCampaignEvidence(service, {
        actorUsuarioId: actor.usuarioId,
        cuentaClienteId: row.cuenta_cliente_id,
        campanaPdvId: row.id,
        file,
      })

      uploadedEntries.push({
        url: stored.archivo.url,
        hash: stored.archivo.hash,
        thumbnailUrl: stored.miniatura?.url ?? null,
        thumbnailHash: stored.miniatura?.hash ?? null,
        uploadedAt: nowIso,
        uploadedBy: actor.usuarioId,
        asistenciaId: activeAttendance.id,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        officialAssetKind: stored.optimization.officialAssetKind,
        taskKey: null,
        capturedAt: null,
        latitude: null,
        longitude: null,
        cameraCaptured: false,
        timestampStamped: false,
        distanceFromCheckInMeters: null,
        suspicious: false,
        suspiciousReason: null,
        evidenceLabel: selectedEvidenceRequirement?.label ?? null,
        evidenceKind: selectedEvidenceRequirement?.kind ?? null,
      } as const)
    }

    const taskSessionUpdates = getTaskSessionUpdates(formData)
    const taskSessionUpdateMap = new Map(taskSessionUpdates.map((entry) => [entry.key, entry]))

    for (const payload of taskEvidencePayloads) {
      const task = resolvedTaskMap.get(payload.taskKey)

      if (!task) {
        continue
      }

      const stored = await uploadCampaignEvidence(service, {
        actorUsuarioId: actor.usuarioId,
        cuentaClienteId: row.cuenta_cliente_id,
        campanaPdvId: row.id,
        file: payload.file,
      })

      const metadata = payload.metadata
      const capturedAt =
        typeof metadata?.capturedAt === 'string' && metadata.capturedAt.trim() ? metadata.capturedAt.trim() : null
      const latitude = typeof metadata?.latitude === 'number' ? metadata.latitude : null
      const longitude = typeof metadata?.longitude === 'number' ? metadata.longitude : null
      const cameraCaptured = metadata?.captureSource === 'camera' || metadata?.cameraCaptured === true
      const timestampStamped = metadata?.timestampStamped === true
      let suspiciousReason: string | null = null
      let distanceFromCheckInMeters: number | null = null

      if (!cameraCaptured || !timestampStamped || !capturedAt) {
        suspiciousReason = 'La evidencia no contiene metadata valida de captura en vivo.'
      }

      if (capturedAt) {
        const capturedAtMs = Date.parse(capturedAt)
        const checkInMs = Date.parse(activeAttendance.check_in_utc)
        const nowMs = Date.parse(nowIso)

        if (!Number.isFinite(capturedAtMs) || capturedAtMs < checkInMs - 60000 || capturedAtMs > nowMs + 30000) {
          suspiciousReason =
            suspiciousReason ?? 'La evidencia no fue capturada dentro de la ventana temporal valida de la visita activa.'
        }
      }

      if (
        latitude !== null &&
        longitude !== null &&
        activeAttendance.latitud_check_in !== null &&
        activeAttendance.longitud_check_in !== null
      ) {
        distanceFromCheckInMeters = calculateDistanceMeters(
          activeAttendance.latitud_check_in,
          activeAttendance.longitud_check_in,
          latitude,
          longitude
        )

        if (distanceFromCheckInMeters > 200) {
          suspiciousReason = `Las coordenadas de la evidencia difieren ${Math.round(distanceFromCheckInMeters)} m del check-in activo.`
        }
      } else if (visitTaskRequiresPhoto(task.kind)) {
        suspiciousReason = suspiciousReason ?? 'La evidencia no contiene coordenadas GPS consistentes.'
      }

      if (visitTaskRequiresPhoto(task.kind) && !payload.file.type.startsWith('image/')) {
        suspiciousReason = suspiciousReason ?? 'La tarea fotografica no envio un archivo de imagen valido.'
      }

      const reusedEvidence = existingEntries.find(
        (entry) => entry.hash === stored.archivo.hash && entry.asistenciaId !== activeAttendance.id
      )
      if (reusedEvidence) {
        suspiciousReason = suspiciousReason ?? 'La evidencia coincide con una captura previa de otra visita.'
      }

      const suspicious = Boolean(suspiciousReason)

      uploadedEntries.push({
        url: stored.archivo.url,
        hash: stored.archivo.hash,
        thumbnailUrl: stored.miniatura?.url ?? null,
        thumbnailHash: stored.miniatura?.hash ?? null,
        uploadedAt: nowIso,
        uploadedBy: actor.usuarioId,
        asistenciaId: activeAttendance.id,
        fileName: payload.file.name,
        mimeType: payload.file.type || 'application/octet-stream',
        officialAssetKind: stored.optimization.officialAssetKind,
        taskKey: task.key,
        capturedAt,
        latitude,
        longitude,
        cameraCaptured,
        timestampStamped,
        distanceFromCheckInMeters,
        suspicious,
        suspiciousReason,
        evidenceLabel: selectedEvidenceRequirement?.label ?? task.label,
        evidenceKind: selectedEvidenceRequirement?.kind ?? null,
      })

      taskSessionUpdateMap.set(task.key, {
        key: task.key,
        status: task.status,
        justification: task.justification,
        suspicious,
        suspiciousReason,
        evidenceCountIncrement: 1,
      })

      if (suspicious && suspiciousReason) {
        suspiciousNotifications.push({
          taskLabel: task.label,
          reason: suspiciousReason,
        })
      }
    }

    const finalSession = updateVisitTaskSession(
      session,
      Array.from(taskSessionUpdateMap.values()),
      nowIso
    )

    const mergedEntries = mergeCampaignEvidenceEntries(existingEntries, uploadedEntries)
    const resolvedTasks = getResolvedVisitTaskLabels(finalSession)
    const progress = buildCampaignProgress(
      row.tareas_requeridas ?? [],
      resolvedTasks,
      (campaign.evidencias_requeridas ?? []).length,
      mergedEntries.length,
      campaign.fecha_fin
    )
    const executionMinutesMap = readVisitTaskExecutionMinutesMap(metadataRecord)
    const executionMinutes = getVisitTaskExecutionMinutes(finalSession)

    const nextMetadata = {
      ...metadataRecord,
      visit_task_sessions: serializeVisitTaskSessions({
        ...sessions,
        [activeAttendance.id]: finalSession,
      }),
      visit_task_execution_minutes: serializeVisitTaskExecutionMinutesMap({
        ...executionMinutesMap,
        ...(executionMinutes !== null ? { [activeAttendance.id]: executionMinutes } : {}),
      }),
      evidencias: mergedEntries,
      ultima_ejecucion: {
        asistencia_id: activeAttendance.id,
        ejecutada_en: nowIso,
        ejecutada_por: actor.usuarioId,
      },
    }

    const { error: updateError } = await service
      .from('campana_pdv')
      .update({
        dc_empleado_id: row.dc_empleado_id ?? actor.empleadoId,
        tareas_cumplidas: progress.completedTasks,
        estatus_cumplimiento: progress.status,
        avance_porcentaje: progress.progressPercentage,
        evidencias_cargadas: mergedEntries.length,
        comentarios,
        metadata: nextMetadata,
        updated_by_usuario_id: actor.usuarioId,
        updated_at: nowIso,
      })
      .eq('id', campanaPdvId)

    if (updateError) {
      throw new Error(updateError.message)
    }

    await registrarEventoAudit(service, {
      actorUsuarioId: actor.usuarioId,
      cuentaClienteId: row.cuenta_cliente_id,
      tabla: 'campana_pdv',
      registroId: row.id,
      payload: {
        evento: 'campana_pdv_ejecucion_dc',
        campana_id: row.campana_id,
        asistencia_id: activeAttendance.id,
        avance_porcentaje: progress.progressPercentage,
        estatus: progress.status,
        evidencias_nuevas: uploadedEntries.length,
        execution_minutes: executionMinutes,
        suspicious_tasks: suspiciousNotifications,
      },
    })

    const supervisorEmpleadoId =
      activeAttendance.supervisor_empleado_id ??
      (typeof metadataRecord.supervisor_empleado_id === 'string' ? metadataRecord.supervisor_empleado_id : null)

    if (supervisorEmpleadoId) {
      for (const suspicious of suspiciousNotifications) {
        await notifySuspiciousVisitTask(service, {
          cuentaClienteId: row.cuenta_cliente_id,
          actorUsuarioId: actor.usuarioId,
          actorEmpleadoId: actor.empleadoId,
          supervisorEmpleadoId,
          campanaId: row.campana_id,
          campanaPdvId: row.id,
          pdvId: row.pdv_id,
          taskLabel: suspicious.taskLabel,
          suspiciousReason: suspicious.reason,
        })
      }
    }

    revalidateCampaignPaths()

    return buildState({
      ok: true,
      message:
        suspiciousNotifications.length > 0
          ? 'Tareas actualizadas. Se marcaron evidencias sospechosas y se notifico al gestor.'
          : uploadedEntries.length > 0
            ? 'Tareas de visita actualizadas con evidencia en campo.'
            : 'Tareas de visita actualizadas.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible ejecutar las tareas de visita.',
    })
  }
}
