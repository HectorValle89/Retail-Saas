import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import { resolveConfiguredOcrConfiguration } from '@/lib/ocr/gemini'
import { OCR_MODEL_CONFIG_KEY, OCR_PROVIDER_CONFIG_KEY } from '@/features/configuracion/configuracionCatalog'
import { buildRecruitingInbox, type EmployeeRecruitingInboxData } from '../lib/workflowInbox'
import { buildRecruitmentCoverageBoard, type PdvCoberturaBoardItem, type RecruitmentCoverageSummary } from './pdvCoberturaService'

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

interface PdvQueryRow {
  id: string
  nombre: string
  clave_btl: string | null
  zona: string | null
  activo: boolean | null
  cadena: MaybeMany<{
    nombre: string | null
  }>
  ciudad: MaybeMany<{
    nombre: string | null
  }>
}

interface AsignacionDisponibilidadRow {
  id: string
  pdv_id: string
  fecha_inicio: string
  fecha_fin: string | null
  estado_publicacion: 'BORRADOR' | 'PUBLICADA'
}

function isMissingPdvActivoColumn(message: string | null | undefined) {
  if (!message) {
    return false
  }

  const normalized = message.toLowerCase()
  return (
    normalized.includes('column pdv.activo does not exist') ||
    normalized.includes('column pdv_1.activo does not exist')
  )
}

