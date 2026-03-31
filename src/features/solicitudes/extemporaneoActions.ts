'use server'

import { revalidatePath } from 'next/cache'
import { requerirPuestosActivos } from '@/lib/auth/session'
import {
  buildOperationalDocumentUploadLimitMessage,
  EXPEDIENTE_RAW_UPLOAD_MAX_BYTES,
  exceedsOperationalDocumentUploadLimit,
} from '@/lib/files/documentOptimization'
import { storeOptimizedEvidence } from '@/lib/files/evidenceStorage'
import { sendOperationalPushNotification } from '@/lib/push/pushFanout'
import { createServiceClient } from '@/lib/supabase/server'
import { registerVentaWithService } from '@/features/ventas/lib/ventaRegistration'
import { registerLoveAffiliationWithService } from '@/features/love-isdin/lib/loveRegistration'
import type { Puesto, RegistroExtemporaneo } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ESTADO_SOLICITUD_INICIAL, type SolicitudActionState } from './state'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

type RegistroExtemporaneoMetadata = Record<string, unknown>

interface ResolvedExtemporaneoContext {
  cuentaClienteId: string
  empleadoId: string
  supervisorEmpleadoId: string
  pdvId: string
  asistenciaId: string
  fechaOperativa: string
}

interface RegistroExtemporaneoRow
  extends Pick<
    RegistroExtemporaneo,
    | 'id'
    | 'cuenta_cliente_id'
    | 'empleado_id'
    | 'supervisor_empleado_id'
    | 'pdv_id'
    | 'asistencia_id'
    | 'fecha_operativa'
    | 'fecha_registro_utc'
    | 'tipo_registro'
    | 'estatus'
    | 'motivo'
    | 'motivo_rechazo'
    | 'evidencia_url'
    | 'evidencia_hash'
    | 'evidencia_thumbnail_url'
    | 'evidencia_thumbnail_hash'
    | 'venta_payload'
    | 'love_payload'
    | 'venta_registro_id'
    | 'love_registro_id'
    | 'metadata'
  > {}

const REGISTRO_EXTEMPORANEO_WRITE_ROLES = ['DERMOCONSEJERO', 'ADMINISTRADOR'] as const satisfies Puesto[]
const REGISTRO_EXTEMPORANEO_APPROVAL_ROLES = ['SUPERVISOR', 'ADMINISTRADOR'] as const satisfies Puesto[]
const REGISTRO_EXTEMPORANEO_BUCKET = 'operacion-evidencias'
const REGISTRO_EXTEMPORANEO_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const REGISTRO_EXTEMPORANEO_MAX_LOOKBACK_DAYS = 5

function buildState(partial: Partial<SolicitudActionState>): SolicitudActionState {
  return {
    ...ESTADO_SOLICITUD_INICIAL,
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

function normalizeMetadata(value: unknown): RegistroExtemporaneoMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as RegistroExtemporaneoMetadata
}

function normalizeRegistroTipo(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim().toUpperCase()

  if (!['VENTA', 'LOVE_ISDIN', 'AMBAS'].includes(normalized)) {
    throw new Error('El tipo de registro extemporaneo no es valido.')
  }

  return normalized as RegistroExtemporaneo['tipo_registro']
}

function normalizePositiveInteger(value: FormDataEntryValue | null, label: string) {
  const numeric = Number(String(value ?? '').trim())
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${label} debe ser mayor a cero.`)
  }

  return numeric
}

function asUploadedFile(...values: Array<FormDataEntryValue | null>) {
  for (const value of values) {
    if (!value || typeof value === 'string' || !(value instanceof File) || value.size === 0) {
      continue
    }

    return value
  }

  return null
}

function getCurrentMexicoDateIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
}

function diffDays(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00.000Z`)
  const to = new Date(`${toDate}T00:00:00.000Z`)
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

function getMonthRange(date: string) {
  const [yearRaw, monthRaw] = date.split('-')
  const year = Number(yearRaw)
  const monthIndex = Number(monthRaw) - 1
  const start = new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 10)
  const end = new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10)
  return { start, end }
}

async function ensureBucket(service: TypedSupabaseClient) {
  const { error } = await service.storage.createBucket(REGISTRO_EXTEMPORANEO_BUCKET, {
    public: false,
    fileSizeLimit: `${EXPEDIENTE_RAW_UPLOAD_MAX_BYTES}`,
    allowedMimeTypes: REGISTRO_EXTEMPORANEO_ALLOWED_MIME_TYPES,
  })

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error
  }
}

