import { NextResponse } from 'next/server';
import { importarInventarioInicialCanjes } from '@/features/materiales/actions';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const state = await importarInventarioInicialCanjes({ ok: false, message: null }, formData);
    if (!state.ok) {
      return NextResponse.json(
        { message: state.message, metadata: state.metadata },
        { status: 400 }
      );
    }
    return NextResponse.json({ message: state.message, metadata: state.metadata });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Error al procesar la importación.',
      },
      { status: 500 }
    );
  }
}
