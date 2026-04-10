// import path from 'node:path'
import JSZip from 'jszip'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { computeSHA256 } from '@/lib/files/sha256'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedSupabaseClient = SupabaseClient<any>

export type LoveQrImportState = 'DISPONIBLE' | 'ACTIVO' | 'BLOQUEADO' | 'BAJA'

export interface LoveQrImportWarning {
  code: string
  severity: 'warning' | 'error'
  message: string
  rowNumber: number | null
  codigoQr?: string | null
  imagenArchivo?: string | null
}

export interface LoveQrManifestRow {
  rowNumber: number
  codigoQr: string
  numeroQr: string | null
  idNominaDc: string | null
  idDcInterno: string | null
  nombreDc: string | null
  estadoQr: LoveQrImportState
  imagenArchivo: string
  fechaInicio: string | null
  motivo: string | null
  observaciones: string | null
}

export interface LoveQrParsedManifest {
  sheetName: string
  rows: LoveQrManifestRow[]
  warnings: LoveQrImportWarning[]
}

export interface LoveQrZipImageFile {
  entryName: string
  fileName: string
  extension: string
  mimeType: string
  buffer: Buffer
  bytes: number
}

export interface LoveQrLoadedZip {
  imagesByName: Map<string, LoveQrZipImageFile>
  warnings: LoveQrImportWarning[]
}

export interface LoveQrConvertedImage {
  buffer: Buffer
  extension: 'png'
  mimeType: 'image/png'
  hash: string
  width: number | null
  height: number | null
  originalExtension: string
  originalMimeType: string
  originalBytes: number
}

export interface LoveQrEmployeeLookupRow {
  id: string
  id_nomina: string | null
  nombre_completo: string
  puesto: string
  estatus_laboral: string
}

export interface LoveQrPreparedRow {
  manifest: LoveQrManifestRow
  employee: LoveQrEmployeeLookupRow | null
  image: LoveQrZipImageFile
}

export interface LoveQrPreparedImport {
  rows: LoveQrPreparedRow[]
  warnings: LoveQrImportWarning[]
}

export interface LoveQrApplyResult {
  processedCount: number
  activeCount: number
  availableCount: number
  blockedCount: number
  bajaCount: number
  insertedCodes: number
  updatedCodes: number
  activatedAssignments: number
  closedAssignments: number
  convertedFromTiffCount: number
  warnings: LoveQrImportWarning[]
}

export interface AssignAvailableLoveQrResult {
  qrCodigoId: string
  codigo: string
  empleadoId: string
  empleadoNombre: string
  assignmentId: string
  fechaInicio: string
}

interface LoveQrExistingCodeRow {
  id: string
  codigo: string
  imagen_url: string | null
  imagen_hash: string | null
  estado: LoveQrImportState
  metadata: Record<string, unknown> | null
}

interface LoveQrExistingAssignmentRow {
  id: string
  cuenta_cliente_id: string
  qr_codigo_id: string
  empleado_id: string
  fecha_inicio: string
  fecha_fin: string | null
  motivo: string | null
  observaciones: string | null
  metadata: Record<string, unknown> | null
}

const REQUIRED_HEADERS = ['CODIGO_QR', 'ESTADO_QR', 'IMAGEN_ARCHIVO'] as const
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff'])
const TIFF_EXTENSIONS = new Set(['.tif', '.tiff'])
const QR_SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 6
const ORPHAN_ROOT = '_orphans'
const ORPHAN_DATE_CACHE = new Map<string, Promise<string[]>>()

const HEADER_ALIASES: Record<string, string[]> = {
  CODIGO_QR: ['CODIGO_QR', 'CODIGO QR', 'CODIGO'],
  NUMERO_QR: ['NUMERO_QR', 'NUMERO QR', 'NUMERO', 'FOLIO_QR', 'FOLIO QR'],
  ID_NOMINA_DC: [
    'ID_NOMINA_DC',
    'ID NOMINA DC',
    'ID_NOMINA_BC',
    'ID NOMINA BC',
    'ID_NOMINA',
    'ID NOMINA',
    'NOMINA',
    'IDNOM',
  ],
  ID_DC_INTERNO: [
    'ID_DC_INTERNO',
    'ID DC INTERNO',
    'EMPLEADO_ID',
    'EMPLEADO ID',
    'ID_INTERNO_DC',
    'ID INTERNO DC',
  ],
  NOMBRE_DC: ['NOMBRE_DC', 'NOMBRE DC', 'NOMBRE_DERMOCONSEJERA', 'NOMBRE DERMOCONSEJERA'],
  ESTADO_QR: ['ESTADO_QR', 'ESTADO QR', 'ESTADO'],
  IMAGEN_ARCHIVO: [
    'IMAGEN_ARCHIVO',
    'IMAGEN ARCHIVO',
    'ARCHIVO_IMAGEN',
    'ARCHIVO IMAGEN',
    'IMAGEN',
    'QR_IMAGEN',
    'QR IMAGEN',
  ],
  FECHA_INICIO: ['FECHA_INICIO', 'FECHA INICIO', 'INICIO'],
  MOTIVO: ['MOTIVO'],
  OBSERVACIONES: ['OBSERVACIONES', 'OBSERVACION', 'OBS'],
}

function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
}

