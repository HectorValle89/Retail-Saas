import { describe, it, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { exportarVentasToExcel, type VentaExportData } from './ventaExport';

describe('exportarVentasToExcel', () => {
  it('genera la pestaña "Ventas por Día, PDV y Prod" con FECHA VENTA y FECHA REGISTRO', async () => {
    // Mock del DOM para descarga en navegador
    const mockLink = {
      href: '',
      download: '',
      click: vi.fn(),
    };

    global.document = {
      createElement: vi.fn((tag: string) => (tag === 'a' ? mockLink : {})) as any,
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      } as any,
    } as any;

    global.URL = {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    } as any;

    global.Blob = class {
      constructor(public parts: any[], public options: any) {}
    } as any;

    // Espiar la creación de hojas en ExcelJS
    const addWorksheetSpy = vi.spyOn(ExcelJS.Workbook.prototype, 'addWorksheet');

    const mockData: VentaExportData = {
      range: 'mes',
      selectedMonth: '2026-07',
      filters: {
        supervisorLabel: 'LUZ EVELIA LOPEZ GUTIERREZ',
      },
      kpiSummary: {
        total: 3,
        confirmadas: 3,
        pendientes: 0,
        unidades: 6,
      },
      porPdv: [],
      porDc: [],
      porSupervisor: [],
      porCadena: [],
      diaria: [],
      semanal: [],
      dataset: [
        {
          fechaOperacion: '2026-07-02',
          fechaRegistro: '2026-07-03', // Registrada un día después
          weekBucket: '2026-06-29',
          pdvId: 'pdv-1',
          pdvLabel: 'BTL-BEN-01 - Benavides Av 13',
          pdvClaveBtl: 'BTL-BEN-01',
          pdvIdCadena: 'BEN-13',
          pdvNombre: 'Benavides Av 13',
          empleadoId: 'emp-1',
          empleadoLabel: 'ALEJANDRA HERNANDEZ CABRERA',
          empleadoIdNomina: 'NOM-101',
          supervisorId: 'sup-1',
          supervisorLabel: 'LUZ EVELIA LOPEZ GUTIERREZ',
          zona: 'Norte',
          cadena: 'Benavides',
          totalUnidades: 2,
          totalMonto: 1200,
          confirmada: true,
          total: 2,
          productoId: 'prod-1',
          productoSku: 'SKU-001',
          productoNombre: 'Fusion Water Magic 50ml',
          productoNombreCorto: 'Fusion Water',
        },
        {
          // Misma fecha venta, misma fecha registro, mismo PDV, misma DC, mismo producto -> agrupar
          fechaOperacion: '2026-07-02',
          fechaRegistro: '2026-07-03',
          weekBucket: '2026-06-29',
          pdvId: 'pdv-1',
          pdvLabel: 'BTL-BEN-01 - Benavides Av 13',
          pdvClaveBtl: 'BTL-BEN-01',
          pdvIdCadena: 'BEN-13',
          pdvNombre: 'Benavides Av 13',
          empleadoId: 'emp-1',
          empleadoLabel: 'ALEJANDRA HERNANDEZ CABRERA',
          empleadoIdNomina: 'NOM-101',
          supervisorId: 'sup-1',
          supervisorLabel: 'LUZ EVELIA LOPEZ GUTIERREZ',
          zona: 'Norte',
          cadena: 'Benavides',
          totalUnidades: 1,
          totalMonto: 600,
          confirmada: true,
          total: 1,
          productoId: 'prod-1',
          productoSku: 'SKU-001',
          productoNombre: 'Fusion Water Magic 50ml',
          productoNombreCorto: 'Fusion Water',
        },
        {
          // Otra fecha venta, registrada el 4 de julio
          fechaOperacion: '2026-07-03',
          fechaRegistro: '2026-07-04',
          weekBucket: '2026-06-29',
          pdvId: 'pdv-1',
          pdvLabel: 'BTL-BEN-01 - Benavides Av 13',
          pdvClaveBtl: 'BTL-BEN-01',
          pdvIdCadena: 'BEN-13',
          pdvNombre: 'Benavides Av 13',
          empleadoId: 'emp-1',
          empleadoLabel: 'ALEJANDRA HERNANDEZ CABRERA',
          empleadoIdNomina: 'NOM-101',
          supervisorId: 'sup-1',
          supervisorLabel: 'LUZ EVELIA LOPEZ GUTIERREZ',
          zona: 'Norte',
          cadena: 'Benavides',
          totalUnidades: 3,
          totalMonto: 1500,
          confirmada: true,
          total: 3,
          productoId: 'prod-2',
          productoSku: 'SKU-002',
          productoNombre: 'Eryfotona Actinica 100ml',
          productoNombreCorto: 'Eryfotona',
        },
        {
          // Registro de descanso / incidencia que no debe generar fila de venta si no tiene unidades
          fechaOperacion: '2026-07-04',
          fechaRegistro: '2026-07-04',
          weekBucket: '2026-06-29',
          pdvId: 'pdv-1',
          pdvLabel: 'BTL-BEN-01 - Benavides Av 13',
          pdvClaveBtl: 'BTL-BEN-01',
          pdvIdCadena: 'BEN-13',
          pdvNombre: 'Benavides Av 13',
          empleadoId: 'emp-1',
          empleadoLabel: 'ALEJANDRA HERNANDEZ CABRERA',
          supervisorId: 'sup-1',
          supervisorLabel: 'LUZ EVELIA LOPEZ GUTIERREZ',
          zona: 'Norte',
          cadena: 'Benavides',
          totalUnidades: 0,
          totalMonto: 0,
          confirmada: false,
          total: 0,
          subtipoIncidencia: '0',
        },
      ],
    };

    await exportarVentasToExcel(mockData);

    // Verificar que se haya creado la hoja requerida
    const createdWorksheetNames = addWorksheetSpy.mock.calls.map((call) => call[0]);
    expect(createdWorksheetNames).toContain('Ventas por Día, PDV y Prod');

    // Obtener la instancia de la hoja creada
    const dailySheetCallIndex = createdWorksheetNames.indexOf('Ventas por Día, PDV y Prod');
    const dailySheet = addWorksheetSpy.mock.results[dailySheetCallIndex]?.value as ExcelJS.Worksheet;
    expect(dailySheet).toBeDefined();

    // Validar encabezados en la fila 3 (14 columnas)
    const headerRow = dailySheet.getRow(3);
    const headers = [
      headerRow.getCell(1).value,
      headerRow.getCell(2).value,
      headerRow.getCell(3).value,
      headerRow.getCell(4).value,
      headerRow.getCell(5).value,
      headerRow.getCell(6).value,
      headerRow.getCell(7).value,
      headerRow.getCell(8).value,
      headerRow.getCell(9).value,
      headerRow.getCell(10).value,
      headerRow.getCell(11).value,
      headerRow.getCell(12).value,
      headerRow.getCell(13).value,
      headerRow.getCell(14).value,
    ];

    expect(headers).toEqual([
      'FECHA VENTA',
      'FECHA REGISTRO',
      'CLAVE BTL',
      'CADENA',
      'ID PDV',
      'SUCURSAL',
      'SUPERVISOR',
      'ID NÓMINA',
      'DERMOCONSEJERA',
      'SKU',
      'PRODUCTO',
      'NOMBRE CORTO',
      'PIEZAS VENDIDAS',
      'MONTO TOTAL ($)',
    ]);

    // Fila 4: Fecha Venta 2026-07-02, Fecha Registro 2026-07-03, Fusion Water (2 + 1 = 3 unidades, 1800 monto)
    const row4 = dailySheet.getRow(4);
    expect(row4.getCell(1).value).toBe('2026-07-02');
    expect(row4.getCell(2).value).toBe('2026-07-03');
    expect(row4.getCell(3).value).toBe('BTL-BEN-01');
    expect(row4.getCell(4).value).toBe('Benavides');
    expect(row4.getCell(5).value).toBe('BEN-13');
    expect(row4.getCell(6).value).toBe('Benavides Av 13');
    expect(row4.getCell(7).value).toBe('LUZ EVELIA LOPEZ GUTIERREZ');
    expect(row4.getCell(8).value).toBe('NOM-101');
    expect(row4.getCell(9).value).toBe('ALEJANDRA HERNANDEZ CABRERA');
    expect(row4.getCell(10).value).toBe('SKU-001');
    expect(row4.getCell(11).value).toBe('Fusion Water Magic 50ml');
    expect(row4.getCell(12).value).toBe('Fusion Water');
    expect(row4.getCell(13).value).toBe(3); // 2 + 1 agrupados
    expect(row4.getCell(14).value).toBe(1800); // 1200 + 600

    // Fila 5: Fecha Venta 2026-07-03, Fecha Registro 2026-07-04, Eryfotona (3 unidades, 1500 monto)
    const row5 = dailySheet.getRow(5);
    expect(row5.getCell(1).value).toBe('2026-07-03');
    expect(row5.getCell(2).value).toBe('2026-07-04');
    expect(row5.getCell(10).value).toBe('SKU-002');
    expect(row5.getCell(13).value).toBe(3);
    expect(row5.getCell(14).value).toBe(1500);

    // Fila 6: TOTAL GENERAL con fórmulas de suma en columnas M y N
    const row6 = dailySheet.getRow(6);
    expect(row6.getCell(1).value).toBe('TOTAL GENERAL');
    expect((row6.getCell(13).value as any)?.formula).toBe('SUM(M4:M5)');
    expect((row6.getCell(14).value as any)?.formula).toBe('SUM(N4:N5)');

    // Verificar descarga
    expect(mockLink.click).toHaveBeenCalled();
    expect(mockLink.download).toMatch(/Reporte_Ventas_MES_\d{4}-\d{2}-\d{2}\.xlsx/);
  });
});
