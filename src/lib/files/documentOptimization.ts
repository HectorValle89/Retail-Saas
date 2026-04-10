// import path from 'node:path' // Disabled for Edge
import { PDFDocument } from 'pdf-lib'
import {
  PDF_COMPRESSION_PROVIDER_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_BASE_URL_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_FAST_WEB_VIEW_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_IMAGE_DPI_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_IMAGE_QUALITY_CONFIG_KEY,
  PDF_COMPRESSION_STIRLING_OPTIMIZE_LEVEL_CONFIG_KEY,
  buildResolvedPdfCompressionConfiguration,
  type ResolvedPdfCompressionConfiguration,
} from './pdfCompressionConfig'

export const EXPEDIENTE_IMAGE_TARGET_BYTES = 100 * 1024
export const EXPEDIENTE_PDF_TARGET_BYTES = 1_000_000
export const EXPEDIENTE_PDF_UPLOAD_MAX_BYTES = 10 * 1024 * 1024
export const EXPEDIENTE_RAW_UPLOAD_MAX_BYTES = 12 * 1024 * 1024
export const EXPEDIENTE_THUMBNAIL_TARGET_BYTES = 15 * 1024

export interface UploadedDocumentLike {
  size: number
  type?: string | null
}

export function exceedsOperationalDocumentUploadLimit(file: UploadedDocumentLike) {
  if (file.type === 'application/pdf') {
    return file.size > EXPEDIENTE_PDF_UPLOAD_MAX_BYTES
  }

  return file.size > EXPEDIENTE_RAW_UPLOAD_MAX_BYTES
}

export function buildOperationalDocumentUploadLimitMessage(
  label: string,
  file: UploadedDocumentLike
) {
  if (file.type === 'application/pdf') {
    return `El ${label} excede el limite de 10 MB. Comprimelo antes de subirlo.`
  }

  return `El ${label} excede el limite operativo de 12 MB. Reduce el origen antes de subirlo.`
}

export type DocumentOptimizationKind = 'none' | 'image-jpeg' | 'pdf-rewrite'

export interface DocumentThumbnailResult {
  buffer: Buffer
  mimeType: string
  extension: string
  bytes: number
  targetBytes: number
  targetMet: boolean
  width: number
  height: number
}

export interface DocumentOptimizationResult {
  buffer: Buffer
  mimeType: string
  extension: string
  optimizationKind: DocumentOptimizationKind
  optimized: boolean
  originalBytes: number
  optimizedBytes: number
  targetBytes: number | null
  targetMet: boolean
  notes: string[]
  thumbnail: DocumentThumbnailResult | null
  officialAssetKind: 'optimized' | 'original'
}

interface OptimizeDocumentInput {
  buffer: Buffer
  mimeType: string
  fileName: string
}

interface OptimizationTargets {
  imageTargetBytes?: number
  pdfTargetBytes?: number
  thumbnailTargetBytes?: number
}

const IMAGE_WIDTH_STEPS = [1280, 1120, 960, 840, 720, 640]
const IMAGE_QUALITY_STEPS = [84, 76, 68, 60, 52, 44, 38]
const THUMBNAIL_QUALITY_STEPS = [60, 54, 48, 42]
const IMAGE_MAX_HEIGHT = 960
const THUMBNAIL_WIDTH = 200
const THUMBNAIL_HEIGHT = 150

