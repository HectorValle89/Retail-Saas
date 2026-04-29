'use client'

import type { VacantesOperativasFuturasData } from '../services/vacanteOperativaFuturaService'
import { VacantesFuturasBoard } from './VacantesFuturasBoard'

export function VacantesFuturasPageClient({
  data,
  selectedVacancyId,
}: {
  data: VacantesOperativasFuturasData | null
  selectedVacancyId?: string | null
}) {
  return (
    <VacantesFuturasBoard
      data={data}
      selectedVacancyId={selectedVacancyId}
      detailHrefBuilder={(item) => `/asignaciones/vacantes-futuras?vacante_id=${encodeURIComponent(item.id)}`}
      reassignmentHrefBuilder={(item) =>
        `/asignaciones/asignaciones?modal=manual&prefill_pdv_id=${encodeURIComponent(item.pdvId)}&prefill_fecha_inicio=${encodeURIComponent(item.fechaVacanteDesde)}&prefill_tipo=COBERTURA&prefill_naturaleza=COBERTURA_TEMPORAL&prefill_motivo=${encodeURIComponent(`Cobertura ${item.tipoVacante === 'VACANTE_ACTUAL_POR_BAJA' ? 'inmediata' : 'futura'} por baja de ${item.empleadoOrigenNombre ?? 'empleado'}`)}&prefill_observaciones=${encodeURIComponent(`Vacante vinculada a baja ${item.fechaBajaEfectiva}. PDV ${item.pdvClaveBtl ?? item.pdvId}.`)}`
      }
    />
  )
}
