-- Reasignacion masiva y selectiva de supervisores por PDV.
-- Mantiene una sola transaccion, version optimista e invalidacion por lote.

create or replace function public.previsualizar_planeacion_supervisor_pdvs(
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
  v_payload jsonb;
  v_index integer := 0;
  v_fecha_inicio date;
  v_pdv_id uuid;
  v_supervisor_origen_id uuid;
  v_supervisor_destino_id uuid;
  v_seen_pdvs uuid[] := '{}'::uuid[];
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
begin
  if p_cuenta_cliente_id is null or p_mes is null or p_mes <> v_mes then
    raise exception 'PLANEACION_SCOPE_INVALIDO';
  end if;
  if jsonb_typeof(p_operaciones) <> 'array'
     or jsonb_array_length(p_operaciones) not between 1 and 100 then
    raise exception 'PLANEACION_OPERACIONES_REQUERIDAS_1_100';
  end if;

  for v_op in select value from jsonb_array_elements(p_operaciones)
  loop
    v_index := v_index + 1;
    v_payload := coalesce(v_op -> 'payload', '{}'::jsonb);
    begin
      v_fecha_inicio := (v_op ->> 'fechaInicio')::date;
      v_pdv_id := nullif(v_op ->> 'pdvOrigenId', '')::uuid;
      v_supervisor_origen_id := nullif(v_payload ->> 'supervisorOrigenId', '')::uuid;
      v_supervisor_destino_id := nullif(v_payload ->> 'supervisorDestinoId', '')::uuid;
    exception when others then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'CONTRATO_OPERACION_INVALIDO', 'operationIndex', v_index
      ));
      continue;
    end;

    if upper(trim(coalesce(v_op ->> 'tipoOperacion', ''))) <> 'REASIGNAR_SUPERVISOR' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'LOTE_SUPERVISOR_CONTIENE_OTRA_OPERACION', 'operationIndex', v_index
      ));
    end if;
    if v_fecha_inicio is null or v_fecha_inicio < v_mes or v_fecha_inicio > v_mes_fin then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'FECHA_FUERA_DEL_MES', 'operationIndex', v_index
      ));
    end if;
    if nullif(v_op ->> 'fechaFin', '') is not null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'REASIGNACION_SUPERVISOR_DEBE_SER_ABIERTA', 'operationIndex', v_index
      ));
    end if;
    if trim(coalesce(v_op ->> 'motivo', '')) = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'MOTIVO_REQUERIDO', 'operationIndex', v_index
      ));
    end if;
    if v_pdv_id is null or not exists (
      select 1 from public.cuenta_cliente_pdv ccp
      where ccp.cuenta_cliente_id = p_cuenta_cliente_id
        and ccp.pdv_id = v_pdv_id
        and ccp.activo
    ) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'PDV_FUERA_DE_CUENTA', 'operationIndex', v_index, 'pdvId', v_pdv_id
      ));
    elsif v_pdv_id = any(v_seen_pdvs) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'PDV_DUPLICADO_EN_LOTE', 'operationIndex', v_index, 'pdvId', v_pdv_id
      ));
    else
      v_seen_pdvs := array_append(v_seen_pdvs, v_pdv_id);
    end if;
    if v_supervisor_origen_id is null or v_supervisor_destino_id is null
       or v_supervisor_origen_id = v_supervisor_destino_id then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'SUSTITUCION_SUPERVISOR_INVALIDA', 'operationIndex', v_index, 'pdvId', v_pdv_id
      ));
    end if;
    if v_pdv_id is not null and v_supervisor_origen_id is not null and not exists (
      select 1 from public.supervisor_pdv sp
      where sp.pdv_id = v_pdv_id
        and sp.empleado_id = v_supervisor_origen_id
        and sp.activo
        and sp.fecha_inicio <= v_fecha_inicio
        and coalesce(sp.fecha_fin, '9999-12-31'::date) >= v_fecha_inicio
    ) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'SUPERVISOR_NO_GESTIONA_PDV_EN_FECHA',
        'operationIndex', v_index,
        'pdvId', v_pdv_id
      ));
    end if;
    if v_supervisor_destino_id is not null and not exists (
      select 1 from public.empleado e
      where e.id = v_supervisor_destino_id
        and e.puesto = 'SUPERVISOR'
        and e.estatus_laboral = 'ACTIVO'
        and (
          exists (
            select 1 from public.usuario u
            where u.empleado_id = e.id
              and u.cuenta_cliente_id = p_cuenta_cliente_id
              and u.estado_cuenta <> 'BAJA'
          )
          or exists (
            select 1
            from public.supervisor_pdv sp
            join public.cuenta_cliente_pdv ccp on ccp.pdv_id = sp.pdv_id
            where sp.empleado_id = e.id
              and ccp.cuenta_cliente_id = p_cuenta_cliente_id
              and ccp.activo
              and sp.activo
          )
        )
    ) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'SUPERVISOR_DESTINO_FUERA_DE_CUENTA',
        'operationIndex', v_index,
        'pdvId', v_pdv_id
      ));
    end if;

    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'RESPONSABILIDAD_PDV_REASIGNADA',
      'operationIndex', v_index,
      'pdvId', v_pdv_id,
      'fecha', v_fecha_inicio
    ));
  end loop;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'mes', v_mes,
    'errors', v_errors,
    'warnings', v_warnings,
    'conflicts', '[]'::jsonb,
    'impact', jsonb_build_object(
      'operations', jsonb_array_length(p_operaciones),
      'employees', 0,
      'pdvs', cardinality(v_seen_pdvs)
    )
  );