function asText(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function asRequiredText(value: unknown) {
  const normalized = asText(value)
  return normalized ?? ''
}

function parseIsoDate(value: unknown) {
  const normalized = asText(value)
  if (!normalized) {
    return null
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized
  }

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString().slice(0, 10)
}

function resolveDefaultMotivo(state: LoveQrImportState) {
  switch (state) {
    case 'ACTIVO':
      return 'ASIGNACION_INICIAL'
    case 'DISPONIBLE':
      return 'STOCK'
    case 'BLOQUEADO':
      return 'BLOQUEO_OPERATIVO'
    case 'BAJA':
      return 'BAJA_OPERATIVA'
    default:
      return 'ASIGNACION_INICIAL'
  }
}

function parseState(value: unknown): LoveQrImportState | null {
  const normalized = asText(value)?.toUpperCase() ?? null
  if (!normalized) {
    return null
  }

  if (
    normalized === 'ACTIVO' ||
    normalized === 'DISPONIBLE' ||
    normalized === 'BLOQUEADO' ||
    normalized === 'BAJA'
  ) {
    return normalized
  }

  return null
}

function findCanonicalHeaderKey(headers: string[], canonicalKey: string) {
  const aliases = HEADER_ALIASES[canonicalKey] ?? [canonicalKey]
  const normalizedAliases = aliases.map((item) => normalizeHeader(item))
  return headers.find((header) => normalizedAliases.includes(normalizeHeader(header))) ?? null
}

function selectManifestSheet(workbook: XLSX.WorkBook) {
  const candidates = workbook.SheetNames.filter((name) => {
    const sheet = workbook.Sheets[name]
    if (!sheet) {
      return false
    }
    const rows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
      raw: false,
    })
    const firstRow = (rows[0] ?? []).map((item) => String(item ?? ''))
    return REQUIRED_HEADERS.every((required) => findCanonicalHeaderKey(firstRow, required))
  })

  const sheetName = candidates[0] ?? workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('El manifiesto QR no contiene hojas legibles.')
  }

  return sheetName
}

export function parseLoveQrManifestWorkbook(buffer: Buffer, fileName: string): LoveQrParsedManifest {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = selectManifestSheet(workbook)
  const sheet = workbook.Sheets[sheetName]

  if (!sheet) {
    throw new Error(`No fue posible leer la hoja principal del manifiesto ${fileName}.`)
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  })

  if (rows.length === 0) {
    throw new Error('El manifiesto QR no contiene registros.')
  }

  const firstRowHeaders = Object.keys(rows[0] ?? {})
  const headerMap = new Map<string, string>()
  Object.keys(HEADER_ALIASES).forEach((canonical) => {
    const matched = findCanonicalHeaderKey(firstRowHeaders, canonical)
    if (matched) {
      headerMap.set(canonical, matched)
    }
  })

  const missingHeaders = REQUIRED_HEADERS.filter((required) => !headerMap.has(required))
  if (missingHeaders.length > 0) {
    throw new Error(
      `El manifiesto QR no contiene las columnas obligatorias: ${missingHeaders.join(', ')}.`
    )
  }

  const warnings: LoveQrImportWarning[] = []
  const parsedRows: LoveQrManifestRow[] = []
  const seenCodes = new Set<string>()

  rows.forEach((rawRow, index) => {
    const rowNumber = index + 2
    const codigoQr = asRequiredText(rawRow[headerMap.get('CODIGO_QR') ?? ''])
    const estadoQr = parseState(rawRow[headerMap.get('ESTADO_QR') ?? ''])
    const imagenArchivo = asRequiredText(rawRow[headerMap.get('IMAGEN_ARCHIVO') ?? ''])
    const numeroQr = asText(rawRow[headerMap.get('NUMERO_QR') ?? ''])
    const idNominaDc = asText(rawRow[headerMap.get('ID_NOMINA_DC') ?? ''])
    const idDcInterno = asText(rawRow[headerMap.get('ID_DC_INTERNO') ?? ''])
    const nombreDc = asText(rawRow[headerMap.get('NOMBRE_DC') ?? ''])
    const fechaInicio = parseIsoDate(rawRow[headerMap.get('FECHA_INICIO') ?? ''])
    const motivo = asText(rawRow[headerMap.get('MOTIVO') ?? ''])
    const observaciones = asText(rawRow[headerMap.get('OBSERVACIONES') ?? ''])

    if (!codigoQr && !imagenArchivo && !idNominaDc && !idDcInterno) {
      return
    }

    if (!codigoQr) {
      warnings.push({
        code: 'missing_codigo_qr',
        severity: 'error',
        message: `La fila ${rowNumber} no trae CODIGO_QR.`,
        rowNumber,
      })
      return
    }

    if (seenCodes.has(codigoQr.toUpperCase())) {
      warnings.push({
        code: 'duplicate_codigo_qr',
        severity: 'error',
        message: `El codigo ${codigoQr} aparece repetido en el manifiesto.`,
        rowNumber,
        codigoQr,
      })
      return
    }
    seenCodes.add(codigoQr.toUpperCase())

    if (!estadoQr) {
      warnings.push({
        code: 'invalid_estado_qr',
        severity: 'error',
        message: `La fila ${rowNumber} trae un ESTADO_QR no reconocido.`,
        rowNumber,
        codigoQr,
      })
      return
    }

    if (!imagenArchivo) {
      warnings.push({
        code: 'missing_imagen_archivo',
        severity: 'error',
        message: `La fila ${rowNumber} no trae IMAGEN_ARCHIVO.`,
        rowNumber,
        codigoQr,
      })
      return
    }

    if (estadoQr === 'ACTIVO' && !idNominaDc && !idDcInterno) {
      warnings.push({
        code: 'missing_dc_reference',
        severity: 'error',
        message: `La fila ${rowNumber} esta ACTIVA pero no trae ID de la dermoconsejera.`,
        rowNumber,
        codigoQr,
        imagenArchivo,
      })
      return
    }

    parsedRows.push({
      rowNumber,
      codigoQr,
      numeroQr,
      idNominaDc,
      idDcInterno,
      nombreDc,
      estadoQr,
      imagenArchivo,
      fechaInicio,
      motivo: motivo ?? resolveDefaultMotivo(estadoQr),
      observaciones,
    })
  })

  if (parsedRows.length === 0) {
    warnings.push({
      code: 'manifest_without_rows',
      severity: 'error',
      message: 'El manifiesto QR no produjo filas operativas despues de validacion inicial.',
      rowNumber: null,
    })
  }

  return {
    sheetName,
    rows: parsedRows,
    warnings,
  }
}