async function resolvePdfCompressionConfiguration(): Promise<ResolvedPdfCompressionConfiguration> {
  const envConfig = buildResolvedPdfCompressionConfiguration({
    envProvider: process.env.PDF_COMPRESSION_PROVIDER,
    envBaseUrl: process.env.STIRLING_PDF_BASE_URL,
    envApiKey: process.env.STIRLING_PDF_API_KEY,
    envOptimizeLevel: process.env.STIRLING_PDF_OPTIMIZE_LEVEL,
    envImageQuality: process.env.STIRLING_PDF_IMAGE_QUALITY,
    envImageDpi: process.env.STIRLING_PDF_IMAGE_DPI,
    envFastWebView: process.env.STIRLING_PDF_FAST_WEB_VIEW,
  })

  const adminModule = await import('@/lib/auth/admin').catch(() => null)
  const service = adminModule?.obtenerClienteAdmin()?.service ?? null

  if (!service) {
    return envConfig
  }

  const { data, error } = await service
    .from('configuracion')
    .select('clave, valor')
    .in('clave', [
      PDF_COMPRESSION_PROVIDER_CONFIG_KEY,
      PDF_COMPRESSION_STIRLING_BASE_URL_CONFIG_KEY,
      PDF_COMPRESSION_STIRLING_OPTIMIZE_LEVEL_CONFIG_KEY,
      PDF_COMPRESSION_STIRLING_IMAGE_QUALITY_CONFIG_KEY,
      PDF_COMPRESSION_STIRLING_IMAGE_DPI_CONFIG_KEY,
      PDF_COMPRESSION_STIRLING_FAST_WEB_VIEW_CONFIG_KEY,
    ])

  if (error) {
    return envConfig
  }

  const configMap = new Map(
    ((data ?? []) as Array<{ clave: string; valor: unknown }>).map((item) => [item.clave, item.valor])
  )

  return buildResolvedPdfCompressionConfiguration({
    preferredProvider: configMap.get(PDF_COMPRESSION_PROVIDER_CONFIG_KEY),
    preferredBaseUrl: configMap.get(PDF_COMPRESSION_STIRLING_BASE_URL_CONFIG_KEY),
    preferredOptimizeLevel: configMap.get(PDF_COMPRESSION_STIRLING_OPTIMIZE_LEVEL_CONFIG_KEY),
    preferredImageQuality: configMap.get(PDF_COMPRESSION_STIRLING_IMAGE_QUALITY_CONFIG_KEY),
    preferredImageDpi: configMap.get(PDF_COMPRESSION_STIRLING_IMAGE_DPI_CONFIG_KEY),
    preferredFastWebView: configMap.get(PDF_COMPRESSION_STIRLING_FAST_WEB_VIEW_CONFIG_KEY),
    envProvider: process.env.PDF_COMPRESSION_PROVIDER,
    envBaseUrl: process.env.STIRLING_PDF_BASE_URL,
    envApiKey: process.env.STIRLING_PDF_API_KEY,
    envOptimizeLevel: process.env.STIRLING_PDF_OPTIMIZE_LEVEL,
    envImageQuality: process.env.STIRLING_PDF_IMAGE_QUALITY,
    envImageDpi: process.env.STIRLING_PDF_IMAGE_DPI,
    envFastWebView: process.env.STIRLING_PDF_FAST_WEB_VIEW,
  })
}

function getExtensionFromMimeType(mimeType: string) {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'application/pdf':
      return 'pdf'
    default:
      return 'bin'
  }
}

function normalizeWidthSteps(sourceWidth: number | undefined) {
  const width = sourceWidth ?? IMAGE_WIDTH_STEPS[0]
  return Array.from(new Set([Math.min(width, IMAGE_WIDTH_STEPS[0]), ...IMAGE_WIDTH_STEPS])).filter(
    (value) => value > 0 && value <= width
  )
}

async function optimizePdfDocument(
  { buffer, fileName }: OptimizeDocumentInput,
  targets?: OptimizationTargets
): Promise<DocumentOptimizationResult> {
  const pdfTargetBytes = targets?.pdfTargetBytes ?? EXPEDIENTE_PDF_TARGET_BYTES
  return {
    buffer,
    mimeType: 'application/pdf',
    extension: 'pdf',
    optimizationKind: 'pdf-rewrite',
    optimized: false,
    originalBytes: buffer.length,
    optimizedBytes: buffer.length,
    targetBytes: pdfTargetBytes,
    targetMet: buffer.length <= pdfTargetBytes,
    notes: [`file=${'documento'}`, 'pdf_passthrough', 'compression_disabled'],
    thumbnail: null,
    officialAssetKind: 'original',
  }
}

