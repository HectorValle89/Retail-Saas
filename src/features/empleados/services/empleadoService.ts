import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveConfiguredOcrConfiguration } from '@/lib/ocr/gemini'
import { OCR_MODEL_CONFIG_KEY, OCR_PROVIDER_CONFIG_KEY } from '@/features/configuracion/configuracionCatalog'

type MaybeMany<T> = T | T[] | null

type EmpleadoStatus = 'ACTIVO' | 'SUSPENDIDO' | 'BAJA'
type ExpedienteEstado = 'PENDIENTE_DOCUMENTOS' | 'EN_REVISION' | 'VALIDADO' | 'OBSERVADO'
type ImssEstado = 'NO_INICIADO' | 'PENDIENTE_DOCUMENTOS' | 'EN_PROCESO' | 'ALTA_IMSS' | 'ERROR'
type UsuarioEstado = 'PROVISIONAL' | 'PENDIENTE_VERIFICACION_EMAIL' | 'ACTIVA' | 'SUSPENDIDA' | 'BAJA'
type OcrStatus =
  | 'ok'
  | 'needs_review'
  | 'unreadable'
  | 'error'
  | 'ocr_no_configurado'
  | 'unsupported_provider'
  | 'gemini_missing_api_key'

interface SupervisorRelacion {
  id: string
  nombre_completo: string
}

interface EmpleadoQueryRow {
  id: string
  id_nomina: string | null
  nombre_completo: string
  curp: string | null
  nss: string | null
  rfc: string | null
  puesto: string
  zona: string | null
  telefono: string | null
  correo_electronico: string | null
  estatus_laboral: EmpleadoStatus
  fecha_alta: string | null
  fecha_baja: string | null
  supervisor_empleado_id: string | null
  sueldo_base_mensual: number | null
  expediente_estado: ExpedienteEstado
  expediente_validado_en: string | null
  expediente_observaciones: string | null
  imss_estado: ImssEstado
  imss_fecha_solicitud: string | null
  imss_fecha_alta: string | null
  imss_observaciones: string | null
  motivo_baja: string | null
  checklist_baja: Record<string, boolean> | null
  created_at: string
  updated_at: string
  supervisor: MaybeMany<SupervisorRelacion>
}

interface UsuarioQueryRow {
  empleado_id: string
  username: string | null
  estado_cuenta: UsuarioEstado
}

interface ArchivoRelacion {
  id: string
  sha256: string
  bucket: string
  ruta_archivo: string
}

interface DocumentoQueryRow {
  id: string
  empleado_id: string
  categoria: 'EXPEDIENTE' | 'IMSS' | 'BAJA'
  tipo_documento:
    | 'CURP'
    | 'RFC'
    | 'NSS'
    | 'INE'
    | 'COMPROBANTE_DOMICILIO'
    | 'CONTRATO'
    | 'ALTA_IMSS'
    | 'BAJA'
    | 'OTRO'
  nombre_archivo_original: string
  mime_type: string | null
  tamano_bytes: number | null
  estado_documento: 'CARGADO' | 'VALIDADO' | 'OBSERVADO'
  ocr_provider: string | null
  ocr_resultado: Record<string, unknown>
  metadata: Record<string, unknown>
  created_at: string
  archivo: MaybeMany<ArchivoRelacion>
}

export interface EmpleadoResumen {
  total: number
  activos: number
  bajas: number
  expedienteValidado: number
  imssEnProceso: number
}

export interface SupervisorOption {
  id: string
  nombreCompleto: string
}

export interface DocumentoOcrResultado {
  status: OcrStatus | string | null
  provider: string | null
  model: string | null
  documentTypeExpected: string | null
  documentTypeDetected: string | null
  employeeName: string | null
  curp: string | null
  rfc: string | null
  nss: string | null
  address: string | null
  employer: string | null
  position: string | null
  documentNumber: string | null
  keyDates: string[]
  extractedText: string | null
  confidenceSummary: string | null
  mismatchHints: string[]
  observations: string[]
  errorMessage: string | null
  extractedAt: string | null
}

export interface DocumentoOptimizationSummary {
  kind: string | null
  optimized: boolean
  optimizedPdf: boolean
  optimizedImage: boolean
  originalBytes: number | null
  finalBytes: number | null
  targetMet: boolean | null
  notes: string[]
}

