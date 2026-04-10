import imageCompression from 'browser-image-compression'

export interface CompressionOptions {
  maxSizeMB?: number
  maxWidthOrHeight?: number
  useWebWorker?: boolean
  fileType?: string
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxSizeMB: 0.2, // ~200 KB
  maxWidthOrHeight: 1280, // Resolucion suficiente para leer facturas/tickets
  useWebWorker: true, // Libera el hilo principal (no traba el UI del telefono)
  fileType: 'image/webp', // Formato de google con maximo ratio de compresion
}

/**
 * Comprime un archivo de imagen directo en el navegador (PWA / Cliente).
 * Reduce una foto de 10 MB salida de tapar a camara a menos de 200 KB (WebP).
 * Ahorrando 98% del ancho de banda y transferencia (Egress) en Supabase/R2.
 */
export async function compressImageForUpload(
  file: File,
  customOptions?: CompressionOptions
): Promise<File> {
  // Asegurarnos que solo atacamos imagenes, sino regresamos el original intocado
  if (!file.type.startsWith('image/')) {
    return file
  }

  const options = { ...DEFAULT_OPTIONS, ...customOptions }

  try {
    const compressedBlob = await imageCompression(file, options as any)

    // El resultado de `imageCompression` es un Blob, debemos empaquetarlo de vuelta 
    // como File respetando el nuevo mimetype
    const newFileName = file.name.replace(/\.[^/.]+$/, '.webp') // Cambiamos la extension visualmente a .webp

    const finalFile = new File([compressedBlob], newFileName, {
      type: options.fileType || compressedBlob.type,
      lastModified: Date.now(),
    })

    return finalFile
  } catch (error) {
    console.error('Error durante la compresión de imagen en cliente:', error)
    // Si falla el WebWorker o hay un error de memoria en el cel, 
    // hacemos fallback regresando el archivo original.
    return file
  }
}
