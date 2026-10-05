import { describe, it, expect } from 'vitest';
import { isImageFile } from './imageOptimization';

describe('imageOptimization', () => {
  it('should identify image file types correctly', () => {
    const pngFile = new File(['test'], 'photo.png', { type: 'image/png' });
    const heicFile = new File(['test'], 'photo.HEIC', { type: 'image/heic' });
    const jpgFile = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
    const pdfFile = new File(['test'], 'document.pdf', { type: 'application/pdf' });

    expect(isImageFile(pngFile)).toBe(true);
    expect(isImageFile(heicFile)).toBe(true);
    expect(isImageFile(jpgFile)).toBe(true);
    expect(isImageFile(pdfFile)).toBe(false);
  });
});
