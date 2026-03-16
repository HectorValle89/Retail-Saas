import path from 'node:path'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'

export const EXPEDIENTE_IMAGE_TARGET_BYTES = 100 * 1024
export const EXPEDIENTE_PDF_TARGET_BYTES = 1_000_000
export const EXPEDIENTE_RAW_UPLOAD_MAX_BYTES = 12 * 1024 * 1024

export type DocumentOptimizationKind = 'none' | 'image-jpeg' | 'pdf-rewrite'

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
}

interface OptimizeDocumentInput {
  buffer: Buffer
  mimeType: string
  fileName: string
}

const IMAGE_WIDTH_STEPS = [1800, 1600, 1400, 1280, 1120, 960, 840, 720]
const IMAGE_QUALITY_STEPS = [84, 76, 68, 60, 52, 44, 38]

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

async function optimizeImageDocument({ buffer }: OptimizeDocumentInput): Promise<DocumentOptimizationResult> {
  const image = sharp(buffer, { failOn: 'none' }).rotate()
  const metadata = await image.metadata()
  const widthSteps = normalizeWidthSteps(metadata.width)

  let bestBuffer = buffer
  let bestWidth = metadata.width ?? null
  let bestQuality = 100

  for (const width of widthSteps) {
    for (const quality of IMAGE_QUALITY_STEPS) {
      let pipeline = sharp(buffer, { failOn: 'none' }).rotate()

      if (metadata.hasAlpha) {
        pipeline = pipeline.flatten({ background: '#ffffff' })
      }

      const candidate = await pipeline
        .resize({ width, withoutEnlargement: true, fit: 'inside' })
        .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' })
        .toBuffer()

      if (candidate.length < bestBuffer.length) {
        bestBuffer = candidate
        bestWidth = width
        bestQuality = quality
      }

      if (candidate.length <= EXPEDIENTE_IMAGE_TARGET_BYTES) {
        return {
          buffer: candidate,
          mimeType: 'image/jpeg',
          extension: 'jpg',
          optimizationKind: 'image-jpeg',
          optimized: true,
          originalBytes: buffer.length,
          optimizedBytes: candidate.length,
          targetBytes: EXPEDIENTE_IMAGE_TARGET_BYTES,
          targetMet: true,
          notes: [`width=${width}`, `quality=${quality}`],
        }
      }
    }
  }

  return {
    buffer: bestBuffer,
    mimeType: 'image/jpeg',
    extension: 'jpg',
    optimizationKind: 'image-jpeg',
    optimized: bestBuffer.length < buffer.length || metadata.format !== 'jpeg',
    originalBytes: buffer.length,
    optimizedBytes: bestBuffer.length,
    targetBytes: EXPEDIENTE_IMAGE_TARGET_BYTES,
    targetMet: bestBuffer.length <= EXPEDIENTE_IMAGE_TARGET_BYTES,
    notes: [
      bestWidth ? `width=${bestWidth}` : 'width=unknown',
      `quality=${bestQuality}`,
      bestBuffer.length <= EXPEDIENTE_IMAGE_TARGET_BYTES ? 'target_met' : 'best_effort',
    ],
  }
}

async function optimizePdfDocument({ buffer, fileName }: OptimizeDocumentInput): Promise<DocumentOptimizationResult> {
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
    optimized.setCreator('Retail field force platform')

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
      targetBytes: EXPEDIENTE_PDF_TARGET_BYTES,
      targetMet: finalBuffer.length <= EXPEDIENTE_PDF_TARGET_BYTES,
      notes: [
        `file=${path.basename(fileName)}`,
        finalBuffer.length < buffer.length ? 'object_streams_enabled' : 'best_effort_no_gain',
      ],
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
      targetBytes: EXPEDIENTE_PDF_TARGET_BYTES,
      targetMet: buffer.length <= EXPEDIENTE_PDF_TARGET_BYTES,
      notes: [error instanceof Error ? error.message : 'pdf_optimization_failed'],
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
  }
}