async function uploadExtemporaneoEvidence(
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
) {
  if (exceedsOperationalDocumentUploadLimit(file)) {
    throw new Error(buildOperationalDocumentUploadLimitMessage('evidencia', file))
  }

  if (!REGISTRO_EXTEMPORANEO_ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error('La evidencia debe ser imagen JPEG/PNG/WEBP o PDF.')
  }

  await ensureBucket(service)
  const stored = await storeOptimizedEvidence({
    service,
    bucket: REGISTRO_EXTEMPORANEO_BUCKET,
    actorUsuarioId,
    storagePrefix: `registros-extemporaneos/${cuentaClienteId}/${empleadoId}`,
    file,
  })

  return {
    url: stored.archivo.url,
    hash: stored.archivo.hash,
    thumbnailUrl: stored.miniatura?.url ?? null,
    thumbnailHash: stored.miniatura?.hash ?? null,
  }
}

async function resolveExtemporaneoOperationalContext(
  service: TypedSupabaseClient,
  {
    empleadoId,
    fechaOperativa,
  }: {
    empleadoId: string
    fechaOperativa: string
  }
): Promise<ResolvedExtemporaneoContext> {
  const assignmentResult = await service
    .from('asignacion_diaria_resuelta')
    .select('fecha, empleado_id, pdv_id, supervisor_empleado_id, cuenta_cliente_id, estado_operativo')
    .eq('empleado_id', empleadoId)
    .eq('fecha', fechaOperativa)
    .maybeSingle()

  const assignment = assignmentResult.data as {
    fecha: string
    empleado_id: string
    pdv_id: string | null
    supervisor_empleado_id: string | null
    cuenta_cliente_id: string | null
    estado_operativo: string
  } | null

  if (assignmentResult.error || !assignment) {
    throw new Error('No tienes asignaciones registradas para esta fecha. Contacta a soporte.')
  }

  if (assignment.estado_operativo !== 'ASIGNADA_PDV' || !assignment.pdv_id || !assignment.cuenta_cliente_id) {
    throw new Error('No tienes una asignacion operativa valida para regularizar en esta fecha.')
  }

  if (!assignment.supervisor_empleado_id) {
    throw new Error('La asignacion de esa fecha no tiene supervisor ligado para aprobar el registro.')
  }

  const attendanceResult = await service
    .from('asistencia')
    .select('id, cuenta_cliente_id, empleado_id, pdv_id, fecha_operacion, check_in_utc, estatus')
    .eq('empleado_id', empleadoId)
    .eq('fecha_operacion', fechaOperativa)
    .order('check_in_utc', { ascending: false })
    .limit(5)

  const attendances = (attendanceResult.data ?? []) as Array<{
    id: string
    cuenta_cliente_id: string
    empleado_id: string
    pdv_id: string
    fecha_operacion: string
    check_in_utc: string | null
    estatus: string
  }>

  const attendance = attendances.find(
    (item) =>
      item.cuenta_cliente_id === assignment.cuenta_cliente_id &&
      item.pdv_id === assignment.pdv_id &&
      item.check_in_utc &&
      item.estatus !== 'RECHAZADA'
  )

  if (attendanceResult.error || !attendance) {
    throw new Error('No existe una jornada valida con check-in para esta fecha. No se puede regularizar.')
  }

  return {
    cuentaClienteId: assignment.cuenta_cliente_id,
    empleadoId,
    supervisorEmpleadoId: assignment.supervisor_empleado_id,
    pdvId: assignment.pdv_id,
    asistenciaId: attendance.id,
    fechaOperativa,
  }
}

async function resolveVentaPayload(service: TypedSupabaseClient, formData: FormData) {
  const productoId = normalizeRequiredText(formData.get('producto_id'), 'Producto')
  const unidades = normalizePositiveInteger(formData.get('venta_total_unidades'), 'Unidades')

  const productResult = await service
    .from('producto')
    .select('id, sku, nombre, nombre_corto, activo')
    .eq('id', productoId)
    .maybeSingle()

  const product = productResult.data as {
    id: string
    sku: string
    nombre: string
    nombre_corto: string
    activo: boolean
  } | null

  if (productResult.error || !product || !product.activo) {
    throw new Error('El producto seleccionado ya no esta disponible para regularizar ventas.')
  }

  return {
    producto_id: product.id,
    producto_sku: product.sku,
    producto_nombre: product.nombre,
    producto_nombre_corto: product.nombre_corto,
    total_unidades: unidades,
    total_monto: 0,
  }
}

