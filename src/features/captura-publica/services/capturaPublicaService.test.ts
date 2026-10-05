import { describe, expect, it } from 'vitest';
import { sortAndFormatDermoconsejeras } from '../components/utils';
import { resolveCapturaPublicaAssignments } from './capturaPublicaAssignment';
import {
  LISTA_ORDEN_CANJES_ISDIN,
  formatProductoOption,
  ordenarYFiltrarMateriales,
} from './capturaPublicaService';

describe('resolveCapturaPublicaAssignments', () => {
  const baseCandidate = {
    id: 'base-1',
    empleado_id: 'employee-base',
    empleadoNombre: 'Ana Base',
    empleadoDisponible: true,
    pdv_id: 'pdv-1',
    fecha_inicio: '2026-08-01',
    fecha_fin: '2026-08-31',
    dias_laborales: null,
    tipo: 'FIJA',
    naturaleza: 'BASE' as const,
    prioridad: 100,
  };

  it('deduplica versiones publicadas de la misma DC y devuelve una sola asignación automática', () => {
    const result = resolveCapturaPublicaAssignments(
      [
        baseCandidate,
        {
          ...baseCandidate,
          id: 'base-2',
          fecha_inicio: '2026-08-15',
        },
      ],
      '2026-08-30'
    );

    expect(result).toEqual([
      expect.objectContaining({
        pdvId: 'pdv-1',
        estado: 'ASIGNADA',
        empleadoId: 'employee-base',
        empleadoNombre: 'Ana Base',
        asignacionId: 'base-2',
      }),
    ]);
  });

  it('prioriza la cobertura temporal publicada sobre la asignación base del mismo PDV', () => {
    const result = resolveCapturaPublicaAssignments(
      [
        baseCandidate,
        {
          ...baseCandidate,
          id: 'coverage-1',
          empleado_id: 'employee-coverage',
          empleadoNombre: 'Brenda Cobertura',
          naturaleza: 'COBERTURA_TEMPORAL' as const,
          prioridad: 200,
        },
      ],
      '2026-08-30'
    );

    expect(result).toEqual([
      expect.objectContaining({
        pdvId: 'pdv-1',
        estado: 'ASIGNADA',
        empleadoId: 'employee-coverage',
        empleadoNombre: 'Brenda Cobertura',
        asignacionId: 'coverage-1',
      }),
    ]);
  });

  it('permite seleccionar entre dos DC activas con la misma prioridad en el PDV', () => {
    const result = resolveCapturaPublicaAssignments(
      [
        baseCandidate,
        {
          ...baseCandidate,
          id: 'base-other',
          empleado_id: 'employee-other',
          empleadoNombre: 'Brenda Base',
        },
      ],
      '2026-08-30'
    );

    expect(result).toEqual([
      expect.objectContaining({
        pdvId: 'pdv-1',
        estado: 'SELECCIONABLE',
        empleadoId: null,
        empleadoNombre: null,
        candidatos: [
          { empleadoId: 'employee-base', empleadoNombre: 'Ana Base' },
          { empleadoId: 'employee-other', empleadoNombre: 'Brenda Base' },
        ],
      }),
    ]);
  });

  it('mantiene la selección limitada a las DC líderes disponibles', () => {
    const result = resolveCapturaPublicaAssignments(
      [
        baseCandidate,
        {
          ...baseCandidate,
          id: 'coverage-1',
          empleado_id: 'employee-coverage',
          empleadoNombre: 'Brenda Cobertura',
          naturaleza: 'COBERTURA_TEMPORAL' as const,
          prioridad: 200,
        },
        {
          ...baseCandidate,
          id: 'other-1',
          empleado_id: 'employee-other',
          empleadoNombre: 'Carla Otra',
          empleadoDisponible: false,
        },
      ],
      '2026-08-30'
    );

    expect(result[0]).toEqual(
      expect.objectContaining({
        estado: 'ASIGNADA',
        empleadoId: 'employee-coverage',
        candidatos: [{ empleadoId: 'employee-coverage', empleadoNombre: 'Brenda Cobertura' }],
      })
    );
  });

  it('omite una asignación estructural cuando la fecha no corresponde a sus días laborales', () => {
    const result = resolveCapturaPublicaAssignments(
      [
        {
          ...baseCandidate,
          dias_laborales: 'LUN-SAB',
        },
      ],
      '2026-08-30'
    );

    expect(result).toEqual([]);
  });

  it('resuelve el PDV correcto cuando una DC rota entre dos tiendas en días distintos', () => {
    const resultForMonday = resolveCapturaPublicaAssignments(
      [
        {
          ...baseCandidate,
          id: 'metepec-lun-mie',
          pdv_id: 'pdv-metepec',
          fecha_fin: '2026-09-30',
          dias_laborales: 'LUN-MAR-MIE',
        },
        {
          ...baseCandidate,
          id: 'purisima-jue-sab',
          pdv_id: 'pdv-purisima',
          fecha_fin: '2026-09-30',
          dias_laborales: 'JUE-VIE-SAB',
        },
      ],
      '2026-08-31'
    );
    const resultForThursday = resolveCapturaPublicaAssignments(
      [
        {
          ...baseCandidate,
          id: 'metepec-lun-mie',
          pdv_id: 'pdv-metepec',
          fecha_fin: '2026-09-30',
          dias_laborales: 'LUN-MAR-MIE',
        },
        {
          ...baseCandidate,
          id: 'purisima-jue-sab',
          pdv_id: 'pdv-purisima',
          fecha_fin: '2026-09-30',
          dias_laborales: 'JUE-VIE-SAB',
        },
      ],
      '2026-09-03'
    );

    expect(resultForMonday).toEqual([
      expect.objectContaining({
        pdvId: 'pdv-metepec',
        estado: 'ASIGNADA',
        empleadoId: 'employee-base',
      }),
    ]);
    expect(resultForThursday).toEqual([
      expect.objectContaining({
        pdvId: 'pdv-purisima',
        estado: 'ASIGNADA',
        empleadoId: 'employee-base',
      }),
    ]);
  });
});