async function fetchPdvsWithActivoCompatibility(supabase: SupabaseClient) {
  const emptyResult = { data: [], error: null }

  try {
    const withActivo = await supabase
      .from('pdv')
      .select(`
        id,
        nombre,
        clave_btl,
        zona,
        activo,
        cadena:cadena_id(nombre),
        ciudad:ciudad_id(nombre)
      `)
      .order('nombre', { ascending: true })

    if (!withActivo || !isMissingPdvActivoColumn(withActivo.error?.message)) {
      return withActivo ?? emptyResult
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : null
    if (!isMissingPdvActivoColumn(message)) {
      return emptyResult
    }
  }

  try {
    const withoutActivo = await supabase
      .from('pdv')
      .select(`
        id,
        nombre,
        clave_btl,
        zona,
        cadena:cadena_id(nombre),
        ciudad:ciudad_id(nombre)
      `)
      .order('nombre', { ascending: true })

    return withoutActivo ?? emptyResult
  } catch {
    return emptyResult
  }
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
  fecha_nacimiento: string | null
  fecha_baja: string | null
  domicilio_completo: string | null
  codigo_postal: string | null
  edad: number | null
  anios_laborando: number | null
  sexo: string | null
  estado_civil: string | null
  originario: string | null
  sbc_diario: number | null
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
  metadata: Record<string, unknown> | null
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

export interface CoordinadorOption {
  id: string
  nombreCompleto: string
}

export interface PdvOption {
  id: string
  nombre: string
  claveBtl: string | null
  zona: string | null
  cadena: string | null
  ciudad: string | null
}

export interface PdvDisponibleItem extends PdvOption {
  disponibilidadMotivo: 'SIN_ASIGNACION_ACTIVA'
}

export interface ReclutamientoResumen {
  candidatosEnPipeline: number
  pendientesCoordinacion: number
  pendientesDocumentacion: number
  pendientesNominaImss: number
  listosAdministracion: number
  proximasIsdinizaciones: number
}

export type OnboardingExternalAccessStatus =
  | 'PENDIENTE'
  | 'SOLICITADO_A_VIRIDIANA'
  | 'CONFIRMADO'

export type OnboardingContractStatus = 'PENDIENTE' | 'AGENDADO' | 'FIRMADO'

export interface OnboardingOperativoSummary {
  pdvObjetivoId: string | null
  pdvObjetivoLabel: string | null
  coordinadorEmpleadoId: string | null
  coordinadorNombre: string | null
  fechaIngresoOficial: string | null
  fechaIsdinizacion: string | null
  accesosExternosStatus: OnboardingExternalAccessStatus | null
  accesosExternosObservaciones: string | null
  expedienteCompletoRecibido: boolean
  contratoStatus: OnboardingContractStatus | null
  contratoFirmadoEn: string | null
  validacionFinalReclutamientoAt: string | null
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
  postalCode: string | null
  phoneNumber: string | null
  email: string | null
  birthDate: string | null
  employmentStartDate: string | null
  age: number | null
  yearsWorking: number | null
  sex: string | null
  maritalStatus: string | null
  originPlace: string | null
  dailyBaseSalary: number | null
  addressSourceDocumentType: string | null
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
  sourceDocument: string | null
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
  fechaNacimiento: string | null
  fechaBaja: string | null
  domicilioCompleto: string | null
  codigoPostal: string | null
  edad: number | null
  aniosLaborando: number | null
  sexo: string | null
  estadoCivil: string | null
  originario: string | null
  sbcDiario: number | null
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
  workflowStage: string | null
  workflowCancelReason: string | null
  workflowCancelAt: string | null
  workflowCancelFromStage: string | null
  adminAccessPending: boolean
  onboarding: OnboardingOperativoSummary
  username: string | null
  estadoCuenta: UsuarioEstado | null
  documentosCount: number
  documentos: DocumentoExpedienteItem[]
  createdAt: string
  updatedAt: string
}

export interface EmpleadosPanelData {
  resumen: EmpleadoResumen
  resumenReclutamiento: ReclutamientoResumen
  recruitmentCoverageSummary: RecruitmentCoverageSummary
  empleados: EmpleadoListadoItem[]
  recruitingInbox: EmployeeRecruitingInboxData<EmpleadoListadoItem>
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
  supervisors: SupervisorOption[]
  coordinators: CoordinadorOption[]
  pdvs: PdvOption[]
  pdvsDisponibles: PdvDisponibleItem[]
  pdvCoberturaBoard: PdvCoberturaBoardItem[]
  zonas: string[]
  ocrProvider: string | null
  ocrDisponible: boolean
  pdfOptimizationAvailable: boolean
}

export interface EmpleadosExportPayload {
  headers: string[]
  rows: Array<Array<string | number | null>>
  filenameBase: string
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

function mapRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
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

function mapOnboardingSummary(metadata: Record<string, unknown>): OnboardingOperativoSummary {
  const onboarding = mapRecord(metadata.onboarding_operativo)

  return {
    pdvObjetivoId: mapString(onboarding.pdv_objetivo_id),
    pdvObjetivoLabel: mapString(onboarding.pdv_objetivo_label),
    coordinadorEmpleadoId: mapString(onboarding.coordinador_empleado_id),
    coordinadorNombre: mapString(onboarding.coordinador_nombre),
    fechaIngresoOficial: mapString(onboarding.fecha_ingreso_oficial),
    fechaIsdinizacion: mapString(onboarding.fecha_isdinizacion),
    accesosExternosStatus: mapString(onboarding.accesos_externos_status) as OnboardingExternalAccessStatus | null,
    accesosExternosObservaciones: mapString(onboarding.accesos_externos_observaciones),
    expedienteCompletoRecibido: onboarding.expediente_completo_recibido === true,
    contratoStatus: mapString(onboarding.contrato_status) as OnboardingContractStatus | null,
    contratoFirmadoEn: mapString(onboarding.contrato_firmado_en),
    validacionFinalReclutamientoAt: mapString(onboarding.validacion_final_reclutamiento_at),
  }
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
    postalCode: mapString(payload.postalCode),
    phoneNumber: mapString(payload.phoneNumber),
    email: mapString(payload.email),
    birthDate: mapString(payload.birthDate),
    employmentStartDate: mapString(payload.employmentStartDate),
    age: mapNumber(payload.age),
    yearsWorking: mapNumber(payload.yearsWorking),
    sex: mapString(payload.sex),
    maritalStatus: mapString(payload.maritalStatus),
    originPlace: mapString(payload.originPlace),
    dailyBaseSalary: mapNumber(payload.dailyBaseSalary),
    addressSourceDocumentType: mapString(payload.addressSourceDocumentType),
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

interface ObtenerPanelEmpleadosOptions {
  actor?: ActorActual | null
  emitCoverageSideEffects?: boolean
}

export async function obtenerPanelEmpleados(
  supabase: SupabaseClient,
  options: ObtenerPanelEmpleadosOptions = {}
): Promise<EmpleadosPanelData> {
  const today = new Date().toISOString().slice(0, 10)

  const [empleadosResult, usuariosResult, documentosResult, configuracionResult, pdvsResult, asignacionesResult] = await Promise.all([
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
        fecha_nacimiento,
        fecha_baja,
        domicilio_completo,
        codigo_postal,
        edad,
        anios_laborando,
        sexo,
        estado_civil,
        originario,
        sbc_diario,
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
        metadata,
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
    fetchPdvsWithActivoCompatibility(supabase),
    supabase
      .from('asignacion')
      .select('id, pdv_id, fecha_inicio, fecha_fin, estado_publicacion')
      .eq('estado_publicacion', 'PUBLICADA')
      .lte('fecha_inicio', today)
      .or(`fecha_fin.is.null,fecha_fin.gte.${today}`),

  ])

  const infraErrors = [
    empleadosResult.error,
    usuariosResult.error,
    documentosResult.error,
    configuracionResult.error,
    pdvsResult?.error,
    asignacionesResult?.error,
  ]
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
      resumenReclutamiento: {
        candidatosEnPipeline: 0,
        pendientesCoordinacion: 0,
        pendientesDocumentacion: 0,
        pendientesNominaImss: 0,
        listosAdministracion: 0,
        proximasIsdinizaciones: 0,
      },
      empleados: [],
      recruitingInbox: [],
      recruitmentCoverageSummary: {
        target: 250,
        plantillaActiva: 0,
        plantillaEsperaTransito: 0,
        totalContratadas: 0,
        brechaContratacion: 250,
        progressPct: 0,
        pdvsCubiertos: 0,
        pdvsReservados: 0,
        pdvsVacantes: 0,
        pdvsBloqueados: 0,
        vacantesUrgentes: 0,
        pendientesAcceso: 0,
        pendientesAccesoVencidos: 0,
        vacantesEnProcesoFirma: 0,
        listosAdministracion: 0,
        proximasIsdinizaciones: 0,
      },
      infraestructuraLista: false,
      mensajeInfraestructura: infraErrors.join(' '),
      supervisors: [],
      coordinators: [],
      pdvs: [],
      pdvsDisponibles: [],
      pdvCoberturaBoard: [],
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
      sourceDocument: mapString(documento.metadata?.source_document),
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
    const metadata = mapRecord(empleado.metadata)

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
      fechaNacimiento: empleado.fecha_nacimiento,
      fechaBaja: empleado.fecha_baja,
      domicilioCompleto: empleado.domicilio_completo,
      codigoPostal: empleado.codigo_postal,
      edad: empleado.edad,
      aniosLaborando: empleado.anios_laborando,
      sexo: empleado.sexo,
      estadoCivil: empleado.estado_civil,
      originario: empleado.originario,
      sbcDiario: empleado.sbc_diario,
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
      workflowStage: mapString(metadata.workflow_stage),
      workflowCancelReason: mapString(metadata.alta_cancelada_motivo),
      workflowCancelAt: mapString(metadata.alta_cancelada_at),
      workflowCancelFromStage: mapString(metadata.alta_cancelada_desde_stage),
      adminAccessPending: metadata.admin_access_pending === true,
      onboarding: mapOnboardingSummary(metadata),
      username: usuario?.username ?? null,
      estadoCuenta: usuario?.estado_cuenta ?? null,
      documentosCount: documentos.length,
      documentos,
      createdAt: empleado.created_at,
      updatedAt: empleado.updated_at,
    }
  })

  const supervisors = empleados
    .filter((empleado) => empleado.puesto === 'SUPERVISOR' && empleado.estatusLaboral === 'ACTIVO')
    .map((empleado) => ({
      id: empleado.id,
      nombreCompleto: empleado.nombreCompleto,
    }))

  const coordinators = empleados
    .filter((empleado) => empleado.puesto === 'COORDINADOR' && empleado.estatusLaboral === 'ACTIVO')
    .map((empleado) => ({
      id: empleado.id,
      nombreCompleto: empleado.nombreCompleto,
    }))

  const pdvs = (((pdvsResult?.data ?? []) as PdvQueryRow[]) ?? [])
    .filter((pdv) => pdv.activo !== false)
    .map((pdv) => {
      const cadena = obtenerPrimero(pdv.cadena)
      const ciudad = obtenerPrimero(pdv.ciudad)

      return {
        id: pdv.id,
        nombre: pdv.nombre,
        claveBtl: pdv.clave_btl,
        zona: pdv.zona,
        cadena: cadena?.nombre ?? null,
        ciudad: ciudad?.nombre ?? null,
      }
    })

  let recruitmentCoverageSummary: RecruitmentCoverageSummary = {
    target: 250,
    plantillaActiva: 0,
    plantillaEsperaTransito: 0,
    totalContratadas: 0,
    brechaContratacion: 250,
    progressPct: 0,
    pdvsCubiertos: 0,
    pdvsReservados: 0,
    pdvsVacantes: 0,
    pdvsBloqueados: 0,
    vacantesUrgentes: 0,
    pendientesAcceso: 0,
    pendientesAccesoVencidos: 0,
    vacantesEnProcesoFirma: 0,
    listosAdministracion: 0,
    proximasIsdinizaciones: 0,
  }
  let pdvCoberturaBoard: PdvCoberturaBoardItem[] = []
  let coverageInfraError: string | null = null

  try {
    const coverage = await buildRecruitmentCoverageBoard(supabase as SupabaseClient<any>, {
      actor: options.actor ?? null,
      emitSideEffects: options.emitCoverageSideEffects ?? false,
    })
    recruitmentCoverageSummary = coverage.summary
    pdvCoberturaBoard = coverage.items
  } catch {
    const fallbackAssignedPdvIds = new Set(
      (((asignacionesResult.data ?? []) as AsignacionDisponibilidadRow[]) ?? []).map((asignacion) => asignacion.pdv_id)
    )
    const fallbackCandidateStages = new Set([
      'PENDIENTE_COORDINACION',
      'SELECCION_APROBADA',
      'PENDIENTE_IMSS_NOMINA',
      'EN_FLUJO_IMSS',
      'PENDIENTE_VALIDACION_FINAL',
      'PENDIENTE_ACCESO_ADMIN',
      'RECLUTAMIENTO_CORRECCION_ALTA',
    ])
    const fallbackCandidatesByPdv = new Map(
      empleados
        .filter((empleado) => fallbackCandidateStages.has(empleado.workflowStage ?? '') && empleado.onboarding.pdvObjetivoId)
        .map((empleado) => [empleado.onboarding.pdvObjetivoId as string, empleado] as const)
    )
    const fallbackTarget = recruitmentCoverageSummary.target

    pdvCoberturaBoard = pdvs.map((pdv) => {
      const hasAssignment = fallbackAssignedPdvIds.has(pdv.id)
      const candidate = fallbackCandidatesByPdv.get(pdv.id) ?? null
      const inProcess = !hasAssignment && Boolean(candidate)

      return {
        coberturaOperativaId: null,
        cuentaClienteId: options.actor?.cuentaClienteId ?? 'isdin_mexico',
        pdvId: pdv.id,
        nombre: pdv.nombre,
        claveBtl: pdv.claveBtl,
        cadena: pdv.cadena,
        ciudad: pdv.ciudad,
        zona: pdv.zona,
        estadoMaestro: 'ACTIVO',
        estadoMaestroLabel: 'Activo',
        semaforo: hasAssignment ? 'VERDE' : 'NARANJA',
        semaforoLabel: hasAssignment ? 'Activo y cubierto' : 'Vacante',
        estadoOperativo: hasAssignment ? 'CUBIERTO' : 'VACANTE',
        estadoOperativoLabel: hasAssignment ? 'Cubierto' : 'Vacante',
        motivoOperativo: hasAssignment ? null : inProcess ? 'EN_PROCESO_FIRMA' : 'SIN_DC',
        motivoOperativoLabel: hasAssignment ? null : inProcess ? 'En proceso de firma' : 'Sin DC',
        actionNeed: hasAssignment ? 'COBERTURA_OK' : inProcess ? 'VACANTE_EN_PROCESO_FIRMA' : 'VACANTE_URGENTE',
        actionNeedLabel: hasAssignment ? 'Cobertura OK' : inProcess ? 'Vacante en proceso de firma' : 'Vacante urgente',
        employeeId: null,
        employeeName: null,
        employeeSupervisorId: null,
        employeeSupervisorName: null,
        candidateId: candidate?.id ?? null,
        candidateName: candidate?.nombreCompleto ?? null,
        candidateWorkflowStage: candidate?.workflowStage ?? null,
        pdvPasoId: null,
        pdvPasoNombre: null,
        accesoPendienteDesde: null,
        proximoRecordatorioAt: null,
        diasEsperandoAcceso: null,
        overdue: false,
        responsableSugerido: hasAssignment ? 'Operacion estable' : inProcess ? 'Reclutamiento / Coordinacion' : 'Reclutamiento',
        observaciones: null,
        reserved: false,
      }
    })

    const activeDermos = empleados.filter(
      (empleado) => empleado.puesto === 'DERMOCONSEJERO' && empleado.estatusLaboral === 'ACTIVO'
    )
    const progressBase = fallbackTarget > 0 ? Math.min(100, Math.round((activeDermos.length / fallbackTarget) * 100)) : 100

    recruitmentCoverageSummary = {
      ...recruitmentCoverageSummary,
      plantillaActiva: activeDermos.length,
      plantillaEsperaTransito: 0,
      totalContratadas: activeDermos.length,
      brechaContratacion: Math.max(fallbackTarget - activeDermos.length, 0),
      progressPct: progressBase,
      pdvsCubiertos: pdvCoberturaBoard.filter((item) => item.semaforo === 'VERDE').length,
      pdvsReservados: 0,
      pdvsVacantes: pdvCoberturaBoard.filter((item) => item.semaforo === 'NARANJA').length,
      pdvsBloqueados: 0,
      vacantesUrgentes: pdvCoberturaBoard.filter((item) => item.actionNeed === 'VACANTE_URGENTE').length,
      pendientesAcceso: 0,
      pendientesAccesoVencidos: 0,
      vacantesEnProcesoFirma: pdvCoberturaBoard.filter((item) => item.actionNeed === 'VACANTE_EN_PROCESO_FIRMA').length,
      listosAdministracion: empleados.filter(
        (empleado) => empleado.adminAccessPending || empleado.workflowStage === 'PENDIENTE_ACCESO_ADMIN'
      ).length,
      proximasIsdinizaciones: empleados.filter((empleado) => Boolean(empleado.onboarding.fechaIsdinizacion)).length,
    }
    coverageInfraError = null
  }

  const pdvsDisponibles = pdvCoberturaBoard
    .filter((item) => item.semaforo === 'NARANJA')
    .map((pdv) => ({
      id: pdv.pdvId,
      nombre: pdv.nombre,
      claveBtl: pdv.claveBtl,
      zona: pdv.zona,
      cadena: pdv.cadena,
      ciudad: pdv.ciudad,
      disponibilidadMotivo: 'SIN_ASIGNACION_ACTIVA' as const,
    }))

  const candidatosPipeline = empleados.filter((empleado) =>
    [
      'PENDIENTE_COORDINACION',
      'SELECCION_APROBADA',
      'PENDIENTE_IMSS_NOMINA',
      'EN_FLUJO_IMSS',
      'PENDIENTE_VALIDACION_FINAL',
      'PENDIENTE_ACCESO_ADMIN',
      'RECLUTAMIENTO_CORRECCION_ALTA',
    ].includes(empleado.workflowStage ?? '')
  )

  const upcomingThreshold = new Date()
  const upcomingLimit = new Date(upcomingThreshold)
  upcomingLimit.setDate(upcomingThreshold.getDate() + 7)

  const resumenReclutamiento: ReclutamientoResumen = {
    candidatosEnPipeline: candidatosPipeline.length,
    pendientesCoordinacion: empleados.filter((empleado) => empleado.workflowStage === 'PENDIENTE_COORDINACION').length,
    pendientesDocumentacion: empleados.filter(
      (empleado) =>
        ['SELECCION_APROBADA', 'PENDIENTE_VALIDACION_FINAL'].includes(empleado.workflowStage ?? '') ||
        empleado.workflowStage === 'RECLUTAMIENTO_CORRECCION_ALTA'
    ).length,
    pendientesNominaImss: empleados.filter(
      (empleado) =>
        empleado.workflowStage === 'PENDIENTE_IMSS_NOMINA' ||
        empleado.workflowStage === 'EN_FLUJO_IMSS' ||
        empleado.imssEstado === 'EN_PROCESO' ||
        empleado.imssEstado === 'PENDIENTE_DOCUMENTOS'
    ).length,
    listosAdministracion: empleados.filter(
      (empleado) => empleado.adminAccessPending || empleado.workflowStage === 'PENDIENTE_ACCESO_ADMIN'
    ).length,
    proximasIsdinizaciones: empleados.filter((empleado) => {
      if (!empleado.onboarding.fechaIsdinizacion) {
        return false
      }

      const fecha = new Date(empleado.onboarding.fechaIsdinizacion)
      return fecha >= upcomingThreshold && fecha <= upcomingLimit
    }).length,
  }

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
    resumenReclutamiento,
    recruitmentCoverageSummary,
    empleados,
    recruitingInbox: buildRecruitingInbox<EmpleadoListadoItem>(empleados),
    infraestructuraLista: infraErrors.length === 0 && !coverageInfraError,
    mensajeInfraestructura:
      infraErrors.length > 0 || coverageInfraError
        ? [...infraErrors, coverageInfraError].filter(Boolean).join(' ')
        : undefined,
    supervisors,
    coordinators,
    pdvs,
    pdvsDisponibles,
    pdvCoberturaBoard,
    zonas,
    ocrProvider: ocrConfiguracion.provider,
    ocrDisponible: ocrConfiguracion.available,
    pdfOptimizationAvailable: PDF_OPTIMIZATION_AVAILABLE,
  }
}

