'use server'

import crypto from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { obtenerClienteAdmin } from '@/lib/auth/admin'
import {
  EXPEDIENTE_PDF_UPLOAD_MAX_BYTES,
  EXPEDIENTE_RAW_UPLOAD_MAX_BYTES,
} from '@/lib/files/documentOptimization'
import { storeOptimizedEvidence } from '@/lib/files/evidenceStorage'
import { performConfiguredDocumentOcr } from '@/lib/ocr/gemini'
import { sendOperationalPushNotification } from '@/lib/push/pushFanout'
import { requerirPuestosActivos } from '@/lib/auth/session'
import type { EmpleadoActionState } from './state'
import {
  OCR_MODEL_CONFIG_KEY,
  OCR_PROVIDER_CONFIG_KEY,
} from '@/features/configuracion/configuracionCatalog'
import { ESTADO_EMPLEADO_INICIAL } from './state'
import { buildEmpleadoOcrSnapshot, deriveYearsFromAgencyStartDate } from './lib/ocrMapping'

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

type OnboardingExternalAccessStatus = 'PENDIENTE' | 'SOLICITADO_A_VIRIDIANA' | 'CONFIRMADO'
type OnboardingContractStatus = 'PENDIENTE' | 'AGENDADO' | 'FIRMADO'

interface OnboardingOperativoPayload {
  pdvObjetivoId: string | null
  pdvObjetivoLabel: string | null
  coordinadorEmpleadoId: string | null
  coordinadorNombre: string | null
  fechaIngresoOficial: string | null
  fechaIsdinizacion: string | null
  accesosExternosStatus: OnboardingExternalAccessStatus
  accesosExternosObservaciones: string | null
  expedienteCompletoRecibido: boolean
  contratoStatus: OnboardingContractStatus
  contratoFirmadoEn: string | null
  validacionFinalReclutamientoAt?: string | null
}
interface EmpleadoBaseRow {
  id: string
  id_nomina: string | null
  nombre_completo: string
  puesto: Puesto
  correo_electronico: string | null
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
const CANCELABLE_ALTA_WORKFLOW_STAGES = [
  'PENDIENTE_IMSS_NOMINA',
  'EN_FLUJO_IMSS',
  'RECLUTAMIENTO_CORRECCION_ALTA',
  'PENDIENTE_ACCESO_ADMIN',
] as const
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
const RAW_UPLOAD_MAX_BYTES = EXPEDIENTE_RAW_UPLOAD_MAX_BYTES
const PDF_UPLOAD_MAX_BYTES = EXPEDIENTE_PDF_UPLOAD_MAX_BYTES
const EMPLEADOS_STORAGE_MAX_BYTES = 15 * 1024 * 1024

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

function buildEmployeeStorageDirectory({
  empleadoId,
  nombreCompleto,
  nss,
}: {
  empleadoId: string
  nombreCompleto?: string | null
  nss?: string | null
}) {
  const safeNss = sanitizeToken(String(nss ?? '').trim()) || empleadoId
  const safeName = sanitizeToken(String(nombreCompleto ?? '').trim()) || 'sin_nombre'
  return `empleados/${safeNss}_${safeName}`
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

function normalizeUpperIdentifier(value: string | null) {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '')
  return normalized || null
}

function normalizeOcrPuesto(value: string | null) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z_ ]+/g, ' ')
    .replace(/\s+/g, ' ')

  if (!normalized) {
    return null
  }

  const compact = normalized.replace(/\s+/g, '_')
  if (PUESTOS_VALIDOS.includes(compact as Puesto)) {
    return compact as Puesto
  }

  if (normalized.includes('DERMO')) return 'DERMOCONSEJERO'
  if (normalized.includes('SUPERVISOR')) return 'SUPERVISOR'
  if (normalized.includes('COORDINADOR')) return 'COORDINADOR'
  if (normalized.includes('NOMINA')) return 'NOMINA'
  if (normalized.includes('RECLUT')) return 'RECLUTAMIENTO'
  if (normalized.includes('LOGIST')) return 'LOGISTICA'
  if (normalized.includes('LOVE')) return 'LOVE_IS'
  if (normalized.includes('VENTA')) return 'VENTAS'
  if (normalized.includes('ADMIN')) return 'ADMINISTRADOR'
  if (normalized.includes('CLIENTE')) return 'CLIENTE'

  return null
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

async function registrarNotificacionAdminAltaImss(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  {
    actorUsuarioId,
    empleadoId,
    nombreEmpleado,
    correoElectronico,
  }: {
    actorUsuarioId: string
    empleadoId: string
    nombreEmpleado: string
    correoElectronico: string | null
  }
) {
  const { data: admins, error } = await service
    .from('empleado')
    .select('id, nombre_completo')
    .eq('puesto', 'ADMINISTRADOR')
    .eq('estatus_laboral', 'ACTIVO')
    .order('nombre_completo', { ascending: true })

  if (error || !admins || admins.length === 0) {
    return
  }

  const title = 'Expediente listo para acceso provisional'
  const body = correoElectronico
    ? `${nombreEmpleado} ya tiene alta IMSS confirmada y validacion final de Reclutamiento completa; requiere generacion de acceso provisional. Correo DC: ${correoElectronico}.`
    : `${nombreEmpleado} ya tiene alta IMSS confirmada y validacion final de Reclutamiento completa; requiere generacion de acceso provisional.`

  const { data: mensaje, error: mensajeError } = await service
    .from('mensaje_interno')
    .insert({
      cuenta_cliente_id: null,
      creado_por_usuario_id: actorUsuarioId,
      titulo: title,
      cuerpo: body,
      tipo: 'MENSAJE',
      grupo_destino: 'SUPERVISOR',
      zona: null,
      supervisor_empleado_id: null,
      opciones_respuesta: [],
      metadata: {
        workflow: 'empleados_alta_imss_lista_para_admin',
        empleado_id: empleadoId,
      },
    })
    .select('id')
    .maybeSingle()

  if (!mensajeError && mensaje?.id) {
    await service.from('mensaje_receptor').insert(
      admins.map((admin) => ({
        mensaje_id: mensaje.id,
        cuenta_cliente_id: null,
        empleado_id: admin.id,
        estado: 'PENDIENTE',
        metadata: {
          workflow: 'empleados_alta_imss_lista_para_admin',
          empleado_id: empleadoId,
        },
      }))
    )
  }

  try {
    await sendOperationalPushNotification({
      employeeIds: admins.map((admin) => admin.id),
      title,
      body,
      path: '/admin/users',
      tag: `empleado-admin-access-${empleadoId}`,
      cuentaClienteId: null,
      audit: {
        tabla: 'empleado',
        registroId: empleadoId,
        accion: 'notificar_admin_alta_imss',
      },
      data: {
        empleadoId,
        workflow: 'empleados_alta_imss_lista_para_admin',
      },
    })
  } catch {
    // La notificacion in-app y el audit log cubren el flujo si push falla.
  }
}

async function registrarNotificacionWorkflowEmpleados(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  {
    actorUsuarioId,
    puestosDestino,
    empleadoId,
    workflow,
    title,
    body,
    path,
    tag,
    auditAction,
  }: {
    actorUsuarioId: string
    puestosDestino: Puesto[]
    empleadoId: string
    workflow: string
    title: string
    body: string
    path: string
    tag: string
    auditAction: string
  }
) {
  const { data: recipients, error } = await service
    .from('empleado')
    .select('id, nombre_completo')
    .in('puesto', puestosDestino)
    .eq('estatus_laboral', 'ACTIVO')
    .order('nombre_completo', { ascending: true })

  if (error || !recipients || recipients.length === 0) {
    return
  }

  const { data: mensaje, error: mensajeError } = await service
    .from('mensaje_interno')
    .insert({
      cuenta_cliente_id: null,
      creado_por_usuario_id: actorUsuarioId,
      titulo: title,
      cuerpo: body,
      tipo: 'MENSAJE',
      grupo_destino: 'SUPERVISOR',
      zona: null,
      supervisor_empleado_id: null,
      opciones_respuesta: [],
      metadata: {
        workflow,
        empleado_id: empleadoId,
      },
    })
    .select('id')
    .maybeSingle()

  if (!mensajeError && mensaje?.id) {
    await service.from('mensaje_receptor').insert(
      recipients.map((recipient) => ({
        mensaje_id: mensaje.id,
        cuenta_cliente_id: null,
        empleado_id: recipient.id,
        estado: 'PENDIENTE',
        metadata: {
          workflow,
          empleado_id: empleadoId,
        },
      }))
    )
  }

  try {
    await sendOperationalPushNotification({
      employeeIds: recipients.map((recipient) => recipient.id),
      title,
      body,
      path,
      tag,
      cuentaClienteId: null,
      audit: {
        tabla: 'empleado',
        registroId: empleadoId,
        accion: auditAction,
      },
      data: {
        empleadoId,
        workflow,
      },
    })
  } catch {
    // El mensaje interno cubre el flujo si push falla.
  }
}

async function prepararDocumentoEmpleado(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  {
    actorUsuarioId,
    empleadoId,
    categoria,
    tipoDocumento,
    file,
    expectedDocumentType,
    employeeName,
    employeeNss,
    metadataExtra,
  }: {
    actorUsuarioId: string
    empleadoId: string
    categoria: CategoriaDocumento
    tipoDocumento: TipoDocumento
    file: File
    expectedDocumentType: string
    employeeName: string | null
    employeeNss?: string | null
    metadataExtra?: Record<string, unknown>
  }
) {
  await ensureBucket(service)
  const originalBuffer = Buffer.from(await file.arrayBuffer())
  const ocrConfiguracion = await obtenerConfiguracionOcr(service)
  const ocr = await performConfiguredDocumentOcr({
    buffer: originalBuffer,
    mimeType: file.type || 'application/octet-stream',
    fileName: file.name,
    expectedDocumentType,
    employeeName,
    providerOverride: ocrConfiguracion.providerOverride,
    modelOverride: ocrConfiguracion.modelOverride,
  })
  const storageDirectory = buildEmployeeStorageDirectory({
    empleadoId,
    nombreCompleto: employeeName ?? ocr.result.employeeName,
    nss: employeeNss ?? ocr.result.nss,
  })
  const storedEvidence = await storeOptimizedEvidence({
    service,
    bucket: EMPLEADOS_BUCKET,
    actorUsuarioId,
    storagePrefix: `${storageDirectory}/${categoria.toLowerCase()}`,
    file,
  })
  const optimization = storedEvidence.optimization

  const { data: archivoHash, error: archivoHashError } = await service
    .from('archivo_hash')
    .select('id, sha256, bucket, ruta_archivo')
    .eq('sha256', storedEvidence.archivo.hash)
    .maybeSingle()

  if (archivoHashError || !archivoHash) {
    throw archivoHashError ?? new Error('No fue posible recuperar el hash del documento optimizado.')
  }

  return {
    archivoHash,
    ocr,
    optimization,
    storedEvidence,
  }
}