function resolveMimeTypeFromExtension(extension: string) {
  switch (extension) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.tif':
    case '.tiff':
      return 'image/tiff'
    default:
      return 'application/octet-stream'
  }
}

export async function loadLoveQrZipImages(buffer: Buffer): Promise<LoveQrLoadedZip> {
  const zip = await JSZip.loadAsync(buffer)
  const warnings: LoveQrImportWarning[] = []
  const imagesByName = new Map<string, LoveQrZipImageFile>()
  const seenNames = new Set<string>()

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) {
      continue
    }

    const fileName = ((x) => x.split("/").pop() || "")(entry.name)
    const extension = ((x) => { const p = x.split("."); return p.length > 1 ? "." + p.pop() : "" })(fileName).toLowerCase()

    if (!IMAGE_EXTENSIONS.has(extension)) {
      warnings.push({
        code: 'unsupported_zip_file',
        severity: 'warning',
        message: `El archivo ${fileName} dentro del ZIP no tiene una extension soportada y sera ignorado.`,
        rowNumber: null,
        imagenArchivo: fileName,
      })
      continue
    }

    const normalizedFileName = fileName.toLowerCase()
    if (seenNames.has(normalizedFileName)) {
      warnings.push({
        code: 'duplicate_zip_image_name',
        severity: 'error',
        message: `El ZIP contiene mas de una imagen con el nombre ${fileName}.`,
        rowNumber: null,
        imagenArchivo: fileName,
      })
      continue
    }

    seenNames.add(normalizedFileName)
    const content = await entry.async('nodebuffer')
    imagesByName.set(normalizedFileName, {
      entryName: entry.name,
      fileName,
      extension,
      mimeType: resolveMimeTypeFromExtension(extension),
      buffer: content,
      bytes: content.byteLength,
    })
  }

  if (imagesByName.size === 0) {
    warnings.push({
      code: 'zip_without_images',
      severity: 'error',
      message: 'El ZIP no contiene imagenes QR utilizables.',
      rowNumber: null,
    })
  }

  return {
    imagesByName,
    warnings,
  }
}

function normalizeComparisonName(value: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

export async function prepareLoveQrImport(
  service: TypedSupabaseClient,
  manifest: LoveQrParsedManifest,
  zipImages: LoveQrLoadedZip
): Promise<LoveQrPreparedImport> {
  const warnings: LoveQrImportWarning[] = [...manifest.warnings, ...zipImages.warnings]
  const internalIds = Array.from(
    new Set(manifest.rows.map((item) => item.idDcInterno).filter((value): value is string => Boolean(value)))
  )
  const nominas = Array.from(
    new Set(manifest.rows.map((item) => item.idNominaDc).filter((value): value is string => Boolean(value)))
  )

  const [employeesByIdResult, employeesByNominaResult] = await Promise.all([
    internalIds.length > 0
      ? service
          .from('empleado')
          .select('id, id_nomina, nombre_completo, puesto, estatus_laboral')
          .in('id', internalIds)
          .limit(Math.max(internalIds.length, 1))
      : Promise.resolve({ data: [], error: null }),
    nominas.length > 0
      ? service
          .from('empleado')
          .select('id, id_nomina, nombre_completo, puesto, estatus_laboral')
          .in('id_nomina', nominas)
          .limit(Math.max(nominas.length, 1))
      : Promise.resolve({ data: [], error: null }),
  ])

  if (employeesByIdResult.error) {
    throw new Error(employeesByIdResult.error.message)
  }

  if (employeesByNominaResult.error) {
    throw new Error(employeesByNominaResult.error.message)
  }

  const employeesById = new Map(
    (((employeesByIdResult.data ?? []) as LoveQrEmployeeLookupRow[]).map((item) => [item.id, item] as const))
  )
  const employeesByNomina = new Map(
    (((employeesByNominaResult.data ?? []) as LoveQrEmployeeLookupRow[])
      .map((item) => (item.id_nomina ? ([item.id_nomina, item] as const) : null))
      .filter((item): item is readonly [string, LoveQrEmployeeLookupRow] => Boolean(item)))
  )

  const preparedRows: LoveQrPreparedRow[] = []
  const activeEmployees = new Map<string, string>()

  for (const row of manifest.rows) {
    const image = zipImages.imagesByName.get(row.imagenArchivo.toLowerCase()) ?? null

    if (!image) {
      warnings.push({
        code: 'image_not_found_in_zip',
        severity: 'error',
        message: `No se encontro ${row.imagenArchivo} dentro del ZIP.`,
        rowNumber: row.rowNumber,
        codigoQr: row.codigoQr,
        imagenArchivo: row.imagenArchivo,
      })
      continue
    }

    const employeeById = row.idDcInterno ? employeesById.get(row.idDcInterno) ?? null : null
    const employeeByNomina = row.idNominaDc ? employeesByNomina.get(row.idNominaDc) ?? null : null

    if (employeeById && employeeByNomina && employeeById.id !== employeeByNomina.id) {
      warnings.push({
        code: 'employee_identifier_conflict',
        severity: 'error',
        message: `La fila ${row.rowNumber} mezcla un ID interno y una nomina que apuntan a dos personas distintas.`,
        rowNumber: row.rowNumber,
        codigoQr: row.codigoQr,
      })
      continue
    }

    const employee = employeeById ?? employeeByNomina ?? null

    if (row.estadoQr === 'ACTIVO') {
      if (!employee) {
        warnings.push({
          code: 'active_qr_without_employee',
          severity: 'error',
          message: `La fila ${row.rowNumber} intenta activar ${row.codigoQr} sin una dermoconsejera valida.`,
          rowNumber: row.rowNumber,
          codigoQr: row.codigoQr,
        })
        continue
      }

      if (employee.puesto !== 'DERMOCONSEJERO') {
        warnings.push({
          code: 'active_qr_non_dermo',
          severity: 'error',
          message: `La fila ${row.rowNumber} apunta a ${employee.nombre_completo}, pero su puesto no es DERMOCONSEJERO.`,
          rowNumber: row.rowNumber,
          codigoQr: row.codigoQr,
        })
        continue
      }

      if (employee.estatus_laboral !== 'ACTIVO') {
        warnings.push({
          code: 'active_qr_inactive_employee',
          severity: 'error',
          message: `La fila ${row.rowNumber} apunta a ${employee.nombre_completo}, pero su estatus laboral no esta ACTIVO.`,
          rowNumber: row.rowNumber,
          codigoQr: row.codigoQr,
        })
        continue
      }

      const previousCode = activeEmployees.get(employee.id)
      if (previousCode && previousCode !== row.codigoQr) {
        warnings.push({
          code: 'employee_multiple_active_qr',
          severity: 'error',
          message: `La dermoconsejera ${employee.nombre_completo} aparece con mas de un QR ACTIVO dentro del mismo manifiesto.`,
          rowNumber: row.rowNumber,
          codigoQr: row.codigoQr,
        })
        continue
      }

      activeEmployees.set(employee.id, row.codigoQr)
    }

    if (employee && row.nombreDc) {
      const expectedName = normalizeComparisonName(row.nombreDc)
      const actualName = normalizeComparisonName(employee.nombre_completo)

      if (expectedName && actualName && expectedName !== actualName) {
        warnings.push({
          code: 'employee_name_mismatch',
          severity: 'warning',
          message: `La fila ${row.rowNumber} trae nombre ${row.nombreDc}, pero el sistema resolvio a ${employee.nombre_completo}.`,
          rowNumber: row.rowNumber,
          codigoQr: row.codigoQr,
        })
      }
    }

    preparedRows.push({
      manifest: row,
      employee,
      image,
    })
  }

  const referencedImages = new Set(preparedRows.map((item) => item.image.fileName.toLowerCase()))
  for (const image of zipImages.imagesByName.values()) {
    if (!referencedImages.has(image.fileName.toLowerCase())) {
      warnings.push({
        code: 'unused_zip_image',
        severity: 'warning',
        message: `La imagen ${image.fileName} no se usa en el manifiesto actual.`,
        rowNumber: null,
        imagenArchivo: image.fileName,
      })
    }
  }

  return {
    rows: preparedRows,
    warnings,
  }
}

function mergeRecord(base: Record<string, unknown> | null | undefined, patch: Record<string, unknown>) {
  return {
    ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}),
    ...patch,
  }
}

