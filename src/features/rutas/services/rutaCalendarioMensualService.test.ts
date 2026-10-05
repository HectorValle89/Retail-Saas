import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActorActual } from '@/lib/auth/session';
import {
  obtenerCalendarioMensualRuta,
  obtenerDetalleRutaCalendarioDia,
} from './rutaCalendarioMensualService';

vi.mock('next/cache', () => ({
  unstable_cache: (read: () => unknown) => read,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(),
}));

const ACTOR: ActorActual = {
  authUserId: 'auth-admin',
  usuarioId: 'usuario-admin',
  empleadoId: 'empleado-admin',
  cuentaClienteId: 'cuenta-isdin',
  username: 'administrador',
  correoElectronico: 'administrador@example.test',
  correoVerificado: true,
  estadoCuenta: 'ACTIVA',
  nombreCompleto: 'Administración',
  puesto: 'ADMINISTRADOR',
};

function getWeekData(fecha: string) {
  const date = new Date(`${fecha}T12:00:00.000Z`);
  const diaSemana = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - (diaSemana - 1));
  const semanaInicio = date.toISOString().slice(0, 10);
  return { diaSemana, semanaInicio };
}

function buildAggregatedMonthPayload() {
  const days = Array.from({ length: 31 }, (_, index) => {
    const fecha = `2026-08-${String(index + 1).padStart(2, '0')}`;
    const { diaSemana, semanaInicio } = getWeekData(fecha);

    return {
      route_id: `ruta-${semanaInicio}`,
      dia_semana: diaSemana,
      fecha,
      planned_count: 50,
      completed_count: 10,
      event_count: 0,
      displaced_count: 0,
      replacement_pending_count: 0,
    };
  });
  const weekStarts = [...new Set(days.map((day) => day.route_id.replace('ruta-', '')))];

  return {
    routes: weekStarts.map((semanaInicio) => ({
      route_id: `ruta-${semanaInicio}`,
      cuenta_cliente_id: 'cuenta-isdin',
      supervisor_empleado_id: 'supervisor-1',
      supervisor_nombre: 'Ana Supervisora',
      supervisor_zona: 'NORTE',
      semana_inicio: semanaInicio,
      route_status: 'PUBLICADA',
      route_notes: null,
      route_metadata: {},
      route_updated_at: '2026-08-01T12:00:00.000Z',
    })),
    days,
  };
}