async function syncBiometriaReferenceFromDocumento(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  {
    empleadoId,
    documentoId,
    archivoHash,
    storedEvidence,
  }: {
    empleadoId: string
    documentoId: string
    archivoHash: { bucket: string; ruta_archivo: string; sha256: string }
    storedEvidence: {
      miniatura: { url: string; hash: string } | null
    }
  }
) {
  const { data: empleadoActual, error: empleadoActualError } = await service
    .from('empleado')
    .select('metadata')
    .eq('id', empleadoId)
    .maybeSingle()

  if (empleadoActualError) {
    throw new Error(empleadoActualError.message)
  }

  const metadataEmpleado =
    empleadoActual?.metadata && typeof empleadoActual.metadata === 'object' && !Array.isArray(empleadoActual.metadata)
      ? (empleadoActual.metadata as Record<string, unknown>)
      : {}
  const metadataBiometria =
    metadataEmpleado.biometria &&
    typeof metadataEmpleado.biometria === 'object' &&
    !Array.isArray(metadataEmpleado.biometria)
      ? (metadataEmpleado.biometria as Record<string, unknown>)
      : {}

  const referenceBucket = storedEvidence.miniatura ? EMPLEADOS_BUCKET : archivoHash.bucket
  const referencePath = storedEvidence.miniatura
    ? storedEvidence.miniatura.url.replace(`${EMPLEADOS_BUCKET}/`, '')
    : archivoHash.ruta_archivo
  const referenceHash = storedEvidence.miniatura?.hash ?? archivoHash.sha256

  const { error: biometriaReferenceError } = await service
    .from('empleado')
    .update({
      metadata: {
        ...metadataEmpleado,
        biometria: {
          ...metadataBiometria,
          reference_asset: {
            bucket: referenceBucket,
            path: referencePath,
            hash: referenceHash,
            source: 'empleado_documento_ine',
            documento_id: documentoId,
          },
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', empleadoId)

  if (biometriaReferenceError) {
    throw new Error(biometriaReferenceError.message)
  }
}

async function registrarDocumentoEmpleado(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  prepared: Awaited<ReturnType<typeof prepararDocumentoEmpleado>>,
  {
    actorUsuarioId,
    empleadoId,
    categoria,
    tipoDocumento,
    file,
    metadataExtra,
  }: {
    actorUsuarioId: string
    empleadoId: string
    categoria: CategoriaDocumento
    tipoDocumento: TipoDocumento
    file: File
    metadataExtra?: Record<string, unknown>
  }
) {
  const { data: documentoExistente } = await service
    .from('empleado_documento')
    .select('id')
    .eq('empleado_id', empleadoId)
    .eq('archivo_hash_id', prepared.archivoHash.id)
    .eq('categoria', categoria)
    .maybeSingle()

  if (documentoExistente) {
    return {
      documentoId: documentoExistente.id,
      documentoExistente: true,
      archivoHash: prepared.archivoHash,
      ocr: prepared.ocr,
      optimization: prepared.optimization,
      storedEvidence: prepared.storedEvidence,
    }
  }

  const { data: documento, error: documentoError } = await service
    .from('empleado_documento')
    .insert({
      empleado_id: empleadoId,
      archivo_hash_id: prepared.archivoHash.id,
      categoria,
      tipo_documento: tipoDocumento,
      nombre_archivo_original: file.name,
      mime_type: prepared.storedEvidence.optimization.mimeType || null,
      tamano_bytes: prepared.storedEvidence.optimization.optimizedBytes,
      estado_documento: 'CARGADO',
      ocr_provider: prepared.ocr.provider,
      ocr_resultado: prepared.ocr.result,
      metadata: {
        uploaded_from: 'modulo_empleados',
        optimized_pdf:
          prepared.optimization.mimeType === 'application/pdf' && prepared.optimization.optimized,
        optimized_image:
          prepared.optimization.mimeType.startsWith('image/') && prepared.optimization.optimized,
        optimization_kind: prepared.optimization.optimizationKind,
        optimization_target_met: prepared.optimization.targetMet,
        optimization_original_bytes: prepared.optimization.originalBytes,
        optimization_final_bytes: prepared.optimization.optimizedBytes,
        optimization_notes: prepared.optimization.notes,
        optimization_official_asset_kind: prepared.optimization.officialAssetKind,
        thumbnail_url: prepared.storedEvidence.miniatura?.url ?? null,
        thumbnail_hash: prepared.storedEvidence.miniatura?.hash ?? null,
        ...(metadataExtra ?? {}),
      },
      creado_por_usuario_id: actorUsuarioId,
    })
    .select('id')
    .maybeSingle()

  if (documentoError || !documento) {
    throw documentoError ?? new Error('No fue posible registrar el documento del expediente.')
  }

  return {
    documentoId: documento.id,
    documentoExistente: false,
    archivoHash: prepared.archivoHash,
    ocr: prepared.ocr,
    optimization: prepared.optimization,
    storedEvidence: prepared.storedEvidence,
  }
}

async function ensureBucket(service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>) {
  const { error } = await service.storage.createBucket(EMPLEADOS_BUCKET, {
    public: false,
    fileSizeLimit: `${EMPLEADOS_STORAGE_MAX_BYTES}`,
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

function normalizeUppercaseText(value: FormDataEntryValue | null) {
  const normalized = normalizeOptionalText(value)
  return normalized ? normalized.toLocaleUpperCase('es-MX') : null
}

function normalizeUppercaseString(value: string | null | undefined) {
  const normalized = String(value ?? '').trim()
  return normalized ? normalized.toLocaleUpperCase('es-MX') : null
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

function normalizeWholeNumber(value: FormDataEntryValue | null, label: string) {
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    return null
  }

  const numeric = Number(normalized)
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`${label} no es valido.`)
  }

  return numeric
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

function normalizePostalCode(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, '')
  return normalized ? normalized.slice(0, 10) : null
}

function normalizeDateOrNull(value: string | null) {
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    return null
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

function mapMetadataRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

async function resolvePdvLabel(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  pdvId: string | null
) {
  if (!pdvId) {
    return null
  }

  const { data } = await service
    .from('pdv')
    .select('id, nombre, clave_btl, zona')
    .eq('id', pdvId)
    .maybeSingle()

  if (!data) {
    return null
  }

  const labelParts = [data.clave_btl, data.nombre].filter(Boolean)
  return labelParts.join(' - ') || data.nombre || pdvId
}

async function resolveCoordinadorLabel(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  coordinadorEmpleadoId: string | null
) {
  if (!coordinadorEmpleadoId) {
    return null
  }

  const { data } = await service
    .from('empleado')
    .select('id, nombre_completo')
    .eq('id', coordinadorEmpleadoId)
    .eq('puesto', 'COORDINADOR')
    .maybeSingle()

  return data?.nombre_completo ?? null
}

async function buildOnboardingOperativoPayload(
  service: NonNullable<ReturnType<typeof obtenerClienteAdmin>['service']>,
  formData: FormData,
  {
    fallbackFechaIngresoOficial,
    current,
  }: {
    fallbackFechaIngresoOficial?: string | null
    current?: Record<string, unknown>
  } = {}
): Promise<OnboardingOperativoPayload> {
  const currentRecord = mapMetadataRecord(current)
  const currentOnboarding = mapMetadataRecord(currentRecord.onboarding_operativo)
  const currentPdvObjetivoId = String(currentOnboarding.pdv_objetivo_id ?? '').trim() || null
  const pdvObjetivoId = normalizeOptionalText(formData.get('pdv_objetivo_id')) ?? currentPdvObjetivoId
  const currentCoordinadorEmpleadoId = String(currentOnboarding.coordinador_empleado_id ?? '').trim() || null
  const coordinadorEmpleadoId = normalizeOptionalText(formData.get('coordinador_empleado_id')) ?? currentCoordinadorEmpleadoId
  const fechaIngresoOficial =
    normalizeDateOrNull(normalizeDate(formData.get('fecha_ingreso_oficial'))) ??
    normalizeDateOrNull(String(currentOnboarding.fecha_ingreso_oficial ?? '').trim()) ??
    normalizeDateOrNull(fallbackFechaIngresoOficial ?? null)
  const fechaIsdinizacion =
    normalizeDateOrNull(normalizeDate(formData.get('fecha_isdinizacion'))) ??
    normalizeDateOrNull(String(currentOnboarding.fecha_isdinizacion ?? '').trim())
  const accesosExternosStatus =
    (normalizeOptionalText(formData.get('accesos_externos_status')) as OnboardingExternalAccessStatus | null) ??
    ((String(currentOnboarding.accesos_externos_status ?? '').trim() || 'PENDIENTE') as OnboardingExternalAccessStatus)
  const accesosExternosObservaciones =
    normalizeOptionalText(formData.get('accesos_externos_observaciones')) ??
    (String(currentOnboarding.accesos_externos_observaciones ?? '').trim() || null)
  const expedienteCompletoRecibido =
    formData.has('expediente_completo_recibido')
      ? formData.get('expediente_completo_recibido') === 'on'
      : currentOnboarding.expediente_completo_recibido === true
  const contratoStatus =
    (normalizeOptionalText(formData.get('contrato_status')) as OnboardingContractStatus | null) ??
    ((String(currentOnboarding.contrato_status ?? '').trim() || 'PENDIENTE') as OnboardingContractStatus)
  const contratoFirmadoEn =
    normalizeDateOrNull(normalizeDate(formData.get('contrato_firmado_en'))) ??
    normalizeDateOrNull(String(currentOnboarding.contrato_firmado_en ?? '').trim())

  return {
    pdvObjetivoId,
    pdvObjetivoLabel: await resolvePdvLabel(service, pdvObjetivoId),
    coordinadorEmpleadoId,
    coordinadorNombre: await resolveCoordinadorLabel(service, coordinadorEmpleadoId),
    fechaIngresoOficial,
    fechaIsdinizacion,
    accesosExternosStatus,
    accesosExternosObservaciones,
    expedienteCompletoRecibido,
    contratoStatus,
    contratoFirmadoEn,
    validacionFinalReclutamientoAt:
      normalizeDateOrNull(String(currentOnboarding.validacion_final_reclutamiento_at ?? '').trim()) ?? null,
  }
}

function mergeEmpleadoMetadata(
  metadataActual: Record<string, unknown>,
  {
    workflowStage,
    adminAccessPending,
    onboarding,
  }: {
    workflowStage?: string
    adminAccessPending?: boolean
    onboarding?: OnboardingOperativoPayload
  }
) {
  return {
    ...metadataActual,
    ...(workflowStage ? { workflow_stage: workflowStage } : {}),
    ...(typeof adminAccessPending === 'boolean' ? { admin_access_pending: adminAccessPending } : {}),
    ...(onboarding ? { onboarding_operativo: onboarding } : {}),
  }
}

function validateOnboardingForPayroll(onboarding: OnboardingOperativoPayload) {
  if (!onboarding.pdvObjetivoId) {
    throw new Error('Define el PDV objetivo antes de enviar a Nomina.')
  }

  if (!onboarding.coordinadorEmpleadoId) {
    throw new Error('Selecciona el coordinador responsable antes de enviar a Nomina.')
  }

  if (!onboarding.fechaIngresoOficial) {
    throw new Error('La fecha oficial de ingreso es obligatoria antes de enviar a Nomina.')
  }

  if (!onboarding.fechaIsdinizacion) {
    throw new Error('La fecha de ISDINIZACION es obligatoria antes de enviar a Nomina.')
  }
}

function validateOnboardingForAdminHandoff(onboarding: OnboardingOperativoPayload) {
  if (!onboarding.expedienteCompletoRecibido) {
    throw new Error('Marca el expediente completo recibido antes de entregar a Administracion.')
  }

  if (onboarding.contratoStatus !== 'FIRMADO') {
    throw new Error('El contrato debe estar marcado como FIRMADO antes de entregar a Administracion.')
  }

  if (!onboarding.contratoFirmadoEn) {
    throw new Error('Registra la fecha de firma del contrato antes de entregar a Administracion.')
  }
}
function exceedsOperationalUploadLimit(file: File) {
  if (file.type === 'application/pdf') {
    return file.size > PDF_UPLOAD_MAX_BYTES
  }

  return file.size > RAW_UPLOAD_MAX_BYTES
}

function buildUploadLimitMessage(label: string, file: File) {
  if (file.type === 'application/pdf') {
    return `El ${label} excede el limite de 10 MB. Comprimelo antes de subirlo.`
  }

  return `El ${label} excede el limite operativo de 12 MB. Reduce el origen antes de subirlo.`
}

function getChecklistFromForm(formData: FormData) {
  return {
    activos_recuperados: formData.get('check_activos_recuperados') === 'on',
    nomina_notificada: formData.get('check_nomina_notificada') === 'on',
    logistica_notificada: formData.get('check_logistica_notificada') === 'on',
  }
}

function isCancelableAltaWorkflowStage(value: string | null | undefined) {
  return CANCELABLE_ALTA_WORKFLOW_STAGES.includes(String(value ?? '').trim() as (typeof CANCELABLE_ALTA_WORKFLOW_STAGES)[number])
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
    const expedienteFile = formData.get('expediente_pdf')
    const nombreManual = normalizeUppercaseText(formData.get('nombre_completo'))
    const curpManual = normalizeUpperIdentifier(normalizeOptionalText(formData.get('curp')))
    const nssManual = normalizeUpperIdentifier(normalizeOptionalText(formData.get('nss')))
    const rfcManual = normalizeUpperIdentifier(normalizeOptionalText(formData.get('rfc')))
    const puestoInput = normalizeOptionalText(formData.get('puesto'))
    const puesto = normalizeOcrPuesto(puestoInput) ?? 'DERMOCONSEJERO'
    const zona = normalizeUppercaseText(formData.get('zona'))
    const telefonoManual = normalizeOptionalText(formData.get('telefono'))
    const correoElectronicoManual =
      normalizeOptionalText(formData.get('correo_electronico'))?.toLowerCase() ?? null
    const fechaAltaManual = normalizeDate(formData.get('fecha_alta'))
    const fechaNacimientoManual = normalizeDate(formData.get('fecha_nacimiento'))
    const domicilioCompletoManual = normalizeUppercaseText(formData.get('domicilio_completo'))
    const codigoPostalManual = normalizePostalCode(formData.get('codigo_postal'))
    const sexoManual = normalizeUppercaseText(formData.get('sexo'))
    const estadoCivilManual = normalizeUppercaseText(formData.get('estado_civil'))
    const originarioManual = normalizeUppercaseText(formData.get('originario'))
    const edadManual = normalizeWholeNumber(formData.get('edad'), 'Edad')
    const credencialPdf = formData.get('credencial_pdf')
    const constanciaFiscalPdf = formData.get('constancia_fiscal_pdf')

    if (!(expedienteFile instanceof File) || expedienteFile.size <= 0) {
      return buildState({ message: 'Adjunta el expediente completo en PDF para crear el empleado.' })
    }

    if (expedienteFile.type !== 'application/pdf') {
      return buildState({ message: 'El expediente inicial debe cargarse como PDF.' })
    }

    if (exceedsOperationalUploadLimit(expedienteFile)) {
      return buildState({
        message: buildUploadLimitMessage('expediente', expedienteFile),
      })
    }

    const documentosComplementariosAlta = [
      {
        file: credencialPdf,
        etiqueta: 'credencial PDF',
      },
      {
        file: constanciaFiscalPdf,
        etiqueta: 'constancia de situacion fiscal',
      },
    ]

    for (const documentoComplementario of documentosComplementariosAlta) {
      if (!(documentoComplementario.file instanceof File) || documentoComplementario.file.size <= 0) {
        continue
      }

      if (documentoComplementario.file.type !== 'application/pdf') {
        return buildState({
          message: `La ${documentoComplementario.etiqueta} debe cargarse como PDF.`,
        })
      }

      if (exceedsOperationalUploadLimit(documentoComplementario.file)) {
        return buildState({
          message: buildUploadLimitMessage(documentoComplementario.etiqueta, documentoComplementario.file),
        })
      }
    }

    if (!PUESTOS_VALIDOS.includes(puesto)) {
      return buildState({ message: 'El puesto seleccionado no es valido.' })
    }

    const empleadoId = crypto.randomUUID()
    const documentoPreparado = await prepararDocumentoEmpleado(service, {
      actorUsuarioId: actor.usuarioId,
      empleadoId,
      categoria: 'EXPEDIENTE',
      tipoDocumento: 'OTRO',
      file: expedienteFile,
      expectedDocumentType: 'EXPEDIENTE_COMPLETO',
      employeeName: nombreManual,
      employeeNss: nssManual,
      metadataExtra: {
        workflow_stage: 'reclutamiento_upload',
        full_expediente_pdf: true,
      },
    })

    const ocrSnapshot = buildEmpleadoOcrSnapshot(documentoPreparado.ocr.result)

    const nombreCompleto =
      nombreManual ?? normalizeUppercaseString(documentoPreparado.ocr.result.employeeName)
    const curp = curpManual ?? normalizeUpperIdentifier(documentoPreparado.ocr.result.curp)
    const nss = nssManual ?? normalizeUpperIdentifier(documentoPreparado.ocr.result.nss)
    const rfc = rfcManual ?? normalizeUpperIdentifier(documentoPreparado.ocr.result.rfc)
    const telefono = telefonoManual ?? ocrSnapshot.telefono
    const correoElectronico = correoElectronicoManual ?? ocrSnapshot.correoElectronico?.toLowerCase() ?? null
    const fechaAlta = normalizeDateOrNull(fechaAltaManual) ?? new Date().toISOString().slice(0, 10)
    const fechaNacimiento = normalizeDateOrNull(fechaNacimientoManual) ?? ocrSnapshot.fechaNacimiento
    const domicilioCompleto = domicilioCompletoManual ?? ocrSnapshot.direccion
    const codigoPostal = codigoPostalManual ?? ocrSnapshot.codigoPostal
    const edad = edadManual ?? ocrSnapshot.edad
    const aniosLaborando = deriveYearsFromAgencyStartDate(fechaAlta) ?? 0
    const sexo = sexoManual ?? ocrSnapshot.sexo
    const estadoCivil = estadoCivilManual ?? ocrSnapshot.estadoCivil
    const originario = originarioManual ?? ocrSnapshot.originario
    const onboardingOperativo = await buildOnboardingOperativoPayload(service, formData, {
      fallbackFechaIngresoOficial: fechaAlta,
    })

    if (!nombreCompleto || !curp || !nss || !rfc) {
      return buildState({
        message:
          'El OCR no logro completar nombre, CURP, NSS y RFC del expediente. Corrige el PDF o captura manualmente los faltantes.',
        ocrSnapshot,
      })
    }

    const [curpExistente, rfcExistente, nssExistente] = await Promise.all([
      service.from('empleado').select('id').eq('curp', curp).maybeSingle(),
      service.from('empleado').select('id').eq('rfc', rfc).maybeSingle(),
      service.from('empleado').select('id').eq('nss', nss).maybeSingle(),
    ])

    if (curpExistente.data || rfcExistente.data || nssExistente.data) {
      return buildState({
        message: 'CURP, RFC o NSS ya estan registrados en otro expediente.',
        ocrSnapshot,
      })
    }

    const { data: insertedEmpleado, error: insertEmpleadoError } = await service
      .from('empleado')
      .insert({
        id: empleadoId,
        id_nomina: null,
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
        fecha_nacimiento: fechaNacimiento,
        fecha_baja: null,
        domicilio_completo: domicilioCompleto,
        codigo_postal: codigoPostal,
        edad,
        anios_laborando: aniosLaborando,
        sexo,
        estado_civil: estadoCivil,
        originario,
        sbc_diario: null,
        supervisor_empleado_id: null,
        expediente_estado: 'EN_REVISION',
        expediente_validado_en: null,
        expediente_validado_por_usuario_id: null,
        expediente_observaciones: documentoPreparado.ocr.result.confidenceSummary,
        imss_estado: 'NO_INICIADO',
        metadata: {
          source: 'modulo_empleados_reclutamiento',
          workflow_stage: 'PENDIENTE_COORDINACION',
          admin_access_pending: false,
          expediente_pdf_sha256: documentoPreparado.archivoHash.sha256,
          expediente_pdf_path: documentoPreparado.archivoHash.ruta_archivo,
          ocr_snapshot: documentoPreparado.ocr.result,
          onboarding_operativo: onboardingOperativo,
        },
      })
      .select('id, id_nomina, nombre_completo, puesto, correo_electronico')
      .maybeSingle()

    if (insertEmpleadoError || !insertedEmpleado) {
      return buildState({
        message: insertEmpleadoError?.message ?? 'No fue posible crear el candidato.',
        ocrSnapshot,
      })
    }

    const documentoRegistrado = await registrarDocumentoEmpleado(service, documentoPreparado, {
      actorUsuarioId: actor.usuarioId,
      empleadoId: insertedEmpleado.id,
      categoria: 'EXPEDIENTE',
      tipoDocumento: 'OTRO',
      file: expedienteFile,
      metadataExtra: {
        workflow_stage: 'reclutamiento_upload',
        full_expediente_pdf: true,
      },
    })

    const documentosComplementarios = [
      {
        file: credencialPdf,
        tipoDocumento: 'INE' as const,
        expectedDocumentType: 'INE',
        etiqueta: 'credencial PDF',
      },
      {
        file: constanciaFiscalPdf,
        tipoDocumento: 'RFC' as const,
        expectedDocumentType: 'RFC',
        etiqueta: 'constancia de situacion fiscal',
      },
    ]

    for (const documentoComplementario of documentosComplementarios) {
      if (!(documentoComplementario.file instanceof File) || documentoComplementario.file.size <= 0) {
        continue
      }

      const preparadoComplementario = await prepararDocumentoEmpleado(service, {
        actorUsuarioId: actor.usuarioId,
        empleadoId: insertedEmpleado.id,
        categoria: 'EXPEDIENTE',
        tipoDocumento: documentoComplementario.tipoDocumento,
        file: documentoComplementario.file,
        expectedDocumentType: documentoComplementario.expectedDocumentType,
        employeeName: nombreCompleto,
        employeeNss: nss,
        metadataExtra: {
          workflow_stage: 'reclutamiento_upload',
          complemento_alta: true,
        },
      })

      const registradoComplementario = await registrarDocumentoEmpleado(service, preparadoComplementario, {
        actorUsuarioId: actor.usuarioId,
        empleadoId: insertedEmpleado.id,
        categoria: 'EXPEDIENTE',
        tipoDocumento: documentoComplementario.tipoDocumento,
        file: documentoComplementario.file,
        metadataExtra: {
          workflow_stage: 'reclutamiento_upload',
          complemento_alta: true,
        },
      })

      if (
        documentoComplementario.tipoDocumento === 'INE' &&
        registradoComplementario.documentoExistente === false
      ) {
        await syncBiometriaReferenceFromDocumento(service, {
          empleadoId: insertedEmpleado.id,
          documentoId: registradoComplementario.documentoId,
          archivoHash: registradoComplementario.archivoHash,
          storedEvidence: registradoComplementario.storedEvidence,
        })
      }
    }

    if (documentoRegistrado.documentoExistente === false) {
      await registrarEventoAudit(service, {
        tabla: 'empleado_documento',
        registroId: documentoRegistrado.documentoId,
        payload: {
          evento: 'empleado_documento_cargado',
          empleado: nombreCompleto,
          categoria: 'EXPEDIENTE',
          tipo_documento: 'OTRO',
          sha256: documentoRegistrado.archivoHash.sha256,
          optimization_kind: documentoRegistrado.optimization.optimizationKind,
          optimization_original_bytes: documentoRegistrado.optimization.originalBytes,
          optimization_final_bytes: documentoRegistrado.optimization.optimizedBytes,
          ocr_status: documentoRegistrado.ocr.result.status,
          ocr_provider: documentoRegistrado.ocr.provider,
        },
        usuarioId: actor.usuarioId,
      })
    }

    await registrarEventoAudit(service, {
      tabla: 'empleado',
      registroId: insertedEmpleado.id,
      payload: {
        evento: 'empleado_creado_desde_expediente_ocr',
        nombre: nombreCompleto,
        puesto,
        zona,
        fecha_alta: fechaAlta,
        workflow_stage: 'PENDIENTE_COORDINACION',
      },
      usuarioId: actor.usuarioId,
    })

    revalidatePath('/empleados')
    revalidatePath('/nomina')
    revalidatePath('/admin/users')
    return buildState({
      ok: true,
      message:
        'Candidato creado desde CV y enviado a Coordinacion para entrevista y aprobacion.',
      duplicatedUpload: documentoRegistrado.storedEvidence.deduplicated,
      ocrSnapshot,
    })  } catch (error) {
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

export async function actualizarFichaEmpleadoReclutamiento(
  _prevState: EmpleadoActionState,
  formData: FormData
): Promise<EmpleadoActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'RECLUTAMIENTO'])
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const empleadoId = String(formData.get('empleado_id') ?? '').trim()
  if (!empleadoId) {
    return buildState({ message: 'Selecciona un empleado valido.' })
  }

  const nombreCompleto = normalizeUppercaseText(formData.get('nombre_completo'))
  const curp = normalizeUpperIdentifier(normalizeOptionalText(formData.get('curp')))
  const nss = normalizeUpperIdentifier(normalizeOptionalText(formData.get('nss')))
  const rfc = normalizeUpperIdentifier(normalizeOptionalText(formData.get('rfc')))
  const puestoInput = normalizeOptionalText(formData.get('puesto'))
  const puesto = normalizeOcrPuesto(puestoInput) ?? 'DERMOCONSEJERO'
  const zona = normalizeUppercaseText(formData.get('zona'))
  const telefono = normalizeOptionalText(formData.get('telefono'))
  const correoElectronico =
    normalizeOptionalText(formData.get('correo_electronico'))?.toLowerCase() ?? null
  const fechaAlta = normalizeDateOrNull(normalizeDate(formData.get('fecha_alta')))
  const fechaNacimiento = normalizeDateOrNull(normalizeDate(formData.get('fecha_nacimiento')))
  const domicilioCompleto = normalizeUppercaseText(formData.get('domicilio_completo'))
  const codigoPostal = normalizePostalCode(formData.get('codigo_postal'))
  const edad = normalizeWholeNumber(formData.get('edad'), 'Edad')
  const sexo = normalizeUppercaseText(formData.get('sexo'))
  const estadoCivil = normalizeUppercaseText(formData.get('estado_civil'))
  const originario = normalizeUppercaseText(formData.get('originario'))
  const aniosLaborando = deriveYearsFromAgencyStartDate(fechaAlta) ?? 0

  if (!nombreCompleto || !curp || !nss || !rfc) {
    return buildState({
      message: 'Nombre completo, CURP, NSS y RFC siguen siendo obligatorios para la ficha.',
    })
  }

  const { data: empleadoActual, error: empleadoError } = await service
    .from('empleado')
    .select('id, curp, rfc, nss, metadata')
    .eq('id', empleadoId)
    .maybeSingle()

  if (empleadoError || !empleadoActual) {
    return buildState({ message: empleadoError?.message ?? 'Empleado no encontrado.' })
  }

  const [curpExistente, rfcExistente, nssExistente] = await Promise.all([
    service.from('empleado').select('id').eq('curp', curp).neq('id', empleadoId).maybeSingle(),
    service.from('empleado').select('id').eq('rfc', rfc).neq('id', empleadoId).maybeSingle(),
    service.from('empleado').select('id').eq('nss', nss).neq('id', empleadoId).maybeSingle(),
  ])

  if (curpExistente.data || rfcExistente.data || nssExistente.data) {
    return buildState({
      message: 'CURP, RFC o NSS ya estan registrados en otro expediente.',
    })
  }

  const metadataActual =
    empleadoActual.metadata && typeof empleadoActual.metadata === 'object' && !Array.isArray(empleadoActual.metadata)
      ? (empleadoActual.metadata as Record<string, unknown>)
      : {}
  const onboardingOperativo = await buildOnboardingOperativoPayload(service, formData, {
    fallbackFechaIngresoOficial: fechaAlta,
    current: metadataActual,
  })
  const updatePayload: Record<string, unknown> = {
    nombre_completo: nombreCompleto,
    curp,
    nss,
    rfc,
    puesto,
    zona,
    telefono,
    correo_electronico: correoElectronico,
    fecha_alta: fechaAlta,
    fecha_nacimiento: fechaNacimiento,
    domicilio_completo: domicilioCompleto,
    codigo_postal: codigoPostal,
    edad,
    anios_laborando: aniosLaborando,
    sexo,
    estado_civil: estadoCivil,
    originario,
    metadata: mergeEmpleadoMetadata(metadataActual, {
      onboarding: onboardingOperativo,
    }),
    updated_at: new Date().toISOString(),
  }

  const reenviarAltaANomina = metadataActual.workflow_stage === 'RECLUTAMIENTO_CORRECCION_ALTA'

  if (reenviarAltaANomina) {
    updatePayload.expediente_estado = 'EN_REVISION'
    updatePayload.metadata = mergeEmpleadoMetadata(metadataActual, {
      workflowStage: 'SELECCION_APROBADA',
      adminAccessPending: false,
      onboarding: onboardingOperativo,
    })
  }

  const { error } = await service
    .from('empleado')
    .update(updatePayload)
    .eq('id', empleadoId)

  if (error) {
    return buildState({ message: error.message })
  }

  await registrarEventoAudit(service, {
    tabla: 'empleado',
    registroId: empleadoId,
    payload: {
      evento: 'empleado_ficha_corregida_reclutamiento',
      nombre: nombreCompleto,
      curp,
      rfc,
      nss,
      puesto,
      zona,
    },
    usuarioId: actor.usuarioId,
  })

  revalidatePath('/empleados')
  if (reenviarAltaANomina) {
    await registrarNotificacionWorkflowEmpleados(service, {
      actorUsuarioId: actor.usuarioId,
      puestosDestino: ['NOMINA'],
      empleadoId,
      workflow: 'empleados_alta_corregida_reingresa_nomina',
      title: 'Alta corregida lista para Nomina',
      body: `${nombreCompleto} fue corregido por Reclutamiento y vuelve a la bandeja de IMSS.`,
      path: '/nomina?inbox=altas-imss',
      tag: `empleado-alta-corregida-${empleadoId}`,
      auditAction: 'notificar_nomina_alta_corregida',
    })
    revalidatePath('/nomina')
  }
  return buildState({ ok: true, message: 'Ficha laboral actualizada. Ya puedes reenviar soportes corregidos.' })
}

export async function enviarAltaANominaDesdeReclutamiento(
  _prevState: EmpleadoActionState,
  formData: FormData
): Promise<EmpleadoActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'RECLUTAMIENTO'])
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const empleadoId = String(formData.get('empleado_id') ?? '').trim()
  if (!empleadoId) {
    return buildState({ message: 'Selecciona un empleado valido.' })
  }

  const { data: empleado, error: empleadoError } = await service
    .from('empleado')
    .select('id, nombre_completo, fecha_alta, metadata')
    .eq('id', empleadoId)
    .maybeSingle()

  if (empleadoError || !empleado) {
    return buildState({ message: empleadoError?.message ?? 'Empleado no encontrado.' })
  }

  const metadataActual = mapMetadataRecord(empleado.metadata)
  const onboardingOperativo = await buildOnboardingOperativoPayload(service, formData, {
    fallbackFechaIngresoOficial: empleado.fecha_alta,
    current: metadataActual,
  })

  try {
    validateOnboardingForPayroll(onboardingOperativo)
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'Paquete operativo incompleto.' })
  }

  const workflowStageActual = String(metadataActual.workflow_stage ?? '').trim() || null
  const nextStage = 'PENDIENTE_IMSS_NOMINA'
  const now = new Date().toISOString()

  const { error: updateError } = await service
    .from('empleado')
    .update({
      expediente_estado: 'EN_REVISION',
      metadata: mergeEmpleadoMetadata(metadataActual, {
        workflowStage: nextStage,
        adminAccessPending: false,
        onboarding: onboardingOperativo,
      }),
      updated_at: now,
    })
    .eq('id', empleadoId)

  if (updateError) {
    return buildState({ message: updateError.message })
  }

  await registrarEventoAudit(service, {
    tabla: 'empleado',
    registroId: empleadoId,
    payload: {
      evento: 'empleado_enviado_a_nomina_desde_reclutamiento',
      workflow_stage_anterior: workflowStageActual,
      workflow_stage_nuevo: nextStage,
      pdv_objetivo_id: onboardingOperativo.pdvObjetivoId,
      coordinador_empleado_id: onboardingOperativo.coordinadorEmpleadoId,
      fecha_ingreso_oficial: onboardingOperativo.fechaIngresoOficial,
      fecha_isdinizacion: onboardingOperativo.fechaIsdinizacion,
    },
    usuarioId: actor.usuarioId,
  })

  await registrarNotificacionWorkflowEmpleados(service, {
    actorUsuarioId: actor.usuarioId,
    puestosDestino: ['NOMINA'],
    empleadoId,
    workflow: 'empleados_alta_pendiente_imss',
    title: 'Alta nueva pendiente de IMSS',
    body: `${empleado.nombre_completo} ya quedo listo para que Nomina inicie el alta IMSS.`,
    path: '/nomina?inbox=altas-imss',
    tag: `empleado-alta-imss-${empleadoId}`,
    auditAction: 'notificar_nomina_alta_pendiente',
  })
  revalidatePath('/empleados')
  revalidatePath('/nomina')

  return buildState({
    ok: true,
    message: 'Paquete validado y enviado a Nomina para alta IMSS.',
  })
}

