'use server'

import crypto from 'node:crypto'
import path from 'node:path'
import { revalidatePath } from 'next/cache'
import { obtenerClienteAdmin } from '@/lib/auth/admin'
import { optimizeExpedienteDocument, EXPEDIENTE_PDF_TARGET_BYTES, EXPEDIENTE_RAW_UPLOAD_MAX_BYTES } from '@/lib/files/documentOptimization'
import { performConfiguredDocumentOcr } from '@/lib/ocr/gemini'
import { requerirPuestosActivos } from '@/lib/auth/session'
import {
  OCR_MODEL_CONFIG_KEY,
  OCR_PROVIDER_CONFIG_KEY,
} from '@/features/configuracion/configuracionCatalog'

type ExpedienteEstado = 'PENDIENTE_DOCUMENTOS' | 'EN_REVISION' | 'VALIDADO' | 'OBSERVADO'
type ImssEstado = 'NO_INICIADO' | 'PENDIENTE_DOCUMENTOS' | 'EN_PROCESO' | 'ALTA_IMSS' | 'ERROR'
type Puesto =
  | 'DERMOCONSEJERO'
  | 'SUPERVISOR'
  | 'COORDINADOR'
  | 'RECLUTAMIENTO'
  | 'NOMINA'
  | 'LOGISTICA'
  | 'LOVE_IS'
  | 'VENTAS'
  | 'ADMINISTRADOR'
  | 'CLIENTE'

type CategoriaDocumento = 'EXPEDIENTE' | 'IMSS' | 'BAJA'
type TipoDocumento =
  | 'CURP'
  | 'RFC'
  | 'NSS'
  | 'INE'
  | 'COMPROBANTE_DOMICILIO'
  | 'CONTRATO'
  | 'ALTA_IMSS'
  | 'BAJA'
  | 'OTRO'

interface EmpleadoBaseRow {
  id: string
  id_nomina: string | null
  nombre_completo: string
  puesto: Puesto
  correo_electronico: string | null
}

interface ArchivoHashRow {
  id: string
  sha256: string
  bucket: string
  ruta_archivo: string
}

export interface EmpleadoActionState {
  ok: boolean
  message: string | null
  generatedUsername: string | null
  temporaryPassword: string | null
  temporaryEmail: string | null
  duplicatedUpload: boolean
}

export const ESTADO_EMPLEADO_INICIAL: EmpleadoActionState = {
  ok: false,
  message: null,
  generatedUsername: null,
  temporaryPassword: null,
  temporaryEmail: null,
  duplicatedUpload: false,
}

const EMPLEADOS_BUCKET = 'empleados-expediente'
const PUESTOS_VALIDOS: Puesto[] = [
  'ADMINISTRADOR',
  'COORDINADOR',
  'SUPERVISOR',
  'DERMOCONSEJERO',
  'RECLUTAMIENTO',
  'NOMINA',
  'LOGISTICA',
  'VENTAS',
  'LOVE_IS',
  'CLIENTE',
]
const EXPEDIENTE_ESTADOS: ExpedienteEstado[] = [
  'PENDIENTE_DOCUMENTOS',
  'EN_REVISION',
  'VALIDADO',
  'OBSERVADO',
]
const IMSS_ESTADOS: ImssEstado[] = [
  'NO_INICIADO',
  'PENDIENTE_DOCUMENTOS',
  'EN_PROCESO',
  'ALTA_IMSS',
  'ERROR',
]
const DOCUMENT_CATEGORIES: CategoriaDocumento[] = ['EXPEDIENTE', 'IMSS', 'BAJA']
const DOCUMENT_TYPES: TipoDocumento[] = [
  'CURP',
  'RFC',
  'NSS',
  'INE',
  'COMPROBANTE_DOMICILIO',
  'CONTRATO',
  'ALTA_IMSS',
  'BAJA',
  'OTRO',
]
const PDF_MAX_BYTES = EXPEDIENTE_PDF_TARGET_BYTES
const GENERIC_MAX_BYTES = 4_000_000
const RAW_UPLOAD_MAX_BYTES = EXPEDIENTE_RAW_UPLOAD_MAX_BYTES

function buildState(partial: Partial<EmpleadoActionState>): EmpleadoActionState {
  return {
    ...ESTADO_EMPLEADO_INICIAL,
    ...partial,
  }
}

