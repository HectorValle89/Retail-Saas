export const MAX_PREPARED_EVIDENCE_BYTES = 2 * 1024 * 1024;

export function validatePreparedEvidenceFile(file: Pick<File, 'size' | 'type'>): string | null {
  if (!file.type.toLowerCase().startsWith('image/')) {
    return 'La evidencia debe ser una imagen valida.';
  }

  if (file.size > MAX_PREPARED_EVIDENCE_BYTES) {
    return 'No fue posible comprimir una evidencia. Vuelve a seleccionarla o toma una foto nueva antes de enviar.';
  }

  return null;
}
