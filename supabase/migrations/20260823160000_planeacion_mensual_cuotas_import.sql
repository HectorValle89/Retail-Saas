create index if not exists idx_cuotas_diarias_pdv_lote
on public.cuotas_diarias_pdv(lote_importacion_id, pdv_id, fecha);

create or replace function public.aplicar_cuotas_mensuales(
  p_cuenta_cliente_id uuid,
  p_mes date,
  p_nombre_archivo text,
  p_hash_archivo text,
  p_cuotas jsonb,
  p_usuario_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_mes_fin date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_lote_id uuid;
  v_existing record;
  v_scope_key text;
  v_version bigint := 1;
  v_total_pdv integer := 0;
  v_total_dias integer := 0;
  v_total_atribuciones integer := 0;
  v_total_cuota numeric(16,2) := 0;
  v_total_atribuida numeric(16,2) := 0;
  v_pdv_ids uuid[] := '{}'::uuid[];
begin
  if p_cuenta_cliente_id is null or p_usuario_id is null then
    raise exception 'CUOTAS_CONTEXTO_REQUERIDO';
  end if;
  if p_mes is null or p_mes <> v_mes then
    raise exception 'CUOTAS_MES_INVALIDO';
  end if;
  if nullif(btrim(p_nombre_archivo), '') is null or length(p_nombre_archivo) > 255 then
    raise exception 'CUOTAS_ARCHIVO_INVALIDO';
  end if;
  if p_hash_archivo !~ '^[0-9a-f]{64}$' then
    raise exception 'CUOTAS_HASH_INVALIDO';
  end if;
  if jsonb_typeof(p_cuotas) <> 'array'
     or jsonb_array_length(p_cuotas) < 1
     or jsonb_array_length(p_cuotas) > 2000 then
    raise exception 'CUOTAS_LOTE_INVALIDO';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('cuotas-mensuales:' || p_cuenta_cliente_id::text || ':' || v_mes::text, 0)
  );

  select lote.id, lote.mes, lote.estado, lote.resumen_validacion
  into v_existing
  from public.cuota_carga_lote lote
  where lote.cuenta_cliente_id = p_cuenta_cliente_id
    and lote.hash_archivo = p_hash_archivo
  limit 1;

  if found then
    if v_existing.mes <> v_mes then
      raise exception 'CUOTAS_HASH_MES_CONFLICTO';
    end if;
    if v_existing.estado = 'PUBLICADO' then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'loteId', v_existing.id,
        'mes', v_mes,
        'version', coalesce((v_existing.resumen_validacion ->> 'version')::bigint, 0),
        'pdvIds', coalesce(v_existing.resumen_validacion -> 'pdvIds', '[]'::jsonb),
        'summary', v_existing.resumen_validacion
      );
    end if;
    raise exception 'CUOTAS_LOTE_EXISTENTE_NO_PUBLICADO';
  end if;

  create temporary table cuota_input on commit drop as
  select
    source.pdv_id,
    upper(btrim(source.clave_btl)) as clave_btl,
    source.cuota_mensual,
    coalesce(source.pesos, '{}'::jsonb) as pesos
  from jsonb_to_recordset(p_cuotas) as source(
    pdv_id uuid,
    clave_btl text,
    cuota_mensual numeric,
    pesos jsonb
  );

  if (select count(*) from cuota_input) <> jsonb_array_length(p_cuotas) then
    raise exception 'CUOTAS_CONTRATO_INVALIDO';
  end if;
  if exists (
    select 1
    from cuota_input input
    where input.pdv_id is null
       or nullif(input.clave_btl, '') is null
       or input.cuota_mensual is null
       or input.cuota_mensual < 0
       or input.cuota_mensual > 999999999999.99
  ) then
    raise exception 'CUOTAS_VALORES_INVALIDOS';
  end if;
  if exists (
    select input.pdv_id
    from cuota_input input
    group by input.pdv_id
    having count(*) > 1
  ) then
    raise exception 'CUOTAS_PDV_DUPLICADO';
  end if;
  if exists (
    select 1
    from cuota_input input
    cross join lateral (
      values
        ('LUN', coalesce((input.pesos ->> 'LUN')::numeric, 1)),
        ('MAR', coalesce((input.pesos ->> 'MAR')::numeric, 1)),
        ('MIE', coalesce((input.pesos ->> 'MIE')::numeric, 1)),
        ('JUE', coalesce((input.pesos ->> 'JUE')::numeric, 1)),
        ('VIE', coalesce((input.pesos ->> 'VIE')::numeric, 1)),
        ('SAB', coalesce((input.pesos ->> 'SAB')::numeric, 1)),
        ('DOM', coalesce((input.pesos ->> 'DOM')::numeric, 1))
    ) weight(code, value)
    where weight.value < 0 or weight.value > 100
  ) then
    raise exception 'CUOTAS_PESO_INVALIDO';
  end if;
  if exists (
    select 1
    from cuota_input input
    where coalesce((input.pesos ->> 'LUN')::numeric, 1)
        + coalesce((input.pesos ->> 'MAR')::numeric, 1)
        + coalesce((input.pesos ->> 'MIE')::numeric, 1)
        + coalesce((input.pesos ->> 'JUE')::numeric, 1)
        + coalesce((input.pesos ->> 'VIE')::numeric, 1)
        + coalesce((input.pesos ->> 'SAB')::numeric, 1)
        + coalesce((input.pesos ->> 'DOM')::numeric, 1) <= 0
  ) then
    raise exception 'CUOTAS_SIN_DIAS_PONDERADOS';
  end if;
  if exists (
    select 1
    from cuota_input input
    left join public.pdv pdv
      on pdv.id = input.pdv_id
     and upper(pdv.clave_btl) = input.clave_btl
    where pdv.id is null
       or not exists (
         select 1
         from public.cuenta_cliente_pdv scope
         where scope.cuenta_cliente_id = p_cuenta_cliente_id
           and scope.pdv_id = input.pdv_id
           and scope.fecha_inicio <= v_mes_fin
           and (scope.fecha_fin is null or scope.fecha_fin >= v_mes)
       )
  ) then
    raise exception 'CUOTAS_PDV_FUERA_DE_CUENTA';
  end if;
  if exists (
    select 1
    from public.cuotas_diarias_pdv cuota
    join cuota_input input on input.pdv_id = cuota.pdv_id
    where cuota.cuenta_cliente_id = p_cuenta_cliente_id
      and cuota.fecha between v_mes and v_mes_fin
      and cuota.estado = 'CERRADA'
  ) then
    raise exception 'CUOTAS_MES_CERRADO';
  end if;

  select count(*), array_agg(input.pdv_id order by input.pdv_id), sum(input.cuota_mensual)
  into v_total_pdv, v_pdv_ids, v_total_cuota
  from cuota_input input;

  insert into public.cuota_carga_lote (
    cuenta_cliente_id,
    mes,
    nombre_archivo,
    hash_archivo,
    estado,
    total_filas,
    total_errores,
    resumen_validacion,
    creado_por_usuario_id
  ) values (
    p_cuenta_cliente_id,
    v_mes,
    btrim(p_nombre_archivo),
    p_hash_archivo,
    'VALIDADO',
    v_total_pdv,
    0,
    jsonb_build_object('pdvIds', to_jsonb(v_pdv_ids), 'cuotaMensual', v_total_cuota),
    p_usuario_id
  ) returning id into v_lote_id;

  update public.cuotas_diarias_pdv cuota
  set estado = 'REEMPLAZADA', updated_at = now()
  from cuota_input input
  where cuota.cuenta_cliente_id = p_cuenta_cliente_id
    and cuota.pdv_id = input.pdv_id
    and cuota.fecha between v_mes and v_mes_fin
    and cuota.estado = 'PUBLICADA';

  with calendar as (
    select day::date as fecha
    from generate_series(v_mes, v_mes_fin, interval '1 day') day
  ), weighted as (
    select
      input.*,
      calendar.fecha,
      case extract(isodow from calendar.fecha)::integer
        when 1 then coalesce((input.pesos ->> 'LUN')::numeric, 1)
        when 2 then coalesce((input.pesos ->> 'MAR')::numeric, 1)
        when 3 then coalesce((input.pesos ->> 'MIE')::numeric, 1)
        when 4 then coalesce((input.pesos ->> 'JUE')::numeric, 1)
        when 5 then coalesce((input.pesos ->> 'VIE')::numeric, 1)
        when 6 then coalesce((input.pesos ->> 'SAB')::numeric, 1)
        else coalesce((input.pesos ->> 'DOM')::numeric, 1)
      end as peso_dia
    from cuota_input input
    cross join calendar
  ), raw_distribution as (
    select
      weighted.*,
      round(weighted.cuota_mensual * 100)::bigint as monthly_cents,
      floor(
        round(weighted.cuota_mensual * 100)
        * weighted.peso_dia
        / sum(weighted.peso_dia) over (partition by weighted.pdv_id)
      )::bigint as base_cents,
      (
        round(weighted.cuota_mensual * 100)
        * weighted.peso_dia
        / sum(weighted.peso_dia) over (partition by weighted.pdv_id)
      ) % 1 as fractional_cents
    from weighted
  ), ranked as (
    select
      raw_distribution.*,
      sum(raw_distribution.base_cents) over (partition by raw_distribution.pdv_id) as assigned_cents,
      row_number() over (
        partition by raw_distribution.pdv_id
        order by raw_distribution.fractional_cents desc, raw_distribution.fecha
      ) as remainder_rank
    from raw_distribution
  )
  insert into public.cuotas_diarias_pdv (
    cuenta_cliente_id,
    pdv_id,
    fecha,
    monto_cuota,
    cuota_mensual_referencia,
    peso_dia,
    lote_importacion_id,
    version,
    estado,
    metadata
  )
  select
    p_cuenta_cliente_id,
    ranked.pdv_id,
    ranked.fecha,
    (
      ranked.base_cents
      + case when ranked.remainder_rank <= ranked.monthly_cents - ranked.assigned_cents then 1 else 0 end
    )::numeric / 100,
    ranked.cuota_mensual,
    ranked.peso_dia,
    v_lote_id,
    previous.next_version,
    'PUBLICADA',
    jsonb_build_object('metodo', 'PONDERACION_SEMANAL', 'claveBtl', ranked.clave_btl)
  from ranked
  cross join lateral (
    select coalesce(max(existing.version), 0) + 1 as next_version
    from public.cuotas_diarias_pdv existing
    where existing.cuenta_cliente_id = p_cuenta_cliente_id
      and existing.pdv_id = ranked.pdv_id
      and existing.fecha = ranked.fecha
  ) previous;
  get diagnostics v_total_dias = row_count;

  delete from public.cuota_asignacion_diaria_dc attribution
  using cuota_input input
  where attribution.cuenta_cliente_id = p_cuenta_cliente_id
    and attribution.pdv_id = input.pdv_id
    and attribution.fecha between v_mes and v_mes_fin
    and attribution.estado_calculo = 'VIGENTE';

  with coverage as (
    select
      quota.id as cuota_diaria_pdv_id,
      quota.cuenta_cliente_id,
      resolved.empleado_id,
      quota.pdv_id,
      quota.fecha,
      quota.monto_cuota,
      quota.version,
      resolved.referencia_tabla,
      resolved.referencia_id,
      count(*) over (partition by quota.id) as participant_count,
      row_number() over (partition by quota.id order by resolved.empleado_id) as participant_rank
    from public.cuotas_diarias_pdv quota
    join public.asignacion_diaria_resuelta resolved
      on resolved.cuenta_cliente_id = quota.cuenta_cliente_id
     and resolved.pdv_id = quota.pdv_id
     and resolved.fecha = quota.fecha
     and resolved.estado_operativo = 'ASIGNADA_PDV'
     and resolved.trabaja_en_tienda
    where quota.lote_importacion_id = v_lote_id
      and quota.estado = 'PUBLICADA'
  ), split as (
    select
      coverage.*,
      round(coverage.monto_cuota * 100)::bigint as total_cents,
      floor(round(coverage.monto_cuota * 100) / coverage.participant_count)::bigint as base_cents
    from coverage
  )
  insert into public.cuota_asignacion_diaria_dc (
    cuota_diaria_pdv_id,
    cuenta_cliente_id,
    empleado_id,
    pdv_id,
    fecha,
    cuota_diaria_pdv,
    factor_participacion,
    monto_asignado,
    estado_calculo,
    motivo_ajuste,
    referencia_asignacion_id,
    version,
    metadata
  )
  select
    split.cuota_diaria_pdv_id,
    split.cuenta_cliente_id,
    split.empleado_id,
    split.pdv_id,
    split.fecha,
    split.monto_cuota,
    1::numeric / split.participant_count,
    (
      split.base_cents
      + case when split.participant_rank <= split.total_cents - split.base_cents * split.participant_count
        then 1 else 0 end
    )::numeric / 100,
    'VIGENTE',
    case when split.participant_count > 1 then 'CUOTA_DIVIDIDA_COBERTURA_SIMULTANEA' else null end,
    case when split.referencia_tabla = 'asignacion' then split.referencia_id else null end,
    split.version,
    jsonb_build_object(
      'loteImportacionId', v_lote_id,
      'participantesPdvDia', split.participant_count
    )
  from split;
  get diagnostics v_total_atribuciones = row_count;

  select coalesce(sum(attribution.monto_asignado), 0)
  into v_total_atribuida
  from public.cuota_asignacion_diaria_dc attribution
  join public.cuotas_diarias_pdv quota on quota.id = attribution.cuota_diaria_pdv_id
  where quota.lote_importacion_id = v_lote_id
    and attribution.estado_calculo = 'VIGENTE';

  v_scope_key := p_cuenta_cliente_id::text || ':' || to_char(v_mes, 'YYYY-MM');
  perform public.touch_ui_change_version(
    p_cuenta_cliente_id,
    'asignaciones',
    'planeacion_mensual',
    v_scope_key,
    'ALL',
    null,
    null,
    'cuotas_mensuales_publicadas',
    jsonb_build_object('loteId', v_lote_id, 'mes', v_mes, 'pdvIds', v_pdv_ids)
  );
  select version into v_version
  from public.ui_change_version
  where module = 'asignaciones'
    and surface = 'planeacion_mensual'
    and scope_key = v_scope_key
    and role_target = 'ALL';
  v_version := coalesce(v_version, 1);

  update public.cuota_carga_lote
  set estado = 'PUBLICADO',
      publicado_por_usuario_id = p_usuario_id,
      publicado_at = now(),
      resumen_validacion = jsonb_build_object(
        'version', v_version,
        'pdvIds', to_jsonb(v_pdv_ids),
        'pdvs', v_total_pdv,
        'dias', v_total_dias,
        'atribuciones', v_total_atribuciones,
        'cuotaMensual', v_total_cuota,
        'cuotaAtribuida', v_total_atribuida,
        'cuotaNoAtribuida', v_total_cuota - v_total_atribuida
      ),
      updated_at = now()
  where id = v_lote_id;

  insert into public.planeacion_evento_outbox (
    cuenta_cliente_id, evento, mes, payload
  ) values (
    p_cuenta_cliente_id,
    'CUOTAS_MENSUALES_PUBLICADAS',
    v_mes,
    jsonb_build_object('loteId', v_lote_id, 'version', v_version, 'pdvIds', v_pdv_ids)
  );

  insert into public.audit_log (
    tabla, registro_id, accion, payload, usuario_id, cuenta_cliente_id
  ) values (
    'cuota_carga_lote',
    v_lote_id::text,
    'EVENTO',
    jsonb_build_object(
      'evento', 'cuotas_mensuales_publicadas',
      'mes', v_mes,
      'version', v_version,
      'pdvs', v_total_pdv,
      'dias', v_total_dias,
      'cuotaMensual', v_total_cuota,
      'cuotaAtribuida', v_total_atribuida
    ),
    p_usuario_id,
    p_cuenta_cliente_id
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'loteId', v_lote_id,
    'mes', v_mes,
    'version', v_version,
    'pdvIds', to_jsonb(v_pdv_ids),
    'summary', jsonb_build_object(
      'pdvs', v_total_pdv,
      'dias', v_total_dias,
      'atribuciones', v_total_atribuciones,
      'cuotaMensual', v_total_cuota,
      'cuotaAtribuida', v_total_atribuida,
      'cuotaNoAtribuida', v_total_cuota - v_total_atribuida
    )
  );
end;
$$;

revoke all on function public.aplicar_cuotas_mensuales(uuid, date, text, text, jsonb, uuid)
from public, anon, authenticated;
grant execute on function public.aplicar_cuotas_mensuales(uuid, date, text, text, jsonb, uuid)
to service_role;

comment on function public.aplicar_cuotas_mensuales(uuid, date, text, text, jsonb, uuid) is
  'Publica un XLSX mensual idempotente, distribuye la cuota al centavo, atribuye sólo cobertura efectiva y emite auditoría/outbox.';
