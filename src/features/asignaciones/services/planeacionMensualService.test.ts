import { describe, expect, it, vi } from 'vitest';
import {
  aplicarPlaneacionMensual,
  aplicarPlaneacionSupervisorPdvs,
  parsePlaneacionMensualPreview,
  previsualizarPlaneacionSupervisorPdvs,
  previsualizarPlaneacionMensual,
  type PlaneacionRpcClient,
} from './planeacionMensualService';

const operation = {
  tipoOperacion: 'LIBERAR_DC' as const,
  empleadoId: '11111111-1111-4111-8111-111111111111',
  pdvOrigenId: '22222222-2222-4222-8222-222222222222',
  fechaInicio: '2026-08-24',
  motivo: 'Liberación programada',
};

describe('planeacionMensualService', () => {
  it('normaliza el contrato de vista previa sin confiar en datos desconocidos', () => {
    expect(
      parsePlaneacionMensualPreview({
        ok: false,
        mes: '2026-08-01',
        errors: [{ code: 'DC_DOBLE_ASIGNACION', pdvIds: ['a', 4] }],
        warnings: null,
        conflicts: [],
        versionBase: 4,
        impact: { operations: 1, employees: 1, pdvs: 2 },
      })
    ).toMatchObject({
      ok: false,
      mes: '2026-08-01',
      errors: [{ code: 'DC_DOBLE_ASIGNACION', pdvIds: ['a'] }],
      warnings: [],
      conflicts: [],
      versionBase: 4,
      impact: { operations: 1, employees: 1, pdvs: 2 },
    });
  });

  it('envía una sola RPC para la vista previa', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        mes: '2026-08-01',
        errors: [],
        warnings: [],
        conflicts: [],
        versionBase: 0,
      },
      error: null,
    });

    const result = await previsualizarPlaneacionMensual({ rpc } as PlaneacionRpcClient, {
      cuentaClienteId: '33333333-3333-4333-8333-333333333333',
      mes: '2026-08-01',
      operaciones: [operation],
    });

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'previsualizar_planeacion_mensual_versionada',
      expect.objectContaining({ p_operaciones: [operation], p_alcance: 'GENERAL' })
    );
  });

  it('preserva idempotencia y versión devueltas por PostgreSQL', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        idempotent: true,
        loteId: '44444444-4444-4444-8444-444444444444',
        version: 7,
      },
      error: null,
    });

    const result = await aplicarPlaneacionMensual({ rpc } as PlaneacionRpcClient, {
      cuentaClienteId: '33333333-3333-4333-8333-333333333333',
      mes: '2026-08-01',
      idempotencyKey: 'matrix-2026-08-change-1',
      versionBase: 6,
      usuarioId: '55555555-5555-4555-8555-555555555555',
      operaciones: [operation],
    });

    expect(result).toMatchObject({ ok: true, idempotent: true, version: 7 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('propaga errores de la RPC sin convertirlos en confirmación', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'PLANEACION_VERSION_CONFLICT:1:2' },
    });

    await expect(
      previsualizarPlaneacionMensual({ rpc } as PlaneacionRpcClient, {
        cuentaClienteId: '33333333-3333-4333-8333-333333333333',
        mes: '2026-08-01',
        operaciones: [operation],
      })
    ).rejects.toThrow('PLANEACION_VERSION_CONFLICT:1:2');
  });

  it('enruta la reasignación selectiva por las RPCs acotadas a PDV', async () => {
    const targetedOperation = {
      ...operation,
      tipoOperacion: 'REASIGNAR_SUPERVISOR' as const,
      empleadoId: null,
      payload: {
        supervisorOrigenId: '66666666-6666-4666-8666-666666666666',
        supervisorDestinoId: '77777777-7777-4777-8777-777777777777',
      },
    };
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          ok: true,
          mes: '2026-08-01',
          errors: [],
          warnings: [],
          conflicts: [],
          versionBase: 0,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          idempotent: false,
          loteId: '88888888-8888-4888-8888-888888888888',
          version: 8,
        },
        error: null,
      });
    const client = { rpc } as PlaneacionRpcClient;
    const input = {
      cuentaClienteId: '33333333-3333-4333-8333-333333333333',
      mes: '2026-08-01',
      operaciones: [targetedOperation],
    };

    await previsualizarPlaneacionSupervisorPdvs(client, input);
    await aplicarPlaneacionSupervisorPdvs(client, {
      ...input,
      idempotencyKey: 'targeted-supervisor-1',
      versionBase: 7,
      usuarioId: '55555555-5555-4555-8555-555555555555',
    });

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'previsualizar_planeacion_mensual_versionada',
      'aplicar_planeacion_supervisor_pdvs',
    ]);
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'previsualizar_planeacion_mensual_versionada',
      expect.objectContaining({ p_alcance: 'SUPERVISOR_PDVS' })
    );
  });
});
