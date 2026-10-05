-- Corrección de Días Laborales y Descanso Recurrente en Planeación Mensual
-- Garantiza que al asignar un día de descanso específico (ej. MIE), los días laborales sean los 6 días restantes (LUN,MAR,JUE,VIE,SAB,DOM) y no se descanse arbitrariamente el domingo.

create or replace function public.planeacion_versionar_asignaciones_pdv(
  p_cuenta_cliente_id uuid,
  p_pdv_id uuid,
  p_empleado_id uuid,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_tipo text default null,
  p_factor_tiempo numeric default null,
  p_horario_referencia text default null,
  p_dia_descanso text default null,
  p_supervisor_empleado_id uuid default null,
  p_motivo text default 'Cambio desde planeacion mensual'
)
returns table (empleado_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.asignacion%rowtype;
  v_original_fin date;
  v_overlap_inicio date;
  v_overlap_fin date;
  v_change_id uuid;
  v_effective_dias_laborales text;
begin
  for v_row in
    select a.*
    from public.asignacion a
    where a.cuenta_cliente_id = p_cuenta_cliente_id
      and a.pdv_id = p_pdv_id
      and (p_empleado_id is null or a.empleado_id = p_empleado_id)
      and a.estado_publicacion = 'PUBLICADA'
      and a.fecha_inicio <= coalesce(p_fecha_fin, '9999-12-31'::date)
      and coalesce(a.fecha_fin, '9999-12-31'::date) >= p_fecha_inicio
    order by a.fecha_inicio, a.id
    for update
  loop
    v_original_fin := v_row.fecha_fin;
    v_overlap_inicio := greatest(v_row.fecha_inicio, p_fecha_inicio);
    v_overlap_fin := least(
      coalesce(v_original_fin, '9999-12-31'::date),
      coalesce(p_fecha_fin, '9999-12-31'::date)
    );

    v_effective_dias_laborales := coalesce(
      case
        when p_dia_descanso is not null and trim(p_dia_descanso) <> '' then
          array_to_string(
            array_remove(
              array['LUN','MAR','MIE','JUE','VIE','SAB','DOM'],
              upper(left(regexp_replace(p_dia_descanso, '\s+', '', 'g'), 3))
            ),
            ','
          )
        else null
      end,
      v_row.dias_laborales
    );

    if v_row.fecha_inicio < v_overlap_inicio then
      update public.asignacion
      set fecha_fin = v_overlap_inicio - 1,
          observaciones = concat_ws(' | ', nullif(observaciones, ''), '[PLANEACION] ' || p_motivo),
          updated_at = now()
      where id = v_row.id;

      insert into public.asignacion (
        cuenta_cliente_id, empleado_id, pdv_id, supervisor_empleado_id, clave_btl,
        tipo, factor_tiempo, dias_laborales, dia_descanso, horario_referencia,
        fecha_inicio, fecha_fin, observaciones, estado_publicacion, naturaleza,
        retorna_a_base, asignacion_base_id, asignacion_origen_id, prioridad,
        motivo_movimiento, generado_automaticamente, metadata
      ) values (
        v_row.cuenta_cliente_id, v_row.empleado_id, v_row.pdv_id,
        coalesce(p_supervisor_empleado_id, v_row.supervisor_empleado_id), v_row.clave_btl,
        coalesce(p_tipo, v_row.tipo), coalesce(p_factor_tiempo, v_row.factor_tiempo),
        v_effective_dias_laborales, coalesce(p_dia_descanso, v_row.dia_descanso),
        coalesce(p_horario_referencia, v_row.horario_referencia),
        v_overlap_inicio, nullif(v_overlap_fin, '9999-12-31'::date),
        concat_ws(' | ', nullif(v_row.observaciones, ''), '[PLANEACION] ' || p_motivo),
        v_row.estado_publicacion, v_row.naturaleza, v_row.retorna_a_base,
        coalesce(v_row.asignacion_base_id, v_row.id), v_row.id, v_row.prioridad,
        p_motivo, false,
        coalesce(v_row.metadata, '{}'::jsonb) || jsonb_build_object(
          'versionada_desde', v_row.id, 'versionada_en', now(), 'motivo', p_motivo
        )
      ) returning id into v_change_id;
    else
      update public.asignacion
      set tipo = coalesce(p_tipo, tipo),
          factor_tiempo = coalesce(p_factor_tiempo, factor_tiempo),
          horario_referencia = coalesce(p_horario_referencia, horario_referencia),
          dia_descanso = coalesce(p_dia_descanso, dia_descanso),
          dias_laborales = v_effective_dias_laborales,
          supervisor_empleado_id = coalesce(p_supervisor_empleado_id, supervisor_empleado_id),
          fecha_inicio = v_overlap_inicio,
          fecha_fin = nullif(v_overlap_fin, '9999-12-31'::date),
          motivo_movimiento = p_motivo,
          observaciones = concat_ws(' | ', nullif(observaciones, ''), '[PLANEACION] ' || p_motivo),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'versionada_en', now(), 'motivo', p_motivo
          ),
          updated_at = now()
      where id = v_row.id
      returning id into v_change_id;
    end if;

    if p_fecha_fin is not null
       and (v_original_fin is null or v_original_fin > v_overlap_fin) then
      insert into public.asignacion (
        cuenta_cliente_id, empleado_id, pdv_id, supervisor_empleado_id, clave_btl,
        tipo, factor_tiempo, dias_laborales, dia_descanso, horario_referencia,
        fecha_inicio, fecha_fin, observaciones, estado_publicacion, naturaleza,
        retorna_a_base, asignacion_base_id, asignacion_origen_id, prioridad,
        motivo_movimiento, generado_automaticamente, metadata
      ) values (
        v_row.cuenta_cliente_id, v_row.empleado_id, v_row.pdv_id, v_row.supervisor_empleado_id,
        v_row.clave_btl, v_row.tipo, v_row.factor_tiempo, v_row.dias_laborales,
        v_row.dia_descanso, v_row.horario_referencia, v_overlap_fin + 1, v_original_fin,
        v_row.observaciones, v_row.estado_publicacion, v_row.naturaleza,
        v_row.retorna_a_base, coalesce(v_row.asignacion_base_id, v_row.id),
        v_change_id, v_row.prioridad, v_row.motivo_movimiento,
        v_row.generado_automaticamente, coalesce(v_row.metadata, '{}'::jsonb) ||
        jsonb_build_object('versionada_desde', v_row.id, 'versionada_en', now(), 'motivo', p_motivo)
      );
    end if;

    return query select v_row.empleado_id;
  end loop;
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
  v_preview jsonb;
  v_op jsonb;
  v_payload jsonb;
  v_tipo text;
  v_empleado_id uuid;
  v_pdv_origen_id uuid;
  v_pdv_destino_id uuid;
  v_fecha_inicio date;
  v_fecha_fin date;
  v_motivo text;
  v_naturaleza text;
  v_tipo_asignacion text;
  v_prioridad integer;
  v_factor numeric(6,3);
  v_supervisor_id uuid;
  v_supervisor_origen_id uuid;
  v_supervisor_destino_id uuid;
  v_evento_id uuid;
  v_pdv_ids uuid[];
  v_orden integer := 0;
  v_assignment public.asignacion%rowtype;
  v_has_prior boolean := false;
  v_prior_naturaleza text;
  v_prior_factor numeric(6,3);
  v_prior_grupo text;
  v_prior_grupo_tamano smallint;
  v_prior_slot text;
  v_prior_vigente_hasta date;
  v_prior_estado text;
  v_effective_dias_laborales text;