function buildStorageUrl(bucket: string, route: string) {
  return `${bucket}/${route}`
}

function splitStorageImageUrl(imageUrl: string) {
  const separatorIndex = imageUrl.indexOf('/')
  if (separatorIndex <= 0 || separatorIndex === imageUrl.length - 1) {
    return null
  }

  return {
    bucket: imageUrl.slice(0, separatorIndex),
    route: imageUrl.slice(separatorIndex + 1),
  }
}

async function loadOrphanDateFolders(service: TypedSupabaseClient, bucket: string) {
  const cacheKey = `${bucket}:${ORPHAN_ROOT}`
  const cached =
    ORPHAN_DATE_CACHE.get(cacheKey) ??
    (async () => {
      const { data, error } = await service.storage.from(bucket).list(ORPHAN_ROOT, { limit: 365 })
      if (error || !data) {
        return []
      }

      return data
        .map((item) => String(item.name ?? '').trim())
        .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item))
        .sort((left, right) => right.localeCompare(left))
    })()

  ORPHAN_DATE_CACHE.set(cacheKey, cached)
  return cached
}

async function resolveStorageRouteForLoveQr(
  service: TypedSupabaseClient,
  {
    bucket,
    route,
  }: {
    bucket: string
    route: string
  }
) {
  const signAttempt = await service.storage
    .from(bucket)
    .createSignedUrl(route, QR_SIGNED_URL_EXPIRY_SECONDS)

  if (!signAttempt.error && signAttempt.data?.signedUrl) {
    return {
      route,
      signedUrl: signAttempt.data.signedUrl,
    }
  }

  if (route.startsWith(`${ORPHAN_ROOT}/`) || !route.startsWith('love-isdin/qr-codes/')) {
    return null
  }

  const orphanFolders = await loadOrphanDateFolders(service, bucket)
  for (const folder of orphanFolders) {
    const candidateRoute = `${ORPHAN_ROOT}/${folder}/${route}`
    const orphanAttempt = await service.storage
      .from(bucket)
      .createSignedUrl(candidateRoute, QR_SIGNED_URL_EXPIRY_SECONDS)

    if (!orphanAttempt.error && orphanAttempt.data?.signedUrl) {
      return {
        route: candidateRoute,
        signedUrl: orphanAttempt.data.signedUrl,
      }
    }
  }

  return null
}

async function uploadConvertedQrImage(
  service: TypedSupabaseClient,
  {
    bucket,
    cuentaClienteId,
    converted,
  }: {
    bucket: string
    cuentaClienteId: string
    converted: LoveQrConvertedImage
  }
) {
  const route = `love-isdin/qr-codes/${cuentaClienteId}/${converted.hash}.${converted.extension}`
  const { error } = await service.storage.from(bucket).upload(route, converted.buffer, {
    contentType: converted.mimeType,
    upsert: false,
  })

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(error.message)
  }

  const resolvedRoute =
    (
      await resolveStorageRouteForLoveQr(service, {
        bucket,
        route,
      })
    )?.route ?? route

  return {
    imageUrl: buildStorageUrl(bucket, resolvedRoute),
    imageHash: converted.hash,
  }
}

function normalizeCodeKey(value: string) {
  return value.trim().toUpperCase()
}

async function closeActiveAssignment(
  service: TypedSupabaseClient,
  assignment: LoveQrExistingAssignmentRow,
  {
    closedAt,
    motivo,
    observaciones,
    metadata,
  }: {
    closedAt: string
    motivo: string
    observaciones: string | null
    metadata: Record<string, unknown>
  }
) {
  const { error } = await service
    .from('love_isdin_qr_asignacion')
    .update({
      fecha_fin: closedAt,
      motivo,
      observaciones,
      metadata: mergeRecord(assignment.metadata, metadata),
    })
    .eq('id', assignment.id)

  if (error) {
    throw new Error(error.message)
  }
}