export async function aprobarCandidatoCoordinacion(
  _prevState: EmpleadoActionState,
  formData: FormData
): Promise<EmpleadoActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'COORDINADOR'])
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const empleadoId = String(formData.get('empleado_id') ?? '').trim()
  if (!empleadoId) {
    return buildState({ message: 'Selecciona un candidato valido.' })
  }

  const { data: empleado, error: empleadoError } = await service
    .from('empleado')
    .select('id, nombre_completo, fecha_alta, metadata')
    .eq('id', empleadoId)
    .maybeSingle()

  if (empleadoError || !empleado) {
    return buildState({ message: empleadoError?.message ?? 'Candidato no encontrado.' })
  }

  const metadataActual = mapMetadataRecord(empleado.metadata)
  const workflowStageActual = String(metadataActual.workflow_stage ?? '').trim() || null
  if (workflowStageActual !== 'PENDIENTE_COORDINACION') {
    return buildState({ message: 'Este candidato ya no esta pendiente de Coordinacion.' })
  }

  let onboardingOperativo = await buildOnboardingOperativoPayload(service, formData, {
    fallbackFechaIngresoOficial: empleado.fecha_alta,
    current: metadataActual,
  })

  if (!onboardingOperativo.pdvObjetivoId) {
    return buildState({ message: 'Coordinacion debe confirmar el PDV objetivo antes de aprobar.' })
  }

  if (!onboardingOperativo.coordinadorEmpleadoId && actor.puesto === 'COORDINADOR' && actor.empleadoId) {
    onboardingOperativo = {
      ...onboardingOperativo,
      coordinadorEmpleadoId: actor.empleadoId,
      coordinadorNombre: await resolveCoordinadorLabel(service, actor.empleadoId),
    }
  }

  const now = new Date().toISOString()
  const { error: updateError } = await service
    .from('empleado')
    .update({
      expediente_estado: 'EN_REVISION',
      metadata: mergeEmpleadoMetadata(metadataActual, {
        workflowStage: 'SELECCION_APROBADA',
        adminAccessPending: false,
        onboarding: onboardingOperativo,
      }),
      updated_at: now,
    })
    .eq('id', empleadoId)

  if (updateError) {
    return buildState({ message: updateError.message })
  }

  await registrarEventoAudit(service, {
    tabla: 'empleado',
    registroId: empleadoId,
    payload: {
      evento: 'candidato_aprobado_por_coordinacion',
      workflow_stage_anterior: workflowStageActual,
      workflow_stage_nuevo: 'SELECCION_APROBADA',
      pdv_objetivo_id: onboardingOperativo.pdvObjetivoId,
      coordinador_empleado_id: onboardingOperativo.coordinadorEmpleadoId,
    },
    usuarioId: actor.usuarioId,
  })

  revalidatePath('/empleados')

  return buildState({
    ok: true,
    message: 'Candidato aprobado por Coordinacion. Reclutamiento ya puede continuar con el expediente y el paquete operativo.',
  })
}
export async function validarCierreOnboardingReclutamiento(
  _prevState: EmpleadoActionState,
  formData: FormData
): Promise<EmpleadoActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'RECLUTAMIENTO'])
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const empleadoId = String(formData.get('empleado_id') ?? '').trim()
  if (!empleadoId) {
    return buildState({ message: 'Selecciona un empleado valido.' })
  }

  const { data: empleado, error: empleadoError } = await service
    .from('empleado')
    .select('id, nombre_completo, correo_electronico, imss_estado, metadata')
    .eq('id', empleadoId)
    .maybeSingle()

  if (empleadoError || !empleado) {
    return buildState({ message: empleadoError?.message ?? 'Empleado no encontrado.' })
  }

  if (empleado.imss_estado !== 'ALTA_IMSS') {
    return buildState({ message: 'La validacion final solo aplica despues de confirmar el alta IMSS.' })
  }

  const metadataActual = mapMetadataRecord(empleado.metadata)
  const onboardingOperativo = await buildOnboardingOperativoPayload(service, formData, {
    current: metadataActual,
  })

  try {
    validateOnboardingForAdminHandoff(onboardingOperativo)
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'Cierre de onboarding incompleto.' })
  }

  const nextOnboarding = {
    ...onboardingOperativo,
    validacionFinalReclutamientoAt: new Date().toISOString(),
  }
  const now = new Date().toISOString()

  const { error: updateError } = await service
    .from('empleado')
    .update({
      metadata: mergeEmpleadoMetadata(metadataActual, {
        workflowStage: 'PENDIENTE_ACCESO_ADMIN',
        adminAccessPending: true,
        onboarding: nextOnboarding,
      }),
      updated_at: now,
    })
    .eq('id', empleadoId)

  if (updateError) {
    return buildState({ message: updateError.message })
  }

  await registrarEventoAudit(service, {
    tabla: 'empleado',
    registroId: empleadoId,
    payload: {
      evento: 'empleado_validacion_final_reclutamiento',
      workflow_stage_nuevo: 'PENDIENTE_ACCESO_ADMIN',
      contrato_status: nextOnboarding.contratoStatus,
      contrato_firmado_en: nextOnboarding.contratoFirmadoEn,
      expediente_completo_recibido: nextOnboarding.expedienteCompletoRecibido,
    },
    usuarioId: actor.usuarioId,
  })

  const { data: usuarioExistente } = await service
    .from('usuario')
    .select('id')
    .eq('empleado_id', empleadoId)
    .maybeSingle()

  if (!usuarioExistente) {
    await registrarNotificacionAdminAltaImss(service, {
      actorUsuarioId: actor.usuarioId,
      empleadoId,
      nombreEmpleado: empleado.nombre_completo,
      correoElectronico: empleado.correo_electronico ?? null,
    })
  }

  revalidatePath('/empleados')
  revalidatePath('/admin/users')

  return buildState({
    ok: true,
    message: 'Validacion final completada. Administracion ya puede generar acceso, QR y asignacion inicial.',
  })
}
export async function cancelarProcesoAltaEmpleado(
  _prevState: EmpleadoActionState,
  formData: FormData
): Promise<EmpleadoActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'RECLUTAMIENTO', 'NOMINA'])
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const empleadoId = String(formData.get('empleado_id') ?? '').trim()
  const motivoCancelacion = normalizeOptionalText(formData.get('motivo_cancelacion_alta'))

  if (!empleadoId) {
    return buildState({ message: 'Selecciona un empleado valido.' })
  }

  if (!motivoCancelacion) {
    return buildState({ message: 'Explica por que se cancela el proceso completo.' })
  }

  const { data: empleado, error: empleadoError } = await service
    .from('empleado')
    .select('id, nombre_completo, metadata, estatus_laboral')
    .eq('id', empleadoId)
    .maybeSingle()

  if (empleadoError || !empleado) {
    return buildState({ message: empleadoError?.message ?? 'Empleado no encontrado.' })
  }

  const metadataActual =
    empleado.metadata && typeof empleado.metadata === 'object' && !Array.isArray(empleado.metadata)
      ? (empleado.metadata as Record<string, unknown>)
      : {}
  const workflowStageActual = String(metadataActual.workflow_stage ?? '').trim() || null
  const { data: usuarioActual } = await service
    .from('usuario')
    .select('estado_cuenta')
    .eq('empleado_id', empleadoId)
    .maybeSingle()

  if (!isCancelableAltaWorkflowStage(workflowStageActual)) {
    return buildState({
      message: 'Este expediente ya no esta en una etapa activa de alta para cancelarse.',
    })
  }

  const now = new Date().toISOString()
  const { error } = await service
    .from('empleado')
    .update({
      estatus_laboral: empleado.estatus_laboral === 'BAJA' ? 'BAJA' : 'SUSPENDIDO',
      expediente_observaciones: motivoCancelacion,
      imss_observaciones: motivoCancelacion,
      metadata: {
        ...metadataActual,
        workflow_stage: 'ALTA_CANCELADA',
        admin_access_pending: false,
        alta_cancelada_at: now,
        alta_cancelada_por_puesto: actor.puesto,
        alta_cancelada_motivo: motivoCancelacion,
        alta_cancelada_desde_stage: workflowStageActual,
        alta_cancelada_estatus_laboral_previo: empleado.estatus_laboral,
        alta_cancelada_estado_cuenta_previo: usuarioActual?.estado_cuenta ?? null,
      },
      updated_at: now,
    })
    .eq('id', empleadoId)

  if (error) {
    return buildState({ message: error.message })
  }

  await service
    .from('usuario')
    .update({
      estado_cuenta: 'SUSPENDIDA',
      updated_at: now,
    })
    .eq('empleado_id', empleadoId)
    .neq('estado_cuenta', 'BAJA')

  await registrarEventoAudit(service, {
    tabla: 'empleado',
    registroId: empleadoId,
    payload: {
      evento: 'empleado_alta_cancelada',
      motivo_cancelacion: motivoCancelacion,
      workflow_stage_anterior: workflowStageActual,
      workflow_stage_nuevo: 'ALTA_CANCELADA',
    },
    usuarioId: actor.usuarioId,
  })

  if (actor.puesto === 'NOMINA' || actor.puesto === 'ADMINISTRADOR') {
    await registrarNotificacionWorkflowEmpleados(service, {
      actorUsuarioId: actor.usuarioId,
      puestosDestino: ['RECLUTAMIENTO'],
      empleadoId,
      workflow: 'empleados_alta_cancelada',
      title: 'Proceso de alta cancelado',
      body: `${empleado.nombre_completo} fue cancelado y ya no requiere alta IMSS. Motivo: ${motivoCancelacion}`,
      path: '/empleados?inbox=cancelados',
      tag: `empleado-alta-cancelada-${empleadoId}`,
      auditAction: 'notificar_reclutamiento_alta_cancelada',
    })
  }

  if (actor.puesto === 'RECLUTAMIENTO' || actor.puesto === 'ADMINISTRADOR') {
    await registrarNotificacionWorkflowEmpleados(service, {
      actorUsuarioId: actor.usuarioId,
      puestosDestino: ['NOMINA'],
      empleadoId,
      workflow: 'empleados_alta_cancelada',
      title: 'Proceso de alta cancelado',
      body: `${empleado.nombre_completo} ya no requiere alta IMSS. Motivo: ${motivoCancelacion}`,
      path: '/nomina?inbox=altas-imss',
      tag: `empleado-alta-cancelada-nomina-${empleadoId}`,
      auditAction: 'notificar_nomina_alta_cancelada',
    })
  }

  revalidatePath('/empleados')
  revalidatePath('/nomina')
  revalidatePath('/dashboard')
  revalidatePath('/admin/users')

  return buildState({
    ok: true,
    message: 'Proceso de alta cancelado. El expediente queda en la bandeja de cancelados con trazabilidad completa.',
  })
}

