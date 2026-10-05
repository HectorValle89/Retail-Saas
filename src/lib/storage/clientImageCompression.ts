import imageCompression from 'browser-image-compression';

export interface CompressionOptions {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
  useWebWorker?: boolean;
  fileType?: string;
  initialQuality?: number;
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxSizeMB: 0.12, // ~120 KB máximo para subida instantánea en redes móviles 2G/3G/poca señal
  maxWidthOrHeight: 1280, // Excelente legibilidad de tickets y empaques en PowerPoint
  useWebWorker: true, // Libera el hilo principal en celulares
  fileType: 'image/jpeg', // Formato JPEG universalmente compatible con PowerPoint (.pptx), Excel y navegadores
  initialQuality: 0.75, // Balance óptimo entre nitidez y compresión ultra liviana
};

const HEIF_FILE_PATTERN = /\.(heic|heif|hif)$/i;
const HEIF_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

export function isHeifLikeFile(file: File) {
  return HEIF_MIME_TYPES.has(file.type.toLowerCase()) || HEIF_FILE_PATTERN.test(file.name);
}

export async function convertHeifToJpeg(file: File): Promise<File> {
  try {
    const { heicTo, isHeic } = await import('heic-to');
    const shouldConvert = isHeifLikeFile(file) || (await isHeic(file));
    if (!shouldConvert) return file;

    const converted = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality: 0.8,
    });

    return new File([converted], file.name.replace(/\.(heic|heif|hif)$/i, '') + '-converted.jpg', {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (error) {
    console.error('Error al convertir HEIF/HEIC:', error);
    return file;
  }
}

/**
 * Compresor de respaldo puro en Canvas HTML5
 * Se ejecuta si browser-image-compression falla por memoria o compatibilidad en celulares Android/iOS.
 */
async function compressWithCanvasFallback(
  file: File,
  maxDimension = 1280,
  quality = 0.75
): Promise<File> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return resolve(file);
    }

    const reader = new FileReader();
    reader.onerror = () => resolve(file);
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => resolve(file);
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(file);

          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob) return resolve(file);
              const newFileName = file.name.replace(/\.[^/.]+$/, '.jpg');
              const finalFile = new File([blob], newFileName, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(finalFile);
            },
            'image/jpeg',
            quality
          );
        } catch {
          resolve(file);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Comprime y optimiza un archivo de imagen directo en el navegador (PWA / Cliente).
 * Convierte formatos HEIC de Samsung/iPhone a JPEG liviano (~100 KB) antes de subirlo a R2/Supabase.
 */
export async function compressImageForUpload(
  file: File,
  customOptions?: CompressionOptions
): Promise<File> {
  let normalizedFile = file;

  // Si es un archivo HEIF/HEIC, lo convertimos a JPEG primero
  if (isHeifLikeFile(file)) {
    normalizedFile = await convertHeifToJpeg(file);
  }

  // Asegurarnos que solo atacamos imágenes, sino regresamos el original intocado
  if (!normalizedFile.type.startsWith('image/')) {
    return normalizedFile;
  }

  const options = { ...DEFAULT_OPTIONS, ...customOptions };

  try {
    // Intento 1: browser-image-compression con WebWorker
    const compressedBlob = await imageCompression(normalizedFile, options as any);

    // Formatear extensión visual a .jpg para PowerPoint y navegadores
    const newFileName = normalizedFile.name.replace(/\.[^/.]+$/, '.jpg');

    const finalFile = new File([compressedBlob], newFileName, {
      type: options.fileType || 'image/jpeg',
      lastModified: Date.now(),
    });

    return finalFile;
  } catch (error) {
    console.warn('Error en compresor primario, ejecutando fallback en Canvas:', error);
    // Intento 2: Fallback robusto en Canvas HTML5 nativo
    return compressWithCanvasFallback(
      normalizedFile,
      options.maxWidthOrHeight ?? 1280,
      options.initialQuality ?? 0.75
    );
  }
}