end;
$$;

create or replace function public.aplicar_planeacion_supervisor_pdvs(
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
  v_scope_key text;
  v_current_version bigint := 0;
  v_lote_id uuid;
  v_existing public.planeacion_cambio_lote%rowtype;
  v_preview jsonb;
  v_op jsonb;
  v_payload jsonb;
  v_fecha_inicio date;
  v_pdv_id uuid;
  v_supervisor_origen_id uuid;
  v_supervisor_destino_id uuid;
  v_next_start date;
  v_new_end date;
  v_motivo text;
  v_orden integer := 0;
begin
  if trim(coalesce(p_idempotency_key, '')) = '' or length(p_idempotency_key) > 180 then
    raise exception 'PLANEACION_IDEMPOTENCY_KEY_INVALIDA';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('planeacion:' || p_cuenta_cliente_id::text, 0));

  select * into v_existing
  from public.planeacion_cambio_lote
  where cuenta_cliente_id = p_cuenta_cliente_id and idempotency_key = p_idempotency_key;
  if found and v_existing.estado = 'PUBLICADO' then
    return jsonb_build_object('ok', true, 'idempotent', true, 'loteId', v_existing.id)
      || coalesce(v_existing.resumen_impacto, '{}'::jsonb);
  end if;

  v_preview := public.previsualizar_planeacion_supervisor_pdvs(
    p_cuenta_cliente_id, p_mes, p_operaciones
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

  if v_existing.id is not null then
    v_lote_id := v_existing.id;
    delete from public.planeacion_cambio_operacion where lote_id = v_lote_id;
    update public.planeacion_cambio_lote
    set estado = 'VALIDADO',
        version_base = v_current_version,
        resumen_impacto = v_preview,
        updated_at = now()
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
    v_payload := coalesce(v_op -> 'payload', '{}'::jsonb);
    v_fecha_inicio := (v_op ->> 'fechaInicio')::date;
    v_pdv_id := (v_op ->> 'pdvOrigenId')::uuid;
    v_supervisor_origen_id := (v_payload ->> 'supervisorOrigenId')::uuid;
    v_supervisor_destino_id := (v_payload ->> 'supervisorDestinoId')::uuid;
    v_motivo := trim(v_op ->> 'motivo');

    insert into public.planeacion_cambio_operacion (
      lote_id, orden, tipo_operacion, empleado_id, pdv_origen_id, pdv_destino_id,
      fecha_inicio, fecha_fin, es_temporal, motivo, payload, resultado_validacion
    ) values (
      v_lote_id, v_orden, 'REASIGNAR_SUPERVISOR', null, v_pdv_id, null,
      v_fecha_inicio, null, false, v_motivo, v_payload,
      jsonb_build_object('ok', true, 'alcance', 'PDV')
    );

    select min(sp.fecha_inicio) into v_next_start
    from public.supervisor_pdv sp
    where sp.pdv_id = v_pdv_id
      and sp.activo
      and sp.fecha_inicio > v_fecha_inicio;
    v_new_end := case when v_next_start is null then null else v_next_start - 1 end;

    update public.supervisor_pdv
    set fecha_fin = v_fecha_inicio - 1, updated_at = now()
    where pdv_id = v_pdv_id
      and activo
      and fecha_inicio < v_fecha_inicio
      and coalesce(fecha_fin, '9999-12-31'::date) >= v_fecha_inicio;
    update public.supervisor_pdv
    set activo = false, updated_at = now()
    where pdv_id = v_pdv_id
      and activo
      and fecha_inicio = v_fecha_inicio;

    insert into public.supervisor_pdv (pdv_id, empleado_id, activo, fecha_inicio, fecha_fin)
    values (v_pdv_id, v_supervisor_destino_id, true, v_fecha_inicio, v_new_end)
    on conflict (pdv_id, empleado_id, fecha_inicio) do update
      set activo = true,
          fecha_fin = excluded.fecha_fin,
          updated_at = now();

    perform public.planeacion_versionar_asignaciones_pdv(
      p_cuenta_cliente_id, v_pdv_id, null, v_fecha_inicio, v_new_end,
      null, null, null, null, v_supervisor_destino_id, v_motivo
    );

    insert into public.supervisor_reasignacion_programada (
      cuenta_cliente_id, supervisor_origen_id, supervisor_destino_id,
      fecha_efectiva, pdv_ids, motivo, lote_id, creado_por_usuario_id, metadata
    ) values (
      p_cuenta_cliente_id, v_supervisor_origen_id, v_supervisor_destino_id,
      v_fecha_inicio, array[v_pdv_id], v_motivo, v_lote_id, p_usuario_id,
      jsonb_build_object(
        'alcance', 'PDVS_SELECCIONADOS',
        'propaga', jsonb_build_array(
          'APP_MOVIL', 'CAPTURA_PUBLICA', 'LOVE_ISDIN', 'PRODUCTOS', 'CANJES', 'REPORTES'
        )
      )
    ) on conflict (cuenta_cliente_id, supervisor_origen_id, supervisor_destino_id, fecha_efectiva)
      do update set
        pdv_ids = array(
          select distinct pdv_id
          from unnest(supervisor_reasignacion_programada.pdv_ids || excluded.pdv_ids) pdv_id
        ),
        motivo = excluded.motivo,
        lote_id = excluded.lote_id,
        estado = 'PROGRAMADA',
        updated_at = now();
  end loop;

  perform public.aplicar_supervisor_reasignaciones_vigentes(current_date);
  perform public.touch_ui_change_version(
    p_cuenta_cliente_id, 'asignaciones', 'planeacion_mensual', v_scope_key,
    'ALL', null, null, 'planeacion_mensual_publicada',
    jsonb_build_object('loteId', v_lote_id, 'mes', v_mes, 'alcance', 'PDVS_SELECCIONADOS')
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
    p_cuenta_cliente_id, v_lote_id, 'PLANEACION_MENSUAL_PUBLICADA', v_mes,
    jsonb_build_object(
      'version', v_current_version,
      'operations', jsonb_array_length(p_operaciones),
      'alcance', 'PDVS_SELECCIONADOS'
    )
  );
  insert into public.audit_log (tabla, registro_id, accion, payload, usuario_id, cuenta_cliente_id)
  values (
    'planeacion_cambio_lote', v_lote_id::text, 'EVENTO',
    jsonb_build_object(
      'evento', 'planeacion_supervisor_pdvs_publicada',
      'mes', v_mes,
      'version', v_current_version,
      'operaciones', jsonb_array_length(p_operaciones)
    ),
    p_usuario_id, p_cuenta_cliente_id
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

create or replace function public.aplicar_supervisor_reasignaciones_vigentes(
  p_fecha date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.supervisor_reasignacion_programada%rowtype;
  v_count integer := 0;
begin
  for v_row in
    select *
    from public.supervisor_reasignacion_programada
    where estado = 'PROGRAMADA' and fecha_efectiva <= p_fecha
    order by fecha_efectiva, created_at
    for update skip locked
  loop
    update public.empleado e
    set supervisor_empleado_id = v_row.supervisor_destino_id,
        metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object(
          'supervisor_reasignado_en', now(),
          'supervisor_anterior_id', v_row.supervisor_origen_id,
          'supervisor_reasignacion_id', v_row.id,
          'pdv_ids', to_jsonb(v_row.pdv_ids)
        ),
        updated_at = now()
    where e.puesto = 'DERMOCONSEJERO'
      and e.estatus_laboral <> 'BAJA'
      and exists (
        select 1
        from public.asignacion a
        where a.empleado_id = e.id
          and a.pdv_id = any(v_row.pdv_ids)
          and a.cuenta_cliente_id = v_row.cuenta_cliente_id
          and a.estado_publicacion = 'PUBLICADA'
          and a.fecha_inicio <= v_row.fecha_efectiva
          and coalesce(a.fecha_fin, '9999-12-31'::date) >= v_row.fecha_efectiva
      );

    update public.supervisor_reasignacion_programada
    set estado = 'APLICADA', aplicado_at = now(), updated_at = now()
    where id = v_row.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.previsualizar_planeacion_supervisor_pdvs(uuid, date, jsonb)
  from public, anon, authenticated;
revoke all on function public.aplicar_planeacion_supervisor_pdvs(
  uuid, date, text, bigint, jsonb, uuid
) from public, anon, authenticated;
revoke all on function public.aplicar_supervisor_reasignaciones_vigentes(date)
  from public, anon, authenticated;
grant execute on function public.previsualizar_planeacion_supervisor_pdvs(uuid, date, jsonb)
  to service_role;
grant execute on function public.aplicar_planeacion_supervisor_pdvs(
  uuid, date, text, bigint, jsonb, uuid
) to service_role;
grant execute on function public.aplicar_supervisor_reasignaciones_vigentes(date)
  to service_role;

comment on function public.previsualizar_planeacion_supervisor_pdvs(uuid, date, jsonb) is
  'Valida una reasignacion atomica limitada a los PDVs explicitos del lote.';
comment on function public.aplicar_planeacion_supervisor_pdvs(uuid, date, text, bigint, jsonb, uuid) is
  'Versiona supervisor_pdv y asignaciones solo para los PDVs seleccionados.';
