-- La consulta general entrega sólo lo necesario para pintar la matriz.
-- El contexto completo de una celda permanece en obtener_planeacion_mensual_dia.

create or replace function public.obtener_planeacion_mensual_resumen(
  p_cuenta_cliente_id uuid,
  p_mes date,
  p_busqueda text default null,
  p_cadena_ids uuid[] default null,
  p_supervisor_ids uuid[] default null,
  p_estados text[] default null,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_search text := lower(trim(coalesce(p_busqueda, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 1000), 1000));
  v_version bigint := 0;
  v_generated_at timestamptz;
  v_total integer := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  if p_cuenta_cliente_id is null then
    raise exception 'PLANEACION_CUENTA_REQUERIDA';
  end if;

  if p_mes is null or p_mes <> v_mes then
    raise exception 'PLANEACION_MES_INVALIDO';
  end if;

  with filtered as (
    select snapshot.payload, snapshot.version_snapshot, snapshot.generated_at
    from public.planeacion_mensual_snapshot_fila snapshot
    where snapshot.cuenta_cliente_id = p_cuenta_cliente_id
      and snapshot.mes = v_mes
      and snapshot.es_vigente
      and (
        v_search = ''
        or lower(concat_ws(' ',
          snapshot.payload ->> 'cadenaNombre',
          snapshot.payload ->> 'pdvClave',
          snapshot.payload ->> 'pdvNombre',
          snapshot.payload ->> 'empleadoNombre',
          snapshot.payload ->> 'supervisorNombre',
          snapshot.payload ->> 'ciudadNombre',
          snapshot.payload ->> 'zona'
        )) like '%' || v_search || '%'
      )
      and (
        p_cadena_ids is null
        or cardinality(p_cadena_ids) = 0
        or (snapshot.payload ->> 'cadenaId')::uuid = any(p_cadena_ids)
      )
      and (
        p_supervisor_ids is null
        or cardinality(p_supervisor_ids) = 0
        or (snapshot.payload ->> 'supervisorId')::uuid = any(p_supervisor_ids)
      )
      and (
        p_estados is null
        or cardinality(p_estados) = 0
        or snapshot.payload ->> 'segmentoTipo' = any(p_estados)
        or snapshot.payload ->> 'pdvEstatus' = any(p_estados)
      )
  ),
  counted as (
    select count(*)::integer as total,
           coalesce(max(version_snapshot), 0) as version,
           max(generated_at) as generated_at
    from filtered
  ),
  limited as (
    select
      (filtered.payload - 'dias') || jsonb_build_object(
        'dias',
        coalesce(compacted.dias, '[]'::jsonb)
      ) as payload
    from filtered
    left join lateral (
      select jsonb_agg(
        jsonb_build_array(
          day.payload ->> 'fecha',
          day.payload ->> 'codigo',
          day.payload ->> 'turnoCodigo',
          day.payload ->> 'turnoColor',
          coalesce((day.payload ->> 'cuotaDia')::numeric, 0),
          coalesce((day.payload ->> 'cuotaAsignada')::numeric, 0)
        )
        order by day.ordinality
      ) as dias
      from jsonb_array_elements(filtered.payload -> 'dias')
        with ordinality as day(payload, ordinality)
    ) compacted on true
    order by
      filtered.payload ->> 'cadenaNombre',
      filtered.payload ->> 'pdvNombre',
      case when filtered.payload ->> 'segmentoTipo' = 'VACANTE' then 1 else 0 end,
      filtered.payload ->> 'empleadoNombre'
    limit v_limit
  )
  select counted.total, counted.version, counted.generated_at,
         coalesce((select jsonb_agg(payload) from limited), '[]'::jsonb)
  into v_total, v_version, v_generated_at, v_rows
  from counted;

  return jsonb_build_object(
    'ok', true,
    'mes', v_mes,
    'version', v_version,
    'generatedAt', v_generated_at,
    'total', v_total,
    'truncated', v_total > v_limit,
    'rows', v_rows
  );
end;
$$;

revoke all on function public.obtener_planeacion_mensual_resumen(uuid, date, text, uuid[], uuid[], text[], integer)
from public, anon, authenticated;

grant execute on function public.obtener_planeacion_mensual_resumen(uuid, date, text, uuid[], uuid[], text[], integer)
to service_role;

comment on function public.obtener_planeacion_mensual_resumen(uuid, date, text, uuid[], uuid[], text[], integer) is
  'Devuelve en una sola consulta el snapshot mensual filtrado con celdas diarias compactas para la matriz.';
