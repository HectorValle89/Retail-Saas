import {
  PDF_COMPRESSION_PROVIDER_CONFIG_KEY,
  PDF_COMPRESSION_PROVIDER_OPTIONS,
  PDF_COMPRESSION_STIRLING_BASE_URL_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_FAST_WEB_VIEW_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_IMAGE_DPI_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_IMAGE_QUALITY_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_OPTIMIZE_LEVEL_CONFIG_KEY,
} from '@/lib/files/pdfCompressionConfig'

export type EditableConfigKind = 'BOOLEAN' | 'NUMBER' | 'TEXT'

export interface EditableConfigDefinition {
  key: string
  label: string
  description: string
  module: string
  kind: EditableConfigKind
  defaultValue: boolean | number | string
  min?: number
  max?: number
  step?: number
}

export interface TurnoCatalogoItem {
  nomenclatura: string
  turno: string | null
  horario: string | null
  horaEntrada: string | null
  horaSalida: string | null
}

export const TURNOS_CONFIG_KEY = 'asistencias.san_pablo.catalogo_turnos'
export const OCR_PROVIDER_CONFIG_KEY = 'integraciones.ocr.preferred_provider'
export const OCR_MODEL_CONFIG_KEY = 'integraciones.ocr.preferred_model'
export const BIOMETRY_PROVIDER_CONFIG_KEY = 'integraciones.biometria.preferred_provider'
export const MATERIALES_STOCK_BAJO_KEY = 'materiales.stock_bajo_umbral'
export const LOVE_DAILY_QUOTA_CONFIG_KEY = 'love_isdin.cuota_diaria_default'
export {
  PDF_COMPRESSION_PROVIDER_CONFIG_KEY,
  PDF_COMPRESSION_PROVIDER_OPTIONS,
  PDF_COMPRESSION_STIRLING_BASE_URL_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_FAST_WEB_VIEW_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_IMAGE_DPI_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_IMAGE_QUALITY_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_OPTIMIZE_LEVEL_CONFIG_KEY,
}

export const OCR_PROVIDER_OPTIONS = [
  { value: 'disabled', label: 'Deshabilitado' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'codex', label: 'Codex' },
  { value: 'antigravity', label: 'Antigravity' },
] as const

export const GLOBAL_PARAMETER_DEFINITIONS: EditableConfigDefinition[] = [
  {
    key: BIOMETRY_PROVIDER_CONFIG_KEY,
    label: 'Proveedor biométrico',
    description: 'Motor usado para validar selfie de check-in contra la referencia del empleado.',
    module: 'asistencias',
    kind: 'TEXT',
    defaultValue: 'local-sharp',
  },
  {
    key: 'geocerca.radio_default_metros',
    label: 'Radio geocerca default (m)',
    description: 'Radio aplicado por defecto al crear o corregir geocercas de PDV.',
    module: 'asistencias',
    kind: 'NUMBER',
    defaultValue: 150,
    min: 50,
    max: 300,
    step: 1,
  },
  {
    key: 'geocerca.fuera_permitida_con_justificacion',
    label: 'Permitir fuera de geocerca con justificacion',
    description: 'Define si un check-in fuera de radio puede continuar cuando existe justificacion.',
    module: 'asistencias',
    kind: 'BOOLEAN',
    defaultValue: true,
  },
  {
    key: 'biometria.umbral_similitud',
    label: 'Umbral biometrico',
    description: 'Score minimo esperado para aceptar una selfie contra referencia del empleado.',
    module: 'asistencias',
    kind: 'NUMBER',
    defaultValue: 0.82,
    min: 0.5,
    max: 0.99,
    step: 0.01,
  },
  {
    key: 'asistencias.tolerancia_checkin_minutos',
    label: 'Tolerancia check-in (min)',
    description: 'Minutos maximos despues de la hora esperada antes de alertar ausencia o retardo.',
    module: 'asistencias',
    kind: 'NUMBER',
    defaultValue: 15,
    min: 0,
    max: 240,
    step: 1,
  },
  {
    key: 'auth.invalidacion_sesion_rol_minutos',
    label: 'Invalidacion de sesion por rol (min)',
    description: 'Tiempo maximo para refrescar claims cuando cambia puesto o contexto operativo.',
    module: 'auth',
    kind: 'NUMBER',
    defaultValue: 5,
    min: 1,
    max: 60,
    step: 1,
  },
  {
    key: MATERIALES_STOCK_BAJO_KEY,
    label: 'Umbral de stock bajo de materiales',
    description: 'Minimo de materiales operativos pendientes por zona antes de alertar riesgo de abasto.',
    module: 'materiales',
    kind: 'NUMBER',
    defaultValue: 2,
    min: 0,
    max: 50,
    step: 1,
  },
  {
    key: LOVE_DAILY_QUOTA_CONFIG_KEY,
    label: 'Cuota diaria LOVE',
    description: 'Meta diaria default de afiliaciones LOVE por dermoconsejera cuando no existe un override por periodo.',
    module: 'love-isdin',
    kind: 'NUMBER',
    defaultValue: 3,
    min: 0,
    max: 20,
    step: 1,
  },
]

