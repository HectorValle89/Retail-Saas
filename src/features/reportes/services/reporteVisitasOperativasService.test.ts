import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({}),
}))

import { buildVisitasOperativasRanking } from './reporteVisitasOperativasService'

describe('reporteVisitasOperativasService', () => {
  it('agrega visitas por supervisor y calcula cumplimiento mensual', () => {
    const data = buildVisitasOperativasRanking(
      [
        {
          routeId: 'route-1',
          supervisorEmpleadoId: 'sup-1',
          supervisor: 'Supervisor Uno',
          idNomina: 'SUP-001',
          puesto: 'SUPERVISOR',
          estatus: 'PUBLICADA',
        },
        {
          routeId: 'route-2',
          supervisorEmpleadoId: 'sup-2',
          supervisor: 'Supervisor Dos',
          idNomina: 'SUP-002',
          puesto: 'SUPERVISOR',
          estatus: 'PUBLICADA',
        },
      ],
      [
        { ruta_semanal_id: 'route-1', estatus: 'COMPLETADA' },
        { ruta_semanal_id: 'route-1', estatus: 'PLANIFICADA' },
        { ruta_semanal_id: 'route-1', estatus: 'CANCELADA' },
        { ruta_semanal_id: 'route-2', estatus: 'PLANIFICADA' },
      ],
      { periodo: '2026-04', top: 10 }
    )

    expect(data.resumen.supervisores).toBe(2)
    expect(data.resumen.visitasAsignadas).toBe(3)
    expect(data.resumen.visitasCompletadas).toBe(1)
    expect(data.items[0]?.supervisor).toBe('Supervisor Uno')
    expect(data.items[0]?.cumplimientoPct).toBeCloseTo(50)
    expect(data.items[1]?.cumplimientoPct).toBe(0)
  })
})
