import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PDF_COMPRESSION_PROVIDER_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_BASE_URL_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_FAST_WEB_VIEW_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_IMAGE_DPI_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_IMAGE_QUALITY_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_OPTIMIZE_LEVEL_CONFIG_KEY,
  buildResolvedPdfCompressionConfiguration,
  probePdfCompressionProvider,
} from '@/lib/files/pdfCompressionConfig'
import { resolveConfiguredOcrConfiguration } from '@/lib/ocr/gemini'
import type {
  ConfiguracionSistema,
  Database,
  MisionDia,
  Producto,
} from '@/types/database'
import {
  GLOBAL_PARAMETER_DEFINITIONS,
  OCR_MODEL_CONFIG_KEY,
  OCR_PROVIDER_CONFIG_KEY,
  PAYROLL_PARAMETER_DEFINITIONS,
  RETENTION_PARAMETER_DEFINITIONS,
  TURNOS_CONFIG_KEY,
  parseTurnosCatalogo,
  resolveEditableConfigValue,
  stringifyEditableConfigValue,
  type EditableConfigDefinition,
  type EditableConfigKind,
  type TurnoCatalogoItem,
} from '../configuracionCatalog'

export interface ConfiguracionResumen {
  productosActivos: number
  cadenasActivas: number
  ciudadesActivas: number
  turnosCatalogo: number
  misionesActivas: number
  parametrosConfigurados: number
}

export interface ParametroEditableItem {
  id: string | null
  key: string
  label: string
  description: string
  module: string
  kind: EditableConfigKind
  value: string
  displayValue: string
  persisted: boolean
  min?: number
  max?: number
  step?: number
}

export interface ProductoCatalogoItem {
  id: string
  sku: string
  nombre: string
  nombreCorto: string
  categoria: string
  top30: boolean
  activo: boolean
}

export interface CadenaCatalogoItem {
  id: string
  codigo: string
  nombre: string
  factorCuotaDefault: number
  activa: boolean
}

export interface CiudadCatalogoItem {
  id: string
  nombre: string
  zona: string
  estado: string | null
  activa: boolean
}

export interface MisionCatalogoItem {
  id: string
  codigo: string | null
  instruccion: string
  orden: number | null
  peso: number
  activa: boolean
}

export interface OcrConfiguracionItem {
  preferredProvider: string | null
  preferredModel: string | null
  envProvider: string | null
  effectiveProvider: string | null
  effectiveModel: string | null
  available: boolean
  source: 'CONFIGURACION' | 'ENTORNO'
  status: 'LISTO' | 'DESHABILITADO' | 'FALTA_API_KEY' | 'NO_IMPLEMENTADO'
  message: string
}

export interface PdfCompressionConfiguracionItem {
  preferredProvider: string | null
  envProvider: string | null
  effectiveProvider: string
  source: 'CONFIGURACION' | 'ENTORNO'
  status: 'LISTO' | 'FALTA_BASE_URL' | 'INALCANZABLE'
  available: boolean
  message: string
  effectiveBaseUrl: string | null
  effectiveOptimizeLevel: string
  effectiveImageQuality: string
  effectiveImageDpi: string
  effectiveFastWebView: string
  apiKeyConfigured: boolean
  healthEndpoint: string | null
}

export interface ConfiguracionPanelData {
  resumen: ConfiguracionResumen
  productos: ProductoCatalogoItem[]
  cadenas: CadenaCatalogoItem[]
  ciudades: CiudadCatalogoItem[]
  turnos: TurnoCatalogoItem[]
  parametrosGlobales: ParametroEditableItem[]
  parametrosRetencion: ParametroEditableItem[]
  parametrosNomina: ParametroEditableItem[]
  misiones: MisionCatalogoItem[]
  ocr: OcrConfiguracionItem
  pdfCompression: PdfCompressionConfiguracionItem
  infraestructuraLista: boolean
  mensajeInfraestructura?: string
}

type CadenaRow = Database['public']['Tables']['cadena']['Row']
type CiudadRow = Database['public']['Tables']['ciudad']['Row']

