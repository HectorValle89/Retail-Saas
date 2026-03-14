---
name: image-compression
description: Compresión de imágenes antes de upload
---

# Image Compression - Beteele

## Browser Compression
```typescript
import imageCompression from 'browser-image-compression';

async function compressPhoto(file: File): Promise<File> {
  const options = {
    maxSizeMB: 0.2,  // 200KB max
    maxWidthOrHeight: 1920,
    useWebWorker: true
  };
  
  return await imageCompression(file, options);
}

// Uso en formulario
const handlePhotoCapture = async (file: File) => {
  const compressed = await compressPhoto(file);
  await pb.collection('attendance').create({ photo: compressed });
};
```

## Validación
```typescript
if (compressed.size > 200 * 1024) {
  throw new Error('Imagen muy pesada, intenta de nuevo');
}
```
