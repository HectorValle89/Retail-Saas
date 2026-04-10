'use client'

import {
  useActionState,
  useDeferredValue,
  useState,
  useRef,
  type ChangeEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { useFormStatus } from 'react-dom'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import { ModalPanel } from '@/components/ui/modal-panel'
import { Select } from '@/components/ui/select'
import {
  actualizarFichaEmpleadoReclutamiento,
  actualizarDatosAdministrativosEmpleado,
  actualizarCoberturaPdvOperativa,
  actualizarEstadoExpedienteEmpleado,
  actualizarEstadoImssEmpleado,
  aprobarCandidatoCoordinacion,
  cancelarProcesoAltaEmpleado,
  cerrarBajaEmpleadoNomina,
  crearEmpleado,
  enviarAltaANominaDesdeReclutamiento,
  reactivarProcesoAltaEmpleado,
  rechazarAltaImssEmpleadoNomina,
  rechazarBajaEmpleadoNomina,
  registrarBajaEmpleado,
  subirDocumentoEmpleado,
  validarCierreOnboardingReclutamiento,
} from '../actions'
import {
  ESTADO_COBERTURA_PDV_OPERATIVA_INICIAL,
  ESTADO_EMPLEADO_INICIAL,
  type EmpleadoOcrSnapshot,
} from '../state'
import { deriveYearsFromAgencyStartDate } from '../lib/ocrMapping'
import {
  filterEmpleadosListado,
  IMSS_FILTER_OPTIONS,
  normalizeImssFilterValue,
  type EmpleadosImssFilterValue,
  type EmpleadosPanelInitialFilters,
} from '../lib/empleadosFilters'
import {
  type EmployeeInboxItem,
  type RecruitingInboxLaneKey,
} from '../lib/workflowInbox'
import type {
  DocumentoExpedienteItem,
  EmpleadoListadoItem,
  EmpleadosPanelData,
  OnboardingContractStatus,
  OnboardingExternalAccessStatus,
} from '../services/empleadoService'
import type { Puesto } from '@/types/database'
import { ClientImageFileInput } from '@/components/ui/client-image-file-input'
import { injectDirectR2Upload } from '@/lib/storage/directR2Client'
import { startTransition } from 'react'

const PUESTOS_OPTIONS = [
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

const EXPEDIENTE_OPTIONS = [
  'PENDIENTE_DOCUMENTOS',
  'EN_REVISION',
  'VALIDADO',
  'OBSERVADO',
] as const

const IMSS_OPTIONS = [
  'NO_INICIADO',
  'PENDIENTE_DOCUMENTOS',
  'EN_PROCESO',
  'ALTA_IMSS',
  'ERROR',
] as const

const DOCUMENT_CATEGORY_OPTIONS = ['EXPEDIENTE', 'IMSS', 'BAJA'] as const
const DOCUMENT_TYPE_OPTIONS = [
  'CURP',
  'RFC',
  'NSS',
  'INE',
  'COMPROBANTE_DOMICILIO',
  'CONTRATO',
  'ALTA_IMSS',
  'BAJA',
  'OTRO',
] as const

const SEXO_OPTIONS = [
  { value: '', label: 'Sin definir' },
  { value: 'FEMENINO', label: 'Femenino' },
  { value: 'MASCULINO', label: 'Masculino' },
  { value: 'NO_BINARIO', label: 'No binario' },
  { value: 'OTRO', label: 'Otro' },
] as const

const ESTADO_CIVIL_OPTIONS = [
  { value: '', label: 'Sin definir' },
  { value: 'SOLTERO', label: 'Soltero(a)' },
  { value: 'CASADO', label: 'Casado(a)' },
  { value: 'DIVORCIADO', label: 'Divorciado(a)' },
  { value: 'VIUDO', label: 'Viudo(a)' },
  { value: 'UNION_LIBRE', label: 'Union libre' },
] as const

const EXTERNAL_ACCESS_STATUS_OPTIONS: Array<{ value: OnboardingExternalAccessStatus; label: string }> = [
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'SOLICITADO_A_VIRIDIANA', label: 'Solicitado a Viridiana' },
  { value: 'CONFIRMADO', label: 'Confirmado' },
]

const CONTRACT_STATUS_OPTIONS: Array<{ value: OnboardingContractStatus; label: string }> = [
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'AGENDADO', label: 'Agendado' },
  { value: 'FIRMADO', label: 'Firmado' },
]

function formatDate(value: string | null) {
  if (!value) {
    return 'Sin registro'
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(value))
}

function formatCurrency(value: number | null) {
  if (value === null) {
    return 'Sin definir'
  }

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatBytes(value: number | null) {
  if (!value) {
    return 'Sin tamano'
  }

  if (value < 1024) {
    return `${value} B`
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }

  return `${(value / (1024 * 1024)).toFixed(2)} MB`
}

function formatPuesto(value: string | null) {
  return value ? value.replace(/_/g, ' ') : 'Sin dato'
}

function formatTipoDocumentoLabel(value: string, sourceDocument?: string | null) {
  switch (value) {
    case 'OTRO':
      return sourceDocument === 'CV' ? 'Curriculum / CV' : 'Expediente completo'
    case 'INE':
      return 'Credencial oficial'
    case 'RFC':
      return 'Constancia SAT'
    case 'ALTA_IMSS':
      return 'Comprobante alta IMSS'
    case 'BAJA':
      return 'Expediente de baja'
    case 'COMPROBANTE_DOMICILIO':
      return 'Comprobante domicilio'
    default:
      return value.replace(/_/g, ' ')
  }
}

function getLaboralTone(value: string) {
  if (value === 'ACTIVO') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (value === 'SUSPENDIDO') {
    return 'bg-amber-100 text-amber-700'
  }

  return 'bg-rose-100 text-rose-700'
}

function getExpedienteTone(value: string) {
  if (value === 'VALIDADO') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (value === 'OBSERVADO') {
    return 'bg-rose-100 text-rose-700'
  }

  if (value === 'EN_REVISION') {
    return 'bg-sky-100 text-sky-700'
  }

  return 'bg-amber-100 text-amber-700'
}

function getImssTone(value: string) {
  if (value === 'ALTA_IMSS') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (value === 'ERROR') {
    return 'bg-rose-100 text-rose-700'
  }

  if (value === 'EN_PROCESO') {
    return 'bg-sky-100 text-sky-700'
  }

  return 'bg-amber-100 text-amber-700'
}

function getCuentaTone(value: string | null) {
  if (value === 'ACTIVA') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (value === 'PROVISIONAL' || value === 'PENDIENTE_VERIFICACION_EMAIL') {
    return 'bg-amber-100 text-amber-700'
  }

  if (value === 'SUSPENDIDA') {
    return 'bg-rose-100 text-rose-700'
  }

  return 'bg-slate-100 text-slate-700'
}

function getOcrTone(value: string | null) {
  if (value === 'ok') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (value === 'needs_review') {
    return 'bg-amber-100 text-amber-700'
  }

  if (value === 'unreadable' || value === 'error' || value === 'gemini_missing_api_key') {
    return 'bg-rose-100 text-rose-700'
  }

  return 'bg-slate-100 text-slate-700'
}

function getCuentaCompactLabel(value: string | null) {
  if (value === 'ACTIVA') {
    return 'ACTIVO'
  }

  if (value === 'PROVISIONAL' || value === 'PENDIENTE_VERIFICACION_EMAIL') {
    return 'PROVISIONAL'
  }

  if (value === 'SUSPENDIDA') {
    return 'SUSPENDIDO'
  }

  return 'SIN ACCESO'
}

function getExpedienteCompactLabel(value: string) {
  return value === 'VALIDADO' ? 'OK' : 'PENDIENTE'
}

function getExpedienteCompactTone(value: string) {
  return value === 'VALIDADO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
}

function getImssCompactLabel(value: string) {
  return value === 'ALTA_IMSS' ? 'OK' : 'PENDIENTE'
}

function getImssCompactTone(value: string) {
  return value === 'ALTA_IMSS' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
}

function isPendingPayrollOffboarding(empleado: EmpleadoListadoItem) {
  return empleado.workflowStage === 'PENDIENTE_BAJA_IMSS'
}

function isCancelableAltaStage(value: string | null) {
  return (
    value === 'SELECCION_APROBADA' ||
    value === 'PENDIENTE_IMSS_NOMINA' ||
    value === 'EN_FLUJO_IMSS' ||
    value === 'RECLUTAMIENTO_CORRECCION_ALTA' ||
    value === 'PENDIENTE_VALIDACION_FINAL' ||
    value === 'PENDIENTE_ACCESO_ADMIN'
  )
}

function formatWorkflowStageLabel(value: string | null) {
  switch (value) {
    case 'PENDIENTE_IMSS_NOMINA':
      return 'Pendiente IMSS'
    case 'EN_FLUJO_IMSS':
      return 'Alta IMSS en proceso'
    case 'RECLUTAMIENTO_CORRECCION_ALTA':
      return 'Devuelto a Reclutamiento'
    case 'PENDIENTE_ACCESO_ADMIN':
      return 'Pendiente acceso admin'
    case 'ALTA_CANCELADA':
      return 'Alta cancelada'
    case 'PENDIENTE_BAJA_IMSS':
      return 'Baja pendiente IMSS'
    case 'RECLUTAMIENTO_CORRECCION_BAJA':
      return 'Baja devuelta'
    case 'BAJA_IMSS_CERRADA':
      return 'Baja cerrada'
    default:
      return 'Sin etapa'
  }
}

type RecruitingDashboardStageKey =
  | 'FILTRADOS'
  | 'ENTREVISTA_SELECCION'
  | 'GESTION_ACCESOS'
  | 'DOCUMENTACION'
  | 'TRAMITE_ALTA'
  | 'DEVUELTOS_NOMINA'
  | 'CONTRATADOS'
  | 'CANCELADOS'

interface RecruitingCandidateContext {
  empleado: EmpleadoListadoItem
  pdvObjetivo: EmpleadosPanelData['pdvs'][number] | null
  stageKey: RecruitingDashboardStageKey
  documentationProgress: number
  readyForAdmin: boolean
  coordinadorLabel: string
  cadena: string | null
  ciudad: string | null
}

function isRecruitingCandidate(empleado: EmpleadoListadoItem) {
  return [
    'PENDIENTE_COORDINACION',
    'SELECCION_APROBADA',
    'PENDIENTE_IMSS_NOMINA',
    'EN_FLUJO_IMSS',
    'PENDIENTE_VALIDACION_FINAL',
    'PENDIENTE_ACCESO_ADMIN',
    'RECLUTAMIENTO_CORRECCION_ALTA',
    'ALTA_CANCELADA',
  ].includes(empleado.workflowStage ?? '')
}

function calculateRecruitingDocumentationProgress(empleado: EmpleadoListadoItem) {
  const checkpoints = [
    Boolean(empleado.onboarding.pdvObjetivoId),
    Boolean(empleado.onboarding.coordinadorEmpleadoId),
    Boolean(empleado.onboarding.fechaIngresoOficial),
    Boolean(empleado.onboarding.fechaIsdinizacion),
    empleado.onboarding.accesosExternosStatus === 'CONFIRMADO',
    empleado.onboarding.expedienteCompletoRecibido,
    empleado.onboarding.contratoStatus === 'FIRMADO',
    empleado.imssEstado === 'ALTA_IMSS',
  ]

  const completed = checkpoints.filter(Boolean).length
  return Math.round((completed / checkpoints.length) * 100)
}

function isRecruitingCandidateReadyForAdmin(empleado: EmpleadoListadoItem) {
  return (
    empleado.imssEstado === 'ALTA_IMSS' &&
    empleado.onboarding.contratoStatus === 'FIRMADO' &&
    Boolean(empleado.onboarding.contratoFirmadoEn) &&
    empleado.onboarding.expedienteCompletoRecibido
  )
}

function resolveRecruitingDashboardStage(empleado: EmpleadoListadoItem): RecruitingDashboardStageKey {
  if (empleado.workflowStage === 'ALTA_CANCELADA') {
    return 'CANCELADOS'
  }

  if (empleado.workflowStage === 'RECLUTAMIENTO_CORRECCION_ALTA') {
    return 'DEVUELTOS_NOMINA'
  }

  if (empleado.adminAccessPending || empleado.workflowStage === 'PENDIENTE_ACCESO_ADMIN') {
    return 'CONTRATADOS'
  }

  if (
    empleado.workflowStage === 'PENDIENTE_IMSS_NOMINA' ||
    empleado.workflowStage === 'EN_FLUJO_IMSS' ||
    empleado.imssEstado === 'EN_PROCESO' ||
    empleado.imssEstado === 'PENDIENTE_DOCUMENTOS'
  ) {
    return 'TRAMITE_ALTA'
  }

  if (
    !empleado.onboarding.expedienteCompletoRecibido ||
    empleado.onboarding.contratoStatus !== 'FIRMADO' ||
    empleado.expedienteEstado === 'PENDIENTE_DOCUMENTOS' ||
    empleado.expedienteEstado === 'OBSERVADO'
  ) {
    return 'DOCUMENTACION'
  }

  if (empleado.onboarding.accesosExternosStatus !== 'CONFIRMADO') {
    return 'GESTION_ACCESOS'
  }

  if (
    empleado.workflowStage === 'SELECCION_APROBADA' ||
    empleado.workflowStage === 'PENDIENTE_VALIDACION_FINAL'
  ) {
    return 'ENTREVISTA_SELECCION'
  }

  return 'FILTRADOS'
}

function getRecruitingStageMeta(stageKey: RecruitingDashboardStageKey) {
  switch (stageKey) {
    case 'FILTRADOS':
      return {
        label: 'Filtrado',
        description: 'CVs enviados al coordinador para iniciar validacion.',
        tone: 'bg-slate-100 text-slate-700',
      }
    case 'ENTREVISTA_SELECCION':
      return {
        label: 'Entrevista',
        description: 'Candidatos ya aprobados por coordinacion y en preparacion.',
        tone: 'bg-sky-100 text-sky-700',
      }
    case 'GESTION_ACCESOS':
      return {
        label: 'Accesos',
        description: 'Esperando confirmacion externa antes de cerrar el paquete operativo.',
        tone: 'bg-violet-100 text-violet-700',
      }
    case 'DOCUMENTACION':
      return {
        label: 'Documentos',
        description: 'Faltan papeles, contrato o cierre del expediente.',
        tone: 'bg-amber-100 text-amber-700',
      }
    case 'TRAMITE_ALTA':
      return {
        label: 'Alta',
        description: 'Expedientes ya enviados a Nomina / IMSS.',
        tone: 'bg-cyan-100 text-cyan-700',
      }
    case 'DEVUELTOS_NOMINA':
      return {
        label: 'Nomina',
        description: 'Expedientes regresados para correccion antes de seguir el alta.',
        tone: 'bg-rose-100 text-rose-700',
      }
    case 'CONTRATADOS':
      return {
        label: 'Contratado',
        description: 'Listos para que Administracion genere accesos y salida operativa.',
        tone: 'bg-emerald-100 text-emerald-700',
      }
    case 'CANCELADOS':
      return {
        label: 'Cancelado',
        description: 'Procesos detenidos con trazabilidad y posibilidad de reactivacion.',
        tone: 'bg-slate-200 text-slate-700',
      }
  }
}

function formatAverageDays(value: number | null) {
  if (value === null) {
    return 'Sin cierre'
  }

  return `${value.toFixed(1)} dias`
}

function computeRecruitingAverageLeadDays(items: RecruitingCandidateContext[]) {
  const durations = items
    .filter((item) => Boolean(item.empleado.onboarding.validacionFinalReclutamientoAt))
    .map((item) => {
      const start = new Date(item.empleado.createdAt).getTime()
      const end = new Date(item.empleado.onboarding.validacionFinalReclutamientoAt as string).getTime()
      return Number.isFinite(start) && Number.isFinite(end) && end >= start
        ? (end - start) / (1000 * 60 * 60 * 24)
        : null
    })
    .filter((value): value is number => value !== null)

  if (durations.length === 0) {
    return null
  }

  return durations.reduce((sum, value) => sum + value, 0) / durations.length
}

function formatDocumentationProgress(progress: number) {
  return `${progress}%`
}

function formatRecruitingDocumentationLabel(empleado: EmpleadoListadoItem, progress: number) {
  if (progress >= 100) {
    return '100%'
  }

  if (!empleado.onboarding.expedienteCompletoRecibido) {
    return `${progress}% · expediente pendiente`
  }

  if (empleado.onboarding.contratoStatus !== 'FIRMADO') {
    return `${progress}% · contrato pendiente`
  }

  if (empleado.imssEstado !== 'ALTA_IMSS') {
    return `${progress}% · IMSS pendiente`
  }

  return `${progress}%`
}
interface CrearEmpleadoDraft {
  nombre_completo: string
  curp: string
  nss: string
  rfc: string
  puesto: string
  zona: string
  telefono: string
  correo_electronico: string
  fecha_alta: string
  fecha_nacimiento: string
  domicilio_completo: string
  codigo_postal: string
  edad: string
  sexo: string
  estado_civil: string
  originario: string
  pdv_objetivo_id: string
  coordinador_empleado_id: string
  fecha_ingreso_oficial: string
  fecha_isdinizacion: string
  accesos_externos_status: OnboardingExternalAccessStatus
  accesos_externos_observaciones: string
  expediente_completo_recibido: boolean
  contrato_status: OnboardingContractStatus
  contrato_firmado_en: string
}

interface OcrPreviewResponse {
  message?: string
  snapshot?: EmpleadoOcrSnapshot
  ocrProvider?: string | null
  recognizedFields?: number
  result?: {
    status?: string | null
    confidenceSummary?: string | null
    errorMessage?: string | null
  }
}

function createInitialEmpleadoDraft(): CrearEmpleadoDraft {
  const today = new Date().toISOString().slice(0, 10)

  return {
    nombre_completo: '',
    curp: '',
    nss: '',
    rfc: '',
    puesto: 'DERMOCONSEJERO',
    zona: '',
    telefono: '',
    correo_electronico: '',
    fecha_alta: today,
    fecha_nacimiento: '',
    domicilio_completo: '',
    codigo_postal: '',
    edad: '',
    sexo: '',
    estado_civil: '',
    originario: '',
    pdv_objetivo_id: '',
    coordinador_empleado_id: '',
    fecha_ingreso_oficial: today,
    fecha_isdinizacion: '',
    accesos_externos_status: 'PENDIENTE',
    accesos_externos_observaciones: '',
    expediente_completo_recibido: true,
    contrato_status: 'PENDIENTE',
    contrato_firmado_en: '',
  }
}

function normalizeUppercaseTextInput(value: string) {
  return value.toLocaleUpperCase('es-MX')
}

function applyOcrSnapshotToDraft(
  current: CrearEmpleadoDraft,
  snapshot: EmpleadoOcrSnapshot
): CrearEmpleadoDraft {
  return {
    ...current,
    nombre_completo: snapshot.nombreCompleto ?? current.nombre_completo,
    curp: snapshot.curp ?? current.curp,
    nss: snapshot.nss ?? current.nss,
    rfc: snapshot.rfc ?? current.rfc,
    telefono: snapshot.telefono ?? current.telefono,
    correo_electronico: snapshot.correoElectronico ?? current.correo_electronico,
    fecha_nacimiento: snapshot.fechaNacimiento ?? current.fecha_nacimiento,
    domicilio_completo: snapshot.direccion ?? current.domicilio_completo,
    codigo_postal: snapshot.codigoPostal ?? current.codigo_postal,
    edad: snapshot.edad !== null ? String(snapshot.edad) : current.edad,
    sexo: snapshot.sexo ?? current.sexo,
    estado_civil: snapshot.estadoCivil ?? current.estado_civil,
    originario: snapshot.originario ?? current.originario,
  }
}

async function readJsonResponseSafely(response: Response): Promise<OcrPreviewResponse> {
  const rawText = await response.text()

  if (!rawText.trim()) {
    return {
      message: response.ok
        ? 'La ruta OCR no devolvio contenido.'
        : 'La ruta OCR devolvio una respuesta vacia.',
    }
  }

  try {
    return JSON.parse(rawText) as OcrPreviewResponse
  } catch {
    return {
      message: response.ok
        ? 'La respuesta OCR no pudo interpretarse.'
        : `La ruta OCR devolvio una respuesta no JSON (HTTP ${response.status}).`,
    }
  }
}

export function EmpleadosPanel({
  data,
  actorPuesto,
  initialFilters,
}: {
  data: EmpleadosPanelData
  actorPuesto: Puesto
  initialFilters?: EmpleadosPanelInitialFilters
}) {
  const [mainTab, setMainTab] = useState<'base' | 'reclutamiento' | 'coordinacion' | 'pdvs'>(
    actorPuesto === 'COORDINADOR' ? 'coordinacion' : actorPuesto === 'RECLUTAMIENTO' ? 'reclutamiento' : 'base'
  )
  const [search, setSearch] = useState(initialFilters?.search ?? '')
  const [estadoFilter, setEstadoFilter] = useState(initialFilters?.estadoLaboral ?? 'ALL')
  const [zonaFilter, setZonaFilter] = useState(initialFilters?.zona ?? 'ALL')
  const [supervisorFilter, setSupervisorFilter] = useState(initialFilters?.supervisorId ?? 'ALL')
  const [imssFilter, setImssFilter] = useState<EmpleadosImssFilterValue>(
    normalizeImssFilterValue(initialFilters?.imss)
  )
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [recruitingCreateOpen, setRecruitingCreateOpen] = useState(false)
  const deferredSearch = useDeferredValue(search)

  const canRecruit = actorPuesto === 'RECLUTAMIENTO' || actorPuesto === 'ADMINISTRADOR'
  const canCoordinate = actorPuesto === 'COORDINADOR' || actorPuesto === 'ADMINISTRADOR'
  const canManageAdminFields = actorPuesto === 'ADMINISTRADOR'

  const coordinationEmployees = data.empleados.filter(
    (empleado) => empleado.workflowStage === 'PENDIENTE_COORDINACION'
  )

  const operationalEmployees = data.empleados.filter(
    (empleado) =>
      ![
        'PENDIENTE_COORDINACION',
        'SELECCION_APROBADA',
        'PENDIENTE_IMSS_NOMINA',
        'EN_FLUJO_IMSS',
        'PENDIENTE_VALIDACION_FINAL',
        'PENDIENTE_ACCESO_ADMIN',
        'RECLUTAMIENTO_CORRECCION_ALTA',
        'ALTA_CANCELADA',
      ].includes(empleado.workflowStage ?? '')
  )

  const empleadosFiltrados = filterEmpleadosListado(operationalEmployees, {
    search: deferredSearch,
    estadoLaboral: estadoFilter,
    zona: zonaFilter,
    supervisorId: supervisorFilter,
    imss: imssFilter,
  })

  const selectedEmployee = data.empleados.find((empleado) => empleado.id === selectedEmployeeId) ?? null
  const recruitingInboxCount = data.recruitingInbox.reduce((total, lane) => total + lane.items.length, 0)
  const topMetrics =
    mainTab === 'reclutamiento'
      ? [
          {
            label: 'Candidatos en pipeline',
            value: String(data.resumenReclutamiento.candidatosEnPipeline),
            accentClass: 'from-sky-100 via-cyan-50 to-white text-sky-700',
          },
          {
            label: 'Pendientes Coordinacion',
            value: String(data.resumenReclutamiento.pendientesCoordinacion),
            accentClass: 'from-violet-100 via-fuchsia-50 to-white text-violet-700',
          },
          {
            label: 'Pendientes documentacion',
            value: String(data.resumenReclutamiento.pendientesDocumentacion),
            accentClass: 'from-amber-100 via-yellow-50 to-white text-amber-700',
          },
          {
            label: 'Pendientes Nomina / IMSS',
            value: String(data.resumenReclutamiento.pendientesNominaImss),
            accentClass: 'from-rose-100 via-orange-50 to-white text-rose-700',
          },
          {
            label: 'Listos Administracion',
            value: String(data.resumenReclutamiento.listosAdministracion),
            accentClass: 'from-emerald-100 via-lime-50 to-white text-emerald-700',
          },
          {
            label: 'Proximas ISDINIZACIONES',
            value: String(data.resumenReclutamiento.proximasIsdinizaciones),
            accentClass: 'from-teal-100 via-cyan-50 to-white text-teal-700',
          },
        ]
      : mainTab === 'pdvs'
        ? [
            {
              label: 'PDVs cubiertos',
              value: String(data.recruitmentCoverageSummary.pdvsCubiertos),
              accentClass: 'from-emerald-100 via-lime-50 to-white text-emerald-700',
            },
            {
              label: 'Reservados / pendiente acceso',
              value: String(data.recruitmentCoverageSummary.pdvsReservados),
              accentClass: 'from-amber-100 via-yellow-50 to-white text-amber-700',
            },
            {
              label: 'Vacantes',
              value: String(data.recruitmentCoverageSummary.pdvsVacantes),
              accentClass: 'from-orange-100 via-amber-50 to-white text-orange-700',
            },
            {
              label: 'PDVs bloqueados',
              value: String(data.recruitmentCoverageSummary.pdvsBloqueados),
              accentClass: 'from-rose-100 via-red-50 to-white text-rose-700',
            },
            {
              label: 'Pendientes >48h',
              value: String(data.recruitmentCoverageSummary.pendientesAccesoVencidos),
              accentClass: 'from-sky-100 via-cyan-50 to-white text-sky-700',
            },
            {
              label: 'En proceso de firma',
              value: String(data.recruitmentCoverageSummary.vacantesEnProcesoFirma),
              accentClass: 'from-violet-100 via-fuchsia-50 to-white text-violet-700',
            },
          ]
        : [
            {
              label: 'Base operativa',
              value: String(operationalEmployees.length),
              accentClass: 'from-emerald-100 via-teal-50 to-white text-emerald-700',
            },
            {
              label: 'Candidatos por coordinar',
              value: String(coordinationEmployees.length),
              accentClass: 'from-sky-100 via-cyan-50 to-white text-sky-700',
            },
            {
              label: 'Bandeja reclutamiento',
              value: String(recruitingInboxCount),
              accentClass: 'from-violet-100 via-fuchsia-50 to-white text-violet-700',
            },
            {
              label: 'Activos',
              value: String(data.resumen.activos),
              accentClass: 'from-lime-100 via-emerald-50 to-white text-lime-700',
            },
            {
              label: 'IMSS en proceso',
              value: String(data.resumen.imssEnProceso),
              accentClass: 'from-amber-100 via-yellow-50 to-white text-amber-700',
            },
          ]

  return (
    <div className="space-y-6">
      {!data.infraestructuraLista && data.mensajeInfraestructura && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">Infraestructura parcial</p>
          <p className="mt-2 text-sm">{data.mensajeInfraestructura}</p>
        </Card>
      )}

      {!data.ocrDisponible && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-medium">OCR no configurado en este entorno</p>
          <p className="mt-2 text-sm">
            El flujo OCR+IA ya esta integrado, pero hoy no existe proveedor efectivo. Configuralo
            en <code>/configuracion</code> o via entorno y asegure tambien las credenciales del
            proveedor seleccionado.
          </p>
        </Card>
      )}

      <div
        className={`grid gap-4 ${
          mainTab === 'reclutamiento' || mainTab === 'pdvs' ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-5'
        }`}
      >
        {topMetrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            accentClass={metric.accentClass}
            emphasized={mainTab === 'reclutamiento'}
            tinted={mainTab !== 'reclutamiento'}
          />
        ))}
      </div>

      <Card className="space-y-5 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Canvas de empleados</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
