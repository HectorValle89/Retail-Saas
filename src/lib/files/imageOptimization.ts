import imageCompression from 'browser-image-compression';

export interface ImageOptimizationOptions {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
  useWebWorker?: boolean;
  initialQuality?: number;
}

/**
 * Checks if a file is an image that should be converted or compressed to JPG.
 */
export function isImageFile(file: File): boolean {
  if (!file) return false;
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return (
    mime.startsWith('image/') ||
    /\.(heic|heif|png|webp|bmp|tiff|jpg|jpeg|gif)$/i.test(name)
  );
}

/**
 * Universal Image Converter & Optimizer for Beteele Platform.
 * Converts ANY image format (HEIC, HEIF, PNG, WEBP, BMP, TIFF, heavy JPEG) 
 * into a minimal-weight, crystal-clear JPG (image/jpeg) file before uploading.
 */
export async function convertAndOptimizeImageToJpeg(
  file: File,
  customOptions?: ImageOptimizationOptions
): Promise<File> {
  if (!file || !isImageFile(file)) {
    return file;
  }

  // Target options: max ~350KB weight, max 1920px dimension, 82% JPEG quality
  const options = {
    maxSizeMB: customOptions?.maxSizeMB ?? 0.35,
    maxWidthOrHeight: customOptions?.maxWidthOrHeight ?? 1920,
    useWebWorker: customOptions?.useWebWorker ?? true,
    fileType: 'image/jpeg',
    initialQuality: customOptions?.initialQuality ?? 0.82,
  };

  try {
    let fileToCompress = file;

    const mime = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    const isHeic = mime.includes('heic') || mime.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif');

    // 1. Convert HEIC/HEIF files to JPEG Blob first
    if (isHeic) {
      try {
        const heicTo = await import('heic-to');
        const convertedBlob = await heicTo.heicTo({
          blob: file,
          type: 'image/jpeg',
          quality: 0.85,
        });
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        fileToCompress = new File([convertedBlob], `${baseName}.jpg`, { type: 'image/jpeg' });
      } catch (heicErr) {
        console.warn('[ImageOptimizer] heic-to conversion warning, falling back to canvas compression:', heicErr);
      }
    }

    // 2. Perform smart compression & JPEG conversion using browser-image-compression
    const compressedBlob = await imageCompression(fileToCompress, options);

    // 3. Construct clean .jpg File
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const finalFileName = `${baseName}.jpg`;

    return new File([compressedBlob], finalFileName, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn('[ImageOptimizer] Compression fallback to original file:', err);
    return file;
  }
}
