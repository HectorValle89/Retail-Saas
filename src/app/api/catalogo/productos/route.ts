import { NextResponse } from 'next/server'
import { requerirActorActivo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const actor = await requerirActorActivo()

    if (actor.puesto !== 'DERMOCONSEJERO') {
      return NextResponse.json(
        { message: 'El catalogo de productos solo aplica para dermoconsejo.' },
        { status: 403 }
      )
    }

    const supabase = await createClient()
    const result = await supabase
      .from('producto')
      .select('id, sku, nombre, nombre_corto, activo')
      .eq('activo', true)
      .order('nombre_corto', { ascending: true })
      .limit(500)

    if (result.error) {
      return NextResponse.json(
        { message: result.error.message ?? 'No fue posible cargar el catalogo.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      data: (result.data ?? []).map((item) => ({
        id: item.id as string,
        sku: item.sku as string,
        nombre: item.nombre as string,
        nombreCorto: item.nombre_corto as string,
      })),
    })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'No fue posible cargar el catalogo.',
      },
      { status: 500 }
    )
  }
}