function buildAssignmentMaps(rows: LoveQrExistingAssignmentRow[]) {
  const byQrId = new Map<string, LoveQrExistingAssignmentRow>()
  const byEmployeeId = new Map<string, LoveQrExistingAssignmentRow>()

  rows.forEach((row) => {
    byQrId.set(row.qr_codigo_id, row)
    byEmployeeId.set(row.empleado_id, row)
  })

  return { byQrId, byEmployeeId }
}

async function updateQrCodeRecord(
  service: TypedSupabaseClient,
  {
    qrCodeId,
    estado,
    imageUrl,
    imageHash,
    metadata,
  }: {
    qrCodeId: string
    estado: LoveQrImportState
    imageUrl: string | null
    imageHash: string | null
    metadata: Record<string, unknown>
  }
) {
  const { error } = await service
    .from('love_isdin_qr_codigo')
    .update({
      estado,
      imagen_url: imageUrl,
      imagen_hash: imageHash,
      metadata,
    })
    .eq('id', qrCodeId)

  if (error) {
    throw new Error(error.message)
  }
}

async function insertQrCodeRecord(
  service: TypedSupabaseClient,
  {
    cuentaClienteId,
    codigo,
    estado,
    imageUrl,
    imageHash,
    metadata,
  }: {
    cuentaClienteId: string
    codigo: string
    estado: LoveQrImportState
    imageUrl: string
    imageHash: string
    metadata: Record<string, unknown>
  }
) {
  const { data, error } = await service
    .from('love_isdin_qr_codigo')
    .insert({
      cuenta_cliente_id: cuentaClienteId,
      codigo,
      estado,
      imagen_url: imageUrl,
      imagen_hash: imageHash,
      metadata,
    })
    .select('id, codigo, imagen_url, imagen_hash, estado, metadata')
    .maybeSingle()

  if (error || !data) {
    throw new Error(error?.message ?? `No fue posible registrar el QR ${codigo}.`)
  }

  return data as LoveQrExistingCodeRow
}

async function insertAssignment(
  service: TypedSupabaseClient,
  {
    cuentaClienteId,
    qrCodigoId,
    empleadoId,
    fechaInicio,
    motivo,
    observaciones,
    actorUsuarioId,
    metadata,
  }: {
    cuentaClienteId: string
    qrCodigoId: string
    empleadoId: string
    fechaInicio: string
    motivo: string | null
    observaciones: string | null
    actorUsuarioId: string
    metadata: Record<string, unknown>
  }
) {
  const { data, error } = await service
    .from('love_isdin_qr_asignacion')
    .insert({
      cuenta_cliente_id: cuentaClienteId,
      qr_codigo_id: qrCodigoId,
      empleado_id: empleadoId,
      fecha_inicio: fechaInicio,
      fecha_fin: null,
      motivo,
      observaciones,
      created_by_usuario_id: actorUsuarioId,
      metadata,
    })
    .select('id, cuenta_cliente_id, qr_codigo_id, empleado_id, fecha_inicio, fecha_fin, motivo, observaciones, metadata')
    .maybeSingle()

  if (error || !data) {
    throw new Error(error?.message ?? 'No fue posible registrar la asignacion QR activa.')
  }

  return data as LoveQrExistingAssignmentRow
}

async function closeAndBlockPreviousQr(
  service: TypedSupabaseClient,
  {
    assignment,
    closedAt,
    motivo,
    observaciones,
    metadata,
    codeById,
  }: {
    assignment: LoveQrExistingAssignmentRow
    closedAt: string
    motivo: string
    observaciones: string | null
    metadata: Record<string, unknown>
    codeById: Map<string, LoveQrExistingCodeRow>
  }
) {
  await closeActiveAssignment(service, assignment, {
    closedAt,
    motivo,
    observaciones,
    metadata,
  })

  const previousQr = codeById.get(assignment.qr_codigo_id)
  if (!previousQr) {
    return
  }

  await updateQrCodeRecord(service, {
    qrCodeId: previousQr.id,
    estado: 'BLOQUEADO',
    imageUrl: previousQr.imagen_url ?? null,
    imageHash: previousQr.imagen_hash ?? null,
    metadata: mergeRecord(previousQr.metadata, {
      ultimo_evento_importacion_qr: motivo,
      importacion_qr_bloqueado_en: closedAt,
      importacion_qr_bloqueado_desde_asignacion_id: assignment.id,
      ...metadata,
    }),
  })

  codeById.set(previousQr.id, {
    ...previousQr,
    estado: 'BLOQUEADO',
    metadata: mergeRecord(previousQr.metadata, {
      ultimo_evento_importacion_qr: motivo,
      importacion_qr_bloqueado_en: closedAt,
      importacion_qr_bloqueado_desde_asignacion_id: assignment.id,
      ...metadata,
    }),
  })
}

function buildExistingCodeMaps(rows: LoveQrExistingCodeRow[]) {
  const byCodeKey = new Map<string, LoveQrExistingCodeRow>()
  const byId = new Map<string, LoveQrExistingCodeRow>()

  rows.forEach((row) => {
    byCodeKey.set(normalizeCodeKey(row.codigo), row)
    byId.set(row.id, row)
  })

  return { byCodeKey, byId }
}

function countPreparedStates(rows: LoveQrPreparedRow[]) {
  return rows.reduce(
    (acc, row) => {
      switch (row.manifest.estadoQr) {
        case 'ACTIVO':
          acc.activeCount += 1
          break
        case 'DISPONIBLE':
          acc.availableCount += 1
          break
        case 'BLOQUEADO':
          acc.blockedCount += 1
          break
        case 'BAJA':
          acc.bajaCount += 1
          break
      }
      return acc
    },
    {
      activeCount: 0,
      availableCount: 0,
      blockedCount: 0,
      bajaCount: 0,
    }
  )
}

