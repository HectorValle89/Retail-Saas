import { describe, expect, it } from 'vitest'
import { deriveAttendanceDiscipline } from './attendanceDiscipline'

describe('deriveAttendanceDiscipline', () => {
  it('detects tardies, justified absences and administrative absences', () => {
    const result = deriveAttendanceDiscipline({
      assignments: [
        {
          id: 'asg-1',
          empleadoId: 'emp-1',
          cuentaClienteId: 'cta-1',
          supervisorEmpleadoId: 'sup-1',
          fechaInicio: '2026-03-01',
          fechaFin: '2026-03-31',
          tipo: 'FIJA',
          diasLaborales: 'LUN,MAR,MIE,JUE,VIE',
          diaDescanso: 'DOM',
          horarioReferencia: '11:00 a 19:00',
        },
      ],
      attendances: [
        {
          id: 'att-1',
          empleadoId: 'emp-1',
          cuentaClienteId: 'cta-1',
          fechaOperacion: '2026-03-02',
          checkInUtc: '2026-03-02T17:25:00.000Z',
          checkOutUtc: null,
          estatus: 'VALIDA',
        },
        {
          id: 'att-2',
          empleadoId: 'emp-1',
          cuentaClienteId: 'cta-1',
          fechaOperacion: '2026-03-03',
          checkInUtc: '2026-03-03T17:40:00.000Z',
          checkOutUtc: null,
          estatus: 'VALIDA',
        },
        {
          id: 'att-3',
          empleadoId: 'emp-1',
          cuentaClienteId: 'cta-1',
          fechaOperacion: '2026-03-04',
          checkInUtc: '2026-03-04T17:50:00.000Z',
          checkOutUtc: null,
          estatus: 'VALIDA',
        },
      ],
      solicitudes: [
        {
          id: 'sol-1',
          empleadoId: 'emp-1',
          fechaInicio: '2026-03-05',
          fechaFin: '2026-03-05',
          tipo: 'PERMISO',
          estatus: 'REGISTRADA_RH',
          metadata: { justifica_asistencia: true },
        },
      ],
      toleranceMinutes: 15,
      payrollDeductionDays: 1,
      salaries: [{ empleadoId: 'emp-1', sueldoBaseMensual: 9000 }],
      periodStart: '2026-03-02',
      periodEnd: '2026-03-06',
    })

    expect(result.records.filter((item) => item.estado === 'RETARDO')).toHaveLength(3)
    expect(result.records.filter((item) => item.estado === 'AUSENCIA_JUSTIFICADA')).toHaveLength(1)
    expect(result.records.filter((item) => item.estado === 'FALTA')).toHaveLength(1)
    expect(result.administrativeAbsences).toHaveLength(1)
    expect(result.administrativeAbsences[0]?.fecha).toBe('2026-03-04')
    expect(result.summaries[0]).toMatchObject({
      retardos: 3,
      faltas: 1,
      ausenciasJustificadas: 1,
      faltasAdministrativas: 1,
      deduccionSugerida: 600,
    })
  })
})
