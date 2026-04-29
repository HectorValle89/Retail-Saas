export type PermissionKind = 'camera' | 'geolocation'

export interface PermissionRecoveryState {
  kind: PermissionKind
  title: string
  message: string
  steps: string[]
  retryLabel: string
  requiresSettings: boolean
}

function buildSettingsSteps(permissionLabel: string) {
  return [
    `Toca "Volver a intentar" para que Beteele vuelva a pedir permiso de ${permissionLabel}.`,
    `Si tu telefono ya no muestra el aviso, abre el candado o menu del navegador y activa ${permissionLabel}.`,
    'Regresa a la app y toca nuevamente el boton azul para continuar.',
  ]
}

export function getCameraPermissionRecoveryState(error: unknown): PermissionRecoveryState {
  const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : ''

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return {
      kind: 'camera',
      title: 'Activa el permiso de camara',
      message:
        'Beteele no pudo usar la camara. Vamos a volver a pedir el permiso y, si el navegador ya no muestra la ventana, te indicaremos como activarlo en un toque.',
      steps: buildSettingsSteps('camara'),
      retryLabel: 'Volver a pedir camara',
      requiresSettings: true,
    }
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      kind: 'camera',
      title: 'No encontramos una camara disponible',
      message:
        'El navegador no detecto ninguna camara en este dispositivo. Revisa si otra app la esta usando o cambia de camara.',
      steps: [
        'Cierra otras apps que puedan estar usando la camara.',
        'Toca "Cambiar camara" o vuelve a intentar.',
        'Si sigue igual, reinicia el navegador o el telefono.',
      ],
      retryLabel: 'Reintentar camara',
      requiresSettings: false,
    }
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      kind: 'camera',
      title: 'La camara esta ocupada',
      message:
        'Otra app o pestaña esta usando la camara en este momento y Beteele no puede abrirla todavia.',
      steps: [
        'Cierra la otra app o pestaña que este usando la camara.',
        'Regresa aqui y toca "Reintentar camara".',
      ],
      retryLabel: 'Reintentar camara',
      requiresSettings: false,
    }
  }

  return {
    kind: 'camera',
    title: 'No pudimos abrir la camara',
    message:
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : 'No fue posible acceder a la camara del dispositivo.',
    steps: [
      'Toca "Reintentar camara" para volver a iniciar la captura.',
      'Si el problema continua, revisa permisos y vuelve a abrir la app.',
    ],
    retryLabel: 'Reintentar camara',
    requiresSettings: false,
  }
}

export function getGeolocationPermissionRecoveryState(error: unknown): PermissionRecoveryState {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'number'
      ? (error as { code: number }).code
      : null

  if (code === 1) {
    return {
      kind: 'geolocation',
      title: 'Activa tu GPS',
      message:
        'Beteele no pudo usar tu ubicacion. Vamos a volver a pedir el permiso de GPS y, si el navegador ya no muestra el aviso, te guiaremos para activarlo rapido.',
      steps: buildSettingsSteps('ubicacion'),
      retryLabel: 'Volver a pedir GPS',
      requiresSettings: true,
    }
  }

  if (code === 2) {
    return {
      kind: 'geolocation',
      title: 'No pudimos leer tu ubicacion',
      message:
        'El telefono no pudo obtener una ubicacion valida en este momento. Revisa que el GPS del dispositivo este encendido.',
      steps: [
        'Activa la ubicacion del telefono.',
        'Acercate a una zona con mejor senal o cielo abierto.',
        'Toca "Volver a pedir GPS".',
      ],
      retryLabel: 'Volver a pedir GPS',
      requiresSettings: false,
    }
  }

  if (code === 3) {
    return {
      kind: 'geolocation',
      title: 'El GPS tardo demasiado',
      message:
        'La ubicacion no respondio a tiempo. Beteele puede volver a pedir el GPS para completar la captura.',
      steps: [
        'Espera unos segundos.',
        'Toca "Volver a pedir GPS".',
      ],
      retryLabel: 'Volver a pedir GPS',
      requiresSettings: false,
    }
  }

  return {
    kind: 'geolocation',
    title: 'No pudimos usar tu ubicacion',
    message:
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : 'No fue posible capturar la ubicacion actual.',
    steps: [
      'Toca "Volver a pedir GPS" para intentar de nuevo.',
      'Si no aparece el permiso, activa ubicacion en el navegador y vuelve a intentar.',
    ],
    retryLabel: 'Volver a pedir GPS',
    requiresSettings: false,
  }
}
