import { describe, it, expect } from 'vitest';
import { filtrarYCalcularCanjes } from '../lib/canjesCalculation';

describe('filtrarYCalcularCanjes', () => {
  const mockRawRecords = [
    {
      id: '1',
      fecha_operativa: '2026-09-08',
      created_at: '2026-09-08T10:00:00Z',
      subtipo_registro: 'CANJE_CON_TICKET',
      empleado_nombre_snapshot: 'MARIA LOPEZ',
      pdv_nombre_snapshot: 'San Pablo Coyoacan',
      material_nombre_snapshot: 'PROTECTOR SOLAR 50ML',
      cantidad: 2,
      foto_evidencia_url: 'evidencias/foto1.jpg',
      observaciones: 'Ticket #1234',
      pdv: {
        nombre: 'San Pablo Coyoacan',
        clave_btl: 'BTL-SP-01',
        cadena: { id: 'c1', nombre: 'SAN PABLO' },
      },
    },
    {
      id: '2',
      fecha_operativa: '2026-09-08',
      created_at: '2026-09-08T11:00:00Z',
      subtipo_registro: 'CANJE_SIN_TICKET',
      empleado_nombre_snapshot: 'MARIA LOPEZ',
      pdv_nombre_snapshot: 'San Pablo Coyoacan',
      material_nombre_snapshot: 'BOLSA PLAYA',
      cantidad: 1,
      foto_evidencia_url: null,
      observaciones: '',
      pdv: {
        nombre: 'San Pablo Coyoacan',
        clave_btl: 'BTL-SP-01',
        cadena: { id: 'c1', nombre: 'SAN PABLO' },
      },
    },
    {
      id: '3',
      fecha_operativa: '2026-09-09',
      created_at: '2026-09-09T14:00:00Z',
      subtipo_registro: 'CANJE_CON_TICKET',
      empleado_nombre_snapshot: 'JUAN PEREZ',
      pdv_nombre_snapshot: 'Ahorro Universidad',
      material_nombre_snapshot: 'PROTECTOR SOLAR 50ML',
      cantidad: 5,
      foto_evidencia_url: 'evidencias/foto2.jpg',
      observaciones: 'Cliente frecuente',
      pdv: {
        nombre: 'Ahorro Universidad',
        clave_btl: 'BTL-FA-02',
        cadena: { id: 'c2', nombre: 'F AHORRO/DERMA' },
      },
    },
    {
      id: '4',
      fecha_operativa: '2026-09-10',
      created_at: '2026-09-10T16:00:00Z',
      subtipo_registro: 'CANJE_FUERA_JORNADA',
      empleado_nombre_snapshot: 'JUAN PEREZ',
      pdv_nombre_snapshot: 'Ahorro Universidad',
      material_nombre_snapshot: 'NECESER',
      cantidad: 3,
      foto_evidencia_url: 'evidencias/foto3.jpg',
      observaciones: 'Evento de noche',
      pdv: {
        nombre: 'Ahorro Universidad',
        clave_btl: 'BTL-FA-02',
        cadena: { id: 'c2', nombre: 'F AHORRO/DERMA' },
      },
    },
  ];

  it('debe devolver todas las cadenas y métricas globales cuando cadenaFilter es TODAS', () => {
    const result = filtrarYCalcularCanjes(mockRawRecords, {
      cadenaFilter: 'TODAS',
      subtipoFilter: 'TODOS',
    });

    expect(result.totalRecords).toBe(4);
    expect(result.metrics.totalCount).toBe(4);
    expect(result.metrics.totalPiezas).toBe(11); // 2 + 1 + 5 + 3
    expect(result.metrics.conTicketCount).toBe(2);
    expect(result.metrics.conTicketPiezas).toBe(7); // 2 + 5
    expect(result.metrics.sinTicketCount).toBe(1);
    expect(result.metrics.sinTicketPiezas).toBe(1);
    expect(result.metrics.fueraJornadaCount).toBe(1);
    expect(result.metrics.fueraJornadaPiezas).toBe(3);

    expect(result.cadenasDisponibles).toContain('SAN PABLO');
    expect(result.cadenasDisponibles).toContain('F AHORRO/DERMA');
  });

  it('debe filtrar exclusivamente por la cadena seleccionada y calcular sus métricas', () => {
    const result = filtrarYCalcularCanjes(mockRawRecords, {
      cadenaFilter: 'SAN PABLO',
      subtipoFilter: 'TODOS',
    });

    expect(result.totalRecords).toBe(2);
    expect(result.records).toHaveLength(2);
    expect(result.records.every((r) => r.cadena === 'SAN PABLO')).toBe(true);

    // Métricas exclusivas de SAN PABLO
    expect(result.metrics.totalCount).toBe(2);
    expect(result.metrics.totalPiezas).toBe(3); // 2 + 1
    expect(result.metrics.conTicketCount).toBe(1);
    expect(result.metrics.conTicketPiezas).toBe(2);
    expect(result.metrics.sinTicketCount).toBe(1);
    expect(result.metrics.sinTicketPiezas).toBe(1);
    expect(result.metrics.fueraJornadaCount).toBe(0);
    expect(result.metrics.fueraJornadaPiezas).toBe(0);
  });

  it('debe permitir combinar filtro de cadena con subtipo manteniendo métricas de la cadena', () => {
    const result = filtrarYCalcularCanjes(mockRawRecords, {
      cadenaFilter: 'SAN PABLO',
      subtipoFilter: 'CANJE_CON_TICKET',
    });

    // Solo un registro con ticket para SAN PABLO
    expect(result.totalRecords).toBe(1);
    expect(result.records[0].subtipoRegistro).toBe('CANJE_CON_TICKET');
    expect(result.records[0].cadena).toBe('SAN PABLO');

    // Las métricas de la tarjeta siguen reflejando el desglose completo de SAN PABLO
    expect(result.metrics.totalCount).toBe(2);
    expect(result.metrics.conTicketCount).toBe(1);
    expect(result.metrics.sinTicketCount).toBe(1);
  });

  it('debe filtrar por búsqueda de texto dentro de la cadena seleccionada', () => {
    const result = filtrarYCalcularCanjes(mockRawRecords, {
      cadenaFilter: 'F AHORRO/DERMA',
      searchQuery: 'NECESER',
    });

    expect(result.totalRecords).toBe(1);
    expect(result.records[0].materialNombre).toBe('NECESER');
    expect(result.records[0].cadena).toBe('F AHORRO/DERMA');
  });

  it('debe incluir cadenas de catálogo base en cadenasDisponibles si se le proporcionan', () => {
    const catalogoBase = ['LIVERPOOL', 'SEARS'];
    const result = filtrarYCalcularCanjes(
      mockRawRecords,
      { cadenaFilter: 'TODAS' },
      catalogoBase
    );

    expect(result.cadenasDisponibles).toEqual(
      expect.arrayContaining(['F AHORRO/DERMA', 'LIVERPOOL', 'SAN PABLO', 'SEARS'])
    );
  });
});