Concentramos a Reclutamiento en su pipeline, su base operativa y su tablero de cobertura PDV desde un solo canvas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canRecruit ? (
              <CanvasTabButton active={mainTab === 'reclutamiento'} onClick={() => setMainTab('reclutamiento')}>
                Reclutamiento
              </CanvasTabButton>
            ) : null}
            <CanvasTabButton active={mainTab === 'base'} onClick={() => setMainTab('base')}>
              Base operativa
            </CanvasTabButton>
            {canRecruit ? (
              <CanvasTabButton active={mainTab === 'pdvs'} onClick={() => setMainTab('pdvs')}>
                Cobertura PDVs
              </CanvasTabButton>
            ) : null}
            {canCoordinate ? (
              <CanvasTabButton active={mainTab === 'coordinacion'} onClick={() => setMainTab('coordinacion')}>
                Coordinacion
              </CanvasTabButton>
            ) : null}
          </div>
        </div>
      </Card>

      {mainTab === 'reclutamiento' && canRecruit ? (
        <>
          <RecruitingDashboard
            data={data}
            onOpen={(empleado) => setSelectedEmployeeId(empleado.id)}
            onCreateCandidate={() => setRecruitingCreateOpen(true)}
          />

          <ModalPanel
            open={recruitingCreateOpen}
            onClose={() => setRecruitingCreateOpen(false)}
            title="Nuevo candidato"
            subtitle="Carga el CV para iniciar el expediente y enviar el candidato a Coordinacion."
            maxWidthClassName="max-w-6xl"
          >
            <div className="space-y-4 p-1">
              <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="font-semibold text-slate-950">Alta inicial desde Reclutamiento</p>
                  <p className="mt-1 max-w-3xl">
                    Aqui arranca el proceso. Solo cargas el CV, validas los datos base y propones el PDV sugerido para que Coordinacion tome el candidato.
                  </p>
                </div>
                <div className="text-sm text-slate-500">
                  <p>
                    Coordinadores activos:{' '}
                    <span className="font-semibold text-slate-900">{data.coordinators.length}</span>
                  </p>
                  <p className="mt-1">
                    OCR provider:{' '}
                    <span className="font-semibold text-slate-900">{data.ocrProvider ?? 'sin configurar'}</span>
                  </p>
                </div>
              </div>
              <CrearEmpleadoForm data={data} />
            </div>
          </ModalPanel>
        </>
      ) : null}
      {mainTab === 'coordinacion' && canCoordinate ? (
        <CoordinationInboxBoard data={data} empleados={coordinationEmployees} onOpen={(empleado) => setSelectedEmployeeId(empleado.id)} />
      ) : null}

      {mainTab === 'pdvs' && canRecruit ? (
        <CoberturaPdvPanel data={data} canManage={canRecruit} />
      ) : null}

      {mainTab === 'base' ? (
        <>
          <Card className="p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Base operativa de empleados</h2>
                <p className="mt-1 text-sm text-slate-500">
Consulta la plantilla ya integrada. Los candidatos y expedientes vivos ya no se mezclan con esta base estabilizada.
                </p>
              </div>
              <p className="text-sm text-slate-500">
                Mostrando{' '}
                <span className="font-semibold text-slate-900">{empleadosFiltrados.length}</span> de{' '}
                <span className="font-semibold text-slate-900">{operationalEmployees.length}</span>{' '}
                empleados.
              </p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Input
                label="Buscar"
                placeholder="Nombre, nomina, CURP, RFC, NSS o username"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Select
                label="Estado laboral"
                value={estadoFilter}
                onChange={(event) => setEstadoFilter(event.target.value)}
                options={[
                  { value: 'ALL', label: 'Todos' },
                  { value: 'ACTIVO', label: 'ACTIVO' },
                  { value: 'SUSPENDIDO', label: 'SUSPENDIDO' },
                  { value: 'BAJA', label: 'BAJA' },
                ]}
              />
              <Select
                label="Zona"
                value={zonaFilter}
                onChange={(event) => setZonaFilter(event.target.value)}
                options={[
                  { value: 'ALL', label: 'Todas' },
                  { value: 'SIN_ZONA', label: 'Sin zona' },
                  ...data.zonas.map((zona) => ({ value: zona, label: zona })),
                ]}
              />
              <Select
                label="Supervisor"
                value={supervisorFilter}
                onChange={(event) => setSupervisorFilter(event.target.value)}
                options={[
                  { value: 'ALL', label: 'Todos' },
                  { value: 'SIN_SUPERVISOR', label: 'Sin supervisor' },
                  ...data.supervisors.map((supervisor) => ({
                    value: supervisor.id,
                    label: supervisor.nombreCompleto,
                  })),
                ]}
              />
              <Select
                label="Estado IMSS"
                value={imssFilter}
                onChange={(event) => setImssFilter(normalizeImssFilterValue(event.target.value))}
                options={IMSS_FILTER_OPTIONS}
              />
            </div>
            {imssFilter === 'PENDIENTE_IMSS' && (
              <p className="mt-3 text-xs font-medium text-amber-700">
                Vista enfocada en empleados integrados que todavia siguen pendientes de alta IMSS.
              </p>
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="w-[24%] px-5 py-3 font-medium">Empleado</th>
                    <th className="w-[20%] px-5 py-3 font-medium">Zona / supervisor</th>
                    <th className="w-[18%] px-5 py-3 font-medium">Acceso</th>
                    <th className="w-[14%] px-5 py-3 font-medium">Expediente</th>
                    <th className="w-[14%] px-5 py-3 font-medium">IMSS</th>
                    <th className="w-[110px] px-5 py-3 text-right font-medium">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {empleadosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                        No hay empleados que coincidan con los filtros activos.
                      </td>
                    </tr>
                  ) : (
                    empleadosFiltrados.map((empleado) => (
                      <EmpleadoRow
                        key={empleado.id}
                        empleado={empleado}
                        onToggle={() => setSelectedEmployeeId(empleado.id)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}

      {selectedEmployee ? (
        <EmpleadoDetailModal
          key={selectedEmployee.id}
          open
          onClose={() => setSelectedEmployeeId(null)}
          empleado={selectedEmployee}
          data={data}
          actorPuesto={actorPuesto}
        />
      ) : null}
    </div>
  )
}
function PdvDisponiblesPanel({
  pdvs,
}: {
  pdvs: EmpleadosPanelData['pdvsDisponibles']
}) {
  const [search, setSearch] = useState('')
  const [cadenaFilter, setCadenaFilter] = useState('ALL')
  const [ciudadFilter, setCiudadFilter] = useState('ALL')
  const [zonaFilter, setZonaFilter] = useState('ALL')

  const cadenas = Array.from(new Set(pdvs.map((pdv) => pdv.cadena).filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b, 'es-MX')
  )
  const ciudades = Array.from(new Set(pdvs.map((pdv) => pdv.ciudad).filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b, 'es-MX')
  )
  const zonas = Array.from(new Set(pdvs.map((pdv) => pdv.zona).filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b, 'es-MX')
  )

  const normalizedSearch = search.trim().toLocaleLowerCase('es-MX')
  const pdvsFiltrados = pdvs.filter((pdv) => {
    const matchesSearch =
      normalizedSearch.length === 0 ||
      [pdv.nombre, pdv.claveBtl, pdv.cadena, pdv.ciudad, pdv.zona]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('es-MX').includes(normalizedSearch))

    const matchesCadena = cadenaFilter === 'ALL' || pdv.cadena === cadenaFilter
    const matchesCiudad = ciudadFilter === 'ALL' || pdv.ciudad === ciudadFilter
    const matchesZona = zonaFilter === 'ALL' || pdv.zona === zonaFilter

    return matchesSearch && matchesCadena && matchesCiudad && matchesZona
  })

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">PDVs disponibles</h2>
            <p className="mt-1 text-sm text-slate-500">
              Aqui ves tiendas sin asignacion activa estructural vigente para apoyar nuevos ingresos o cambios operativos.
            </p>
          </div>
          <p className="text-sm text-slate-500">
            Mostrando <span className="font-semibold text-slate-900">{pdvsFiltrados.length}</span> de{' '}
            <span className="font-semibold text-slate-900">{pdvs.length}</span> PDVs disponibles.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Buscar"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Sucursal, clave BTL, cadena, ciudad o zona"
          />
          <Select
            label="Cadena"
            value={cadenaFilter}
            onChange={(event) => setCadenaFilter(event.target.value)}
            options={[{ value: 'ALL', label: 'Todas' }, ...cadenas.map((cadena) => ({ value: cadena, label: cadena }))]}
          />
          <Select
            label="Ciudad"
            value={ciudadFilter}
            onChange={(event) => setCiudadFilter(event.target.value)}
            options={[{ value: 'ALL', label: 'Todas' }, ...ciudades.map((ciudad) => ({ value: ciudad, label: ciudad }))]}
          />
          <Select
            label="Zona"
            value={zonaFilter}
            onChange={(event) => setZonaFilter(event.target.value)}
            options={[{ value: 'ALL', label: 'Todas' }, ...zonas.map((zona) => ({ value: zona, label: zona }))]}
          />
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="w-[30%] px-5 py-3 font-medium">PDV</th>
                <th className="w-[16%] px-5 py-3 font-medium">Clave BTL</th>
                <th className="w-[18%] px-5 py-3 font-medium">Cadena</th>
                <th className="w-[18%] px-5 py-3 font-medium">Ciudad</th>
                <th className="w-[18%] px-5 py-3 font-medium">Zona</th>
              </tr>
            </thead>
            <tbody>
              {pdvsFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    No hay PDVs disponibles que coincidan con los filtros activos.
                  </td>
                </tr>
              ) : (
                pdvsFiltrados.map((pdv) => (
                  <tr key={pdv.id} className="border-t border-slate-100 align-top">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">{pdv.nombre}</div>
                      <div className="mt-1 text-xs text-emerald-600">Sin asignacion activa</div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{pdv.claveBtl ?? 'Sin clave'}</td>
                    <td className="px-5 py-4 text-slate-600">{pdv.cadena ?? 'Sin cadena'}</td>
                    <td className="px-5 py-4 text-slate-600">{pdv.ciudad ?? 'Sin ciudad'}</td>
                    <td className="px-5 py-4 text-slate-600">{pdv.zona ?? 'Sin zona'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}


type CoberturaBoardItem = EmpleadosPanelData['pdvCoberturaBoard'][number]
type CoberturaActionValue =
  | 'APARTAR_PDV'
  | 'MARCAR_PENDIENTE_ACCESO'
  | 'ASIGNAR_PDV_PASO'
  | 'LIBERAR_ACCESO'
  | 'QUITAR_RESERVA'

function getCoberturaSemaforoTone(semaforo: CoberturaBoardItem['semaforo']) {
  switch (semaforo) {
    case 'VERDE':
      return 'bg-emerald-100 text-emerald-700'
    case 'AMARILLO':
      return 'bg-amber-100 text-amber-700'
    case 'NARANJA':
      return 'bg-orange-100 text-orange-700'
    default:
      return 'bg-rose-100 text-rose-700'
  }
}

function getCoberturaNeedTone(actionNeed: CoberturaBoardItem['actionNeed']) {
  switch (actionNeed) {
    case 'COBERTURA_OK':
      return 'bg-emerald-100 text-emerald-700'
    case 'PENDIENTE_ACCESO':
      return 'bg-amber-100 text-amber-700'
    case 'PENDIENTE_ACCESO_VENCIDO':
      return 'bg-rose-100 text-rose-700'
    case 'VACANTE_EN_PROCESO_FIRMA':
      return 'bg-violet-100 text-violet-700'
    case 'PDV_INACTIVO':
      return 'bg-slate-100 text-slate-700'
    default:
      return 'bg-orange-100 text-orange-700'
  }
}

function getCoberturaActionLabel(action: CoberturaActionValue) {
  switch (action) {
    case 'APARTAR_PDV':
      return 'Apartar PDV'
    case 'MARCAR_PENDIENTE_ACCESO':
      return 'Marcar pendiente de acceso'
    case 'ASIGNAR_PDV_PASO':
      return 'Asignar PDV de paso'
    case 'LIBERAR_ACCESO':
      return 'Liberar acceso'
    default:
      return 'Quitar reserva'
  }
}

function getCoberturaActionOptions(item: CoberturaBoardItem) {
  if (item.semaforo === 'ROJO') {
    return []
  }

  const options: CoberturaActionValue[] = [
    'MARCAR_PENDIENTE_ACCESO',
    'ASIGNAR_PDV_PASO',
    'LIBERAR_ACCESO',
    'APARTAR_PDV',
    'QUITAR_RESERVA',
  ]

  return options.map((value) => ({ value, label: getCoberturaActionLabel(value) }))
}

function getCoberturaDefaultAction(item: CoberturaBoardItem): CoberturaActionValue {
  if (item.semaforo === 'AMARILLO') {
    return 'LIBERAR_ACCESO'
  }

  if (item.actionNeed === 'VACANTE_EN_PROCESO_FIRMA') {
    return 'MARCAR_PENDIENTE_ACCESO'
  }

  if (item.semaforo === 'VERDE') {
    return 'APARTAR_PDV'
  }

  return 'MARCAR_PENDIENTE_ACCESO'
}

function formatCoberturaWaitLabel(days: number | null) {
  if (days === null) {
    return 'Sin espera activa'
  }

  if (days === 0) {
    return 'Hoy'
  }

  if (days === 1) {
    return '1 dia'
  }

  return `${days} dias`
}

function CoberturaPdvPanel({
  data,
  canManage,
}: {
  data: EmpleadosPanelData
  canManage: boolean
}) {
  const [search, setSearch] = useState('')
  const [actionNeedFilter, setActionNeedFilter] = useState('ALL')
  const [semaforoFilter, setSemaforoFilter] = useState('ALL')
  const [cadenaFilter, setCadenaFilter] = useState('ALL')
  const [ciudadFilter, setCiudadFilter] = useState('ALL')
  const [zonaFilter, setZonaFilter] = useState('ALL')
  const [selectedPdvId, setSelectedPdvId] = useState<string | null>(null)

  const items = data.pdvCoberturaBoard
  const cadenas = Array.from(new Set(items.map((item) => item.cadena).filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b, 'es-MX')
  )
  const ciudades = Array.from(new Set(items.map((item) => item.ciudad).filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b, 'es-MX')
  )
  const zonas = Array.from(new Set(items.map((item) => item.zona).filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b, 'es-MX')
  )

  const normalizedSearch = search.trim().toLocaleLowerCase('es-MX')
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      normalizedSearch.length === 0 ||
      [
        item.nombre,
        item.claveBtl,
        item.cadena,
        item.ciudad,
        item.zona,
        item.employeeName,
        item.candidateName,
        item.pdvPasoNombre,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('es-MX').includes(normalizedSearch))

    const matchesActionNeed = actionNeedFilter === 'ALL' || item.actionNeed === actionNeedFilter
    const matchesSemaforo = semaforoFilter === 'ALL' || item.semaforo === semaforoFilter
    const matchesCadena = cadenaFilter === 'ALL' || item.cadena === cadenaFilter
    const matchesCiudad = ciudadFilter === 'ALL' || item.ciudad === ciudadFilter
    const matchesZona = zonaFilter === 'ALL' || item.zona === zonaFilter

    return (
      matchesSearch &&
      matchesActionNeed &&
      matchesSemaforo &&
      matchesCadena &&
      matchesCiudad &&
      matchesZona
    )
  })

  const selectedItem = filteredItems.find((item) => item.pdvId === selectedPdvId)
    ?? items.find((item) => item.pdvId === selectedPdvId)
    ?? null

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Cobertura PDVs</h2>
            <p className="mt-1 text-sm text-slate-500">
              Semaforo operativo para vacantes, reservas, accesos pendientes y PDVs de paso de la cuenta ISDIN.
            </p>
          </div>
          <p className="text-sm text-slate-500">
            Mostrando <span className="font-semibold text-slate-900">{filteredItems.length}</span> de{' '}
            <span className="font-semibold text-slate-900">{items.length}</span> PDVs cubribles y bloqueados.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Input
            label="Buscar"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Sucursal, clave, DC, cadena, ciudad o PDV de paso"
          />
          <Select
            label="Necesidad de accion"
            value={actionNeedFilter}
            onChange={(event) => setActionNeedFilter(event.target.value)}
            options={[
              { value: 'ALL', label: 'Todas' },
              { value: 'VACANTE_URGENTE', label: 'Vacante urgente' },
              { value: 'VACANTE_EN_PROCESO_FIRMA', label: 'Vacante en proceso de firma' },
              { value: 'PENDIENTE_ACCESO', label: 'Pendiente de acceso' },
              { value: 'PENDIENTE_ACCESO_VENCIDO', label: 'Pendiente >48h' },
              { value: 'COBERTURA_OK', label: 'Cobertura estable' },
              { value: 'PDV_INACTIVO', label: 'PDV inactivo' },
            ]}
          />
          <Select
            label="Estado semaforo"
            value={semaforoFilter}
            onChange={(event) => setSemaforoFilter(event.target.value)}
            options={[
              { value: 'ALL', label: 'Todos' },
              { value: 'VERDE', label: 'Verde / cubierto' },
              { value: 'AMARILLO', label: 'Amarillo / pendiente acceso' },
              { value: 'NARANJA', label: 'Naranja / vacante' },
              { value: 'ROJO', label: 'Rojo / inactivo' },
            ]}
          />
          <Select
            label="Cadena"
            value={cadenaFilter}
            onChange={(event) => setCadenaFilter(event.target.value)}
            options={[{ value: 'ALL', label: 'Todas' }, ...cadenas.map((cadena) => ({ value: cadena, label: cadena }))]}
          />
          <Select
            label="Ciudad"
            value={ciudadFilter}
            onChange={(event) => setCiudadFilter(event.target.value)}
            options={[{ value: 'ALL', label: 'Todas' }, ...ciudades.map((ciudad) => ({ value: ciudad, label: ciudad }))]}
          />
          <Select
            label="Zona"
            value={zonaFilter}
            onChange={(event) => setZonaFilter(event.target.value)}
            options={[{ value: 'ALL', label: 'Todas' }, ...zonas.map((zona) => ({ value: zona, label: zona }))]}
          />
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] table-fixed text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="w-[23%] px-5 py-3 font-medium">PDV</th>
                <th className="w-[12%] px-5 py-3 font-medium">Semaforo</th>
                <th className="w-[17%] px-5 py-3 font-medium">Cobertura</th>
                <th className="w-[18%] px-5 py-3 font-medium">DC / Candidato</th>
                <th className="w-[12%] px-5 py-3 font-medium">PDV de paso</th>
                <th className="w-[10%] px-5 py-3 font-medium">Espera</th>
                <th className="w-[8%] px-5 py-3 font-medium">Accion</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    No hay PDVs de cobertura que coincidan con los filtros activos.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.pdvId} className="border-t border-slate-100 align-top">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">{item.nombre}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {item.claveBtl ?? 'Sin clave'} · {item.cadena ?? 'Sin cadena'} · {item.ciudad ?? 'Sin ciudad'}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <StatusPill label={item.estadoMaestroLabel} className="bg-slate-100 text-slate-700" />
                        {item.zona ? <StatusPill label={item.zona} className="bg-sky-50 text-sky-700" /> : null}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-2">
                        <StatusPill label={item.semaforoLabel} className={getCoberturaSemaforoTone(item.semaforo)} />
                        <StatusPill label={item.actionNeedLabel} className={getCoberturaNeedTone(item.actionNeed)} />
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{item.estadoOperativoLabel}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.motivoOperativoLabel ?? 'Sin motivo adicional'}</div>
                      {item.observaciones ? (
                        <div className="mt-2 text-xs text-slate-500">{item.observaciones}</div>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {item.employeeName ? (
                        <>
                          <div className="font-medium text-slate-900">{item.employeeName}</div>
                          <div className="mt-1 text-xs text-slate-500">DC reservada</div>
                        </>
                      ) : item.candidateName ? (
                        <>
                          <div className="font-medium text-slate-900">{item.candidateName}</div>
                          <div className="mt-1 text-xs text-violet-600">
                            Candidato en {item.candidateWorkflowStage?.replace(/_/g, ' ').toLowerCase() ?? 'proceso'}
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-500">Sin vinculacion activa</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {item.pdvPasoNombre ? (
                        <>
                          <div className="font-medium text-slate-900">{item.pdvPasoNombre}</div>
                          <div className="mt-1 text-xs text-slate-500">Ubicacion temporal</div>
                        </>
                      ) : (
                        <span className="text-slate-500">Sin PDV de paso</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <div className="font-medium text-slate-900">{formatCoberturaWaitLabel(item.diasEsperandoAcceso)}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.responsableSugerido}</div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {canManage && item.semaforo !== 'ROJO' ? (
                        <button
                          type="button"
                          className="inline-flex min-h-9 min-w-[88px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                          onClick={() => setSelectedPdvId(item.pdvId)}
                        >
                          Gestionar
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Sin accion</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedItem ? (
        <CoberturaPdvModal
          item={selectedItem}
          data={data}
          onClose={() => setSelectedPdvId(null)}
        />
      ) : null}
    </div>
  )
}

function CoberturaPdvModal({
  item,
  data,
  onClose,
}: {
  item: CoberturaBoardItem
  data: EmpleadosPanelData
  onClose: () => void
}) {
  const [state, formAction] = useActionState(
    actualizarCoberturaPdvOperativa,
    ESTADO_COBERTURA_PDV_OPERATIVA_INICIAL
  )
  const [action, setAction] = useState<CoberturaActionValue>(getCoberturaDefaultAction(item))
  const [employeeId, setEmployeeId] = useState(item.employeeId ?? item.candidateId ?? '')
  const [pdvPasoId, setPdvPasoId] = useState(item.pdvPasoId ?? '')

  const employeeOptions = data.empleados
    .filter((empleado) => empleado.puesto === 'DERMOCONSEJERO' && empleado.estatusLaboral !== 'BAJA')
    .map((empleado) => ({
      value: empleado.id,
      label: `${empleado.nombreCompleto} · ${empleado.zona ?? 'Sin zona'}`,
    }))

  const pdvPasoOptions = data.pdvs
    .filter((pdv) => pdv.id !== item.pdvId)
    .map((pdv) => ({
      value: pdv.id,
      label: [pdv.claveBtl, pdv.nombre, pdv.ciudad].filter(Boolean).join(' · '),
    }))

  const employeeRequired = ['APARTAR_PDV', 'MARCAR_PENDIENTE_ACCESO', 'ASIGNAR_PDV_PASO', 'LIBERAR_ACCESO'].includes(action)
  const pdvPasoRequired = action === 'ASIGNAR_PDV_PASO'

  return (
    <ModalPanel
      open
      onClose={onClose}
      title={`Cobertura PDV · ${item.nombre}`}
      subtitle="Actualiza la reserva, el acceso pendiente o la tienda de paso sin tocar la asignacion estructural."
      maxWidthClassName="max-w-3xl"
    >
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="pdv_id" value={item.pdvId} />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Semaforo actual</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{item.semaforoLabel}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Cobertura actual</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{item.estadoOperativoLabel}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Accion"
            name="action"
            value={action}
            onChange={(event) => setAction(event.target.value as CoberturaActionValue)}
            options={getCoberturaActionOptions(item)}
          />
          <Select
            label="Dermoconsejera reservada"
            name="empleado_reservado_id"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            options={[{ value: '', label: employeeRequired ? 'Selecciona DC' : 'Sin DC' }, ...employeeOptions]}
            required={employeeRequired}
          />
        </div>

        {pdvPasoRequired ? (
          <Select
            label="PDV de paso"
            name="pdv_paso_id"
            value={pdvPasoId}
            onChange={(event) => setPdvPasoId(event.target.value)}
            options={[{ value: '', label: 'Selecciona PDV de paso' }, ...pdvPasoOptions]}
            required
          />
        ) : (
          <input type="hidden" name="pdv_paso_id" value="" />
        )}

        <TextareaField
          label="Observaciones"
          name="observaciones"
          defaultValue={item.observaciones ?? ''}
          placeholder="Ej. acceso bloqueado por cadena, pendiente carnet, regreso programado o notas administrativas."
        />

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">Responsable sugerido</p>
          <p className="mt-1">{item.responsableSugerido}</p>
          {item.pdvPasoNombre ? <p className="mt-2">PDV de paso actual: {item.pdvPasoNombre}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton idleLabel="Guardar cobertura" pendingLabel="Guardando..." variant="primary" />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>

        {state.message ? (<p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>) : null}
      </form>
    </ModalPanel>
  )
}
function EmpleadoRow({
  empleado,
  onToggle,
}: {
  empleado: EmpleadoListadoItem
  onToggle: () => void
}) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-5 py-4">
          <div className="break-words text-[14px] font-semibold leading-5 text-slate-900">
            {empleado.nombreCompleto}
          </div>
          <div className="mt-1 truncate text-[11px] uppercase tracking-[0.16em] text-slate-400">
            {formatPuesto(empleado.puesto)}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusPill
              label={empleado.estatusLaboral}
              className={getLaboralTone(empleado.estatusLaboral)}
            />
            {empleado.idNomina && (
              <StatusPill
                label={`Nomina ${empleado.idNomina}`}
                className="bg-slate-100 text-slate-700"
              />
            )}
            {empleado.adminAccessPending && (
              <StatusPill
                label="Pendiente acceso admin"
                className="bg-violet-100 text-violet-700"
              />
            )}
          </div>
      </td>
      <td className="px-5 py-4 text-slate-600">
          <div className="truncate font-medium text-slate-900">{empleado.zona ?? 'Sin zona'}</div>
          <div className="mt-1 truncate text-xs text-slate-500">
            {empleado.supervisor ?? 'Sin supervisor'}
          </div>
          {empleado.fechaBaja && (
            <div className="mt-2 truncate text-xs text-rose-600">{formatDate(empleado.fechaBaja)}</div>
          )}
      </td>
      <td className="px-5 py-4 text-slate-600">
          <div className="truncate font-medium text-slate-900">{empleado.username ?? 'Sin acceso'}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusPill
              label={getCuentaCompactLabel(empleado.estadoCuenta)}
              className={getCuentaTone(empleado.estadoCuenta)}
            />
          </div>
      </td>
      <td className="px-5 py-4 text-slate-600">
          <StatusPill
            label={getExpedienteCompactLabel(empleado.expedienteEstado)}
            className={getExpedienteCompactTone(empleado.expedienteEstado)}
          />
      </td>
      <td className="px-5 py-4 text-slate-600">
          <StatusPill
            label={getImssCompactLabel(empleado.imssEstado)}
            className={getImssCompactTone(empleado.imssEstado)}
          />
      </td>
      <td className="px-5 py-4 text-right">
          <button
            type="button"
            className="inline-flex min-h-9 min-w-[80px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
            onClick={onToggle}
          >
            Ver
          </button>
      </td>
    </tr>
  )
}

function EmpleadoDetailModal({
  open,
  onClose,
  empleado,
  data,
  actorPuesto,
}: {
  open: boolean
  onClose: () => void
  empleado: EmpleadoListadoItem
  data: EmpleadosPanelData
  actorPuesto: Puesto
}) {
  const [tab, setTab] = useState<'personal' | 'laboral' | 'contacto' | 'documentos'>('personal')
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const canRecruit = actorPuesto === 'RECLUTAMIENTO' || actorPuesto === 'ADMINISTRADOR'
  const canManageAdminFields = actorPuesto === 'ADMINISTRADOR'
  const canCancelAlta = canRecruit && isCancelableAltaStage(empleado.workflowStage)

  return (
    <ModalPanel
      open={open}
      onClose={onClose}
      title={empleado.nombreCompleto}
      subtitle={formatPuesto(empleado.puesto)}
      maxWidthClassName="max-w-6xl"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2 border-b border-border/70 pb-4">
          <DetailTabButton active={tab === 'personal'} onClick={() => setTab('personal')}>Personal</DetailTabButton>
          <DetailTabButton active={tab === 'laboral'} onClick={() => setTab('laboral')}>Laboral</DetailTabButton>
          <DetailTabButton active={tab === 'contacto'} onClick={() => setTab('contacto')}>Contacto</DetailTabButton>
          <DetailTabButton active={tab === 'documentos'} onClick={() => setTab('documentos')}>Documentos</DetailTabButton>
        </div>

        {(canCancelAlta || empleado.workflowStage === 'ALTA_CANCELADA') && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Control de alta</p>
              <p className="mt-1 text-xs text-slate-500">
                {empleado.workflowStage === 'ALTA_CANCELADA'
                  ? `Cancelado desde ${formatWorkflowStageLabel(empleado.workflowCancelFromStage)}`
                  : 'Si la persona declino, cancela el proceso completo desde aqui.'}
              </p>
            </div>
            {empleado.workflowStage === 'ALTA_CANCELADA' ? (
              <button
                type="button"
                onClick={() => setCancelModalOpen(true)}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Ver cancelacion
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCancelModalOpen(true)}
                className="inline-flex items-center justify-center rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
              >
                Cancelar proceso completo
              </button>
            )}
          </div>
        )}

        {tab === 'personal' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailCard title="Personal" description="Identidad y datos base del expediente.">
              <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <InfoRow label="NSS" value={empleado.nss ?? 'Sin NSS'} />
                <InfoRow label="CURP" value={empleado.curp ?? 'Sin CURP'} />
                <InfoRow label="RFC" value={empleado.rfc ?? 'Sin RFC'} />
                <InfoRow label="Edad" value={empleado.edad !== null ? String(empleado.edad) : 'Sin edad'} />
                <InfoRow label="Sexo" value={empleado.sexo ?? 'Sin sexo'} />
                <InfoRow label="Estado civil" value={empleado.estadoCivil ?? 'Sin estado civil'} />
                <InfoRow label="Fecha nacimiento" value={formatDate(empleado.fechaNacimiento)} />
                <InfoRow label="Originario" value={empleado.originario ?? 'Sin origen'} />
              </div>
            </DetailCard>

            <DetailCard title="Cuenta de acceso" description="Estado digital del colaborador.">
              <div className="space-y-3 text-sm text-slate-600">
                <div className="flex flex-wrap gap-2">
                  <StatusPill label={empleado.estadoCuenta ?? 'SIN_USUARIO'} className={getCuentaTone(empleado.estadoCuenta)} />
                  {empleado.adminAccessPending ? (
                    <StatusPill label="Pendiente acceso admin" className="bg-violet-100 text-violet-700" />
                  ) : null}
                </div>
                <InfoRow label="Usuario" value={empleado.username ?? 'Sin usuario'} />
                <InfoRow label="Correo acceso" value={empleado.correoElectronico ?? 'Sin correo'} />
              </div>
            </DetailCard>
          </div>
        ) : null}

        {tab === 'contacto' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailCard title="Contacto" description="Canales de contacto y cobertura.">
              <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <InfoRow label="Telefono" value={empleado.telefono ?? 'Sin telefono'} />
                <InfoRow label="Correo" value={empleado.correoElectronico ?? 'Sin correo'} />
                <InfoRow label="Codigo postal" value={empleado.codigoPostal ?? 'Sin codigo postal'} />
                <InfoRow label="Zona" value={empleado.zona ?? 'Sin zona'} />
              </div>
            </DetailCard>

            <DetailCard title="Domicilio" description="Direccion y origen del expediente.">
              <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <InfoRow label="Domicilio" value={empleado.domicilioCompleto ?? 'Sin domicilio'} />
                <InfoRow label="Originario" value={empleado.originario ?? 'Sin origen'} />
                <InfoRow label="Supervisor" value={empleado.supervisor ?? 'Sin supervisor'} />
                <InfoRow label="Puesto" value={formatPuesto(empleado.puesto)} />
              </div>
            </DetailCard>
          </div>
        ) : null}

        {tab === 'laboral' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailCard title="Ficha laboral" description="Datos operativos y workflow.">
              <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <InfoRow label="Puesto" value={formatPuesto(empleado.puesto)} />
                <InfoRow label="Zona" value={empleado.zona ?? 'Sin zona'} />
                <InfoRow label="Supervisor" value={empleado.supervisor ?? 'Sin supervisor'} />
                <InfoRow label="Fecha alta" value={formatDate(empleado.fechaAlta)} />
                <InfoRow label="Fecha baja" value={formatDate(empleado.fechaBaja)} />
                <InfoRow label="Anios laborando" value={empleado.aniosLaborando !== null ? String(empleado.aniosLaborando) : 'Sin antiguedad'} />
                <InfoRow label="SBC diario" value={empleado.sbcDiario !== null ? formatCurrency(empleado.sbcDiario) : 'Sin SBC'} />
                <InfoRow label="Motivo baja" value={empleado.motivoBaja ?? 'Sin motivo registrado'} />
              </div>
              {empleado.motivoBaja ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                  <p className="font-semibold">Checklist de baja</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(empleado.checklistBaja).length === 0 ? (
                      <StatusPill label="Sin checklist" className="bg-white text-rose-700" />
                    ) : (
                      Object.entries(empleado.checklistBaja).map(([key, value]) => (
                        <StatusPill
                          key={key}
                          label={`${key.replace(/_/g, ' ')}: ${value ? 'OK' : 'Pendiente'}`}
                          className={value ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-rose-700'}
                        />
                      ))
                    )}
                  </div>
                </div>
              ) : null}
              {canRecruit ? <div className="mt-4"><FichaLaboralEditableForm empleado={empleado} data={data} /></div> : null}
            </DetailCard>

            <DetailCard title="Expediente" description="Estado documental y validacion.">
              {canRecruit ? (
                <ExpedienteEstadoForm empleado={empleado} />
              ) : (
                <ReadOnlyWorkflowCard
                  lines={[
                    `estado: ${empleado.expedienteEstado}`,
                    `workflow: ${empleado.workflowStage ?? 'sin etapa'}`,
                  ]}
                />
              )}
            </DetailCard>

            <DetailCard title="Flujo IMSS" description="Resumen para seguimiento de Reclutamiento.">
              <ReadOnlyWorkflowCard
                lines={[
                  `estado IMSS: ${empleado.imssEstado}`,
                  `solicitud: ${formatDate(empleado.imssFechaSolicitud)}`,
                  `alta: ${formatDate(empleado.imssFechaAlta)}`,
                  `workflow: ${empleado.workflowStage ?? 'sin etapa'}`,
                ]}
              />
            </DetailCard>

            {canManageAdminFields ? (
              <DetailCard title="Datos administrativos" description="Campos reservados para administracion.">
                <AdminEmployeeFieldsForm data={data} empleado={empleado} />
              </DetailCard>
            ) : null}

            <DetailCard title="Baja operativa" description="Control del cierre institucional.">
              {empleado.estatusLaboral === 'BAJA' ? (
                <ReadOnlyWorkflowCard
                  lines={[
                    `estatus: BAJA`,
                    `fecha efectiva: ${formatDate(empleado.fechaBaja)}`,
                    `motivo: ${empleado.motivoBaja ?? 'sin motivo registrado'}`,
                    `workflow: ${empleado.workflowStage ?? 'sin etapa'}`,
                  ]}
                />
              ) : canRecruit && !isPendingPayrollOffboarding(empleado) ? (
                <BajaEmpleadoForm empleado={empleado} />
              ) : (
                <ReadOnlyWorkflowCard
                  lines={[
                    `workflow: ${empleado.workflowStage ?? 'sin etapa'}`,
                    `motivo: ${empleado.motivoBaja ?? 'sin baja en curso'}`,
                  ]}
                />
              )}
            </DetailCard>
          </div>
        ) : null}

        {tab === 'documentos' ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <DetailCard title="Carga documental" description="Soportes del expediente y flujo.">
              <DocumentoUploadForm
                empleado={empleado}
                actorPuesto={actorPuesto}
                ocrProvider={data.ocrProvider}
              />
            </DetailCard>

            <DetailCard title="Documentos" description="Acceso firmado y evidencia organizada.">
              <DocumentosList documentos={empleado.documentos} />
            </DetailCard>
          </div>
        ) : null}
      </div>

      {cancelModalOpen ? (
        <CancelAltaModal empleado={empleado} onClose={() => setCancelModalOpen(false)} />
      ) : null}
    </ModalPanel>
  )
}

function DetailTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-[var(--module-soft-bg)] text-[var(--module-text)] shadow-[inset_0_0_0_1px_var(--module-border)]'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

function RecruitingDashboard({
  data,
  onOpen,
  onCreateCandidate,
}: {
  data: EmpleadosPanelData
  onOpen: (empleado: EmpleadoListadoItem) => void
  onCreateCandidate: () => void
}) {
  const [search, setSearch] = useState('')
  const [coordinatorFilter, setCoordinatorFilter] = useState('ALL')
  const [cadenaFilter, setCadenaFilter] = useState('ALL')
  const [ciudadFilter, setCiudadFilter] = useState('ALL')

  const pdvMap = new Map(data.pdvs.map((pdv) => [pdv.id, pdv]))
  const candidates = data.empleados
    .filter((empleado) => isRecruitingCandidate(empleado))
    .map((empleado) => {
      const pdvObjetivo = empleado.onboarding.pdvObjetivoId
        ? pdvMap.get(empleado.onboarding.pdvObjetivoId) ?? null
        : null

      return {
        empleado,
        pdvObjetivo,
        stageKey: resolveRecruitingDashboardStage(empleado),
        documentationProgress: calculateRecruitingDocumentationProgress(empleado),
        readyForAdmin: isRecruitingCandidateReadyForAdmin(empleado),
        coordinadorLabel: empleado.onboarding.coordinadorNombre ?? 'Sin coordinador',
        cadena: pdvObjetivo?.cadena ?? null,
        ciudad: pdvObjetivo?.ciudad ?? null,
      } satisfies RecruitingCandidateContext
    })
    .sort((left, right) => new Date(right.empleado.createdAt).getTime() - new Date(left.empleado.createdAt).getTime())

  const activeCandidates = candidates.filter(
    (item) => item.stageKey !== 'CONTRATADOS' && item.stageKey !== 'CANCELADOS'
  )

  const vacanciesOpen = new Set(
    activeCandidates.map((item) => item.empleado.onboarding.pdvObjetivoId ?? `sin-pdv-${item.empleado.id}`)
  ).size
  const candidatesInProcess = activeCandidates.length
  const averageLeadDays = computeRecruitingAverageLeadDays(candidates)
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const nextWeek = new Date(now)
  nextWeek.setDate(now.getDate() + 7)
  const upcomingIsdinizaciones = activeCandidates.filter((item) => {
    if (!item.empleado.onboarding.fechaIsdinizacion) {
      return false
    }
    const date = new Date(item.empleado.onboarding.fechaIsdinizacion)
    return date >= now && date <= nextWeek
  }).length

  const documentationAlerts = activeCandidates.filter(
    (item) => item.documentationProgress < 100 || item.empleado.expedienteEstado !== 'VALIDADO'
  )
  const isdinizacionAlerts = activeCandidates.filter((item) => {
    if (!item.empleado.onboarding.fechaIsdinizacion) {
      return false
    }
    const date = new Date(item.empleado.onboarding.fechaIsdinizacion)
    return date >= now && date <= tomorrow
  })
  const adminPendingAlerts = activeCandidates.filter(
    (item) => item.readyForAdmin && (item.empleado.adminAccessPending || item.empleado.workflowStage === 'PENDIENTE_ACCESO_ADMIN')
  )

  const searchNormalized = search.trim().toLocaleLowerCase('es-MX')
  const filteredCandidates = candidates.filter((item) => {
    const matchesSearch =
      searchNormalized.length === 0 ||
      [
        item.empleado.nombreCompleto,
        item.empleado.idNomina,
        item.empleado.curp,
        item.empleado.nss,
        item.empleado.onboarding.pdvObjetivoLabel,
        item.cadena,
        item.ciudad,
        item.coordinadorLabel,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('es-MX').includes(searchNormalized))

    const matchesCoordinator =
      coordinatorFilter === 'ALL' || item.empleado.onboarding.coordinadorEmpleadoId === coordinatorFilter
    const matchesCadena = cadenaFilter === 'ALL' || item.cadena === cadenaFilter
    const matchesCiudad = ciudadFilter === 'ALL' || item.ciudad === ciudadFilter

    return matchesSearch && matchesCoordinator && matchesCadena && matchesCiudad
  })

  const pipelineOrder: RecruitingDashboardStageKey[] = [
    'FILTRADOS',
    'ENTREVISTA_SELECCION',
    'GESTION_ACCESOS',
    'DOCUMENTACION',
    'TRAMITE_ALTA',
    'DEVUELTOS_NOMINA',
    'CONTRATADOS',
    'CANCELADOS',
  ]

  const cadenas = Array.from(
    new Set(candidates.map((item) => item.cadena).filter((value): value is string => Boolean(value)))
  ).sort((a, b) => a.localeCompare(b, 'es-MX'))
  const ciudades = Array.from(
    new Set(candidates.map((item) => item.ciudad).filter((value): value is string => Boolean(value)))
  ).sort((a, b) => a.localeCompare(b, 'es-MX'))

  const boardScrollRef = useRef<HTMLDivElement | null>(null)
  const boardDragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    scrollLeft: 0,
  })

  function handleBoardMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (!boardScrollRef.current) {
      return
    }

    boardDragRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      scrollLeft: boardScrollRef.current.scrollLeft,
    }
  }

  function handleBoardMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!boardDragRef.current.active || !boardScrollRef.current) {
      return
    }

    const delta = event.clientX - boardDragRef.current.startX
    if (Math.abs(delta) > 4) {
      boardDragRef.current.moved = true
    }

    boardScrollRef.current.scrollLeft = boardDragRef.current.scrollLeft - delta
  }

  function stopBoardDrag() {
    boardDragRef.current.active = false
  }

  function handleBoardClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (!boardDragRef.current.moved) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    boardDragRef.current.moved = false
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Embudo de reclutamiento</h2>
          <p className="mt-1 text-sm text-slate-500">Seguimiento visual del candidato por etapa. Cada tarjeta abre su ficha individual.</p>
        </div>
        <button
          type="button"
          onClick={onCreateCandidate}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--module-text)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.14)] transition hover:opacity-90"
        >
          Nuevo candidato
        </button>
      </div>

      <Card className="border-slate-200/90 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="grid gap-4 lg:grid-cols-[2fr,1fr,1fr,1fr]">
          <Input
            label="Buscar"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre, CURP, NSS, PDV, cadena o ciudad"
          />
          <Select
            label="Coordinador"
            value={coordinatorFilter}
            onChange={(event) => setCoordinatorFilter(event.target.value)}
            options={[
              { value: 'ALL', label: 'Todos' },
              ...data.coordinators.map((coordinator) => ({ value: coordinator.id, label: coordinator.nombreCompleto })),
            ]}
          />
          <Select
            label="Cadena"
            value={cadenaFilter}
            onChange={(event) => setCadenaFilter(event.target.value)}
            options={[{ value: 'ALL', label: 'Todas' }, ...cadenas.map((cadena) => ({ value: cadena, label: cadena }))]}
          />
          <Select
            label="Ciudad"
            value={ciudadFilter}
            onChange={(event) => setCiudadFilter(event.target.value)}
            options={[{ value: 'ALL', label: 'Todas' }, ...ciudades.map((ciudad) => ({ value: ciudad, label: ciudad }))]}
          />
        </div>
      </Card>

      <div
        ref={boardScrollRef}
        className="cursor-grab overflow-x-auto pb-2 active:cursor-grabbing"
        onMouseDown={handleBoardMouseDown}
        onMouseMove={handleBoardMouseMove}
        onMouseUp={stopBoardDrag}
        onMouseLeave={stopBoardDrag}
        onClickCapture={handleBoardClickCapture}
      >
        <div className="flex min-w-max gap-4">
          {pipelineOrder.map((stageKey) => {
            const stageMeta = getRecruitingStageMeta(stageKey)
            const stageItems = filteredCandidates.filter((item) => item.stageKey === stageKey)

            return (
              <div
                key={stageKey}
                className="flex w-[214px] shrink-0 flex-col rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_34px_rgba(15,23,42,0.08)]"
              >
                <div className="px-4 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 text-[15px] font-semibold leading-5 text-slate-950">{stageMeta.label}</p>
                    <StatusPill label={String(stageItems.length)} className={stageMeta.tone} />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <div className="group relative">
                      <span
                        tabIndex={0}
                        title={stageMeta.description}
                        aria-label={stageMeta.description}
                        className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-semibold text-slate-500 transition hover:border-slate-400 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--module-border)]"
                      >
                        i
                      </span>
                      <div className="pointer-events-none absolute right-0 top-7 z-10 hidden w-56 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] leading-4 text-slate-600 shadow-xl group-hover:block group-focus-within:block">
                        {stageMeta.description}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mx-4 mt-3 h-px bg-slate-100" />
                <div className="flex min-h-[420px] flex-1 flex-col px-3 py-3">
                  <div className="space-y-3">
                    {stageItems.map((item) => (
                      <button
                        key={item.empleado.id}
                        type="button"
                        onClick={() => onOpen(item.empleado)}
                        className="w-full rounded-[18px] border border-sky-100 bg-white px-3 py-3 text-left shadow-[0_8px_18px_rgba(14,165,233,0.08)] transition hover:border-[var(--module-border)] hover:bg-[var(--module-soft-bg)]"
                      >
                        <p className="text-xs font-semibold leading-4 text-slate-900">{item.empleado.nombreCompleto}</p>
                        <p className="mt-1 text-[11px] leading-4 text-slate-500">{item.empleado.onboarding.pdvObjetivoLabel ?? 'Sin PDV objetivo'}</p>
                        <p className="mt-1 text-[11px] leading-4 text-slate-500">Ingreso: {formatDate(item.empleado.onboarding.fechaIngresoOficial)}</p>
                      </button>
                    ))}
                    {stageItems.length === 0 ? (
                      <div className="rounded-[18px] border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-400">
                        Sin tarjetas
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-auto pt-4">
                    <div className="rounded-b-[18px] border-t border-slate-100 bg-slate-50/80 px-3 py-3 text-center text-xs text-slate-500">
                      Sin candidatos
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function RecruitingAlertCard({
  title,
  tone,
  items,
  emptyMessage,
  onSelect,
}: {
  title: string
  tone: 'amber' | 'sky' | 'emerald'
  items: Array<{ id: string; title: string; detail: string }>
  emptyMessage: string
  onSelect: (id: string) => void
}) {
  const toneClass =
    tone === 'amber'
      ? 'bg-amber-50 border-amber-200'
      : tone === 'sky'
        ? 'bg-sky-50 border-sky-200'
        : 'bg-emerald-50 border-emerald-200'

  return (
    <Card className={`space-y-4 border p-5 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        <StatusPill label={String(items.length)} className="bg-white text-slate-700" />
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className="w-full rounded-2xl border border-white/70 bg-white px-3 py-3 text-left transition hover:border-[var(--module-border)] hover:bg-[var(--module-soft-bg)]"
            >
              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}
function RecruitingInboxBoard({
  lanes,
  activeFilter,
  onFilterChange,
  onOpen,
}: {
  lanes: EmpleadosPanelData['recruitingInbox']
  activeFilter: RecruitingInboxLaneKey | 'ALL'
  onFilterChange: (value: RecruitingInboxLaneKey | 'ALL') => void
  onOpen: (item: EmployeeInboxItem) => void
}) {
  const [selectedLaneKey, setSelectedLaneKey] = useState<RecruitingInboxLaneKey | null>(
    activeFilter !== 'ALL' ? activeFilter : null
  )
  const totalItems = lanes.reduce((total, lane) => total + lane.items.length, 0)
  const selectedLane = selectedLaneKey ? lanes.find((lane) => lane.key === selectedLaneKey) ?? null : null

  function openLane(laneKey: RecruitingInboxLaneKey) {
    setSelectedLaneKey(laneKey)
    onFilterChange(laneKey)
  }

  return (
    <Card className="space-y-5 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Bandeja de Reclutamiento</h2>
          <p className="mt-1 text-sm text-slate-500">
            Altas y bajas separadas de Nomina, con devoluciones visibles por etapa.
          </p>
        </div>
        <InboxFilterButton
          active={activeFilter === 'ALL'}
          onClick={() => onFilterChange('ALL')}
          label={`Total ${totalItems}`}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {lanes.map((lane) => (
          <button
            key={lane.key}
            type="button"
            onClick={() => openLane(lane.key)}
            className="rounded-[20px] border border-slate-200 bg-white p-4 text-left transition hover:border-[var(--module-border)] hover:bg-[var(--module-soft-bg)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">{lane.label}</p>
                <p className="mt-1 text-xs text-slate-500">Abrir bandeja</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  lane.key === 'cancelados'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {lane.items.length}
              </span>
            </div>
          </button>
        ))}
      </div>

      {selectedLane ? (
        <RecruitingLaneModal
          lane={selectedLane}
          onClose={() => {
            setSelectedLaneKey(null)
            onFilterChange('ALL')
          }}
          onOpen={onOpen}
        />
      ) : null}
    </Card>
  )
}

function InboxFilterButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
        active
          ? 'bg-[var(--module-primary)] text-white'
          : 'bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  )
}

function CanvasTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? 'bg-[var(--module-primary)] text-white shadow-sm'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

function CoordinationApprovalForm({
  empleado,
  data,
}: {
  empleado: EmpleadoListadoItem
  data: EmpleadosPanelData
}) {
  const [state, formAction] = useActionState(
    aprobarCandidatoCoordinacion,
    ESTADO_EMPLEADO_INICIAL
  )

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
      <input type="hidden" name="empleado_id" value={empleado.id} />
      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label="PDV confirmado"
          name="pdv_objetivo_id"
          defaultValue={empleado.onboarding.pdvObjetivoId ?? ''}
          options={[
            { value: '', label: 'Selecciona PDV final' },
            ...data.pdvs.map((pdv) => ({
              value: pdv.id,
              label: [pdv.claveBtl, pdv.nombre].filter(Boolean).join(' - '),
            })),
          ]}
        />
        <Select
          label="Coordinador responsable"
          name="coordinador_empleado_id"
          defaultValue={empleado.onboarding.coordinadorEmpleadoId ?? ''}
          options={[
            { value: '', label: 'Asignar despues' },
            ...data.coordinators.map((coordinador) => ({
              value: coordinador.id,
              label: coordinador.nombreCompleto,
            })),
          ]}
        />
        <Input
          label="Fecha oficial de ingreso"
          name="fecha_ingreso_oficial"
          type="date"
          defaultValue={empleado.onboarding.fechaIngresoOficial ?? empleado.fechaAlta ?? ''}
        />
        <Input
          label="Fecha de ISDINIZACION"
          name="fecha_isdinizacion"
          type="date"
          defaultValue={empleado.onboarding.fechaIsdinizacion ?? ''}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton idleLabel="Aprobar y regresar a Reclutamiento" pendingLabel="Aprobando..." variant="secondary" />
        <p className="text-sm text-slate-500">
          Coordinacion confirma el PDV final y libera el candidato para que Reclutamiento complete expediente, contrato y Nomina.
        </p>
      </div>
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

function CoordinationInboxBoard({
  data,
  empleados,
  onOpen,
}: {
  data: EmpleadosPanelData
  empleados: EmpleadoListadoItem[]
  onOpen: (empleado: EmpleadoListadoItem) => void
}) {
  return (
    <Card className="space-y-5 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Canvas de Coordinacion</h2>
          <p className="mt-1 text-sm text-slate-500">
            Aqui se revisan candidatos aprobables, se confirma el PDV final y se devuelve el caso a Reclutamiento.
          </p>
        </div>
        <StatusPill label={`Pendientes ${empleados.length}`} className="bg-amber-100 text-amber-700" />
      </div>

      {empleados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
          No hay candidatos pendientes de Coordinacion en este momento.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {empleados.map((empleado) => (
            <div key={empleado.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{empleado.nombreCompleto}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                    {formatPuesto(empleado.puesto)}
                  </p>
                </div>
                <StatusPill label={formatWorkflowStageLabel(empleado.workflowStage)} className="bg-slate-100 text-slate-700" />
              </div>

              <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <InfoRow label="PDV sugerido" value={empleado.onboarding.pdvObjetivoLabel ?? 'Sin sugerencia'} />
                <InfoRow label="Zona" value={empleado.zona ?? 'Sin zona'} />
                <InfoRow label="Telefono" value={empleado.telefono ?? 'Sin telefono'} />
                <InfoRow label="Correo" value={empleado.correoElectronico ?? 'Sin correo'} />
                <InfoRow label="CURP" value={empleado.curp ?? 'Sin CURP'} />
                <InfoRow label="NSS" value={empleado.nss ?? 'Sin NSS'} />
              </div>

              <div className="mt-4 space-y-4">
                <CoordinationApprovalForm empleado={empleado} data={data} />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onOpen(empleado)}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Ver expediente completo
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
function RecruitingLaneRow({
  item,
  onOpen,
}: {
  item: EmployeeInboxItem
  onOpen: (item: EmployeeInboxItem) => void
}) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid min-w-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.2fr)_180px_180px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {item.movementType}
              </span>
              <StatusPill
                label={item.statusLabel}
                className={
                  item.stage === 'ALTA_CANCELADA'
                    ? 'bg-rose-100 text-rose-700'
                    : item.movementType === 'BAJA'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-sky-100 text-sky-700'
                }
              />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-950">{item.employeeSummary.nombreCompleto}</p>
            <p className="mt-1 text-xs text-slate-500">
              {item.employeeSummary.nss ?? item.employeeSummary.curp ?? 'Sin NSS/CURP'}
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Puesto</p>
            <p className="mt-2 text-sm text-slate-700">{formatPuesto(item.employeeSummary.puesto)}</p>
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Documentos</p>
            <p className="mt-2 text-sm text-slate-700">{item.documentsSummary}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 xl:max-w-[340px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Observacion</p>
          <p className="text-sm leading-6 text-slate-600">
            {item.lastObservation ?? 'Sin observaciones registradas.'}
          </p>
        </div>

        <div className="flex shrink-0 items-center xl:justify-end">
          <button
            type="button"
            onClick={() => onOpen(item)}
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Ver expediente
          </button>
        </div>
      </div>
    </div>
  )
}

function RecruitingLaneModal({
  lane,
  onClose,
  onOpen,
}: {
  lane: EmpleadosPanelData['recruitingInbox'][number]
  onClose: () => void
  onOpen: (item: EmployeeInboxItem) => void
}) {
  return (
    <ModalPanel
      open
      onClose={onClose}
      title={lane.label}
      subtitle={lane.description}
      maxWidthClassName="max-w-6xl"
    >
      <div className="space-y-3">
        {lane.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
            Sin tickets en esta bandeja.
          </div>
        ) : (
          lane.items.map((item) => (
            <RecruitingLaneRow
              key={item.id}
              item={item}
              onOpen={(nextItem) => {
                onClose()
                onOpen(nextItem)
              }}
            />
          ))
        )}
      </div>
    </ModalPanel>
  )
}

function CrearEmpleadoForm({ data }: { data: EmpleadosPanelData }) {
  const [state, formAction] = useActionState(crearEmpleado, ESTADO_EMPLEADO_INICIAL)
  const [draft, setDraft] = useState<CrearEmpleadoDraft>(() => createInitialEmpleadoDraft())
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrError, setOcrError] = useState<string | null>(null)
  const [ocrInfo, setOcrInfo] = useState<{
    provider: string | null
    status: string | null
    recognizedFields: number
    message: string | null
  } | null>(null)

  async function handleCurriculumSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      setOcrError(null)
      setOcrInfo(null)
      return
    }

    setOcrBusy(true)
    setOcrError(null)
    setOcrInfo(null)

    try {
      const body = new FormData()
      body.set('curriculum_pdf', file)

      const response = await fetch('/api/empleados/ocr-preview', {
        method: 'POST',
        body,
      })

      const payload = await readJsonResponseSafely(response)

      if (!response.ok || !payload.snapshot) {
        throw new Error(payload.message ?? 'No fue posible analizar el curriculum.')
      }

      setOcrInfo({
        provider: payload.ocrProvider ?? null,
        status: payload.result?.status ?? payload.snapshot.status ?? null,
        recognizedFields: payload.recognizedFields ?? 0,
        message: payload.message ?? payload.result?.confidenceSummary ?? null,
      })
      setDraft((current) => applyOcrSnapshotToDraft(current, payload.snapshot!))
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : 'No fue posible analizar el curriculum.')
    } finally {
      setOcrBusy(false)
    }
  }

  function updateDraft<K extends keyof CrearEmpleadoDraft>(key: K, value: CrearEmpleadoDraft[K]) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }))
  }

  return (
    <form action={formAction} className="space-y-4">
      {(ocrBusy || ocrError || ocrInfo) && (
        <div
          className={`rounded-2xl border px-4 py-2 text-xs ${
            ocrError
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : ocrBusy
                ? 'border-sky-200 bg-sky-50 text-sky-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {ocrBusy ? (
            <p>Gemini OCR: analizando curriculum y extrayendo los datos base del candidato...</p>
          ) : ocrError ? (
            <p>Gemini OCR: {ocrError}</p>
          ) : ocrInfo ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Gemini OCR: {ocrInfo.message ?? 'analisis completado'}</span>
              <span className="text-[11px] text-current/80">
                proveedor: <span className="font-semibold">{ocrInfo.provider ?? 'sin proveedor'}</span>
              </span>
              <span className="text-[11px] text-current/80">
                estado: <span className="font-semibold">{ocrInfo.status ?? 'sin estado'}</span>
              </span>
              <span className="text-[11px] text-current/80">
                campos: <span className="font-semibold">{ocrInfo.recognizedFields}</span>
              </span>
            </div>
          ) : null}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="space-y-4">
          <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold text-slate-950">Alta inicial desde Reclutamiento</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Aqui arranca el proceso. Solo cargas el CV, validas los datos base y propones el PDV sugerido para que Coordinacion tome el candidato.
            </p>
          </div>

          <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
            <div>
              <p className="text-sm font-semibold text-slate-950">Curriculum del candidato</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Sube solo el CV en PDF. Desde aqui arranca el candidato y se manda a Coordinacion.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-950">Curriculum / CV (PDF)</label>
              <input
                type="file"
                name="curriculum_pdf"
                accept="application/pdf"
                required
                onChange={handleCurriculumSelected}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-slate-700"
              />
              <p className="mt-2 text-xs text-slate-500">El PDF debe venir comprimido desde origen y no puede exceder 10 MB.</p>
            </div>

            <Select
              label="PDV sugerido para Coordinacion"
              name="pdv_objetivo_id"
              value={draft.pdv_objetivo_id}
              onChange={(event) => updateDraft('pdv_objetivo_id', event.target.value)}
              options={[
                { value: '', label: 'Sin PDV sugerido' },
                ...data.pdvs.map((pdv) => ({
                  value: pdv.id,
                  label: [pdv.claveBtl, pdv.nombre].filter(Boolean).join(' - '),
                })),
              ]}
            />

            <Select
              label="Posicion objetivo"
              name="puesto"
              value={draft.puesto}
              onChange={(event) => updateDraft('puesto', event.target.value)}
              options={[
                { value: 'DERMOCONSEJERO', label: 'Dermoconsejero' },
                { value: 'SUPERVISOR', label: 'Supervisor' },
                { value: 'COORDINADOR', label: 'Coordinador' },
              ]}
            />
          </div>
        </div>

        <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
          <div>
            <p className="text-sm font-semibold text-slate-950">Datos auto-extraidos por IA</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Reclutamiento solo valida o corrige los datos minimos antes de enviar el candidato a Coordinacion.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Nombre completo"
              name="nombre_completo"
              value={draft.nombre_completo}
              onChange={(event) => updateDraft('nombre_completo', normalizeUppercaseTextInput(event.target.value))}
            />
            <Input
              label="RFC (con homoclave)"
              name="rfc"
              maxLength={13}
              value={draft.rfc}
              onChange={(event) => updateDraft('rfc', event.target.value.toUpperCase())}
            />
            <Input
              label="CURP"
              name="curp"
              maxLength={18}
              value={draft.curp}
              onChange={(event) => updateDraft('curp', event.target.value.toUpperCase())}
            />
            <Input
              label="Direccion actual completa"
              name="domicilio_completo"
              value={draft.domicilio_completo}
              onChange={(event) => updateDraft('domicilio_completo', normalizeUppercaseTextInput(event.target.value))}
            />
            <Input
              label="NSS"
              name="nss"
              value={draft.nss}
              onChange={(event) => updateDraft('nss', event.target.value)}
            />
            <Input
              label="Correo"
              name="correo_electronico"
              type="email"
              value={draft.correo_electronico}
              onChange={(event) => updateDraft('correo_electronico', event.target.value.toLowerCase())}
            />
            <Input
              label="Genero"
              name="sexo"
              value={draft.sexo}
              onChange={(event) => updateDraft('sexo', normalizeUppercaseTextInput(event.target.value))}
            />
            <Input
              label="Telefono celular"
              name="telefono"
              value={draft.telefono}
              onChange={(event) => updateDraft('telefono', event.target.value)}
            />
            <Input
              label="Estado civil"
              name="estado_civil"
              value={draft.estado_civil}
              onChange={(event) => updateDraft('estado_civil', normalizeUppercaseTextInput(event.target.value))}
            />
            <Input
              label="Fecha de nacimiento"
              name="fecha_nacimiento"
              type="date"
              value={draft.fecha_nacimiento}
              onChange={(event) => updateDraft('fecha_nacimiento', event.target.value)}
            />
            <Input
              label="Edad"
              name="edad"
              value={draft.edad}
              onChange={(event) => updateDraft('edad', event.target.value)}
            />
            <Input
              label="Fecha tentativa de ingreso"
              name="fecha_alta"
              type="date"
              value={draft.fecha_alta}
              onChange={(event) => updateDraft('fecha_alta', event.target.value)}
            />
          </div>
        </div>
      </div>

      <input type="hidden" name="zona" value={draft.zona} />
      <input type="hidden" name="codigo_postal" value={draft.codigo_postal} />
      <input type="hidden" name="originario" value={draft.originario} />

      <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-sm leading-6 text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
        En esta etapa no se capturan <span className="font-semibold text-slate-900">coordinador aprobado</span>, <span className="font-semibold text-slate-900">fechas oficiales de onboarding</span>, <span className="font-semibold text-slate-900">contrato</span> ni <span className="font-semibold text-slate-900">acceso provisional</span>. Eso vive despues de la aprobacion de Coordinacion.
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton idleLabel="Crear candidato" pendingLabel="Procesando..." variant="primary" />
          <p className="text-sm text-slate-500">Al guardar, el candidato entra a la bandeja de Coordinacion para entrevista y aprobacion.</p>
        </div>
      </div>

      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}
function ExpedienteEstadoForm({ empleado }: { empleado: EmpleadoListadoItem }) {
  const [state, formAction] = useActionState(
    actualizarEstadoExpedienteEmpleado,
    ESTADO_EMPLEADO_INICIAL
  )

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="empleado_id" value={empleado.id} />
      <Select
        label="Estado expediente"
        name="expediente_estado"
        defaultValue={empleado.expedienteEstado}
        options={EXPEDIENTE_OPTIONS.map((option) => ({ value: option, label: option }))}
      />
      <TextareaField
        label="Observaciones"
        name="expediente_observaciones"
        defaultValue={empleado.expedienteObservaciones ?? ''}
        placeholder="Notas internas de validacion"
      />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton idleLabel="Actualizar expediente" pendingLabel="Guardando..." variant="secondary" />
        <p className="text-sm text-slate-500">
          Ultima validacion:{' '}
          <span className="font-semibold text-slate-900">{formatDate(empleado.expedienteValidadoEn)}</span>
        </p>
      </div>
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

function FichaLaboralEditableForm({ empleado, data }: { empleado: EmpleadoListadoItem; data: EmpleadosPanelData }) {
  const [state, formAction] = useActionState(
    actualizarFichaEmpleadoReclutamiento,
    ESTADO_EMPLEADO_INICIAL
  )

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="empleado_id" value={empleado.id} />
      <p className="text-sm font-semibold text-slate-900">Correccion de ficha por Reclutamiento</p>
      <p className="text-xs text-slate-500">
        Aqui ajustas datos personales y tambien el paquete operativo antes de enviar a Nomina o entregar a Administracion.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Input label="Nombre completo" name="nombre_completo" defaultValue={empleado.nombreCompleto} required />
        <Input label="CURP" name="curp" defaultValue={empleado.curp ?? ''} required />
        <Input label="NSS" name="nss" defaultValue={empleado.nss ?? ''} required />
        <Input label="RFC" name="rfc" defaultValue={empleado.rfc ?? ''} required />
        <Select
          label="Puesto operativo"
          name="puesto"
          defaultValue={empleado.puesto}
          options={PUESTOS_OPTIONS.map((option) => ({ value: option, label: option }))}
        />
        <Input label="Zona" name="zona" defaultValue={empleado.zona ?? ''} />
        <Input label="Telefono celular" name="telefono" defaultValue={empleado.telefono ?? ''} />
        <Input label="Correo" name="correo_electronico" defaultValue={empleado.correoElectronico ?? ''} />
        <Input label="Fecha de ingreso" name="fecha_alta" type="date" defaultValue={empleado.fechaAlta ?? ''} />
        <Input
          label="Fecha de nacimiento"
          name="fecha_nacimiento"
          type="date"
          defaultValue={empleado.fechaNacimiento ?? ''}
        />
        <Input label="Codigo postal" name="codigo_postal" defaultValue={empleado.codigoPostal ?? ''} />
        <Input label="Edad" name="edad" type="number" min="0" defaultValue={empleado.edad ?? ''} />
        <Select
          label="Sexo"
          name="sexo"
          defaultValue={empleado.sexo ?? ''}
          options={SEXO_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
        <Select
          label="Estado civil"
          name="estado_civil"
          defaultValue={empleado.estadoCivil ?? ''}
          options={ESTADO_CIVIL_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
        <Input label="Originario de" name="originario" defaultValue={empleado.originario ?? ''} />
        <Select
          label="PDV objetivo"
          name="pdv_objetivo_id"
          defaultValue={empleado.onboarding.pdvObjetivoId ?? ''}
          options={[
            { value: '', label: 'Selecciona PDV objetivo' },
            ...data.pdvs.map((pdv) => ({
              value: pdv.id,
              label: [pdv.claveBtl, pdv.nombre].filter(Boolean).join(' - '),
            })),
          ]}
        />
        <Select
          label="Coordinador"
          name="coordinador_empleado_id"
          defaultValue={empleado.onboarding.coordinadorEmpleadoId ?? ''}
          options={[
            { value: '', label: 'Selecciona coordinador' },
            ...data.coordinators.map((coordinador) => ({
              value: coordinador.id,
              label: coordinador.nombreCompleto,
            })),
          ]}
        />
        <Input
          label="Fecha oficial de ingreso"
          name="fecha_ingreso_oficial"
          type="date"
          defaultValue={empleado.onboarding.fechaIngresoOficial ?? empleado.fechaAlta ?? ''}
        />
        <Input
          label="Fecha ISDINIZACION"
          name="fecha_isdinizacion"
          type="date"
          defaultValue={empleado.onboarding.fechaIsdinizacion ?? ''}
        />
        <Select
          label="Accesos externos"
          name="accesos_externos_status"
          defaultValue={empleado.onboarding.accesosExternosStatus ?? 'PENDIENTE'}
          options={EXTERNAL_ACCESS_STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
        <Select
          label="Contrato"
          name="contrato_status"
          defaultValue={empleado.onboarding.contratoStatus ?? 'PENDIENTE'}
          options={CONTRACT_STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
        <Input
          label="Fecha firma contrato"
          name="contrato_firmado_en"
          type="date"
          defaultValue={empleado.onboarding.contratoFirmadoEn ?? ''}
        />
      </div>
      <TextareaField
        label="Domicilio completo"
        name="domicilio_completo"
        defaultValue={empleado.domicilioCompleto ?? ''}
      />
      <TextareaField
        label="Observaciones de accesos externos"
        name="accesos_externos_observaciones"
        defaultValue={empleado.onboarding.accesosExternosObservaciones ?? ''}
        placeholder="Seguimiento con Viridiana, folios o aclaraciones."
      />
      <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          name="expediente_completo_recibido"
          defaultChecked={empleado.onboarding.expedienteCompletoRecibido}
          className="h-4 w-4 rounded border-slate-300"
        />
        Expediente completo recibido y validado por Reclutamiento
      </label>
      <SubmitButton idleLabel="Guardar ficha corregida" pendingLabel="Guardando..." variant="secondary" />
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>
      )}
    </form>
  )
}

function OnboardingOperativoSummaryCard({ empleado }: { empleado: EmpleadoListadoItem }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">Paquete operativo de onboarding</p>
      <div className="mt-3 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
        <InfoRow label="PDV objetivo" value={empleado.onboarding.pdvObjetivoLabel ?? 'Sin definir'} />
        <InfoRow label="Coordinador" value={empleado.onboarding.coordinadorNombre ?? 'Sin definir'} />
        <InfoRow label="Ingreso oficial" value={formatDate(empleado.onboarding.fechaIngresoOficial)} />
        <InfoRow label="ISDINIZACION" value={formatDate(empleado.onboarding.fechaIsdinizacion)} />
        <InfoRow label="Accesos externos" value={empleado.onboarding.accesosExternosStatus ?? 'PENDIENTE'} />
        <InfoRow label="Contrato" value={empleado.onboarding.contratoStatus ?? 'PENDIENTE'} />
        <InfoRow label="Firma contrato" value={formatDate(empleado.onboarding.contratoFirmadoEn)} />
        <InfoRow
          label="Expediente completo"
          value={empleado.onboarding.expedienteCompletoRecibido ? 'SI' : 'NO'}
        />
      </div>
      {empleado.onboarding.accesosExternosObservaciones ? (
        <p className="mt-3 text-xs text-slate-500">{empleado.onboarding.accesosExternosObservaciones}</p>
      ) : null}
      {empleado.onboarding.validacionFinalReclutamientoAt ? (
        <p className="mt-2 text-xs font-medium text-emerald-700">
          Validacion final reclutamiento: {formatDate(empleado.onboarding.validacionFinalReclutamientoAt)}
        </p>
      ) : null}
    </div>
  )
}

type OnboardingChecklistItem = {
  label: string
  done: boolean
  tone: 'ok' | 'pending'
  helper?: string
}

function getWorkflowOwnerLabel(workflowStage: string | null, username: string | null, adminAccessPending: boolean) {
  if (username) {
    return 'Administracion / Operacion'
  }

  if (adminAccessPending || workflowStage === 'PENDIENTE_ACCESO_ADMIN') {
    return 'Administracion'
  }

  if (workflowStage === 'PENDIENTE_IMSS_NOMINA' || workflowStage === 'EN_FLUJO_IMSS') {
    return 'Nomina'
  }

  if (workflowStage === 'PENDIENTE_COORDINACION') {
    return 'Coordinacion'
  }

  return 'Reclutamiento'
}

function buildChecklistSectionProgress(items: OnboardingChecklistItem[]) {
  const completed = items.filter((item) => item.done).length
  return `${completed}/${items.length}`
}

function getChecklistTone(item: OnboardingChecklistItem) {
  return item.tone === 'ok'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-amber-200 bg-amber-50 text-amber-800'
}

function OnboardingChecklistCard({ empleado }: { empleado: EmpleadoListadoItem }) {
  const readyForPayroll: OnboardingChecklistItem[] = [
    {
      label: 'PDV objetivo definido',
      done: Boolean(empleado.onboarding.pdvObjetivoId),
      tone: empleado.onboarding.pdvObjetivoId ? 'ok' : 'pending',
      helper: empleado.onboarding.pdvObjetivoLabel ?? 'Falta definir el punto de venta objetivo.',
    },
    {
      label: 'Coordinador asignado',
      done: Boolean(empleado.onboarding.coordinadorEmpleadoId),
      tone: empleado.onboarding.coordinadorEmpleadoId ? 'ok' : 'pending',
      helper: empleado.onboarding.coordinadorNombre ?? 'Falta asignar coordinador responsable.',
    },
    {
      label: 'Fecha oficial de ingreso',
      done: Boolean(empleado.onboarding.fechaIngresoOficial),
      tone: empleado.onboarding.fechaIngresoOficial ? 'ok' : 'pending',
      helper: formatDate(empleado.onboarding.fechaIngresoOficial),
    },
    {
      label: 'Fecha de ISDINIZACION',
      done: Boolean(empleado.onboarding.fechaIsdinizacion),
      tone: empleado.onboarding.fechaIsdinizacion ? 'ok' : 'pending',
      helper: formatDate(empleado.onboarding.fechaIsdinizacion),
    },
  ]

  const finalValidation: OnboardingChecklistItem[] = [
    {
      label: 'Alta IMSS confirmada',
      done: empleado.imssEstado === 'ALTA_IMSS',
      tone: empleado.imssEstado === 'ALTA_IMSS' ? 'ok' : 'pending',
      helper: `Estado actual: ${empleado.imssEstado}`,
    },
    {
      label: 'Contrato firmado',
      done: empleado.onboarding.contratoStatus === 'FIRMADO',
      tone: empleado.onboarding.contratoStatus === 'FIRMADO' ? 'ok' : 'pending',
      helper:
        empleado.onboarding.contratoStatus === 'FIRMADO'
          ? `Firmado: ${formatDate(empleado.onboarding.contratoFirmadoEn)}`
          : `Estado actual: ${empleado.onboarding.contratoStatus ?? 'PENDIENTE'}`,
    },
    {
      label: 'Expediente completo validado',
      done: empleado.onboarding.expedienteCompletoRecibido,
      tone: empleado.onboarding.expedienteCompletoRecibido ? 'ok' : 'pending',
      helper: empleado.onboarding.expedienteCompletoRecibido
        ? 'Checklist documental completo.'
        : 'Falta confirmar expediente completo.',
    },
    {
      label: 'Validacion final de Reclutamiento',
      done: Boolean(empleado.onboarding.validacionFinalReclutamientoAt),
      tone: empleado.onboarding.validacionFinalReclutamientoAt ? 'ok' : 'pending',
      helper: empleado.onboarding.validacionFinalReclutamientoAt
        ? formatDate(empleado.onboarding.validacionFinalReclutamientoAt)
        : 'Pendiente entrega formal a Administracion.',
    },
  ]

  const activation: OnboardingChecklistItem[] = [
    {
      label: 'Acceso provisional creado',
      done: Boolean(empleado.username),
      tone: empleado.username ? 'ok' : 'pending',
      helper: empleado.username
        ? `${empleado.username} · ${empleado.estadoCuenta ?? 'SIN_ESTADO'}`
        : 'Pendiente de Administracion.',
    },
    {
      label: 'QR LOVE ISDIN y asignacion inicial',
      done: Boolean(empleado.username) && !empleado.adminAccessPending,
      tone: Boolean(empleado.username) && !empleado.adminAccessPending ? 'ok' : 'pending',
      helper:
        Boolean(empleado.username) && !empleado.adminAccessPending
          ? 'El expediente ya puede pasar a configuracion operativa.'
          : 'Se completa en Administracion despues de crear el acceso.',
    },
  ]

  const sections = [
    {
      title: 'Listo para Nomina',
      description: 'Datos que Reclutamiento debe cerrar antes de enviar el alta.',
      progress: buildChecklistSectionProgress(readyForPayroll),
      items: readyForPayroll,
    },
    {
      title: 'Validacion final',
      description: 'Cierre que devuelve Nomina y confirma Reclutamiento antes del acceso.',
      progress: buildChecklistSectionProgress(finalValidation),
      items: finalValidation,
    },
    {
      title: 'Entrega a Administracion',
      description: 'Activacion de herramientas y salida a operacion.',
      progress: buildChecklistSectionProgress(activation),
      items: activation,
    },
  ]

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Responsable actual</p>
          <p className="text-sm text-slate-600">
            {getWorkflowOwnerLabel(empleado.workflowStage, empleado.username, empleado.adminAccessPending)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill
            label={`Workflow: ${formatWorkflowStageLabel(empleado.workflowStage)}`}
            className="bg-slate-900 text-white"
          />
          <StatusPill
            label={empleado.adminAccessPending ? 'Pendiente Administracion' : 'Sin handoff activo'}
            className={
              empleado.adminAccessPending ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-700'
            }
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {sections.map((section) => (
          <div key={section.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{section.title}</p>
                <p className="mt-1 text-xs text-slate-500">{section.description}</p>
              </div>
              <StatusPill label={section.progress} className="bg-white text-slate-700" />
            </div>

            <div className="mt-4 space-y-3">
              {section.items.map((item) => (
                <div key={item.label} className={`rounded-2xl border px-3 py-3 ${getChecklistTone(item)}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <StatusPill
                      label={item.done ? 'OK' : 'Pendiente'}
                      className={item.done ? 'bg-white text-emerald-700' : 'bg-white text-amber-700'}
                    />
                  </div>
                  {item.helper ? <p className="mt-2 text-xs">{item.helper}</p> : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
function OnboardingWorkflowActions({ empleado }: { empleado: EmpleadoListadoItem }) {
  if (empleado.workflowStage === 'PENDIENTE_VALIDACION_FINAL') {
    return <ValidacionFinalRecruitingForm empleado={empleado} />
  }

  if (
    empleado.workflowStage === 'SELECCION_APROBADA' ||
    empleado.workflowStage === 'RECLUTAMIENTO_CORRECCION_ALTA'
  ) {
    return <EnviarAltaNominaForm empleado={empleado} />
  }

  return (
    <ReadOnlyWorkflowCard
      lines={[
        `workflow: ${formatWorkflowStageLabel(empleado.workflowStage)}`,
        'No hay una accion de handoff manual pendiente en esta etapa.',
      ]}
    />
  )
}
function EnviarAltaNominaForm({ empleado }: { empleado: EmpleadoListadoItem }) {
  const [state, formAction] = useActionState(
    enviarAltaANominaDesdeReclutamiento,
    ESTADO_EMPLEADO_INICIAL
  )

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50 p-4">
      <input type="hidden" name="empleado_id" value={empleado.id} />
      <p className="text-sm font-semibold text-sky-900">Enviar a Nomina</p>
      <p className="text-xs text-sky-700">
        Usa esta accion cuando ya esten definidos el PDV objetivo, coordinador, fecha de ingreso e ISDINIZACION.
      </p>
      <SubmitButton idleLabel="Enviar a Nomina" pendingLabel="Enviando..." variant="secondary" />
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>
      )}
    </form>
  )
}

function ValidacionFinalRecruitingForm({ empleado }: { empleado: EmpleadoListadoItem }) {
  const [state, formAction] = useActionState(
    validarCierreOnboardingReclutamiento,
    ESTADO_EMPLEADO_INICIAL
  )

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <input type="hidden" name="empleado_id" value={empleado.id} />
      <input type="hidden" name="pdv_objetivo_id" value={empleado.onboarding.pdvObjetivoId ?? ''} />
      <input type="hidden" name="coordinador_empleado_id" value={empleado.onboarding.coordinadorEmpleadoId ?? ''} />
      <input type="hidden" name="fecha_ingreso_oficial" value={empleado.onboarding.fechaIngresoOficial ?? ''} />
      <input type="hidden" name="fecha_isdinizacion" value={empleado.onboarding.fechaIsdinizacion ?? ''} />
      <input type="hidden" name="accesos_externos_status" value={empleado.onboarding.accesosExternosStatus ?? 'PENDIENTE'} />
      <input type="hidden" name="accesos_externos_observaciones" value={empleado.onboarding.accesosExternosObservaciones ?? ''} />
      <input type="hidden" name="contrato_status" value={empleado.onboarding.contratoStatus ?? 'PENDIENTE'} />
      <input type="hidden" name="contrato_firmado_en" value={empleado.onboarding.contratoFirmadoEn ?? ''} />
      {empleado.onboarding.expedienteCompletoRecibido ? (
        <input type="hidden" name="expediente_completo_recibido" value="on" />
      ) : null}
      <p className="text-sm font-semibold text-emerald-900">Validacion final de Reclutamiento</p>
      <p className="text-xs text-emerald-700">
        Confirmas que ya existe alta IMSS, contrato firmado y expediente completo. Despues de esto entra Administracion.
      </p>
      <SubmitButton idleLabel="Entregar a Administracion" pendingLabel="Entregando..." variant="secondary" />
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>
      )}
    </form>
  )
}
export function ImssEstadoForm({ empleado }: { empleado: EmpleadoListadoItem }) {
  const [state, formAction] = useActionState(actualizarEstadoImssEmpleado, ESTADO_EMPLEADO_INICIAL)
  const [rejectState, rejectAction] = useActionState(
    rechazarAltaImssEmpleadoNomina,
    ESTADO_EMPLEADO_INICIAL
  )

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="empleado_id" value={empleado.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Estado IMSS"
            name="imss_estado"
            defaultValue={empleado.imssEstado}
            options={IMSS_OPTIONS.map((option) => ({ value: option, label: option }))}
          />
          <Input
            label="Sueldo base mensual"
            name="sueldo_base_mensual"
            type="number"
            min="0"
            step="0.01"
            defaultValue={empleado.sueldoBaseMensual ?? ''}
          />
          <Input
            label="SBC diario"
            name="sbc_diario"
            type="number"
            min="0"
            step="0.01"
            defaultValue={empleado.sbcDiario ?? ''}
          />
          <Input
            label="Fecha solicitud"
            name="imss_fecha_solicitud"
            type="date"
            defaultValue={empleado.imssFechaSolicitud ?? ''}
          />
          <Input
            label="Fecha alta IMSS"
            name="imss_fecha_alta"
            type="date"
            defaultValue={empleado.imssFechaAlta ?? ''}
          />
        </div>
        <TextareaField
          label="Observaciones IMSS"
          name="imss_observaciones"
          defaultValue={empleado.imssObservaciones ?? ''}
          placeholder="Incidencias, folios o notas internas"
        />
        <SubmitButton idleLabel="Actualizar IMSS" pendingLabel="Guardando..." variant="secondary" />
        {state.message && (
          <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
            {state.message}
          </p>
        )}
      </form>

      <form action={rejectAction} className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <input type="hidden" name="empleado_id" value={empleado.id} />
        <p className="text-sm font-semibold text-rose-900">Rechazar solicitud de alta</p>
        <TextareaField
          label="Motivo del rechazo"
          name="motivo_rechazo_nomina"
          placeholder="Explica a Reclutamiento que dato o documento debe corregirse."
          required
        />
        <SubmitButton idleLabel="Rechazar y regresar a Reclutamiento" pendingLabel="Rechazando..." variant="danger" />
        {rejectState.message && (
          <p className={`text-sm ${rejectState.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
            {rejectState.message}
          </p>
        )}
      </form>
    </div>
  )
}

export function CancelarAltaForm({ empleado }: { empleado: EmpleadoListadoItem }) {
  const [state, formAction] = useActionState(cancelarProcesoAltaEmpleado, ESTADO_EMPLEADO_INICIAL)

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4"
      onSubmit={(event) => {
        if (!window.confirm(`Cancelar por completo el proceso de alta de ${empleado.nombreCompleto}?`)) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="empleado_id" value={empleado.id} />
      <p className="text-sm font-semibold text-rose-900">Cancelar proceso completo</p>
      <p className="text-xs text-rose-700">
        Usa esta accion si la persona declino la oferta o el alta ya no debe continuar.
      </p>
      <TextareaField
        label="Motivo de cancelacion"
        name="motivo_cancelacion_alta"
        placeholder="Ej. declino la oferta, no entrego documentos o proceso detenido por cliente."
        required
      />
      <SubmitButton
        idleLabel="Cancelar y mover a Cancelados"
        pendingLabel="Cancelando..."
        variant="danger"
      />
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

function ReactivarAltaForm({ empleado }: { empleado: EmpleadoListadoItem }) {
  const [state, formAction] = useActionState(reactivarProcesoAltaEmpleado, ESTADO_EMPLEADO_INICIAL)

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
      onSubmit={(event) => {
        if (!window.confirm(`Regresar ${empleado.nombreCompleto} al flujo activo de alta?`)) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="empleado_id" value={empleado.id} />
      <p className="text-sm font-semibold text-emerald-900">Regresar proceso de alta</p>
      <p className="text-xs text-emerald-700">
        El expediente volvera a la etapa desde la que se cancelo, manteniendo la trazabilidad de la cancelacion.
      </p>
      <SubmitButton
        idleLabel="Regresar a flujo activo"
        pendingLabel="Regresando..."
        variant="secondary"
      />
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

function CancelAltaModal({
  empleado,
  onClose,
}: {
  empleado: EmpleadoListadoItem
  onClose: () => void
}) {
  return (
    <ModalPanel
      open
      onClose={onClose}
      title="Cancelar proceso de alta"
      subtitle={empleado.nombreCompleto}
      maxWidthClassName="max-w-2xl"
    >
      {empleado.workflowStage === 'ALTA_CANCELADA' ? (
        <div className="space-y-4">
          <ReadOnlyWorkflowCard
            lines={[
              `estado: ${formatWorkflowStageLabel(empleado.workflowStage)}`,
              `motivo: ${empleado.workflowCancelReason ?? 'sin motivo'}`,
              `salida desde: ${formatWorkflowStageLabel(empleado.workflowCancelFromStage)}`,
              `fecha: ${formatDate(empleado.workflowCancelAt)}`,
            ]}
          />
          <ReactivarAltaForm empleado={empleado} />
        </div>
      ) : (
        <CancelarAltaForm empleado={empleado} />
      )}
    </ModalPanel>
  )
}

function AdminEmployeeFieldsForm({
  empleado,
  data,
}: {
  empleado: EmpleadoListadoItem
  data: EmpleadosPanelData
}) {
  const [state, formAction] = useActionState(
    actualizarDatosAdministrativosEmpleado,
    ESTADO_EMPLEADO_INICIAL
  )

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="empleado_id" value={empleado.id} />
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="ID nomina"
          name="id_nomina"
          defaultValue={empleado.idNomina ?? ''}
          placeholder="Definido por Administracion"
        />
        <Select
          label="Supervisor"
          name="supervisor_empleado_id"
          defaultValue={empleado.supervisorEmpleadoId ?? ''}
          options={[
            { value: '', label: 'Sin supervisor' },
            ...data.supervisors.map((supervisor) => ({
              value: supervisor.id,
              label: supervisor.nombreCompleto,
            })),
          ]}
        />
      </div>
      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
        <p>
          El username provisional ya no se define en Reclutamiento ni en Nomina. Cuando este
          expediente ya tenga validacion final de Reclutamiento, Administracion debe crear el acceso desde{' '}
          <span className="font-semibold">Usuarios</span>.
        </p>
      </div>
      <SubmitButton
        idleLabel="Guardar datos administrativos"
        pendingLabel="Guardando..."
        variant="secondary"
      />
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

export function ReadOnlyWorkflowCard({ lines }: { lines: string[] }) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  )
}

export function DocumentoUploadForm({
  empleado,
  actorPuesto,
  ocrProvider,
}: {
  empleado: EmpleadoListadoItem
  actorPuesto: Puesto
  ocrProvider?: string | null
}) {
  const [state, formAction] = useActionState(subirDocumentoEmpleado, ESTADO_EMPLEADO_INICIAL)
  const isPayroll = actorPuesto === 'NOMINA'
  const isRecruitment = actorPuesto === 'RECLUTAMIENTO' || actorPuesto === 'ADMINISTRADOR'
  const availableCategories = isPayroll ? ['IMSS', 'BAJA'] : ['EXPEDIENTE', 'BAJA']
  const defaultCategory = isPayroll ? 'IMSS' : 'EXPEDIENTE'
  const [selectedCategory, setSelectedCategory] = useState<'EXPEDIENTE' | 'IMSS' | 'BAJA'>(
    defaultCategory
  )
  const availableTypes =
    isPayroll
      ? selectedCategory === 'BAJA'
        ? [{ value: 'BAJA', label: 'Comprobante baja IMSS' }]
        : [{ value: 'ALTA_IMSS', label: 'Comprobante alta IMSS' }]
      : selectedCategory === 'BAJA'
        ? [{ value: 'BAJA', label: 'Expediente de baja' }]
        : [
            { value: 'OTRO', label: 'Expediente / soporte general' },
            { value: 'INE', label: 'Credencial oficial' },
            { value: 'RFC', label: 'Constancia SAT' },
          ]
  const [selectedType, setSelectedType] = useState<string>(availableTypes[0]?.value ?? 'OTRO')
  const acceptedMimeTypes = isPayroll
    ? 'application/pdf'
    : 'image/jpeg,image/png,image/webp,application/pdf'

  const [isUploadingR2, setIsUploadingR2] = useState(false)

  const handleInterceptedSubmit = async (formData: FormData) => {
    const archivo = formData.get('archivo') as File | null
    if (archivo && archivo.size > 0) {
      setIsUploadingR2(true)
      try {
        await injectDirectR2Upload(formData, archivo, {
          modulo: 'reclutamiento',
          removeFieldName: 'archivo',
        })
      } catch (err) {
        console.error('Error fallback a R2', err)
      } finally {
        setIsUploadingR2(false)
      }
    }
    startTransition(() => {
      formAction(formData)
    })
  }

  return (
    <form action={handleInterceptedSubmit} className="space-y-4">
      <input type="hidden" name="empleado_id" value={empleado.id} />
      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label="Categoria"
          name="categoria"
          value={selectedCategory}
          onChange={(event) => {
            const nextCategory = event.target.value as 'EXPEDIENTE' | 'IMSS' | 'BAJA'
            setSelectedCategory(nextCategory)
            const nextType =
              isPayroll
                ? nextCategory === 'BAJA'
                  ? 'BAJA'
                  : 'ALTA_IMSS'
                : nextCategory === 'BAJA'
                  ? 'BAJA'
                  : 'OTRO'
            setSelectedType(nextType)
          }}
          options={availableCategories.map((option) => ({ value: option, label: option }))}
        />
        <Select
          label="Tipo documento"
          name="tipo_documento"
          value={selectedType}
          onChange={(event) => setSelectedType(event.target.value)}
          options={availableTypes}
        />
        <div className="w-full md:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-foreground">Archivo</label>
          <ClientImageFileInput
            useNativeInput
            name="archivo"
            accept={acceptedMimeTypes}
            className="w-full overflow-hidden rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground file:mr-3 file:max-w-full file:truncate file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
          />
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        {isPayroll ? (
          <p>
            Nomina carga comprobantes institucionales en PDF, tanto de{' '}
            <span className="font-semibold text-slate-900">alta IMSS</span> como de{' '}
            <span className="font-semibold text-slate-900">baja IMSS</span>. Si cierra un alta en{' '}
            <span className="font-semibold text-slate-900">ALTA_IMSS</span> y no existe usuario
            vinculado, el sistema avisara a Administracion cuando Reclutamiento complete la validacion final del expediente.
          </p>
        ) : isRecruitment ? (
          <p>
            Reclutamiento solo adjunta soportes y verifica datos ya cargados desde el CV, como expediente, credencial oficial o constancia SAT. No carga comprobantes IMSS ni relanza OCR sobre estos documentos. OCR provider actual:{' '}
            <span className="font-semibold text-slate-900">{ocrProvider ?? 'sin configurar'}</span>.
          </p>
        ) : (
          <p>
            Dedupe activo por SHA-256. Los PDFs deben venir comprimidos desde origen y no pueden
            exceder 10 MB. OCR provider actual:{' '}
            <span className="font-semibold text-slate-900">{ocrProvider ?? 'sin configurar'}</span>.
          </p>
        )}
      </div>
      <SubmitButton 
        idleLabel={isUploadingR2 ? "Saltando hacia Bodega R2..." : "Subir documento"} 
        pendingLabel={isUploadingR2 ? "Saltando hacia Bodega R2..." : "Subiendo..."} 
        variant="outline" 
      />
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
          {state.duplicatedUpload ? ' Referencia reutilizada.' : ''}
        </p>
      )}
    </form>
  )
}

function BajaEmpleadoForm({ empleado }: { empleado: EmpleadoListadoItem }) {
  const [state, formAction] = useActionState(registrarBajaEmpleado, ESTADO_EMPLEADO_INICIAL)

  if (empleado.estatusLaboral === 'BAJA') {
    return (
      <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <p className="font-semibold">Baja ya registrada</p>
        <p>Fecha efectiva: {formatDate(empleado.fechaBaja)}</p>
        <p>Motivo: {empleado.motivoBaja ?? 'Sin motivo registrado'}</p>
      </div>
    )
  }

  if (isPendingPayrollOffboarding(empleado)) {
    return (
      <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Baja enviada a Nomina</p>
        <p>Fecha efectiva propuesta: {formatDate(empleado.fechaBaja)}</p>
        <p>Motivo: {empleado.motivoBaja ?? 'Sin motivo registrado'}</p>
        <p>
          El expediente de baja ya fue cargado por Reclutamiento. Nomina debe revisar los soportes,
          registrar la baja IMSS y subir el comprobante institucional para cerrar el proceso.
        </p>
      </div>
    )
  }

  return (
    <form
      action={formAction}
      className="space-y-4"
      onSubmit={(event) => {
        if (!window.confirm(`Enviar expediente de baja de ${empleado.nombreCompleto} a Nomina?`)) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="empleado_id" value={empleado.id} />
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Fecha baja" name="fecha_baja" type="date" required />
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">Checklist minimo</p>
          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" name="check_activos_recuperados" className="h-4 w-4 rounded border-slate-300" />
            Activos recuperados
          </label>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" name="check_nomina_notificada" className="h-4 w-4 rounded border-slate-300" />
            Nomina notificada
          </label>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" name="check_logistica_notificada" className="h-4 w-4 rounded border-slate-300" />
            Logistica notificada
          </label>
        </div>
      </div>
      <TextareaField
        label="Motivo baja"
        name="motivo_baja"
        required
        placeholder="Motivo operativo o administrativo"
      />
      {empleado.workflowStage === 'RECLUTAMIENTO_CORRECCION_BAJA' && empleado.imssObservaciones && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-semibold">Baja observada por Nomina</p>
          <p className="mt-1">{empleado.imssObservaciones}</p>
        </div>
      )}
      <div className="w-full">
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          Expediente de baja (PDF)
        </label>
        <input
          type="file"
          name="expediente_baja_pdf"
          accept="application/pdf"
          required
          className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
        />
        <p className="mt-2 text-xs text-slate-500">
          Adjunta en un solo PDF la carta de renuncia, finiquito y cualquier soporte requerido
          para que Nomina cierre la baja institucional.
        </p>
      </div>
      <SubmitButton idleLabel="Enviar baja a Nomina" pendingLabel="Enviando..." variant="danger" />
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}

export function CerrarBajaEmpleadoNominaForm({ empleado }: { empleado: EmpleadoListadoItem }) {
  const [state, formAction] = useActionState(cerrarBajaEmpleadoNomina, ESTADO_EMPLEADO_INICIAL)
  const [rejectState, rejectAction] = useActionState(
    rechazarBajaEmpleadoNomina,
    ESTADO_EMPLEADO_INICIAL
  )

  return (
    <div className="space-y-4">
      <form
        action={formAction}
        className="space-y-4"
        onSubmit={(event) => {
          if (!window.confirm(`Cerrar baja institucional de ${empleado.nombreCompleto}?`)) {
            event.preventDefault()
          }
        }}
      >
        <input type="hidden" name="empleado_id" value={empleado.id} />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Expediente pendiente de baja IMSS</p>
          <p className="mt-2">
            Reclutamiento ya capturo la solicitud de baja y subio el expediente documental. Nomina
            debe subir aqui el comprobante institucional de baja IMSS para convertir el estatus final
            del empleado a <span className="font-semibold">BAJA</span>.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Fecha efectiva de baja"
            name="fecha_baja"
            type="date"
            defaultValue={empleado.fechaBaja ?? ''}
            required
          />
          <div className="w-full">
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Comprobante baja IMSS (PDF)
            </label>
            <input
              type="file"
              name="baja_imss_pdf"
              accept="application/pdf"
              required
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
            />
          </div>
        </div>
        <TextareaField
          label="Observaciones de Nomina"
          name="baja_observaciones_nomina"
          defaultValue={empleado.imssObservaciones ?? ''}
          placeholder="Folio, incidencia o notas del cierre institucional"
        />
        <SubmitButton
          idleLabel="Cerrar baja institucional"
          pendingLabel="Cerrando..."
          variant="danger"
        />
        {state.message && (
          <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
            {state.message}
          </p>
        )}
      </form>

      <form action={rejectAction} className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <input type="hidden" name="empleado_id" value={empleado.id} />
        <p className="text-sm font-semibold text-rose-900">Rechazar solicitud de baja</p>
        <TextareaField
          label="Motivo del rechazo"
          name="motivo_rechazo_nomina"
          placeholder="Explica a Reclutamiento que soporte o dato debe corregirse."
          required
        />
        <SubmitButton idleLabel="Rechazar y regresar a Reclutamiento" pendingLabel="Rechazando..." variant="danger" />
        {rejectState.message && (
          <p className={`text-sm ${rejectState.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
            {rejectState.message}
          </p>
        )}
      </form>
    </div>
  )
}

export function DocumentosList({ documentos }: { documentos: DocumentoExpedienteItem[] }) {
  if (documentos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
        Este expediente todavia no tiene documentos cargados.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {documentos.map((documento) => (
        <div
          key={documento.id}
          className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill label={documento.categoria} className="bg-slate-100 text-slate-700" />
                <StatusPill
                  label={formatTipoDocumentoLabel(documento.tipoDocumento, documento.sourceDocument)}
                  className="bg-sky-100 text-sky-700"
                />
                <StatusPill label={documento.estadoDocumento} className="bg-emerald-100 text-emerald-700" />
                <StatusPill
                  label={`OCR ${documento.ocrResultado.status ?? 'sin estado'}`}
                  className={getOcrTone(documento.ocrResultado.status)}
                />
                {documento.signedUrl ? (
                  <a
                    href={documento.signedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Abrir documento
                  </a>
                ) : (
                  <StatusPill label="Preview no disponible" className="bg-amber-100 text-amber-700" />
                )}
              </div>
              <p className="mt-3 font-medium text-slate-900">{documento.nombreArchivo}</p>
              <div className="mt-2 grid gap-1 text-xs text-slate-500">
                <span>subido: {formatDate(documento.createdAt)}</span>
                <span>tamano: {formatBytes(documento.tamanoBytes)}</span>
                <span>mime: {documento.mimeType ?? 'sin mime type'}</span>
                <span>sha256: {documento.sha256 ?? 'sin hash'}</span>
                <span>ocr provider: {documento.ocrProvider ?? 'sin proveedor'}</span>
                <span>modelo: {documento.ocrResultado.model ?? 'sin modelo'}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TextareaField(
  {
    label,
    name,
    defaultValue,
    value,
    onChange,
    placeholder,
    required,
  }: {
    label: string
    name: string
    defaultValue?: string
    value?: string
    onChange?: TextareaHTMLAttributes<HTMLTextAreaElement>['onChange']
    placeholder?: string
    required?: boolean
  }
) {
  const textAreaId = `${name}-field`

  return (
    <div className="w-full">
      <label htmlFor={textAreaId} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      <textarea
        id={textAreaId}
        name={name}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        rows={4}
        className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-foreground-muted transition-all duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent-500"
      />
    </div>
  )
}

export function DetailCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  )
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  )
}

function SubmitButton({
  idleLabel,
  pendingLabel,
  variant,
}: {
  idleLabel: string
  pendingLabel: string
  variant: 'primary' | 'secondary' | 'outline' | 'danger'
}) {
  const { pending } = useFormStatus()

  const className =
    variant === 'primary'
      ? 'bg-slate-950 text-white hover:bg-slate-800'
      : variant === 'secondary'
        ? 'bg-sky-600 text-white hover:bg-sky-500'
        : variant === 'danger'
          ? 'bg-rose-600 text-white hover:bg-rose-500'
          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  )
}

function MetricCard({
  label,
  value,
  accentClass = '',
  emphasized = false,
  tinted = false,
}: {
  label: string
  value: string
  accentClass?: string
  emphasized?: boolean
  tinted?: boolean
}) {
  const tone =
    accentClass.includes('emerald')
      ? 'emerald'
      : accentClass.includes('sky')
        ? 'sky'
        : accentClass.includes('amber')
          ? 'amber'
          : accentClass.includes('rose')
            ? 'rose'
            : 'module'

  return (
    <SharedMetricCard
      label={label}
      value={value}
      tone={tone}
      className={emphasized ? 'min-h-[118px]' : tinted ? 'min-h-[102px]' : undefined}
      labelClassName={
        emphasized
          ? 'max-w-[16rem] text-[15px] font-medium leading-6 text-slate-700'
          : tinted
            ? 'max-w-[16rem] text-[14px] font-medium leading-5 text-slate-700'
            : 'max-w-[16rem] text-sm text-slate-500'
      }
      valueClassName={
        emphasized ? 'text-[40px] leading-none' : tinted ? 'text-[32px] leading-none' : 'text-3xl'
      }
    />
  )
}

export function StatusPill({ label, className }: { label: ReactNode; className: string }) {
  return (
    <span className={`inline-flex shrink-0 self-start rounded-full px-3 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}