function resolveLovePayload(formData: FormData) {
  return {
    afiliado_nombre: normalizeRequiredText(formData.get('love_afiliado_nombre'), 'Nombre del cliente'),
    afiliado_contacto: normalizeOptionalText(formData.get('love_afiliado_contacto')),
    ticket_folio: normalizeOptionalText(formData.get('love_ticket_folio')),
  }
}

async function countEmployeeIncidencesThisMonth(
  service: TypedSupabaseClient,
  {
    empleadoId,
    fechaOperativa,
  }: {
    empleadoId: string
    fechaOperativa: string
  }
) {
  const monthRange = getMonthRange(fechaOperativa)
  const countResult = await service
    .from('registro_extemporaneo')
    .select('id', { count: 'exact', head: true })
    .eq('empleado_id', empleadoId)
    .gte('fecha_operativa', monthRange.start)
    .lte('fecha_operativa', monthRange.end)

  return countResult.count ?? 0
}

function buildExtemporaneoMetadata(base: {
  actorPuesto: Puesto
  method: 'APP' | 'APP_OFFLINE' | 'EXTEMPORANEO'
  recurrenceCount: number
  evidenceAttached: boolean
}) {
  return {
    actor_puesto: base.actorPuesto,
    metodo_ingreso: base.method,
    evidencia_adjunta: base.evidenceAttached,
    recurrencia_mes: base.recurrenceCount,
  }
}

async function notifySupervisorPendingApproval(
  row: {
    id: string
    supervisorEmpleadoId: string
    cuentaClienteId: string
    empleadoNombre: string
    fechaOperativa: string
    tipoRegistro: RegistroExtemporaneo['tipo_registro']
  }
) {
  await sendOperationalPushNotification({
    employeeIds: [row.supervisorEmpleadoId],
    title: 'Registro extemporaneo pendiente',
    body: `${row.empleadoNombre} solicito un registro ${row.tipoRegistro.toLowerCase()} para ${row.fechaOperativa}.`,
    path: '/solicitudes',
    tag: `registro-extemporaneo-${row.id}`,
    cuentaClienteId: row.cuentaClienteId,
    audit: {
      tabla: 'registro_extemporaneo',
      registroId: row.id,
      accion: 'fanout_registro_extemporaneo_pendiente_push',
    },
    data: {
      registroExtemporaneoId: row.id,
      fechaOperativa: row.fechaOperativa,
      tipoRegistro: row.tipoRegistro,
    },
  })
}

async function notifyEmployeeExtemporaneoResolution(
  row: RegistroExtemporaneoRow,
  {
    approved,
  }: {
    approved: boolean
  }
) {
  await sendOperationalPushNotification({
    employeeIds: [row.empleado_id],
    title: approved ? 'Registro extemporaneo aprobado' : 'Registro extemporaneo rechazado',
    body: approved
      ? `Tu registro extemporaneo del ${row.fecha_operativa} ya se consolido en el sistema.`
      : `Tu registro extemporaneo del ${row.fecha_operativa} fue rechazado. Revisa el motivo en Solicitudes.`,
    path: '/solicitudes',
    tag: `registro-extemporaneo-${row.id}-${approved ? 'aprobado' : 'rechazado'}`,
    cuentaClienteId: row.cuenta_cliente_id,
    audit: {
      tabla: 'registro_extemporaneo',
      registroId: row.id,
      accion: approved ? 'fanout_registro_extemporaneo_aprobado_push' : 'fanout_registro_extemporaneo_rechazado_push',
    },
    data: {
      registroExtemporaneoId: row.id,
      fechaOperativa: row.fecha_operativa,
      tipoRegistro: row.tipo_registro,
      estatus: approved ? 'APROBADO' : 'RECHAZADO',
    },
  })
}

