import { describe, it, expect } from 'vitest';
import { parseCombinedCoordinates, formatCombinedCoordinates } from './coordenadas';

describe('parseCombinedCoordinates', () => {
  it('parsea correctamente coordenadas separadas por coma y espacio', () => {
    const result = parseCombinedCoordinates('19.28512, -98.85526');
    expect(result).toEqual({
      latitud: 19.28512,
      longitud: -98.85526,
    });
  });

  it('parsea coordenadas separadas solo por espacio', () => {
    const result = parseCombinedCoordinates('19.432608 -99.133209');
    expect(result).toEqual({
      latitud: 19.432608,
      longitud: -99.133209,
    });
  });

  it('parsea coordenadas separadas por diagonal o punto y coma', () => {
    const slash = parseCombinedCoordinates('19.28512 / -98.85526');
    expect(slash).toEqual({
      latitud: 19.28512,
      longitud: -98.85526,
    });

    const semicolon = parseCombinedCoordinates('19.28512; -98.85526');
    expect(semicolon).toEqual({
      latitud: 19.28512,
      longitud: -98.85526,
    });
  });

  it('auto-corrige si el usuario invierte la longitud y la latitud', () => {
    // -98.85526 no puede ser latitud (-90 a 90), por lo que se reordena con 19.28512
    const result = parseCombinedCoordinates('-98.85526, 19.28512');
    expect(result).toEqual({
      latitud: 19.28512,
      longitud: -98.85526,
    });
  });

  it('retorna nulls si el valor está vacío o es nulo', () => {
    expect(parseCombinedCoordinates('')).toEqual({ latitud: null, longitud: null });
    expect(parseCombinedCoordinates('   ')).toEqual({ latitud: null, longitud: null });
    expect(parseCombinedCoordinates(null)).toEqual({ latitud: null, longitud: null });
    expect(parseCombinedCoordinates(undefined)).toEqual({ latitud: null, longitud: null });
  });

  it('devuelve error si solo se ingresa un número', () => {
    const result = parseCombinedCoordinates('19.28512');
    expect(result.error).toContain('Las coordenadas deben incluir latitud y longitud');
    expect(result.latitud).toBeNull();
  });

  it('devuelve error si los valores no son números', () => {
    const result = parseCombinedCoordinates('abc, def');
    expect(result.error).toContain('Las coordenadas deben ser números válidos');
    expect(result.latitud).toBeNull();
  });

  it('devuelve error si la latitud está fuera de rango', () => {
    const result = parseCombinedCoordinates('95.123, -98.855');
    expect(result.error).toContain('La latitud debe estar entre -90 y 90');
  });

  it('devuelve error si la longitud está fuera de rango', () => {
    const result = parseCombinedCoordinates('19.285, -195.855');
    expect(result.error).toContain('La longitud debe estar entre -180 y 180');
  });
});

describe('formatCombinedCoordinates', () => {
  it('formatea latitud y longitud con coma y espacio', () => {
    expect(formatCombinedCoordinates(19.28512, -98.85526)).toBe('19.28512, -98.85526');
  });

  it('maneja valores nulos o indefinidos', () => {
    expect(formatCombinedCoordinates(null, null)).toBe('');
    expect(formatCombinedCoordinates(undefined, undefined)).toBe('');
    expect(formatCombinedCoordinates(19.28512, null)).toBe('19.28512');
    expect(formatCombinedCoordinates(null, -98.85526)).toBe('-98.85526');
  });
});
