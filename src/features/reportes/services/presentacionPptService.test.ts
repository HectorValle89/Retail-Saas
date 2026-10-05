import { describe, it, expect } from 'vitest';
import {
  calculateContainedPlacement,
  getTipoEvidenciaLabel,
} from './presentacionPptService';

describe('presentacionPptService - calculateContainedPlacement', () => {
  it('mantiene la proporción de una foto horizontal (4:3) en un contenedor amplio 16:9', () => {
    // Foto horizontal 4:3 (4000x3000)
    // Contenedor ancho de 9.0" x 3.9" (ratio 2.308)
    const box = { x: 0.5, y: 1.35, w: 9.0, h: 3.9 };
    const placement = calculateContainedPlacement(4000, 3000, box);

    // Debe ajustarse a la altura máxima (3.9) y centrarse horizontalmente
    expect(placement.h).toBe(3.9);
    // Ancho = 3.9 * (4/3) = 5.2
    expect(placement.w).toBe(5.2);
    // x = 0.5 + (9.0 - 5.2) / 2 = 2.4
    expect(placement.x).toBe(2.4);
    expect(placement.y).toBe(1.35);
  });

  it('mantiene la proporción de una foto horizontal 16:9 (1920x1080) sin estirarse', () => {
    const box = { x: 0.5, y: 1.35, w: 9.0, h: 3.9 };
    const placement = calculateContainedPlacement(1920, 1080, box);

    // Aspect ratio 1.7777... vs box ratio 2.3076...
    // Se limita por la altura (3.9)
    expect(placement.h).toBe(3.9);
    expect(placement.w).toBe(6.933);
    // Centrado horizontal
    expect(placement.x).toBeCloseTo(0.5 + (9.0 - 6.933) / 2, 2);
    expect(placement.y).toBe(1.35);
  });

  it('mantiene la proporción de una foto vertical (3:4) y la centra horizontalmente', () => {
    // Foto vertical 3000x4000 (0.75 ratio)
    const box = { x: 0.5, y: 1.35, w: 9.0, h: 3.9 };
    const placement = calculateContainedPlacement(3000, 4000, box);

    expect(placement.h).toBe(3.9);
    // Ancho = 3.9 * 0.75 = 2.925
    expect(placement.w).toBe(2.925);
    // x = 0.5 + (9.0 - 2.925) / 2 = 3.538
    expect(placement.x).toBe(3.538);
    expect(placement.y).toBe(1.35);
  });

  it('mantiene la proporción de una foto cuadrada 1:1 en una caja rectangular', () => {
    const box = { x: 0.5, y: 1.55, w: 4.3, h: 3.7 };
    const placement = calculateContainedPlacement(1000, 1000, box);

    // Box ratio = 4.3 / 3.7 = 1.162. Image ratio = 1.0.
    // imageRatio < boxRatio => ajusta a la altura 3.7
    expect(placement.h).toBe(3.7);
    expect(placement.w).toBe(3.7);
    // x centrado: 0.5 + (4.3 - 3.7) / 2 = 0.8
    expect(placement.x).toBe(0.8);
    expect(placement.y).toBe(1.55);
  });

  it('ajusta por ancho si la imagen es panorámica (más ancha que la caja)', () => {
    // Foto panorámica 3:1 (3000x1000) en una caja 2.8" x 3.7" (0.757 ratio)
    const box = { x: 0.5, y: 1.55, w: 2.8, h: 3.7 };
    const placement = calculateContainedPlacement(3000, 1000, box);

    // imageRatio (3.0) > boxRatio (0.757) => ajusta al ancho máximo (2.8)
    expect(placement.w).toBe(2.8);
    // Alto = 2.8 / 3 = 0.933
    expect(placement.h).toBe(0.933);
    expect(placement.x).toBe(0.5);
    // Centrado verticalmente
    expect(placement.y).toBeCloseTo(1.55 + (3.7 - 0.933) / 2, 2);
  });

  it('devuelve la caja original si las dimensiones son inválidas o 0', () => {
    const box = { x: 1.0, y: 2.0, w: 5.0, h: 4.0 };
    expect(calculateContainedPlacement(0, 0, box)).toEqual(box);
    expect(calculateContainedPlacement(-10, 100, box)).toEqual(box);
  });
});

describe('presentacionPptService - getTipoEvidenciaLabel', () => {
  it('asigna la etiqueta correcta para cada tipo de evidencia', () => {
    expect(getTipoEvidenciaLabel('IMPLEMENTACION')).toBe('Evidencias de Implementación en PDV');
    expect(getTipoEvidenciaLabel('MATERIAL_POP')).toBe('Entrega de Displays y Material POP de Temporada');
    expect(getTipoEvidenciaLabel('MALETA_VANITY')).toBe('Eventos Maleta Vanity');
    expect(getTipoEvidenciaLabel('ADOPTADO_SAN_PABLO')).toBe('San Pablo (Plan de Cuidado Especial)');
  });
});
