import type { MexicoMapPoint } from './LeafletMexicoMap';

/**
 * Valida si un par de latitud y longitud son números finitos válidos dentro del rango terrestre.
 */
export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return false;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  if (lat < -90 || lat > 90) {
    return false;
  }
  if (lng < -180 || lng > 180) {
    return false;
  }
  return true;
}

/**
 * Filtra y asegura que todos los puntos pasados a Leaflet contengan coordenadas numéricas válidas.
 */
export function sanitizeMapPoints(points: MexicoMapPoint[]): MexicoMapPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter((point) => point && isValidCoordinate(point.lat, point.lng));
}

/**
 * Garantiza un subdominio válido no vacío para Leaflet TileLayer,
 * previniendo TypeError: Cannot read properties of undefined (reading 'length').
 */
export function getSafeSubdomains(subdomains?: string | string[]): string | string[] {
  if (!subdomains) return 'abc';
  if (Array.isArray(subdomains) && subdomains.length === 0) return 'abc';
  if (typeof subdomains === 'string' && subdomains.trim().length === 0) return 'abc';
  return subdomains;
}

/**
 * Genera una firma determinista del conjunto geográfico de puntos.
 * Se utiliza para comparar si el conjunto de puntos o sus coordenadas realmente
 * cambiaron en el mapa, evitando re-encuadres y pérdidas de zoom no deseadas
 * cuando solo cambia la selección de un punto o metadatos cosméticos.
 */
export function getMapPointsSignature(points: MexicoMapPoint[]): string {
  if (!Array.isArray(points) || points.length === 0) return '';
  return points
    .map((p) => `${p.id}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
    .join(';');
}

