-- Migración: 20261005130000_restaurar_aplicar_planeacion_mensual_estable.sql
-- Propósito:
--   La migración 20260921120000 reescribió aplicar_planeacion_mensual desde cero y dejó
--   referencias a objetos que no existen en la base:
--     * tabla public.ui_change_event (no existe)
--     * tablas public.formacion / public.formacion_participante (la real es formacion_evento)
--     * columnas supervisor_pdv.cuenta_cliente_id / supervisor_pdv.observaciones (no existen)
--   y perdió comportamiento de la versión estable: touch_ui_change_version, publicado_at,
--   planeacion_evento_outbox, audit_log, cola diaria por empleado y la llave 'preview'
--   que consume planeacionMensualService.ts.
--
--   Esta migración restaura la versión estable (20260823170000) y conserva solo la corrección
--   legítima de 20260921120000: derivar dias_laborales a partir de diaDescanso cuando no se
--   envían explícitamente. Además registra version_publicada en planeacion_cambio_lote.

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
  v_prior_estado text;
  v_prior_naturaleza text;
  v_prior_factor numeric(6,3);
  v_prior_grupo text;
  v_prior_grupo_tamano smallint;
  v_prior_slot text;
  v_prior_vigente_hasta date;
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
      insert into public.asignacion (
        cuenta_cliente_id, empleado_id, pdv_id, supervisor_empleado_id,
        tipo, factor_tiempo, dias_laborales, dia_descanso, horario_referencia,
        fecha_inicio, fecha_fin, naturaleza, retorna_a_base, prioridad,
        motivo_movimiento, observaciones, generado_automaticamente, estado_publicacion
      ) values (
        p_cuenta_cliente_id, v_empleado_id, v_pdv_destino_id, v_supervisor_id,
        v_tipo_asignacion, v_factor,
        coalesce(
          nullif(v_payload ->> 'diasLaborales', ''),
          case
            when nullif(v_payload ->> 'diaDescanso', '') is not null then
              array_to_string(
                array_remove(
                  array['LUN','MAR','MIE','JUE','VIE','SAB','DOM'],
                  translate(upper(left(regexp_replace(v_payload ->> 'diaDescanso', '\s+', '', 'g'), 3)), 'ÁÉÍÓÚ', 'AEIOU')
                ),
                ','
              )
            else 'LUN-SAB'
          end
        ),
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
      insert into public.formacion_evento (
        cuenta_cliente_id, nombre, descripcion, sede, ciudad, tipo,
        responsable_empleado_id, fecha_inicio, fecha_fin, estado,
        participantes, metadata, created_by_usuario_id, updated_by_usuario_id
      ) select
        p_cuenta_cliente_id, trim(v_payload ->> 'eventoNombre'), v_motivo,
        coalesce(nullif(v_payload ->> 'eventoSede', ''), 'Evento operativo'), null,
        case upper(coalesce(v_payload ->> 'eventoTipo', 'FORMACION'))
          when 'ISDINIZACION' then 'ISDINIZACION'
          when 'ACTIVACION' then 'ACTIVACION'
          when 'EVENTO_ESPECIAL' then 'EVENTO_ESPECIAL'
          else 'FORMACION' end,
        v_supervisor_id, v_fecha_inicio, v_fecha_fin, 'PROGRAMADA',
        jsonb_build_array(jsonb_build_object(
          'empleado_id', e.id, 'nombre', e.nombre_completo, 'puesto', e.puesto,
          'rol', e.puesto, 'notificado', false, 'confirmado', true, 'estado', 'CONFIRMADO'
        )),
        jsonb_build_object(
          'targeting_mode', 'LEGACY_PARTICIPANTS',
          'event_type', case when upper(v_payload ->> 'eventoTipo') = 'ISDINIZACION'
            then 'ISDINIZACION' else 'FORMACION' end,
          'modality', coalesce(v_payload ->> 'eventoModalidad', 'PRESENCIAL'),
          'operation_date', v_fecha_inicio,
          'schedule_start', nullif(v_payload ->> 'horarioReferencia', ''),
          'planeacion_lote_id', v_lote_id,
          'evento_operativo_tipo', coalesce(v_payload ->> 'eventoTipo', 'FORMACION')
        ), p_usuario_id, p_usuario_id
      from public.empleado e where e.id = v_empleado_id
      returning id into v_evento_id;
    elsif v_tipo = 'REASIGNAR_SUPERVISOR' then
      v_supervisor_origen_id := (v_payload ->> 'supervisorOrigenId')::uuid;
      v_supervisor_destino_id := (v_payload ->> 'supervisorDestinoId')::uuid;
      select coalesce(array_agg(distinct sp.pdv_id), '{}'::uuid[]) into v_pdv_ids
      from public.supervisor_pdv sp
      join public.cuenta_cliente_pdv ccp on ccp.pdv_id = sp.pdv_id
        and ccp.cuenta_cliente_id = p_cuenta_cliente_id
      where sp.empleado_id = v_supervisor_origen_id and sp.activo
        and sp.fecha_inicio <= coalesce(v_fecha_fin, '9999-12-31'::date)
        and coalesce(sp.fecha_fin, '9999-12-31'::date) >= v_fecha_inicio;

      update public.supervisor_pdv set fecha_fin = v_fecha_inicio - 1, updated_at = now()
      where empleado_id = v_supervisor_origen_id and pdv_id = any(v_pdv_ids)
        and fecha_inicio < v_fecha_inicio
        and coalesce(fecha_fin, '9999-12-31'::date) >= v_fecha_inicio;
      update public.supervisor_pdv set activo = false, updated_at = now()
      where empleado_id = v_supervisor_origen_id and pdv_id = any(v_pdv_ids)
        and fecha_inicio >= v_fecha_inicio;
      insert into public.supervisor_pdv (pdv_id, empleado_id, activo, fecha_inicio, fecha_fin)
      select unnest(v_pdv_ids), v_supervisor_destino_id, true, v_fecha_inicio, v_fecha_fin
      on conflict (pdv_id, empleado_id, fecha_inicio) do update
        set activo = true, fecha_fin = excluded.fecha_fin, updated_at = now();

      foreach v_pdv_origen_id in array v_pdv_ids loop
        perform public.planeacion_versionar_asignaciones_pdv(
          p_cuenta_cliente_id, v_pdv_origen_id, null, v_fecha_inicio, v_fecha_fin,
          null, null, null, null, v_supervisor_destino_id, v_motivo
        );
      end loop;

      insert into public.supervisor_reasignacion_programada (
        cuenta_cliente_id, supervisor_origen_id, supervisor_destino_id,
        fecha_efectiva, pdv_ids, motivo, lote_id, creado_por_usuario_id, metadata
      ) values (
        p_cuenta_cliente_id, v_supervisor_origen_id, v_supervisor_destino_id,
        v_fecha_inicio, v_pdv_ids, v_motivo, v_lote_id, p_usuario_id,
        jsonb_build_object('propaga', jsonb_build_array(
          'APP_MOVIL', 'CAPTURA_PUBLICA', 'LOVE_ISDIN', 'PRODUCTOS', 'CANJES', 'REPORTES'
        ))
      ) on conflict (cuenta_cliente_id, supervisor_origen_id, supervisor_destino_id, fecha_efectiva)
        do update set pdv_ids = excluded.pdv_ids, motivo = excluded.motivo,
          lote_id = excluded.lote_id, estado = 'PROGRAMADA', updated_at = now();
      perform public.aplicar_supervisor_reasignaciones_vigentes(current_date);
    end if;

    if v_empleado_id is not null then
      insert into public.asignacion_diaria_dirty_queue (
        empleado_id, fecha_inicio, fecha_fin, motivo, payload
      ) values (
        v_empleado_id, v_fecha_inicio, least(coalesce(v_fecha_fin, v_mes_fin), v_mes_fin),
        'PLANEACION_MENSUAL', jsonb_build_object(
          'loteId', v_lote_id, 'tipoOperacion', v_tipo, 'eventoId', v_evento_id
        )
      );
    end if;
  end loop;

  perform public.touch_ui_change_version(
    p_cuenta_cliente_id, 'asignaciones', 'planeacion_mensual', v_scope_key,
    'ALL', null, null, 'planeacion_mensual_publicada',
    jsonb_build_object('loteId', v_lote_id, 'mes', v_mes)
  );
  select version into v_current_version from public.ui_change_version
  where module = 'asignaciones' and surface = 'planeacion_mensual'
    and scope_key = v_scope_key and role_target = 'ALL';

  update public.planeacion_cambio_lote set estado = 'PUBLICADO',
    publicado_por_usuario_id = p_usuario_id, publicado_at = now(),
    version_publicada = v_current_version,
    resumen_impacto = v_preview || jsonb_build_object('version', v_current_version),
    updated_at = now() where id = v_lote_id;
  insert into public.planeacion_evento_outbox (
    cuenta_cliente_id, lote_id, evento, mes, payload
  ) values (
    p_cuenta_cliente_id, v_lote_id, 'PLANEACION_MENSUAL_PUBLICADA', v_mes,
    jsonb_build_object('version', v_current_version, 'operations', jsonb_array_length(p_operaciones))
  );
  insert into public.audit_log (tabla, registro_id, accion, payload, usuario_id, cuenta_cliente_id)
  values (
    'planeacion_cambio_lote', v_lote_id::text, 'EVENTO',
    jsonb_build_object('evento', 'planeacion_mensual_publicada', 'mes', v_mes,
      'version', v_current_version, 'operaciones', jsonb_array_length(p_operaciones)),
    p_usuario_id, p_cuenta_cliente_id
  );

  return jsonb_build_object(
    'ok', true, 'idempotent', false, 'loteId', v_lote_id,
    'version', v_current_version, 'preview', v_preview
  );
end;
$$;

revoke all on function public.aplicar_planeacion_mensual(uuid, date, text, bigint, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.aplicar_planeacion_mensual(uuid, date, text, bigint, jsonb, uuid)
  to service_role;