export const RETENTION_PARAMETER_DEFINITIONS: EditableConfigDefinition[] = [
  {
    key: 'audit.retencion.operacion_dias',
    label: 'Auditoria operativa (dias)',
    description: 'Retencion minima de eventos operativos del audit_log, incluyendo asistencias, ventas y gastos.',
    module: 'auditoria',
    kind: 'NUMBER',
    defaultValue: 730,
    min: 365,
    max: 3650,
    step: 1,
  },
  {
    key: 'audit.retencion.configuracion_dias',
    label: 'Auditoria de configuracion (dias)',
    description: 'Retencion minima de cambios administrativos y de catalogos en la bitacora.',
    module: 'auditoria',
    kind: 'NUMBER',
    defaultValue: 730,
    min: 365,
    max: 3650,
    step: 1,
  },
  {
    key: 'audit.retencion.seguridad_dias',
    label: 'Auditoria de seguridad (dias)',
    description: 'Retencion minima de eventos de seguridad, accesos y anomalias de integridad.',
    module: 'auditoria',
    kind: 'NUMBER',
    defaultValue: 730,
    min: 365,
    max: 3650,
    step: 1,
  },
  {
    key: 'archivos.retencion.expediente_dias',
    label: 'Expediente laboral (dias)',
    description: 'Minimo de dias para conservar documentos de expediente en storage.',
    module: 'storage',
    kind: 'NUMBER',
    defaultValue: 365,
    min: 30,
    max: 3650,
    step: 1,
  },
  {
    key: 'archivos.retencion.selfies_dias',
    label: 'Selfies de asistencia (dias)',
    description: 'Retencion minima de selfies usadas para check-in y check-out.',
    module: 'storage',
    kind: 'NUMBER',
    defaultValue: 90,
    min: 7,
    max: 365,
    step: 1,
  },
  {
    key: 'archivos.retencion.reportes_dias',
    label: 'Exportaciones y reportes (dias)',
    description: 'Retencion minima de archivos de exportacion o reporteo operativo.',
    module: 'storage',
    kind: 'NUMBER',
    defaultValue: 180,
    min: 7,
    max: 730,
    step: 1,
  },
]

export const PAYROLL_PARAMETER_DEFINITIONS: EditableConfigDefinition[] = [
  {
    key: 'nomina.periodo_dias',
    label: 'Duracion del periodo (dias)',
    description: 'Longitud operativa del periodo de pre-nomina y cuotas.',
    module: 'nomina',
    kind: 'NUMBER',
    defaultValue: 14,
    min: 7,
    max: 31,
    step: 1,
  },
  {
    key: 'nomina.dia_pago_semana',
    label: 'Dia de pago',
    description: 'Dia de semana objetivo para pago del periodo consolidado.',
    module: 'nomina',
    kind: 'TEXT',
    defaultValue: 'VIERNES',
  },
  {
    key: 'nomina.bono_cumplimiento_pct',
    label: 'Bono cumplimiento (%)',
    description: 'Porcentaje base del bono comercial cuando la cuota queda cumplida.',
    module: 'nomina',
    kind: 'NUMBER',
    defaultValue: 10,
    min: 0,
    max: 100,
    step: 0.5,
  },
  {
    key: 'nomina.deduccion_falta_dias',
    label: 'Deduccion por falta (dias sueldo)',
    description: 'Equivalente en dias de sueldo aplicado por falta injustificada.',
    module: 'nomina',
    kind: 'NUMBER',
    defaultValue: 1,
    min: 0,
    max: 10,
    step: 0.5,
  },
]

