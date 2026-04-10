import { describe, expect, it } from 'vitest'
import { applyFrEscalation, applyIncapacityMarkers } from './attendanceAdminService'

describe('attendanceAdminService helpers', () => {
  it('marca FR en cada tercer retardo del mes', () => {
    const result = applyFrEscalation([
      { fecha: '2026-04-01', codigo: 'AR', label: 'Retardo', tone: 'amber', description: '', detailRef: '1', hasDetail: true, sourceType: 'ASISTENCIA', sourceId: 'a1', isTardy: true },
      { fecha: '2026-04-05', codigo: 'AR', label: 'Retardo', tone: 'amber', description: '', detailRef: '2', hasDetail: true, sourceType: 'ASISTENCIA', sourceId: 'a2', isTardy: true },
      { fecha: '2026-04-08', codigo: 'AR', label: 'Retardo', tone: 'amber', description: '', detailRef: '3', hasDetail: true, sourceType: 'ASISTENCIA', sourceId: 'a3', isTardy: true },
      { fecha: '2026-04-10', codigo: 'AR', label: 'Retardo', tone: 'amber', description: '', detailRef: '4', hasDetail: true, sourceType: 'ASISTENCIA', sourceId: 'a4', isTardy: true },
      { fecha: '2026-04-14', codigo: 'AR', label: 'Retardo', tone: 'amber', description: '', detailRef: '5', hasDetail: true, sourceType: 'ASISTENCIA', sourceId: 'a5', isTardy: true },
      { fecha: '2026-04-18', codigo: 'AR', label: 'Retardo', tone: 'amber', description: '', detailRef: '6', hasDetail: true, sourceType: 'ASISTENCIA', sourceId: 'a6', isTardy: true },
    ])

    expect(Array.from(result)).toEqual(['2026-04-08', '2026-04-18'])
  })

  it('mantiene bloque continuo de incapacidad sin asistencia normal entre folios', () => {
    const markers = applyIncapacityMarkers(
      [
        {
          id: 'sol-1',
          cuenta_cliente_id: 'cuenta-1',
          empleado_id: 'emp-1',
          supervisor_empleado_id: 'sup-1',
          tipo: 'INCAPACIDAD',
          fecha_inicio: '2026-04-01',
          fecha_fin: '2026-04-03',
          motivo: null,
          justificante_url: null,
          justificante_hash: null,
          estatus: 'REGISTRADA_RH',
          comentarios: null,
          metadata: { incapacidad_clase: 'INICIAL' },
          created_at: '2026-04-01T10:00:00.000Z',
        },
        {
          id: 'sol-2',
          cuenta_cliente_id: 'cuenta-1',
          empleado_id: 'emp-1',
          supervisor_empleado_id: 'sup-1',
          tipo: 'INCAPACIDAD',
          fecha_inicio: '2026-04-05',
          fecha_fin: '2026-04-06',
          motivo: null,
          justificante_url: null,
          justificante_hash: null,
          estatus: 'REGISTRADA_RH',
          comentarios: null,
          metadata: { incapacidad_clase: 'SUBSECUENTE' },
          created_at: '2026-04-05T10:00:00.000Z',
        },
      ],
      new Set<string>(),
      '2026-04-01',
      '2026-04-30'
    )

    expect(markers.get('2026-04-01')?.code).toBe('IP')
    expect(markers.get('2026-04-02')?.code).toBe('IP')
    expect(markers.get('2026-04-03')?.code).toBe('IP')
    expect(markers.get('2026-04-05')?.code).toBe('IS')
    expect(markers.get('2026-04-06')?.code).toBe('IS')
  })

  it('reinicia el bloque cuando hay una asistencia normal entre folios', () => {
    const markers = applyIncapacityMarkers(
      [
        {
          id: 'sol-1',
          cuenta_cliente_id: 'cuenta-1',
          empleado_id: 'emp-1',
          supervisor_empleado_id: 'sup-1',
          tipo: 'INCAPACIDAD',
          fecha_inicio: '2026-04-01',
          fecha_fin: '2026-04-04',
          motivo: null,
          justificante_url: null,
          justificante_hash: null,
          estatus: 'REGISTRADA_RH',
          comentarios: null,
          metadata: { incapacidad_clase: 'INICIAL' },
          created_at: '2026-04-01T10:00:00.000Z',
        },
        {
          id: 'sol-2',
          cuenta_cliente_id: 'cuenta-1',
          empleado_id: 'emp-1',
          supervisor_empleado_id: 'sup-1',
          tipo: 'INCAPACIDAD',
          fecha_inicio: '2026-04-07',
          fecha_fin: '2026-04-08',
          motivo: null,
          justificante_url: null,
          justificante_hash: null,
          estatus: 'REGISTRADA_RH',
          comentarios: null,
          metadata: { incapacidad_clase: 'SUBSECUENTE' },
          created_at: '2026-04-07T10:00:00.000Z',
        },
      ],
      new Set<string>(['2026-04-05']),
      '2026-04-01',
      '2026-04-30'
    )

    expect(markers.get('2026-04-04')?.code).toBe('I')
    expect(markers.get('2026-04-07')?.code).toBe('ISP')
    expect(markers.get('2026-04-08')?.code).toBe('ISP')
  })
})