export async function reactivarProcesoAltaEmpleado(
  _prevState: EmpleadoActionState,
  formData: FormData
): Promise<EmpleadoActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'RECLUTAMIENTO', 'NOMINA'])
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const empleadoId = String(formData.get('empleado_id') ?? '').trim()

  if (!empleadoId) {
    return buildState({ message: 'Selecciona un empleado valido.' })
  }

  const { data: empleado, error: empleadoError } = await service
    .from('empleado')
    .select('id, nombre_completo, metadata, estatus_laboral')
    .eq('id', empleadoId)
    .maybeSingle()

  if (empleadoError || !empleado) {
    return buildState({ message: empleadoError?.message ?? 'Empleado no encontrado.' })
  }

  const metadataActual =
    empleado.metadata && typeof empleado.metadata === 'object' && !Array.isArray(empleado.metadata)
      ? (empleado.metadata as Record<string, unknown>)
      : {}
  const workflowStageActual = String(metadataActual.workflow_stage ?? '').trim() || null

  if (workflowStageActual !== 'ALTA_CANCELADA') {
    return buildState({
      message: 'Solo los expedientes en Cancelados se pueden regresar al flujo de alta.',
    })
  }

  const workflowStagePrevio = String(metadataActual.alta_cancelada_desde_stage ?? '').trim() || null

  if (!isCancelableAltaWorkflowStage(workflowStagePrevio)) {
    return buildState({
      message: 'No existe una etapa valida para regresar este expediente al flujo de alta.',
    })
  }
  const workflowStageRestaurado = workflowStagePrevio as (typeof CANCELABLE_ALTA_WORKFLOW_STAGES)[number]

  const estatusLaboralPrevio = String(
    metadataActual.alta_cancelada_estatus_laboral_previo ?? 'ACTIVO'
  ).trim()
  const adminAccessPending = workflowStageRestaurado === 'PENDIENTE_ACCESO_ADMIN'
  const now = new Date().toISOString()
  const nextMetadata = {
    ...metadataActual,
    workflow_stage: workflowStageRestaurado,
    admin_access_pending: adminAccessPending,
    alta_cancelada_revertida_at: now,
    alta_cancelada_revertida_por_puesto: actor.puesto,
  }

  const { error: updateEmpleadoError } = await service
    .from('empleado')
    .update({
      estatus_laboral:
        estatusLaboralPrevio === 'BAJA' ? empleado.estatus_laboral : 'ACTIVO',
      metadata: nextMetadata,
      updated_at: now,
    })
    .eq('id', empleadoId)

  if (updateEmpleadoError) {
    return buildState({ message: updateEmpleadoError.message })
  }

  const estadoCuentaPrevio = String(metadataActual.alta_cancelada_estado_cuenta_previo ?? '').trim()
  if (estadoCuentaPrevio) {
    await service
      .from('usuario')
      .update({
        estado_cuenta: estadoCuentaPrevio,
        updated_at: now,
      })
      .eq('empleado_id', empleadoId)
      .eq('estado_cuenta', 'SUSPENDIDA')
  }

  await registrarEventoAudit(service, {
    tabla: 'empleado',
    registroId: empleadoId,
    payload: {
      evento: 'empleado_alta_reactivada',
      workflow_stage_anterior: 'ALTA_CANCELADA',
      workflow_stage_nuevo: workflowStageRestaurado,
    },
    usuarioId: actor.usuarioId,
  })

  if (
    workflowStageRestaurado === 'PENDIENTE_IMSS_NOMINA' ||
    workflowStageRestaurado === 'EN_FLUJO_IMSS'
  ) {
    await registrarNotificacionWorkflowEmpleados(service, {
      actorUsuarioId: actor.usuarioId,
      puestosDestino: ['NOMINA'],
      empleadoId,
      workflow: 'empleados_alta_reactivada',
      title: 'Proceso de alta reactivado',
      body: `${empleado.nombre_completo} regreso al flujo de alta y vuelve a requerir seguimiento de Nomina.`,
      path: '/nomina?inbox=altas-imss',
      tag: `empleado-alta-reactivada-nomina-${empleadoId}`,
      auditAction: 'notificar_nomina_alta_reactivada',
    })
  }

  revalidatePath('/empleados')
  revalidatePath('/nomina')
  revalidatePath('/dashboard')
  revalidatePath('/admin/users')

  return buildState({
    ok: true,
    message: `Proceso reactivado. El expediente regreso a ${workflowStageRestaurado.replaceAll('_', ' ').toLowerCase()}.`,
  })
}

