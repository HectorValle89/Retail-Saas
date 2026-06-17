import { describe, expect, it } from 'vitest';
import { normalizarCiudad } from './mecanicasService';

describe('normalizarCiudad', () => {
  it('engloba las ciudades de la zona metropolitana a CIUDAD DE MÉXICO', () => {
    const cases = [
      'CIUDAD DE MEXICO',
      'CDMX',
      'Atizapán de Zaragoza',
      'Nicolas Romero',
      'Coyoacán',
      'Cuajimalpa de Morelos',
      'Tlalnepantla de Baz',
      'Azcapotzalco',
      'Ecatepec',
      'Naucalpan',
      'Tlalnepantla',
      'Nezahualcóyotl',
      'Chimalhuacán',
      'Tultitlán',
      'Atizapán',
      'Valle de Chalco',
      'Chalco',
      'Iztapalapa',
      'Gustavo A. Madero',
    ];

    cases.forEach((c) => {
      expect(normalizarCiudad(c)).toBe('CIUDAD DE MÉXICO');
    });
  });

  it('engloba metepec y toluca a TOLUCA', () => {
    const cases = [
      'Toluca',
      'Metepec',
      'Toluca de Lerdo',
      'Metepec Estado de México',
      'METEPEC',
      'TOLUCA',
    ];

    cases.forEach((c) => {
      expect(normalizarCiudad(c)).toBe('TOLUCA');
    });
  });

  it('engloba Guadalajara y su zona metropolitana a GUADALAJARA', () => {
    const cases = [
      'Guadalajara',
      'Zapopan',
      'Tlaquepaque',
      'Tonalá',
      'Tlajomulco',
      'San Pedro Tlaquepaque',
      'GUADALAJARA',
      'ZAPOPAN',
    ];

    cases.forEach((c) => {
      expect(normalizarCiudad(c)).toBe('GUADALAJARA');
    });
  });

  it('engloba Monterrey y su zona metropolitana a MONTERREY', () => {
    const cases = [
      'Monterrey',
      'San Pedro',
      'San Pedro Garza García',
      'San Nicolás',
      'San Nicolás de los Garza',
      'Guadalupe',
      'Apodaca',
      'Escobedo',
      'General Escobedo',
      'Santa Catarina',
      'MONTERREY',
      'APODACA',
    ];

    cases.forEach((c) => {
      expect(normalizarCiudad(c)).toBe('MONTERREY');
    });
  });

  it('deja intactas otras ciudades no englobadas (en mayúsculas)', () => {
    const expected = {
      'Aguascalientes': 'AGUASCALIENTES',
      'Cancún': 'CANCUN',
      'Coahuila': 'COAHUILA',
      'Cuernavaca': 'CUERNAVACA',
      'Culiacán': 'CULIACAN',
      'Guanajuato': 'GUANAJUATO',
      'Hermosillo': 'HERMOSILLO',
      'Irapuato': 'IRAPUATO',
      'León': 'LEON',
      'Mazatlán': 'MAZATLAN',
      'Mérida': 'MERIDA',
      'Mochis': 'MOCHIS',
      'Oaxaca': 'OAXACA',
      'Puebla': 'PUEBLA',
      'Querétaro': 'QUERETARO',
      'Reynosa': 'REYNOSA',
      'San Francisco del Rincón': 'SAN FRANCISCO DEL RINCON',
      'Tampico': 'TAMPICO',
      'Tijuana': 'TIJUANA',
    };

    Object.entries(expected).forEach(([input, output]) => {
      // Nota: normalizarCiudad remueve acentos de la ciudad en general si no está mapeada,
      // o mantiene mayúsculas limpias sin acentos. Vamos a asegurar que normalice acentos
      // consistentemente de acuerdo al listado oficial.
      const normalized = normalizarCiudad(input);
      expect(normalized).toBe(output);
    });
  });
});