function sanitizeToken(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^[_\-.]+|[_\-.]+$/g, '')
    .replace(/[_\-.]{2,}/g, '_')
}

function buildPreferredUsername(explicitValue: string, empleado: EmpleadoBaseRow) {
  const explicit = sanitizeToken(explicitValue)
  if (explicit) {
    return explicit
  }

  const nomina = sanitizeToken(empleado.id_nomina ?? '')
  if (nomina) {
    return nomina
  }

  const nombre = sanitizeToken(empleado.nombre_completo)
  if (nombre) {
    return `${nombre}_${empleado.id.replace(/-/g, '').slice(0, 6)}`
  }

  return `usr_${empleado.id.replace(/-/g, '').slice(0, 12)}`
}

function buildPlaceholderEmail(username: string) {
  return `${username}@provisional.fieldforce.invalid`
}

function createTemporaryPassword() {
  return `Rtl!${crypto.randomBytes(9).toString('base64url')}`
}

async function obtenerHorasPasswordTemporal(service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>) {
  const { data } = await service
    .from('configuracion')
    .select('valor')
    .eq('clave', 'auth.activacion.password_temporal_horas')
    .maybeSingle()

  return Number(data?.valor ?? 72) || 72
}

async function registrarEventoAudit(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  {
    tabla,
    registroId,
    payload,
    usuarioId,
  }: {
    tabla: string
    registroId: string
    payload: Record<string, unknown>
    usuarioId: string
  }
) {
  await service.from('audit_log').insert({
    tabla,
    registro_id: registroId,
    accion: 'EVENTO',
    payload,
    usuario_id: usuarioId,
    cuenta_cliente_id: null,
  })
}

async function provisionarAccesoProvisional(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  actorUsuarioId: string,
  empleado: EmpleadoBaseRow,
  usernameInput: string
) {
  const username = buildPreferredUsername(usernameInput, empleado)

  const { data: usernameExistente } = await service
    .from('usuario')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  if (usernameExistente) {
    throw new Error(`El username ${username} ya existe. Usa otro valor para continuar.`)
  }

  const horasVigencia = await obtenerHorasPasswordTemporal(service)
  const generatedAt = new Date()
  const expiresAt = new Date(generatedAt.getTime() + horasVigencia * 60 * 60 * 1000)
  const temporaryPassword = createTemporaryPassword()
  const temporaryEmail = buildPlaceholderEmail(username)

  const { data: createdAuth, error: createAuthError } = await service.auth.admin.createUser({
    email: temporaryEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      username,
      provisional_email: true,
      source: 'recruit_employees_module',
    },
  })

  if (createAuthError || !createdAuth.user) {
    throw createAuthError ?? new Error('No fue posible crear el usuario en auth.')
  }

  const { data: insertedUsuario, error: insertUsuarioError } = await service
    .from('usuario')
    .insert({
      auth_user_id: createdAuth.user.id,
      empleado_id: empleado.id,
      cuenta_cliente_id: null,
      username,
      estado_cuenta: 'PROVISIONAL',
      correo_electronico: empleado.correo_electronico ?? null,
      correo_verificado: false,
      password_temporal_generada_en: generatedAt.toISOString(),
      password_temporal_expira_en: expiresAt.toISOString(),
      updated_at: generatedAt.toISOString(),
    })
    .select('id')
    .maybeSingle()

  if (insertUsuarioError || !insertedUsuario) {
    await service.auth.admin.deleteUser(createdAuth.user.id, true)
    throw insertUsuarioError ?? new Error('No fue posible crear el acceso provisional.')
  }

  await registrarEventoAudit(service, {
    tabla: 'usuario',
    registroId: insertedUsuario.id,
    payload: {
      evento: 'empleado_alta_crea_usuario_provisional',
      empleado_id: empleado.id,
      empleado: empleado.nombre_completo,
      username,
      puesto: empleado.puesto,
    },
    usuarioId: actorUsuarioId,
  })

  return {
    username,
    temporaryPassword,
    temporaryEmail,
  }
}

async function ensureBucket(service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>) {
  const { error } = await service.storage.createBucket(EMPLEADOS_BUCKET, {
    public: false,
    fileSizeLimit: `${GENERIC_MAX_BYTES}`,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  })

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error
  }
}