async function optimizePdfDocumentLocal(
  { buffer, fileName }: OptimizeDocumentInput,
  targets?: OptimizationTargets
): Promise<DocumentOptimizationResult> {
  const pdfTargetBytes = targets?.pdfTargetBytes ?? EXPEDIENTE_PDF_TARGET_BYTES

  try {
    const source = await PDFDocument.load(buffer)
    const optimized = await PDFDocument.create()
    const pages = await optimized.copyPages(source, source.getPageIndices())
    pages.forEach((page) => optimized.addPage(page))

    optimized.setTitle('')
    optimized.setAuthor('')
    optimized.setSubject('')
    optimized.setKeywords([])
    optimized.setProducer('Retail document optimization pipeline')
      optimized.setCreator('Beteele One')

    const optimizedBuffer = Buffer.from(await optimized.save({ useObjectStreams: true }))
    const finalBuffer = optimizedBuffer.length <= buffer.length ? optimizedBuffer : buffer

    return {
      buffer: finalBuffer,
      mimeType: 'application/pdf',
      extension: 'pdf',
      optimizationKind: 'pdf-rewrite',
      optimized: finalBuffer.length < buffer.length,
      originalBytes: buffer.length,
      optimizedBytes: finalBuffer.length,
      targetBytes: pdfTargetBytes,
      targetMet: finalBuffer.length <= pdfTargetBytes,
      notes: [
        `file=${'documento'}`,
        'provider=local',
        finalBuffer.length < buffer.length ? 'object_streams_enabled' : 'best_effort_no_gain',
      ],
      thumbnail: null,
      officialAssetKind: finalBuffer.length < buffer.length ? 'optimized' : 'original',
    }
  } catch (error) {
    return {
      buffer,
      mimeType: 'application/pdf',
      extension: 'pdf',
      optimizationKind: 'pdf-rewrite',
      optimized: false,
      originalBytes: buffer.length,
      optimizedBytes: buffer.length,
      targetBytes: pdfTargetBytes,
      targetMet: buffer.length <= pdfTargetBytes,
      notes: ['provider=local', error instanceof Error ? error.message : 'pdf_optimization_failed'],
      thumbnail: null,
      officialAssetKind: 'original',
    }
  }
}

export async function optimizeExpedienteDocument(
  input: OptimizeDocumentInput
): Promise<DocumentOptimizationResult> {
  if (input.mimeType === 'application/pdf') {
    return optimizePdfDocument(input)
  }

  if (input.mimeType.startsWith('image/')) {
    return optimizeImageDocument(input)
  }

  return {
    buffer: input.buffer,
    mimeType: input.mimeType || 'application/octet-stream',
    extension: getExtensionFromMimeType(input.mimeType || 'application/octet-stream'),
    optimizationKind: 'none',
    optimized: false,
    originalBytes: input.buffer.length,
    optimizedBytes: input.buffer.length,
    targetBytes: null,
    targetMet: true,
    notes: ['unsupported_mime_type'],
    thumbnail: null,
    officialAssetKind: 'original',
  }
}

export async function compressImage(file: File, maxKB = 100) {
  return optimizeImageDocument(
    {
      buffer: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type || 'application/octet-stream',
      fileName: file.name,
    },
    {
      imageTargetBytes: maxKB * 1024,
      thumbnailTargetBytes: EXPEDIENTE_THUMBNAIL_TARGET_BYTES,
    }
  )
}

export async function generateThumbnail(file: File, maxKB = 20) {
  const optimized = await optimizeImageDocument(
    {
      buffer: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type || 'application/octet-stream',
      fileName: file.name,
    },
    {
      imageTargetBytes: EXPEDIENTE_IMAGE_TARGET_BYTES,
      thumbnailTargetBytes: maxKB * 1024,
    }
  )

  return optimized.thumbnail
}

export async function compressPDF(file: File, maxKB = 1024) {
  return optimizePdfDocument(
    {
      buffer: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type || 'application/pdf',
      fileName: file.name,
    },
    {
      pdfTargetBytes: maxKB * 1024,
    }
  )
}

async function optimizeImageDocument(input: OptimizeDocumentInput, targets?: OptimizationTargets): Promise<DocumentOptimizationResult> {
    return {
        buffer: input.buffer,
        mimeType: input.mimeType,
        extension: 'jpg',
        optimizationKind: 'none',
        optimized: false,
        originalBytes: input.buffer.length,
        optimizedBytes: input.buffer.length,
        targetBytes: null,
        targetMet: true,
        notes: ['image_optimization_disabled_for_edge_runtime'],
        thumbnail: null,
        officialAssetKind: 'original'
    };
}