export interface ProcessLoveQrImportOptions {
  cuentaClienteId: string
  actorUsuarioId: string
  manifestBuffer: Buffer
  manifestFileName: string
  zipBuffer: Buffer
  imageBucket: string
  importLoteId?: string | null
  importedAt?: string
}

export interface ProcessLoveQrImportResult {
  sheetName: string
  rowsPrepared: number
  applied: boolean
  warnings: LoveQrImportWarning[]
  warningCount: number
  errorCount: number
  result: LoveQrApplyResult | null
}

export async function applyLoveQrImport(
  service: TypedSupabaseClient,
  {
    cuentaClienteId,
    actorUsuarioId,
    prepared,
    imageBucket,
    importLoteId,
    importedAt,
  }: {
    cuentaClienteId: string
    actorUsuarioId: string
    prepared: LoveQrPreparedImport
    imageBucket: string
    importLoteId?: string | null
    importedAt?: string
  }
): Promise<LoveQrApplyResult> {
  const effectiveImportDate = importedAt ?? new Date().toISOString().slice(0, 10)
  const activeAssignmentsQuery = service
    .from('love_isdin_qr_asignacion')
    .select('id, cuenta_cliente_id, qr_codigo_id, empleado_id, fecha_inicio, fecha_fin, motivo, observaciones, metadata')
    .eq('cuenta_cliente_id', cuentaClienteId)
    .is('fecha_fin', null)
    .limit(5000)
  const existingCodesQuery = service
    .from('love_isdin_qr_codigo')
    .select('id, codigo, imagen_url, imagen_hash, estado, metadata')
    .eq('cuenta_cliente_id', cuentaClienteId)
    .limit(5000)

  const [existingCodesResult, activeAssignmentsResult] = await Promise.all([
    existingCodesQuery,
    activeAssignmentsQuery,
  ])

  if (existingCodesResult.error) {
    throw new Error(existingCodesResult.error.message)
  }

  if (activeAssignmentsResult.error) {
    throw new Error(activeAssignmentsResult.error.message)
  }

  const existingCodes = (existingCodesResult.data ?? []) as LoveQrExistingCodeRow[]
  const activeAssignments = (activeAssignmentsResult.data ?? []) as LoveQrExistingAssignmentRow[]
  const { byCodeKey, byId: codeById } = buildExistingCodeMaps(existingCodes)
  const assignmentMaps = buildAssignmentMaps(activeAssignments)
  const counters = countPreparedStates(prepared.rows)

  let insertedCodes = 0
  let updatedCodes = 0
  let activatedAssignments = 0
  let closedAssignments = 0
  let convertedFromTiffCount = 0

  for (const row of prepared.rows) {
    const manifest = row.manifest
    const convertedImage = await convertLoveQrImageForDashboard(row.image)
    const uploadedImage = await uploadConvertedQrImage(service, {
      bucket: imageBucket,
      cuentaClienteId,
      converted: convertedImage,
    })

    if (TIFF_EXTENSIONS.has(row.image.extension)) {
      convertedFromTiffCount += 1
    }

    const codeKey = normalizeCodeKey(manifest.codigoQr)
    const existingCode = byCodeKey.get(codeKey) ?? null
    const codeMetadataPatch = {
      numero_qr: manifest.numeroQr,
      id_nomina_dc: manifest.idNominaDc,
      id_dc_interno: manifest.idDcInterno,
      nombre_dc_snapshot: manifest.nombreDc,
      imagen_archivo_original: row.image.fileName,
      imagen_mime_original: row.image.mimeType,
      imagen_extension_original: row.image.extension,
      imagen_bytes_original: row.image.bytes,
      imagen_original_entry_name: row.image.entryName,
      imagen_convertida_mime: convertedImage.mimeType,
      imagen_convertida_extension: convertedImage.extension,
      imagen_convertida_width: convertedImage.width,
      imagen_convertida_height: convertedImage.height,
      imagen_convertida_desde_tiff: TIFF_EXTENSIONS.has(row.image.extension),
      importacion_qr_lote_id: importLoteId ?? null,
      importacion_qr_actor_usuario_id: actorUsuarioId,
      importacion_qr_fecha: effectiveImportDate,
      importacion_qr_motivo: manifest.motivo,
      importacion_qr_observaciones: manifest.observaciones,
    }

    const qrCode =
      existingCode
        ? (() => {
            const mergedMetadata = mergeRecord(existingCode.metadata, codeMetadataPatch)
            return updateQrCodeRecord(service, {
              qrCodeId: existingCode.id,
              estado: manifest.estadoQr,
              imageUrl: uploadedImage.imageUrl,
              imageHash: uploadedImage.imageHash,
              metadata: mergedMetadata,
            }).then(() => {
              const updated: LoveQrExistingCodeRow = {
                ...existingCode,
                estado: manifest.estadoQr,
                imagen_url: uploadedImage.imageUrl,
                imagen_hash: uploadedImage.imageHash,
                metadata: mergedMetadata,
              }
              updatedCodes += 1
              byCodeKey.set(codeKey, updated)
              codeById.set(updated.id, updated)
              return updated
            })
          })()
        : insertQrCodeRecord(service, {
            cuentaClienteId,
            codigo: manifest.codigoQr,
            estado: manifest.estadoQr,
            imageUrl: uploadedImage.imageUrl,
            imageHash: uploadedImage.imageHash,
            metadata: codeMetadataPatch,
          }).then((inserted) => {
            insertedCodes += 1
            byCodeKey.set(codeKey, inserted)
            codeById.set(inserted.id, inserted)
            return inserted
          })

    const resolvedQrCode = await qrCode
    const assignmentMetadata = {
      importacion_qr_lote_id: importLoteId ?? null,
      importacion_qr_actor_usuario_id: actorUsuarioId,
      importacion_qr_fecha: effectiveImportDate,
      qr_codigo: manifest.codigoQr,
      qr_numero: manifest.numeroQr,
      qr_estado: manifest.estadoQr,
    }

    const activeAssignmentForQr = assignmentMaps.byQrId.get(resolvedQrCode.id) ?? null

    if (manifest.estadoQr === 'ACTIVO' && row.employee) {
      const activeAssignmentForEmployee = assignmentMaps.byEmployeeId.get(row.employee.id) ?? null

      if (
        activeAssignmentForEmployee &&
        activeAssignmentForEmployee.qr_codigo_id !== resolvedQrCode.id
      ) {
        await closeAndBlockPreviousQr(service, {
          assignment: activeAssignmentForEmployee,
          closedAt: manifest.fechaInicio ?? effectiveImportDate,
          motivo: 'REEMPLAZO_QR_IMPORTACION',
          observaciones: `QR reemplazado por ${manifest.codigoQr} durante carga masiva.`,
          metadata: assignmentMetadata,
          codeById,
        })
        assignmentMaps.byEmployeeId.delete(row.employee.id)
        assignmentMaps.byQrId.delete(activeAssignmentForEmployee.qr_codigo_id)
        closedAssignments += 1
      }

      if (
        activeAssignmentForQr &&
        activeAssignmentForQr.empleado_id !== row.employee.id
      ) {
        await closeActiveAssignment(service, activeAssignmentForQr, {
          closedAt: manifest.fechaInicio ?? effectiveImportDate,
          motivo: 'REASIGNACION_QR_IMPORTACION',
          observaciones: `QR ${manifest.codigoQr} reasignado a otra dermoconsejera durante carga masiva.`,
          metadata: assignmentMetadata,
        })
        assignmentMaps.byEmployeeId.delete(activeAssignmentForQr.empleado_id)
        assignmentMaps.byQrId.delete(activeAssignmentForQr.qr_codigo_id)
        closedAssignments += 1
      }

      const currentAssignment = assignmentMaps.byQrId.get(resolvedQrCode.id) ?? null

      if (!currentAssignment) {
        const insertedAssignment = await insertAssignment(service, {
          cuentaClienteId,
          qrCodigoId: resolvedQrCode.id,
          empleadoId: row.employee.id,
          fechaInicio: manifest.fechaInicio ?? effectiveImportDate,
          motivo: manifest.motivo,
          observaciones: manifest.observaciones,
          actorUsuarioId,
          metadata: assignmentMetadata,
        })
        assignmentMaps.byQrId.set(insertedAssignment.qr_codigo_id, insertedAssignment)
        assignmentMaps.byEmployeeId.set(insertedAssignment.empleado_id, insertedAssignment)
        activatedAssignments += 1
      }
    } else if (activeAssignmentForQr) {
      await closeActiveAssignment(service, activeAssignmentForQr, {
        closedAt: manifest.fechaInicio ?? effectiveImportDate,
        motivo: manifest.motivo ?? resolveDefaultMotivo(manifest.estadoQr),
        observaciones: manifest.observaciones,
        metadata: assignmentMetadata,
      })
      assignmentMaps.byQrId.delete(activeAssignmentForQr.qr_codigo_id)
      assignmentMaps.byEmployeeId.delete(activeAssignmentForQr.empleado_id)
      closedAssignments += 1
    }
  }

  return {
    processedCount: prepared.rows.length,
    activeCount: counters.activeCount,
    availableCount: counters.availableCount,
    blockedCount: counters.blockedCount,
    bajaCount: counters.bajaCount,
    insertedCodes,
    updatedCodes,
    activatedAssignments,
    closedAssignments,
    convertedFromTiffCount,
    warnings: prepared.warnings,
  }
}

