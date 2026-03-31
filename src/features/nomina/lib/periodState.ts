export type NominaPeriodoEstado = 'BORRADOR' | 'APROBADO' | 'DISPERSADO'

export const NOMINA_PERIODO_MUTABLE_ESTADO: NominaPeriodoEstado = 'BORRADOR'

export function getNominaPeriodoTransitionTargets(
  estado: NominaPeriodoEstado
): NominaPeriodoEstado[] {
  if (estado === 'BORRADOR') {
    return ['APROBADO']
  }

  if (estado === 'APROBADO') {
    return ['BORRADOR', 'DISPERSADO']
  }

  return []
}

export function isNominaPeriodoMutable(estado: NominaPeriodoEstado) {
  return estado === NOMINA_PERIODO_MUTABLE_ESTADO
}