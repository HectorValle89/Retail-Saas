-- Migración: 20261005100000_permitir_liberar_dc_promovidos_y_cascada_puesto.sql
-- Propósito:
-- 1. Permitir que la operación LIBERAR_DC en planeación mensual no sea rechazada con DC_INVALIDA
--    cuando el empleado asignado a la tienda ya fue promovido a SUPERVISOR u otro rol administrativo.
-- 2. Disparador automático (trigger) en public.empleado: al cambiar el puesto de DERMOCONSEJERO
--    a otro puesto (ascenso/promoción), desvincular automáticamente sus asignaciones de tienda
--    vigentes y futuras, limpiando el calendario y refrescando el snapshot mensual.
-- 3. Liberar y refrescar de inmediato la tienda S Pablo Aragón para Ángel Uriel Alanís Alarcón en octubre 2026.

-- 1. Actualizar validador de planeación mensual de asignaciones para LIBERAR_DC
create or replace function public.previsualizar_planeacion_mensual_asignaciones_v1(
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
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_op jsonb;
  v_index integer := 0;
  v_tipo text;
  v_empleado_id uuid;
  v_pdv_origen_id uuid;
  v_pdv_destino_id uuid;
  v_fecha_inicio date;
  v_fecha_fin date;
  v_naturaleza text;
begin
  if p_operaciones is null or jsonb_typeof(p_operaciones) <> 'array' then
    return jsonb_build_object(
      'ok', false,
      'mes', v_mes,
      'errors', jsonb_build_array(jsonb_build_object('code', 'OPERACIONES_INVALIDAS')),
      'warnings', '[]'::jsonb,
      'conflicts', '[]'::jsonb
    );
  end if;

  for v_op in select value from jsonb_array_elements(p_operaciones)
  loop
    v_index := v_index + 1;
    v_tipo := upper(trim(coalesce(v_op ->> 'tipoOperacion', v_op ->> 'tipo_operacion', '')));
    v_empleado_id := nullif(coalesce(v_op ->> 'empleadoId', v_op ->> 'empleado_id', ''), '')::uuid;
    v_pdv_origen_id := nullif(coalesce(v_op ->> 'pdvOrigenId', v_op ->> 'pdv_origen_id', ''), '')::uuid;
    v_pdv_destino_id := nullif(coalesce(v_op ->> 'pdvDestinoId', v_op ->> 'pdv_destino_id', ''), '')::uuid;

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

    -- Si se asigna o mueve una DC, debe tener puesto DERMOCONSEJERO.
    -- Si se libera la tienda (LIBERAR_DC), solo verificamos que el colaborador exista (si viene especificado),
    -- sin exigir que siga siendo DC (pudo ser promovido a supervisor/coordinador o administrativamente reclasificado).
    if v_tipo in ('ASIGNAR_DC', 'MOVER_DC') then
      if v_empleado_id is null or not exists (
        select 1 from public.empleado e
        where e.id = v_empleado_id and e.puesto = 'DERMOCONSEJERO'
      ) then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'DC_INVALIDA', 'operationIndex', v_index
        ));
      end if;
    elsif v_tipo = 'LIBERAR_DC' then
      if v_empleado_id is not null and not exists (
        select 1 from public.empleado e
        where e.id = v_empleado_id
      ) then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'DC_INVALIDA', 'operationIndex', v_index
        ));
      end if;
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
      nullif(coalesce(value ->> 'empleadoId', value ->> 'empleado_id', ''), '')::uuid as empleado_id,
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
      and a.empleado_id in (select empleado_id from ops where empleado_id is not null)
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
        select count(distinct nullif(coalesce(value ->> 'empleadoId', value ->> 'empleado_id'), ''))
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

-- 2. Trigger en public.empleado para cascada automática cuando un DC cambia de puesto
create or replace function public.fn_sincronizar_cambio_puesto_empleado()
returns trigger
language plpgsql
security definer
as $$
declare
  v_fecha_efectiva date := current_date;
  v_cuenta_id uuid;
  v_pdv_ids uuid[];
  v_mes date := date_trunc('month', current_date)::date;