export async function assignAvailableLoveQrToEmployee(
  service: TypedSupabaseClient,
  {
    cuentaClienteId,
    actorUsuarioId,
    qrCodigoId,
    empleadoId,
    assignedAt,
    motivo,
    observaciones,
  }: {
    cuentaClienteId: string
    actorUsuarioId: string
    qrCodigoId: string
    empleadoId: string
    assignedAt?: string
    motivo?: string | null
    observaciones?: string | null
  }
): Promise<AssignAvailableLoveQrResult> {
  const effectiveAssignedAt = assignedAt ?? new Date().toISOString().slice(0, 10)
  const effectiveMotivo = (motivo ?? '').trim() || 'ASIGNACION_NUEVA_CONTRATACION'
  const effectiveObservaciones = (observaciones ?? '').trim() || null

  const [qrCodeResult, assignmentForQrResult, assignmentForEmployeeResult, employeeResult, userResult] =
    await Promise.all([
      service
        .from('love_isdin_qr_codigo')
        .select('id, codigo, imagen_url, imagen_hash, estado, metadata')
        .eq('id', qrCodigoId)
        .eq('cuenta_cliente_id', cuentaClienteId)
        .maybeSingle(),
      service
        .from('love_isdin_qr_asignacion')
        .select('id, cuenta_cliente_id, qr_codigo_id, empleado_id, fecha_inicio, fecha_fin, motivo, observaciones, metadata')
        .eq('cuenta_cliente_id', cuentaClienteId)
        .eq('qr_codigo_id', qrCodigoId)
        .is('fecha_fin', null)
        .maybeSingle(),
      service
        .from('love_isdin_qr_asignacion')
        .select('id, cuenta_cliente_id, qr_codigo_id, empleado_id, fecha_inicio, fecha_fin, motivo, observaciones, metadata')
        .eq('cuenta_cliente_id', cuentaClienteId)
        .eq('empleado_id', empleadoId)
        .is('fecha_fin', null)
        .maybeSingle(),
      service
        .from('empleado')
        .select('id, id_nomina, nombre_completo, puesto, estatus_laboral')
        .eq('id', empleadoId)
        .maybeSingle(),
      service
        .from('usuario')
        .select('id, estado_cuenta')
        .eq('empleado_id', empleadoId)
        .eq('cuenta_cliente_id', cuentaClienteId)
        .neq('estado_cuenta', 'BAJA')
        .limit(1)
        .maybeSingle(),
    ])

  if (qrCodeResult.error) {
    throw new Error(qrCodeResult.error.message)
  }

  if (assignmentForQrResult.error) {
    throw new Error(assignmentForQrResult.error.message)
  }

  if (assignmentForEmployeeResult.error) {
    throw new Error(assignmentForEmployeeResult.error.message)
  }

  if (employeeResult.error) {
    throw new Error(employeeResult.error.message)
  }

  if (userResult.error) {
    throw new Error(userResult.error.message)
  }

  const qrCode = qrCodeResult.data as LoveQrExistingCodeRow | null
  const activeAssignmentForQr = assignmentForQrResult.data as LoveQrExistingAssignmentRow | null
  const activeAssignmentForEmployee = assignmentForEmployeeResult.data as LoveQrExistingAssignmentRow | null
  const employee = employeeResult.data as LoveQrEmployeeLookupRow | null

  if (!qrCode) {
    throw new Error('El QR seleccionado ya no existe en el inventario activo de ISDIN.')
  }

  if (qrCode.estado !== 'DISPONIBLE') {
    throw new Error('Solo puedes asignar QR que hoy esten marcados como DISPONIBLE.')
  }

  if (activeAssignmentForQr) {
    throw new Error('Este QR ya tiene una asignacion activa. Refresca inventario antes de continuar.')
  }

  if (!employee) {
    throw new Error('La dermoconsejera seleccionada ya no existe.')
  }

  if (employee.puesto !== 'DERMOCONSEJERO') {
    throw new Error('Solo puedes asignar QR a empleados con puesto DERMOCONSEJERO.')
  }

  if (employee.estatus_laboral !== 'ACTIVO') {
    throw new Error('La dermoconsejera debe estar activa para recibir un QR oficial.')
  }

  if (!userResult.data) {
    throw new Error('La dermoconsejera debe tener usuario operativo en ISDIN antes de asignarle un QR.')
  }

  if (activeAssignmentForEmployee) {
    throw new Error(
      `La dermoconsejera ${employee.nombre_completo} ya tiene un QR activo asignado. Usa el flujo de reemplazo si necesitas cambiarlo.`
    )
  }

  const metadataPatch = {
    asignacion_manual_qr: true,
    asignacion_manual_actor_usuario_id: actorUsuarioId,
    asignacion_manual_fecha: effectiveAssignedAt,
    asignacion_manual_motivo: effectiveMotivo,
    asignacion_manual_observaciones: effectiveObservaciones,
    asignacion_manual_empleado_id: employee.id,
    asignacion_manual_id_nomina: employee.id_nomina,
    asignacion_manual_empleado_nombre: employee.nombre_completo,
  }

  await updateQrCodeRecord(service, {
    qrCodeId: qrCode.id,
    estado: 'ACTIVO',
    imageUrl: qrCode.imagen_url ?? null,
    imageHash: qrCode.imagen_hash ?? null,
    metadata: mergeRecord(qrCode.metadata, metadataPatch),
  })

  const assignment = await insertAssignment(service, {
    cuentaClienteId,
    qrCodigoId: qrCode.id,
    empleadoId: employee.id,
    fechaInicio: effectiveAssignedAt,
    motivo: effectiveMotivo,
    observaciones: effectiveObservaciones,
    actorUsuarioId,
    metadata: metadataPatch,
  })

  return {
    qrCodigoId: qrCode.id,
    codigo: qrCode.codigo,
    empleadoId: employee.id,
    empleadoNombre: employee.nombre_completo,
    assignmentId: assignment.id,
    fechaInicio: effectiveAssignedAt,
  }
}