describe('sortAndFormatDermoconsejeras', () => {
  it('should pin scheduled employees at the top with a pin prefix and programada tag', () => {
    const empleados = [
      { id: '1', nombre: 'Ana Gomez' },
      { id: '2', nombre: 'Brenda Ruiz' },
      { id: '3', nombre: 'Claudia Lopez' },
    ];
    const assignedEmpleadoIds = new Set(['2']);

    const result = sortAndFormatDermoconsejeras(empleados, assignedEmpleadoIds);

    expect(result).toEqual([
      { value: '', label: 'Elige la dermoconsejera' },
      { value: '2', label: '📌 Brenda Ruiz (Programada hoy)' },
      { value: '1', label: 'Ana Gomez' },
      { value: '3', label: 'Claudia Lopez' },
    ]);
  });

  it('should return default list when no employees are assigned', () => {
    const empleados = [
      { id: '1', nombre: 'Ana Gomez' },
      { id: '2', nombre: 'Brenda Ruiz' },
    ];
    const assignedEmpleadoIds = new Set<string>();

    const result = sortAndFormatDermoconsejeras(empleados, assignedEmpleadoIds);

    expect(result).toEqual([
      { value: '', label: 'Elige la dermoconsejera' },
      { value: '1', label: 'Ana Gomez' },
      { value: '2', label: 'Brenda Ruiz' },
    ]);
  });
});