begin
  if old.puesto = 'DERMOCONSEJERO' and new.puesto <> 'DERMOCONSEJERO' then
    -- a) Recopilar PDVs y cuenta donde el colaborador tenía asignaciones activas de DC
    select array_agg(distinct pdv_id), (array_agg(distinct cuenta_cliente_id))[1]
    into v_pdv_ids, v_cuenta_id
    from public.asignacion
    where empleado_id = new.id
      and estado_publicacion = 'PUBLICADA'
      and (fecha_fin is null or fecha_fin >= v_fecha_efectiva);

    if v_cuenta_id is null and v_pdv_ids is not null and cardinality(v_pdv_ids) > 0 then
      select cuenta_cliente_id into v_cuenta_id
      from public.cuenta_cliente_pdv
      where pdv_id = any(v_pdv_ids)
      limit 1;
    end if;

    -- b) Marcar BORRADOR las asignaciones que iniciaban en o después de la fecha efectiva
    update public.asignacion
    set
      estado_publicacion = 'BORRADOR',
      observaciones = concat_ws(' | ', nullif(observaciones, ''), '[PROMOCION] Desvinculada por ascenso a ' || new.puesto),
      updated_at = now()
    where empleado_id = new.id
      and estado_publicacion = 'PUBLICADA'
      and fecha_inicio >= v_fecha_efectiva;

    -- c) Acotar fecha_fin = v_fecha_efectiva - 1 para asignaciones que iniciaron antes pero terminan después
    update public.asignacion
    set
      fecha_fin = v_fecha_efectiva - 1,
      observaciones = concat_ws(' | ', nullif(observaciones, ''), '[PROMOCION] Concluida por ascenso a ' || new.puesto),
      updated_at = now()
    where empleado_id = new.id
      and estado_publicacion = 'PUBLICADA'
      and fecha_inicio < v_fecha_efectiva
      and (fecha_fin is null or fecha_fin >= v_fecha_efectiva);

    -- d) Limpiar asignacion_diaria_resuelta para este empleado desde v_fecha_efectiva
    delete from public.asignacion_diaria_resuelta
    where empleado_id = new.id
      and fecha >= v_fecha_efectiva;

    -- e) Limpiar cuotas asignadas al empleado como DC desde v_fecha_efectiva
    delete from public.cuota_asignacion_diaria_dc
    where empleado_id = new.id
      and fecha >= v_fecha_efectiva;

    -- f) Encolar en dirty queue para recalcular días
    insert into public.asignacion_diaria_dirty_queue (
      empleado_id, fecha_inicio, fecha_fin, motivo, payload
    ) values (
      new.id,
      v_fecha_efectiva,
      (date_trunc('month', v_fecha_efectiva) + interval '1 month - 1 day')::date,
      'PROMOCION_PUESTO',
      jsonb_build_object('puestoAnterior', old.puesto, 'nuevoPuesto', new.puesto)
    );

    -- g) Refrescar snapshot de planeación mensual para los PDVs afectados
    if v_cuenta_id is not null and v_pdv_ids is not null and cardinality(v_pdv_ids) > 0 then
      perform public.refrescar_planeacion_mensual_snapshot(
        v_cuenta_id,
        v_mes,
        v_pdv_ids
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_empleado_cambio_puesto_liberar_dc on public.empleado;
create trigger trg_empleado_cambio_puesto_liberar_dc
after update of puesto on public.empleado
for each row
when (old.puesto is distinct from new.puesto)
execute function public.fn_sincronizar_cambio_puesto_empleado();

-- 3. Caso actual: Desvincular de inmediato a Ángel Uriel Alanís Alarcón de S Pablo Aragón en octubre 2026
do $$
declare
  v_angel_id uuid := '0f4ea589-acbb-444a-bc48-1c48e4c6757b';
  v_cuenta_id uuid := '92f26bb8-3d4b-4c24-a47d-c607cf6ad7ba';
  v_pdv_aragon_id uuid := '9c88afb9-4a0f-4565-bfce-d60641bf4f89';
begin
  -- Marcar como BORRADOR con nota de promoción las asignaciones de DC de Ángel Uriel en octubre 2026
  update public.asignacion
  set
    estado_publicacion = 'BORRADOR',
    observaciones = concat_ws(' | ', nullif(observaciones, ''), '[PROMOCION] Desvinculada por ascenso a SUPERVISOR'),
    updated_at = now()
  where empleado_id = v_angel_id
    and pdv_id = v_pdv_aragon_id
    and fecha_inicio >= '2026-10-01'::date;

  -- Eliminar de asignacion_diaria_resuelta para Ángel Uriel en octubre
  delete from public.asignacion_diaria_resuelta
  where empleado_id = v_angel_id
    and pdv_id = v_pdv_aragon_id
    and fecha >= '2026-10-01'::date;

  -- Encolar en dirty queue
  insert into public.asignacion_diaria_dirty_queue (
    empleado_id, fecha_inicio, fecha_fin, motivo, payload
  ) values (
    v_angel_id,
    '2026-10-01'::date,
    '2026-10-31'::date,
    'PROMOCION_PUESTO_MANUAL',
    jsonb_build_object('motivo', 'Desvinculacion Angel Uriel de S Pablo Aragon por ascenso a SUPERVISOR')
  );

  -- Refrescar el snapshot de planeación mensual para S Pablo Aragón en octubre 2026
  perform public.refrescar_planeacion_mensual_snapshot(
    v_cuenta_id,
    '2026-10-01'::date,
    array[v_pdv_aragon_id]
  );
end;
$$;