begin
  if trim(coalesce(p_idempotency_key, '')) = '' or length(p_idempotency_key) > 180 then
    raise exception 'PLANEACION_IDEMPOTENCY_KEY_INVALIDA';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('planeacion:' || p_cuenta_cliente_id::text, 0));

  select * into v_existing from public.planeacion_cambio_lote
  where cuenta_cliente_id = p_cuenta_cliente_id and idempotency_key = p_idempotency_key;
  if found and v_existing.estado = 'PUBLICADO' then
    return jsonb_build_object('ok', true, 'idempotent', true, 'loteId', v_existing.id)
      || coalesce(v_existing.resumen_impacto, '{}'::jsonb);
  end if;

  v_preview := public.previsualizar_planeacion_mensual(p_cuenta_cliente_id, p_mes, p_operaciones);
  if not coalesce((v_preview ->> 'ok')::boolean, false) then
    raise exception 'PLANEACION_VALIDACION_FALLIDA:%', v_preview::text;
  end if;

  v_scope_key := p_cuenta_cliente_id::text || ':' || to_char(v_mes, 'YYYY-MM');
  select version into v_current_version from public.ui_change_version
  where module = 'asignaciones' and surface = 'planeacion_mensual'
    and scope_key = v_scope_key and role_target = 'ALL';
  v_current_version := coalesce(v_current_version, 0);
  if coalesce(p_version_base, 0) <> v_current_version then
    raise exception 'PLANEACION_VERSION_CONFLICT:%:%', p_version_base, v_current_version;
  end if;

  if v_existing.id is not null then
    v_lote_id := v_existing.id;
    delete from public.planeacion_cambio_operacion where lote_id = v_lote_id;
    update public.planeacion_cambio_lote set estado = 'VALIDADO', version_base = v_current_version,
      resumen_impacto = v_preview, updated_at = now() where id = v_lote_id;
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
    v_tipo := upper(trim(v_op ->> 'tipoOperacion'));
    v_payload := coalesce(v_op -> 'payload', '{}'::jsonb);
    v_empleado_id := nullif(v_op ->> 'empleadoId', '')::uuid;
    v_pdv_origen_id := nullif(v_op ->> 'pdvOrigenId', '')::uuid;
    v_pdv_destino_id := nullif(v_op ->> 'pdvDestinoId', '')::uuid;
    v_fecha_inicio := (v_op ->> 'fechaInicio')::date;
    v_fecha_fin := nullif(v_op ->> 'fechaFin', '')::date;
    v_motivo := trim(v_op ->> 'motivo');

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
      where a.cuenta_cliente_id = p_cuenta_cliente_id and a.empleado_id = v_empleado_id
        and a.pdv_id = v_pdv_origen_id and a.estado_publicacion = 'PUBLICADA'
        and a.fecha_inicio >= v_fecha_inicio
        and (nullif(v_payload ->> 'asignacionId', '') is null
          or a.id = (v_payload ->> 'asignacionId')::uuid);
      update public.asignacion a set fecha_fin = v_fecha_inicio - 1,
        observaciones = concat_ws(' | ', nullif(a.observaciones, ''), '[PLANEACION] ' || v_motivo),
        updated_at = now()
      where a.cuenta_cliente_id = p_cuenta_cliente_id and a.empleado_id = v_empleado_id
        and a.pdv_id = v_pdv_origen_id and a.estado_publicacion = 'PUBLICADA'
        and a.fecha_inicio < v_fecha_inicio
        and coalesce(a.fecha_fin, '9999-12-31'::date) >= v_fecha_inicio
        and (nullif(v_payload ->> 'asignacionId', '') is null
          or a.id = (v_payload ->> 'asignacionId')::uuid);
    end if;

    if v_tipo in ('ASIGNAR_DC', 'MOVER_DC') then
      v_naturaleza := upper(coalesce(v_payload ->> 'naturaleza', 'COBERTURA_PERMANENTE'));
      v_tipo_asignacion := upper(coalesce(v_payload ->> 'tipo',
        case when v_naturaleza = 'BASE' then 'FIJA' else 'COBERTURA' end));
      v_prioridad := case v_naturaleza when 'COBERTURA_TEMPORAL' then 200
        when 'COBERTURA_PERMANENTE' then 150 else 100 end;
      v_factor := coalesce(nullif(v_payload ->> 'factorTiempo', '')::numeric,
        case when v_tipo_asignacion = 'ROTATIVA' then 0.5 else 1 end);
      select sp.empleado_id into v_supervisor_id from public.supervisor_pdv sp
      where sp.pdv_id = v_pdv_destino_id and sp.activo and sp.fecha_inicio <= v_fecha_inicio
        and (sp.fecha_fin is null or sp.fecha_fin >= v_fecha_inicio)
      order by sp.fecha_inicio desc, sp.created_at desc limit 1;

      v_effective_dias_laborales := coalesce(
        nullif(v_payload ->> 'diasLaborales', ''),
        case
          when nullif(v_payload ->> 'diaDescanso', '') is not null then
            array_to_string(
              array_remove(
                array['LUN','MAR','MIE','JUE','VIE','SAB','DOM'],
                upper(left(regexp_replace(v_payload ->> 'diaDescanso', '\s+', '', 'g'), 3))
              ),
              ','
            )
          else 'LUN-SAB'
        end
      );

      insert into public.asignacion (
        cuenta_cliente_id, empleado_id, pdv_id, supervisor_empleado_id,
        tipo, factor_tiempo, dias_laborales, dia_descanso, horario_referencia,
        fecha_inicio, fecha_fin, naturaleza, retorna_a_base, prioridad,
        motivo_movimiento, observaciones, generado_automaticamente, estado_publicacion
      ) values (
        p_cuenta_cliente_id, v_empleado_id, v_pdv_destino_id, v_supervisor_id,
        v_tipo_asignacion, v_factor, v_effective_dias_laborales,
        nullif(v_payload ->> 'diaDescanso', ''), nullif(v_payload ->> 'horarioReferencia', ''),
        v_fecha_inicio, v_fecha_fin, v_naturaleza, v_naturaleza = 'COBERTURA_TEMPORAL',
        v_prioridad, v_motivo, '[PLANEACION MENSUAL] ' || v_motivo, false, 'PUBLICADA'
      );
    elsif v_tipo = 'CAMBIAR_ROTACION' then
      select rotation.naturaleza, rotation.factor_tiempo, rotation.grupo_rotacion,
        rotation.grupo_tamano, rotation.slot_rotacion, rotation.vigente_hasta
      into v_prior_naturaleza, v_prior_factor, v_prior_grupo,
        v_prior_grupo_tamano, v_prior_slot, v_prior_vigente_hasta
      from public.pdv_rotacion_vigencia rotation
      where rotation.cuenta_cliente_id = p_cuenta_cliente_id
        and rotation.pdv_id = v_pdv_origen_id
        and rotation.vigente_desde <= v_fecha_inicio
        and coalesce(rotation.vigente_hasta, '9999-12-31'::date) >= v_fecha_inicio
      order by rotation.vigente_desde desc, rotation.created_at desc
      limit 1;
      v_has_prior := found;

      update public.pdv_rotacion_vigencia set vigente_hasta = v_fecha_inicio - 1, updated_at = now()
      where cuenta_cliente_id = p_cuenta_cliente_id and pdv_id = v_pdv_origen_id
        and vigente_desde < v_fecha_inicio
        and coalesce(vigente_hasta, '9999-12-31'::date) >= v_fecha_inicio;
      delete from public.pdv_rotacion_vigencia
      where cuenta_cliente_id = p_cuenta_cliente_id and pdv_id = v_pdv_origen_id
        and vigente_desde >= v_fecha_inicio and vigente_desde <= coalesce(v_fecha_fin, '9999-12-31'::date);
      insert into public.pdv_rotacion_vigencia (
        cuenta_cliente_id, pdv_id, naturaleza, factor_tiempo, grupo_rotacion, grupo_tamano, slot_rotacion,
        vigente_desde, vigente_hasta, motivo, creado_por_usuario_id, metadata
      ) values (
        p_cuenta_cliente_id, v_pdv_origen_id,
        case upper(v_payload ->> 'tipo') when 'ROTATIVA' then 'ROTATIVA' else 'FIJA' end,
        case upper(v_payload ->> 'tipo') when 'ROTATIVA' then 0.5 else 1 end,
        case when upper(v_payload ->> 'tipo') = 'ROTATIVA' then nullif(v_payload ->> 'grupoRotacion', '') end,
        case when upper(v_payload ->> 'tipo') = 'ROTATIVA' then (v_payload ->> 'grupoTamano')::smallint end,
        case when upper(v_payload ->> 'tipo') = 'ROTATIVA' then upper(v_payload ->> 'slotRotacion') end,
        v_fecha_inicio, v_fecha_fin,
        v_motivo, p_usuario_id, jsonb_build_object('loteId', v_lote_id)
      );
      if v_fecha_fin is not null and v_has_prior
         and (v_prior_vigente_hasta is null or v_prior_vigente_hasta > v_fecha_fin) then
        insert into public.pdv_rotacion_vigencia (
          cuenta_cliente_id, pdv_id, naturaleza, factor_tiempo, grupo_rotacion,
          grupo_tamano, slot_rotacion, vigente_desde, vigente_hasta, motivo,
          creado_por_usuario_id, metadata
        ) values (
          p_cuenta_cliente_id, v_pdv_origen_id, v_prior_naturaleza, v_prior_factor,
          v_prior_grupo, v_prior_grupo_tamano, v_prior_slot, v_fecha_fin + 1,
          v_prior_vigente_hasta, 'RESTAURACION: ' || v_motivo, p_usuario_id,
          jsonb_build_object('loteId', v_lote_id, 'restauracion', true)
        );
      end if;
      perform public.planeacion_versionar_asignaciones_pdv(
        p_cuenta_cliente_id, v_pdv_origen_id, null, v_fecha_inicio, v_fecha_fin,
        case upper(v_payload ->> 'tipo') when 'ROTATIVA' then 'ROTATIVA' else 'FIJA' end,
        case upper(v_payload ->> 'tipo') when 'ROTATIVA' then 0.5 else 1 end,
        null, null, null, v_motivo
      );
      if v_fecha_inicio <= current_date then
        perform public.aplicar_pdv_rotaciones_vigentes(current_date);
      end if;
    elsif v_tipo = 'CAMBIAR_HORARIO' then
      perform public.planeacion_versionar_asignaciones_pdv(
        p_cuenta_cliente_id, v_pdv_origen_id, v_empleado_id, v_fecha_inicio, v_fecha_fin,
        null, null, nullif(v_payload ->> 'horarioReferencia', ''), null, null, v_motivo
      );
    elsif v_tipo = 'CAMBIAR_DESCANSO' then
      perform public.planeacion_versionar_asignaciones_pdv(
        p_cuenta_cliente_id, v_pdv_origen_id, v_empleado_id, v_fecha_inicio, v_fecha_fin,
        null, null, null, nullif(v_payload ->> 'diaDescanso', ''), null, v_motivo
      );
    elsif v_tipo = 'CAMBIAR_ESTADO_PDV' then
      select state.estado, state.vigente_hasta
      into v_prior_estado, v_prior_vigente_hasta
      from public.pdv_estado_vigencia state
      where state.cuenta_cliente_id = p_cuenta_cliente_id
        and state.pdv_id = v_pdv_origen_id
        and state.vigente_desde <= v_fecha_inicio
        and coalesce(state.vigente_hasta, '9999-12-31'::date) >= v_fecha_inicio
      order by state.vigente_desde desc, state.created_at desc
      limit 1;
      v_has_prior := found;

      update public.pdv_estado_vigencia set vigente_hasta = v_fecha_inicio - 1, updated_at = now()
      where cuenta_cliente_id = p_cuenta_cliente_id and pdv_id = v_pdv_origen_id
        and vigente_desde < v_fecha_inicio
        and coalesce(vigente_hasta, '9999-12-31'::date) >= v_fecha_inicio;
      delete from public.pdv_estado_vigencia
      where cuenta_cliente_id = p_cuenta_cliente_id and pdv_id = v_pdv_origen_id
        and vigente_desde >= v_fecha_inicio and vigente_desde <= coalesce(v_fecha_fin, '9999-12-31'::date);
      insert into public.pdv_estado_vigencia (
        cuenta_cliente_id, pdv_id, estado, vigente_desde, vigente_hasta,
        motivo, creado_por_usuario_id, metadata
      ) values (
        p_cuenta_cliente_id, v_pdv_origen_id, upper(v_payload ->> 'estadoPdv'),
        v_fecha_inicio, v_fecha_fin, v_motivo, p_usuario_id,
        jsonb_build_object('loteId', v_lote_id)
      );
      if v_fecha_fin is not null and v_has_prior
         and (v_prior_vigente_hasta is null or v_prior_vigente_hasta > v_fecha_fin) then
        insert into public.pdv_estado_vigencia (
          cuenta_cliente_id, pdv_id, estado, vigente_desde, vigente_hasta,
          motivo, creado_por_usuario_id, metadata
        ) values (
          p_cuenta_cliente_id, v_pdv_origen_id, v_prior_estado, v_fecha_fin + 1,
          v_prior_vigente_hasta, 'RESTAURACION: ' || v_motivo, p_usuario_id,
          jsonb_build_object('loteId', v_lote_id, 'restauracion', true)
        );
      end if;
      if v_fecha_inicio <= current_date then
        update public.pdv set estatus = case upper(v_payload ->> 'estadoPdv')
          when 'PAUSADO' then 'TEMPORAL' else upper(v_payload ->> 'estadoPdv') end,
          updated_at = now() where id = v_pdv_origen_id;
      end if;
      insert into public.asignacion_diaria_dirty_queue (empleado_id, fecha_inicio, fecha_fin, motivo, payload)
      select distinct a.empleado_id, v_fecha_inicio, least(coalesce(v_fecha_fin, v_mes_fin), v_mes_fin),
        'PLANEACION_ESTADO_PDV', jsonb_build_object('pdvId', v_pdv_origen_id, 'loteId', v_lote_id)
      from public.asignacion a
      where a.cuenta_cliente_id = p_cuenta_cliente_id and a.pdv_id = v_pdv_origen_id
        and a.estado_publicacion = 'PUBLICADA'
        and a.fecha_inicio <= coalesce(v_fecha_fin, v_mes_fin)
        and coalesce(a.fecha_fin, v_mes_fin) >= v_fecha_inicio;
    elsif v_tipo = 'AGREGAR_EVENTO' then
      select e.supervisor_empleado_id into v_supervisor_id
      from public.empleado e where e.id = v_empleado_id;
      insert into public.formacion (
        cuenta_cliente_id, nombre, tipo, modalidad, sede, estado,
        fecha_inicio, fecha_fin, created_by, metadata
      ) values (
        p_cuenta_cliente_id, trim(v_payload ->> 'eventoNombre'),
        upper(coalesce(v_payload ->> 'eventoTipo', 'EVENTO_ESPECIAL')),
        upper(coalesce(v_payload ->> 'eventoModalidad', 'PRESENCIAL')),
        nullif(trim(v_payload ->> 'eventoSede'), ''), 'PROGRAMADA',
        v_fecha_inicio, coalesce(v_fecha_fin, v_fecha_inicio),
        p_usuario_id, jsonb_build_object('loteId', v_lote_id, 'motivo', v_motivo)
      ) returning id into v_evento_id;
      insert into public.formacion_participante (
        formacion_id, empleado_id, cuenta_cliente_id, estado, metadata
      ) values (
        v_evento_id, v_empleado_id, p_cuenta_cliente_id, 'CONFIRMADO',
        jsonb_build_object('loteId', v_lote_id)
      );
      insert into public.asignacion_diaria_dirty_queue (empleado_id, fecha_inicio, fecha_fin, motivo, payload)
      values (v_empleado_id, v_fecha_inicio, coalesce(v_fecha_fin, v_fecha_inicio),
        'PLANEACION_EVENTO', jsonb_build_object('eventoId', v_evento_id, 'loteId', v_lote_id));
    elsif v_tipo = 'REASIGNAR_SUPERVISOR' then
      v_supervisor_origen_id := nullif(v_payload ->> 'supervisorOrigenId', '')::uuid;
      v_supervisor_destino_id := nullif(v_payload ->> 'supervisorDestinoId', '')::uuid;
      if jsonb_typeof(v_payload -> 'pdvIds') = 'array' then
        select array_agg(value::text::uuid) into v_pdv_ids
        from jsonb_array_elements_text(v_payload -> 'pdvIds');
      else
        v_pdv_ids := array[v_pdv_origen_id];
      end if;
      v_pdv_ids := array_remove(v_pdv_ids, null);

      update public.supervisor_pdv set fecha_fin = v_fecha_inicio - 1, activo = false, updated_at = now()
      where cuenta_cliente_id = p_cuenta_cliente_id and pdv_id = any(v_pdv_ids)
        and empleado_id = v_supervisor_origen_id and activo
        and fecha_inicio <= v_fecha_inicio and (fecha_fin is null or fecha_fin >= v_fecha_inicio);
      delete from public.supervisor_pdv
      where cuenta_cliente_id = p_cuenta_cliente_id and pdv_id = any(v_pdv_ids)
        and empleado_id = v_supervisor_destino_id and fecha_inicio >= v_fecha_inicio;
      insert into public.supervisor_pdv (
        cuenta_cliente_id, empleado_id, pdv_id, activo, fecha_inicio, fecha_fin, observaciones
      )
      select p_cuenta_cliente_id, v_supervisor_destino_id, unnest(v_pdv_ids), true, v_fecha_inicio, null,
        '[PLANEACION MENSUAL] Reasignacion supervisor: ' || v_motivo;

      update public.asignacion set supervisor_empleado_id = v_supervisor_destino_id, updated_at = now()
      where cuenta_cliente_id = p_cuenta_cliente_id and pdv_id = any(v_pdv_ids)
        and estado_publicacion = 'PUBLICADA' and fecha_inicio >= v_fecha_inicio;
      update public.asignacion set supervisor_empleado_id = v_supervisor_destino_id, updated_at = now()
      where cuenta_cliente_id = p_cuenta_cliente_id and pdv_id = any(v_pdv_ids)
        and estado_publicacion = 'PUBLICADA' and fecha_inicio < v_fecha_inicio
        and coalesce(fecha_fin, '9999-12-31'::date) >= v_fecha_inicio;

      insert into public.asignacion_diaria_dirty_queue (empleado_id, fecha_inicio, fecha_fin, motivo, payload)
      select distinct a.empleado_id, v_fecha_inicio, least(coalesce(a.fecha_fin, v_mes_fin), v_mes_fin),
        'PLANEACION_SUPERVISOR', jsonb_build_object('pdvIds', v_pdv_ids, 'loteId', v_lote_id)
      from public.asignacion a
      where a.cuenta_cliente_id = p_cuenta_cliente_id and a.pdv_id = any(v_pdv_ids)
        and a.estado_publicacion = 'PUBLICADA' and a.fecha_inicio <= v_mes_fin
        and coalesce(a.fecha_fin, v_mes_fin) >= v_fecha_inicio;
    end if;
  end loop;

  update public.planeacion_cambio_lote
  set estado = 'PUBLICADO', version_publicada = v_current_version + 1, updated_at = now()
  where id = v_lote_id;

  insert into public.ui_change_version (module, surface, scope_key, role_target, version, updated_at)
  values ('asignaciones', 'planeacion_mensual', v_scope_key, 'ALL', v_current_version + 1, now())
  on conflict (module, surface, scope_key, role_target)
  do update set version = excluded.version, updated_at = excluded.updated_at;

  insert into public.ui_change_event (
    cuenta_cliente_id, module, surface, event_type, scope_key, role_target,
    version, payload
  ) values (
    p_cuenta_cliente_id, 'asignaciones', 'planeacion_mensual', 'planeacion_mensual_publicada',
    v_scope_key, 'ALL', v_current_version + 1,
    jsonb_build_object('loteId', v_lote_id, 'mes', to_char(v_mes, 'YYYY-MM-01'), 'operaciones', p_operaciones)
  );

  return jsonb_build_object(
    'ok', true,
    'loteId', v_lote_id,
    'version', v_current_version + 1,
    'resumenImpacto', v_preview
  );
end;
$$;

-- Actualización defensiva de registros existentes en asignacion
update public.asignacion
set dias_laborales = array_to_string(
  array_remove(
    array['LUN','MAR','MIE','JUE','VIE','SAB','DOM'],
    upper(left(regexp_replace(dia_descanso, '\s+', '', 'g'), 3))
  ),
  ','
)
where estado_publicacion = 'PUBLICADA'
  and dias_laborales = 'LUN-SAB'
  and dia_descanso is not null
  and upper(left(regexp_replace(dia_descanso, '\s+', '', 'g'), 3)) not in ('DOM', '');

-- Asegurar asignación de Jennifer Carranza en Palacio León
update public.asignacion
set dias_laborales = 'LUN,MAR,JUE,VIE,SAB,DOM'
where id = 'a6a08b7e-0afe-4119-a123-83158fe297e8';

-- Refrescar el snapshot de planeación mensual en todas las cuentas activas para septiembre de 2026
do $$
declare
  r record;
begin
  for r in select id from public.cuenta_cliente loop
    perform public.refrescar_planeacion_mensual_snapshot(r.id, '2026-09-01'::date);
  end loop;
end;
$$;