function buildParametroEditable(
  definition: EditableConfigDefinition,
  row: ConfiguracionSistema | null
): ParametroEditableItem {
  const resolvedValue = resolveEditableConfigValue(definition, row?.valor)
  const displayValue =
    definition.kind === 'BOOLEAN'
      ? resolvedValue === true
        ? 'Si'
        : 'No'
      : String(resolvedValue)

  return {
    id: row?.id ?? null,
    key: definition.key,
    label: definition.label,
    description: definition.description,
    module: definition.module,
    kind: definition.kind,
    value: stringifyEditableConfigValue(definition, row?.valor),
    displayValue,
    persisted: Boolean(row),
    min: definition.min,
    max: definition.max,
    step: definition.step,
  }
}

function buildOcrConfigItem(configRows: ConfiguracionSistema[]): OcrConfiguracionItem {
  const preferredProvider = mapConfigTextValue(
    configRows.find((item) => item.clave === OCR_PROVIDER_CONFIG_KEY)?.valor
  )
  const preferredModel = mapConfigTextValue(
    configRows.find((item) => item.clave === OCR_MODEL_CONFIG_KEY)?.valor
  )
  const envProvider = mapConfigTextValue(process.env.OCR_PROVIDER)
  const source: 'CONFIGURACION' | 'ENTORNO' = preferredProvider ? 'CONFIGURACION' : 'ENTORNO'
  const resolved = resolveConfiguredOcrConfiguration({
    providerOverride: preferredProvider,
    modelOverride: preferredModel,
  })

  if (resolved.status === 'disabled') {
    return {
      preferredProvider,
      preferredModel,
      envProvider,
      effectiveProvider: null,
      effectiveModel: null,
      available: false,
      source,
      status: 'DESHABILITADO',
      message: preferredProvider
        ? 'La configuracion central deshabilita OCR documental.'
        : 'OCR documental depende del entorno y hoy esta deshabilitado.',
    }
  }

  if (resolved.status === 'gemini_missing_api_key') {
    return {
      preferredProvider,
      preferredModel,
      envProvider,
      effectiveProvider: resolved.provider,
      effectiveModel: resolved.model,
      available: false,
      source,
      status: 'FALTA_API_KEY',
      message: 'Gemini esta seleccionado, pero falta GEMINI_API_KEY en el servidor.',
    }
  }

  if (resolved.status === 'unsupported_provider') {
    return {
      preferredProvider,
      preferredModel,
      envProvider,
      effectiveProvider: resolved.provider,
      effectiveModel: null,
      available: false,
      source,
      status: 'NO_IMPLEMENTADO',
      message: `El proveedor ${resolved.provider} esta configurado, pero aun no tiene implementacion runtime.`,
    }
  }

  return {
    preferredProvider,
    preferredModel,
    envProvider,
    effectiveProvider: resolved.provider,
    effectiveModel: resolved.model,
    available: resolved.available,
    source,
    status: 'LISTO',
    message:
      source === 'CONFIGURACION'
        ? 'La configuracion central gobierna el OCR documental activo.'
        : 'El OCR documental toma el proveedor desde variables de entorno.',
  }
}

