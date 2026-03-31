'use server'

import { Buffer } from 'node:buffer'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requerirPuestosActivos } from '@/lib/auth/session'
import {
  buildOperationalDocumentUploadLimitMessage,
  EXPEDIENTE_RAW_UPLOAD_MAX_BYTES,
  exceedsOperationalDocumentUploadLimit,
} from '@/lib/files/documentOptimization'
import { storeOptimizedEvidence } from '@/lib/files/evidenceStorage'
import { createServiceClient } from '@/lib/supabase/server'
import { computeSHA256 } from '@/lib/files/sha256'
import { analyzeMaterialDistributionWithGemini } from './lib/materialDistributionGemini'
import {
  parseMaterialDistributionWorkbook,
  type MaterialDistributionPreview,
  type MaterialImportWarning,
  type MaterialRuleFlags,
  type MaterialRulePreview,
} from './lib/materialDistributionImport'
import type { MaterialActionState, MaterialImportActionState } from './state'
import type { CuentaCliente, Pdv, Puesto, SupervisorPdv } from '@/types/database'

const MATERIALES_BUCKET = 'operacion-evidencias'
const MATERIALES_IMPORTS_BUCKET = 'materiales-dispersion'
const MATERIALES_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MATERIAL_IMPORT_ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]

const MATERIALES_ADMIN_ROLES = ['ADMINISTRADOR', 'LOGISTICA', 'COORDINADOR'] as const satisfies Puesto[]
const MATERIALES_DELIVERY_ROLES = ['ADMINISTRADOR', 'LOGISTICA', 'COORDINADOR', 'DERMOCONSEJERO'] as const satisfies Puesto[]
const MATERIALES_FIELD_ROLES = ['ADMINISTRADOR', 'LOGISTICA', 'COORDINADOR', 'SUPERVISOR', 'DERMOCONSEJERO'] as const satisfies Puesto[]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

type PdvImportMatchRow = Pick<Pdv, 'id' | 'id_cadena' | 'clave_btl' | 'nombre' | 'zona'>
type SupervisorPdvRow = Pick<SupervisorPdv, 'pdv_id' | 'empleado_id' | 'activo' | 'fecha_inicio' | 'fecha_fin'>

interface MaterialCatalogLookupRow {
  id: string
  nombre: string
  requiere_ticket_compra: boolean
  requiere_evidencia_obligatoria: boolean
}

interface MaterialDetalleSaldoRow {
  id: string
  distribucion_id?: string
  material_catalogo_id?: string
  cantidad_recibida: number
  cantidad_entregada: number
  cantidad_observada?: number
  requiere_ticket_mes?: boolean
  requiere_evidencia_entrega_mes?: boolean
  requiere_evidencia_mercadeo?: boolean
  es_regalo_dc?: boolean
  excluir_de_registrar_entrega?: boolean
  material_nombre_snapshot?: string | null
  material_tipo_mes?: string | null
  material_catalogo?: MaterialCatalogLookupRow | MaterialCatalogLookupRow[] | null
}

function buildState(partial: Partial<MaterialActionState>): MaterialActionState {
  return {
    ok: false,
    message: null,
    ...partial,
  }
}

function buildImportState(partial: Partial<MaterialImportActionState>): MaterialImportActionState {
  return {
    ok: false,
    message: null,
    loteId: null,
    preview: null,
    geminiAnalysis: null,
    cuentaClienteId: null,
    ...partial,
  }
}

function normalizeRequiredText(value: FormDataEntryValue | null, label: string) {
  const normalized = String(value ?? '').trim()

  if (!normalized) {
    throw new Error(`${label} es obligatorio.`)
  }

  return normalized
}

function normalizeOptionalText(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizePositiveInteger(value: FormDataEntryValue | null, label: string) {
  const parsed = Number(String(value ?? '').trim())

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} debe ser un entero positivo.`)
  }

  return parsed
}

function normalizeZeroOrPositiveInteger(value: FormDataEntryValue | null, label: string) {
  const parsed = Number(String(value ?? '').trim())

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} debe ser un entero cero o mayor.`)
  }

  return parsed
}

function normalizeBoolean(value: FormDataEntryValue | null) {
  return ['true', '1', 'on', 'si', 'yes'].includes(String(value ?? '').trim().toLowerCase())
}