async function obtenerConfiguracionOcr(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>
) {
  const { data, error } = await service
    .from('configuracion')
    .select('clave, valor')
    .in('clave', [OCR_PROVIDER_CONFIG_KEY, OCR_MODEL_CONFIG_KEY])

  if (error) {
    return {
      providerOverride: null,
      modelOverride: null,
    }
  }

  const rows = Array.isArray(data) ? data : []
  const providerRow = rows.find((item) => item.clave === OCR_PROVIDER_CONFIG_KEY)
  const modelRow = rows.find((item) => item.clave === OCR_MODEL_CONFIG_KEY)

  return {
    providerOverride: String(providerRow?.valor ?? '').trim() || null,
    modelOverride: String(modelRow?.valor ?? '').trim() || null,
  }
}

function normalizeOptionalText(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  return normalized ? normalized : null
}

function normalizeRequiredText(value: FormDataEntryValue | null, label: string) {
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    throw new Error(`${label} es obligatorio.`)
  }
  return normalized
}

function normalizeDate(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeCurrency(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    return null
  }

  const numeric = Number(normalized)
  if (Number.isNaN(numeric) || numeric < 0) {
    throw new Error('El sueldo base mensual no es valido.')
  }

  return numeric
}

function getChecklistFromForm(formData: FormData) {
  return {
    activos_recuperados: formData.get('check_activos_recuperados') === 'on',
    nomina_notificada: formData.get('check_nomina_notificada') === 'on',
    logistica_notificada: formData.get('check_logistica_notificada') === 'on',
  }
}

function getFileExtension(fileName: string, mimeType: string | null) {
  const ext = path.extname(fileName).replace(/^\./, '').toLowerCase()

  if (ext) {
    return ext
  }

  if (mimeType === 'application/pdf') {
    return 'pdf'
  }

  if (mimeType === 'image/png') {
    return 'png'
  }

  if (mimeType === 'image/webp') {
    return 'webp'
  }

  return 'jpg'
}

