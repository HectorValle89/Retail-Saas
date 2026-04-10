import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorActual } from '@/lib/auth/session'
import type {
  DocumentoExpedienteItem,
  EmpleadoListadoItem,
  DocumentoOcrResultado,
  DocumentoOptimizationSummary,
  OnboardingOperativoSummary,
} from '@/features/empleados/services/empleadoService'
import {
  buildPayrollInbox,
  type EmployeePayrollInboxData,
} from '@/features/empleados/lib/workflowInbox'
import { getIncapacidadNextActor } from '@/features/solicitudes/lib/incapacidadWorkflow'
import type { Puesto } from '@/types/database'

type MaybeMany<T> = T | T[] | null

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 6

interface ArchivoRelacion {
  id: string
  sha256: string
  bucket: string
  ruta_archivo: string
}

interface WorkspaceEmpleadoRow {
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
  estatus_laboral: string
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
  expediente_estado: string
  expediente_validado_en: string | null
  expediente_observaciones: string | null
  imss_estado: string
  imss_fecha_solicitud: string | null
  imss_fecha_alta: string | null
  imss_observaciones: string | null
  motivo_baja: string | null
  checklist_baja: Record<string, boolean> | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  supervisor: MaybeMany<{ nombre_completo: string | null }>
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
  ocr_resultado: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
  archivo: MaybeMany<ArchivoRelacion>
}

interface IncapacidadSolicitudRow {
  id: string
  cuenta_cliente_id: string
  empleado_id: string
  supervisor_empleado_id: string | null
  fecha_inicio: string
  fecha_fin: string
  tipo: string
  estatus: string
  motivo: string | null
  comentarios: string | null
  justificante_url: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  empleado: MaybeMany<{ nombre_completo: string | null }>
}

function getFirst<T>(value: MaybeMany<T>): T | null {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function normalizeMetadata(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function mapString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function mapChecklist(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, current]) => [key, current === true])
  ) as Record<string, boolean>
}

function mapOnboardingSummary(metadata: Record<string, unknown>): OnboardingOperativoSummary {
  const onboarding = normalizeMetadata(metadata.onboarding_operativo)
  return {
    coordinadorEmpleadoId: mapString(onboarding.coordinador_empleado_id),
    coordinadorNombre: mapString(onboarding.coordinador_nombre),
    pdvObjetivoId: mapString(onboarding.pdv_objetivo_id),
    pdvObjetivoLabel: mapString(onboarding.pdv_objetivo_label),
    fechaIngresoOficial: mapString(onboarding.fecha_ingreso_oficial),
    fechaIsdinizacion: mapString(onboarding.fecha_isdinizacion),
    accesosExternosStatus: mapString(onboarding.accesos_externos_status) as OnboardingOperativoSummary['accesosExternosStatus'],
    accesosExternosObservaciones: mapString(onboarding.accesos_externos_observaciones),
    expedienteCompletoRecibido: onboarding.expediente_completo_recibido === true,
    contratoStatus: mapString(onboarding.contrato_status) as OnboardingOperativoSummary['contratoStatus'],
    contratoFirmadoEn: mapString(onboarding.contrato_firmado_en),
    validacionFinalReclutamientoAt: mapString(onboarding.validacion_final_reclutamiento_at),
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

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS)
  if (error) {
    return null
  }

  return data.signedUrl ?? null
}

