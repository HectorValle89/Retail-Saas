begin;

create or replace function public.reconciliar_rutas_catalogo_lote(
  p_lote_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lote public.pdv_catalogo_lote%rowtype;
  v_cuota record;
  v_visitas_canceladas integer := 0;
  v_eventos_cancelados integer := 0;
  v_cuotas_cerradas integer := 0;
  v_cuotas_transferidas integer := 0;
begin
  select * into v_lote
  from public.pdv_catalogo_lote
  where id = p_lote_id;

  if not found then
    raise exception 'LOTE_CATALOGO_PDV_NO_EXISTE:%', p_lote_id;
  end if;

  update public.ruta_semanal_visita visita
  set estatus = 'CANCELADA',
      comentarios = concat_ws(
        E'\n',
        nullif(visita.comentarios, ''),
        'Cancelada por catálogo PDV efectivo a partir de ' || v_lote.fecha_efectiva::text
      ),
      metadata = coalesce(visita.metadata, '{}'::jsonb) || jsonb_build_object(
        'cancelacion_origen', 'CATALOGO_PDV_LOTE',
        'catalogo_lote_id', v_lote.id,
        'fecha_efectiva', v_lote.fecha_efectiva,
        'cancelada_at', now()
      ),
      updated_at = now()
  from public.ruta_semanal ruta,
       public.pdv_detalle_vigencia detalle
  where visita.ruta_semanal_id = ruta.id
    and detalle.lote_id = v_lote.id
    and detalle.pdv_id = visita.pdv_id
    and visita.estatus = 'PLANIFICADA'
    and ruta.semana_inicio + (visita.dia_semana::integer - 1) >= v_lote.fecha_efectiva
    and visita.supervisor_empleado_id <> detalle.supervisor_empleado_id;
  get diagnostics v_visitas_canceladas = row_count;

  update public.ruta_agenda_evento evento
  set estatus_ejecucion = 'CANCELADO',
      metadata = coalesce(evento.metadata, '{}'::jsonb) || jsonb_build_object(
        'cancelacion_origen', 'CATALOGO_PDV_LOTE',
        'catalogo_lote_id', v_lote.id,
        'fecha_efectiva', v_lote.fecha_efectiva,
        'cancelada_at', now()
      ),
      updated_at = now()
  from public.pdv_detalle_vigencia detalle
  where detalle.lote_id = v_lote.id
    and detalle.pdv_id = evento.pdv_id
    and evento.fecha_operacion >= v_lote.fecha_efectiva
    and evento.estatus_ejecucion = 'PENDIENTE'
    and evento.supervisor_empleado_id <> detalle.supervisor_empleado_id;
  get diagnostics v_eventos_cancelados = row_count;

  if v_lote.fecha_efectiva = date_trunc('month', v_lote.fecha_efectiva)::date then
    for v_cuota in
      select cuota.*, detalle.supervisor_empleado_id as supervisor_destino_id
      from public.ruta_cuota_supervisor_pdv cuota
      join public.pdv_detalle_vigencia detalle
        on detalle.lote_id = v_lote.id
       and detalle.pdv_id = cuota.pdv_id
      where cuota.cuenta_cliente_id = v_lote.cuenta_cliente_id
        and cuota.vigente_desde <= v_lote.fecha_efectiva
        and coalesce(cuota.vigente_hasta, '9999-12-31'::date) >= v_lote.fecha_efectiva
        and cuota.supervisor_empleado_id <> detalle.supervisor_empleado_id
      order by cuota.pdv_id, cuota.vigente_desde desc
    loop
      insert into public.ruta_cuota_supervisor_pdv (
        cuenta_cliente_id,
        supervisor_empleado_id,
        pdv_id,
        visitas_mensuales,
        vigente_desde,
        vigente_hasta,
        metadata
      )
      values (
        v_cuota.cuenta_cliente_id,
        v_cuota.supervisor_destino_id,
        v_cuota.pdv_id,
        v_cuota.visitas_mensuales,
        v_lote.fecha_efectiva,
        null,
        jsonb_build_object(
          'origen', 'CATALOGO_PDV_LOTE',
          'catalogo_lote_id', v_lote.id,
          'supervisor_origen_id', v_cuota.supervisor_empleado_id,
          'cuota_origen_id', v_cuota.id
        )
      )
      on conflict (cuenta_cliente_id, supervisor_empleado_id, pdv_id, vigente_desde)
      do nothing;
      if found then
        v_cuotas_transferidas := v_cuotas_transferidas + 1;
      end if;

      if v_cuota.vigente_desde < v_lote.fecha_efectiva then
        update public.ruta_cuota_supervisor_pdv
        set vigente_hasta = v_lote.fecha_efectiva - 1,
            metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
              'cerrada_por', 'CATALOGO_PDV_LOTE',
              'catalogo_lote_id', v_lote.id,
              'supervisor_destino_id', v_cuota.supervisor_destino_id
            ),
            updated_at = now()
        where id = v_cuota.id;
      else
        delete from public.ruta_cuota_supervisor_pdv where id = v_cuota.id;
      end if;
      v_cuotas_cerradas := v_cuotas_cerradas + 1;
    end loop;
  end if;

  insert into public.audit_log (
    tabla,
    registro_id,
    accion,
    payload,
    cuenta_cliente_id
  ) values (
    'pdv_catalogo_lote',
    v_lote.id::text,
    'EVENTO',
    jsonb_build_object(
      'evento', 'rutas_catalogo_pdv_reconciliadas',
      'fecha_efectiva', v_lote.fecha_efectiva,
      'visitas_canceladas', v_visitas_canceladas,
      'eventos_cancelados', v_eventos_cancelados,
      'cuotas_cerradas', v_cuotas_cerradas,
      'cuotas_transferidas', v_cuotas_transferidas
    ),
    v_lote.cuenta_cliente_id
  );

  return jsonb_build_object(
    'visitasCanceladas', v_visitas_canceladas,
    'eventosCancelados', v_eventos_cancelados,
    'cuotasCerradas', v_cuotas_cerradas,
    'cuotasTransferidas', v_cuotas_transferidas
  );
end;
$$;

revoke all on function public.reconciliar_rutas_catalogo_lote(uuid)
  from public, anon, authenticated;
grant execute on function public.reconciliar_rutas_catalogo_lote(uuid) to service_role;

comment on function public.reconciliar_rutas_catalogo_lote(uuid) is
  'Cierra visitas, eventos y cuotas futuras que ya no pertenecen al supervisor efectivo del catálogo importado.';

-- Corrige el último lote programado del catálogo 2026 en instalaciones donde ya fue cargado.
do $$
declare
  v_lote_id uuid;
begin
  select id into v_lote_id
  from public.pdv_catalogo_lote
  where nombre_archivo = 'CATÁLOGO PDV ACT 2026.xlsx'
    and fecha_efectiva = '2026-09-01'::date
    and estado = 'PROGRAMADO'
  order by created_at desc
  limit 1;

  if v_lote_id is not null then
    perform public.reconciliar_rutas_catalogo_lote(v_lote_id);
  end if;
end;
$$;

commit;