export interface DocumentoExpedienteItem {
  id: string
  categoria: 'EXPEDIENTE' | 'IMSS' | 'BAJA'
  tipoDocumento: DocumentoQueryRow['tipo_documento']
  nombreArchivo: string
  mimeType: string | null
  tamanoBytes: number | null
  estadoDocumento: DocumentoQueryRow['estado_documento']
  ocrProvider: string | null
  ocrResultado: DocumentoOcrResultado
  optimization: DocumentoOptimizationSummary | null
  createdAt: string
  sha256: string | null
  bucket: string | null
  rutaArchivo: string | null
  signedUrl: string | null
}

export interface EmpleadoListadoItem {
  id: string
  idNomina: string | null
  nombreCompleto: string
  curp: string | null
  nss: string | null
  rfc: string | null
  puesto: string
  zona: string | null
  telefono: string | null
  correoElectronico: string | null
  estatusLaboral: EmpleadoStatus
  fechaAlta: string | null
  fechaBaja: string | null
  supervisorEmpleadoId: string | null
  supervisor: string | null
  sueldoBaseMensual: number | null
  expedienteEstado: ExpedienteEstado
  expedienteValidadoEn: string | null
  expedienteObservaciones: string | null
  imssEstado: ImssEstado
  imssFechaSolicitud: string | null
  imssFechaAlta: string | null
  imssObservaciones: string | null
  motivoBaja: string | null
  checklistBaja: Record<string, boolean>
  username: string | null
  estadoCuenta: UsuarioEstado | null
  documentosCount: number
  documentos: DocumentoExpedienteItem[]
}

export interface EmpleadosPanelData {
  resumen: EmpleadoResumen
  empleados: EmpleadoListadoItem[]
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
  supervisors: SupervisorOption[]
  zonas: string[]
  ocrProvider: string | null
  ocrDisponible: boolean
  pdfOptimizationAvailable: boolean
}

const PDF_OPTIMIZATION_AVAILABLE = true
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 6

const obtenerPrimero = <T>(value: MaybeMany<T>): T | null => {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function mapChecklist(value: Record<string, boolean> | null | undefined) {
  return value && typeof value === 'object' ? value : {}
}

function mapString(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function mapNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function mapBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

function mapArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => mapString(item))
    .filter((item): item is string => Boolean(item))
}

function mapOcrResult(value: Record<string, unknown> | null | undefined): DocumentoOcrResultado {
  const payload = value && typeof value === 'object' ? value : {}

  return {
    status: mapString(payload.status),
    provider: mapString(payload.provider),
    model: mapString(payload.model),
    documentTypeExpected: mapString(payload.documentTypeExpected),
    documentTypeDetected: mapString(payload.documentTypeDetected),
    employeeName: mapString(payload.employeeName),
    curp: mapString(payload.curp),
    rfc: mapString(payload.rfc),
    nss: mapString(payload.nss),
    address: mapString(payload.address),
    employer: mapString(payload.employer),
    position: mapString(payload.position),
    documentNumber: mapString(payload.documentNumber),
    keyDates: mapArray(payload.keyDates),
    extractedText: mapString(payload.extractedText),
    confidenceSummary: mapString(payload.confidenceSummary),
    mismatchHints: mapArray(payload.mismatchHints),
    observations: mapArray(payload.observations),
    errorMessage: mapString(payload.errorMessage),
    extractedAt: mapString(payload.extractedAt),
  }
}

function mapOptimizationSummary(
  value: Record<string, unknown> | null | undefined
): DocumentoOptimizationSummary | null {
  const payload = value && typeof value === 'object' ? value : {}
  const kind = mapString(payload.optimization_kind)
  const originalBytes = mapNumber(payload.optimization_original_bytes)
  const finalBytes = mapNumber(payload.optimization_final_bytes)
  const targetMet = mapBoolean(payload.optimization_target_met)
  const notes = mapArray(payload.optimization_notes)
  const optimizedPdf = payload.optimized_pdf === true
  const optimizedImage = payload.optimized_image === true
  const optimized = optimizedPdf || optimizedImage

  if (
    !kind &&
    originalBytes === null &&
    finalBytes === null &&
    targetMet === null &&
    notes.length === 0 &&
    !optimized
  ) {
    return null
  }

  return {
    kind,
    optimized,
    optimizedPdf,
    optimizedImage,
    originalBytes,
    finalBytes,
    targetMet,
    notes,
  }
}

