export const EXPEDIENTE_IMAGE_TARGET_BYTES = 100 * 1024;
export const EXPEDIENTE_PDF_TARGET_BYTES = 1_000_000;
export const EXPEDIENTE_PDF_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const EXPEDIENTE_RAW_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;
export const EXPEDIENTE_THUMBNAIL_TARGET_BYTES = 15 * 1024;

export interface UploadedDocumentLike {
  size: number;
  type?: string | null;
}

export function exceedsOperationalDocumentUploadLimit(file: UploadedDocumentLike) {
  if (file.type === 'application/pdf') {
    return file.size > EXPEDIENTE_PDF_UPLOAD_MAX_BYTES;
  }

  return file.size > EXPEDIENTE_RAW_UPLOAD_MAX_BYTES;
}

export function buildOperationalDocumentUploadLimitMessage(
  label: string,
  file: UploadedDocumentLike
) {
  if (file.type === 'application/pdf') {
    return `El ${label} excede el limite de 10 MB. Comprimelo antes de subirlo.`;
  }

  return `El ${label} excede el limite operativo de 12 MB. Reduce el origen antes de subirlo.`;
}

export type DocumentOptimizationKind = 'none' | 'image-jpeg' | 'pdf-rewrite';

export interface DocumentThumbnailResult {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  bytes: number;
  targetBytes: number;
  targetMet: boolean;
  width: number;
  height: number;
}

export interface DocumentOptimizationResult {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  optimizationKind: DocumentOptimizationKind;
  optimized: boolean;
  originalBytes: number;
  optimizedBytes: number;
  targetBytes: number | null;
  targetMet: boolean;
  notes: string[];
  thumbnail: DocumentThumbnailResult | null;
  officialAssetKind: 'optimized' | 'original';
}

interface OptimizeDocumentInput {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

interface OptimizationTargets {
  imageTargetBytes?: number;
  pdfTargetBytes?: number;
  thumbnailTargetBytes?: number;
}

function getExtensionFromMimeType(mimeType: string) {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'bin';
  }
}

async function optimizePdfDocument(
  { buffer }: OptimizeDocumentInput,
  targets?: OptimizationTargets
): Promise<DocumentOptimizationResult> {
  const pdfTargetBytes = targets?.pdfTargetBytes ?? EXPEDIENTE_PDF_TARGET_BYTES;
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
    notes: ['file=documento', 'pdf_passthrough', 'compression_disabled'],
    thumbnail: null,
    officialAssetKind: 'original',
  };
}

export async function optimizeExpedienteDocument(
  input: OptimizeDocumentInput
): Promise<DocumentOptimizationResult> {
  if (input.mimeType === 'application/pdf') {
    return optimizePdfDocument(input);
  }

  if (input.mimeType.startsWith('image/')) {
    return optimizeImageDocument(input);
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
  };
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
  );
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
  );

  return optimized.thumbnail;
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
  );
}

async function optimizeImageDocument(
  input: OptimizeDocumentInput,
  targets?: OptimizationTargets
): Promise<DocumentOptimizationResult> {
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
    officialAssetKind: 'original',
  };
}