async function buildPdfCompressionConfigItem(
  configRows: ConfiguracionSistema[]
): Promise<PdfCompressionConfiguracionItem> {
  const resolved = buildResolvedPdfCompressionConfiguration({
    preferredProvider: configRows.find((item) => item.clave === PDF_COMPRESSION_PROVIDER_CONFIG_KEY)?.valor,
    preferredBaseUrl: configRows.find(
      (item) => item.clave === PDF_COMPRESSION_STIRLING_BASE_URL_CONFIG_KEY
    )?.valor,
    preferredOptimizeLevel: configRows.find(
      (item) => item.clave === PDF_COMPRESSION_STIRLING_OPTIMIZE_LEVEL_CONFIG_KEY
    )?.valor,
    preferredImageQuality: configRows.find(
      (item) => item.clave === PDF_COMPRESSION_STIRLING_IMAGE_QUALITY_CONFIG_KEY
    )?.valor,
    preferredImageDpi: configRows.find(
      (item) => item.clave === PDF_COMPRESSION_STIRLING_IMAGE_DPI_CONFIG_KEY
    )?.valor,
    preferredFastWebView: configRows.find(
      (item) => item.clave === PDF_COMPRESSION_STIRLING_FAST_WEB_VIEW_CONFIG_KEY
    )?.valor,
    envProvider: process.env.PDF_COMPRESSION_PROVIDER,
    envBaseUrl: process.env.STIRLING_PDF_BASE_URL,
    envApiKey: process.env.STIRLING_PDF_API_KEY,
    envOptimizeLevel: process.env.STIRLING_PDF_OPTIMIZE_LEVEL,
    envImageQuality: process.env.STIRLING_PDF_IMAGE_QUALITY,
    envImageDpi: process.env.STIRLING_PDF_IMAGE_DPI,
    envFastWebView: process.env.STIRLING_PDF_FAST_WEB_VIEW,
  })

  const probe = await probePdfCompressionProvider(resolved)
  const preferredProvider = mapConfigTextValue(
    configRows.find((item) => item.clave === PDF_COMPRESSION_PROVIDER_CONFIG_KEY)?.valor
  )
  const envProvider = mapConfigTextValue(process.env.PDF_COMPRESSION_PROVIDER)

  if (resolved.status === 'stirling_missing_base_url') {
    return {
      preferredProvider,
      envProvider,
      effectiveProvider: resolved.provider,
      source: resolved.source,
      status: 'FALTA_BASE_URL',
      available: false,
      message: 'Stirling PDF esta seleccionado, pero falta URL base en configuracion o entorno.',
      effectiveBaseUrl: resolved.stirlingBaseUrl,
      effectiveOptimizeLevel: resolved.optimizeLevel,
      effectiveImageQuality: resolved.imageQuality,
      effectiveImageDpi: resolved.imageDpi,
      effectiveFastWebView: resolved.fastWebView,
      apiKeyConfigured: resolved.apiKeyConfigured,
      healthEndpoint: null,
    }
  }

  if (!probe.healthy) {
    return {
      preferredProvider,
      envProvider,
      effectiveProvider: resolved.provider,
      source: resolved.source,
      status: 'INALCANZABLE',
      available: resolved.provider === 'local',
      message:
        resolved.provider === 'local'
          ? 'La compresion PDF local sigue disponible.'
          : probe.message,
      effectiveBaseUrl: resolved.stirlingBaseUrl,
      effectiveOptimizeLevel: resolved.optimizeLevel,
      effectiveImageQuality: resolved.imageQuality,
      effectiveImageDpi: resolved.imageDpi,
      effectiveFastWebView: resolved.fastWebView,
      apiKeyConfigured: resolved.apiKeyConfigured,
      healthEndpoint: probe.endpoint,
    }
  }

  return {
    preferredProvider,
    envProvider,
    effectiveProvider: resolved.provider,
    source: resolved.source,
    status: 'LISTO',
    available: true,
    message:
      resolved.provider === 'local'
        ? 'La compresion PDF usa el pipeline local con pdf-lib.'
        : `La compresion PDF usa Stirling PDF${probe.endpoint ? ` en ${probe.endpoint}` : ''}.`,
    effectiveBaseUrl: resolved.stirlingBaseUrl,
    effectiveOptimizeLevel: resolved.optimizeLevel,
    effectiveImageQuality: resolved.imageQuality,
    effectiveImageDpi: resolved.imageDpi,
    effectiveFastWebView: resolved.fastWebView,
    apiKeyConfigured: resolved.apiKeyConfigured,
    healthEndpoint: probe.endpoint,
  }
}