function mapDocumentOptimization(
  metadata: Record<string, unknown> | null | undefined
): DocumentoOptimizationSummary | null {
  const optimization = normalizeMetadata(metadata?.optimization)
  if (Object.keys(optimization).length === 0) {
    return null
  }

  return {
    kind: mapString(optimization.kind),
    optimized: optimization.optimized === true,
    optimizedPdf: optimization.optimized_pdf === true,
    optimizedImage: optimization.optimized_image === true,
    originalBytes:
      typeof optimization.original_bytes === 'number' ? optimization.original_bytes : null,
    finalBytes: typeof optimization.final_bytes === 'number' ? optimization.final_bytes : null,
    targetMet: optimization.target_met === true ? true : optimization.target_met === false ? false : null,
    notes: Array.isArray(optimization.notes)
      ? optimization.notes.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

function mapDocumentOcrResult(value: Record<string, unknown> | null | undefined): DocumentoOcrResultado {
  const metadata = normalizeMetadata(value)
  return {
    status: mapString(metadata.status),
    provider: mapString(metadata.provider),
    model: mapString(metadata.model),
    documentTypeExpected: mapString(metadata.document_type_expected),
    documentTypeDetected: mapString(metadata.document_type_detected),
    employeeName: mapString(metadata.nombre),
    curp: mapString(metadata.curp),
    rfc: mapString(metadata.rfc),
    nss: mapString(metadata.nss),
    address: mapString(metadata.address),
    postalCode: mapString(metadata.postal_code),
    phoneNumber: mapString(metadata.phone_number),
    email: mapString(metadata.email),
    birthDate: mapString(metadata.birth_date),
    employmentStartDate: mapString(metadata.employment_start_date),
    age: typeof metadata.age === 'number' ? metadata.age : null,
    yearsWorking: typeof metadata.years_working === 'number' ? metadata.years_working : null,
    sex: mapString(metadata.sex),
    maritalStatus: mapString(metadata.marital_status),
    originPlace: mapString(metadata.origin_place),
    dailyBaseSalary: typeof metadata.daily_base_salary === 'number' ? metadata.daily_base_salary : null,
    addressSourceDocumentType: mapString(metadata.address_source_document_type),
    employer: mapString(metadata.employer),
    position: mapString(metadata.position),
    documentNumber: mapString(metadata.document_number),
    keyDates: Array.isArray(metadata.key_dates) ? metadata.key_dates.filter((item): item is string => typeof item === 'string') : [],
    extractedText: mapString(metadata.extracted_text),
    confidenceSummary: mapString(metadata.confidence_summary),
    mismatchHints: Array.isArray(metadata.mismatch_hints) ? metadata.mismatch_hints.filter((item): item is string => typeof item === 'string') : [],
    observations: Array.isArray(metadata.observations) ? metadata.observations.filter((item): item is string => typeof item === 'string') : [],
    errorMessage: mapString(metadata.error_message),
    extractedAt: mapString(metadata.extracted_at),
  }
}

async function fetchEmployeeDocuments(
  supabase: SupabaseClient,
  employeeIds: string[]
): Promise<Map<string, DocumentoExpedienteItem[]>> {
  const documentsByEmployee = new Map<string, DocumentoExpedienteItem[]>()

  if (employeeIds.length === 0) {
    return documentsByEmployee
  }

  const { data, error } = await supabase
    .from('documento_expediente')
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
    .in('empleado_id', employeeIds)
    .order('created_at', { ascending: false })

  if (error) {
    return documentsByEmployee
  }

  for (const documento of (data ?? []) as DocumentoQueryRow[]) {
    const archivo = getFirst(documento.archivo)
    const current = documentsByEmployee.get(documento.empleado_id) ?? []
    current.push({
      id: documento.id,
      categoria: documento.categoria,
      tipoDocumento: documento.tipo_documento,
      nombreArchivo: documento.nombre_archivo_original,
      mimeType: documento.mime_type,
      tamanoBytes: documento.tamano_bytes,
      estadoDocumento: documento.estado_documento,
      ocrProvider: documento.ocr_provider,
      ocrResultado: mapDocumentOcrResult(documento.ocr_resultado),
      optimization: mapDocumentOptimization(documento.metadata),
      createdAt: documento.created_at,
      sha256: archivo?.sha256 ?? null,
      bucket: archivo?.bucket ?? null,
      rutaArchivo: archivo?.ruta_archivo ?? null,
      signedUrl: null,
      sourceDocument:
        typeof documento.metadata?.source_document === 'string'
          ? documento.metadata.source_document
          : null,
    })
    documentsByEmployee.set(documento.empleado_id, current)
  }

  for (const [employeeId, documents] of documentsByEmployee.entries()) {
    const resolved = await Promise.all(
      documents.map(async (document) => ({
        ...document,
        signedUrl: await buildSignedUrl(supabase, document.bucket, document.rutaArchivo),
      }))
    )
    documentsByEmployee.set(employeeId, resolved)
  }

  return documentsByEmployee
}

function mapEmpleadoListadoItem(
  row: WorkspaceEmpleadoRow,
  documentos: DocumentoExpedienteItem[]
): EmpleadoListadoItem {
  const metadata = normalizeMetadata(row.metadata)
  const supervisor = getFirst(row.supervisor)

  return {
    id: row.id,
    idNomina: row.id_nomina,
    nombreCompleto: row.nombre_completo,
    curp: row.curp,
    nss: row.nss,
    rfc: row.rfc,
    puesto: row.puesto,
    zona: row.zona,
    telefono: row.telefono,
    correoElectronico: row.correo_electronico,
    estatusLaboral: row.estatus_laboral as EmpleadoListadoItem['estatusLaboral'],
    fechaAlta: row.fecha_alta,
    fechaNacimiento: row.fecha_nacimiento,
    fechaBaja: row.fecha_baja,
    domicilioCompleto: row.domicilio_completo,
    codigoPostal: row.codigo_postal,
    edad: row.edad,
    aniosLaborando: row.anios_laborando,
    sexo: row.sexo,
    estadoCivil: row.estado_civil,
    originario: row.originario,
    sbcDiario: row.sbc_diario,
    supervisorEmpleadoId: row.supervisor_empleado_id,
    supervisor: supervisor?.nombre_completo ?? null,
    sueldoBaseMensual: row.sueldo_base_mensual,
    expedienteEstado: row.expediente_estado as EmpleadoListadoItem['expedienteEstado'],
    expedienteValidadoEn: row.expediente_validado_en,
    expedienteObservaciones: row.expediente_observaciones,
    imssEstado: row.imss_estado as EmpleadoListadoItem['imssEstado'],
    imssFechaSolicitud: row.imss_fecha_solicitud,
    imssFechaAlta: row.imss_fecha_alta,
    imssObservaciones: row.imss_observaciones,
    motivoBaja: row.motivo_baja,
    checklistBaja: mapChecklist(row.checklist_baja),
    workflowStage: mapString(metadata.workflow_stage),
    workflowCancelReason: mapString(metadata.alta_cancelada_motivo),
    workflowCancelAt: mapString(metadata.alta_cancelada_at),
    workflowCancelFromStage: mapString(metadata.alta_cancelada_desde_stage),
    adminAccessPending: metadata.admin_access_pending === true,
    onboarding: mapOnboardingSummary(metadata),
    username: null,
    estadoCuenta: null,
    documentosCount: documentos.length,
    documentos,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface NominaIncapacidadPendienteItem {
  id: string
  cuentaClienteId: string
  empleadoId: string
  empleadoNombre: string
  supervisorEmpleadoId: string | null
  fechaInicio: string
  fechaFin: string
  enviadaEn: string
  estatus: string
  motivo: string | null
  comentarios: string | null
  justificanteUrl: string | null
  requesterPuesto: Puesto | null
  validadaSupervisorEn: string | null
  validadaReclutamientoEn: string | null
}

export interface NominaWorkspaceSummary {
  totalMovimientos: number
  altasImssPendientes: number
  altasEnProceso: number
  altasObservadas: number
  bajasPendientes: number
  movimientosCerrados: number
  incapacidadesPendientes: number
}

export interface NominaWorkspaceData {
  summary: NominaWorkspaceSummary
  payrollInbox: EmployeePayrollInboxData<EmpleadoListadoItem>
  incapacidadesPendientes: NominaIncapacidadPendienteItem[]
  attendanceMonth: string
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

export async function obtenerWorkspaceNomina(
  supabase: SupabaseClient,
  actor: ActorActual
): Promise<NominaWorkspaceData> {
  const month = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'America/Mexico_City',
  }).format(new Date())

  const [employeesResult, incapacidadesResult] = await Promise.all([
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
        supervisor:supervisor_empleado_id(nombre_completo)
      `)
      .order('created_at', { ascending: false }),
    (() => {
      let query = supabase
        .from('solicitud')
        .select(`
          id,
          cuenta_cliente_id,
          empleado_id,
          supervisor_empleado_id,
          fecha_inicio,
          fecha_fin,
          tipo,
          estatus,
          motivo,
          comentarios,
          justificante_url,
          metadata,
          created_at,
          empleado:empleado_id(nombre_completo)
        `)
        .eq('tipo', 'INCAPACIDAD')
        .order('created_at', { ascending: false })

      if (actor.cuentaClienteId) {
        query = query.eq('cuenta_cliente_id', actor.cuentaClienteId)
      }

      return query
    })(),
  ])

  if (employeesResult.error) {
    return {
      summary: {
        totalMovimientos: 0,
        altasImssPendientes: 0,
        altasEnProceso: 0,
        altasObservadas: 0,
        bajasPendientes: 0,
        movimientosCerrados: 0,
        incapacidadesPendientes: 0,
      },
      payrollInbox: [],
      incapacidadesPendientes: [],
      attendanceMonth: month,
      infraestructuraLista: false,
      mensajeInfraestructura: employeesResult.error.message,
    }
  }

  const employeeRows = (employeesResult.data ?? []) as WorkspaceEmpleadoRow[]
  const baseEmployees = employeeRows.map((row) => mapEmpleadoListadoItem(row, []))
  const baseInbox = buildPayrollInbox<EmpleadoListadoItem>(baseEmployees)
  const inboxEmployeeIds = Array.from(
    new Set(baseInbox.flatMap((lane) => lane.items.map((item) => item.employee.id)))
  )
  const documentsByEmployee = await fetchEmployeeDocuments(supabase, inboxEmployeeIds)
  const employeesById = new Map(
    employeeRows.map((row) => [row.id, mapEmpleadoListadoItem(row, documentsByEmployee.get(row.id) ?? [])] as const)
  )

  const payrollInbox = buildPayrollInbox<EmpleadoListadoItem>(
    baseEmployees.map((employee) => employeesById.get(employee.id) ?? employee)
  )

  const incapacidadesPendientes = ((incapacidadesResult.data ?? []) as IncapacidadSolicitudRow[])
    .filter((item) => {
      const metadata = normalizeMetadata(item.metadata)
      const requesterPuesto = mapString(metadata.actor_puesto)
      return (
        getIncapacidadNextActor({
          estatus: item.estatus as never,
          metadata,
          requesterPuesto: (requesterPuesto as Puesto | null) ?? undefined,
        }) === 'NOMINA'
      )
    })
    .map<NominaIncapacidadPendienteItem>((item) => {
      const metadata = normalizeMetadata(item.metadata)
      const empleado = getFirst(item.empleado)
      return {
        id: item.id,
        cuentaClienteId: item.cuenta_cliente_id,
        empleadoId: item.empleado_id,
        empleadoNombre: empleado?.nombre_completo ?? 'Sin nombre',
        supervisorEmpleadoId: item.supervisor_empleado_id,
        fechaInicio: item.fecha_inicio,
        fechaFin: item.fecha_fin,
        enviadaEn: item.created_at,
        estatus: item.estatus,
        motivo: item.motivo,
        comentarios: item.comentarios,
        justificanteUrl: item.justificante_url,
        requesterPuesto: mapString(metadata.actor_puesto) as Puesto | null,
        validadaSupervisorEn: mapString(metadata.validada_supervisor_en),
        validadaReclutamientoEn: mapString(metadata.reclutamiento_validada_en),
      }
    })

  return {
    summary: {
      totalMovimientos: payrollInbox.reduce((total, lane) => total + lane.items.length, 0),
      altasImssPendientes: payrollInbox.find((lane) => lane.key === 'altas-imss')?.items.length ?? 0,
      altasEnProceso: payrollInbox.find((lane) => lane.key === 'altas-en-proceso')?.items.length ?? 0,
      altasObservadas: payrollInbox.find((lane) => lane.key === 'altas-observadas')?.items.length ?? 0,
      bajasPendientes: payrollInbox.find((lane) => lane.key === 'bajas-pendientes')?.items.length ?? 0,
      movimientosCerrados: payrollInbox.find((lane) => lane.key === 'cerradas')?.items.length ?? 0,
      incapacidadesPendientes: incapacidadesPendientes.length,
    },
    payrollInbox,
    incapacidadesPendientes,
    attendanceMonth: month,
    infraestructuraLista: !incapacidadesResult.error,
    mensajeInfraestructura: incapacidadesResult.error?.message,
  }
}




