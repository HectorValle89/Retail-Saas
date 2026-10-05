import { describe, expect, it } from 'vitest';
import {
  formatearDistanciaMetrica,
  formatearDistanciaGeocercaSufijo,
} from './distanceFormat';

describe('distanceFormat', () => {
  describe('formatearDistanciaMetrica', () => {
    it('retorna cadena vacía para valores nulos, indefinidos o no numéricos', () => {
      expect(formatearDistanciaMetrica(null)).toBe('');
      expect(formatearDistanciaMetrica(undefined)).toBe('');
      expect(formatearDistanciaMetrica(Number.NaN)).toBe('');
    });

    it('formatea distancias menores a 1,000 metros en metros enteros con símbolo m', () => {
      expect(formatearDistanciaMetrica(0)).toBe('0 m');
      expect(formatearDistanciaMetrica(14)).toBe('14 m');
      expect(formatearDistanciaMetrica(14.4)).toBe('14 m');
      expect(formatearDistanciaMetrica(14.8)).toBe('15 m');
      expect(formatearDistanciaMetrica(250)).toBe('250 m');
      expect(formatearDistanciaMetrica(999)).toBe('999 m');
    });

    it('gradúa distancias mayores o iguales a 1,000 metros a kilómetros (km)', () => {
      expect(formatearDistanciaMetrica(1000)).toBe('1 km');
      expect(formatearDistanciaMetrica(1200)).toBe('1.2 km');
      expect(formatearDistanciaMetrica(1250)).toBe('1.3 km');
      expect(formatearDistanciaMetrica(3500)).toBe('3.5 km');
      expect(formatearDistanciaMetrica(15400)).toBe('15.4 km');
      expect(formatearDistanciaMetrica(100000)).toBe('100 km');
      expect(formatearDistanciaMetrica(125600)).toBe('126 km');
    });

    it('maneja valores negativos convirtiéndolos a positivos', () => {
      expect(formatearDistanciaMetrica(-14)).toBe('14 m');
      expect(formatearDistanciaMetrica(-2500)).toBe('2.5 km');
    });
  });

  describe('formatearDistanciaGeocercaSufijo', () => {
    it('retorna el sufijo con distancia formateada', () => {
      expect(formatearDistanciaGeocercaSufijo(14)).toBe(' (a 14 m)');
      expect(formatearDistanciaGeocercaSufijo(null)).toBe('');
      expect(formatearDistanciaGeocercaSufijo(1500)).toBe(' (a 1.5 km)');
    });
  });
});
