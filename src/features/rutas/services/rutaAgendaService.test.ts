import { describe, expect, it } from 'vitest'
import { resolveAgendaOperativaSupervisorDia } from './rutaAgendaService'

describe('rutaAgendaService', () => {
  it('desplaza visitas planeadas y genera pendientes justificadas cuando un evento aprobado reemplaza el dia', () => {
    const result = resolveAgendaOperativaSupervisorDia({
      fecha: '2026-03-26',
      today: '2026-03-26',
      visitasPlaneadas: [
        {
          id: 'visit-1',
          rutaId: 'route-1',
          pdvId: 'pdv-1',
          pdv: 'PDV Uno',
          zona: 'Centro',
          diaSemana: 4,
          diaLabel: 'Jueves',
          orden: 1,
          estatus: 'PLANIFICADA',
          checkInAt: null,
          checkOutAt: null,
          comentarios: null,
          completadaEn: null,
        },
        {
          id: 'visit-2',
          rutaId: 'route-1',
          pdvId: 'pdv-2',
          pdv: 'PDV Dos',
          zona: 'Centro',
          diaSemana: 4,
          diaLabel: 'Jueves',
          orden: 2,
          estatus: 'PLANIFICADA',
          checkInAt: null,
          checkOutAt: null,
          comentarios: null,
          completadaEn: null,
        },
      ],
      agendaEventos: [
        {
          id: 'event-1',
          rutaId: 'route-1',
          sourceVisitId: null,
          supervisorEmpleadoId: 'sup-1',
          fechaOperacion: '2026-03-26',
          pdvId: null,
          pdv: null,
          zona: null,
          tipoEvento: 'FORMACION',
          modoImpacto: 'REEMPLAZA_TOTAL',
          estatusAprobacion: 'APROBADO',
          estatusEjecucion: 'PENDIENTE',
          titulo: 'Formacion zona centro',
          descripcion: 'Sesion extraordinaria',
          sede: 'Oficina central',
          horaInicio: '09:00:00',
          horaFin: '12:00:00',
          checkInAt: null,
          checkOutAt: null,
          metadata: {
            displacedVisitIds: ['visit-1', 'visit-2'],
          },
          createdAt: '2026-03-25T10:00:00.000Z',
          updatedAt: '2026-03-25T10:00:00.000Z',
        },
      ],
      pendientesPersistidos: [],
    })

    expect(result.visitasActivas).toHaveLength(0)
    expect(result.visitasDesplazadas.map((item) => item.id)).toEqual(['visit-1', 'visit-2'])
    expect(result.pendientesJustificadasCount).toBe(2)
    expect(result.pendientesReposicion.every((item) => item.clasificacion === 'JUSTIFICADA')).toBe(true)
  })

  it('genera pendiente injustificada cuando una visita pasada no se ejecuto y no tiene causa valida', () => {
    const result = resolveAgendaOperativaSupervisorDia({
      fecha: '2026-03-24',
      today: '2026-03-26',
      visitasPlaneadas: [
        {
          id: 'visit-3',
          rutaId: 'route-1',
          pdvId: 'pdv-3',
          pdv: 'PDV Tres',
          zona: 'Norte',
          diaSemana: 2,
          diaLabel: 'Martes',
          orden: 1,
          estatus: 'PLANIFICADA',
          checkInAt: null,
          checkOutAt: null,
          comentarios: null,
          completadaEn: null,
        },
      ],
      agendaEventos: [],
      pendientesPersistidos: [],
    })

    expect(result.cumplimientoIncompleto).toBe(true)
    expect(result.pendientesInjustificadasCount).toBe(1)
    expect(result.pendientesReposicion[0]).toMatchObject({
      visitId: 'visit-3',
      clasificacion: 'INJUSTIFICADA',
      estado: 'PENDIENTE',
    })
  })
})