export async function processLoveQrImportBatch(
  service: TypedSupabaseClient,
  options: ProcessLoveQrImportOptions
): Promise<ProcessLoveQrImportResult> {
  const manifest = parseLoveQrManifestWorkbook(options.manifestBuffer, options.manifestFileName)
  const zipImages = await loadLoveQrZipImages(options.zipBuffer)
  const prepared = await prepareLoveQrImport(service, manifest, zipImages)
  const warnings = prepared.warnings
  const errorCount = warnings.filter((warning) => warning.severity === 'error').length

  if (errorCount > 0) {
    return {
      sheetName: manifest.sheetName,
      rowsPrepared: prepared.rows.length,
      applied: false,
      warnings,
      warningCount: warnings.filter((warning) => warning.severity === 'warning').length,
      errorCount,
      result: null,
    }
  }

  const result = await applyLoveQrImport(service, {
    cuentaClienteId: options.cuentaClienteId,
    actorUsuarioId: options.actorUsuarioId,
    prepared,
    imageBucket: options.imageBucket,
    importLoteId: options.importLoteId,
    importedAt: options.importedAt,
  })

  return {
    sheetName: manifest.sheetName,
    rowsPrepared: prepared.rows.length,
    applied: true,
    warnings,
    warningCount: warnings.filter((warning) => warning.severity === 'warning').length,
    errorCount: 0,
    result,
  }
}

export async function resolveLoveQrSignedUrl(
  service: TypedSupabaseClient,
  imageUrl: string | null
) {
  if (!imageUrl) {
    return null
  }

  if (/^https?:\/\//i.test(imageUrl)) {
    return imageUrl
  }

  const location = splitStorageImageUrl(imageUrl)
  if (!location) {
    return imageUrl
  }

  const resolved = await resolveStorageRouteForLoveQr(service, location)
  return resolved?.signedUrl ?? imageUrl
}

export async function convertLoveQrImageForDashboard(image: LoveQrZipImageFile): Promise<LoveQrConvertedImage> {
    return {
        buffer: image.buffer,
        extension: 'png',
        mimeType: 'image/png',
        hash: await computeSHA256(image.buffer),
        width: null,
        height: null,
        originalExtension: image.extension,
        originalMimeType: image.mimeType,
        originalBytes: image.bytes
    };
}
