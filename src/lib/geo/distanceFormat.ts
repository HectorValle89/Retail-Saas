/**
 * Formatea una distancia en metros según el Sistema Internacional de Unidades (SI).
 * - Menos de 1,000 m: se muestra en metros enteros (ej: "14 m", "350 m").
 * - A partir de 1,000 m: se gradúa a kilómetros con decimales limpios (ej: "1.2 km", "3.5 km", "12.4 km", "120 km").
 *
 * @param metros Distancia en metros (o null/undefined)
 * @returns Cadena con la distancia formateada y su unidad, o cadena vacía si es null/inválido.
 */
export function formatearDistanciaMetrica(metros: number | null | undefined): string {
  if (metros === null || metros === undefined || Number.isNaN(metros)) {
    return '';
  }

  const distanciaAbsoluta = Math.abs(metros);

  if (distanciaAbsoluta < 1000) {
    return `${Math.round(distanciaAbsoluta)} m`;
  }

  const km = distanciaAbsoluta / 1000;

  if (km < 100) {
    const formateado = Number(km.toFixed(1));
    return `${formateado} km`;
  }

  return `${Math.round(km)} km`;
}

/**
 * Retorna el sufijo con distancia formateada para badges o etiquetas de geocerca.
 * Ejemplos:
 * - 14 -> " (a 14 m)"
 * - 1500 -> " (a 1.5 km)"
 * - null -> ""
 */
export function formatearDistanciaGeocercaSufijo(metros: number | null | undefined): string {
  const distancia = formatearDistanciaMetrica(metros);
  return distancia ? ` (a ${distancia})` : '';
}
