import { requerirActorActivo } from '@/lib/auth/session'
import { LoveIsdinPanel } from '@/features/love-isdin/components/LoveIsdinPanel'
import {
  obtenerPanelLoveIsdin,
  type LoveIsdinPanelData,
} from '@/features/love-isdin/services/loveIsdinService'

export const metadata = {
  title: 'LOVE ISDIN | Field Force Platform',
}

interface LoveIsdinPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function pickString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.floor(parsed)
}

function buildLoveIsdinFallbackData(page: number, pageSize: number, message: string): LoveIsdinPanelData {
  return {
    scopeLabel: 'LOVE ISDIN',
    resumen: {
      total: 0,
      validas: 0,
      pendientes: 0,
      rechazadas: 0,
      afiliacionesHoy: 0,
    },
    afiliacionesKpi: {
      hoy: 0,
      semana: 0,
      mes: 0,
      objetivoHoy: 0,
      objetivoSemana: 0,
      objetivoMes: 0,
      cumplimientoHoyPct: 0,
      cumplimientoSemanaPct: 0,
      cumplimientoMesPct: 0,
      validasMes: 0,
      pendientesMes: 0,
    },
    afiliaciones: [],
    jornadasContexto: [],
    cuentas: [],
    empleados: [],
    dermoconsejerasSinQr: [],
    pdvs: [],
    timelineDiaria: [],
    timelineSemanal: [],
    kpiDataset: [],
    porPdv: [],
    porDc: [],
    porSupervisor: [],
    porZona: [],
    porCadena: [],
    qrResumen: {
      activos: 0,
      disponibles: 0,
      bloqueados: 0,
      bajas: 0,
      dcActivasConQr: 0,
      dcActivasSinQr: 0,
    },
    qrInventario: [],
    qrInfraestructuraLista: false,
    qrMensajeInfraestructura: message,
    qrImportLotes: [],
    resumenExtemporaneo: {
      total: 0,
      pendientes: 0,
      aprobados: 0,
      rechazados: 0,
    },
    registrosExtemporaneos: [],
    paginacion: {
      page,
      pageSize,
      totalItems: 0,
      totalPages: 1,
    },
    infraestructuraLista: false,
    mensajeInfraestructura: message,
  }
}

export default async function LoveIsdinPage({ searchParams }: LoveIsdinPageProps) {
  const actor = await requerirActorActivo()
  const params = (await searchParams) ?? {}
  const page = parsePositiveInt(pickString(params.page), 1)
  const pageSize = parsePositiveInt(pickString(params.pageSize), 50)

  let data: LoveIsdinPanelData
  try {
    data = await obtenerPanelLoveIsdin(actor, { page, pageSize })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No fue posible cargar LOVE ISDIN en este momento.'
    data = buildLoveIsdinFallbackData(page, pageSize, message)
  }

  return (
    <div className="page-shell max-w-7xl">
      <header className="page-hero mb-6">
        <p className="page-hero-eyebrow">
          Ejecucion diaria
        </p>
        <h1 className="page-hero-title">LOVE ISDIN</h1>
        <p className="page-hero-copy max-w-3xl">
          Captura y trazabilidad de afiliaciones ligadas a PDV, promotora y contexto operativo.
        </p>
      </header>

      <LoveIsdinPanel actor={actor} data={data} />
    </div>
  )
}