function normalizeMonthValue(value: string | null) {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return `${trimmed}-01`
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed.slice(0, 7)}-01`
  }

  return null
}

function normalizeIsoDateTimeValue(value: string | null) {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed || Number.isNaN(Date.parse(trimmed))) {
    return null
  }

  return new Date(trimmed).toISOString()
}

function asUploadedFile(value: FormDataEntryValue | null) {
  if (!value || typeof value === 'string' || !(value instanceof File) || value.size === 0) {
    return null
  }

  return value
}

function asOptionalDataUrl(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  return normalized.startsWith('data:') ? normalized : null
}

function fileFromDataUrl(dataUrl: string, fallbackName: string) {
  const [header, payload] = dataUrl.split(',', 2)
  const mimeMatch = header.match(/data:(.*?);base64/)
  const mimeType = mimeMatch?.[1] ?? 'image/png'
  const extension = mimeType.split('/')[1] ?? 'png'
  const buffer = Buffer.from(payload ?? '', 'base64')

  return new File([buffer], `${fallbackName}.${extension}`, { type: mimeType })
}

async function ensureBucket(
  service: TypedSupabaseClient,
  bucket: string,
  allowedMimeTypes: string[],
  fileSizeLimit = `${EXPEDIENTE_RAW_UPLOAD_MAX_BYTES}`
) {
  const { error } = await service.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit,
    allowedMimeTypes,
  })

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error
  }
}

async function validarCuentaCliente(service: TypedSupabaseClient, cuentaClienteId: string) {
  const { data: cuentaRaw, error } = await service
    .from('cuenta_cliente')
    .select('id, activa')
    .eq('id', cuentaClienteId)
    .maybeSingle()

  const cuenta = cuentaRaw as CuentaCliente | null

  if (error || !cuenta || !cuenta.activa) {
    throw new Error('La cuenta cliente seleccionada no existe o no esta activa.')
  }
}

async function uploadMaterialEvidence(
  service: TypedSupabaseClient,
  {
    actorUsuarioId,
    cuentaClienteId,
    empleadoId,
    flowPrefix,
    file,
  }: {
    actorUsuarioId: string
    cuentaClienteId: string
    empleadoId: string
    flowPrefix: string
    file: File
  }
) {
  if (exceedsOperationalDocumentUploadLimit(file)) {
    throw new Error(buildOperationalDocumentUploadLimitMessage('evidencia', file))
  }

  await ensureBucket(service, MATERIALES_BUCKET, MATERIALES_ALLOWED_MIME_TYPES)

  const stored = await storeOptimizedEvidence({
    service,
    bucket: MATERIALES_BUCKET,
    actorUsuarioId,
    storagePrefix: `materiales/${flowPrefix}/${cuentaClienteId}/${empleadoId}`,
    file,
  })

  return {
    url: stored.archivo.url,
    hash: stored.archivo.hash,
    thumbnailUrl: stored.miniatura?.url ?? null,
    thumbnailHash: stored.miniatura?.hash ?? null,
  }
}

async function insertAuditLog(
  service: TypedSupabaseClient,
  {
    tabla,
    registroId,
    payload,
    usuarioId,
    cuentaClienteId,
  }: {
    tabla: string
    registroId: string
    payload: Record<string, unknown>
    usuarioId: string
    cuentaClienteId: string | null
  }
) {
  await service.from('audit_log').insert({
    tabla,
    registro_id: registroId,
    accion: 'EVENTO',
    payload,
    usuario_id: usuarioId,
    cuenta_cliente_id: cuentaClienteId,
  })
}

async function cancelPreviewLotsByActor(
  service: TypedSupabaseClient,
  usuarioId: string,
  reason: 'nuevo_preview' | 'recarga_panel'
) {
  const { error } = await service
    .from('material_distribucion_lote')
    .update({
      estado: 'CANCELADO',
      metadata: {
        cancelado_desde: reason,
        cancelado_en: new Date().toISOString(),
      },
    })
    .eq('created_by_usuario_id', usuarioId)
    .eq('estado', 'BORRADOR_PREVIEW')

  if (error) {
    throw new Error(error.message ?? 'No fue posible limpiar el preview anterior de materiales.')
  }
}

async function uploadImportWorkbook(
  service: TypedSupabaseClient,
  {
    cuentaClienteId,
    file,
  }: {
    cuentaClienteId: string
    file: File
  }
) {
  await ensureBucket(service, MATERIALES_IMPORTS_BUCKET, MATERIAL_IMPORT_ALLOWED_MIME_TYPES, `${25 * 1024 * 1024}`)

  const buffer = Buffer.from(await file.arrayBuffer())
  const hash = await computeSHA256(buffer)
  const extension = file.name.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'bin'
  const route = `materiales/imports/${cuentaClienteId}/${hash}.${extension}`
  const { error } = await service.storage.from(MATERIALES_IMPORTS_BUCKET).upload(route, buffer, {
    contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    upsert: false,
  })

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(error.message)
  }

  return {
    buffer,
    hash,
    size: buffer.byteLength,
    url: `${MATERIALES_IMPORTS_BUCKET}/${route}`,
    mimeType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
}

function normalizeIdCadena(value: string | null) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeClaveBtl(value: string | null) {
  return String(value ?? '').trim().toLowerCase()
}

function mergeGeminiSuggestions(
  preview: MaterialDistributionPreview,
  geminiAnalysis: Awaited<ReturnType<typeof analyzeMaterialDistributionWithGemini>>
) {
  if (geminiAnalysis.ruleSuggestions.length === 0) {
    return preview
  }

  const byKey = new Map(geminiAnalysis.ruleSuggestions.map((item) => [item.materialKey, item]))
  return {
    ...preview,
    materialRules: preview.materialRules.map((rule) => {
      const suggestion = byKey.get(rule.key)
      if (!suggestion) {
        return rule
      }

      return {
        ...rule,
        materialType: suggestion.materialType ?? rule.materialType,
        mecanicaCanje: suggestion.mecanicaCanje ?? rule.mecanicaCanje,
        indicacionesProducto: suggestion.indicacionesProducto ?? rule.indicacionesProducto,
        instruccionesMercadeo: suggestion.instruccionesMercadeo ?? rule.instruccionesMercadeo,
        flags: {
          excluirDeRegistrarEntrega: suggestion.excluirDeRegistrarEntrega ?? rule.flags.excluirDeRegistrarEntrega,
          requiereTicketMes: suggestion.requiereTicketMes ?? rule.flags.requiereTicketMes,
          requiereEvidenciaEntregaMes:
            suggestion.requiereEvidenciaEntregaMes ?? rule.flags.requiereEvidenciaEntregaMes,
          requiereEvidenciaMercadeo:
            suggestion.requiereEvidenciaMercadeo ?? rule.flags.requiereEvidenciaMercadeo,
          esRegaloDc: suggestion.esRegaloDc ?? rule.flags.esRegaloDc,
        },
      }
    }),
  } satisfies MaterialDistributionPreview
}

function applyPdvMatches(
  preview: MaterialDistributionPreview,
  pdvRows: PdvImportMatchRow[]
): MaterialDistributionPreview {
  const duplicates = new Map<string, PdvImportMatchRow[]>()
  for (const row of pdvRows) {
    const key = normalizeClaveBtl(row.clave_btl)
    if (!key) {
      continue
    }

    const current = duplicates.get(key) ?? []
    current.push(row)
    duplicates.set(key, current)
  }

  const warnings: MaterialImportWarning[] = [...preview.warnings]
  const pdvPackages = preview.pdvPackages.map((item) => {
    const key = normalizeClaveBtl(item.idBtl)
    const matches = duplicates.get(key) ?? []

    if (matches.length === 1) {
      return {
        ...item,
        territorio: item.territorio ?? matches[0].zona ?? null,
        pdvMatch: {
          matched: true,
          pdvId: matches[0].id,
          pdvNombre: matches[0].nombre,
          pdvClaveBtl: matches[0].clave_btl,
        },
      }
    }

    warnings.push({
      code: matches.length > 1 ? 'pdv_duplicated_in_system' : 'pdv_not_found',
      severity: 'error',
      message:
        matches.length > 1
          ? `El ID BTL ${item.idBtl} coincide con múltiples PDVs activos del sistema.`
          : `No se encontró un PDV activo para el ID BTL ${item.idBtl}.`,
      idBtl: item.idBtl,
      idPdvCadena: item.idPdvCadena,
    })

    return {
      ...item,
      pdvMatch: {
        matched: false,
        pdvId: null,
        pdvNombre: null,
        pdvClaveBtl: null,
      },
    }
  })

  const unmatchedRows = warnings.filter((warning) =>
    ['missing_id_btl', 'pdv_not_found', 'pdv_duplicated_in_system'].includes(warning.code)
  )

  return {
    ...preview,
    pdvPackages,
    warnings,
    unmatchedRows,
    canConfirm: unmatchedRows.length === 0 && !warnings.some((warning) => warning.severity === 'error'),
  }
}

function buildSummaryForLot(preview: MaterialDistributionPreview) {
  return {
    pdv_count: preview.pdvPackages.length,
    material_rule_count: preview.materialRules.length,
    warning_count: preview.warnings.length,
    unmatched_count: preview.unmatchedRows.length,
    can_confirm: preview.canConfirm,
  }
}

function getEditedRules(preview: MaterialDistributionPreview, formData: FormData) {
  const rulesByKey = new Map<string, MaterialRulePreview>()

  for (const rule of preview.materialRules) {
    const prefix = `rule__${rule.key}`
    const selected = normalizeBoolean(formData.get(`${prefix}__selected`))
    const flags: MaterialRuleFlags = {
      excluirDeRegistrarEntrega: normalizeBoolean(formData.get(`${prefix}__excluir`)) || false,
      requiereTicketMes: normalizeBoolean(formData.get(`${prefix}__ticket`)) || false,
      requiereEvidenciaEntregaMes: normalizeBoolean(formData.get(`${prefix}__evidencia_entrega`)) || false,
      requiereEvidenciaMercadeo: normalizeBoolean(formData.get(`${prefix}__evidencia_mercadeo`)) || false,
      esRegaloDc: normalizeBoolean(formData.get(`${prefix}__regalo_dc`)) || false,
    }

    if (flags.esRegaloDc) {
      flags.excluirDeRegistrarEntrega = true
      flags.requiereEvidenciaEntregaMes = false
    }

    rulesByKey.set(rule.key, {
      ...rule,
      selected,
      materialType: normalizeOptionalText(formData.get(`${prefix}__tipo`)) ?? rule.materialType,
      mecanicaCanje: normalizeOptionalText(formData.get(`${prefix}__mecanica`)),
      indicacionesProducto: normalizeOptionalText(formData.get(`${prefix}__indicaciones`)),
      instruccionesMercadeo: normalizeOptionalText(formData.get(`${prefix}__mercadeo`)),
      flags,
    })
  }

  return rulesByKey
}

function areRulesEquivalent(left: MaterialRulePreview, right: MaterialRulePreview) {
  return (
    left.displayName === right.displayName &&
    left.materialType === right.materialType &&
    (left.mecanicaCanje ?? null) === (right.mecanicaCanje ?? null) &&
    (left.indicacionesProducto ?? null) === (right.indicacionesProducto ?? null) &&
    (left.instruccionesMercadeo ?? null) === (right.instruccionesMercadeo ?? null) &&
    left.flags.excluirDeRegistrarEntrega === right.flags.excluirDeRegistrarEntrega &&
    left.flags.requiereTicketMes === right.flags.requiereTicketMes &&
    left.flags.requiereEvidenciaEntregaMes === right.flags.requiereEvidenciaEntregaMes &&
    left.flags.requiereEvidenciaMercadeo === right.flags.requiereEvidenciaMercadeo &&
    left.flags.esRegaloDc === right.flags.esRegaloDc
  )
}

function sumInventoryBalance(rows: Array<{ cantidad_delta: number }>) {
  return rows.reduce((total, row) => total + Number(row.cantidad_delta ?? 0), 0)
}

export async function guardarMaterialCatalogo(
  _prevState: MaterialActionState,
  formData: FormData
): Promise<MaterialActionState> {
  try {
    const actor = await requerirPuestosActivos([...MATERIALES_ADMIN_ROLES])
    const service = createServiceClient() as TypedSupabaseClient
    const cuentaClienteId = normalizeRequiredText(formData.get('cuenta_cliente_id'), 'Cuenta cliente')
    const nombre = normalizeRequiredText(formData.get('nombre'), 'Nombre del material')
    const tipo = normalizeRequiredText(formData.get('tipo'), 'Tipo')
    const cantidadDefault = normalizePositiveInteger(formData.get('cantidad_default'), 'Cantidad por default')
    const requiereTicketCompra = normalizeBoolean(formData.get('requiere_ticket_compra'))
    const requiereEvidenciaObligatoria = normalizeBoolean(formData.get('requiere_evidencia_obligatoria'))

    await validarCuentaCliente(service, cuentaClienteId)

    const { data: upserted, error } = await service
      .from('material_catalogo')
      .upsert(
        {
          cuenta_cliente_id: cuentaClienteId,
          nombre,
          tipo,
          cantidad_default: cantidadDefault,
          requiere_ticket_compra: requiereTicketCompra,
          requiere_evidencia_obligatoria: requiereEvidenciaObligatoria,
          activo: true,
          metadata: {
            creado_desde: 'panel_materiales',
            actualizado_por_usuario_id: actor.usuarioId,
            actualizado_por_nombre: actor.nombreCompleto,
          },
        },
        { onConflict: 'cuenta_cliente_id,nombre' }
      )
      .select('id')
      .maybeSingle()

    if (error || !upserted?.id) {
      throw new Error(error?.message ?? 'No fue posible guardar el material.')
    }

    await insertAuditLog(service, {
      tabla: 'material_catalogo',
      registroId: upserted.id,
      payload: {
        evento: 'material_catalogo_guardado',
        nombre,
        tipo,
        cantidad_default: cantidadDefault,
      },
      usuarioId: actor.usuarioId,
      cuentaClienteId,
    })

    revalidatePath('/materiales')
    return buildState({ ok: true, message: 'Catalogo promocional actualizado.' })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible guardar el catalogo.',
    })
  }
}

export async function importarDistribucionMateriales(
  _prevState: MaterialImportActionState,
  formData: FormData
): Promise<MaterialImportActionState> {
  try {
    const actor = await requerirPuestosActivos([...MATERIALES_ADMIN_ROLES])
    const service = createServiceClient() as TypedSupabaseClient
    const cuentaClienteId = normalizeRequiredText(formData.get('cuenta_cliente_id'), 'Cuenta cliente')
    const monthOverride = normalizeMonthValue(normalizeOptionalText(formData.get('mes_operacion_override')))
    const uploadedFile = asUploadedFile(formData.get('archivo_excel'))

    if (!uploadedFile) {
      throw new Error('Adjunta un archivo XLSX con la dispersion del mes.')
    }

    if (!uploadedFile.name.toLowerCase().endsWith('.xlsx')) {
      throw new Error('La dispersion debe cargarse en formato XLSX.')
    }

    await validarCuentaCliente(service, cuentaClienteId)
    await cancelPreviewLotsByActor(service, actor.usuarioId, 'nuevo_preview')

    const storedImport = await uploadImportWorkbook(service, {
      cuentaClienteId,
      file: uploadedFile,
    })

    const parsed = parseMaterialDistributionWorkbook(storedImport.buffer, {
      fileName: uploadedFile.name,
      monthOverride,
    })

    const pdvBtlValues = Array.from(
      new Set(parsed.pdvPackages.map((item) => item.idBtl).filter((value): value is string => Boolean(value)))
    )
    const pdvLookupValues = Array.from(
      new Set(
        pdvBtlValues.flatMap((value) => {
          const trimmed = value.trim()
          if (!trimmed) {
            return []
          }
          return Array.from(new Set([trimmed, trimmed.toUpperCase(), trimmed.toLowerCase()]))
        })
      )
    )

    const { data: pdvRowsRaw, error: pdvError } = pdvLookupValues.length
      ? await service
          .from('pdv')
          .select('id, id_cadena, clave_btl, nombre, zona')
          .eq('estatus', 'ACTIVO')
          .in('clave_btl', pdvLookupValues)
          .limit(Math.max(pdvLookupValues.length, 1))
      : { data: [], error: null }

    if (pdvError) {
      throw new Error(pdvError.message ?? 'No fue posible validar los PDVs del archivo.')
    }

    let preview = applyPdvMatches(parsed, (pdvRowsRaw ?? []) as PdvImportMatchRow[])
    const geminiAnalysis = await analyzeMaterialDistributionWithGemini(preview)
    preview = mergeGeminiSuggestions(preview, geminiAnalysis)

    const { data: createdLot, error: lotError } = await service
      .from('material_distribucion_lote')
      .insert({
        cuenta_cliente_id: cuentaClienteId,
        mes_operacion: preview.resolvedMonth,
        estado: 'BORRADOR_PREVIEW',
        archivo_nombre: uploadedFile.name,
        archivo_url: storedImport.url,
        archivo_hash: storedImport.hash,
        archivo_mime_type: storedImport.mimeType,
        archivo_tamano_bytes: storedImport.size,
        gemini_status:
          geminiAnalysis.status === 'ok'
            ? 'OK'
            : geminiAnalysis.status === 'no_configurado'
              ? 'NO_CONFIGURADO'
              : geminiAnalysis.status === 'warning'
                ? 'ADVERTENCIA'
                : 'ERROR',
        advertencias: preview.warnings,
        resumen: {
          ...buildSummaryForLot(preview),
          gemini_summary: geminiAnalysis.summary,
          gemini_warnings: geminiAnalysis.warnings,
        },
        preview_data: {
          ...preview,
          geminiAnalysis,
        },
        metadata: {
          creado_desde: 'materiales_preview_import',
          actor_usuario_id: actor.usuarioId,
          actor_nombre: actor.nombreCompleto,
        },
        created_by_usuario_id: actor.usuarioId,
      })
      .select('id')
      .maybeSingle()

    if (lotError || !createdLot?.id) {
      throw new Error(lotError?.message ?? 'No fue posible guardar el preview del lote mensual.')
    }

    await insertAuditLog(service, {
      tabla: 'material_distribucion_lote',
      registroId: createdLot.id,
      payload: {
        evento: 'preview_lote_materiales_creado',
        archivo_nombre: uploadedFile.name,
        mes_operacion: preview.resolvedMonth,
        pdv_count: preview.pdvPackages.length,
      },
      usuarioId: actor.usuarioId,
      cuentaClienteId,
    })

    revalidatePath('/materiales')
    return buildImportState({
      ok: true,
      message: 'Preview generado. Revisa reglas, advertencias y match de PDV antes de confirmar.',
      loteId: createdLot.id,
      preview,
      geminiAnalysis,
      cuentaClienteId,
    })
  } catch (error) {
    return buildImportState({
      message: error instanceof Error ? error.message : 'No fue posible preparar el preview del lote.',
    })
  }
}

export async function confirmarDistribucionMateriales(
  _prevState: MaterialActionState,
  formData: FormData
): Promise<MaterialActionState> {
  try {
    const actor = await requerirPuestosActivos([...MATERIALES_ADMIN_ROLES])
    const service = createServiceClient() as TypedSupabaseClient
    const loteId = normalizeRequiredText(formData.get('lote_id'), 'Lote de dispersión')
    const monthOverride = normalizeMonthValue(normalizeOptionalText(formData.get('mes_operacion_override')))

    const { data: loteRaw, error: lotError } = await service
      .from('material_distribucion_lote')
      .select('id, cuenta_cliente_id, mes_operacion, estado, preview_data')
      .eq('id', loteId)
      .maybeSingle()

    const lote = loteRaw as {
      id: string
      cuenta_cliente_id: string
      mes_operacion: string
      estado: 'BORRADOR_PREVIEW' | 'CONFIRMADO' | 'CANCELADO'
      preview_data: Record<string, unknown>
    } | null

    if (lotError || !lote) {
      throw new Error(lotError?.message ?? 'No fue posible localizar el lote en preview.')
    }

    if (lote.estado !== 'BORRADOR_PREVIEW') {
      throw new Error('Este lote ya fue confirmado o cancelado; no se puede confirmar nuevamente.')
    }

    const preview = lote.preview_data as unknown as MaterialDistributionPreview
    if (!preview?.pdvPackages?.length) {
      throw new Error('El lote no contiene un preview valido para confirmar.')
    }

    const editedRules = getEditedRules(preview, formData)
    const confirmedMonth = monthOverride ?? lote.mes_operacion

    const matchedPackages = preview.pdvPackages.filter((item) => item.pdvMatch.matched && item.pdvMatch.pdvId)
    if (matchedPackages.length === 0) {
      throw new Error('No hay PDVs resueltos para confirmar este lote.')
    }

    const selectedRules = Array.from(editedRules.values()).filter((rule) => rule.selected)
    if (selectedRules.length === 0) {
      throw new Error('Selecciona al menos un producto del preview antes de confirmar el lote.')
    }

    const materialNames = Array.from(new Set(selectedRules.map((rule) => rule.displayName)))
    const { data: catalogRowsRaw, error: catalogError } = materialNames.length
      ? await service
          .from('material_catalogo')
          .select('id, nombre, requiere_ticket_compra, requiere_evidencia_obligatoria')
          .eq('cuenta_cliente_id', lote.cuenta_cliente_id)
          .in('nombre', materialNames)
          .limit(materialNames.length)
      : { data: [], error: null }

    if (catalogError) {
      throw new Error(catalogError.message ?? 'No fue posible validar el catalogo de materiales.')
    }

    const catalogByName = new Map(
      ((catalogRowsRaw ?? []) as MaterialCatalogLookupRow[]).map((item) => [item.nombre, item])
    )

    for (const rule of selectedRules) {
      if (catalogByName.has(rule.displayName)) {
        continue
      }

      const { data: createdCatalog, error: createCatalogError } = await service
        .from('material_catalogo')
        .insert({
          cuenta_cliente_id: lote.cuenta_cliente_id,
          nombre: rule.displayName,
          tipo: rule.materialType,
          cantidad_default: 1,
          requiere_ticket_compra: rule.flags.requiereTicketMes,
          requiere_evidencia_obligatoria: rule.flags.requiereEvidenciaEntregaMes,
          activo: true,
          metadata: {
            creado_desde: 'materiales_confirmar_lote',
            lote_id: lote.id,
            material_key: rule.key,
          },
        })
        .select('id, nombre, requiere_ticket_compra, requiere_evidencia_obligatoria')
        .maybeSingle()

      if (createCatalogError || !createdCatalog) {
        throw new Error(createCatalogError?.message ?? `No fue posible crear el material ${rule.displayName}.`)
      }

      catalogByName.set(createdCatalog.nombre, createdCatalog)
    }

    const matchedPdvIds = Array.from(new Set(matchedPackages.map((item) => item.pdvMatch.pdvId!).filter(Boolean)))
    const { data: supervisorRowsRaw, error: supervisorError } = matchedPdvIds.length
      ? await service
          .from('supervisor_pdv')
          .select('pdv_id, empleado_id, activo, fecha_inicio, fecha_fin')
          .in('pdv_id', matchedPdvIds)
          .limit(Math.max(50, matchedPdvIds.length * 3))
      : { data: [], error: null }

    if (supervisorError) {
      throw new Error(supervisorError.message ?? 'No fue posible resolver el supervisor actual de los PDVs.')
    }

    const supervisorByPdv = new Map<string, string | null>()
    const supervisorRows = (supervisorRowsRaw ?? []) as SupervisorPdvRow[]
    for (const pdvId of matchedPdvIds) {
      const current = supervisorRows
        .filter((item) => item.pdv_id === pdvId)
        .sort((left, right) => {
          if (left.activo !== right.activo) {
            return left.activo ? -1 : 1
          }
          return (right.fecha_inicio ?? '').localeCompare(left.fecha_inicio ?? '')
        })[0]
      supervisorByPdv.set(pdvId, current?.empleado_id ?? null)
    }

    let confirmedPackageCount = 0

    for (const item of matchedPackages) {
      const materialTotals = new Map<
        string,
        {
          quantity: number
          totalColumn: number | null
          sheetNames: string[]
          rowNumbers: number[]
          blockNames: string[]
          rule: MaterialRulePreview
          materialKeys: string[]
        }
      >()

      for (const material of item.materials) {
        const rule = editedRules.get(material.materialKey)
        if (!rule?.selected) {
          continue
        }

        const materialNameKey = rule.displayName
        const current = materialTotals.get(materialNameKey)
        if (!current) {
          materialTotals.set(materialNameKey, {
            quantity: material.quantity,
            totalColumn: material.totalColumn,
            sheetNames: [material.sheetName],
            rowNumbers: [material.rowNumber],
            blockNames: [material.blockName],
            rule,
            materialKeys: [material.materialKey],
          })
          continue
        }

        if (!areRulesEquivalent(current.rule, rule)) {
          throw new Error(
            `El producto ${rule.displayName} aparece en más de un bloque con reglas distintas para ${item.sucursal ?? item.idBtl ?? 'este PDV'}. Unifica la configuración antes de confirmar.`
          )
        }

        current.quantity += material.quantity
        if (current.totalColumn === null && material.totalColumn !== null) {
          current.totalColumn = material.totalColumn
        }
        if (!current.sheetNames.includes(material.sheetName)) {
          current.sheetNames.push(material.sheetName)
        }
        if (!current.rowNumbers.includes(material.rowNumber)) {
          current.rowNumbers.push(material.rowNumber)
        }
        if (!current.blockNames.includes(material.blockName)) {
          current.blockNames.push(material.blockName)
        }
        if (!current.materialKeys.includes(material.materialKey)) {
          current.materialKeys.push(material.materialKey)
        }
      }

      if (materialTotals.size === 0) {
        continue
      }

      const pdvId = item.pdvMatch.pdvId!
      const supervisorEmpleadoId = supervisorByPdv.get(pdvId) ?? null
      const hojaOrigen = item.sheetNames.length === 1 ? item.sheetNames[0] : 'MULTIHOJA'
      const { data: distributionRaw, error: distributionError } = await service
        .from('material_distribucion_mensual')
        .upsert(
          {
            cuenta_cliente_id: lote.cuenta_cliente_id,
            lote_id: lote.id,
            pdv_id: pdvId,
            supervisor_empleado_id: supervisorEmpleadoId,
            mes_operacion: confirmedMonth,
            estado: 'PENDIENTE_RECEPCION',
            cadena_snapshot: item.cadena,
            id_pdv_cadena_snapshot: item.idPdvCadena,
            sucursal_snapshot: item.sucursal,
            nombre_dc_snapshot: item.nombreDc,
            territorio_snapshot: item.territorio,
            hoja_origen: hojaOrigen,
            metadata: {
              creado_desde: 'confirmacion_lote_materiales',
              lote_id: lote.id,
              id_nomina_dc_snapshot: item.idNominaDc,
              vacante_excel: !item.idNominaDc,
              row_numbers: item.rowNumbers,
              sheet_names: item.sheetNames,
            },
          },
          { onConflict: 'lote_id,pdv_id' }
        )
        .select('id')
        .maybeSingle()

      if (distributionError || !distributionRaw?.id) {
        throw new Error(
          distributionError?.message ?? `No fue posible crear la distribución para ${item.sucursal ?? pdvId}.`
        )
      }

      confirmedPackageCount += 1

      for (const [, totals] of materialTotals.entries()) {
        const rule = totals.rule
        const catalog = catalogByName.get(rule.displayName)
        if (!catalog) {
          throw new Error(`No se encontro el material ${rule.displayName} en el catalogo del lote.`)
        }

        const { error: detailError } = await service
          .from('material_distribucion_detalle')
          .upsert(
            {
              distribucion_id: distributionRaw.id,
              material_catalogo_id: catalog.id,
              cantidad_enviada: totals.quantity,
              material_nombre_snapshot: rule.displayName,
              material_tipo_mes: rule.materialType,
              mecanica_canje: rule.mecanicaCanje,
              indicaciones_producto: rule.indicacionesProducto,
              instrucciones_mercadeo: rule.instruccionesMercadeo,
              requiere_ticket_mes: rule.flags.requiereTicketMes,
              requiere_evidencia_entrega_mes: rule.flags.requiereEvidenciaEntregaMes,
              requiere_evidencia_mercadeo: rule.flags.requiereEvidenciaMercadeo,
              es_regalo_dc: rule.flags.esRegaloDc,
              excluir_de_registrar_entrega: rule.flags.excluirDeRegistrarEntrega,
              total_columna_hoja: totals.totalColumn,
              metadata: {
                lote_id: lote.id,
                material_key: totals.materialKeys[0] ?? null,
                material_keys: totals.materialKeys,
                block_names: totals.blockNames,
                sheet_names: totals.sheetNames,
                row_numbers: totals.rowNumbers,
              },
            },
            { onConflict: 'distribucion_id,material_catalogo_id' }
          )

        if (detailError) {
          throw new Error(detailError.message ?? `No fue posible crear el detalle para ${rule.displayName}.`)
        }
      }
    }

    if (confirmedPackageCount === 0) {
      throw new Error('Los productos seleccionados no generan dispersiones válidas para ningún PDV del lote.')
    }

    const { error: updateLotError } = await service
      .from('material_distribucion_lote')
      .update({
        mes_operacion: confirmedMonth,
        estado: 'CONFIRMADO',
        confirmado_por_usuario_id: actor.usuarioId,
        confirmado_en: new Date().toISOString(),
        resumen: buildSummaryForLot({
          ...preview,
          resolvedMonth: confirmedMonth,
        }),
        metadata: {
          confirmado_desde: 'materiales_confirmar_lote',
          confirmado_por_nombre: actor.nombreCompleto,
        },
      })
      .eq('id', lote.id)

    if (updateLotError) {
      throw new Error(updateLotError.message ?? 'No fue posible cerrar la confirmación del lote.')
    }

    await insertAuditLog(service, {
      tabla: 'material_distribucion_lote',
      registroId: lote.id,
      payload: {
        evento: 'lote_materiales_confirmado',
        mes_operacion: confirmedMonth,
        pdv_count: confirmedPackageCount,
      },
      usuarioId: actor.usuarioId,
      cuentaClienteId: lote.cuenta_cliente_id,
    })

    revalidatePath('/materiales')
    revalidatePath('/dashboard')
    revalidatePath('/reportes')
    return buildState({ ok: true, message: 'Lote mensual confirmado. La dispersión quedó pendiente de recepción.' })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible confirmar el lote mensual.',
    })
  }
}

export async function descartarPreviewMateriales(
  _prevState: MaterialActionState,
  formData: FormData
): Promise<MaterialActionState> {
  try {
    const actor = await requerirPuestosActivos([...MATERIALES_ADMIN_ROLES])
    const service = createServiceClient() as TypedSupabaseClient
    const loteId = normalizeRequiredText(formData.get('lote_id'), 'Preview de dispersión')

    const { data: loteRaw, error: lotError } = await service
      .from('material_distribucion_lote')
      .select('id, cuenta_cliente_id, estado, created_by_usuario_id')
      .eq('id', loteId)
      .maybeSingle()

    const lote = loteRaw as {
      id: string
      cuenta_cliente_id: string
      estado: 'BORRADOR_PREVIEW' | 'CONFIRMADO' | 'CANCELADO'
      created_by_usuario_id: string | null
    } | null

    if (lotError || !lote) {
      throw new Error(lotError?.message ?? 'No fue posible localizar el preview a descartar.')
    }

    if (lote.estado !== 'BORRADOR_PREVIEW') {
      throw new Error('Este preview ya no está activo y no se puede descartar.')
    }

    if (lote.created_by_usuario_id && lote.created_by_usuario_id !== actor.usuarioId) {
      throw new Error('Solo puedes descartar previews generados por tu usuario.')
    }

    const { error: discardError } = await service
      .from('material_distribucion_lote')
      .update({
        estado: 'CANCELADO',
        metadata: {
          cancelado_desde: 'descartar_preview_materiales',
          cancelado_por_usuario_id: actor.usuarioId,
          cancelado_por_nombre: actor.nombreCompleto,
          cancelado_en: new Date().toISOString(),
        },
      })
      .eq('id', lote.id)

    if (discardError) {
      throw new Error(discardError.message ?? 'No fue posible descartar el preview.')
    }

    await insertAuditLog(service, {
      tabla: 'material_distribucion_lote',
      registroId: lote.id,
      payload: {
        evento: 'preview_lote_materiales_descartado',
      },
      usuarioId: actor.usuarioId,
      cuentaClienteId: lote.cuenta_cliente_id,
    })

    revalidatePath('/materiales')
    return buildState({ ok: true, message: 'Preview descartado. Ya puedes cargar un nuevo archivo.' })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible descartar el preview.',
    })
  }
}

export async function confirmarRecepcionMaterial(
  _prevState: MaterialActionState,
  formData: FormData
): Promise<MaterialActionState> {
  try {
    const actor = await requerirPuestosActivos(['DERMOCONSEJERO', 'ADMINISTRADOR'])
    const service = createServiceClient() as TypedSupabaseClient
    const distribucionId = normalizeRequiredText(formData.get('distribucion_id'), 'Distribución')
    const cuentaClienteId = normalizeRequiredText(formData.get('cuenta_cliente_id'), 'Cuenta cliente')
    const firmaFile =
      asUploadedFile(formData.get('firma_recepcion')) ??
      (() => {
        const firmaDataUrl = asOptionalDataUrl(formData.get('firma_recepcion_data_url'))
        return firmaDataUrl ? fileFromDataUrl(firmaDataUrl, 'firma-recepcion-materiales') : null
      })()
    const fotoFile =
      asUploadedFile(formData.get('foto_recepcion')) ??
      (() => {
        const fotoDataUrl = asOptionalDataUrl(formData.get('foto_recepcion_data_url'))
        return fotoDataUrl ? fileFromDataUrl(fotoDataUrl, 'foto-recepcion-materiales') : null
      })()
    const fotoCapturadaEn = normalizeOptionalText(formData.get('foto_recepcion_capturada_en'))
    const observaciones = normalizeOptionalText(formData.get('observaciones'))

    if (!firmaFile) {
      throw new Error('La firma digital es obligatoria para confirmar la recepción.')
    }

    if (!fotoFile) {
      throw new Error('La fotografía de recepción es obligatoria.')
    }

    const { data: distributionRaw, error: distributionError } = await service
      .from('material_distribucion_mensual')
      .select('id, cuenta_cliente_id, pdv_id, lote_id, estado')
      .eq('id', distribucionId)
      .maybeSingle()

    const distribution = distributionRaw as {
      id: string
      cuenta_cliente_id: string
      pdv_id: string
      lote_id: string | null
      estado: string
    } | null

    if (distributionError || !distribution) {
      throw new Error(distributionError?.message ?? 'No fue posible localizar la recepción pendiente.')
    }

    if (!['PENDIENTE_RECEPCION', 'PENDIENTE_ACLARACION'].includes(distribution.estado)) {
      throw new Error('Esta recepción ya fue confirmada y no puede volver a procesarse.')
    }

    const [firma, foto, detalleResult] = await Promise.all([
      uploadMaterialEvidence(service, {
        actorUsuarioId: actor.usuarioId,
        cuentaClienteId,
        empleadoId: actor.empleadoId,
        flowPrefix: 'recepcion-firma',
        file: firmaFile,
      }),
      uploadMaterialEvidence(service, {
        actorUsuarioId: actor.usuarioId,
        cuentaClienteId,
        empleadoId: actor.empleadoId,
        flowPrefix: 'recepcion-foto',
        file: fotoFile,
      }),
      service
        .from('material_distribucion_detalle')
        .select('id, distribucion_id, material_catalogo_id, cantidad_recibida, cantidad_entregada, cantidad_observada, requiere_ticket_mes, requiere_evidencia_entrega_mes, requiere_evidencia_mercadeo, es_regalo_dc, excluir_de_registrar_entrega, material_nombre_snapshot, material_tipo_mes, cantidad_enviada')
        .eq('distribucion_id', distribucionId)
        .limit(500),
    ])

    if (detalleResult.error) {
      throw new Error(detalleResult.error.message ?? 'No fue posible consultar el checklist de recepción.')
    }

    const detalleRows = (detalleResult.data ?? []) as Array<MaterialDetalleSaldoRow & { cantidad_enviada: number }>
    let tieneObservaciones = false
    const receiptMovements: Array<Record<string, unknown>> = []

    for (const row of detalleRows) {
      const cantidadRecibida = normalizeZeroOrPositiveInteger(
        formData.get(`cantidad_recibida__${row.id}`),
        'Cantidad recibida'
      )
      const cantidadObservada = normalizeZeroOrPositiveInteger(
        formData.get(`cantidad_observada__${row.id}`),
        'Cantidad observada'
      )
      const detalleObservacion = normalizeOptionalText(formData.get(`observacion__${row.id}`))

      if (cantidadObservada > 0 || cantidadRecibida < row.cantidad_enviada) {
        tieneObservaciones = true
      }

      const { error: updateError } = await service
        .from('material_distribucion_detalle')
        .update({
          cantidad_recibida: cantidadRecibida,
          cantidad_observada: cantidadObservada,
          observaciones: detalleObservacion,
          metadata: {
            actualizado_desde: 'recepcion_dc',
            confirmado_por_empleado_id: actor.empleadoId,
            confirmado_por_nombre: actor.nombreCompleto,
          },
        })
        .eq('id', row.id)

      if (updateError) {
        throw new Error(updateError.message ?? 'No fue posible actualizar el detalle de recepción.')
      }

      if (!row.excluir_de_registrar_entrega && cantidadRecibida > 0) {
        receiptMovements.push({
          cuenta_cliente_id: cuentaClienteId,
          pdv_id: distribution.pdv_id,
          material_catalogo_id: row.material_catalogo_id,
          lote_id: distribution.lote_id,
          distribucion_id: distribucionId,
          distribucion_detalle_id: row.id,
          empleado_id: actor.empleadoId,
          tipo_movimiento: 'RECEPCION_LOTE',
          sentido: 'ENTRADA',
          cantidad: cantidadRecibida,
          cantidad_delta: cantidadRecibida,
          motivo: row.material_nombre_snapshot ?? 'Recepción de material',
          observaciones: detalleObservacion,
          metadata: {
            material_tipo_mes: row.material_tipo_mes,
          },
        })
      }
    }

    if (receiptMovements.length > 0) {
      await service
        .from('material_inventario_movimiento')
        .delete()
        .eq('distribucion_id', distribucionId)
        .eq('tipo_movimiento', 'RECEPCION_LOTE')

      const { error: movementError } = await service.from('material_inventario_movimiento').insert(receiptMovements)
      if (movementError) {
        throw new Error(movementError.message ?? 'No fue posible crear el inventario inicial del lote.')
      }
    }

    const now = new Date().toISOString()
    const fotoCapturedAt =
      fotoCapturadaEn && !Number.isNaN(Date.parse(fotoCapturadaEn)) ? new Date(fotoCapturadaEn).toISOString() : now
    const estado = tieneObservaciones ? 'RECIBIDA_CON_OBSERVACIONES' : 'RECIBIDA_CONFORME'
    const { error: distributionUpdateError } = await service
      .from('material_distribucion_mensual')
      .update({
        estado,
        confirmado_por_empleado_id: actor.empleadoId,
        confirmado_en: now,
        firma_recepcion_url: firma.url,
        firma_recepcion_hash: firma.hash,
        foto_recepcion_url: foto.url,
        foto_recepcion_hash: foto.hash,
        foto_recepcion_capturada_en: fotoCapturedAt,
        observaciones,
        metadata: {
          confirmado_desde: 'modulo_dermoconsejo',
          confirmado_por_usuario_id: actor.usuarioId,
          confirmado_por_nombre: actor.nombreCompleto,
          firma_thumbnail_url: firma.thumbnailUrl,
          foto_thumbnail_url: foto.thumbnailUrl,
        },
      })
      .eq('id', distribucionId)

    if (distributionUpdateError) {
      throw new Error(distributionUpdateError.message ?? 'No fue posible cerrar la recepción.')
    }

    await insertAuditLog(service, {
      tabla: 'material_distribucion_mensual',
      registroId: distribucionId,
      payload: {
        evento: 'recepcion_material_confirmada',
        estado,
        confirmado_por: actor.nombreCompleto,
      },
      usuarioId: actor.usuarioId,
      cuentaClienteId,
    })

    revalidatePath('/materiales')
    revalidatePath('/dashboard')
    revalidatePath('/reportes')
    return buildState({ ok: true, message: 'Recepción formal confirmada en tienda.' })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible confirmar la recepción.',
    })
  }
}

export async function registrarEntregaPromocional(
  _prevState: MaterialActionState,
  formData: FormData
): Promise<MaterialActionState> {
  try {
    const actor = await requerirPuestosActivos([...MATERIALES_DELIVERY_ROLES])
    const service = createServiceClient() as TypedSupabaseClient
    const cuentaClienteId = normalizeRequiredText(formData.get('cuenta_cliente_id'), 'Cuenta cliente')
    const pdvId = normalizeRequiredText(formData.get('pdv_id'), 'PDV')
    const distribucionId = normalizeOptionalText(formData.get('distribucion_id'))
    const distribucionDetalleId = normalizeRequiredText(
      formData.get('distribucion_detalle_id'),
      'Material del inventario'
    )
    const materialCatalogoId = normalizeRequiredText(formData.get('material_catalogo_id'), 'Material')
    const cantidadEntregada = normalizePositiveInteger(formData.get('cantidad_entregada'), 'Cantidad entregada')
    const observaciones = normalizeOptionalText(formData.get('observaciones'))
    const evidenciaMaterial =
      asUploadedFile(formData.get('evidencia_material')) ??
      (() => {
        const dataUrl = asOptionalDataUrl(formData.get('evidencia_material_data_url'))
        return dataUrl ? fileFromDataUrl(dataUrl, 'evidencia-material') : null
      })()
    const evidenciaPdv =
      asUploadedFile(formData.get('evidencia_pdv')) ??
      (() => {
        const dataUrl = asOptionalDataUrl(formData.get('evidencia_pdv_data_url'))
        return dataUrl ? fileFromDataUrl(dataUrl, 'evidencia-pdv') : null
      })()
    const ticketCompra =
      asUploadedFile(formData.get('ticket_compra')) ??
      (() => {
        const dataUrl = asOptionalDataUrl(formData.get('ticket_compra_data_url'))
        return dataUrl ? fileFromDataUrl(dataUrl, 'ticket-compra') : null
      })()
    const evidenciaMaterialCapturadaEn = normalizeIsoDateTimeValue(
      normalizeOptionalText(formData.get('evidencia_material_capturada_en'))
    )
    const evidenciaPdvCapturadaEn = normalizeIsoDateTimeValue(
      normalizeOptionalText(formData.get('evidencia_pdv_capturada_en'))
    )
    const ticketCompraCapturadoEn = normalizeIsoDateTimeValue(
      normalizeOptionalText(formData.get('ticket_compra_capturada_en'))
    )

    if (!evidenciaMaterial || !evidenciaPdv) {
      throw new Error('Debes subir la foto del promocional y la foto dentro del punto de venta.')
    }

    const { data: detalleRaw, error: detailError } = await service
      .from('material_distribucion_detalle')
      .select('id, distribucion_id, material_catalogo_id, cantidad_recibida, cantidad_entregada, cantidad_observada, requiere_ticket_mes, requiere_evidencia_entrega_mes, requiere_evidencia_mercadeo, es_regalo_dc, excluir_de_registrar_entrega, material_nombre_snapshot, material_tipo_mes')
      .eq('id', distribucionDetalleId)
      .maybeSingle()
    const detalle = detalleRaw as MaterialDetalleSaldoRow | null

    if (detailError || !detalle?.id) {
      throw new Error(detailError?.message ?? 'No fue posible validar el saldo disponible del material.')
    }

    if (detalle.excluir_de_registrar_entrega || detalle.es_regalo_dc) {
      throw new Error('Este material esta excluido de registrar entrega al cliente final.')
    }

    const saldoDetalle = Math.max(
      Number(detalle.cantidad_recibida ?? 0) - Number(detalle.cantidad_entregada ?? 0),
      0
    )
    const { data: movementRowsRaw, error: movementsError } = await service
      .from('material_inventario_movimiento')
      .select('cantidad_delta')
      .eq('pdv_id', pdvId)
      .eq('material_catalogo_id', materialCatalogoId)
      .limit(2000)

    if (movementsError) {
      throw new Error(movementsError.message ?? 'No fue posible validar el inventario actual del PDV.')
    }

    const saldoInventario = sumInventoryBalance((movementRowsRaw ?? []) as Array<{ cantidad_delta: number }>)
    const saldoDisponible = Math.max(Math.min(saldoDetalle, saldoInventario), 0)
    if (cantidadEntregada > saldoDisponible) {
      throw new Error(`Solo hay ${saldoDisponible} pieza(s) disponible(s) para este material.`)
    }

    if (detalle.requiere_ticket_mes && !ticketCompra) {
      throw new Error('Este material requiere ticket de compra como evidencia obligatoria.')
    }

    const [evidenciaPromocionalStored, evidenciaPdvStored, ticketStored] = await Promise.all([
      uploadMaterialEvidence(service, {
        actorUsuarioId: actor.usuarioId,
        cuentaClienteId,
        empleadoId: actor.empleadoId,
        flowPrefix: 'entrega-promocional',
        file: evidenciaMaterial,
      }),
      uploadMaterialEvidence(service, {
        actorUsuarioId: actor.usuarioId,
        cuentaClienteId,
        empleadoId: actor.empleadoId,
        flowPrefix: 'entrega-pdv',
        file: evidenciaPdv,
      }),
      ticketCompra
        ? uploadMaterialEvidence(service, {
            actorUsuarioId: actor.usuarioId,
            cuentaClienteId,
            empleadoId: actor.empleadoId,
            flowPrefix: 'entrega-ticket',
            file: ticketCompra,
          })
        : Promise.resolve(null),
    ])

    const { data: created, error } = await service
      .from('material_entrega_promocional')
      .insert({
        cuenta_cliente_id: cuentaClienteId,
        distribucion_id: distribucionId,
        distribucion_detalle_id: distribucionDetalleId,
        material_catalogo_id: materialCatalogoId,
        empleado_id: actor.empleadoId,
        pdv_id: pdvId,
        cantidad_entregada: cantidadEntregada,
        evidencia_material_url: evidenciaPromocionalStored.url,
        evidencia_material_hash: evidenciaPromocionalStored.hash,
        evidencia_pdv_url: evidenciaPdvStored.url,
        evidencia_pdv_hash: evidenciaPdvStored.hash,
        ticket_compra_url: ticketStored?.url ?? null,
        ticket_compra_hash: ticketStored?.hash ?? null,
        observaciones,
        metadata: {
          capturado_desde: 'modulo_dermoconsejo',
          fecha_captura_local: new Date().toISOString(),
          evidencia_material_capturada_en: evidenciaMaterialCapturadaEn,
          evidencia_pdv_capturada_en: evidenciaPdvCapturadaEn,
          ticket_compra_capturado_en: ticketCompraCapturadoEn,
        },
      })
      .select('id')
      .maybeSingle()

    if (error || !created?.id) {
      throw new Error(error?.message ?? 'No fue posible registrar la entrega del material.')
    }

    const { error: movementInsertError } = await service.from('material_inventario_movimiento').insert({
      cuenta_cliente_id: cuentaClienteId,
      pdv_id: pdvId,
      material_catalogo_id: materialCatalogoId,
      distribucion_id: detalle.distribucion_id,
      distribucion_detalle_id: distribucionDetalleId,
      empleado_id: actor.empleadoId,
      tipo_movimiento: 'ENTREGA_CLIENTE',
      sentido: 'SALIDA',
      cantidad: cantidadEntregada,
      cantidad_delta: -cantidadEntregada,
      motivo: detalle.material_nombre_snapshot ?? 'Entrega a cliente final',
      observaciones,
      metadata: {
        entrega_id: created.id,
      },
    })

    if (movementInsertError) {
      throw new Error(movementInsertError.message ?? 'No fue posible descontar el inventario del PDV.')
    }

    const { error: updateError } = await service
      .from('material_distribucion_detalle')
      .update({
        cantidad_entregada: Number(detalle.cantidad_entregada ?? 0) + cantidadEntregada,
      })
      .eq('id', distribucionDetalleId)

    if (updateError) {
      throw new Error(updateError.message ?? 'No fue posible actualizar el saldo del detalle de dispersión.')
    }

    await insertAuditLog(service, {
      tabla: 'material_entrega_promocional',
      registroId: created.id,
      payload: {
        evento: 'material_entregado_cliente',
        material_catalogo_id: materialCatalogoId,
        cantidad_entregada: cantidadEntregada,
        pdv_id: pdvId,
      },
      usuarioId: actor.usuarioId,
      cuentaClienteId,
    })

    revalidatePath('/materiales')
    revalidatePath('/dashboard')
    revalidatePath('/reportes')
    return buildState({ ok: true, message: 'Entrega de material registrada.' })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible registrar la entrega promocional.',
    })
  }
}

export async function registrarEvidenciaMercadeoMaterial(
  _prevState: MaterialActionState,
  formData: FormData
): Promise<MaterialActionState> {
  try {
    const actor = await requerirPuestosActivos([...MATERIALES_FIELD_ROLES])
    const service = createServiceClient() as TypedSupabaseClient
    const distribucionId = normalizeRequiredText(formData.get('distribucion_id'), 'Dispersión')
    const cuentaClienteId = normalizeRequiredText(formData.get('cuenta_cliente_id'), 'Cuenta cliente')
    const observaciones = normalizeOptionalText(formData.get('observaciones'))
    const photo =
      asUploadedFile(formData.get('foto_mercadeo')) ??
      (() => {
        const photoDataUrl = asOptionalDataUrl(formData.get('foto_mercadeo_data_url'))
        return photoDataUrl ? fileFromDataUrl(photoDataUrl, 'foto-mercadeo-materiales') : null
      })()
    const fotoMercadeoCapturadaEn = normalizeOptionalText(formData.get('foto_mercadeo_capturada_en'))

    if (!photo) {
      throw new Error('La evidencia de mercadeo requiere una foto capturada en el PDV.')
    }

    const [distributionResult, detailResult] = await Promise.all([
      service
        .from('material_distribucion_mensual')
        .select('id, cuenta_cliente_id, lote_id, pdv_id, estado')
        .eq('id', distribucionId)
        .maybeSingle(),
      service
        .from('material_distribucion_detalle')
        .select('id, requiere_evidencia_mercadeo, material_nombre_snapshot')
        .eq('distribucion_id', distribucionId)
        .eq('requiere_evidencia_mercadeo', true)
        .limit(200),
    ])

    const distribution = distributionResult.data as {
      id: string
      cuenta_cliente_id: string
      lote_id: string | null
      pdv_id: string
      estado: string
    } | null

    if (distributionResult.error || !distribution) {
      throw new Error(distributionResult.error?.message ?? 'No fue posible localizar la dispersión del PDV.')
    }

    if (!['RECIBIDA_CONFORME', 'RECIBIDA_CON_OBSERVACIONES'].includes(distribution.estado)) {
      throw new Error('La evidencia de mercadeo se habilita solo después de la recepción formal.')
    }

    const details = (detailResult.data ?? []) as Array<{ id: string; material_nombre_snapshot: string | null }>
    if (details.length === 0) {
      throw new Error('Este lote no tiene materiales marcados con evidencia de mercadeo.')
    }

    const stored = await uploadMaterialEvidence(service, {
      actorUsuarioId: actor.usuarioId,
      cuentaClienteId,
      empleadoId: actor.empleadoId,
      flowPrefix: 'mercadeo',
      file: photo,
    })

    const capturedAt =
      fotoMercadeoCapturadaEn && !Number.isNaN(Date.parse(fotoMercadeoCapturadaEn))
        ? new Date(fotoMercadeoCapturadaEn).toISOString()
        : new Date().toISOString()

    const payload = {
      cuenta_cliente_id: cuentaClienteId,
      lote_id: distribution.lote_id,
      distribucion_id: distribution.id,
      pdv_id: distribution.pdv_id,
      empleado_id: actor.empleadoId,
      distribucion_detalle_ids: details.map((item) => item.id),
      foto_url: stored.url,
      foto_hash: stored.hash,
      foto_capturada_en: capturedAt,
      observaciones,
      metadata: {
        materiales_cubiertos: details.map((item) => item.material_nombre_snapshot ?? item.id),
        capturado_desde: 'materiales_mercadeo',
      },
    }

    const { data: existingEvidence, error: existingEvidenceError } = await service
      .from('material_evidencia_mercadeo')
      .select('id')
      .eq('distribucion_id', distribution.id)
      .maybeSingle()

    if (existingEvidenceError) {
      throw new Error(existingEvidenceError.message ?? 'No fue posible validar la evidencia previa de mercadeo.')
    }

    const result = existingEvidence?.id
      ? await service
          .from('material_evidencia_mercadeo')
          .update(payload)
          .eq('id', existingEvidence.id)
          .select('id')
          .maybeSingle()
      : await service
          .from('material_evidencia_mercadeo')
          .insert(payload)
          .select('id')
          .maybeSingle()

    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message ?? 'No fue posible guardar la evidencia de mercadeo.')
    }

    await insertAuditLog(service, {
      tabla: 'material_evidencia_mercadeo',
      registroId: result.data.id,
      payload: {
        evento: 'evidencia_mercadeo_cargada',
        distribucion_id: distribution.id,
        total_materiales: details.length,
      },
      usuarioId: actor.usuarioId,
      cuentaClienteId,
    })

    revalidatePath('/materiales')
    revalidatePath('/dashboard')
    revalidatePath('/reportes')
    return buildState({ ok: true, message: 'Evidencia de mercadeo registrada.' })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible registrar la evidencia de mercadeo.',
    })
  }
}

export async function registrarConteoJornadaMaterial(
  _prevState: MaterialActionState,
  formData: FormData
): Promise<MaterialActionState> {
  try {
    const actor = await requerirPuestosActivos(['DERMOCONSEJERO', 'ADMINISTRADOR'])
    const service = createServiceClient() as TypedSupabaseClient
    const cuentaClienteId = normalizeRequiredText(formData.get('cuenta_cliente_id'), 'Cuenta cliente')
    const pdvId = normalizeRequiredText(formData.get('pdv_id'), 'PDV')
    const fechaOperacion = normalizeRequiredText(formData.get('fecha_operacion'), 'Fecha de operación')
    const momento = normalizeRequiredText(formData.get('momento'), 'Momento de conteo') as 'APERTURA' | 'CIERRE'
    const observaciones = normalizeOptionalText(formData.get('observaciones'))
    const clasificacionDiferencia = normalizeOptionalText(formData.get('clasificacion_diferencia'))
    const observacionDiferencia = normalizeOptionalText(formData.get('observacion_diferencia'))

    if (!['APERTURA', 'CIERRE'].includes(momento)) {
      throw new Error('El momento del conteo debe ser APERTURA o CIERRE.')
    }

    const { data: movementRowsRaw, error: movementError } = await service
      .from('material_inventario_movimiento')
      .select('material_catalogo_id, cantidad_delta, material_catalogo:material_catalogo_id(id, nombre, tipo)')
      .eq('pdv_id', pdvId)
      .limit(4000)

    if (movementError) {
      throw new Error(movementError.message ?? 'No fue posible consultar el inventario del PDV.')
    }

    const movements = (movementRowsRaw ?? []) as Array<{
      material_catalogo_id: string
      cantidad_delta: number
      material_catalogo:
        | { id: string; nombre: string; tipo: string }
        | { id: string; nombre: string; tipo: string }[]
        | null
    }>

    const balanceByMaterial = new Map<string, { balance: number; nombre: string; tipo: string }>()
    for (const row of movements) {
      const material = Array.isArray(row.material_catalogo) ? row.material_catalogo[0] : row.material_catalogo
      if (!material) {
        continue
      }
      const current = balanceByMaterial.get(row.material_catalogo_id) ?? {
        balance: 0,
        nombre: material.nombre,
        tipo: material.tipo,
      }
      current.balance += Number(row.cantidad_delta ?? 0)
      balanceByMaterial.set(row.material_catalogo_id, current)
    }

    if (balanceByMaterial.size === 0) {
      throw new Error('No hay materiales inventariables para contar en este PDV.')
    }

    const { data: conteoRaw, error: conteoError } = await service
      .from('material_conteo_jornada')
      .upsert(
        {
          cuenta_cliente_id: cuentaClienteId,
          pdv_id: pdvId,
          empleado_id: actor.empleadoId,
          fecha_operacion: fechaOperacion,
          momento,
          observaciones,
          metadata: {
            capturado_desde: 'materiales_conteo_jornada',
          },
        },
        { onConflict: 'pdv_id,fecha_operacion,momento' }
      )
      .select('id')
      .maybeSingle()

    if (conteoError || !conteoRaw?.id) {
      throw new Error(conteoError?.message ?? 'No fue posible guardar el conteo de jornada.')
    }

    const conteoId = conteoRaw.id
    const detailPayload: Array<Record<string, unknown>> = []
    const neutralMovements: Array<Record<string, unknown>> = []

    for (const [materialCatalogoId, summary] of balanceByMaterial.entries()) {
      const cantidadContada = normalizeZeroOrPositiveInteger(
        formData.get(`conteo__${materialCatalogoId}`),
        `Conteo de ${summary.nombre}`
      )
      detailPayload.push({
        conteo_id: conteoId,
        material_catalogo_id: materialCatalogoId,
        cantidad_contada: cantidadContada,
        diferencia_detectada: null,
        metadata: {
          nombre_material: summary.nombre,
          tipo_material: summary.tipo,
        },
      })
      neutralMovements.push({
        cuenta_cliente_id: cuentaClienteId,
        pdv_id: pdvId,
        material_catalogo_id: materialCatalogoId,
        conteo_jornada_id: conteoId,
        empleado_id: actor.empleadoId,
        tipo_movimiento: momento === 'APERTURA' ? 'APERTURA_JORNADA' : 'CIERRE_JORNADA',
        sentido: 'NEUTRO',
        cantidad: cantidadContada,
        cantidad_delta: 0,
        motivo: `Conteo de ${momento.toLowerCase()}`,
        observaciones,
        metadata: {
          nombre_material: summary.nombre,
        },
      })
    }

    await service
      .from('material_inventario_movimiento')
      .delete()
      .eq('conteo_jornada_id', conteoId)
      .in('tipo_movimiento', ['APERTURA_JORNADA', 'CIERRE_JORNADA', 'AJUSTE_FUERA_TURNO', 'MERMA'])

    const { error: detailUpsertError } = await service
      .from('material_conteo_jornada_detalle')
      .upsert(detailPayload, { onConflict: 'conteo_id,material_catalogo_id' })

    if (detailUpsertError) {
      throw new Error(detailUpsertError.message ?? 'No fue posible guardar el detalle del conteo.')
    }

    const openingAdjustments: Array<Record<string, unknown>> = []
    if (momento === 'APERTURA') {
      const { data: previousCloseRaw, error: previousCloseError } = await service
        .from('material_conteo_jornada')
        .select('id, fecha_operacion')
        .eq('pdv_id', pdvId)
        .eq('momento', 'CIERRE')
        .lt('fecha_operacion', fechaOperacion)
        .order('fecha_operacion', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (previousCloseError) {
        throw new Error(previousCloseError.message ?? 'No fue posible consultar el cierre anterior.')
      }

      if (previousCloseRaw?.id) {
        const { data: previousDetailsRaw, error: previousDetailsError } = await service
          .from('material_conteo_jornada_detalle')
          .select('material_catalogo_id, cantidad_contada')
          .eq('conteo_id', previousCloseRaw.id)
          .limit(500)

        if (previousDetailsError) {
          throw new Error(previousDetailsError.message ?? 'No fue posible comparar contra el cierre previo.')
        }

        const previousByMaterial = new Map(
          (
            (previousDetailsRaw ?? []) as Array<{
              material_catalogo_id: string
              cantidad_contada: number
            }>
          ).map((item) => [item.material_catalogo_id, item.cantidad_contada])
        )

        let hasDifference = false
        for (const item of detailPayload) {
          const materialCatalogoId = String(item.material_catalogo_id)
          const currentCount = Number(item.cantidad_contada)
          const previousCount = Number(previousByMaterial.get(materialCatalogoId) ?? 0)
          const delta = currentCount - previousCount
          if (delta === 0) {
            continue
          }
          hasDifference = true

          openingAdjustments.push({
            cuenta_cliente_id: cuentaClienteId,
            pdv_id: pdvId,
            material_catalogo_id: materialCatalogoId,
            conteo_jornada_id: conteoId,
            empleado_id: actor.empleadoId,
            tipo_movimiento: clasificacionDiferencia === 'MERMA' ? 'MERMA' : 'AJUSTE_FUERA_TURNO',
            sentido: delta > 0 ? 'ENTRADA' : 'SALIDA',
            cantidad: Math.abs(delta),
            cantidad_delta: delta,
            motivo: observacionDiferencia ?? 'Diferencia entre cierre y apertura',
            observaciones: observacionDiferencia,
            metadata: {
              clasificacion_diferencia: clasificacionDiferencia ?? 'AJUSTE_FUERA_TURNO',
              fecha_cierre_referencia: previousCloseRaw.fecha_operacion,
            },
          })
        }

        if (hasDifference && (!clasificacionDiferencia || !observacionDiferencia)) {
          throw new Error('La apertura tiene diferencias contra el cierre previo; registra clasificación y explicación.')
        }
      }
    }

    const allMovements = [...neutralMovements, ...openingAdjustments]
    if (allMovements.length > 0) {
      const { error: insertMovementError } = await service.from('material_inventario_movimiento').insert(allMovements)
      if (insertMovementError) {
        throw new Error(insertMovementError.message ?? 'No fue posible registrar el conteo en el ledger de inventario.')
      }
    }

    await insertAuditLog(service, {
      tabla: 'material_conteo_jornada',
      registroId: conteoId,
      payload: {
        evento: 'conteo_jornada_material_registrado',
        momento,
        fecha_operacion: fechaOperacion,
      },
      usuarioId: actor.usuarioId,
      cuentaClienteId,
    })

    revalidatePath('/materiales')
    revalidatePath('/dashboard')
    revalidatePath('/reportes')
    return buildState({ ok: true, message: `Conteo de ${momento.toLowerCase()} registrado.` })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible registrar el conteo de jornada.',
    })
  }
}