export async function actualizarEstadoImssEmpleado(
  _prevState: EmpleadoActionState,
  formData: FormData
): Promise<EmpleadoActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'NOMINA'])
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
  let sbcDiario: number | null = null

  try {
    sueldoBaseMensual = normalizeCurrency(formData.get('sueldo_base_mensual'))
    sbcDiario = normalizeCurrency(formData.get('sbc_diario'))
  } catch (error) {
    return buildState({ message: error instanceof Error ? error.message : 'SBC o sueldo base invalido.' })
  }

  if (!empleadoId) {
    return buildState({ message: 'Selecciona un empleado valido.' })
  }

  if (!IMSS_ESTADOS.includes(imssEstado)) {
    return buildState({ message: 'El estado IMSS no es valido.' })
  }

  const { data: empleado, error: empleadoError } = await service
    .from('empleado')
    .select('id, nombre_completo, correo_electronico, curp, nss, rfc, fecha_alta, metadata')
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

  if (imssEstado === 'ALTA_IMSS') {
    const { data: documentoImss } = await service
      .from('empleado_documento')
      .select('id')
      .eq('empleado_id', empleadoId)
      .eq('categoria', 'IMSS')
      .eq('tipo_documento', 'ALTA_IMSS')
      .maybeSingle()

    if (!documentoImss) {
      return buildState({
        message: 'Antes de cerrar el alta IMSS debes subir el PDF del comprobante IMSS.',
      })
    }
  }

  const metadataActual =
    empleado.metadata && typeof empleado.metadata === 'object' && !Array.isArray(empleado.metadata)
      ? (empleado.metadata as Record<string, unknown>)
      : {}

  const nowIso = new Date().toISOString()

  const { error } = await service
    .from('empleado')
    .update({
      imss_estado: imssEstado,
      imss_fecha_solicitud: imssFechaSolicitud,
      imss_fecha_alta: imssFechaAlta,
      imss_observaciones: imssObservaciones,
      sbc_diario: sbcDiario,
      sueldo_base_mensual: sueldoBaseMensual,
      metadata: {
        ...metadataActual,
        workflow_stage:
          imssEstado === 'ALTA_IMSS' ? 'PENDIENTE_ACCESO_ADMIN' : 'EN_FLUJO_IMSS',
        admin_access_pending: imssEstado === 'ALTA_IMSS',
      },
      updated_at: nowIso,
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
      sbc_diario: sbcDiario,
      sueldo_base_mensual: sueldoBaseMensual,
      workflow_stage: imssEstado === 'ALTA_IMSS' ? 'PENDIENTE_VALIDACION_FINAL' : 'EN_FLUJO_IMSS',
    },
    usuarioId: actor.usuarioId,
  })

  revalidatePath('/empleados')
  revalidatePath('/nomina')
  revalidatePath('/admin/users')
  return buildState({
    ok: true,
    message:
      imssEstado === 'ALTA_IMSS'
        ? 'Alta IMSS confirmada. Reclutamiento debe hacer la validacion final antes de entregar a Administracion.'
        : 'Flujo IMSS actualizado.',
  })
}

