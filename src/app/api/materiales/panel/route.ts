import { NextResponse } from 'next/server';
import { requerirActorActivo } from '@/lib/auth/session';
import {
  obtenerPanelMateriales,
  obtenerPanelMaterialesOverview,
  obtenerPanelMaterialesUpload,
} from '@/features/materiales/services/materialService';

export async function GET(request: Request) {
  try {
    const actor = await requerirActorActivo();
    const mode = new URL(request.url).searchParams.get('mode');
    const isAdminInventory = ['ADMINISTRADOR', 'COORDINADOR', 'LOGISTICA'].includes(actor.puesto);
    const data = !isAdminInventory
      ? await obtenerPanelMateriales(actor)
      : mode === 'upload'
        ? await obtenerPanelMaterialesUpload(actor)
        : mode === 'review' || mode === 'reports' || mode === 'full'
          ? await obtenerPanelMateriales(actor)
          : await obtenerPanelMaterialesOverview(actor);

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible refrescar el panel de materiales.',
      },
      { status: 500 }
    );
  }
}