async function buildSignedUrl(
  supabase: SupabaseClient,
  bucket: string | null,
  path: string | null
) {
  if (!bucket || !path) {
    return null
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS)

  if (error) {
    return null
  }

  return data.signedUrl ?? null
}

export async function obtenerPanelEmpleados(
  supabase: SupabaseClient
): Promise<EmpleadosPanelData> {
  const [empleadosResult, usuariosResult, documentosResult, configuracionResult] = await Promise.all([
    supabase
      .from('empleado')
      .select(`
        id,
        id_nomina,
        nombre_completo,
        curp,
        nss,
        rfc,
        puesto,
        zona,
        telefono,
        correo_electronico,
        estatus_laboral,
        fecha_alta,
        fecha_baja,
        supervisor_empleado_id,
        sueldo_base_mensual,
        expediente_estado,
        expediente_validado_en,
        expediente_observaciones,
        imss_estado,
        imss_fecha_solicitud,
        imss_fecha_alta,
        imss_observaciones,
        motivo_baja,
        checklist_baja,
        created_at,
        updated_at,
        supervisor:supervisor_empleado_id(id, nombre_completo)
      `)
      .order('nombre_completo', { ascending: true }),
    supabase
      .from('usuario')
      .select('empleado_id, username, estado_cuenta')
      .order('created_at', { ascending: false }),
    supabase
      .from('empleado_documento')
      .select(`
        id,
        empleado_id,
        categoria,
        tipo_documento,
        nombre_archivo_original,
        mime_type,
        tamano_bytes,
        estado_documento,
        ocr_provider,
        ocr_resultado,
        metadata,
        created_at,
        archivo:archivo_hash_id(id, sha256, bucket, ruta_archivo)
      `)
      .order('created_at', { ascending: false }),
    supabase
      .from('configuracion')
      .select('clave, valor')
      .in('clave', [OCR_PROVIDER_CONFIG_KEY, OCR_MODEL_CONFIG_KEY]),
  ])

  const infraErrors = [empleadosResult.error, usuariosResult.error, documentosResult.error, configuracionResult.error]
    .filter(Boolean)
    .map((error) => error?.message)

  const configuracionRows = Array.isArray(configuracionResult.data)
    ? configuracionResult.data
    : []
  const providerRow = configuracionRows.find((item) => item.clave === OCR_PROVIDER_CONFIG_KEY)
  const modelRow = configuracionRows.find((item) => item.clave === OCR_MODEL_CONFIG_KEY)
  const ocrConfiguracion = resolveConfiguredOcrConfiguration({
    providerOverride: String(providerRow?.valor ?? '').trim() || null,
    modelOverride: String(modelRow?.valor ?? '').trim() || null,
  })

  if (empleadosResult.error) {
    return {
      resumen: {
        total: 0,
        activos: 0,
        bajas: 0,
        expedienteValidado: 0,
        imssEnProceso: 0,
      },
      empleados: [],
      infraestructuraLista: false,
      mensajeInfraestructura: infraErrors.join(' '),
      supervisors: [],
      zonas: [],
      ocrProvider: ocrConfiguracion.provider,
      ocrDisponible: ocrConfiguracion.available,
      pdfOptimizationAvailable: PDF_OPTIMIZATION_AVAILABLE,
    }
  }

  const usuariosMap = new Map<string, UsuarioQueryRow>()
  for (const usuario of (usuariosResult.data ?? []) as UsuarioQueryRow[]) {
    if (!usuariosMap.has(usuario.empleado_id)) {
      usuariosMap.set(usuario.empleado_id, usuario)
    }
  }

  const documentosByEmpleado = new Map<string, DocumentoExpedienteItem[]>()
  for (const documento of (documentosResult.data ?? []) as DocumentoQueryRow[]) {
    const archivo = obtenerPrimero(documento.archivo)
    const current = documentosByEmpleado.get(documento.empleado_id) ?? []

    current.push({
      id: documento.id,
      categoria: documento.categoria,
      tipoDocumento: documento.tipo_documento,
      nombreArchivo: documento.nombre_archivo_original,
      mimeType: documento.mime_type,
      tamanoBytes: documento.tamano_bytes,
      estadoDocumento: documento.estado_documento,
      ocrProvider: documento.ocr_provider,
      ocrResultado: mapOcrResult(documento.ocr_resultado),
      optimization: mapOptimizationSummary(documento.metadata),
      createdAt: documento.created_at,
      sha256: archivo?.sha256 ?? null,
      bucket: archivo?.bucket ?? null,
      rutaArchivo: archivo?.ruta_archivo ?? null,
      signedUrl: null,
    })

    documentosByEmpleado.set(documento.empleado_id, current)
  }

  for (const [empleadoId, documentos] of documentosByEmpleado.entries()) {
    const signedDocuments = await Promise.all(
      documentos.map(async (documento) => ({
        ...documento,
        signedUrl: await buildSignedUrl(supabase, documento.bucket, documento.rutaArchivo),
      }))
    )

    documentosByEmpleado.set(empleadoId, signedDocuments)
  }

  const empleados = ((empleadosResult.data ?? []) as EmpleadoQueryRow[]).map((empleado) => {
    const supervisor = obtenerPrimero(empleado.supervisor)
    const usuario = usuariosMap.get(empleado.id)
    const documentos = documentosByEmpleado.get(empleado.id) ?? []

    return {
      id: empleado.id,
      idNomina: empleado.id_nomina,
      nombreCompleto: empleado.nombre_completo,
      curp: empleado.curp,
      nss: empleado.nss,
      rfc: empleado.rfc,
      puesto: empleado.puesto,
      zona: empleado.zona,
      telefono: empleado.telefono,
      correoElectronico: empleado.correo_electronico,
      estatusLaboral: empleado.estatus_laboral,
      fechaAlta: empleado.fecha_alta,
      fechaBaja: empleado.fecha_baja,
      supervisorEmpleadoId: empleado.supervisor_empleado_id,
      supervisor: supervisor?.nombre_completo ?? null,
      sueldoBaseMensual: empleado.sueldo_base_mensual,
      expedienteEstado: empleado.expediente_estado,
      expedienteValidadoEn: empleado.expediente_validado_en,
      expedienteObservaciones: empleado.expediente_observaciones,
      imssEstado: empleado.imss_estado,
      imssFechaSolicitud: empleado.imss_fecha_solicitud,
      imssFechaAlta: empleado.imss_fecha_alta,
      imssObservaciones: empleado.imss_observaciones,
      motivoBaja: empleado.motivo_baja,
      checklistBaja: mapChecklist(empleado.checklist_baja),
      username: usuario?.username ?? null,
      estadoCuenta: usuario?.estado_cuenta ?? null,
      documentosCount: documentos.length,
      documentos,
    }
  })

  const supervisors = empleados
    .filter((empleado) => empleado.puesto === 'SUPERVISOR' && empleado.estatusLaboral === 'ACTIVO')
    .map((empleado) => ({
      id: empleado.id,
      nombreCompleto: empleado.nombreCompleto,
    }))

  const zonas = Array.from(
    new Set(empleados.map((empleado) => empleado.zona).filter((zona): zona is string => Boolean(zona)))
  ).sort((left, right) => left.localeCompare(right, 'es-MX'))

  return {
    resumen: {
      total: empleados.length,
      activos: empleados.filter((item) => item.estatusLaboral === 'ACTIVO').length,
      bajas: empleados.filter((item) => item.estatusLaboral === 'BAJA').length,
      expedienteValidado: empleados.filter((item) => item.expedienteEstado === 'VALIDADO').length,
      imssEnProceso: empleados.filter(
        (item) => item.imssEstado === 'EN_PROCESO' || item.imssEstado === 'PENDIENTE_DOCUMENTOS'
      ).length,
    },
    empleados,
    infraestructuraLista: infraErrors.length === 0,
    mensajeInfraestructura: infraErrors.length > 0 ? infraErrors.join(' ') : undefined,
    supervisors,
    zonas,
    ocrProvider: ocrConfiguracion.provider,
    ocrDisponible: ocrConfiguracion.available,
    pdfOptimizationAvailable: PDF_OPTIMIZATION_AVAILABLE,
  }
}







