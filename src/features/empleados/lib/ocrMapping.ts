import type { GeminiOcrExtractionResult } from '@/lib/ocr/gemini'
import type { EmpleadoOcrSnapshot } from '../state'

function normalizeText(value: string | null | undefined) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeUppercaseText(value: string | null | undefined) {
  const normalized = normalizeText(value)
  return normalized ? normalized.toLocaleUpperCase('es-MX') : null
}

function normalizeLowercaseEmail(value: string | null | undefined) {
  const normalized = normalizeText(value)
  return normalized ? normalized.toLowerCase() : null
}

function normalizeInteger(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.trunc(parsed)
}

function normalizeDecimal(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeIsoDate(value: string | null | undefined) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

export function deriveYearsFromAgencyStartDate(dateValue: string | null) {
  const normalized = normalizeIsoDate(dateValue)
  if (!normalized) {
    return null
  }

  const now = new Date()
  const source = new Date(`${normalized}T00:00:00.000Z`)

  if (Number.isNaN(source.getTime()) || source > now) {
    return null
  }

  let years = now.getUTCFullYear() - source.getUTCFullYear()
  const monthDelta = now.getUTCMonth() - source.getUTCMonth()
  const dayDelta = now.getUTCDate() - source.getUTCDate()

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    years -= 1
  }

  return years >= 0 ? years : null
}

export function buildEmpleadoOcrSnapshot(
  payload: GeminiOcrExtractionResult
): EmpleadoOcrSnapshot {
  const fechaNacimiento = normalizeIsoDate(payload.birthDate)
  const edad = normalizeInteger(payload.age) ?? deriveYearsFromAgencyStartDate(fechaNacimiento)

  return {
    nombreCompleto: normalizeUppercaseText(payload.employeeName),
    curp: normalizeUppercaseText(payload.curp),
    rfc: normalizeUppercaseText(payload.rfc),
    nss: normalizeUppercaseText(payload.nss),
    puestoDetectado: normalizeUppercaseText(payload.position),
    direccion: normalizeUppercaseText(payload.address),
    codigoPostal: normalizeText(payload.postalCode),
    telefono: normalizeText(payload.phoneNumber),
    correoElectronico: normalizeLowercaseEmail(payload.email),
    fechaIngreso: null,
    fechaNacimiento,
    edad,
    aniosLaborando: 0,
    sexo: normalizeUppercaseText(payload.sex),
    estadoCivil: normalizeUppercaseText(payload.maritalStatus),
    originario: normalizeUppercaseText(payload.originPlace),
    fuenteDireccion: normalizeUppercaseText(payload.addressSourceDocumentType),
    confidenceSummary: normalizeText(payload.confidenceSummary),
    status: normalizeText(payload.status),
  }
}