export async function rechazarAltaImssEmpleadoNomina(
  _prevState: EmpleadoActionState,
  formData: FormData
): Promise<EmpleadoActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'NOMINA'])
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const empleadoId = String(formData.get('empleado_id') ?? '').trim()
  const motivoRechazo = normalizeOptionalText(formData.get('motivo_rechazo_nomina'))

  if (!empleadoId) {
    return buildState({ message: 'Selecciona un empleado valido.' })
  }

  if (!motivoRechazo) {
    return buildState({ message: 'Nomina debe explicar el motivo del rechazo.' })
  }

  const { data: empleado, error: empleadoError } = await service
    .from('empleado')
    .select('id, nombre_completo, metadata')
    .eq('id', empleadoId)
    .maybeSingle()

  if (empleadoError || !empleado) {
    return buildState({ message: empleadoError?.message ?? 'Empleado no encontrado.' })
  }

  const metadataActual =
    empleado.metadata && typeof empleado.metadata === 'object' && !Array.isArray(empleado.metadata)
      ? (empleado.metadata as Record<string, unknown>)
      : {}

  const now = new Date().toISOString()
  const { error } = await service
    .from('empleado')
    .update({
      expediente_estado: 'OBSERVADO',
      expediente_observaciones: motivoRechazo,
      imss_estado: 'PENDIENTE_DOCUMENTOS',
      imss_observaciones: motivoRechazo,
      metadata: {
        ...metadataActual,
        workflow_stage: 'RECLUTAMIENTO_CORRECCION_ALTA',
        admin_access_pending: false,
        nomina_rechazo_alta_at: now,
        nomina_rechazo_alta_motivo: motivoRechazo,
      },
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
      evento: 'empleado_alta_rechazada_nomina',
      motivo_rechazo: motivoRechazo,
      workflow_stage: 'RECLUTAMIENTO_CORRECCION_ALTA',
    },
    usuarioId: actor.usuarioId,
  })

  await registrarNotificacionWorkflowEmpleados(service, {
    actorUsuarioId: actor.usuarioId,
    puestosDestino: ['RECLUTAMIENTO'],
    empleadoId,
    workflow: 'empleados_alta_rechazada_nomina',
    title: 'Alta rechazada por Nomina',
    body: `${empleado.nombre_completo} regreso a Reclutamiento para correccion. Motivo: ${motivoRechazo}`,
    path: '/empleados?inbox=devueltas-por-nomina',
    tag: `empleado-alta-rechazada-${empleadoId}`,
    auditAction: 'notificar_reclutamiento_alta_rechazada',
  })

  revalidatePath('/empleados')
  revalidatePath('/nomina')
  revalidatePath('/dashboard')
  return buildState({ ok: true, message: 'Alta regresada a Reclutamiento con motivo de rechazo.' })
}