export async function crearEmpleado(
  _prevState: EmpleadoActionState,
  formData: FormData
): Promise<EmpleadoActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'RECLUTAMIENTO'])
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  try {
    const nombreCompleto = normalizeRequiredText(formData.get('nombre_completo'), 'Nombre completo')
    const curp = normalizeRequiredText(formData.get('curp'), 'CURP').toUpperCase()
    const nss = normalizeRequiredText(formData.get('nss'), 'NSS')
    const rfc = normalizeRequiredText(formData.get('rfc'), 'RFC').toUpperCase()
    const puesto = normalizeRequiredText(formData.get('puesto'), 'Puesto') as Puesto
    const zona = normalizeRequiredText(formData.get('zona'), 'Zona')
    const telefono = normalizeOptionalText(formData.get('telefono'))
    const correoElectronico = normalizeOptionalText(formData.get('correo_electronico'))?.toLowerCase() ?? null
    const idNomina = normalizeOptionalText(formData.get('id_nomina'))
    const supervisorEmpleadoId = normalizeOptionalText(formData.get('supervisor_empleado_id'))
    const fechaAlta = normalizeDate(formData.get('fecha_alta')) ?? new Date().toISOString().slice(0, 10)
    const usernameInput = String(formData.get('username') ?? '').trim()
    const createAccess = formData.get('crear_acceso') === 'on'

    if (!PUESTOS_VALIDOS.includes(puesto)) {
      return buildState({ message: 'El puesto seleccionado no es valido.' })
    }

    const [curpExistente, rfcExistente, nssExistente] = await Promise.all([
      service.from('empleado').select('id').eq('curp', curp).maybeSingle(),
      service.from('empleado').select('id').eq('rfc', rfc).maybeSingle(),
      service.from('empleado').select('id').eq('nss', nss).maybeSingle(),
    ])

    if (curpExistente.data || rfcExistente.data || nssExistente.data) {
      return buildState({
        message: 'CURP, RFC o NSS ya estan registrados en otro expediente.',
      })
    }

    if (supervisorEmpleadoId) {
      const { data: supervisor } = await service
        .from('empleado')
        .select('id, puesto, estatus_laboral')
        .eq('id', supervisorEmpleadoId)
        .maybeSingle()

      if (!supervisor || supervisor.puesto !== 'SUPERVISOR' || supervisor.estatus_laboral !== 'ACTIVO') {
        return buildState({
          message: 'El supervisor seleccionado no esta activo o no tiene puesto SUPERVISOR.',
        })
      }
    }

    const { data: insertedEmpleado, error: insertEmpleadoError } = await service
      .from('empleado')
      .insert({
        id_nomina: idNomina,
        nombre_completo: nombreCompleto,
        curp,
        nss,
        rfc,
        puesto,
        zona,
        telefono,
        correo_electronico: correoElectronico,
        estatus_laboral: 'ACTIVO',
        fecha_alta: fechaAlta,
        fecha_baja: null,
        supervisor_empleado_id: supervisorEmpleadoId,
        expediente_estado: 'PENDIENTE_DOCUMENTOS',
        imss_estado: 'NO_INICIADO',
        metadata: {
          source: 'modulo_empleados_reclutamiento',
        },
      })
      .select('id, id_nomina, nombre_completo, puesto, correo_electronico')
      .maybeSingle()

    if (insertEmpleadoError || !insertedEmpleado) {
      return buildState({
        message: insertEmpleadoError?.message ?? 'No fue posible crear el empleado.',
      })
    }

    await registrarEventoAudit(service, {
      tabla: 'empleado',
      registroId: insertedEmpleado.id,
      payload: {
        evento: 'empleado_creado_reclutamiento',
        nombre: nombreCompleto,
        puesto,
        zona,
        fecha_alta: fechaAlta,
      },
      usuarioId: actor.usuarioId,
    })

    if (!createAccess) {
      revalidatePath('/empleados')
      revalidatePath('/admin/users')
      return buildState({ ok: true, message: 'Empleado creado sin acceso digital.' })
    }

    try {
      const credentials = await provisionarAccesoProvisional(
        service,
        actor.usuarioId,
        insertedEmpleado as EmpleadoBaseRow,
        usernameInput
      )

      revalidatePath('/empleados')
      revalidatePath('/admin/users')

      return buildState({
        ok: true,
        message: 'Empleado y acceso provisional creados correctamente.',
        generatedUsername: credentials.username,
        temporaryPassword: credentials.temporaryPassword,
        temporaryEmail: credentials.temporaryEmail,
      })
    } catch (error) {
      await service.from('empleado').delete().eq('id', insertedEmpleado.id)
      return buildState({
        message: error instanceof Error ? error.message : 'No fue posible provisionar el acceso.',
      })
    }
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible crear el empleado.',
    })
  }
}

export async function actualizarEstadoExpedienteEmpleado(
  _prevState: EmpleadoActionState,
  formData: FormData
): Promise<EmpleadoActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'RECLUTAMIENTO'])
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const empleadoId = String(formData.get('empleado_id') ?? '').trim()
  const expedienteEstado = String(formData.get('expediente_estado') ?? '').trim() as ExpedienteEstado
  const expedienteObservaciones = normalizeOptionalText(formData.get('expediente_observaciones'))

  if (!empleadoId) {
    return buildState({ message: 'Selecciona un empleado valido.' })
  }

  if (!EXPEDIENTE_ESTADOS.includes(expedienteEstado)) {
    return buildState({ message: 'El estado de expediente no es valido.' })
  }

  const now = new Date().toISOString()
  const { error } = await service
    .from('empleado')
    .update({
      expediente_estado: expedienteEstado,
      expediente_observaciones: expedienteObservaciones,
      expediente_validado_en: expedienteEstado === 'VALIDADO' ? now : null,
      expediente_validado_por_usuario_id: expedienteEstado === 'VALIDADO' ? actor.usuarioId : null,
      updated_at: now,
    })
    .eq('id', empleadoId)

  if (error) {
    return buildState({ message: error.message })
  }

  await registrarEventoAudit(service, {
    tabla: 'empleado',
    registroId: empleadoId,
    payload: {
      evento: 'empleado_expediente_actualizado',
      expediente_estado: expedienteEstado,
      expediente_observaciones: expedienteObservaciones,
    },
    usuarioId: actor.usuarioId,
  })

  revalidatePath('/empleados')
  return buildState({ ok: true, message: 'Estado de expediente actualizado.' })
}

