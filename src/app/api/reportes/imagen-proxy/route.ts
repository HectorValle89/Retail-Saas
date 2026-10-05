import { NextRequest, NextResponse } from 'next/server';

import { obtenerActorActual } from '@/lib/auth/session';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // 1. Validar autenticación de forma segura sin disparar un Next.js Redirect (que causa HTTP 307 y rompe <img> y PPTX)
    let authenticated = false;

    const actor = await obtenerActorActual().catch(() => null);
    if (actor) {
      authenticated = true;
    } else {
      // Fallback: verificar sesión Supabase por cookies
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        authenticated = true;
      }
    }

    if (!authenticated) {
      return NextResponse.json(
        { message: 'No autorizado. Debes iniciar sesión.' },
        { status: 401 }
      );
    }

    // 2. Extraer parámetros de búsqueda
    const bucket = request.nextUrl.searchParams.get('bucket')?.trim() ?? '';
    const route = request.nextUrl.searchParams.get('route')?.trim() ?? '';

    if (!bucket || !route) {
      return NextResponse.json(
        { message: 'Parámetros bucket y route son requeridos.' },
        { status: 400 }
      );
    }

    // 3. Crear cliente de servicio de Supabase (con privilegios elevados)
    const service = createServiceClient();

    // 4. Descargar la imagen desde el Storage de Supabase
    const { data, error } = await service.storage.from(bucket).download(route);

    if (error || !data) {
      // Fallback: Intentar descargar desde Cloudflare R2 usando el r2Key `${bucket}/${route}`
      try {
        const { buildR2ObjectResponse } = await import('@/lib/storage/r2Service');
        const r2Key = `${bucket}/${route}`;
        const r2Response = await buildR2ObjectResponse(r2Key);
        if (r2Response) {
          return r2Response;
        }
      } catch (r2Err) {
        console.error('Error en fallback R2 de imagen-proxy:', r2Err);
      }

      return NextResponse.json(
        { message: 'La imagen solicitada no existe o no se pudo descargar.' },
        { status: 404 }
      );
    }

    // 5. Retornar los bytes del archivo con el Content-Type correcto y caché privada
    return new Response(data, {
      headers: {
        'Content-Type': data.type || 'image/jpeg',
        'Cache-Control': 'private, max-age=604800', // Cache privado por 7 días
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Error interno al procesar la imagen.',
      },
      { status: 500 }
    );
  }
}
