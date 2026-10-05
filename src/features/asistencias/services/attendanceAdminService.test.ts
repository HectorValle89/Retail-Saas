import { describe, expect, it } from 'vitest';
import {
  applyFrEscalation,
  applyIncapacityMarkers,
  isSupervisorMarkedAttendance,
  buildCellDraft,
} from './attendanceAdminService';
import type { MaterializedCalendarDay } from '@/features/asignaciones/services/asignacionMaterializationService';

describe('attendanceAdminService helpers', () => {
  it('marca FR en cada tercer retardo del mes', () => {
    const result = applyFrEscalation([
      {
        fecha: '2026-04-01',
        codigo: 'AR',
        label: 'Retardo',
        tone: 'amber',
        description: '',
        detailRef: '1',
        hasDetail: true,
        sourceType: 'ASISTENCIA',
        sourceId: 'a1',
        isTardy: true,
      },
      {
        fecha: '2026-04-05',
        codigo: 'AR',
        label: 'Retardo',
        tone: 'amber',
        description: '',
        detailRef: '2',
        hasDetail: true,
        sourceType: 'ASISTENCIA',
        sourceId: 'a2',
        isTardy: true,
      },
      {
        fecha: '2026-04-08',
        codigo: 'AR',
        label: 'Retardo',
        tone: 'amber',
        description: '',
        detailRef: '3',
        hasDetail: true,
        sourceType: 'ASISTENCIA',
        sourceId: 'a3',
        isTardy: true,
      },
      {
        fecha: '2026-04-10',
        codigo: 'AR',
        label: 'Retardo',
        tone: 'amber',
        description: '',
        detailRef: '4',
        hasDetail: true,
        sourceType: 'ASISTENCIA',
        sourceId: 'a4',
        isTardy: true,
      },
      {
        fecha: '2026-04-14',
        codigo: 'AR',
        label: 'Retardo',
        tone: 'amber',
        description: '',
        detailRef: '5',
        hasDetail: true,
        sourceType: 'ASISTENCIA',
        sourceId: 'a5',
        isTardy: true,
      },
      {
        fecha: '2026-04-18',
        codigo: 'AR',
        label: 'Retardo',
        tone: 'amber',
        description: '',
        detailRef: '6',
        hasDetail: true,
        sourceType: 'ASISTENCIA',
        sourceId: 'a6',
        isTardy: true,
      },
    ]);

    expect(Array.from(result)).toEqual(['2026-04-08', '2026-04-18']);
  });

  it('usa I para incapacidad inicial e IS para subsecuente según el formato registrado', () => {
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
      '2026-04-01',
      '2026-04-30'
    );

    expect(markers.get('2026-04-01')?.code).toBe('I');
    expect(markers.get('2026-04-02')?.code).toBe('I');
    expect(markers.get('2026-04-03')?.code).toBe('I');
    expect(markers.get('2026-04-05')?.code).toBe('IS');
    expect(markers.get('2026-04-06')?.code).toBe('IS');
  });

  it('no infiere pago ni cambia el código por la duración o por asistencias intermedias', () => {
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
      '2026-04-01',
      '2026-04-30'
    );

    expect(markers.get('2026-04-04')?.code).toBe('I');
    expect(markers.get('2026-04-07')?.code).toBe('IS');
    expect(markers.get('2026-04-08')?.code).toBe('IS');
  });

  describe('isSupervisorMarkedAttendance', () => {
    it('retorna true cuando existe registro_manual_supervisor', () => {
      expect(
        isSupervisorMarkedAttendance({
          id: 'att-1',
          metadata: {
            registro_manual_supervisor: {
              tipo_registro: 'PUNTUAL',
              registrado_en: '2026-10-03T16:00:00Z',
            },
          },
        } as any)
      ).toBe(true);
    });

    it('retorna true cuando el supervisor resolvió la asistencia', () => {
      expect(
        isSupervisorMarkedAttendance({
          id: 'att-2',
          metadata: {
            supervision: {
              supervisor_resolucion: 'VALIDA',
              supervisor_resuelta_en: '2026-10-03T16:00:00Z',
            },
          },
        } as any)
      ).toBe(true);

      expect(
        isSupervisorMarkedAttendance({
          id: 'att-3',
          metadata: {
            supervision: {
              supervisor_resolucion: 'RECHAZADA',
              supervisor_comentarios: 'No asistió',
            },
          },
        } as any)
      ).toBe(true);
    });

    it('retorna true si la asistencia tiene estatus VALIDA o CERRADA', () => {
      expect(
        isSupervisorMarkedAttendance({
          id: 'att-valida',
          estatus: 'VALIDA',
          metadata: {},
        } as any)
      ).toBe(true);

      expect(
        isSupervisorMarkedAttendance({
          id: 'att-cerrada',
          estatus: 'CERRADA',
          metadata: {},
        } as any)
      ).toBe(true);
    });

    it('retorna false si es nulo o está PENDIENTE_VALIDACION sin resolución', () => {
      expect(isSupervisorMarkedAttendance(null)).toBe(false);
      expect(
        isSupervisorMarkedAttendance({
          id: 'att-pend',
          estatus: 'PENDIENTE_VALIDACION',
          metadata: {},
        } as any)
      ).toBe(false);
    });
  });

  describe('buildCellDraft bajo la regla de asistencia exclusiva de supervisor', () => {
    const mockDay: MaterializedCalendarDay = {
      fecha: '2026-10-02',
      pdvId: 'pdv-1',
      estadoOperativo: 'ASIGNADA_PDV',
      laborable: true,
      flags: {},
    } as any;

    const mockAssignment = {
      id: 'asig-1',
      empleado_id: 'emp-1',
      pdv_id: 'pdv-1',
      cuenta_cliente_id: 'cuenta-1',
      supervisor_empleado_id: 'sup-1',
      fecha_inicio: '2026-10-01',
      fecha_fin: '2026-10-31',
      dias_laborales: ['L', 'M', 'X', 'J', 'V', 'S'],
      dia_descanso: 'D',
      horario_referencia: '08:00 - 17:00',
      naturaleza: 'BASE',
      prioridad: 1,
      estado_publicacion: 'PUBLICADA',
      tipo: 'BASE',
    } as any;

    it('no genera falta automática en un día pasado sin registro; devuelve vacío (·)', () => {
      const cell = buildCellDraft(
        'emp-1',
        undefined,
        mockDay,
        '2026-10-03', // hoy es posterior a la fecha
        [mockAssignment],
        null, // sin asistencia
        [],
        null,
        false,
        false
      );

      expect(cell.codigo).toBe('');
      expect(cell.label).toBe('Sin registro');
      expect(cell.tone).toBe('neutral');
    });

    it('muestra A para las asistencias con estatus VALIDA o CERRADA del equipo', () => {
      const teamAttendance = {
        id: 'att-team-1',
        empleado_id: 'emp-1',
        fecha_operacion: '2026-10-02',
        estatus: 'VALIDA',
        check_in_utc: '2026-10-02T14:00:00Z',
        check_out_utc: '2026-10-02T23:00:00Z',
        metadata: {},
      } as any;

      const cell = buildCellDraft(
        'emp-1',
        undefined,
        mockDay,
        '2026-10-03',
        [mockAssignment],
        teamAttendance,
        [],
        null,
        false,
        false
      );

      expect(cell.codigo).toBe('A');
      expect(cell.label).toBe('Asistencia');
      expect(cell.tone).toBe('emerald');
    });

    it('asigna A cuando el supervisor marcó PUNTUAL', () => {
      const supervisorAttendance = {
        id: 'att-sup',
        empleado_id: 'emp-1',
        fecha_operacion: '2026-10-02',
        estatus: 'VALIDA',
        metadata: {
          registro_manual_supervisor: {
            tipo_registro: 'PUNTUAL',
            registrado_en: '2026-10-02T16:00:00Z',
          },
          supervision: {
            supervisor_resolucion: 'VALIDA',
          },
        },
      } as any;

      const cell = buildCellDraft(
        'emp-1',
        undefined,
        mockDay,
        '2026-10-03',
        [mockAssignment],
        supervisorAttendance,
        [],
        null,
        false,
        false
      );

      expect(cell.codigo).toBe('A');
      expect(cell.label).toBe('Asistencia');
      expect(cell.tone).toBe('emerald');
    });

    it('asigna AR cuando el supervisor marcó RETARDO', () => {
      const supervisorAttendance = {
        id: 'att-sup',
        empleado_id: 'emp-1',
        fecha_operacion: '2026-10-02',
        estatus: 'VALIDA',
        metadata: {
          registro_manual_supervisor: {
            tipo_registro: 'RETARDO',
            registrado_en: '2026-10-02T16:00:00Z',
          },
          supervision: {
            supervisor_resolucion: 'VALIDA',
          },
        },
      } as any;

      const cell = buildCellDraft(
        'emp-1',
        undefined,
        mockDay,
        '2026-10-03',
        [mockAssignment],
        supervisorAttendance,
        [],
        null,
        true,
        false
      );

      expect(cell.codigo).toBe('AR');
      expect(cell.label).toBe('Retardo');
      expect(cell.tone).toBe('amber');
    });

    it('asigna F cuando el supervisor marcó FALTA injustificada', () => {
      const supervisorAttendance = {
        id: 'att-sup-falta',
        empleado_id: 'emp-1',
        fecha_operacion: '2026-10-02',
        estatus: 'RECHAZADA',
        metadata: {
          registro_manual_supervisor: {
            tipo_registro: 'FALTA',
            registrado_en: '2026-10-02T16:00:00Z',
          },
          supervision: {
            supervisor_resolucion: 'RECHAZADA',
            supervisor_comentarios: 'Falta injustificada confirmada',
          },
        },
      } as any;

      const cell = buildCellDraft(
        'emp-1',
        undefined,
        mockDay,
        '2026-10-03',
        [mockAssignment],
        supervisorAttendance,
        [],
        null,
        false,
        false
      );

      expect(cell.codigo).toBe('F');
      expect(cell.label).toBe('Falta');
      expect(cell.tone).toBe('rose');
    });

    it('conserva D en días de descanso programados si no hay registro de supervisor', () => {
      const restDay: MaterializedCalendarDay = {
        fecha: '2026-10-04', // Domingo
        pdvId: 'pdv-1',
        estadoOperativo: 'ASIGNADA_PDV',
        laborable: false,
        flags: {},
      } as any;

      const cell = buildCellDraft(
        'emp-1',
        undefined,
        restDay,
        '2026-10-05',
        [mockAssignment],
        null,
        [],
        null,
        false,
        false
      );

      expect(cell.codigo).toBe('D');
      expect(cell.label).toBe('Descanso');
    });
  });
});
