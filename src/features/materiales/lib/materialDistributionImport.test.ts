import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseMaterialDistributionWorkbook } from './materialDistributionImport';

function buildWorkbookBuffer(rows: unknown[][], sheetName = 'Bloque HEB') {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('materialDistributionImport', () => {
  it('interpreta el formato homologado con preset, totales y encabezados por ID BTL', () => {
    const buffer = buildWorkbookBuffer([
      [
        '',
        '',
        '',
        '',
        '',
        'CANJE || Compra 2 y recibe 1 obsequio',
        'TESTER || Exhibir en anaquel principal',
      ],
      ['', '', '', '', '', '3', '3'],
      [
        'ID BTL',
        'CADENA',
        'ID',
        'SUCURSAL',
        'TERRITORIO',
        'ISDIN CEUTICS SKIN DROPS',
        'CANJERAS NEGRAS ISDIN',
      ],
      ['BTL-HEB-1', 'HEB', '2987', 'LAS FUENTES', '', '2', '0'],
      ['BTL-HEB-2', 'HEB', '2961', 'LINDA VISTA', 'MONTERREY', '1', '3'],
    ]);

    const preview = parseMaterialDistributionWorkbook(buffer, {
      fileName: 'dispersion_2026-04.xlsx',
    });

    expect(preview.resolvedMonth).toBe('2026-04-01');
    expect(preview.sheetSummaries).toHaveLength(1);
    expect(preview.sheetSummaries[0]).toMatchObject({
      sheetName: 'Bloque HEB',
      packageCount: 2,
      productCount: 2,
      totalAssignedQuantity: 6,
    });

    expect(preview.pdvPackages[0]).toMatchObject({
      idBtl: 'BTL-HEB-1',
      idPdvCadena: '2987',
      sucursal: 'LAS FUENTES',
      nombreDc: null,
      usuarioDc: null,
      idNominaDc: null,
    });
    expect(preview.pdvPackages[1]).toMatchObject({
      idBtl: 'BTL-HEB-2',
      idNominaDc: null,
    });

    const firstRule = preview.materialRules.find(
      (item) => item.displayName === 'ISDIN CEUTICS SKIN DROPS'
    );
    const secondRule = preview.materialRules.find(
      (item) => item.displayName === 'CANJERAS NEGRAS ISDIN'
    );

    expect(firstRule).toMatchObject({
      blockName: 'Bloque HEB',
      materialType: 'CANJE_PROMOCIONAL',
      selected: true,
      pdvCount: 2,
      assignedQuantityTotal: 3,
      mecanicaCanje: 'Compra 2 y recibe 1 obsequio',
    });
    expect(secondRule).toMatchObject({
      blockName: 'Bloque HEB',
      materialType: 'TESTER',
      selected: true,
      pdvCount: 1,
      assignedQuantityTotal: 3,
      instruccionesMercadeo: 'Exhibir en anaquel principal',
    });
  });

  it('consolida dos filas del mismo PDV aunque cambie el usuario legado del receptor', () => {
    const buffer = buildWorkbookBuffer([
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '4'],
      ['ID BTL', 'CADENA', 'ID', 'SUCURSAL', 'NOMBRE DC', 'USUARIO', 'BLOQUEADOR'],
      ['BTL-HEB-1', 'HEB', '2987', 'LAS FUENTES', 'ALAMO VANESSA', 'BTL-DC-0584', '2'],
      ['BTL-HEB-1', 'HEB', '2987', 'LAS FUENTES', 'GARCIA MARIA', 'BTL-DC-0912', '2'],
    ]);

    const preview = parseMaterialDistributionWorkbook(buffer);

    expect(preview.pdvPackages).toHaveLength(2);
    expect(preview.pdvPackages[0].materials.reduce((total, item) => total + item.quantity, 0)).toBe(
      2
    );
    expect(preview.pdvPackages[1].materials.reduce((total, item) => total + item.quantity, 0)).toBe(
      2
    );
    expect(preview.warnings.some((warning) => warning.code === 'duplicate_distribution_pdv')).toBe(
      true
    );
  });

  it('alerta cuando el Excel trae dos dispersiones por el mismo PDV', () => {
    const buffer = buildWorkbookBuffer([
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '5'],
      ['ID BTL', 'CADENA', 'ID', 'SUCURSAL', 'NOMBRE DC', 'USUARIO', 'BLOQUEADOR'],
      ['BTL-HEB-1', 'HEB', '2987', 'LAS FUENTES', 'ALAMO VANESSA', 'BTL-DC-0584', '2'],
      ['BTL-HEB-1', 'HEB', '2987', 'LAS FUENTES', 'ALAMO VANESSA', 'BTL-DC-0584', '3'],
    ]);

    const preview = parseMaterialDistributionWorkbook(buffer);

    expect(preview.pdvPackages).toHaveLength(2);
    expect(preview.pdvPackages[0].materials.reduce((total, item) => total + item.quantity, 0)).toBe(
      2
    );
    expect(preview.pdvPackages[1].materials.reduce((total, item) => total + item.quantity, 0)).toBe(
      3
    );
    expect(preview.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'duplicate_distribution_pdv',
          severity: 'warning',
          rowNumber: 5,
        }),
      ])
    );
  });

  it('no separa dispersiones por ID Nómina legado cuando el archivo no trae columna USUARIO', () => {
    const buffer = buildWorkbookBuffer([
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '4'],
      ['ID BTL', 'CADENA', 'ID', 'SUCURSAL', 'NOMBRE DC', 'ID NÓMINA', 'BLOQUEADOR'],
      ['BTL-HEB-1', 'HEB', '2987', 'LAS FUENTES', 'ALAMO VANESSA', '584', '2'],
      ['BTL-HEB-1', 'HEB', '2987', 'LAS FUENTES', 'GARCIA MARIA', '912', '2'],
    ]);

    const preview = parseMaterialDistributionWorkbook(buffer);

    expect(preview.pdvPackages).toHaveLength(2);
    expect(preview.pdvPackages[0].idNominaDc).toBe('584');
    expect(preview.pdvPackages[1].idNominaDc).toBe('912');
    expect(preview.warnings.some((warning) => warning.code === 'duplicate_distribution_pdv')).toBe(
      true
    );
  });

  it('identifica correctamente los nuevos prefijos POP y MUESTRA_VIP aplicando sus reglas de negocio', () => {
    const buffer = buildWorkbookBuffer([
      [
        '',
        '',
        '',
        '',
        '',
        'POP || Poster publicitario de anaquel',
        'MUESTRA_VIP || Muestra exclusiva Fusion Water 15ml',
      ],
      ['', '', '', '', '', '10', '20'],
      [
        'ID BTL',
        'CADENA',
        'ID',
        'SUCURSAL',
        'TERRITORIO',
        'POSTER PUBLICITARIO POP',
        'MUESTRA FUSION WATER VIP',
      ],
      ['BTL-HEB-1', 'HEB', '2987', 'LAS FUENTES', '', '5', '10'],
    ]);

    const preview = parseMaterialDistributionWorkbook(buffer);

    const popRule = preview.materialRules.find(
      (item) => item.displayName === 'POSTER PUBLICITARIO POP'
    );
    const vipRule = preview.materialRules.find(
      (item) => item.displayName === 'MUESTRA FUSION WATER VIP'
    );

    expect(popRule).toMatchObject({
      materialType: 'POP',
      flags: {
        excluirDeRegistrarEntrega: true,
        requiereTicketMes: false,
        requiereEvidenciaEntregaMes: false,
        requiereEvidenciaMercadeo: true,
        esRegaloDc: false,
      },
    });

    expect(vipRule).toMatchObject({
      materialType: 'MUESTRA_VIP',
      flags: {
        excluirDeRegistrarEntrega: false,
        requiereTicketMes: false,
        requiereEvidenciaEntregaMes: true,
        requiereEvidenciaMercadeo: false,
        esRegaloDc: false,
      },
    });
  });
});
