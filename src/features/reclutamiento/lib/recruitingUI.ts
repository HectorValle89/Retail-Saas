import type { 
  RecruitingAltaPipelineStageKey, 
  RecruitingBajaPipelineStageKey 
} from '../types'

export function getRecruitingStageMeta(stageKey: RecruitingAltaPipelineStageKey) {
  switch (stageKey) {
    case 'NUEVOS':
      return {
        label: 'Nuevos',
        description: 'CVs cargados con PDV sugerido y listos para que Coordinacion tome una decision.',
        tone: 'bg-slate-100 text-slate-700',
      }
    case 'EXPEDIENTE':
      return {
        label: 'Expediente',
        description: 'Candidato aprobado por Coordinacion y regresado a Reclutamiento para el PDF final.',
        tone: 'bg-sky-100 text-sky-700',
      }
    case 'EN_GESTION':
      return {
        label: 'En gestión',
        description: 'Alta IMSS y capacitación se trabajan en paralelo hasta que ambas tareas queden listas.',
        tone: 'bg-violet-100 text-violet-700',
      }
    case 'ONBOARDING':
      return {
        label: 'Onboarding',
        description: 'Administracion esta definiendo credenciales, PDV final, horarios y cierre operacional.',
        tone: 'bg-cyan-100 text-cyan-700',
      }
    case 'CANCELADOS':
      return {
        label: 'Cancelados / devueltos',
        description: 'Procesos detenidos o regresados al flujo con trazabilidad completa y opcion de reactivacion.',
        tone: 'bg-rose-100 text-rose-700',
      }
  }
}

export function getRecruitingBajaStageMeta(stageKey: RecruitingBajaPipelineStageKey) {
  switch (stageKey) {
    case 'BAJAS_SOLICITADAS':
      return {
        label: 'Baja enviada',
        description: 'Solicitudes de baja que ya pasaron a Nomina para cierre IMSS.',
        tone: 'bg-amber-100 text-amber-700',
      }
    case 'BAJAS_DEVUELTAS':
      return {
        label: 'Baja devuelta',
        description: 'Bajas regresadas a Reclutamiento por documentos faltantes o inconsistencias.',
        tone: 'bg-rose-100 text-rose-700',
      }
    default: {
      const unreachable: never = stageKey
      return unreachable
    }
  }
}
