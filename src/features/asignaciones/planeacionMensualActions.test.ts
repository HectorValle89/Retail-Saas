import { describe, expect, it } from 'vitest';
import { collectPlaneacionAffectedMonths } from './lib/planeacionMensualVigencia';

describe('continuidad temporal de la planeación mensual', () => {
  it('propaga una vigencia sin fecha final hacia los meses del horizonte operativo', () => {
    expect(
      collectPlaneacionAffectedMonths([
        {
          tipoOperacion: 'ASIGNAR_DC',
          empleadoId: 'empleado-1',
          pdvDestinoId: 'pdv-1',
          fechaInicio: '2026-09-15',
          fechaFin: null,
          motivo: 'Asignación definitiva',
        },
      ])
    ).toEqual(['2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01']);
  });

  it('acota una vigencia temporal a los meses realmente afectados', () => {
    expect(
      collectPlaneacionAffectedMonths([
        {
          tipoOperacion: 'MOVER_DC',
          empleadoId: 'empleado-1',
          pdvOrigenId: 'pdv-1',
          pdvDestinoId: 'pdv-2',
          fechaInicio: '2026-09-28',
          fechaFin: '2026-10-04',
          motivo: 'Cobertura temporal',
        },
      ])
    ).toEqual(['2026-09-01', '2026-10-01']);
  });
});
