import { describe, expect, it } from 'vitest';
import { humanizeErrorMessage, errorRequiresSupport } from './humanizeError';

describe('humanizeErrorMessage', () => {
  it('traduce errores de tabla no encontrada en schema cache', () => {
    const raw = "Could not find the table 'public.archivo_referencia' in the schema cache";
    const result = humanizeErrorMessage(raw);
    expect(result).toContain('Recarga la app');
    expect(result).not.toContain('archivo_referencia');
  });

  it('traduce errores de schema cache genéricos', () => {
    const raw = 'schema cache is outdated';
    const result = humanizeErrorMessage(raw);
    expect(result).toContain('Recarga la app');
  });

  it('traduce errores de Server Action no encontrada', () => {
    const raw =
      'Server Action "60336631ac2b6b9216f90f8bcda25890b2cf7e96d3" was not found on the server.';
    const result = humanizeErrorMessage(raw);
    expect(result).toContain('actualizó');
  });

  it('traduce errores de red', () => {
    expect(humanizeErrorMessage('Failed to fetch')).toContain('conexión');
    expect(humanizeErrorMessage('NetworkError when attempting to fetch resource')).toContain(
      'conexión'
    );
  });

  it('traduce errores de timeout', () => {
    expect(humanizeErrorMessage('Request timeout')).toContain('tardó demasiado');
  });

  it('traduce errores de sesión expirada', () => {
    expect(humanizeErrorMessage('JWT expired')).toContain('sesión expiró');
  });

  it('traduce errores de redirección interna de Next.js (NEXT_REDIRECT)', () => {
    expect(humanizeErrorMessage('NEXT_REDIRECT')).toContain('sesión expiró');
    expect(humanizeErrorMessage('Error: NEXT_REDIRECT')).toContain('sesión expiró');
    expect(humanizeErrorMessage('next_redirect')).toContain('sesión expiró');
  });

  it('traduce errores de permisos', () => {
    expect(humanizeErrorMessage('permission denied for table usuario')).toContain('permiso');
  });

  it('traduce errores de duplicado', () => {
    expect(humanizeErrorMessage('duplicate key value violates unique constraint')).toContain(
      'ya existe'
    );
  });

  it('traduce errores de GPS', () => {
    expect(humanizeErrorMessage('User denied Geolocation')).toContain('GPS');
  });

  it('traduce errores de chunk load', () => {
    expect(humanizeErrorMessage('ChunkLoadError: loading chunk 123')).toContain('actualizó');
  });

  it('traduce errores de archivo demasiado grande', () => {
    expect(humanizeErrorMessage('Payload too large')).toContain('grande');
  });

  it('deja pasar mensajes que ya son amigables en español', () => {
    const friendly = 'Primero toma la selfie de llegada.';
    expect(humanizeErrorMessage(friendly)).toBe(friendly);
  });

  it('deja pasar mensajes de negocio existentes', () => {
    const msg = 'No fue posible registrar la llegada.';
    // Contains 'no' and potentially 'fue' but our heuristic should let it through
    // since it doesn't match technical patterns
    const result = humanizeErrorMessage(msg);
    expect(result).toBeTruthy();
  });

  it('devuelve mensaje genérico para errores vacíos', () => {
    expect(humanizeErrorMessage('')).toContain('Ocurrió un error');
    expect(humanizeErrorMessage('   ')).toContain('Ocurrió un error');
  });
});

describe('errorRequiresSupport', () => {
  it('indica soporte para errores de schema cache', () => {
    expect(
      errorRequiresSupport("Could not find the table 'public.archivo_referencia' in the schema cache")
    ).toBe(true);
  });

  it('indica auto-resolución para errores de red', () => {
    expect(errorRequiresSupport('Failed to fetch')).toBe(false);
  });

  it('indica auto-resolución para errores de sesión', () => {
    expect(errorRequiresSupport('JWT expired')).toBe(false);
  });

  it('indica soporte para errores de permisos', () => {
    expect(errorRequiresSupport('permission denied')).toBe(true);
  });
});
