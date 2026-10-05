-- Vista previa y aplicación atómica de los primeros comandos de Planeación Mensual.
-- El cliente no recibe EXECUTE: sólo las Server Actions con service_role pueden aplicar cambios.

create or replace function public.planeacion_dia_laboral(
  p_dias_laborales text,
  p_dia_descanso text,
  p_fecha date
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_codigo text;
  v_dias text;
  v_descanso text;
  v_inicio text;
  v_fin text;
  v_orden text[] := array['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'];
  v_pos integer;
  v_inicio_pos integer;
  v_fin_pos integer;
begin
  v_codigo := v_orden[extract(isodow from p_fecha)::integer];
  v_dias := upper(regexp_replace(coalesce(p_dias_laborales, ''), '\s+', '', 'g'));
  v_descanso := upper(left(regexp_replace(coalesce(p_dia_descanso, ''), '\s+', '', 'g'), 3));

  if v_descanso = v_codigo then
    return false;
  end if;

  if v_dias = '' then
    return true;
  end if;

  if v_dias ~ '^[A-ZÁÉÍÓÚ]{3,10}-[A-ZÁÉÍÓÚ]{3,10}$' then
    v_inicio := left(split_part(v_dias, '-', 1), 3);
    v_fin := left(split_part(v_dias, '-', 2), 3);
    v_inicio_pos := array_position(v_orden, v_inicio);
    v_fin_pos := array_position(v_orden, v_fin);
    v_pos := array_position(v_orden, v_codigo);

    if v_inicio_pos is not null and v_fin_pos is not null then
      if v_inicio_pos <= v_fin_pos then
        return v_pos between v_inicio_pos and v_fin_pos;
      end if;
      return v_pos >= v_inicio_pos or v_pos <= v_fin_pos;
    end if;
  end if;

  return exists (
    select 1
    from regexp_split_to_table(v_dias, '[,;|/\-]+') token
    where left(token, 3) = v_codigo
  );
end;
$$;

create or replace function public.previsualizar_planeacion_mensual(
  p_cuenta_cliente_id uuid,
  p_mes date,
  p_operaciones jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_mes_fin date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_op jsonb;
  v_tipo text;
  v_empleado_id uuid;
  v_pdv_origen_id uuid;
  v_pdv_destino_id uuid;
  v_fecha_inicio date;
  v_fecha_fin date;
  v_naturaleza text;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_index integer := 0;
begin
  if p_cuenta_cliente_id is null then
    raise exception 'PLANEACION_CUENTA_REQUERIDA';
  end if;

  if p_mes is null or p_mes <> v_mes then
    raise exception 'PLANEACION_MES_INVALIDO';
  end if;

  if jsonb_typeof(p_operaciones) <> 'array'
    or jsonb_array_length(p_operaciones) = 0
    or jsonb_array_length(p_operaciones) > 100 then
    raise exception 'PLANEACION_OPERACIONES_REQUERIDAS_1_100';
  end if;

  for v_op in select value from jsonb_array_elements(p_operaciones)
  loop
    v_index := v_index + 1;
    v_tipo := upper(trim(coalesce(v_op ->> 'tipoOperacion', v_op ->> 'tipo_operacion', '')));

    begin
      v_empleado_id := coalesce(v_op ->> 'empleadoId', v_op ->> 'empleado_id')::uuid;
    exception when invalid_text_representation then
      v_empleado_id := null;
    end;

    begin
      v_pdv_origen_id := nullif(coalesce(v_op ->> 'pdvOrigenId', v_op ->> 'pdv_origen_id', ''), '')::uuid;
    exception when invalid_text_representation then
      v_pdv_origen_id := null;
    end;

    begin
      v_pdv_destino_id := nullif(coalesce(v_op ->> 'pdvDestinoId', v_op ->> 'pdv_destino_id', ''), '')::uuid;
    exception when invalid_text_representation then
      v_pdv_destino_id := null;
    end;

    begin
      v_fecha_inicio := coalesce(v_op ->> 'fechaInicio', v_op ->> 'fecha_inicio')::date;
    exception when invalid_datetime_format then
      v_fecha_inicio := null;
    end;

    begin
      v_fecha_fin := nullif(coalesce(v_op ->> 'fechaFin', v_op ->> 'fecha_fin', ''), '')::date;
    exception when invalid_datetime_format then
      v_fecha_fin := null;
    end;

    v_naturaleza := upper(coalesce(v_op -> 'payload' ->> 'naturaleza', 'COBERTURA_PERMANENTE'));

    if v_tipo not in ('ASIGNAR_DC', 'LIBERAR_DC', 'MOVER_DC') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'TIPO_OPERACION_NO_SOPORTADO', 'operationIndex', v_index
      ));
    end if;

    if v_empleado_id is null or not exists (
      select 1 from public.empleado e
      where e.id = v_empleado_id and e.puesto = 'DERMOCONSEJERO'
    ) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'DC_INVALIDA', 'operationIndex', v_index
      ));
    end if;

    if v_fecha_inicio is null or v_fecha_inicio < v_mes or v_fecha_inicio > v_mes_fin then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'FECHA_FUERA_DEL_MES', 'operationIndex', v_index
      ));
    end if;

    if v_fecha_fin is not null and (v_fecha_inicio is null or v_fecha_fin < v_fecha_inicio) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'RANGO_INVALIDO', 'operationIndex', v_index
      ));
    end if;

    if trim(coalesce(v_op ->> 'motivo', '')) = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'MOTIVO_REQUERIDO', 'operationIndex', v_index
      ));
    end if;

    if v_tipo in ('LIBERAR_DC', 'MOVER_DC') and v_pdv_origen_id is null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'PDV_ORIGEN_REQUERIDO', 'operationIndex', v_index
      ));
    end if;

    if v_tipo in ('ASIGNAR_DC', 'MOVER_DC') and v_pdv_destino_id is null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'PDV_DESTINO_REQUERIDO', 'operationIndex', v_index
      ));
    end if;

    if v_tipo = 'MOVER_DC' and v_pdv_origen_id = v_pdv_destino_id then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'PDV_ORIGEN_DESTINO_IGUALES', 'operationIndex', v_index
      ));
    end if;

    if v_naturaleza not in ('BASE', 'COBERTURA_TEMPORAL', 'COBERTURA_PERMANENTE') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'NATURALEZA_INVALIDA', 'operationIndex', v_index
      ));
    end if;

    if v_naturaleza = 'COBERTURA_TEMPORAL' and v_fecha_fin is null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'COBERTURA_TEMPORAL_REQUIERE_FIN', 'operationIndex', v_index
      ));
    end if;

    if v_pdv_origen_id is not null and not exists (
      select 1 from public.cuenta_cliente_pdv ccp
      where ccp.cuenta_cliente_id = p_cuenta_cliente_id
        and ccp.pdv_id = v_pdv_origen_id
        and ccp.activo
        and ccp.fecha_inicio <= coalesce(v_fecha_inicio, v_mes_fin)
        and (ccp.fecha_fin is null or ccp.fecha_fin >= coalesce(v_fecha_inicio, v_mes))
    ) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'PDV_ORIGEN_FUERA_DE_CUENTA', 'operationIndex', v_index
      ));
    end if;

    if v_pdv_destino_id is not null and not exists (
      select 1 from public.cuenta_cliente_pdv ccp
      where ccp.cuenta_cliente_id = p_cuenta_cliente_id
        and ccp.pdv_id = v_pdv_destino_id
        and ccp.activo
        and ccp.fecha_inicio <= coalesce(v_fecha_inicio, v_mes_fin)
        and (ccp.fecha_fin is null or ccp.fecha_fin >= coalesce(v_fecha_inicio, v_mes))
    ) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'PDV_DESTINO_FUERA_DE_CUENTA', 'operationIndex', v_index
      ));
    end if;

    if v_tipo = 'LIBERAR_DC' then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'code', 'PDV_LIBRE_POR_CAMBIO',
        'operationIndex', v_index,
        'pdvId', v_pdv_origen_id,
        'fechaInicio', v_fecha_inicio
      ));
    end if;
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object(
      'ok', false,
      'mes', v_mes,
      'errors', v_errors,
      'warnings', v_warnings,
      'conflicts', v_conflicts
    );
  end if;

  with ops as (
    select
      upper(trim(coalesce(value ->> 'tipoOperacion', value ->> 'tipo_operacion'))) as tipo_operacion,
      coalesce(value ->> 'empleadoId', value ->> 'empleado_id')::uuid as empleado_id,
      nullif(coalesce(value ->> 'pdvOrigenId', value ->> 'pdv_origen_id', ''), '')::uuid as pdv_origen_id,
      nullif(coalesce(value ->> 'pdvDestinoId', value ->> 'pdv_destino_id', ''), '')::uuid as pdv_destino_id,
      coalesce(value ->> 'fechaInicio', value ->> 'fecha_inicio')::date as fecha_inicio,
      nullif(coalesce(value ->> 'fechaFin', value ->> 'fecha_fin', ''), '')::date as fecha_fin,
      coalesce(nullif(value -> 'payload' ->> 'diasLaborales', ''), 'LUN-SAB') as dias_laborales,
      nullif(value -> 'payload' ->> 'diaDescanso', '') as dia_descanso,
      case upper(coalesce(value -> 'payload' ->> 'naturaleza', 'COBERTURA_PERMANENTE'))
        when 'COBERTURA_TEMPORAL' then 200
        when 'COBERTURA_PERMANENTE' then 150
        else 100
      end as prioridad
    from jsonb_array_elements(p_operaciones)
  ),
  bounds as (
    select min(fecha_inicio) as fecha_inicio,
           greatest(max(coalesce(fecha_fin, v_mes_fin)), v_mes_fin) as fecha_fin
    from ops
  ),
  existing_raw as (
    select
      a.empleado_id,
      a.pdv_id,
      dia.fecha::date as fecha,
      a.prioridad,
      a.id::text as referencia
    from public.asignacion a
    cross join bounds b
    cross join lateral generate_series(
      greatest(a.fecha_inicio, b.fecha_inicio),
      least(coalesce(a.fecha_fin, b.fecha_fin), b.fecha_fin),
      interval '1 day'
    ) dia(fecha)
    where a.cuenta_cliente_id = p_cuenta_cliente_id
      and a.empleado_id in (select empleado_id from ops)
      and a.estado_publicacion = 'PUBLICADA'
      and a.fecha_inicio <= b.fecha_fin
      and coalesce(a.fecha_fin, b.fecha_fin) >= b.fecha_inicio
      and public.planeacion_dia_laboral(a.dias_laborales, a.dia_descanso, dia.fecha::date)
      and not exists (
        select 1 from ops o
        where o.tipo_operacion in ('LIBERAR_DC', 'MOVER_DC')
          and o.empleado_id = a.empleado_id
          and o.pdv_origen_id = a.pdv_id
          and dia.fecha::date >= o.fecha_inicio
      )
  ),
  existing_ranked as (
    select *, dense_rank() over (partition by empleado_id, fecha order by prioridad desc) as rango
    from existing_raw
  ),
  candidates as (
    select empleado_id, pdv_id, fecha, prioridad, referencia
    from existing_ranked
    where rango = 1
    union all
    select
      o.empleado_id,
      o.pdv_destino_id,
      dia.fecha::date,
      o.prioridad,
      'operacion'::text
    from ops o
    cross join lateral generate_series(
      o.fecha_inicio,
      least(coalesce(o.fecha_fin, v_mes_fin), v_mes_fin),
      interval '1 day'
    ) dia(fecha)
    where o.tipo_operacion in ('ASIGNAR_DC', 'MOVER_DC')
      and public.planeacion_dia_laboral(o.dias_laborales, o.dia_descanso, dia.fecha::date)
  ),
  ranked as (
    select *, dense_rank() over (partition by empleado_id, fecha order by prioridad desc) as rango
    from candidates
  ),
  conflicts as (
    select empleado_id, fecha, array_agg(distinct pdv_id) as pdv_ids
    from ranked
    where rango = 1
    group by empleado_id, fecha
    having count(distinct pdv_id) > 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', 'DC_DOBLE_ASIGNACION',
    'empleadoId', empleado_id,
    'fecha', fecha,
    'pdvIds', to_jsonb(pdv_ids)
  ) order by fecha, empleado_id), '[]'::jsonb)
  into v_conflicts
  from conflicts;

  if jsonb_array_length(v_conflicts) > 0 then
    v_errors := v_errors || v_conflicts;
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'mes', v_mes,
    'errors', v_errors,
    'warnings', v_warnings,
    'conflicts', v_conflicts,
    'impact', jsonb_build_object(
      'operations', jsonb_array_length(p_operaciones),
      'employees', (
        select count(distinct coalesce(value ->> 'empleadoId', value ->> 'empleado_id'))
        from jsonb_array_elements(p_operaciones)
      ),
      'pdvs', (
        select count(distinct pdv_id)
        from (
          select nullif(coalesce(value ->> 'pdvOrigenId', value ->> 'pdv_origen_id', ''), '') as pdv_id
          from jsonb_array_elements(p_operaciones)
          union
          select nullif(coalesce(value ->> 'pdvDestinoId', value ->> 'pdv_destino_id', ''), '')
          from jsonb_array_elements(p_operaciones)
        ) affected
        where pdv_id is not null
      )
    )
  );