export async function actualizarEstadoImssEmpleado(
  _prevState: EmpleadoActionState,
  formData: FormData
): Promise<EmpleadoActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'RECLUTAMIENTO'])
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const empleadoId = String(formData.get('empleado_id') ?? '').trim()
  const imssEstado = String(formData.get('imss_estado') ?? '').trim() as ImssEstado
  const imssFechaSolicitud = normalizeDate(formData.get('imss_fecha_solicitud'))
  const imssFechaAlta = normalizeDate(formData.get('imss_fecha_alta'))
  const imssObservaciones = normalizeOptionalText(formData.get('imss_observaciones'))
  let sueldoBaseMensual: number | null = null

  try {
    sueldoBaseMensual = normalizeCurrency(formData.get('sueldo_base_mensual'))
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'Sueldo base invalido.' })
  }

  if (!empleadoId) {
    return buildState({ message: 'Selecciona un empleado valido.' })
  }

  if (!IMSS_ESTADOS.includes(imssEstado)) {
    return buildState({ message: 'El estado IMSS no es valido.' })
  }

  const { data: empleado, error: empleadoError } = await service
    .from('empleado')
    .select('id, curp, nss, rfc, fecha_alta')
    .eq('id', empleadoId)
    .maybeSingle()

  if (empleadoError || !empleado) {
    return buildState({ message: empleadoError?.message ?? 'Empleado no encontrado.' })
  }

  if ((imssEstado === 'EN_PROCESO' || imssEstado === 'ALTA_IMSS') && (!empleado.curp || !empleado.nss || !empleado.rfc || !empleado.fecha_alta)) {
    return buildState({
      message: 'Para iniciar alta IMSS se requieren CURP, NSS, RFC y fecha de alta en el expediente.',
    })
  }

  if (imssEstado === 'ALTA_IMSS' && !imssFechaAlta) {
    return buildState({ message: 'La fecha de alta IMSS es obligatoria para cerrar el tramite.' })
  }

  const { error } = await service
    .from('empleado')
    .update({
      imss_estado: imssEstado,
      imss_fecha_solicitud: imssFechaSolicitud,
      imss_fecha_alta: imssFechaAlta,
      imss_observaciones: imssObservaciones,
      sueldo_base_mensual: sueldoBaseMensual,
      updated_at: new Date().toISOString(),
    })
    .eq('id', empleadoId)

  if (error) {
    return buildState({ message: error.message })
  }

  await registrarEventoAudit(service, {
    tabla: 'empleado',
    registroId: empleadoId,
    payload: {
      evento: 'empleado_imss_actualizado',
      imss_estado: imssEstado,
      imss_fecha_solicitud: imssFechaSolicitud,
      imss_fecha_alta: imssFechaAlta,
      sueldo_base_mensual: sueldoBaseMensual,
    },
    usuarioId: actor.usuarioId,
  })

  revalidatePath('/empleados')
  return buildState({ ok: true, message: 'Flujo IMSS actualizado.' })
}

export async function registrarBajaEmpleado(
  _prevState: EmpleadoActionState,
  formData: FormData
): Promise<EmpleadoActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'RECLUTAMIENTO'])
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const empleadoId = String(formData.get('empleado_id') ?? '').trim()
  const fechaBaja = normalizeRequiredText(formData.get('fecha_baja'), 'Fecha de baja')
  const motivoBaja = normalizeRequiredText(formData.get('motivo_baja'), 'Motivo de baja')
  const checklistBaja = getChecklistFromForm(formData)

  if (!empleadoId) {
    return buildState({ message: 'Selecciona un empleado valido.' })
  }

  const { data: empleado, error: empleadoError } = await service
    .from('empleado')
    .select('id, nombre_completo, estatus_laboral')
    .eq('id', empleadoId)
    .maybeSingle()

  if (empleadoError || !empleado) {
    return buildState({ message: empleadoError?.message ?? 'Empleado no encontrado.' })
  }

  if (empleado.estatus_laboral === 'BAJA') {
    return buildState({ ok: true, message: 'El empleado ya estaba dado de baja.' })
  }

  const now = new Date().toISOString()
  const { error } = await service
    .from('empleado')
    .update({
      estatus_laboral: 'BAJA',
      fecha_baja: fechaBaja,
      motivo_baja: motivoBaja,
      checklist_baja: checklistBaja,
      updated_at: now,
    })
    .eq('id', empleadoId)

  if (error) {
    return buildState({ message: error.message })
  }

  await service
    .from('usuario')
    .update({
      estado_cuenta: 'BAJA',
      updated_at: now,
    })
    .eq('empleado_id', empleadoId)

  await registrarEventoAudit(service, {
    tabla: 'empleado',
    registroId: empleadoId,
    payload: {
      evento: 'empleado_baja_reclutamiento',
      nombre: empleado.nombre_completo,
      fecha_baja: fechaBaja,
      motivo_baja: motivoBaja,
      checklist_baja: checklistBaja,
    },
    usuarioId: actor.usuarioId,
  })

  revalidatePath('/empleados')
  revalidatePath('/admin/users')

  return buildState({ ok: true, message: 'Baja de empleado registrada.' })
}