export async function collectEmpleadosExportPayload(
  supabase: SupabaseClient
): Promise<EmpleadosExportPayload> {
  const [empleadosResult, usuariosResult] = await Promise.all([
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
        fecha_nacimiento,
        fecha_baja,
        domicilio_completo,
        codigo_postal,
        edad,
        anios_laborando,
        sexo,
        estado_civil,
        originario,
        sbc_diario,
        supervisor_empleado_id,
        expediente_estado,
        expediente_validado_en,
        imss_estado,
        imss_fecha_solicitud,
        imss_fecha_alta,
        motivo_baja,
        metadata,
        supervisor:supervisor_empleado_id(id, nombre_completo)
      `)
      .order('nombre_completo', { ascending: true }),
    supabase
      .from('usuario')
      .select('empleado_id, username, estado_cuenta')
      .order('created_at', { ascending: false }),
  ])

  if (empleadosResult.error) {
    throw new Error(empleadosResult.error.message)
  }

  if (usuariosResult.error) {
    throw new Error(usuariosResult.error.message)
  }

  const usuariosMap = new Map<string, UsuarioQueryRow>()
  for (const usuario of (usuariosResult.data ?? []) as UsuarioQueryRow[]) {
    if (!usuariosMap.has(usuario.empleado_id)) {
      usuariosMap.set(usuario.empleado_id, usuario)
    }
  }

  const headers = [
    'ID',
    'ID nomina',
    'Nombre completo',
    'Puesto',
    'Zona',
    'Supervisor',
    'Estatus laboral',
    'Estado expediente',
    'Estado IMSS',
    'Correo',
    'Telefono',
    'Username',
    'Estado cuenta',
    'CURP',
    'RFC',
    'NSS',
    'Fecha ingreso',
    'Fecha nacimiento',
    'Fecha baja',
    'Domicilio completo',
    'Codigo postal',
    'Edad',
    'Anios laborando',
    'Sexo',
    'Estado civil',
    'Originario',
    'SBC diario',
    'Expediente validado en',
    'IMSS fecha solicitud',
    'IMSS fecha alta',
    'Motivo baja',
    'Pendiente acceso admin',
    'Workflow stage',
  ]

  const rows = ((empleadosResult.data ?? []) as EmpleadoQueryRow[]).map((empleado) => {
    const supervisor = obtenerPrimero(empleado.supervisor)
    const usuario = usuariosMap.get(empleado.id)
    const metadata = mapRecord(empleado.metadata)

    return [
      empleado.id,
      empleado.id_nomina,
      empleado.nombre_completo,
      empleado.puesto,
      empleado.zona,
      supervisor?.nombre_completo ?? null,
      empleado.estatus_laboral,
      empleado.expediente_estado,
      empleado.imss_estado,
      empleado.correo_electronico,
      empleado.telefono,
      usuario?.username ?? null,
      usuario?.estado_cuenta ?? null,
      empleado.curp,
      empleado.rfc,
      empleado.nss,
      empleado.fecha_alta,
      empleado.fecha_nacimiento,
      empleado.fecha_baja,
      empleado.domicilio_completo,
      empleado.codigo_postal,
      empleado.edad,
      empleado.anios_laborando,
      empleado.sexo,
      empleado.estado_civil,
      empleado.originario,
      empleado.sbc_diario,
      empleado.expediente_validado_en,
      empleado.imss_fecha_solicitud,
      empleado.imss_fecha_alta,
      empleado.motivo_baja,
      metadata.admin_access_pending === true ? 'SI' : 'NO',
      mapString(metadata.workflow_stage),
    ]
  })

  const dateStamp = new Date().toISOString().slice(0, 10)

  return {
    headers,
    rows,
    filenameBase: `empleados-${dateStamp}`,
  }
}







