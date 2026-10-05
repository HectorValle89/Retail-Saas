import { describe, expect, it } from 'vitest';
import {
  CDMX_SPECIAL_PALETTE,
  CDMX_SUPERVISOR_IDS,
  GENERAL_SUPERVISOR_PALETTE,
  UNASSIGNED_SUPERVISOR_COLOR,
  buildSupervisorColorMap,
  getCdmxSupervisorMeta,
  getSupervisorColor,
  isCdmxSupervisor,
} from './supervisorColors';

describe('supervisorColors', () => {
  const mockCdmxSupervisors = [
    { id: CDMX_SUPERVISOR_IDS.ZENAIDA, nombreCompleto: 'MARIA ZENAIDA MONROY GONZALEZ' },
    { id: CDMX_SUPERVISOR_IDS.XOCHITL, nombreCompleto: 'XOCHITL CARRILLO XOCHIHUA' },
    { id: CDMX_SUPERVISOR_IDS.JACQUELINE, nombreCompleto: 'JACQUELINE LOPEZ RUIZ' },
    { id: CDMX_SUPERVISOR_IDS.MONTAGNER, nombreCompleto: 'MIGUEL ANGEL MONTAGNER OLIVARES' },
    { id: CDMX_SUPERVISOR_IDS.ATZIN, nombreCompleto: 'ATZIN SUSANA AGUIRRE CAMACHO' },
    { id: CDMX_SUPERVISOR_IDS.JONATAN, nombreCompleto: 'JONATAN RAYMUNDO CHAVEZ RAMOS' },
    { id: CDMX_SUPERVISOR_IDS.MIRIAM, nombreCompleto: 'MIRIAM ROCIO ESTRADA NAVA' },
    { id: CDMX_SUPERVISOR_IDS.LILIANA, nombreCompleto: 'LILIANA REYES AYBAR' },
  ];

  it('devuelve UNASSIGNED_SUPERVISOR_COLOR para nulos, vacíos o SIN_SUPERVISOR', () => {
    expect(getSupervisorColor(null)).toBe(UNASSIGNED_SUPERVISOR_COLOR);
    expect(getSupervisorColor(undefined)).toBe(UNASSIGNED_SUPERVISOR_COLOR);
    expect(getSupervisorColor('')).toBe(UNASSIGNED_SUPERVISOR_COLOR);
    expect(getSupervisorColor('SIN_SUPERVISOR')).toBe(UNASSIGNED_SUPERVISOR_COLOR);
    expect(getSupervisorColor('PENDIENTE')).toBe(UNASSIGNED_SUPERVISOR_COLOR);
  });

  it('asigna colores 100% únicos y de alto contraste a los 8 supervisores de CDMX', () => {
    const colors = mockCdmxSupervisors.map((s) =>
      getSupervisorColor(s.id, mockCdmxSupervisors)
    );

    // Todos deben ser colores distintos
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBe(8);

    // Verificar colores específicos
    expect(getSupervisorColor(CDMX_SUPERVISOR_IDS.ZENAIDA, mockCdmxSupervisors)).toBe(
      CDMX_SPECIAL_PALETTE.zenaida.color
    );
    expect(getSupervisorColor(CDMX_SUPERVISOR_IDS.XOCHITL, mockCdmxSupervisors)).toBe(
      CDMX_SPECIAL_PALETTE.xochitl.color
    );
    expect(getSupervisorColor(CDMX_SUPERVISOR_IDS.JACQUELINE, mockCdmxSupervisors)).toBe(
      CDMX_SPECIAL_PALETTE.jacqueline.color
    );
    expect(getSupervisorColor(CDMX_SUPERVISOR_IDS.MONTAGNER, mockCdmxSupervisors)).toBe(
      CDMX_SPECIAL_PALETTE.montagner.color
    );
    expect(getSupervisorColor(CDMX_SUPERVISOR_IDS.ATZIN, mockCdmxSupervisors)).toBe(
      CDMX_SPECIAL_PALETTE.atzin.color
    );
    expect(getSupervisorColor(CDMX_SUPERVISOR_IDS.JONATAN, mockCdmxSupervisors)).toBe(
      CDMX_SPECIAL_PALETTE.jonatan.color
    );
    expect(getSupervisorColor(CDMX_SUPERVISOR_IDS.MIRIAM, mockCdmxSupervisors)).toBe(
      CDMX_SPECIAL_PALETTE.miriam.color
    );
    expect(getSupervisorColor(CDMX_SUPERVISOR_IDS.LILIANA, mockCdmxSupervisors)).toBe(
      CDMX_SPECIAL_PALETTE.liliana.color
    );
  });

  it('identifica supervisores de CDMX por nombre aunque el ID sea diferente', () => {
    const colorZenaida = getSupervisorColor('otro-id-zenaida', [
      { id: 'otro-id-zenaida', nombreCompleto: 'Zenaida Monroy' },
    ]);
    expect(colorZenaida).toBe(CDMX_SPECIAL_PALETTE.zenaida.color);

    const colorXochitl = getSupervisorColor('otro-id-xochitl', [
      { id: 'otro-id-xochitl', nombreCompleto: 'Xochitl Carrillo' },
    ]);
    expect(colorXochitl).toBe(CDMX_SPECIAL_PALETTE.xochitl.color);
  });

  it('asigna colores de la paleta general para supervisores foráneos', () => {
    const supForaneo = { id: 'sup-mty', nombreCompleto: 'Ana Cristina Animas' };
    const color = getSupervisorColor(supForaneo.id, [supForaneo, ...mockCdmxSupervisors]);

    expect(GENERAL_SUPERVISOR_PALETTE).toContain(color);
  });

  it('buildSupervisorColorMap genera un mapa completo con colores asignados', () => {
    const map = buildSupervisorColorMap(mockCdmxSupervisors);
    expect(map.size).toBe(8);
    expect(map.get(CDMX_SUPERVISOR_IDS.ZENAIDA)).toBe(CDMX_SPECIAL_PALETTE.zenaida.color);
    expect(map.get(CDMX_SUPERVISOR_IDS.XOCHITL)).toBe(CDMX_SPECIAL_PALETTE.xochitl.color);
  });

  it('isCdmxSupervisor y getCdmxSupervisorMeta identifican correctamente supervisores de CDMX', () => {
    expect(isCdmxSupervisor(CDMX_SUPERVISOR_IDS.ZENAIDA)).toBe(true);
    expect(isCdmxSupervisor('id-desconocido', 'Liliana Reyes')).toBe(true);
    expect(isCdmxSupervisor('sup-monterrey', 'Ana Cristina Animas')).toBe(false);
    expect(isCdmxSupervisor('sup-gdl', 'Silvia Berenice Lopez Estrada')).toBe(false);
    expect(isCdmxSupervisor(null)).toBe(false);

    const meta = getCdmxSupervisorMeta(CDMX_SUPERVISOR_IDS.JACQUELINE);
    expect(meta).not.toBeNull();
    expect(meta?.color).toBe(CDMX_SPECIAL_PALETTE.jacqueline.color);
    expect(meta?.label).toBe('Verde Esmeralda');
  });
});