export async function registrarRegistroExtemporaneo(
  _prevState: SolicitudActionState,
  formData: FormData
): Promise<SolicitudActionState> {
  try {
    const actor = await requerirPuestosActivos(REGISTRO_EXTEMPORANEO_WRITE_ROLES)
    const service = createServiceClient() as TypedSupabaseClient
    const empleadoId = normalizeOptionalText(formData.get('empleado_id')) ?? actor.empleadoId

    if (!empleadoId) {
      throw new Error('No fue posible identificar a la dermoconsejera para este registro.')
    }

    const tipoRegistro = normalizeRegistroTipo(formData.get('tipo_registro'))
    const fechaOperativa = normalizeRequiredText(formData.get('fecha_operativa'), 'Fecha a regularizar')
    const motivo = normalizeRequiredText(formData.get('motivo'), 'Justificacion')
    const evidenceFile = asUploadedFile(formData.get('evidencia'))
    const todayIso = getCurrentMexicoDateIso()
    const gapDays = diffDays(fechaOperativa, todayIso)

    if (gapDays <= 0) {
      throw new Error('El registro extemporaneo solo aplica para dias anteriores al actual.')
    }

    if (gapDays > REGISTRO_EXTEMPORANEO_MAX_LOOKBACK_DAYS) {
      throw new Error(`Solo puedes regularizar hasta ${REGISTRO_EXTEMPORANEO_MAX_LOOKBACK_DAYS} dias hacia atras.`)
    }

    const context = await resolveExtemporaneoOperationalContext(service, {
      empleadoId,
      fechaOperativa,
    })

    const recurrenceCount = await countEmployeeIncidencesThisMonth(service, {
      empleadoId,
      fechaOperativa,
    })

    const ventaPayload =
      tipoRegistro === 'VENTA' || tipoRegistro === 'AMBAS'
        ? await resolveVentaPayload(service, formData)
        : {}
    const lovePayload =
      tipoRegistro === 'LOVE_ISDIN' || tipoRegistro === 'AMBAS'
        ? resolveLovePayload(formData)
        : {}

    const evidenceUpload = evidenceFile
      ? await uploadExtemporaneoEvidence(service, {
          actorUsuarioId: actor.usuarioId,
          cuentaClienteId: context.cuentaClienteId,
          empleadoId,
          file: evidenceFile,
        })
      : null

    const duplicatePending = await service
      .from('registro_extemporaneo')
      .select('id')
      .eq('empleado_id', empleadoId)
      .eq('fecha_operativa', fechaOperativa)
      .eq('tipo_registro', tipoRegistro)
      .eq('estatus', 'PENDIENTE_APROBACION')
      .maybeSingle()

    if (duplicatePending.error) {
      throw new Error(duplicatePending.error.message)
    }

    if (duplicatePending.data?.id) {
      throw new Error('Ya existe un registro extemporaneo pendiente para esta fecha y este tipo.')
    }

    const empleadoResult = await service
      .from('empleado')
      .select('id, nombre_completo')
      .eq('id', empleadoId)
      .maybeSingle()

    const empleadoNombre = String((empleadoResult.data as { nombre_completo?: string } | null)?.nombre_completo ?? 'Colaborador')

    const { data: created, error } = await service
      .from('registro_extemporaneo')
      .insert({
        cuenta_cliente_id: context.cuentaClienteId,
        empleado_id: context.empleadoId,
        supervisor_empleado_id: context.supervisorEmpleadoId,
        pdv_id: context.pdvId,
        asistencia_id: context.asistenciaId,
        fecha_operativa: context.fechaOperativa,
        tipo_registro: tipoRegistro,
        estatus: 'PENDIENTE_APROBACION',
        motivo,
        evidencia_url: evidenceUpload?.url ?? null,
        evidencia_hash: evidenceUpload?.hash ?? null,
        evidencia_thumbnail_url: evidenceUpload?.thumbnailUrl ?? null,
        evidencia_thumbnail_hash: evidenceUpload?.thumbnailHash ?? null,
        venta_payload: ventaPayload,
        love_payload: lovePayload,
        metadata: {
          ...buildExtemporaneoMetadata({
            actorPuesto: actor.puesto,
            method: 'EXTEMPORANEO',
            recurrenceCount: recurrenceCount + 1,
            evidenceAttached: Boolean(evidenceUpload),
          }),
          gap_dias_retraso: gapDays,
        },
      })
      .select('id')
      .maybeSingle()

    if (error || !created?.id) {
      throw new Error(error?.message ?? 'No fue posible guardar el registro extemporaneo.')
    }

    await service.from('audit_log').insert({
      tabla: 'registro_extemporaneo',
      registro_id: created.id,
      accion: 'EVENTO',
      payload: {
        evento: 'registro_extemporaneo_registrado',
        tipo_registro: tipoRegistro,
        fecha_operativa: fechaOperativa,
        gap_dias_retraso: gapDays,
      },
      usuario_id: actor.usuarioId,
      cuenta_cliente_id: context.cuentaClienteId,
    })

    await notifySupervisorPendingApproval({
      id: created.id as string,
      supervisorEmpleadoId: context.supervisorEmpleadoId,
      cuentaClienteId: context.cuentaClienteId,
      empleadoNombre,
      fechaOperativa,
      tipoRegistro,
    })

    revalidatePath('/solicitudes')
    revalidatePath('/dashboard')
    revalidatePath('/ventas')
    revalidatePath('/love-isdin')

    return buildState({
      ok: true,
      message: 'Registro extemporaneo enviado a aprobacion.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible registrar la incidencia extemporanea.',
    })
  }
}

