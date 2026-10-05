interface QuotaSummaryRpcError {
  message: string;
}

export interface PlaneacionCuotaResumenRpcClient {
  rpc(
    name: 'refrescar_cuota_mensual_resumen',
    params: {
      p_cuenta_cliente_id: string;
      p_mes: string;
      p_pdv_ids: string[] | null;
    }
  ): PromiseLike<{ data: unknown; error: QuotaSummaryRpcError | null }>;
}

export async function refrescarCuotaMensualResumen(
  client: PlaneacionCuotaResumenRpcClient,
  input: { cuentaClienteId: string; mes: string; pdvIds?: string[] }
) {
  const pdvIds = [...new Set(input.pdvIds ?? [])].filter(Boolean);
  const { data, error } = await client.rpc('refrescar_cuota_mensual_resumen', {
    p_cuenta_cliente_id: input.cuentaClienteId,
    p_mes: input.mes,
    p_pdv_ids: pdvIds.length > 0 ? pdvIds : null,
  });

  if (error) throw new Error(error.message);
  return data;
}
