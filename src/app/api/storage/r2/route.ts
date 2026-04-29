import { NextRequest, NextResponse } from 'next/server';

import { requerirActorActivo } from '@/lib/auth/session';
import { buildR2ObjectResponse } from '@/lib/storage/r2Service';

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
