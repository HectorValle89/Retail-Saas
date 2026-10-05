/**
 * Utilidades para el parseo y formateo de coordenadas geográficas de empleados.
 * Permite capturar latitud y longitud de manera conjunta en un solo campo de texto.
 */

export interface CoordenadasParseResult {
  latitud: number | null;
  longitud: number | null;
  error?: string;
}

/**
 * Parsea un texto con latitud y longitud combinadas.
 * Admite formatos como:
 * - "19.28512, -98.85526" (estándar Google Maps)
 * - "19.28512 -98.85526" (separado por espacios)
 * - "19.28512 / -98.85526" o "19.28512; -98.85526"
 * 
 * Si el usuario invierte el orden por error (longitud negativa primero, latitud positiva después),
 * detecta automáticamente y reordena los valores.
 */
export function parseCombinedCoordinates(raw: unknown): CoordenadasParseResult {
  if (raw === null || raw === undefined) {
    return { latitud: null, longitud: null };
  }

  const str = String(raw).trim();
  if (!str) {
    return { latitud: null, longitud: null };
  }

  // Detectar delimitadores: comas, puntos y comas, barras diagonales, plecas o espacios
  let parts: string[];
  if (/[,;/|]/.test(str)) {
    parts = str.split(/[,;/|]+/).map((s) => s.trim()).filter(Boolean);
  } else {
    parts = str.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  }

  if (parts.length !== 2) {
    return {
      latitud: null,
      longitud: null,
      error: 'Las coordenadas deben incluir latitud y longitud (ej. 19.28512, -98.85526).',
    };
  }

  let lat = Number(parts[0]);
  let lng = Number(parts[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      latitud: null,
      longitud: null,
      error: 'Las coordenadas deben ser números válidos (ej. 19.28512, -98.85526).',
    };
  }

  // Auto-corrección si el usuario invirtió latitud y longitud:
  // La latitud en la Tierra solo puede estar entre -90 y 90.
  // La longitud puede estar entre -180 y 180.
  if ((lat < -90 || lat > 90) && lng >= -90 && lng <= 90) {
    const temp = lat;
    lat = lng;
    lng = temp;
  }

  if (lat < -90 || lat > 90) {
    return {
      latitud: null,
      longitud: null,
      error: 'La latitud debe estar entre -90 y 90.',
    };
  }

  if (lng < -180 || lng > 180) {
    return {
      latitud: null,
      longitud: null,
      error: 'La longitud debe estar entre -180 y 180.',
    };
  }

  return {
    latitud: Number(lat.toFixed(7)),
    longitud: Number(lng.toFixed(7)),
  };
}

/**
 * Formatea un par de coordenadas numéricas para mostrarlas en un campo de texto único.
 */
export function formatCombinedCoordinates(
  latitud: number | null | undefined,
  longitud: number | null | undefined
): string {
  if (latitud != null && longitud != null) {
    return `${latitud}, ${longitud}`;
  }
  if (latitud != null) {
    return String(latitud);
  }
  if (longitud != null) {
    return String(longitud);
  }
  return '';
}