function mapConfigTextValue(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

export async function obtenerPanelConfiguracion(
  supabase: SupabaseClient
): Promise<ConfiguracionPanelData> {
  const [
    configuracionResult,
    productosResult,
    cadenasResult,
    ciudadesResult,
    misionesResult,
  ] = await Promise.all([
    supabase
      .from('configuracion')
      .select('id, clave, valor, descripcion, modulo')
      .order('modulo', { ascending: true })
      .order('clave', { ascending: true }),
    supabase
      .from('producto')
      .select('id, sku, nombre, nombre_corto, categoria, top_30, activo')
      .order('nombre_corto', { ascending: true }),
    supabase
      .from('cadena')
      .select('id, codigo, nombre, factor_cuota_default, activa')
      .order('nombre', { ascending: true }),
    supabase
      .from('ciudad')
      .select('id, nombre, zona, estado, activa')
      .order('nombre', { ascending: true }),
    supabase
      .from('mision_dia')
      .select('id, codigo, instruccion, orden, peso, activa')
      .order('orden', { ascending: true })
      .order('instruccion', { ascending: true }),
  ])

  const infraestructuraErrors = [
    configuracionResult.error,
    productosResult.error,
    cadenasResult.error,
    ciudadesResult.error,
    misionesResult.error,
  ]
    .filter(Boolean)
    .map((error) => error?.message)

  const configuracionRows = (configuracionResult.data ?? []) as ConfiguracionSistema[]
  const configuracionMap = new Map(configuracionRows.map((row) => [row.clave, row]))
  const productos = ((productosResult.data ?? []) as Producto[]).map((item) => ({
    id: item.id,
    sku: item.sku,
    nombre: item.nombre,
    nombreCorto: item.nombre_corto,
    categoria: item.categoria,
    top30: item.top_30,
    activo: item.activo,
  }))
  const cadenas = ((cadenasResult.data ?? []) as CadenaRow[]).map((item) => ({
    id: item.id,
    codigo: item.codigo ?? '',
    nombre: item.nombre,
    factorCuotaDefault: item.factor_cuota_default,
    activa: item.activa,
  }))
  const ciudades = ((ciudadesResult.data ?? []) as CiudadRow[]).map((item) => ({
    id: item.id,
    nombre: item.nombre,
    zona: item.zona,
    estado: item.estado,
    activa: item.activa,
  }))
  const misiones = ((misionesResult.data ?? []) as MisionDia[]).map((item) => ({
    id: item.id,
    codigo: item.codigo,
    instruccion: item.instruccion,
    orden: item.orden,
    peso: item.peso,
    activa: item.activa,
  }))
  const turnos = parseTurnosCatalogo(configuracionMap.get(TURNOS_CONFIG_KEY)?.valor)

  const parametrosGlobales = GLOBAL_PARAMETER_DEFINITIONS.map((definition) =>
    buildParametroEditable(definition, configuracionMap.get(definition.key) ?? null)
  )
  const parametrosRetencion = RETENTION_PARAMETER_DEFINITIONS.map((definition) =>
    buildParametroEditable(definition, configuracionMap.get(definition.key) ?? null)
  )
  const parametrosNomina = PAYROLL_PARAMETER_DEFINITIONS.map((definition) =>
    buildParametroEditable(definition, configuracionMap.get(definition.key) ?? null)
  )
  const pdfCompression = await buildPdfCompressionConfigItem(configuracionRows)

  return {
    resumen: {
      productosActivos: productos.filter((item) => item.activo).length,
      cadenasActivas: cadenas.filter((item) => item.activa).length,
      ciudadesActivas: ciudades.filter((item) => item.activa).length,
      turnosCatalogo: turnos.length,
      misionesActivas: misiones.filter((item) => item.activa).length,
      parametrosConfigurados: [...parametrosGlobales, ...parametrosRetencion, ...parametrosNomina].filter(
        (item) => item.persisted
      ).length,
    },
    productos,
    cadenas,
    ciudades,
    turnos,
    parametrosGlobales,
    parametrosRetencion,
    parametrosNomina,
    misiones,
    ocr: buildOcrConfigItem(configuracionRows),
    pdfCompression,
    infraestructuraLista: infraestructuraErrors.length === 0,
    mensajeInfraestructura:
      infraestructuraErrors.length > 0
        ? infraestructuraErrors.join(' ')
        : undefined,
  }
}

