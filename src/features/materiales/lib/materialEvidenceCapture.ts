'use client'

const MATERIAL_EVIDENCE_TARGET_BYTES = 100 * 1024
const MATERIAL_EVIDENCE_MAX_DIMENSION = 1280
const MATERIAL_EVIDENCE_QUALITY_STEPS = [0.8, 0.74, 0.68, 0.62, 0.56]

async function loadImageSource(file: File) {
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    return createImageBitmap(file)
  }

  const image = document.createElement('img')
  const objectUrl = URL.createObjectURL(file)

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('No fue posible abrir la evidencia capturada.'))
      image.src = objectUrl
    })

    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error('No fue posible generar la evidencia sellada.'))
        return
      }

      resolve(value)
    }, 'image/jpeg', quality)
  })
}

function truncateLine(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`
}

export async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('No fue posible preparar la imagen capturada.'))
    reader.readAsDataURL(file)
  })
}

export async function stampMaterialEvidencePhoto(
  file: File,
  {
    capturedAt,
    pdvLabel,
    flowLabel,
  }: {
    capturedAt: string
    pdvLabel: string
    flowLabel:
      | 'Recepcion de material'
      | 'Evidencia de mercadeo'
      | 'Entrega de material'
      | 'Evidencia en PDV'
      | 'Ticket de compra'
  }
) {
  const imageSource = await loadImageSource(file)
  const sourceWidth = imageSource instanceof HTMLImageElement ? imageSource.naturalWidth : imageSource.width
  const sourceHeight = imageSource instanceof HTMLImageElement ? imageSource.naturalHeight : imageSource.height
  const scale = Math.min(1, MATERIAL_EVIDENCE_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('No fue posible inicializar el sello de la evidencia.')
  }

  context.drawImage(imageSource as CanvasImageSource, 0, 0, width, height)

  const lines = [
    `${flowLabel} · Beteele One`,
    truncateLine(`PDV: ${pdvLabel}`, 64),
    `Captura: ${new Date(capturedAt).toLocaleString('es-MX')}`,
  ]

  const fontSize = Math.max(20, Math.round(width * 0.022))
  const lineHeight = Math.round(fontSize * 1.4)
  const padding = Math.max(16, Math.round(width * 0.02))
  const boxHeight = padding * 2 + lineHeight * lines.length

  context.fillStyle = 'rgba(15, 23, 42, 0.82)'
  context.fillRect(0, height - boxHeight, width, boxHeight)
  context.fillStyle = '#F8FAFC'
  context.font = `600 ${fontSize}px sans-serif`
  context.textBaseline = 'top'

  lines.forEach((line, index) => {
    context.fillText(line, padding, height - boxHeight + padding + lineHeight * index)
  })

  let blob = await canvasToJpegBlob(canvas, MATERIAL_EVIDENCE_QUALITY_STEPS[0])

  for (const quality of MATERIAL_EVIDENCE_QUALITY_STEPS.slice(1)) {
    if (blob.size <= MATERIAL_EVIDENCE_TARGET_BYTES) {
      break
    }

    blob = await canvasToJpegBlob(canvas, quality)
  }

  const optimizedFile = new File([blob], file.name.replace(/\.[^.]+$/, '') + '-stamped.jpg', {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })

  return {
    file: optimizedFile,
    targetBytes: MATERIAL_EVIDENCE_TARGET_BYTES,
    targetMet: blob.size <= MATERIAL_EVIDENCE_TARGET_BYTES,
  }
}