describe('ordenarYFiltrarMateriales', () => {
  it('incluye el nuevo Transparent Spray sin duplicar variantes equivalentes existentes', () => {
    expect(LISTA_ORDEN_CANJES_ISDIN).toContain('FP TRANSPARENT SPRAY WS SPF50 250ML');
    expect(LISTA_ORDEN_CANJES_ISDIN).toContain('FP PROTECTOR LABIAL HV ISDIN 46');
    expect(LISTA_ORDEN_CANJES_ISDIN).toContain(
      'PROM FP FUSION WATER MAGIC REPAIR SPF50 10 ML'
    );
    expect(LISTA_ORDEN_CANJES_ISDIN).not.toContain('FP PROTECTOR LABIAL HV ISDIN');
    expect(LISTA_ORDEN_CANJES_ISDIN).not.toContain(
      'MCON FP FUSION WATER MAGIC REPAIR SPF50 10 ML'
    );
    expect(LISTA_ORDEN_CANJES_ISDIN).not.toContain('PORTATOTTLE STICK 2025');
  });

  it('should allow and sort materials alphabetically', () => {
    const inputMock = [
      { id: 'tote', nombre: 'TOTE BAG ISDIN 2024', activo: true, tipo: 'PROMOCIONAL' },
      {
        id: 'labial',
        nombre: 'FP PROTECTOR LABIAL HV ISDIN 46',
        activo: true,
        tipo: 'PROMOCIONAL',
      },
      { id: 'bolsa', nombre: 'BOLSA FOTO PLAYA ISDIN  2021', activo: true, tipo: 'PROMOCIONAL' },
      { id: 'capibara', nombre: 'CAPIBARA', activo: true, tipo: 'PROMOCIONAL' },
    ];

    const result = ordenarYFiltrarMateriales(inputMock);

    expect(result).toEqual(
      [
        { id: 'bolsa', nombre: 'BOLSA FOTO PLAYA ISDIN  2021' },
        { id: 'capibara', fontName: undefined, nombre: 'CAPIBARA' }, // El orden alfabético es Bolsa -> Capibara -> Labial -> Tote
        { id: 'labial', nombre: 'FP PROTECTOR LABIAL HV ISDIN 46' },
        { id: 'tote', nombre: 'TOTE BAG ISDIN 2024' },
      ].map((item) => ({ id: item.id, nombre: item.nombre }))
    );
  });

  it('should allow 10ml DOSIS if explicitly present in the sorted list', () => {
    const inputMock = [
      {
        id: 'dosis-regular',
        nombre: 'DI FP MINERAL BABY PED SPF50 2ML',
        activo: true,
        tipo: 'DOSIS',
      },
      {
        id: 'magic-10ml',
        nombre: 'MCON FP FW MAGIC SIN COLOR SPF50 10 ML',
        activo: true,
        tipo: 'DOSIS',
      },
    ];

    const result = ordenarYFiltrarMateriales(inputMock);

    // dosis-regular should be filtered out (2ml DOSIS not in list)
    // magic-10ml should be preserved because it is explicitly allowed in LISTA_ORDEN_CANJES_ISDIN
    expect(result).toEqual([
      { id: 'magic-10ml', nombre: 'MCON FP FW MAGIC SIN COLOR SPF50 10 ML' },
    ]);
  });

  it('should filter out D.I (Dosis Individual) materials starting with D.I', () => {
    const inputMock = [
      { id: 'coverage-1', nombre: 'D.I ISDIN COVERAGE 1 PERL SPF50', activo: true, tipo: 'DOSIS' },
      { id: 'coverage-2', nombre: 'D.I ISDIN COVERAGE 2 BEIGE SPF50', activo: true, tipo: 'DOSIS' },
      { id: 'coverage-3', nombre: 'D.I ISDIN COVERAGE 3 SAND SPF50', activo: true, tipo: 'DOSIS' },
      { id: 'tote', nombre: 'TOTE BAG ISDIN 2024', activo: true, tipo: 'PROMOCIONAL' },
    ];

    const result = ordenarYFiltrarMateriales(inputMock);

    expect(result).toEqual([{ id: 'tote', nombre: 'TOTE BAG ISDIN 2024' }]);
  });
});