export async function actualizarDatosAdministrativosEmpleado(
  _prevState: EmpleadoActionState,
  formData: FormData
): Promise<EmpleadoActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR'])
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const empleadoId = String(formData.get('empleado_id') ?? '').trim()
  const idNomina = normalizeOptionalText(formData.get('id_nomina'))
  const supervisorEmpleadoId = normalizeOptionalText(formData.get('supervisor_empleado_id'))

  if (!empleadoId) {
    return buildState({ message: 'Selecciona un empleado valido.' })
  }

  const { data: empleado, error: empleadoError } = await service
    .from('empleado')
    .select('id, id_nomina, supervisor_empleado_id')
    .eq('id', empleadoId)
    .maybeSingle()

  if (empleadoError || !empleado) {
    return buildState({ message: empleadoError?.message ?? 'Empleado no encontrado.' })
  }

  if (idNomina && idNomina !== empleado.id_nomina) {
    const { data: nominaExistente } = await service
      .from('empleado')
      .select('id')
      .eq('id_nomina', idNomina)
      .neq('id', empleadoId)
      .maybeSingle()

    if (nominaExistente) {
      return buildState({ message: 'Ese ID de nomina ya existe en otro empleado.' })
    }
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

  const { error } = await service
    .from('empleado')
    .update({
      id_nomina: idNomina,
      supervisor_empleado_id: supervisorEmpleadoId,
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
      evento: 'empleado_datos_administrativos_actualizados',
      id_nomina: idNomina,
      supervisor_empleado_id: supervisorEmpleadoId,
    },
    usuarioId: actor.usuarioId,
  })

  revalidatePath('/empleados')
  revalidatePath('/admin/users')
  return buildState({ ok: true, message: 'Datos administrativos actualizados.' })
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
  const motivoBaja = normalizeUppercaseString(
    normalizeRequiredText(formData.get('motivo_baja'), 'Motivo de baja')
  )
  const checklistBaja = getChecklistFromForm(formData)
  const expedienteBajaFile = formData.get('expediente_baja_pdf')

  if (!empleadoId) {
    return buildState({ message: 'Selecciona un empleado valido.' })
  }

  if (!(expedienteBajaFile instanceof File) || expedienteBajaFile.size <= 0) {
    return buildState({
      message:
        'Adjunta el expediente de baja en PDF (renuncia, finiquito u otros soportes) antes de continuar.',
    })
  }

  if (expedienteBajaFile.type !== 'application/pdf') {
    return buildState({ message: 'El expediente de baja debe cargarse como PDF.' })
  }

    if (exceedsOperationalUploadLimit(expedienteBajaFile)) {
      return buildState({
        message: buildUploadLimitMessage('expediente de baja', expedienteBajaFile),
      })
    }

  const { data: empleado, error: empleadoError } = await service
    .from('empleado')
    .select('id, nombre_completo, nss, estatus_laboral, metadata')
    .eq('id', empleadoId)
    .maybeSingle()

  if (empleadoError || !empleado) {
    return buildState({ message: empleadoError?.message ?? 'Empleado no encontrado.' })
  }

  if (empleado.estatus_laboral === 'BAJA') {
    return buildState({ ok: true, message: 'El empleado ya estaba dado de baja.' })
  }

  const metadataActual =
    empleado.metadata && typeof empleado.metadata === 'object' && !Array.isArray(empleado.metadata)
      ? (empleado.metadata as Record<string, unknown>)
      : {}

  try {
    const documentoPreparado = await prepararDocumentoEmpleado(service, {
      actorUsuarioId: actor.usuarioId,
      empleadoId,
      categoria: 'BAJA',
      tipoDocumento: 'BAJA',
      file: expedienteBajaFile,
      expectedDocumentType: 'BAJA',
      employeeName: empleado.nombre_completo,
      employeeNss: empleado.nss,
      metadataExtra: {
        workflow_origin: 'RECLUTAMIENTO_BAJA_SOLICITUD',
        workflow_stage: 'PENDIENTE_BAJA_IMSS',
        baja_effective_date: fechaBaja,
        baja_reason: motivoBaja,
      },
    })

    await registrarDocumentoEmpleado(service, documentoPreparado, {
      actorUsuarioId: actor.usuarioId,
      empleadoId,
      categoria: 'BAJA',
      tipoDocumento: 'BAJA',
      file: expedienteBajaFile,
      metadataExtra: {
        workflow_origin: 'RECLUTAMIENTO_BAJA_SOLICITUD',
        workflow_stage: 'PENDIENTE_BAJA_IMSS',
        baja_effective_date: fechaBaja,
        baja_reason: motivoBaja,
      },
    })
  } catch (error) {
    return buildState({
      message:
        error instanceof Error
          ? error.message
          : 'No fue posible registrar el expediente documental de la baja.',
    })
  }

  const now = new Date().toISOString()
  const { error } = await service
    .from('empleado')
    .update({
      estatus_laboral: empleado.estatus_laboral === 'ACTIVO' ? 'SUSPENDIDO' : empleado.estatus_laboral,
      fecha_baja: fechaBaja,
      motivo_baja: motivoBaja,
      checklist_baja: checklistBaja,
      metadata: {
        ...metadataActual,
        workflow_stage: 'PENDIENTE_BAJA_IMSS',
        baja_pending: true,
        baja_requested_at: now,
        baja_requested_by_puesto: actor.puesto,
        baja_effective_date: fechaBaja,
      },
      updated_at: now,
    })
    .eq('id', empleadoId)

  if (error) {
    return buildState({ message: error.message })
  }

  await service
    .from('usuario')
    .update({
      estado_cuenta: 'SUSPENDIDA',
      updated_at: now,
    })
    .eq('empleado_id', empleadoId)

  await registrarEventoAudit(service, {
    tabla: 'empleado',
    registroId: empleadoId,
    payload: {
      evento: 'empleado_baja_solicitada_reclutamiento',
      nombre: empleado.nombre_completo,
      fecha_baja: fechaBaja,
      motivo_baja: motivoBaja,
      checklist_baja: checklistBaja,
      workflow_stage: 'PENDIENTE_BAJA_IMSS',
    },
    usuarioId: actor.usuarioId,
  })

  await registrarNotificacionWorkflowEmpleados(service, {
    actorUsuarioId: actor.usuarioId,
    puestosDestino: ['NOMINA'],
    empleadoId,
    workflow: 'empleados_baja_pendiente_nomina',
    title: 'Baja pendiente de cierre IMSS',
    body: `${empleado.nombre_completo} tiene expediente de baja cargado por Reclutamiento y requiere baja institucional en Nomina.`,
    path: '/nomina?inbox=bajas-pendientes',
    tag: `empleado-baja-pendiente-${empleadoId}`,
    auditAction: 'notificar_nomina_baja_pendiente',
  })

  await registrarNotificacionWorkflowEmpleados(service, {
    actorUsuarioId: actor.usuarioId,
    puestosDestino: ['LOGISTICA'],
    empleadoId,
    workflow: 'empleados_baja_pendiente_logistica',
    title: 'Recuperacion de activos por baja pendiente',
    body: `${empleado.nombre_completo} inicio baja operativa. Verifica recuperacion de activos mientras Nomina procesa la baja institucional.`,
    path: '/empleados?inbox=bajas-solicitadas',
    tag: `empleado-baja-logistica-${empleadoId}`,
    auditAction: 'notificar_logistica_baja_pendiente',
  })

  revalidatePath('/empleados')
  revalidatePath('/nomina')
  revalidatePath('/admin/users')
  revalidatePath('/dashboard')

  return buildState({
    ok: true,
    message:
      'Solicitud de baja registrada. El expediente documental ya quedo enviado a Nomina para cerrar la baja IMSS.',
  })
}