export const EDITABLE_PARAMETER_DEFINITIONS = [
  ...GLOBAL_PARAMETER_DEFINITIONS,
  ...RETENTION_PARAMETER_DEFINITIONS,
  ...PAYROLL_PARAMETER_DEFINITIONS,
]

export const EDITABLE_PARAMETER_DEFINITION_MAP = new Map(
  EDITABLE_PARAMETER_DEFINITIONS.map((definition) => [definition.key, definition])
)

function normalizeText(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

export function parseTurnosCatalogo(value: unknown): TurnoCatalogoItem[] {
  const payload = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const turnos = Array.isArray(payload.turnos) ? payload.turnos : []

  return turnos
    .map((item) => {
      const turno = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const nomenclatura = normalizeText(turno.nomenclatura)

      if (!nomenclatura) {
        return null
      }

      return {
        nomenclatura,
        turno: normalizeText(turno.turno),
        horario: normalizeText(turno.horario),
        horaEntrada: normalizeText(turno.hora_entrada),
        horaSalida: normalizeText(turno.hora_salida),
      }
    })
    .filter((item): item is TurnoCatalogoItem => Boolean(item))
    .sort((left, right) => left.nomenclatura.localeCompare(right.nomenclatura, 'es-MX'))
}

export function serializeTurnosCatalogo(turnos: TurnoCatalogoItem[]) {
  return {
    turnos: turnos.map((turno) => ({
      nomenclatura: turno.nomenclatura,
      turno: turno.turno,
      horario: turno.horario,
      hora_entrada: turno.horaEntrada,
      hora_salida: turno.horaSalida,
      tipo: 'RANGO_HORARIO',
    })),
  }
}

export function coerceEditableConfigValue(
  definition: EditableConfigDefinition,
  rawValue: FormDataEntryValue | null
) {
  const normalized = String(rawValue ?? '').trim()

  if (definition.kind === 'BOOLEAN') {
    if (normalized !== 'true' && normalized !== 'false') {
      throw new Error(`${definition.label} no es valido.`)
    }

    return normalized === 'true'
  }

  if (definition.kind === 'NUMBER') {
    const parsed = Number(normalized)

    if (!Number.isFinite(parsed)) {
      throw new Error(`${definition.label} debe ser numerico.`)
    }

    if (definition.min !== undefined && parsed < definition.min) {
      throw new Error(`${definition.label} debe ser mayor o igual a ${definition.min}.`)
    }

    if (definition.max !== undefined && parsed > definition.max) {
      throw new Error(`${definition.label} debe ser menor o igual a ${definition.max}.`)
    }

    return parsed
  }

  if (!normalized) {
    throw new Error(`${definition.label} es obligatorio.`)
  }

  return normalized
}

export function resolveEditableConfigValue(
  definition: EditableConfigDefinition,
  value: unknown
) {
  if (value === null || value === undefined || value === '') {
    return definition.defaultValue
  }

  if (definition.kind === 'BOOLEAN') {
    return value === true || value === 'true'
  }

  if (definition.kind === 'NUMBER') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : definition.defaultValue
  }

  const normalized = normalizeText(value)
  return normalized ?? definition.defaultValue
}

export function stringifyEditableConfigValue(
  definition: EditableConfigDefinition,
  value: unknown
) {
  const resolved = resolveEditableConfigValue(definition, value)

  if (definition.kind === 'BOOLEAN') {
    return resolved === true ? 'true' : 'false'
  }

  return String(resolved)
}