describe('rutaCalendarioMensualService', () => {
  it('conserva todos los conteos cuando el mes representa más de 1,000 visitas', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: buildAggregatedMonthPayload(),
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    const result = await obtenerCalendarioMensualRuta(supabase, ACTOR, {
      monthIso: '2026-08',
    });

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('rpc_ruta_calendario_mensual_resumen', {
      p_month_start: '2026-08-01',
      p_month_end: '2026-08-31',
      p_cuenta_cliente_id: 'cuenta-isdin',
      p_supervisor_empleado_id: null,
    });
    expect(result.totals).toEqual({
      planned: 1550,
      completed: 310,
      pending: 1240,
      routes: 6,
    });
    expect(result.supervisors).toHaveLength(1);
    expect(result.supervisors[0]?.cells).toHaveLength(31);
    expect(result.supervisors[0]?.cells.every((cell) => cell.plannedCount === 50)).toBe(true);
  });

  it('muestra "—" y tono neutral para días con 0 visitas aunque la ruta esté en PENDIENTE_COORDINACION', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        routes: [
          {
            route_id: 'ruta-2026-08-31',
            cuenta_cliente_id: 'cuenta-isdin',
            supervisor_empleado_id: 'supervisor-1',
            supervisor_nombre: 'Ana Supervisora',
            supervisor_zona: 'NORTE',
            semana_inicio: '2026-08-31',
            route_status: 'BORRADOR',
            route_metadata: {
              approval: { state: 'PENDIENTE_COORDINACION' },
            },
            route_notes: null,
            route_updated_at: '2026-08-31T12:00:00.000Z',
          },
        ],
        days: [
          {
            route_id: 'ruta-2026-08-31',
            dia_semana: 2,
            fecha: '2026-09-01',
            planned_count: 0,
            completed_count: 0,
            event_count: 0,
            displaced_count: 0,
            replacement_pending_count: 0,
          },
          {
            route_id: 'ruta-2026-08-31',
            dia_semana: 3,
            fecha: '2026-09-02',
            planned_count: 4,
            completed_count: 0,
            event_count: 0,
            displaced_count: 0,
            replacement_pending_count: 0,
          },
        ],
      },
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    const result = await obtenerCalendarioMensualRuta(supabase, ACTOR, {
      monthIso: '2026-09',
    });

    const supervisor = result.supervisors[0];
    const cellSep01 = supervisor?.cells.find((cell) => cell.fecha === '2026-09-01');
    const cellSep02 = supervisor?.cells.find((cell) => cell.fecha === '2026-09-02');

    expect(cellSep01?.plannedCount).toBe(0);
    expect(cellSep01?.label).toBe('—');
    expect(cellSep01?.tone).toBe('neutral');

    expect(cellSep02?.plannedCount).toBe(4);
    expect(cellSep02?.label).toBe('P4');
    expect(cellSep02?.tone).toBe('violet');
  });

  it('muestra tono amber (amarillo) y etiqueta !{n} cuando la ruta tiene estado CAMBIOS_SOLICITADOS', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        routes: [
          {
            route_id: 'route-cambios',
            cuenta_cliente_id: 'cuenta-1',
            supervisor_empleado_id: 'sup-1',
            supervisor_nombre: 'Xochitl Carrillo',
            supervisor_zona: 'CENTRO',
            supervisor_estatus_laboral: 'ACTIVO',
            supervisor_fecha_baja: null,
            semana_inicio: '2026-08-31',
            route_status: 'BORRADOR',
            route_notes: null,
            route_metadata: {
              approval: { state: 'CAMBIOS_SOLICITADOS', note: 'Favor de ajustar visitas' },
            },
            route_updated_at: '2026-09-01T00:00:00Z',
          },
        ],
        days: [
          {
            route_id: 'route-cambios',
            dia_semana: 3,
            fecha: '2026-09-02',
            planned_count: 5,
            completed_count: 0,
            event_count: 0,
            displaced_count: 0,
            replacement_pending_count: 0,
          },
        ],
      },
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    const result = await obtenerCalendarioMensualRuta(supabase, ACTOR, {
      monthIso: '2026-09',
    });

    const supervisor = result.supervisors[0];
    const cellSep02 = supervisor?.cells.find((cell) => cell.fecha === '2026-09-02');

    expect(cellSep02?.plannedCount).toBe(5);
    expect(cellSep02?.label).toBe('!5');
    expect(cellSep02?.tone).toBe('amber');
    expect(cellSep02?.approvalState).toBe('CAMBIOS_SOLICITADOS');
  });

  it('fuerza el alcance del supervisor autenticado en la consulta agregada', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { routes: [], days: [] }, error: null });
    const supabase = { rpc } as unknown as SupabaseClient;

    await obtenerCalendarioMensualRuta(
      supabase,
      { ...ACTOR, empleadoId: 'supervisor-propio', puesto: 'SUPERVISOR' },
      { monthIso: '2026-09', supervisorEmpleadoId: 'supervisor-ajeno' }
    );

    expect(rpc).toHaveBeenCalledWith(
      'rpc_ruta_calendario_mensual_resumen',
      expect.objectContaining({ p_supervisor_empleado_id: 'supervisor-propio' })
    );
  });

  it('obtiene el detalle del día con fotos, preguntas del formulario, geocercas y desplazamientos vinculados', async () => {
    const mockRoute = {
      id: 'route-123',
      cuenta_cliente_id: 'cuenta-isdin',
      supervisor_empleado_id: 'supervisor-1',
      semana_inicio: '2026-08-17',
      estatus: 'PUBLICADA',
      notas: 'Ruta semanal normal',
      metadata: {
        approval: { state: 'APROBADA' },
      },
      updated_at: '2026-08-17T08:00:00Z',
      supervisor: { id: 'supervisor-1', nombre_completo: 'Ana Supervisora', zona: 'CENTRO' },
    };

    const mockVisits = [
      {
        id: 'visit-1',
        ruta_semanal_id: 'route-123',
        supervisor_empleado_id: 'supervisor-1',
        pdv_id: 'pdv-1',
        pdv: {
          id: 'pdv-1',
          clave_btl: 'ISDIN-001',
          nombre: 'Liverpool Polanco',
          zona: 'CENTRO',
          direccion: 'Av. Horacio 203',
        },
        dia_semana: 1, // Lunes 2026-08-17
        orden: 1,
        estatus: 'COMPLETADA',
        selfie_url: 'https://r2.example.com/checkout.jpg',
        evidencia_url: 'https://r2.example.com/evidencia.jpg',
        checklist_calidad: {
          registro_supervisor_pdv: true,
          acceso_gerente_solicitado: true,
          feedback_dc_solicitada: true,
          horario_dc_registrado: true,
        },
        comentarios: 'Excelente exhibición en piso.',
        completada_en: '2026-08-17T11:30:00Z',
        metadata: {
          checkIn: {
            at: '2026-08-17T09:15:00Z',
            gpsState: 'DENTRO_GEOCERCA',
            distanciaMetros: 12.5,
            selfieUrl: 'https://r2.example.com/checkin.jpg',
          },
          checkOut: {
            at: '2026-08-17T11:30:00Z',
            gpsState: 'DENTRO_GEOCERCA',
            distanciaMetros: 8.2,
            selfieUrl: 'https://r2.example.com/checkout.jpg',
            evidenciaUrl: 'https://r2.example.com/evidencia.jpg',
            comments: 'Excelente exhibición en piso.',
          },
          checklistComments: {
            feedback_dc_solicitada: 'El gerente comentó que la DC es puntual y activa.',
            horario_entrada_dc: '09:00',
          },
          loveIsdinRecordsCount: 5,
        },
      },
      {
        id: 'visit-2',
        ruta_semanal_id: 'route-123',
        supervisor_empleado_id: 'supervisor-1',
        pdv_id: 'pdv-2',
        pdv: {
          id: 'pdv-2',
          clave_btl: 'ISDIN-002',
          nombre: 'Palacio de Hierro Perisur',
          zona: 'SUR',
          direccion: 'Periférico Sur 4690',
        },
        dia_semana: 1,
        orden: 2,
        estatus: 'PLANIFICADA',
        selfie_url: null,
        evidencia_url: null,
        checklist_calidad: null,
        comentarios: null,
        completada_en: null,
        metadata: {},
      },
      {
        id: 'visit-3',
        ruta_semanal_id: 'route-123',
        supervisor_empleado_id: 'supervisor-1',
        pdv_id: 'pdv-4',
        pdv: {
          id: 'pdv-4',
          clave_btl: 'ISDIN-004',
          nombre: 'Farmacia San Pablo Del Valle',
          zona: 'SUR',
          direccion: 'Insurgentes Sur 1200',
        },
        dia_semana: 1,
        orden: 3,
        estatus: 'COMPLETADA',
        selfie_url: 'https://r2.example.com/checkout-delvalle.jpg',
        evidencia_url: null,
        checklist_calidad: null,
        comentarios: null,
        completada_en: '2026-08-17T08:30:00Z',
        metadata: {
          checkIn: {
            at: '2026-08-17T08:00:00Z',
            gpsState: 'DENTRO_GEOCERCA',
            distanciaMetros: 5.0,
          },
        },
      },
    ];

    const mockEvents = [
      {
        id: 'event-1',
        ruta_semanal_id: 'route-123',
        ruta_semanal_visita_id: 'visit-2',
        supervisor_empleado_id: 'supervisor-1',
        pdv_id: 'pdv-3',
        pdv: {
          id: 'pdv-3',
          clave_btl: 'ISDIN-003',
          nombre: 'Sanborns Palmas',
          zona: 'PONIENTE',
          direccion: 'Palmas 555',
        },
        fecha_operacion: '2026-08-17',
        tipo_evento: 'VISITA_ADICIONAL',
        modo_impacto: 'SOBREPONE_PARCIAL',
        estatus_aprobacion: 'APROBADO',
        estatus_ejecucion: 'COMPLETADO',
        titulo: 'Visita adicional por inventario urgente',
        descripcion: 'Se atendió faltante de producto en Sanborns Palmas',
        sede: 'Sanborns Palmas',
        hora_inicio: '13:00',
        hora_fin: '15:00',
        selfie_url: 'https://r2.example.com/event-selfie.jpg',
        evidencia_url: null,
        check_in_en: '2026-08-17T13:05:00Z',
        check_out_en: '2026-08-17T15:00:00Z',
        metadata: {
          displacedVisitIds: ['visit-2'],
          checkIn: {
            at: '2026-08-17T13:05:00Z',
            gpsState: 'DENTRO_GEOCERCA',
            distanciaMetros: 15,
            selfieUrl: 'https://r2.example.com/event-selfie.jpg',
          },
        },
      },
    ];

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'ruta_semanal') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [mockRoute], error: null }),
          };
        }
        if (table === 'ruta_semanal_visita') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: mockVisits, error: null }),
          };
        }
        if (table === 'ruta_mensual_envio') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === 'ruta_agenda_evento') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: mockEvents, error: null }),
          };
        }
        if (table === 'ruta_cuota_supervisor_pdv') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [
                {
                  pdv_id: 'pdv-1',
                  pdv: {
                    id: 'pdv-1',
                    clave_btl: 'BTL-1',
                    nombre: 'Farmacia San Pablo Del Valle',
                    zona: 'CENTRO',
                    direccion: 'Av. Coyoacán',
                  },
                },
                {
                  pdv_id: 'pdv-4',
                  pdv: {
                    id: 'pdv-4',
                    clave_btl: 'BTL-4',
                    nombre: 'Sears Satélite',
                    zona: 'NORTE',
                    direccion: 'Circuito Centro Comercial',
                  },
                },
                {
                  pdv_id: 'pdv-5',
                  pdv: {
                    id: 'pdv-5',
                    clave_btl: 'BTL-5',
                    nombre: 'Liverpool Perisur Vacante',
                    zona: 'SUR',
                    direccion: 'Periférico Sur',
                  },
                },
              ],
              error: null,
            }),
          };
        }
        if (table === 'asignacion') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [{ pdv_id: 'pdv-1' }, { pdv_id: 'pdv-4' }],
              error: null,
            }),
          };
        }
        if (table === 'geocerca_pdv') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [
                {
                  pdv_id: 'pdv-3',
                  latitud: 19.4326,
                  longitud: -99.1332,
                  radio_tolerancia_metros: 150,
                },
                {
                  pdv_id: 'pdv-4',
                  latitud: 19.5082,
                  longitud: -99.2345,
                  radio_tolerancia_metros: 150,
                },
                {
                  pdv_id: 'pdv-5',
                  latitud: 19.3042,
                  longitud: -99.1902,
                  radio_tolerancia_metros: 150,
                },
              ],
              error: null,
            }),
          };
        }
        const genericQueryBuilder: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
        return genericQueryBuilder;
      }),
    } as unknown as SupabaseClient;

    const result = await obtenerDetalleRutaCalendarioDia(mockSupabase, ACTOR, {
      fecha: '2026-08-17',
      supervisorEmpleadoId: 'supervisor-1',
    });

    expect(result.fecha).toBe('2026-08-17');
    expect(result.plannedVisits).toHaveLength(3);

    // Visita 1 (la más temprana por hora de llegada real: 08:00 AM)
    const earliestVisit = result.plannedVisits[0];
    expect(earliestVisit?.pdv).toBe('Farmacia San Pablo Del Valle');
    expect(earliestVisit?.checkInAt).toBe('2026-08-17T08:00:00Z');

    // Visita 2 (segunda en orden de llegada real: 09:15 AM)
    const secondVisit = result.plannedVisits[1];
    expect(secondVisit?.pdv).toBe('Liverpool Polanco');
    expect(secondVisit?.checkInAt).toBe('2026-08-17T09:15:00Z');
    expect(secondVisit?.fotos).toHaveLength(3);
    expect(secondVisit?.fotos[0]?.tipo).toBe('CHECK_IN');
    expect(secondVisit?.fotos[1]?.tipo).toBe('CHECK_OUT');
    expect(secondVisit?.fotos[2]?.tipo).toBe('EVIDENCIA');
    expect(secondVisit?.geocercaEstado).toBe('DENTRO');
    expect(secondVisit?.geocercaResumen).toContain('Dentro de geocerca');
    expect(secondVisit?.loveIsdinRecordsCount).toBe(5);

    const feedbackItem = secondVisit?.checklistItems.find(
      (item) => item.key === 'feedback_dc_solicitada'
    );
    expect(feedbackItem?.checked).toBe(true);
    expect(feedbackItem?.commentValue).toBe('El gerente comentó que la DC es puntual y activa.');

    // Visita 3 (visita sin check-in aún / desplazada por evento)
    const thirdVisit = result.plannedVisits[2];
    expect(thirdVisit?.pdv).toBe('Palacio de Hierro Perisur');
    expect(thirdVisit?.desplazamiento?.displaced).toBe(true);
    expect(thirdVisit?.desplazamiento?.eventTitulo).toBe('Visita adicional por inventario urgente');

    // Validar evento
    expect(result.events).toHaveLength(1);
    const event1 = result.events[0];
    expect(event1?.tipoLabel).toBe('Visita adicional / cambio de tienda');
    expect(event1?.modoImpactoLabel).toBe('Sobrepone parte de la ruta');
    expect(event1?.displacedVisits).toHaveLength(1);
    expect(event1?.displacedVisits[0]?.pdv).toBe('Palacio de Hierro Perisur');
    expect(event1?.checkInAt).toBe('2026-08-17T13:05:00Z');
    expect(event1?.checkOutAt).toBe('2026-08-17T15:00:00Z');
    expect(event1?.geocercaEstado).toBe('DENTRO');
    expect(event1?.fotos).toHaveLength(1);

    // Validar tiendas del territorio y estatus de vacante
    expect(result.territoryPdvs).toBeDefined();
    const pdvSinVisita = result.territoryPdvs?.find((p) => p.pdvId === 'pdv-4');
    expect(pdvSinVisita).toBeDefined();
    expect(pdvSinVisita?.isVacante).toBe(false);

    const pdvVacante = result.territoryPdvs?.find((p) => p.pdvId === 'pdv-5');
    expect(pdvVacante).toBeDefined();
    expect(pdvVacante?.isVacante).toBe(true);
  });

  it('excluye supervisores en estatus BAJA cuando no tienen visitas ni eventos en el mes', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        routes: [
          {
            route_id: 'ruta-2026-08-31-activa',
            cuenta_cliente_id: 'cuenta-isdin',
            supervisor_empleado_id: 'supervisor-activo',
            supervisor_nombre: 'Ana Supervisora',
            supervisor_zona: 'NORTE',
            supervisor_estatus_laboral: 'ACTIVO',
            supervisor_fecha_baja: null,
            semana_inicio: '2026-08-31',
            route_status: 'BORRADOR',
            route_metadata: {},
            route_notes: null,
            route_updated_at: '2026-08-31T12:00:00.000Z',
          },
          {
            route_id: 'ruta-2026-08-31-baja',
            cuenta_cliente_id: 'cuenta-isdin',
            supervisor_empleado_id: 'supervisor-baja',
            supervisor_nombre: 'Vanesa Palacios',
            supervisor_zona: 'NORTE',
            supervisor_estatus_laboral: 'BAJA',
            supervisor_fecha_baja: '2026-08-31',
            semana_inicio: '2026-08-31',
            route_status: 'BORRADOR',
            route_metadata: {},
            route_notes: null,
            route_updated_at: '2026-08-31T12:00:00.000Z',
          },
        ],
        days: [
          {
            route_id: 'ruta-2026-08-31-activa',
            dia_semana: 2,
            fecha: '2026-09-01',
            planned_count: 2,
            completed_count: 0,
            event_count: 0,
            displaced_count: 0,
            replacement_pending_count: 0,
          },
          {
            route_id: 'ruta-2026-08-31-baja',
            dia_semana: 2,
            fecha: '2026-09-01',
            planned_count: 0,
            completed_count: 0,
            event_count: 0,
            displaced_count: 0,
            replacement_pending_count: 0,
          },
        ],
      },
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    const result = await obtenerCalendarioMensualRuta(supabase, ACTOR, {
      monthIso: '2026-09',
    });

    expect(result.supervisors.map((s) => s.supervisor)).toEqual(['Ana Supervisora']);
    expect(result.supervisors.some((s) => s.supervisor === 'Vanesa Palacios')).toBe(false);
  });

  it('conserva supervisores en estatus BAJA que sí tuvieron visitas completadas en el mes', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        routes: [
          {
            route_id: 'ruta-2026-08-31-baja-con-visitas',
            cuenta_cliente_id: 'cuenta-isdin',
            supervisor_empleado_id: 'supervisor-baja-activa',
            supervisor_nombre: 'Vanesa Palacios',
            supervisor_zona: 'NORTE',
            supervisor_estatus_laboral: 'BAJA',
            supervisor_fecha_baja: '2026-09-05',
            semana_inicio: '2026-08-31',
            route_status: 'EN_PROGRESO',
            route_metadata: {},
            route_notes: null,
            route_updated_at: '2026-08-31T12:00:00.000Z',
          },
        ],
        days: [
          {
            route_id: 'ruta-2026-08-31-baja-con-visitas',
            dia_semana: 2,
            fecha: '2026-09-01',
            planned_count: 3,
            completed_count: 3,
            event_count: 0,
            displaced_count: 0,
            replacement_pending_count: 0,
          },
        ],
      },
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    const result = await obtenerCalendarioMensualRuta(supabase, ACTOR, {
      monthIso: '2026-09',
    });

    expect(result.supervisors.map((s) => s.supervisor)).toEqual(['Vanesa Palacios']);
    expect(result.supervisors[0]?.cells.find((c) => c.fecha === '2026-09-01')?.completedCount).toBe(3);
  });

  it('filtra tiendas del territorio según la fecha exacta consultada cuando hubo reasignación a mitad de mes', async () => {
    const lteQuotaSpy = vi.fn().mockReturnThis();
    const orQuotaSpy = vi.fn().mockReturnThis();
    const lteRelSpy = vi.fn().mockReturnThis();
    const orRelSpy = vi.fn().mockReturnThis();

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'ruta_semanal') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'ruta-sep-21',
                  semana_inicio: '2026-09-21',
                  estatus: 'APROBADA',
                  supervisor: { id: 'supervisor-zenaida', nombre_completo: 'Zenaida Monroy', zona: 'CENTRO' },
                },
              ],
              error: null,
            }),
          };
        }
        if (table === 'ruta_cuota_supervisor_pdv') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            lte: lteQuotaSpy,
            or: orQuotaSpy,
            limit: vi.fn().mockResolvedValue({
              data: [
                {
                  pdv_id: 'pdv-zenaida',
                  pdv: {
                    id: 'pdv-zenaida',
                    clave_btl: 'BTL-FAH-LUIS-9S',
                    nombre: 'F Ahorro Luis Barragán',
                    zona: 'CENTRO',
                    direccion: 'Prol. Reforma',
                  },
                },
              ],
              error: null,
            }),
          };
        }
        if (table === 'supervisor_pdv') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            lte: lteRelSpy,
            or: orRelSpy,
            limit: vi.fn().mockResolvedValue({
              data: [
                {
                  pdv_id: 'pdv-zenaida',
                  pdv: {
                    id: 'pdv-zenaida',
                    clave_btl: 'BTL-FAH-LUIS-9S',
                    nombre: 'F Ahorro Luis Barragán',
                    zona: 'CENTRO',
                    direccion: 'Prol. Reforma',
                  },
                },
              ],
              error: null,
            }),
          };
        }
        if (table === 'asignacion') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [{ pdv_id: 'pdv-zenaida' }],
              error: null,
            }),
          };
        }
        if (table === 'geocerca_pdv') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [{ pdv_id: 'pdv-zenaida', latitud: 19.362, longitud: -99.267, radio_tolerancia_metros: 100 }],
              error: null,
            }),
          };
        }
        const genericQueryBuilder: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
        return genericQueryBuilder;
      }),
    } as unknown as SupabaseClient;

    const result = await obtenerDetalleRutaCalendarioDia(mockSupabase, ACTOR, {
      fecha: '2026-09-21',
      supervisorEmpleadoId: 'supervisor-zenaida',
    });

    // Validar que se consultó con fecha específica 2026-09-21, no fin de mes
    expect(lteQuotaSpy).toHaveBeenCalledWith('vigente_desde', '2026-09-21');
    expect(orQuotaSpy).toHaveBeenCalledWith('vigente_hasta.is.null,vigente_hasta.gte.2026-09-21');
    expect(lteRelSpy).toHaveBeenCalledWith('fecha_inicio', '2026-09-21');
    expect(orRelSpy).toHaveBeenCalledWith('fecha_fin.is.null,fecha_fin.gte.2026-09-21');

    expect(result.territoryPdvs).toHaveLength(1);
    expect(result.territoryPdvs?.[0]?.claveBtl).toBe('BTL-FAH-LUIS-9S');
    expect(result.territoryPdvs?.[0]?.isVacante).toBe(false);
  });
});
