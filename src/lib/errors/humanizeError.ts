/**
 * Traductor centralizado de mensajes de error técnicos a mensajes amigables en español.
 *
 * Cada regla tiene:
 * - `match`: patrón de texto (en minúsculas) que se busca dentro del mensaje de error.
 * - `friendly`: el mensaje amigable que se muestra al usuario.
 * - `action`: instrucción breve de qué hacer (si aplica).
 * - `severity`: si el usuario puede resolverlo solo o necesita contactar soporte.
 *
 * Si ningún patrón coincide, se devuelve un mensaje genérico.
 */

interface ErrorRule {
  match: string | ((normalized: string) => boolean);
  friendly: string;
  severity: 'auto_resolve' | 'contact_support';
}

const ERROR_RULES: ErrorRule[] = [
  // ── Tabla no encontrada en schema cache (PostgREST) ──
  {
    match: 'could not find the table',
    friendly:
      'Hubo un problema temporal con el servidor. Recarga la app y vuelve a intentar. Si persiste, contacta al administrador.',
    severity: 'contact_support',
  },
  {
    match: 'schema cache',
    friendly:
      'El servidor necesita actualizarse. Recarga la app. Si sigue igual, contacta al administrador.',
    severity: 'contact_support',
  },

  // ── Server Action desincronizada (deploy reciente) ──
  {
    match: 'not found on the server',
    friendly:
      'La app se actualizó. Se va a recargar automáticamente en unos segundos.',
    severity: 'auto_resolve',
  },
  {
    match: 'failed to find server action',
    friendly:
      'La app se actualizó. Se va a recargar automáticamente en unos segundos.',
    severity: 'auto_resolve',
  },

  // ── Chunk / módulo no encontrado (deploy reciente) ──
  {
    match: 'chunkloaderror',
    friendly:
      'La app se actualizó. Se va a recargar automáticamente en unos segundos.',
    severity: 'auto_resolve',
  },
  {
    match: 'failed to fetch dynamically imported module',
    friendly:
      'No se pudo cargar un módulo de la app. Recarga la página.',
    severity: 'auto_resolve',
  },

  // ── Error de red / conexión ──
  {
    match: 'failed to fetch',
    friendly:
      'No hay conexión a internet o la señal es muy débil. Revisa tu conexión y vuelve a intentar.',
    severity: 'auto_resolve',
  },
  {
    match: 'networkerror',
    friendly:
      'Error de red. Revisa tu conexión a internet y vuelve a intentar.',
    severity: 'auto_resolve',
  },
  {
    match: 'network request failed',
    friendly:
      'No se pudo conectar al servidor. Revisa tu conexión a internet.',
    severity: 'auto_resolve',
  },
  {
    match: 'load failed',
    friendly:
      'No se pudo cargar la información. Revisa tu conexión y recarga la app.',
    severity: 'auto_resolve',
  },

  // ── Timeout ──
  {
    match: 'timeout',
    friendly:
      'La operación tardó demasiado. Revisa tu conexión e intenta de nuevo.',
    severity: 'auto_resolve',
  },
  {
    match: 'aborted',
    friendly:
      'La operación se canceló. Intenta de nuevo.',
    severity: 'auto_resolve',
  },

  // ── Errores de autenticación / sesión ──
  {
    match: 'jwt expired',
    friendly:
      'Tu sesión expiró. Cierra sesión y vuelve a entrar.',
    severity: 'auto_resolve',
  },
  {
    match: 'invalid jwt',
    friendly:
      'Tu sesión no es válida. Cierra sesión y vuelve a entrar.',
    severity: 'auto_resolve',
  },
  {
    match: 'not authenticated',
    friendly:
      'No has iniciado sesión. Vuelve a entrar con tu usuario y contraseña.',
    severity: 'auto_resolve',
  },
  {
    match: 'refresh_token',
    friendly:
      'Tu sesión expiró. Cierra sesión y vuelve a entrar.',
    severity: 'auto_resolve',
  },
  {
    match: 'next_redirect',
    friendly:
      'Tu sesión expiró o se requiere autenticación. Redirigiendo a la pantalla de acceso...',
    severity: 'auto_resolve',
  },
  {
    match: 'redirect',
    friendly:
      'Tu sesión expiró o se requiere autenticación. Redirigiendo a la pantalla de acceso...',
    severity: 'auto_resolve',
  },

  // ── Permisos / RLS ──
  {
    match: 'permission denied',
    friendly:
      'No tienes permiso para realizar esta acción. Si crees que es un error, contacta al administrador.',
    severity: 'contact_support',
  },
  {
    match: 'new row violates row-level security',
    friendly:
      'No tienes permiso para guardar este registro. Contacta al administrador.',
    severity: 'contact_support',
  },

  // ── Violación de unicidad ──
  {
    match: 'duplicate key value violates unique constraint',
    friendly:
      'Este registro ya existe. Verifica que no estés duplicando información.',
    severity: 'auto_resolve',
  },

  // ── Violación de llave foránea ──
  {
    match: 'violates foreign key constraint',
    friendly:
      'No se puede completar porque depende de información que no existe o fue eliminada. Contacta al administrador.',
    severity: 'contact_support',
  },

  // ── Almacenamiento / fotos ──
  {
    match: 'payload too large',
    friendly:
      'El archivo es demasiado grande. Intenta con una foto más pequeña.',
    severity: 'auto_resolve',
  },
  {
    match: 'storage quota',
    friendly:
      'Se acabó el espacio de almacenamiento. Contacta al administrador.',
    severity: 'contact_support',
  },

  // ── GPS ──
  {
    match: 'user denied geolocation',
    friendly:
      'Necesitas activar la ubicación (GPS) en tu teléfono para continuar.',
    severity: 'auto_resolve',
  },
  {
    match: 'position unavailable',
    friendly:
      'No se pudo obtener tu ubicación. Activa el GPS y vuelve a intentar.',
    severity: 'auto_resolve',
  },

  // ── Base de datos genéricos ──
  {
    match: 'relation',
    friendly:
      'Hubo un problema con la base de datos. Contacta al administrador.',
    severity: 'contact_support',
  },
  {
    match: (n) => /^pgrst\d{3}/.test(n),
    friendly:
      'Hubo un error en el servidor. Recarga la app. Si persiste, contacta al administrador.',
    severity: 'contact_support',
  },

  // ── Error 500 / Internal Server Error ──
  {
    match: 'internal server error',
    friendly:
      'El servidor tuvo un problema interno. Intenta de nuevo en unos minutos.',
    severity: 'contact_support',
  },
  {
    match: '500',
    friendly:
      'El servidor tuvo un problema. Intenta de nuevo en unos minutos.',
    severity: 'contact_support',
  },
];

