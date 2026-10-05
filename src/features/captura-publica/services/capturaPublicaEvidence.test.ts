import { describe, expect, it } from 'vitest';
import {
  MAX_PREPARED_EVIDENCE_BYTES,
  validatePreparedEvidenceFile,
} from './capturaPublicaEvidence';

describe('validatePreparedEvidenceFile', () => {
  it('acepta una imagen preparada dentro del limite seguro', () => {
    expect(validatePreparedEvidenceFile({ size: 120_000, type: 'image/jpeg' })).toBeNull();
  });

  it('rechaza una imagen original demasiado pesada antes de procesarla en el Worker', () => {
    expect(
      validatePreparedEvidenceFile({
        size: MAX_PREPARED_EVIDENCE_BYTES + 1,
        type: 'image/jpeg',
      })
    ).toContain('No fue posible comprimir');
  });

  it('rechaza archivos que no sean imagenes', () => {
    expect(validatePreparedEvidenceFile({ size: 100, type: 'application/pdf' })).toContain(
      'debe ser una imagen'
    );
  });
});