export async function subirDocumentoEmpleado(
  _prevState: EmpleadoActionState,
  formData: FormData
): Promise<EmpleadoActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'RECLUTAMIENTO'])
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const empleadoId = String(formData.get('empleado_id') ?? '').trim()
  const categoria = String(formData.get('categoria') ?? '').trim() as CategoriaDocumento
  const tipoDocumento = String(formData.get('tipo_documento') ?? '').trim() as TipoDocumento
  const file = formData.get('archivo')

  if (!empleadoId) {
    return buildState({ message: 'Selecciona un empleado valido.' })
  }

  if (!DOCUMENT_CATEGORIES.includes(categoria)) {
    return buildState({ message: 'La categoria documental no es valida.' })
  }

  if (!DOCUMENT_TYPES.includes(tipoDocumento)) {
    return buildState({ message: 'El tipo de documento no es valido.' })
  }

  if (!(file instanceof File) || file.size <= 0) {
    return buildState({ message: 'Adjunta un archivo valido antes de subir.' })
  }

  if (file.size > RAW_UPLOAD_MAX_BYTES) {
    return buildState({
      message:
        'El archivo excede el limite operativo de 12 MB antes de optimizar. Reduce el origen antes de subirlo.',
    })
  }

  const { data: empleado, error: empleadoError } = await service
    .from('empleado')
    .select('id, nombre_completo, expediente_estado')
    .eq('id', empleadoId)
    .maybeSingle()

  if (empleadoError || !empleado) {
    return buildState({ message: empleadoError?.message ?? 'Empleado no encontrado.' })
  }

  try {
    await ensureBucket(service)

    const arrayBuffer = await file.arrayBuffer()
    const originalBuffer = Buffer.from(arrayBuffer)
    const optimization = await optimizeExpedienteDocument({
      buffer: originalBuffer,
      mimeType: file.type || 'application/octet-stream',
      fileName: file.name,
    })

    if (optimization.mimeType === 'application/pdf' && optimization.optimizedBytes > PDF_MAX_BYTES) {
      return buildState({
        message: `Se intento optimizar el PDF de ${Math.ceil(optimization.originalBytes / 1024)} KB a ${Math.ceil(optimization.optimizedBytes / 1024)} KB, pero sigue arriba del limite de 1 MB.`,
      })
    }

    if (optimization.optimizedBytes > GENERIC_MAX_BYTES) {
      return buildState({
        message: `El archivo optimizado sigue excediendo el limite operativo de 4 MB (${Math.ceil(optimization.optimizedBytes / 1024)} KB).`,
      })
    }

    const buffer = optimization.buffer
    const optimizedMimeType = optimization.mimeType
    const optimizedSize = optimization.optimizedBytes
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')

    let archivoHash = null as ArchivoHashRow | null
    const { data: archivoExistente } = await service
      .from('archivo_hash')
      .select('id, sha256, bucket, ruta_archivo')
      .eq('sha256', sha256)
      .maybeSingle()

    if (archivoExistente) {
      archivoHash = archivoExistente as ArchivoHashRow
    } else {
      const extension = optimization.extension || getFileExtension(file.name, optimizedMimeType || null)
      const rutaArchivo = `empleados/${empleadoId}/${categoria.toLowerCase()}/${sha256}.${extension}`

      const { error: uploadError } = await service.storage
        .from(EMPLEADOS_BUCKET)
        .upload(rutaArchivo, buffer, {
          contentType: optimizedMimeType || 'application/octet-stream',
          upsert: false,
        })

      if (uploadError) {
        return buildState({ message: uploadError.message })
      }

      const { data: insertedHash, error: insertHashError } = await service
        .from('archivo_hash')
        .insert({
          sha256,
          bucket: EMPLEADOS_BUCKET,
          ruta_archivo: rutaArchivo,
          mime_type: optimizedMimeType || null,
          tamano_bytes: optimizedSize,
          creado_por_usuario_id: actor.usuarioId,
        })
        .select('id, sha256, bucket, ruta_archivo')
        .maybeSingle()

      if (insertHashError || !insertedHash) {
        return buildState({
          message: insertHashError?.message ?? 'No fue posible registrar el hash del documento.',
        })
      }

      archivoHash = insertedHash as ArchivoHashRow
    }

    const { data: documentoExistente } = await service
      .from('empleado_documento')
      .select('id')
      .eq('empleado_id', empleadoId)
      .eq('archivo_hash_id', archivoHash.id)
      .eq('categoria', categoria)
      .maybeSingle()

    if (documentoExistente) {
      return buildState({
        ok: true,
        duplicatedUpload: true,
        message: 'El documento ya existia para este expediente. Se reutilizo la referencia deduplicada.',
      })
    }

    const ocrConfiguracion = await obtenerConfiguracionOcr(service)
    const ocr = await performConfiguredDocumentOcr({
      buffer,
      mimeType: optimizedMimeType || 'application/octet-stream',
      fileName: file.name,
      expectedDocumentType: tipoDocumento,
      employeeName: empleado.nombre_completo,
      providerOverride: ocrConfiguracion.providerOverride,
      modelOverride: ocrConfiguracion.modelOverride,
    })

    const { data: documento, error: documentoError } = await service
      .from('empleado_documento')
      .insert({
        empleado_id: empleadoId,
        archivo_hash_id: archivoHash.id,
        categoria,
        tipo_documento: tipoDocumento,
        nombre_archivo_original: file.name,
        mime_type: optimizedMimeType || null,
        tamano_bytes: optimizedSize,
        estado_documento: 'CARGADO',
        ocr_provider: ocr.provider,
        ocr_resultado: ocr.result,
        metadata: {
          uploaded_from: 'modulo_empleados',
          optimized_pdf: optimization.mimeType === 'application/pdf' && optimization.optimized,
          optimized_image: optimization.mimeType.startsWith('image/') && optimization.optimized,
          optimization_kind: optimization.optimizationKind,
          optimization_target_met: optimization.targetMet,
          optimization_original_bytes: optimization.originalBytes,
          optimization_final_bytes: optimization.optimizedBytes,
          optimization_notes: optimization.notes,
        },
        creado_por_usuario_id: actor.usuarioId,
      })
      .select('id')
      .maybeSingle()

    if (documentoError || !documento) {
      return buildState({
        message: documentoError?.message ?? 'No fue posible registrar el documento del expediente.',
      })
    }

    if (empleado.expediente_estado === 'PENDIENTE_DOCUMENTOS') {
      await service
        .from('empleado')
        .update({
          expediente_estado: 'EN_REVISION',
          updated_at: new Date().toISOString(),
        })
        .eq('id', empleadoId)
    }

    await registrarEventoAudit(service, {
      tabla: 'empleado_documento',
      registroId: documento.id,
      payload: {
        evento: 'empleado_documento_cargado',
        empleado: empleado.nombre_completo,
        categoria,
        tipo_documento: tipoDocumento,
        sha256: archivoHash.sha256,
        optimization_kind: optimization.optimizationKind,
        optimization_original_bytes: optimization.originalBytes,
        optimization_final_bytes: optimization.optimizedBytes,
        ocr_status: (ocr.result as { status?: string }).status ?? null,
        ocr_provider: ocr.provider,
      },
      usuarioId: actor.usuarioId,
    })

    revalidatePath('/empleados')

    const optimizationSummary = optimization.optimized
      ? ` Optimizado de ${Math.ceil(optimization.originalBytes / 1024)} KB a ${Math.ceil(optimization.optimizedBytes / 1024)} KB.`
      : ''

    return buildState({
      ok: true,
      duplicatedUpload: Boolean(archivoExistente),
      message: archivoExistente
        ? `Documento deduplicado y vinculado al expediente.${optimizationSummary}`
        : `Documento cargado y vinculado al expediente.${optimizationSummary}`,
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible subir el documento.',
    })
  }
}




