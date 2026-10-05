import { describe, expect, it } from 'vitest';
import {
  generarExcelRutasAprobadas,
  type RutaVisitaExportRow,
} from './rutasExportService';

describe('rutasExportService', () => {
  it('debe generar un buffer de Excel no vacío con las columnas esperadas', async () => {
    const mockVisitas: RutaVisitaExportRow[] = [
      {
        semanaInicio: '2026-08-03',
        clavePdv: 'PDV-101',
        cadena: 'LIVERPOOL',
        nombrePdv: 'Liverpool Polanco',
        diaSemanaLabel: 'Martes',
        fechaVisita: '04/08/2026',
        supervisorNombre: 'Carlos Morales',
        supervisorCorreo: 'carlos.morales@isdin.com',
        supervisorTelefono: '5512345678',
        estatusRuta: 'PUBLICADA',
        estatusVisita: 'PENDIENTE',
      },
    ];

    const { buffer, filename } = await generarExcelRutasAprobadas(mockVisitas);

    expect(buffer).toBeInstanceOf(Uint8Array);
    expect(buffer.length).toBeGreaterThan(100);
    expect(filename).toContain('Reporte_Rutas_Semanales_');
    expect(filename).toContain('.xlsx');
  });

  it('debe generar un Excel válido aun cuando la lista de visitas esté vacía', async () => {
    const { buffer, filename } = await generarExcelRutasAprobadas([]);

    expect(buffer).toBeInstanceOf(Uint8Array);
    expect(buffer.length).toBeGreaterThan(100);
    expect(filename).toContain('.xlsx');
  });

  it('debe estructurar la hoja Frecuencia por PDV con encabezados en fila 3 sin fusionar verticalmente y con autoFilter', async () => {
    const ExcelJS = await import('exceljs');
    const { buffer } = await generarExcelRutasAprobadas([], { semanaInicio: '2026-10' });

    const workbook = new ExcelJS.Workbook();
    // @ts-expect-error ExcelJS buffer loading
    await workbook.xlsx.load(buffer);

    const freqSheet = workbook.getWorksheet('Frecuencia por PDV');
    expect(freqSheet).toBeDefined();

    // Las celdas de las columnas A a H no deben estar combinadas verticalmente entre filas 1, 2 y 3
    expect(freqSheet?.getCell('A1').isMerged).toBe(false);
    expect(freqSheet?.getCell('A2').isMerged).toBe(false);
    expect(freqSheet?.getCell('A3').isMerged).toBe(false);

    // Fila 3 debe contener los títulos exactos para permitir filtrado continuo
    expect(freqSheet?.getCell('A3').value).toBe('CLAVE BTL');
    expect(freqSheet?.getCell('B3').value).toBe('CADENA');
    expect(freqSheet?.getCell('C3').value).toBe('ID PDV');
    expect(freqSheet?.getCell('D3').value).toBe('SUCURSAL');
    expect(freqSheet?.getCell('E3').value).toBe('SUPERVISOR');
    expect(freqSheet?.getCell('F3').value).toBe('CORREO SUPERVISOR');
    expect(freqSheet?.getCell('G3').value).toBe('TELÉFONO SUPERVISOR');
    expect(freqSheet?.getCell('H3').value).toBe('MES');

    // Fila 3 debe tener el primer día (1) en la columna 9 (I)
    expect(freqSheet?.getCell(3, 9).value).toBe(1);

    // Total de días no debe estar combinado en fila 3
    const totalDaysCol = 9 + 31; // Octubre tiene 31 días -> col 40
    expect(freqSheet?.getCell(3, totalDaysCol).isMerged).toBe(false);
    expect(freqSheet?.getCell(3, totalDaysCol).value).toBe('# DÍAS');

    // autoFilter debe estar configurado desde la fila 3
    expect(freqSheet?.autoFilter).toBeDefined();
  });
});

