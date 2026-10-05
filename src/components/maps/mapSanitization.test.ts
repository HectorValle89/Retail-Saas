import { describe, expect, it } from 'vitest';
import { sanitizeMapPoints, isValidCoordinate, getSafeSubdomains, getMapPointsSignature } from './mapSanitization';
import type { MexicoMapPoint } from './LeafletMexicoMap';

describe('mapSanitization (TDD)', () => {
  it('identifica coordenadas válidas e inválidas correctamente', () => {
    expect(isValidCoordinate(19.4326, -99.1332)).toBe(true);
    expect(isValidCoordinate(NaN, -99.1332)).toBe(false);
    expect(isValidCoordinate(19.4326, NaN)).toBe(false);
    expect(isValidCoordinate(Infinity, -99.1332)).toBe(false);
    expect(isValidCoordinate(undefined as unknown as number, -99.1332)).toBe(false);
    expect(isValidCoordinate(null as unknown as number, -99.1332)).toBe(false);
    // Fuera de rango geográfico
    expect(isValidCoordinate(95, -99.1332)).toBe(false);
    expect(isValidCoordinate(-95, -99.1332)).toBe(false);
    expect(isValidCoordinate(19.4326, 195)).toBe(false);
  });

  it('filtra puntos con coordenadas corruptas o NaN para que Leaflet nunca truene', () => {
    const rawPoints: MexicoMapPoint[] = [
      {
        id: 'p1',
        lat: 19.4326,
        lng: -99.1332,
        title: 'Tienda Centro',
        tone: 'emerald',
      },
      {
        id: 'p2-nan',
        lat: NaN,
        lng: -99.1332,
        title: 'Tienda con Lat NaN',
        tone: 'amber',
      },
      {
        id: 'p3-null',
        lat: null as unknown as number,
        lng: -99.1332,
        title: 'Tienda con Lat Null',
        tone: 'slate',
      },
      {
        id: 'p4-out-of-range',
        lat: 150,
        lng: -99.1332,
        title: 'Tienda con Lat Imposible',
        tone: 'sky',
      },
      {
        id: 'p5',
        lat: 25.6866,
        lng: -100.3161,
        title: 'Tienda Monterrey',
        tone: 'sky',
      },
    ];

    const sanitized = sanitizeMapPoints(rawPoints);
    expect(sanitized).toHaveLength(2);
    expect(sanitized.map((p) => p.id)).toEqual(['p1', 'p5']);
  });

  it('garantiza que subdomains de Leaflet siempre tenga un valor no vacío (evitando error reading length)', () => {
    expect(getSafeSubdomains(undefined)).toBe('abc');
    expect(getSafeSubdomains('')).toBe('abc');
    expect(getSafeSubdomains([])).toBe('abc');
    expect(getSafeSubdomains('abcd')).toBe('abcd');
    expect(getSafeSubdomains(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('calcula firma determinista para detectar cambios reales en el conjunto de puntos', () => {
    expect(getMapPointsSignature([])).toBe('');

    const pointsA: MexicoMapPoint[] = [
      { id: 'p1', lat: 19.4326, lng: -99.1332, title: 'Tienda 1' },
      { id: 'p2', lat: 25.6866, lng: -100.3161, title: 'Tienda 2' },
    ];

    const sigA = getMapPointsSignature(pointsA);
    expect(sigA).toBe('p1:19.43260,-99.13320;p2:25.68660,-100.31610');

    // Cambiar sólo propiedades cosméticas o de selección debe mantener la misma firma
    const pointsASelectionChanged: MexicoMapPoint[] = [
      { id: 'p1', lat: 19.4326, lng: -99.1332, title: 'Tienda 1', inRoute: true, customColor: '#ff0000' },
      { id: 'p2', lat: 25.6866, lng: -100.3161, title: 'Tienda 2', inRoute: false },
    ];
    const sigA2 = getMapPointsSignature(pointsASelectionChanged);
    expect(sigA2).toBe(sigA);

    // Cambiar coordenadas o agregar/remover puntos debe generar una firma diferente
    const pointsB: MexicoMapPoint[] = [
      { id: 'p1', lat: 19.4326, lng: -99.1332, title: 'Tienda 1' },
      { id: 'p3', lat: 20.6597, lng: -103.3496, title: 'Tienda 3' },
    ];
    const sigB = getMapPointsSignature(pointsB);
    expect(sigB).not.toBe(sigA);
  });
});