export async function resolverRegistroExtemporaneo(
  _prevState: SolicitudActionState,
  formData: FormData
): Promise<SolicitudActionState> {
  try {
    const actor = await requerirPuestosActivos(REGISTRO_EXTEMPORANEO_APPROVAL_ROLES)
    const service = createServiceClient() as TypedSupabaseClient
    const registroId = normalizeRequiredText(formData.get('registro_extemporaneo_id'), 'Registro')
    const decision = normalizeRequiredText(formData.get('decision'), 'Decision').toUpperCase()
    const motivoRechazo = normalizeOptionalText(formData.get('motivo_rechazo'))

    if (!['APROBAR', 'RECHAZAR'].includes(decision)) {
      throw new Error('La decision seleccionada no es valida.')
    }

    if (decision === 'RECHAZAR' && !motivoRechazo) {
      throw new Error('Debes indicar el motivo de rechazo.')
    }

    const rowResult = await service
      .from('registro_extemporaneo')
      .select('*')
      .eq('id', registroId)
      .maybeSingle()

    const row = rowResult.data as RegistroExtemporaneoRow | null

    if (rowResult.error || !row) {
      throw new Error(rowResult.error?.message ?? 'No fue posible cargar el registro extemporaneo.')
    }

    if (row.estatus !== 'PENDIENTE_APROBACION') {
      throw new Error('Este registro extemporaneo ya fue atendido.')
    }

    if (actor.puesto === 'SUPERVISOR' && actor.empleadoId !== row.supervisor_empleado_id) {
      throw new Error('Solo el supervisor asignado puede aprobar o rechazar este registro.')
    }

    if (decision === 'RECHAZAR') {
      const { error } = await service
        .from('registro_extemporaneo')
        .update({
          estatus: 'RECHAZADO',
          motivo_rechazo: motivoRechazo,
          rechazado_por_empleado_id: actor.empleadoId ?? null,
          rechazado_en: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            ...normalizeMetadata(row.metadata),
            rechazado_por_puesto: actor.puesto,
          },
        })
        .eq('id', row.id)

      if (error) {
        throw new Error(error.message)
      }

      await service.from('audit_log').insert({
        tabla: 'registro_extemporaneo',
        registro_id: row.id,
        accion: 'EVENTO',
        payload: {
          evento: 'registro_extemporaneo_rechazado',
          motivo_rechazo: motivoRechazo,
        },
        usuario_id: actor.usuarioId,
        cuenta_cliente_id: row.cuenta_cliente_id,
      })

      await notifyEmployeeExtemporaneoResolution(row, { approved: false })

      revalidatePath('/solicitudes')
      revalidatePath('/dashboard')

      return buildState({
        ok: true,
        message: 'Registro extemporaneo rechazado.',
      })
    }

    const metadata = normalizeMetadata(row.metadata)
    const gapDays = Number(metadata.gap_dias_retraso ?? diffDays(row.fecha_operativa, getCurrentMexicoDateIso()))
    let ventaRegistroId = row.venta_registro_id
    let loveRegistroId = row.love_registro_id

    if (row.tipo_registro === 'VENTA' || row.tipo_registro === 'AMBAS') {
      const ventaPayload = normalizeMetadata(row.venta_payload)
      const ventaResult = await registerVentaWithService(service, {
        cuentaClienteId: row.cuenta_cliente_id,
        asistenciaId: row.asistencia_id,
        empleadoId: row.empleado_id,
        pdvId: row.pdv_id,
        productoId: String(ventaPayload.producto_id ?? '') || null,
        productoSku: String(ventaPayload.producto_sku ?? '') || null,
        productoNombre: String(ventaPayload.producto_nombre ?? ''),
        productoNombreCorto: String(ventaPayload.producto_nombre_corto ?? '') || null,
        fechaUtc: row.fecha_registro_utc,
        totalUnidades: Number(ventaPayload.total_unidades ?? 0),
        totalMonto: Number(ventaPayload.total_monto ?? 0),
        confirmada: true,
        validadaPorEmpleadoId: row.empleado_id,
        validadaEn: new Date().toISOString(),
        observaciones: row.motivo,
        origen: 'AJUSTE_ADMIN',
        allowOutsideStandardWindow: true,
        metadata: {
          fecha_operativa: row.fecha_operativa,
          fecha_registro: row.fecha_registro_utc,
          metodo_ingreso: 'EXTEMPORANEO',
          fuera_de_ventana: true,
          gap_dias_retraso: gapDays,
          registro_extemporaneo_id: row.id,
        },
      })

      ventaRegistroId = ventaResult.id
    }

    if (row.tipo_registro === 'LOVE_ISDIN' || row.tipo_registro === 'AMBAS') {
      const lovePayload = normalizeMetadata(row.love_payload)
      const loveResult = await registerLoveAffiliationWithService(service, {
        cuentaClienteId: row.cuenta_cliente_id,
        asistenciaId: row.asistencia_id,
        empleadoId: row.empleado_id,
        pdvId: row.pdv_id,
        afiliadoNombre: String(lovePayload.afiliado_nombre ?? ''),
        afiliadoContacto: lovePayload.afiliado_contacto ? String(lovePayload.afiliado_contacto) : null,
        ticketFolio: lovePayload.ticket_folio ? String(lovePayload.ticket_folio) : null,
        fechaUtc: row.fecha_registro_utc,
        origen: 'AJUSTE_ADMIN',
        allowOutsideStandardWindow: true,
        evidenciaUrl: row.evidencia_url,
        evidenciaHash: row.evidencia_hash,
        evidenciaThumbnailUrl: row.evidencia_thumbnail_url,
        evidenciaThumbnailHash: row.evidencia_thumbnail_hash,
        metadata: {
          fecha_operativa: row.fecha_operativa,
          fecha_registro: row.fecha_registro_utc,
          metodo_ingreso: 'EXTEMPORANEO',
          fuera_de_ventana: true,
          gap_dias_retraso: gapDays,
          registro_extemporaneo_id: row.id,
        },
      })

      loveRegistroId = loveResult.id
    }

    const { error } = await service
      .from('registro_extemporaneo')
      .update({
        estatus: 'APROBADO',
        venta_registro_id: ventaRegistroId,
        love_registro_id: loveRegistroId,
        aprobado_por_empleado_id: actor.empleadoId ?? null,
        aprobado_en: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          ...metadata,
          aprobado_por_puesto: actor.puesto,
          metodo_ingreso: 'EXTEMPORANEO',
        },
      })
      .eq('id', row.id)

    if (error) {
      throw new Error(error.message)
    }

    await service.from('audit_log').insert({
      tabla: 'registro_extemporaneo',
      registro_id: row.id,
      accion: 'EVENTO',
      payload: {
        evento: 'registro_extemporaneo_aprobado',
        venta_registro_id: ventaRegistroId,
        love_registro_id: loveRegistroId,
      },
      usuario_id: actor.usuarioId,
      cuenta_cliente_id: row.cuenta_cliente_id,
    })

    await notifyEmployeeExtemporaneoResolution(row, { approved: true })

    revalidatePath('/solicitudes')
    revalidatePath('/dashboard')
    revalidatePath('/ventas')
    revalidatePath('/love-isdin')

    return buildState({
      ok: true,
      message: 'Registro extemporaneo aprobado y consolidado.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible resolver el registro extemporaneo.',
    })
  }
}

export async function resolverRegistroExtemporaneoDesdePanel(formData: FormData): Promise<void> {
  await resolverRegistroExtemporaneo(ESTADO_SOLICITUD_INICIAL, formData)
}
