'use server'

import { revalidatePath } from 'next/cache'
import { requerirPuestosActivos } from '@/lib/auth/session'
import {
  buildOperationalDocumentUploadLimitMessage,
  EXPEDIENTE_RAW_UPLOAD_MAX_BYTES,
  exceedsOperationalDocumentUploadLimit,
} from '@/lib/files/documentOptimization'
import { computeSHA256 } from '@/lib/files/sha256'
import { storeOptimizedEvidence } from '@/lib/files/evidenceStorage'
import { createServiceClient } from '@/lib/supabase/server'
import { hasDirectR2Reference, readDirectR2Reference, registerDirectR2Evidence } from '@/lib/storage/directR2Server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CuentaCliente, Gasto, Puesto } from '@/types/database'
import { ESTADO_GASTO_INICIAL, type GastoActionState } from './state'

const GASTO_WRITE_ROLES = [
  'ADMINISTRADOR',
  'NOMINA',
  'SUPERVISOR',
  'COORDINADOR',
  'LOGISTICA',
] as const satisfies Puesto[]

const GASTO_APPROVAL_ROLES = ['ADMINISTRADOR', 'NOMINA', 'SUPERVISOR', 'COORDINADOR'] as const satisfies Puesto[]
const GASTOS_BUCKET = 'operacion-evidencias'
const GASTO_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

interface GastoComprobanteUpload {
  url: string
  hash: string
  thumbnailUrl: string | null
  thumbnailHash: string | null
  optimization: {
    kind: string
    originalBytes: number
    finalBytes: number
    targetMet: boolean
    notes: string[]
    officialAssetKind: 'optimized' | 'original'
  }
}

type GastoMetadata = Record<string, unknown>
type PeriodoNominaAbiertoRow = {
  id: string
  clave: string
}
type LedgerReferenciaRow = {
  id: string
}
type GastoApprovalRow = Pick<
  Gasto,
  'id' | 'cuenta_cliente_id' | 'empleado_id' | 'supervisor_empleado_id' | 'monto' | 'moneda' | 'estatus' | 'metadata'
>

