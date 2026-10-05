-- El snapshot mensual se consulta antes de que el publicador diario aplique
-- físicamente el catálogo. Conservamos el generador compacto existente y lo
-- envolvemos para resolver el estado programado del PDV en el mes solicitado.
do $$
begin
  if to_regprocedure('public.refrescar_planeacion_mensual_snapshot_base(uuid,date,uuid[])') is null
     and to_regprocedure('public.refrescar_planeacion_mensual_snapshot(uuid,date,uuid[])') is not null then
    alter function public.refrescar_planeacion_mensual_snapshot(uuid, date, uuid[])
      rename to refrescar_planeacion_mensual_snapshot_base;
  end if;
end;
$$;

create function public.refrescar_planeacion_mensual_snapshot(
  p_cuenta_cliente_id uuid,
  p_mes date,
  p_pdv_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_result jsonb;
begin
  v_result := public.refrescar_planeacion_mensual_snapshot_base(
    p_cuenta_cliente_id,
    p_mes,
    p_pdv_ids
  );

  -- Un PDV excluido del rol queda fuera de la planeación desde su fecha
  -- efectiva, sin adelantar el cambio sobre public.pdv antes de esa fecha.
  with effective_state as (
    select distinct
      snapshot.pdv_id,
      case
        when detail.estatus = 'INACTIVO' then 'INACTIVO'
        when coalesce(state.estado, pdv.estatus) = 'INACTIVO' then 'INACTIVO'
        when coalesce(state.estado, pdv.estatus) = 'PAUSADO' then 'PAUSADO'
        else 'ACTIVO'
      end as estatus
    from public.planeacion_mensual_snapshot_fila snapshot
    join public.pdv pdv on pdv.id = snapshot.pdv_id
    left join lateral (
      select state.estado
      from public.pdv_estado_vigencia state
      where state.cuenta_cliente_id = p_cuenta_cliente_id
        and state.pdv_id = snapshot.pdv_id
        and state.vigente_desde <= v_mes
        and coalesce(state.vigente_hasta, '9999-12-31'::date) >= v_mes
      order by state.vigente_desde desc, state.created_at desc
      limit 1
    ) state on true
    left join lateral (
      select detail.estatus
      from public.pdv_detalle_vigencia detail
      where detail.cuenta_cliente_id = p_cuenta_cliente_id
        and detail.pdv_id = snapshot.pdv_id
        and detail.vigente_desde <= v_mes
        and coalesce(detail.vigente_hasta, '9999-12-31'::date) >= v_mes
      order by detail.vigente_desde desc, detail.created_at desc
      limit 1
    ) detail on true
    where snapshot.cuenta_cliente_id = p_cuenta_cliente_id
      and snapshot.mes = v_mes
      and snapshot.es_vigente
      and (
        p_pdv_ids is null
        or cardinality(p_pdv_ids) = 0
        or snapshot.pdv_id = any(p_pdv_ids)
      )
  )
  update public.planeacion_mensual_snapshot_fila snapshot
  set es_vigente = false
  from effective_state effective
  where snapshot.cuenta_cliente_id = p_cuenta_cliente_id
    and snapshot.mes = v_mes
    and snapshot.es_vigente
    and snapshot.pdv_id = effective.pdv_id
    and effective.estatus = 'INACTIVO';

  -- Los PDV reactivados en una vigencia futura deben mostrarse como activos
  -- en la previsualización mensual aunque public.pdv aún refleje agosto.
  with effective_state as (
    select distinct
      snapshot.pdv_id,
      case
        when detail.estatus = 'INACTIVO' then 'INACTIVO'
        when coalesce(state.estado, pdv.estatus) = 'INACTIVO' then 'INACTIVO'
        when coalesce(state.estado, pdv.estatus) = 'PAUSADO' then 'PAUSADO'
        else 'ACTIVO'
      end as estatus
    from public.planeacion_mensual_snapshot_fila snapshot
    join public.pdv pdv on pdv.id = snapshot.pdv_id
    left join lateral (
      select state.estado
      from public.pdv_estado_vigencia state
      where state.cuenta_cliente_id = p_cuenta_cliente_id
        and state.pdv_id = snapshot.pdv_id
        and state.vigente_desde <= v_mes
        and coalesce(state.vigente_hasta, '9999-12-31'::date) >= v_mes
      order by state.vigente_desde desc, state.created_at desc
      limit 1
    ) state on true
    left join lateral (
      select detail.estatus
      from public.pdv_detalle_vigencia detail
      where detail.cuenta_cliente_id = p_cuenta_cliente_id
        and detail.pdv_id = snapshot.pdv_id
        and detail.vigente_desde <= v_mes
        and coalesce(detail.vigente_hasta, '9999-12-31'::date) >= v_mes
      order by detail.vigente_desde desc, detail.created_at desc
      limit 1
    ) detail on true
    where snapshot.cuenta_cliente_id = p_cuenta_cliente_id
      and snapshot.mes = v_mes
      and snapshot.es_vigente
      and (
        p_pdv_ids is null
        or cardinality(p_pdv_ids) = 0
        or snapshot.pdv_id = any(p_pdv_ids)
      )
  )
  update public.planeacion_mensual_snapshot_fila snapshot
  set payload = jsonb_set(snapshot.payload, '{pdvEstatus}', to_jsonb(effective.estatus), true),
      generated_at = now()
  from effective_state effective
  where snapshot.cuenta_cliente_id = p_cuenta_cliente_id
    and snapshot.mes = v_mes
    and snapshot.es_vigente
    and snapshot.pdv_id = effective.pdv_id;

  return v_result;
end;
$$;

revoke all on function public.refrescar_planeacion_mensual_snapshot(uuid, date, uuid[])
from public, anon, authenticated;
grant execute on function public.refrescar_planeacion_mensual_snapshot(uuid, date, uuid[])
to service_role;

comment on function public.refrescar_planeacion_mensual_snapshot(uuid, date, uuid[]) is
  'Regenera el snapshot mensual y aplica la vigencia programada de estado de PDV sin adelantar el catálogo operativo.';

insert into supabase_migrations.schema_migrations(version, name)
values ('20260828160000', 'planeacion_snapshot_vigencia_programada')
on conflict (version) do nothing;
