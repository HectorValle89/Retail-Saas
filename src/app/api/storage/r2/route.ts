import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

import { requerirActorActivo } from '@/lib/auth/session';
import { buildR2ObjectResponse, uploadObjectToR2 } from '@/lib/storage/r2Service';

export async function GET(request: NextRequest) {
  await requerirActorActivo();

  const key = request.nextUrl.searchParams.get('key')?.trim() ?? '';
  if (!key) {
    return NextResponse.json({ message: 'key es requerido.' }, { status: 400 });
  }

  const response = await buildR2ObjectResponse(key);
  if (!response) {
    return NextResponse.json(
      { message: 'El archivo R2 no esta disponible en el Worker.' },
      { status: 404 }
    );
  }

  return response;
}

export async function POST(request: NextRequest) {
  try {
    await requerirActorActivo();
    
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const modulo = (formData.get('modulo') as string | null) || 'supervisor_evidencia';

    if (!file) {
      return NextResponse.json({ message: 'No se recibio ningun archivo.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Subir a R2 usando el cliente S3 del servidor
    const result = await uploadObjectToR2(buffer, file.name, file.type, modulo);

    // Calcular sha256
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    return NextResponse.json({
      objectKey: result.objectKey,
      sha256,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    });
  } catch (error: any) {
    console.error('Error en proxy de subida a R2:', error);
    return NextResponse.json(
      { message: `Error al subir archivo: ${error.message || error}` },
      { status: 500 }
    );
  }
}
