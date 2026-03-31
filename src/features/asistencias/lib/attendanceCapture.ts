export type AttendanceGpsState =
  | 'PENDIENTE'
  | 'DENTRO_GEOCERCA'
  | 'FUERA_GEOCERCA'
  | 'SIN_GPS'

export interface CapturedPosition {
  latitud: number | null
  longitud: number | null
  precision: number | null
  distanciaMetros: number | null
  dentroGeocerca: boolean | null
  capturadaEn: string
}

export interface SelfieCapture {
  file: File
  previewUrl: string
  hash: string
  fileName: string
  fileSize: number
  mimeType: string
  capturadaEn: string
  latitud: number | null
  longitud: number | null
  timestampStamped: boolean
  captureSource: 'native-getusermedia'
  originalBytes: number
  targetBytes: number
  targetMet: boolean
}

export function getLocalDateValue() {
  return new Intl.DateTimeFormat('en-CA').format(new Date())
}

export function getLocalTimeValue() {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

export function calcularDistanciaMetros(
  latitudOrigen: number,
  longitudOrigen: number,
  latitudDestino: number,
  longitudDestino: number
) {
  const radioTierra = 6371000
  const toRadians = (value: number) => (value * Math.PI) / 180
  const deltaLatitud = toRadians(latitudDestino - latitudOrigen)
  const deltaLongitud = toRadians(longitudDestino - longitudOrigen)
  const latitudOrigenRad = toRadians(latitudOrigen)
  const latitudDestinoRad = toRadians(latitudDestino)

  const haversine =
    Math.sin(deltaLatitud / 2) * Math.sin(deltaLatitud / 2) +
    Math.sin(deltaLongitud / 2) *
      Math.sin(deltaLongitud / 2) *
      Math.cos(latitudOrigenRad) *
      Math.cos(latitudDestinoRad)

  return 2 * radioTierra * Math.asin(Math.sqrt(haversine))
}

export async function calcularHashArchivo(file: File) {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('Este navegador no soporta hashing seguro para selfie.')
  }

  const buffer = await file.arrayBuffer()
  const digest = await window.crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

async function loadImageSource(file: File) {
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    return createImageBitmap(file)
  }

  const image = document.createElement('img')
  const objectUrl = URL.createObjectURL(file)

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('No fue posible abrir la selfie capturada.'))
      image.src = objectUrl
    })

    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const ATTENDANCE_SELFIE_TARGET_BYTES = 100 * 1024
const ATTENDANCE_SELFIE_MAX_DIMENSION = 1280
const ATTENDANCE_SELFIE_QUALITY_STEPS = [0.72, 0.66, 0.6, 0.54, 0.48]

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error('No fue posible generar la selfie sellada.'))
        return
      }

      resolve(value)
    }, 'image/jpeg', quality)
  })
}

export async function stampAttendanceSelfie(
  file: File,
  {
    capturedAt,
    latitude,
    longitude,
    flowLabel,
  }: {
    capturedAt: string
    latitude: number | null
    longitude: number | null
    flowLabel: 'Check-in' | 'Check-out' | 'Evidencia'
  }
) {
  const imageSource = await loadImageSource(file)
  const sourceWidth = imageSource instanceof HTMLImageElement ? imageSource.naturalWidth : imageSource.width
  const sourceHeight = imageSource instanceof HTMLImageElement ? imageSource.naturalHeight : imageSource.height
  const scale = Math.min(1, ATTENDANCE_SELFIE_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('No fue posible inicializar el sello visual de la selfie.')
  }

  context.drawImage(imageSource as CanvasImageSource, 0, 0, width, height)

  const lines = [
    `${flowLabel} Beteele One`,
    `Captura: ${new Date(capturedAt).toLocaleString('es-MX')}`,
    latitude !== null && longitude !== null
      ? `GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
      : 'GPS: no disponible',
  ]

  const fontSize = Math.max(20, Math.round(width * 0.022))
  const lineHeight = Math.round(fontSize * 1.4)
  const padding = Math.max(16, Math.round(width * 0.02))
  const boxHeight = padding * 2 + lineHeight * lines.length

  context.fillStyle = 'rgba(15, 23, 42, 0.78)'
  context.fillRect(0, height - boxHeight, width, boxHeight)
  context.fillStyle = '#F8FAFC'
  context.font = `600 ${fontSize}px sans-serif`
  context.textBaseline = 'top'

  lines.forEach((line, index) => {
    context.fillText(line, padding, height - boxHeight + padding + lineHeight * index)
  })

  let blob = await canvasToJpegBlob(canvas, ATTENDANCE_SELFIE_QUALITY_STEPS[0])

  for (const quality of ATTENDANCE_SELFIE_QUALITY_STEPS.slice(1)) {
    if (blob.size <= ATTENDANCE_SELFIE_TARGET_BYTES) {
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
    targetBytes: ATTENDANCE_SELFIE_TARGET_BYTES,
    targetMet: blob.size <= ATTENDANCE_SELFIE_TARGET_BYTES,
  }
}

export async function captureAttendancePosition({
  geocercaLatitud,
  geocercaLongitud,
  geocercaRadioMetros,
}: {
  geocercaLatitud: number | null
  geocercaLongitud: number | null
  geocercaRadioMetros: number | null
}): Promise<{
  position: CapturedPosition
  estadoGps: AttendanceGpsState
}> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return {
      position: {
        latitud: null,
        longitud: null,
        precision: null,
        distanciaMetros: null,
        dentroGeocerca: null,
        capturadaEn: new Date().toISOString(),
      },
      estadoGps: 'SIN_GPS',
    }
  }

  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
  }).catch(() => null)

  if (!position) {
    return {
      position: {
        latitud: null,
        longitud: null,
        precision: null,
        distanciaMetros: null,
        dentroGeocerca: null,
        capturadaEn: new Date().toISOString(),
      },
      estadoGps: 'SIN_GPS',
    }
  }

  const latitud = position.coords.latitude
  const longitud = position.coords.longitude
  const precision = Number.isFinite(position.coords.accuracy) ? Number(position.coords.accuracy) : null

  if (
    geocercaLatitud === null ||
    geocercaLongitud === null ||
    geocercaRadioMetros === null ||
    !Number.isFinite(geocercaLatitud) ||
    !Number.isFinite(geocercaLongitud) ||
    !Number.isFinite(geocercaRadioMetros)
  ) {
    return {
      position: {
        latitud,
        longitud,
        precision,
        distanciaMetros: null,
        dentroGeocerca: null,
        capturadaEn: new Date().toISOString(),
      },
      estadoGps: 'PENDIENTE',
    }
  }

  const distanciaMetros = calcularDistanciaMetros(latitud, longitud, geocercaLatitud, geocercaLongitud)
  const dentroGeocerca = distanciaMetros <= geocercaRadioMetros

  return {
    position: {
      latitud,
      longitud,
      precision,
      distanciaMetros,
      dentroGeocerca,
      capturadaEn: new Date().toISOString(),
    },
    estadoGps: dentroGeocerca ? 'DENTRO_GEOCERCA' : 'FUERA_GEOCERCA',
  }
}