function buildState(partial: Partial<GastoActionState>): GastoActionState {
  return {
    ...ESTADO_GASTO_INICIAL,
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

function normalizeMetadata(value: unknown): GastoMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as GastoMetadata
}

function normalizeEstatus(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim().toUpperCase()

  if (!['PENDIENTE', 'APROBADO', 'RECHAZADO', 'REEMBOLSADO'].includes(normalized)) {
    throw new Error('El estatus seleccionado no es valido.')
  }

  return normalized as Gasto['estatus']
}

function normalizeNumber(value: FormDataEntryValue | null, label: string) {
  const parsed = Number(String(value ?? '').trim())

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} debe ser numerico y mayor o igual a cero.`)
  }

  return parsed
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

async function resolvePeriodoNominaAbierto(service: TypedSupabaseClient) {
  const { data, error } = await service
    .from('nomina_periodo')
    .select('id, clave')
    .eq('estado', 'BORRADOR')
    .order('fecha_inicio', { ascending: false })
    .maybeSingle()

  const periodo = data as PeriodoNominaAbiertoRow | null

  if (error || !periodo) {
    throw new Error('No hay un periodo de nomina abierto para registrar el reembolso.')
  }

  return periodo
}

async function ensureReembolsoLedger(
  service: TypedSupabaseClient,
  {
    actorUsuarioId,
    gasto,
    cuentaClienteId,
  }: {
    actorUsuarioId: string
    gasto: GastoApprovalRow
    cuentaClienteId: string
  }
) {
  const { data: existingLedger } = await service
    .from('nomina_ledger')
    .select('id')
    .eq('referencia_tabla', 'gasto')
    .eq('referencia_id', gasto.id)
    .maybeSingle()

  const ledger = existingLedger as LedgerReferenciaRow | null

  if (ledger?.id) {
    return ledger.id
  }

  const periodo = await resolvePeriodoNominaAbierto(service)

  const { data: insertedLedger, error } = await service
    .from('nomina_ledger')
    .insert({
      periodo_id: periodo.id,
      cuenta_cliente_id: cuentaClienteId,
      empleado_id: gasto.empleado_id,
      tipo_movimiento: 'PERCEPCION',
      concepto: 'REEMBOLSO_GASTO',
      referencia_tabla: 'gasto',
      referencia_id: gasto.id,
      monto: gasto.monto,
      moneda: gasto.moneda,
      notas: `Reembolso operativo ligado al gasto ${gasto.id}.`,
      metadata: {
        fuente: 'gasto_reembolsado',
        creado_por_usuario_id: actorUsuarioId,
        periodo_clave: periodo.clave,
      },
    })
    .select('id')
    .maybeSingle()

  if (error || !insertedLedger?.id) {
    throw new Error(error?.message ?? 'No fue posible registrar el reembolso en nomina_ledger.')
  }

  return insertedLedger.id as string
}

async function ensureBucket(service: TypedSupabaseClient) {
  const { error } = await service.storage.createBucket(GASTOS_BUCKET, {
    public: false,
    fileSizeLimit: `${EXPEDIENTE_RAW_UPLOAD_MAX_BYTES}`,
    allowedMimeTypes: GASTO_ALLOWED_MIME_TYPES,
  })

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error
  }
}

function asUploadedFile(value: FormDataEntryValue | null) {
  if (!value || typeof value === 'string' || !(value instanceof File) || value.size === 0) {
    return null
  }

  return value
}

async function uploadComprobanteGasto(
  service: TypedSupabaseClient,
  {
    actorUsuarioId,
    cuentaClienteId,
    empleadoId,
    file,
  }: {
    actorUsuarioId: string
    cuentaClienteId: string
    empleadoId: string
    file: File
  }
): Promise<GastoComprobanteUpload> {
  if (exceedsOperationalDocumentUploadLimit(file)) {
    throw new Error(buildOperationalDocumentUploadLimitMessage('comprobante', file))
  }

  if (!GASTO_ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error('El comprobante debe ser imagen JPEG/PNG/WEBP o PDF.')
  }

  await ensureBucket(service)
  const stored = await storeOptimizedEvidence({
    service,
    bucket: GASTOS_BUCKET,
    actorUsuarioId,
    storagePrefix: `gastos/${cuentaClienteId}/${empleadoId}`,
    file,
  })

  return {
    url: stored.archivo.url,
    hash: stored.archivo.hash,
    thumbnailUrl: stored.miniatura?.url ?? null,
    thumbnailHash: stored.miniatura?.hash ?? null,
    optimization: {
      kind: stored.optimization.optimizationKind,
      originalBytes: stored.optimization.originalBytes,
      finalBytes: stored.optimization.optimizedBytes,
      targetMet: stored.optimization.targetMet,
      notes: stored.optimization.notes,
      officialAssetKind: stored.optimization.officialAssetKind,
    },
  }
}

export async function registrarGastoOperativo(
  _prevState: GastoActionState,
  formData: FormData
): Promise<GastoActionState> {
  try {
    const actor = await requerirPuestosActivos(GASTO_WRITE_ROLES)
    const service = createServiceClient() as TypedSupabaseClient
    const cuentaClienteId = normalizeRequiredText(formData.get('cuenta_cliente_id'), 'Cuenta cliente')
    const empleadoId = normalizeOptionalText(formData.get('empleado_id')) ?? actor.empleadoId
    const supervisorEmpleadoId = normalizeOptionalText(formData.get('supervisor_empleado_id'))
    const pdvId = normalizeOptionalText(formData.get('pdv_id'))
    const formacionEventoId = normalizeOptionalText(formData.get('formacion_evento_id'))
    const tipo = normalizeRequiredText(formData.get('tipo'), 'Tipo de gasto')
    const monto = normalizeNumber(formData.get('monto'), 'Monto')
    const fechaGasto = normalizeRequiredText(formData.get('fecha_gasto'), 'Fecha de gasto')
    const notas = normalizeOptionalText(formData.get('notas'))

    // Phase 2: Intercepcion limpia R2 (Subida Directa)
    const r2Reference = readDirectR2Reference(formData)
    const comprobante = asUploadedFile(formData.get('comprobante'))

    await validarCuentaCliente(service, cuentaClienteId)

    // Cortafuegos: Si el archivo subio directo a R2, no metemos presion a Vercel ni a Supabase Storage
    if (hasDirectR2Reference(r2Reference)) {
      const registered = await registerDirectR2Evidence(service, {
        actorUsuarioId: actor.usuarioId,
        modulo: 'gastos',
        referenciaEntidadId: '',
        reference: r2Reference,
      })

      // 3. Registrar gasto con comprobante R2
      const { data: created, error } = await service
        .from('gasto')
        .insert({
          cuenta_cliente_id: cuentaClienteId,
          empleado_id: empleadoId,
          supervisor_empleado_id: supervisorEmpleadoId,
          pdv_id: pdvId,
          formacion_evento_id: formacionEventoId,
          tipo,
          monto,
          fecha_gasto: fechaGasto,
          comprobante_url: registered.url,
          comprobante_hash: registered.hash,
          estatus: 'PENDIENTE',
          notas,
          metadata: {
            capturado_desde: 'panel_gastos',
            actor_puesto: actor.puesto,
            tiene_comprobante: true,
            approval_stage: 'PENDIENTE_SUPERVISOR',
            comprobante_optimization: { kind: 'r2_direct', originalBytes: registered.size, finalBytes: registered.size, targetMet: true, notes: ['Subida directa via R2'], officialAssetKind: 'original' },
          },
        })
        .select('id')
        .maybeSingle()

      if (error || !created?.id) {
        throw new Error(error?.message ?? 'No fue posible registrar el gasto.')
      }

      await service.from('audit_log').insert({
        tabla: 'gasto',
        registro_id: created.id,
        accion: 'EVENTO',
        payload: {
          evento: 'gasto_registrado_r2_direct',
          tipo,
          monto,
          empleado_id: empleadoId,
          comprobante: true,
        },
        usuario_id: actor.usuarioId,
        cuenta_cliente_id: cuentaClienteId,
      })

      revalidatePath('/gastos')
      revalidatePath('/reportes')
      revalidatePath('/nomina')

      return buildState({ ok: true, message: 'Comprobante inyectado a la Bodega R2 (Cero Egress).' })
    }

    const comprobanteUpload = comprobante
      ? await uploadComprobanteGasto(service, {
          actorUsuarioId: actor.usuarioId,
          cuentaClienteId,
          empleadoId,
          file: comprobante,
        })
      : null

    const { data: created, error } = await service
      .from('gasto')
      .insert({
        cuenta_cliente_id: cuentaClienteId,
        empleado_id: empleadoId,
        supervisor_empleado_id: supervisorEmpleadoId,
        pdv_id: pdvId,
        formacion_evento_id: formacionEventoId,
        tipo,
        monto,
        fecha_gasto: fechaGasto,
        comprobante_url: comprobanteUpload?.url ?? null,
        comprobante_hash: comprobanteUpload?.hash ?? null,
        estatus: 'PENDIENTE',
        notas,
        metadata: {
          capturado_desde: 'panel_gastos',
          actor_puesto: actor.puesto,
          tiene_comprobante: Boolean(comprobanteUpload),
          approval_stage: 'PENDIENTE_SUPERVISOR',
          comprobante_thumbnail_url: comprobanteUpload?.thumbnailUrl ?? null,
          comprobante_thumbnail_hash: comprobanteUpload?.thumbnailHash ?? null,
          comprobante_optimization: comprobanteUpload?.optimization ?? null,
        },
      })
      .select('id')
      .maybeSingle()

    if (error || !created?.id) {
      throw new Error(error?.message ?? 'No fue posible registrar el gasto.')
    }

    await service.from('audit_log').insert({
      tabla: 'gasto',
      registro_id: created.id,
      accion: 'EVENTO',
      payload: {
        evento: 'gasto_registrado',
        tipo,
        monto,
        empleado_id: empleadoId,
        comprobante: Boolean(comprobanteUpload),
      },
      usuario_id: actor.usuarioId,
      cuenta_cliente_id: cuentaClienteId,
    })

    revalidatePath('/gastos')
    revalidatePath('/reportes')
    revalidatePath('/nomina')

    return buildState({ ok: true, message: 'Gasto operativo registrado.' })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible registrar el gasto.',
    })
  }
}

export async function actualizarEstatusGasto(formData: FormData): Promise<void> {
  const actor = await requerirPuestosActivos(GASTO_APPROVAL_ROLES)
  const service = createServiceClient() as TypedSupabaseClient
  const gastoId = normalizeRequiredText(formData.get('gasto_id'), 'Gasto')
  const cuentaClienteId = normalizeRequiredText(formData.get('cuenta_cliente_id'), 'Cuenta cliente')
  const estatus = normalizeEstatus(formData.get('estatus'))

  await validarCuentaCliente(service, cuentaClienteId)

  const { data: gastoRaw, error: gastoError } = await service
    .from('gasto')
    .select('id, cuenta_cliente_id, empleado_id, supervisor_empleado_id, monto, moneda, estatus, metadata')
    .eq('id', gastoId)
    .eq('cuenta_cliente_id', cuentaClienteId)
    .maybeSingle()

  const gasto = gastoRaw as GastoApprovalRow | null

  if (gastoError || !gasto) {
    throw new Error(gastoError?.message ?? 'No fue posible cargar el gasto para actualizarlo.')
  }

  const metadata = normalizeMetadata(gasto.metadata)
  let nextEstatus = estatus
  let evento = 'gasto_estatus_actualizado'
  let reembolsoLedgerId: string | null = null
  let nextMetadata: GastoMetadata = {
    ...metadata,
    actualizado_desde: 'panel_gastos',
    actor_puesto: actor.puesto,
  }

  if (estatus === 'PENDIENTE') {
    if (gasto.estatus === 'REEMBOLSADO') {
      throw new Error('No se puede regresar a PENDIENTE un gasto ya integrado a nomina como REEMBOLSADO.')
    }

    if (!['ADMINISTRADOR', 'NOMINA'].includes(actor.puesto)) {
      throw new Error('Solo ADMINISTRADOR o NOMINA pueden regresar un gasto a PENDIENTE.')
    }

    nextMetadata = {
      ...nextMetadata,
      approval_stage: 'PENDIENTE_SUPERVISOR',
      primer_nivel_aprobado_en: null,
      primer_nivel_aprobado_por_usuario_id: null,
      primer_nivel_aprobado_por_puesto: null,
      segundo_nivel_aprobado_en: null,
      segundo_nivel_aprobado_por_usuario_id: null,
      segundo_nivel_aprobado_por_puesto: null,
      reembolsado_en: null,
      reembolsado_por_usuario_id: null,
    }
  }

  if (estatus === 'APROBADO') {
    if (actor.puesto === 'SUPERVISOR') {
      if (gasto.estatus !== 'PENDIENTE') {
        throw new Error('El primer nivel de aprobacion solo aplica sobre gastos PENDIENTES.')
      }

      nextEstatus = 'PENDIENTE'
      evento = 'gasto_aprobado_primer_nivel'
      nextMetadata = {
        ...nextMetadata,
        approval_stage: 'PENDIENTE_COORDINADOR',
        primer_nivel_aprobado_en: new Date().toISOString(),
        primer_nivel_aprobado_por_usuario_id: actor.usuarioId,
        primer_nivel_aprobado_por_puesto: actor.puesto,
      }
    } else {
      const primerNivelAprobado = Boolean(metadata.primer_nivel_aprobado_por_usuario_id)

      if (actor.puesto === 'COORDINADOR' && !primerNivelAprobado) {
        throw new Error('COORDINADOR solo puede aprobar despues del visto bueno de SUPERVISOR.')
      }

      evento = 'gasto_aprobado_segundo_nivel'
      nextMetadata = {
        ...nextMetadata,
        approval_stage: 'APROBADO',
        segundo_nivel_aprobado_en: new Date().toISOString(),
        segundo_nivel_aprobado_por_usuario_id: actor.usuarioId,
        segundo_nivel_aprobado_por_puesto: actor.puesto,
      }
    }
  }

  if (estatus === 'REEMBOLSADO' && !['ADMINISTRADOR', 'NOMINA'].includes(actor.puesto)) {
    throw new Error('Solo ADMINISTRADOR o NOMINA pueden marcar un gasto como REEMBOLSADO.')
  }

  if (estatus === 'REEMBOLSADO') {
    if (gasto.estatus !== 'APROBADO') {
      throw new Error('Solo se pueden reembolsar gastos previamente APROBADOS.')
    }

    reembolsoLedgerId = await ensureReembolsoLedger(service, {
      actorUsuarioId: actor.usuarioId,
      gasto,
      cuentaClienteId,
    })

    evento = 'gasto_reembolsado'
    nextMetadata = {
      ...nextMetadata,
      approval_stage: 'REEMBOLSADO',
      reembolsado_en: new Date().toISOString(),
      reembolsado_por_usuario_id: actor.usuarioId,
      reembolso_ledger_id: reembolsoLedgerId,
    }
  }

  if (estatus === 'RECHAZADO') {
    evento = 'gasto_rechazado'
    nextMetadata = {
      ...nextMetadata,
      approval_stage: 'RECHAZADO',
      rechazado_en: new Date().toISOString(),
      rechazado_por_usuario_id: actor.usuarioId,
      rechazado_por_puesto: actor.puesto,
    }
  }

  const { error } = await service
    .from('gasto')
    .update({
      estatus: nextEstatus,
      metadata: nextMetadata,
    })
    .eq('id', gastoId)
    .eq('cuenta_cliente_id', cuentaClienteId)

  if (error) {
    throw new Error(error.message)
  }

  await service.from('audit_log').insert({
    tabla: 'gasto',
    registro_id: gastoId,
    accion: 'EVENTO',
    payload: {
      evento: 'gasto_estatus_actualizado',
      estatus: nextEstatus,
      estatus_solicitado: estatus,
      evento_interno: evento,
      actor_puesto: actor.puesto,
      reembolso_ledger_id: reembolsoLedgerId,
    },
    usuario_id: actor.usuarioId,
    cuenta_cliente_id: cuentaClienteId,
  })

  revalidatePath('/gastos')
  revalidatePath('/reportes')
  revalidatePath('/nomina')
}