export async function cerrarBajaEmpleadoNomina(
  _prevState: EmpleadoActionState,
  formData: FormData
): Promise<EmpleadoActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'NOMINA'])
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const empleadoId = String(formData.get('empleado_id') ?? '').trim()
  const fechaBaja = normalizeRequiredText(formData.get('fecha_baja'), 'Fecha de baja')
  const observacionesNomina = normalizeOptionalText(formData.get('baja_observaciones_nomina'))
  const bajaImssFile = formData.get('baja_imss_pdf')

  if (!empleadoId) {
    return buildState({ message: 'Selecciona un empleado valido.' })
  }

  if (!(bajaImssFile instanceof File) || bajaImssFile.size <= 0) {
    return buildState({
      message: 'Nomina debe adjuntar el PDF oficial de baja IMSS antes de cerrar el expediente.',
    })
  }

  if (bajaImssFile.type !== 'application/pdf') {
    return buildState({ message: 'El comprobante institucional de baja IMSS debe cargarse como PDF.' })
  }

    if (exceedsOperationalUploadLimit(bajaImssFile)) {
      return buildState({
        message: buildUploadLimitMessage('comprobante de baja IMSS', bajaImssFile),
      })
    }

  const { data: empleado, error: empleadoError } = await service
    .from('empleado')
    .select('id, nombre_completo, nss, estatus_laboral, fecha_baja, motivo_baja, metadata')
    .eq('id', empleadoId)
    .maybeSingle()

  if (empleadoError || !empleado) {
    return buildState({ message: empleadoError?.message ?? 'Empleado no encontrado.' })
  }

  if (empleado.estatus_laboral === 'BAJA') {
    return buildState({ ok: true, message: 'La baja del empleado ya estaba cerrada.' })
  }

  const metadataActual =
    empleado.metadata && typeof empleado.metadata === 'object' && !Array.isArray(empleado.metadata)
      ? (empleado.metadata as Record<string, unknown>)
      : {}
  const workflowStage = String(metadataActual.workflow_stage ?? '').trim()

  if (workflowStage !== 'PENDIENTE_BAJA_IMSS') {
    return buildState({
      message:
        'Este expediente no esta en baja pendiente para Nomina. Reclutamiento debe registrar primero la solicitud de baja.',
    })
  }

  const { data: documentosBaja, error: documentosBajaError } = await service
    .from('empleado_documento')
    .select('id, metadata')
    .eq('empleado_id', empleadoId)
    .eq('categoria', 'BAJA')

  if (documentosBajaError) {
    return buildState({ message: documentosBajaError.message })
  }

  const existeExpedienteBajaRecruitment = (documentosBaja ?? []).some((documento) => {
    const metadata =
      documento.metadata && typeof documento.metadata === 'object' && !Array.isArray(documento.metadata)
        ? (documento.metadata as Record<string, unknown>)
        : {}
    return String(metadata.workflow_origin ?? '').trim() === 'RECLUTAMIENTO_BAJA_SOLICITUD'
  })

  if (!existeExpedienteBajaRecruitment) {
    return buildState({
      message:
        'Antes de cerrar la baja, debe existir el expediente de baja cargado por Reclutamiento.',
    })
  }

  try {
    const documentoPreparado = await prepararDocumentoEmpleado(service, {
      actorUsuarioId: actor.usuarioId,
      empleadoId,
      categoria: 'BAJA',
      tipoDocumento: 'BAJA',
      file: bajaImssFile,
      expectedDocumentType: 'BAJA',
      employeeName: empleado.nombre_completo,
      employeeNss: empleado.nss,
      metadataExtra: {
        workflow_origin: 'NOMINA_BAJA_IMSS',
        workflow_stage: 'BAJA_IMSS_CERRADA',
        baja_effective_date: fechaBaja,
      },
    })

    await registrarDocumentoEmpleado(service, documentoPreparado, {
      actorUsuarioId: actor.usuarioId,
      empleadoId,
      categoria: 'BAJA',
      tipoDocumento: 'BAJA',
      file: bajaImssFile,
      metadataExtra: {
        workflow_origin: 'NOMINA_BAJA_IMSS',
        workflow_stage: 'BAJA_IMSS_CERRADA',
        baja_effective_date: fechaBaja,
      },
    })
  } catch (error) {
    return buildState({
      message:
        error instanceof Error
          ? error.message
          : 'No fue posible registrar el comprobante institucional de baja IMSS.',
    })
  }

  const now = new Date().toISOString()
  const { error } = await service
    .from('empleado')
    .update({
      estatus_laboral: 'BAJA',
      fecha_baja: fechaBaja,
      imss_observaciones: observacionesNomina,
      metadata: {
        ...metadataActual,
        workflow_stage: 'BAJA_IMSS_CERRADA',
        baja_pending: false,
        baja_closed_at: now,
        baja_closed_by_puesto: actor.puesto,
      },
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
      evento: 'empleado_baja_cerrada_nomina',
      nombre: empleado.nombre_completo,
      fecha_baja: fechaBaja,
      motivo_baja: empleado.motivo_baja,
      observaciones_nomina: observacionesNomina,
      workflow_stage: 'BAJA_IMSS_CERRADA',
    },
    usuarioId: actor.usuarioId,
  })

  revalidatePath('/empleados')
  revalidatePath('/nomina')
  revalidatePath('/admin/users')
  revalidatePath('/dashboard')

  return buildState({
    ok: true,
    message: 'Baja institucional cerrada. El empleado ya quedo en estatus BAJA.',
  })
}

export async function rechazarBajaEmpleadoNomina(
  _prevState: EmpleadoActionState,
  formData: FormData
): Promise<EmpleadoActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'NOMINA'])
  const { service, error: adminError } = obtenerClienteAdmin()

  if (!service) {
    return buildState({ message: adminError })
  }

  const empleadoId = String(formData.get('empleado_id') ?? '').trim()
  const motivoRechazo = normalizeOptionalText(formData.get('motivo_rechazo_nomina'))

  if (!empleadoId) {
    return buildState({ message: 'Selecciona un empleado valido.' })
  }

  if (!motivoRechazo) {
    return buildState({ message: 'Nomina debe explicar el motivo del rechazo de la baja.' })
  }

  const { data: empleado, error: empleadoError } = await service
    .from('empleado')
    .select('id, nombre_completo, estatus_laboral, metadata')
    .eq('id', empleadoId)
    .maybeSingle()

  if (empleadoError || !empleado) {
    return buildState({ message: empleadoError?.message ?? 'Empleado no encontrado.' })
  }

  const metadataActual =
    empleado.metadata && typeof empleado.metadata === 'object' && !Array.isArray(empleado.metadata)
      ? (empleado.metadata as Record<string, unknown>)
      : {}

  if (String(metadataActual.workflow_stage ?? '').trim() !== 'PENDIENTE_BAJA_IMSS') {
    return buildState({
      message: 'Esta baja no esta pendiente de revision institucional de Nomina.',
    })
  }

  const now = new Date().toISOString()
  const { error } = await service
    .from('empleado')
    .update({
      imss_observaciones: motivoRechazo,
      metadata: {
        ...metadataActual,
        workflow_stage: 'RECLUTAMIENTO_CORRECCION_BAJA',
        baja_pending: true,
        baja_rejection_at: now,
        baja_rejection_reason: motivoRechazo,
      },
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
      evento: 'empleado_baja_rechazada_nomina',
      motivo_rechazo: motivoRechazo,
      workflow_stage: 'RECLUTAMIENTO_CORRECCION_BAJA',
    },
    usuarioId: actor.usuarioId,
  })

  await registrarNotificacionWorkflowEmpleados(service, {
    actorUsuarioId: actor.usuarioId,
    puestosDestino: ['RECLUTAMIENTO'],
    empleadoId,
    workflow: 'empleados_baja_rechazada_nomina',
    title: 'Baja rechazada por Nomina',
    body: `${empleado.nombre_completo} regreso a Reclutamiento para correccion de la baja. Motivo: ${motivoRechazo}`,
    path: '/empleados?inbox=bajas-devueltas',
    tag: `empleado-baja-rechazada-${empleadoId}`,
    auditAction: 'notificar_reclutamiento_baja_rechazada',
  })

  revalidatePath('/empleados')
  revalidatePath('/nomina')
  revalidatePath('/dashboard')
  return buildState({ ok: true, message: 'Baja regresada a Reclutamiento con motivo de rechazo.' })
}

export async function subirDocumentoEmpleado(
  _prevState: EmpleadoActionState,
  formData: FormData
): Promise<EmpleadoActionState> {
  const actor = await requerirPuestosActivos(['ADMINISTRADOR', 'RECLUTAMIENTO', 'NOMINA'])
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

  if (
    (actor.puesto === 'RECLUTAMIENTO' && categoria === 'IMSS') ||
    (actor.puesto === 'NOMINA' && categoria !== 'IMSS' && categoria !== 'BAJA')
  ) {
    return buildState({
      message:
        actor.puesto === 'RECLUTAMIENTO'
          ? 'Reclutamiento no puede cargar comprobantes IMSS.'
          : 'Nomina solo puede cargar documentos de categoria IMSS o BAJA en este flujo.',
    })
  }

  if ((categoria === 'IMSS' || categoria === 'BAJA') && file.type !== 'application/pdf') {
    return buildState({
      message:
        categoria === 'IMSS'
          ? 'El comprobante IMSS debe cargarse como PDF.'
          : 'Los documentos de baja deben cargarse como PDF.',
    })
  }

  if (exceedsOperationalUploadLimit(file)) {
    return buildState({
      message: buildUploadLimitMessage('archivo', file),
    })
  }

  const { data: empleado, error: empleadoError } = await service
    .from('empleado')
    .select('id, nombre_completo, nss, expediente_estado')
    .eq('id', empleadoId)
    .maybeSingle()

  if (empleadoError || !empleado) {
    return buildState({ message: empleadoError?.message ?? 'Empleado no encontrado.' })
  }

  try {
    const documentoPreparado = await prepararDocumentoEmpleado(service, {
      actorUsuarioId: actor.usuarioId,
      empleadoId,
      categoria,
      tipoDocumento,
      file,
      expectedDocumentType: tipoDocumento,
      employeeName: empleado.nombre_completo,
      employeeNss: empleado.nss,
    })

    const documentoRegistrado = await registrarDocumentoEmpleado(service, documentoPreparado, {
      actorUsuarioId: actor.usuarioId,
      empleadoId,
      categoria,
      tipoDocumento,
      file,
    })

    if (empleado.expediente_estado === 'PENDIENTE_DOCUMENTOS') {
      await service
        .from('empleado')
        .update({
          expediente_estado: 'EN_REVISION',
          updated_at: new Date().toISOString(),
        })
        .eq('id', empleadoId)
    }

    if (tipoDocumento === 'INE') {
      await syncBiometriaReferenceFromDocumento(service, {
        empleadoId,
        documentoId: documentoRegistrado.documentoId,
        archivoHash: documentoRegistrado.archivoHash,
        storedEvidence: documentoRegistrado.storedEvidence,
      })
    }

    if (documentoRegistrado.documentoExistente === false) {
      await registrarEventoAudit(service, {
        tabla: 'empleado_documento',
        registroId: documentoRegistrado.documentoId,
        payload: {
          evento: 'empleado_documento_cargado',
          empleado: empleado.nombre_completo,
          categoria,
          tipo_documento: tipoDocumento,
          sha256: documentoRegistrado.archivoHash.sha256,
          optimization_kind: documentoRegistrado.optimization.optimizationKind,
          optimization_original_bytes: documentoRegistrado.optimization.originalBytes,
          optimization_final_bytes: documentoRegistrado.optimization.optimizedBytes,
          ocr_status: (documentoRegistrado.ocr.result as { status?: string }).status ?? null,
          ocr_provider: documentoRegistrado.ocr.provider,
        },
        usuarioId: actor.usuarioId,
      })
    }

    revalidatePath('/empleados')

    return buildState({
      ok: true,
      duplicatedUpload: documentoRegistrado.storedEvidence.deduplicated || documentoRegistrado.documentoExistente,
      message: (documentoRegistrado.storedEvidence.deduplicated || documentoRegistrado.documentoExistente)
        ? 'Documento deduplicado y vinculado al expediente.'
        : 'Documento cargado y vinculado al expediente.',
    })
  } catch (error) {
    return buildState({
      message: error instanceof Error ? error.message : 'No fue posible subir el documento.',
    })
  }
}