end;
$$;

create or replace function public.aplicar_planeacion_mensual(
  p_cuenta_cliente_id uuid,
  p_mes date,
  p_idempotency_key text,
  p_version_base bigint,
  p_operaciones jsonb,
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
  v_scope_key text;
  v_current_version bigint := 0;
  v_lote_id uuid;
  v_existing public.planeacion_cambio_lote%rowtype;
  v_has_existing boolean := false;
  v_preview jsonb;
  v_op jsonb;
  v_tipo text;
  v_empleado_id uuid;
  v_pdv_origen_id uuid;
  v_pdv_destino_id uuid;
  v_fecha_inicio date;
  v_fecha_fin date;
  v_motivo text;
  v_payload jsonb;
  v_naturaleza text;
  v_tipo_asignacion text;
  v_prioridad integer;
  v_factor numeric(6,3);
  v_supervisor_id uuid;
  v_orden integer := 0;
begin
  if trim(coalesce(p_idempotency_key, '')) = '' or length(p_idempotency_key) > 180 then
    raise exception 'PLANEACION_IDEMPOTENCY_KEY_INVALIDA';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('planeacion:' || p_cuenta_cliente_id::text, 0));

  select * into v_existing
  from public.planeacion_cambio_lote
  where cuenta_cliente_id = p_cuenta_cliente_id
    and idempotency_key = p_idempotency_key;
  v_has_existing := found;

  if v_has_existing and v_existing.estado = 'PUBLICADO' then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'loteId', v_existing.id,
      'version', v_existing.resumen_impacto -> 'version'
    ) || coalesce(v_existing.resumen_impacto, '{}'::jsonb);
  end if;

  v_preview := public.previsualizar_planeacion_mensual(
    p_cuenta_cliente_id,
    p_mes,
    p_operaciones
  );

  if not coalesce((v_preview ->> 'ok')::boolean, false) then
    raise exception 'PLANEACION_VALIDACION_FALLIDA:%', v_preview::text;
  end if;

  v_scope_key := p_cuenta_cliente_id::text || ':' || to_char(v_mes, 'YYYY-MM');
  select version into v_current_version
  from public.ui_change_version
  where module = 'asignaciones'
    and surface = 'planeacion_mensual'
    and scope_key = v_scope_key
    and role_target = 'ALL';
  v_current_version := coalesce(v_current_version, 0);

  if coalesce(p_version_base, 0) <> v_current_version then
    raise exception 'PLANEACION_VERSION_CONFLICT:%:%', p_version_base, v_current_version;
  end if;

  if v_has_existing then
    v_lote_id := v_existing.id;
    delete from public.planeacion_cambio_operacion where lote_id = v_lote_id;
    update public.planeacion_cambio_lote
    set estado = 'VALIDADO', version_base = v_current_version,
        resumen_impacto = v_preview, updated_at = now()
    where id = v_lote_id;
  else
    insert into public.planeacion_cambio_lote (
      cuenta_cliente_id, mes, estado, version_base, idempotency_key,
      resumen_impacto, creado_por_usuario_id
    ) values (
      p_cuenta_cliente_id, v_mes, 'VALIDADO', v_current_version, p_idempotency_key,
      v_preview, p_usuario_id
    ) returning id into v_lote_id;
  end if;

  for v_op in select value from jsonb_array_elements(p_operaciones)
  loop
    v_orden := v_orden + 1;
    v_tipo := upper(trim(coalesce(v_op ->> 'tipoOperacion', v_op ->> 'tipo_operacion')));
    v_empleado_id := coalesce(v_op ->> 'empleadoId', v_op ->> 'empleado_id')::uuid;
    v_pdv_origen_id := nullif(coalesce(v_op ->> 'pdvOrigenId', v_op ->> 'pdv_origen_id', ''), '')::uuid;
    v_pdv_destino_id := nullif(coalesce(v_op ->> 'pdvDestinoId', v_op ->> 'pdv_destino_id', ''), '')::uuid;
    v_fecha_inicio := coalesce(v_op ->> 'fechaInicio', v_op ->> 'fecha_inicio')::date;
    v_fecha_fin := nullif(coalesce(v_op ->> 'fechaFin', v_op ->> 'fecha_fin', ''), '')::date;
    v_motivo := trim(v_op ->> 'motivo');
    v_payload := coalesce(v_op -> 'payload', '{}'::jsonb);

    insert into public.planeacion_cambio_operacion (
      lote_id, orden, tipo_operacion, empleado_id, pdv_origen_id, pdv_destino_id,
      fecha_inicio, fecha_fin, es_temporal, motivo, payload, resultado_validacion
    ) values (
      v_lote_id, v_orden, v_tipo, v_empleado_id, v_pdv_origen_id, v_pdv_destino_id,
      v_fecha_inicio, v_fecha_fin, v_fecha_fin is not null, v_motivo, v_payload,
      jsonb_build_object('ok', true)
    );

    if v_tipo in ('LIBERAR_DC', 'MOVER_DC') then
      delete from public.asignacion a
      where a.cuenta_cliente_id = p_cuenta_cliente_id
        and a.empleado_id = v_empleado_id
        and a.pdv_id = v_pdv_origen_id
        and a.estado_publicacion = 'PUBLICADA'
        and a.fecha_inicio >= v_fecha_inicio
        and (
          nullif(v_payload ->> 'asignacionId', '') is null
          or a.id = (v_payload ->> 'asignacionId')::uuid
        );

      update public.asignacion a
      set fecha_fin = v_fecha_inicio - 1,
          observaciones = concat_ws(' | ', nullif(a.observaciones, ''), '[PLANEACION] ' || v_motivo),
          updated_at = now()
      where a.cuenta_cliente_id = p_cuenta_cliente_id
        and a.empleado_id = v_empleado_id
        and a.pdv_id = v_pdv_origen_id
        and a.estado_publicacion = 'PUBLICADA'
        and a.fecha_inicio < v_fecha_inicio
        and coalesce(a.fecha_fin, '9999-12-31'::date) >= v_fecha_inicio
        and (
          nullif(v_payload ->> 'asignacionId', '') is null
          or a.id = (v_payload ->> 'asignacionId')::uuid
        );
    end if;

    if v_tipo in ('ASIGNAR_DC', 'MOVER_DC') then
      v_naturaleza := upper(coalesce(v_payload ->> 'naturaleza', 'COBERTURA_PERMANENTE'));
      v_tipo_asignacion := upper(coalesce(v_payload ->> 'tipo',
        case when v_naturaleza = 'BASE' then 'FIJA' else 'COBERTURA' end));
      v_prioridad := case v_naturaleza
        when 'COBERTURA_TEMPORAL' then 200
        when 'COBERTURA_PERMANENTE' then 150
        else 100
      end;
      v_factor := coalesce(nullif(v_payload ->> 'factorTiempo', '')::numeric,
        case when v_tipo_asignacion = 'ROTATIVA' then 0.5 else 1 end);

      select sp.empleado_id into v_supervisor_id
      from public.supervisor_pdv sp
      where sp.pdv_id = v_pdv_destino_id
        and sp.activo
        and sp.fecha_inicio <= v_fecha_inicio
        and (sp.fecha_fin is null or sp.fecha_fin >= v_fecha_inicio)
      order by sp.fecha_inicio desc, sp.created_at desc
      limit 1;

      insert into public.asignacion (
        cuenta_cliente_id, empleado_id, pdv_id, supervisor_empleado_id,
        tipo, factor_tiempo, dias_laborales, dia_descanso, horario_referencia,
        fecha_inicio, fecha_fin, naturaleza, retorna_a_base, prioridad,
        motivo_movimiento, observaciones, generado_automaticamente, estado_publicacion
      ) values (
        p_cuenta_cliente_id, v_empleado_id, v_pdv_destino_id, v_supervisor_id,
        v_tipo_asignacion, v_factor,
        coalesce(nullif(v_payload ->> 'diasLaborales', ''), 'LUN-SAB'),
        nullif(v_payload ->> 'diaDescanso', ''),
        nullif(v_payload ->> 'horarioReferencia', ''),
        v_fecha_inicio, v_fecha_fin, v_naturaleza,
        v_naturaleza = 'COBERTURA_TEMPORAL', v_prioridad,
        v_motivo, '[PLANEACION MENSUAL] ' || v_motivo, false, 'PUBLICADA'
      );
    end if;

    insert into public.asignacion_diaria_dirty_queue (
      empleado_id, fecha_inicio, fecha_fin, motivo, payload
    ) values (
      v_empleado_id,
      v_fecha_inicio,
      least(coalesce(v_fecha_fin, v_mes_fin), v_mes_fin),
      'PLANEACION_MENSUAL',
      jsonb_build_object('loteId', v_lote_id, 'tipoOperacion', v_tipo)
    );
  end loop;

  perform public.touch_ui_change_version(
    p_cuenta_cliente_id,
    'asignaciones',
    'planeacion_mensual',
    v_scope_key,
    'ALL',
    null,
    null,
    'planeacion_mensual_publicada',
    jsonb_build_object('loteId', v_lote_id, 'mes', v_mes)
  );

  select version into v_current_version
  from public.ui_change_version
  where module = 'asignaciones'
    and surface = 'planeacion_mensual'
    and scope_key = v_scope_key
    and role_target = 'ALL';

  update public.planeacion_cambio_lote
  set estado = 'PUBLICADO',
      publicado_por_usuario_id = p_usuario_id,
      publicado_at = now(),
      resumen_impacto = v_preview || jsonb_build_object('version', v_current_version),
      updated_at = now()
  where id = v_lote_id;

  insert into public.planeacion_evento_outbox (
    cuenta_cliente_id, lote_id, evento, mes, payload
  ) values (
    p_cuenta_cliente_id,
    v_lote_id,
    'PLANEACION_MENSUAL_PUBLICADA',
    v_mes,
    jsonb_build_object('version', v_current_version, 'operations', jsonb_array_length(p_operaciones))
  );

  insert into public.audit_log (
    tabla, registro_id, accion, payload, usuario_id, cuenta_cliente_id
  ) values (
    'planeacion_cambio_lote',
    v_lote_id::text,
    'EVENTO',
    jsonb_build_object(
      'evento', 'planeacion_mensual_publicada',
      'mes', v_mes,
      'version', v_current_version,
      'operaciones', jsonb_array_length(p_operaciones)
    ),
    p_usuario_id,
    p_cuenta_cliente_id
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'loteId', v_lote_id,
    'version', v_current_version,
    'preview', v_preview
  );
end;
$$;

revoke all on function public.planeacion_dia_laboral(text, text, date)
from public, anon, authenticated;
revoke all on function public.previsualizar_planeacion_mensual(uuid, date, jsonb)
from public, anon, authenticated;
revoke all on function public.aplicar_planeacion_mensual(uuid, date, text, bigint, jsonb, uuid)
from public, anon, authenticated;

grant execute on function public.previsualizar_planeacion_mensual(uuid, date, jsonb)
to service_role;
grant execute on function public.aplicar_planeacion_mensual(uuid, date, text, bigint, jsonb, uuid)
to service_role;

comment on function public.previsualizar_planeacion_mensual(uuid, date, jsonb) is
  'Valida comandos mensuales y detecta empates de prioridad que pondrían una DC en dos PDVs el mismo día.';
comment on function public.aplicar_planeacion_mensual(uuid, date, text, bigint, jsonb, uuid) is
  'Aplica comandos mensuales con idempotencia, control optimista, dirty queue, outbox, auditoría e invalidación por versión.';
