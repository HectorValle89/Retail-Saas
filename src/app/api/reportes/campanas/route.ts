import { NextResponse } from 'next/server'
import { readRequestAccountScope } from '@/lib/tenant/accountScope'
import { requerirPuestosActivos } from '@/lib/auth/session'
import { obtenerPanelCampanas } from '@/features/campanas/services/campanaService'
import type { CampanaReporteItem } from '@/features/reportes/services/reporteService'

const REPORTES_ROLES = [
  'ADMINISTRADOR',
  'VENTAS',
  'SUPERVISOR',
  'COORDINADOR',
  'RECLUTAMIENTO',
  'NOMINA',
  'LOGISTICA',
  'LOVE_IS',
  'CLIENTE',
] as const

function getPeriodLabelFromQuery(request: Request) {
  const url = new URL(request.url)
  return url.searchParams.get('periodo') ?? ''
}

function getDefaultPeriodLabel() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

export async function GET(request: Request) {
  try {
    const actor = await requerirPuestosActivos([...REPORTES_ROLES])
    const accountScope = await readRequestAccountScope()
    const periodLabel = getPeriodLabelFromQuery(request)
    const data = await obtenerPanelCampanas(actor, {
      scopeAccountId: accountScope.accountId,
    })

    const items: CampanaReporteItem[] = data.reportePorPdv.map((item) => ({
      periodo: periodLabel || getDefaultPeriodLabel(),
      campana: item.campana,
      pdv: `${item.claveBtl} - ${item.pdv}`,
      dc: item.dc,
      estatus: item.estatus,
      avancePorcentaje: item.avancePorcentaje,
      tareasPendientes: item.tareasPendientes,
      evidenciasPendientes: item.evidenciasPendientes,
    }))

    return NextResponse.json({
      data: {
        items,
        totalCampanas: items.length,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'No fue posible cargar el reporte de campanas.',
      },
      { status: 500 }
    )
  }
}