/**
 * Traduce un mensaje de error técnico a un mensaje amigable en español.
 *
 * @param raw - El mensaje de error original (puede ser inglés, técnico, etc.)
 * @returns Un mensaje corto y claro en español para el usuario final.
 */
export function humanizeErrorMessage(raw: string): string {
  if (!raw || raw.trim().length === 0) {
    return 'Ocurrió un error inesperado. Intenta de nuevo.';
  }

  const normalized = raw.trim().toLowerCase();

  // Si el mensaje ya está en español y es corto/amigable, déjalo pasar.
  // Heurística: si NO contiene patrones técnicos conocidos, probablemente
  // ya es un mensaje nuestro.
  const looksAlreadyFriendly =
    !normalized.includes('could not') &&
    !normalized.includes('error') &&
    !normalized.includes('failed') &&
    !normalized.includes('not found') &&
    !normalized.includes('denied') &&
    !normalized.includes('violates') &&
    !normalized.includes('timeout') &&
    !normalized.includes('aborted') &&
    !normalized.includes('jwt') &&
    !normalized.includes('pgrst') &&
    !normalized.includes('schema') &&
    !normalized.includes('relation') &&
    !normalized.includes('500') &&
    !normalized.includes('server action') &&
    !normalized.includes('chunk') &&
    !normalized.includes('payload') &&
    !normalized.includes('quota') &&
    !normalized.includes('geolocation') &&
    !normalized.includes('too large') &&
    !normalized.includes('load failed') &&
    !normalized.includes('networkerror') &&
    !normalized.includes('redirect') &&
    !normalized.includes('internal server');

  if (looksAlreadyFriendly) {
    return raw;
  }

  for (const rule of ERROR_RULES) {
    const isMatch =
      typeof rule.match === 'function'
        ? rule.match(normalized)
        : normalized.includes(rule.match);

    if (isMatch) {
      return rule.friendly;
    }
  }

  // Fallback genérico
  return 'Ocurrió un error inesperado. Recarga la app e intenta de nuevo. Si persiste, contacta al administrador.';
}

/**
 * Verifica si un mensaje de error indica que el usuario necesita contactar soporte.
 */
export function errorRequiresSupport(raw: string): boolean {
  const normalized = raw.trim().toLowerCase();

  for (const rule of ERROR_RULES) {
    const isMatch =
      typeof rule.match === 'function'
        ? rule.match(normalized)
        : normalized.includes(rule.match);

    if (isMatch) {
      return rule.severity === 'contact_support';
    }
  }

  return false;
}