describe('formatProductoOption', () => {
  it('formatea correctamente los 5 nuevos productos de ISDIN con SKU y su categoría respectiva', () => {
    const nuevosProductos = [
      {
        id: 'prod-1',
        sku: '8429420303546',
        nombre: 'ACNIBEN CC CREAM LIGHT 40ML',
        nombre_corto: 'ACNI CC CRM LIGHT 40ML',
        categoria: 'TERAPÉUTICA PARA CONDICIONES CLÍNICAS ESPECIALES',
        activo: true,
      },
      {
        id: 'prod-2',
        sku: '8429420303553',
        nombre: 'ACNIBEN CC CREAM MEDIUM 40ML',
        nombre_corto: 'ACNI CC CRM MEDIUM 40ML',
        categoria: 'TERAPÉUTICA PARA CONDICIONES CLÍNICAS ESPECIALES',
        activo: true,
      },
      {
        id: 'prod-3',
        sku: '8429420303935',
        nombre: 'ACNIBEN CC CREAM BRONZE 40ML',
        nombre_corto: 'ACNI CC CRM BRONZE 40ML',
        categoria: 'TERAPÉUTICA PARA CONDICIONES CLÍNICAS ESPECIALES',
        activo: true,
      },
      {
        id: 'prod-4',
        sku: '8470001527974',
        nombre: 'WOMAN ISDIN CREMA ANTIESTRÍAS 250ML',
        nombre_corto: 'WOMAN CRM ANTIESTRIAS 250ML',
        categoria: 'SALUD Y BIENESTAR DE LA MUJER (WOMAN ISDIN)',
        activo: true,
      },
      {
        id: 'prod-5',
        sku: '8429420309883',
        nombre: 'ISDINCEUTICS FLAVO-C INTENSE 50ML',
        nombre_corto: 'CEUTICS FLAVO-C INTENSE 50ML',
        categoria: 'COSMECÉUTICA ANTIEDAD Y RENOVACIÓN DÉRMICA',
        activo: true,
      },
    ];

    const opciones = nuevosProductos.map(formatProductoOption);

    expect(opciones).toEqual([
      {
        id: 'prod-1',
        nombre: '[8429420303546] ACNIBEN CC CREAM LIGHT 40ML',
        categoria: 'TERAPÉUTICA PARA CONDICIONES CLÍNICAS ESPECIALES',
      },
      {
        id: 'prod-2',
        nombre: '[8429420303553] ACNIBEN CC CREAM MEDIUM 40ML',
        categoria: 'TERAPÉUTICA PARA CONDICIONES CLÍNICAS ESPECIALES',
      },
      {
        id: 'prod-3',
        nombre: '[8429420303935] ACNIBEN CC CREAM BRONZE 40ML',
        categoria: 'TERAPÉUTICA PARA CONDICIONES CLÍNICAS ESPECIALES',
      },
      {
        id: 'prod-4',
        nombre: '[8470001527974] WOMAN ISDIN CREMA ANTIESTRÍAS 250ML',
        categoria: 'SALUD Y BIENESTAR DE LA MUJER (WOMAN ISDIN)',
      },
      {
        id: 'prod-5',
        nombre: '[8429420309883] ISDINCEUTICS FLAVO-C INTENSE 50ML',
        categoria: 'COSMECÉUTICA ANTIEDAD Y RENOVACIÓN DÉRMICA',
      },
    ]);
  });

  it('asigna categoría "OTRO" si la categoría es vacía y omite corchetes si no hay SKU', () => {
    const sinSkuNiCategoria = {
      id: 'prod-fallback',
      sku: null,
      nombre: 'MUESTRA SIN SKU',
      nombre_corto: 'MUESTRA',
      categoria: '',
      activo: true,
    };

    expect(formatProductoOption(sinSkuNiCategoria)).toEqual({
      id: 'prod-fallback',
      nombre: 'MUESTRA SIN SKU',
      categoria: 'OTRO',
    });
  });
});
