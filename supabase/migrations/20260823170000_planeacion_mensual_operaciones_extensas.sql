-- Planeacion mensual: operaciones efectivas, eventos y sustitucion de supervisor.
-- Las mutaciones se ejecutan en una sola RPC transaccional y solo en fuentes estructurales.

alter table public.planeacion_cambio_operacion
  drop constraint if exists planeacion_cambio_operacion_tipo_operacion_check;

alter table public.planeacion_cambio_operacion
  add constraint planeacion_cambio_operacion_tipo_operacion_check
  check (
    tipo_operacion in (
      'ASIGNAR_DC', 'LIBERAR_DC', 'MOVER_DC', 'INTERCAMBIAR_DCS',
      'COBERTURA_TEMPORAL', 'COBERTURA_PERMANENTE', 'CAMBIAR_ROTACION',
      'CAMBIAR_HORARIO', 'CAMBIAR_DESCANSO', 'CAMBIAR_ESTADO_PDV',
      'AGREGAR_EVENTO', 'REASIGNAR_SUPERVISOR'
    )
  );

create table if not exists public.supervisor_reasignacion_programada (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  supervisor_origen_id uuid not null references public.empleado(id) on delete restrict,
  supervisor_destino_id uuid not null references public.empleado(id) on delete restrict,
  fecha_efectiva date not null,
  estado text not null default 'PROGRAMADA'
    check (estado in ('PROGRAMADA', 'APLICADA', 'CANCELADA')),
  pdv_ids uuid[] not null default '{}'::uuid[],
  motivo text not null,
  lote_id uuid references public.planeacion_cambio_lote(id) on delete set null,
  aplicado_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  creado_por_usuario_id uuid references public.usuario(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (supervisor_origen_id <> supervisor_destino_id),
  unique (cuenta_cliente_id, supervisor_origen_id, supervisor_destino_id, fecha_efectiva)
);

create index if not exists idx_supervisor_reasignacion_programada_fecha
  on public.supervisor_reasignacion_programada(estado, fecha_efectiva, cuenta_cliente_id);

create index if not exists idx_pdv_estado_vigencia_resolucion
  on public.pdv_estado_vigencia(pdv_id, vigente_desde desc, vigente_hasta);

create index if not exists idx_pdv_rotacion_vigencia_resolucion
  on public.pdv_rotacion_vigencia(pdv_id, vigente_desde desc, vigente_hasta);

alter table public.pdv_rotacion_vigencia
  add column if not exists grupo_tamano smallint,
  add column if not exists slot_rotacion text;

alter table public.pdv_rotacion_vigencia
  drop constraint if exists pdv_rotacion_vigencia_grupo_tamano_check,
  add constraint pdv_rotacion_vigencia_grupo_tamano_check
    check (grupo_tamano is null or grupo_tamano in (2, 3)),
  drop constraint if exists pdv_rotacion_vigencia_slot_check,
  add constraint pdv_rotacion_vigencia_slot_check
    check (slot_rotacion is null or slot_rotacion in ('A', 'B', 'C')),
  drop constraint if exists pdv_rotacion_vigencia_rotativa_completa_check,
  add constraint pdv_rotacion_vigencia_rotativa_completa_check check (
    (naturaleza = 'FIJA' and grupo_rotacion is null and grupo_tamano is null and slot_rotacion is null)
    or
    (naturaleza = 'ROTATIVA' and grupo_rotacion is not null and grupo_tamano is not null and slot_rotacion is not null)
  );

alter table public.supervisor_reasignacion_programada enable row level security;
grant select, insert, update on table public.supervisor_reasignacion_programada to service_role;
revoke all on table public.supervisor_reasignacion_programada from anon, authenticated;

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
        v_row.dias_laborales, coalesce(p_dia_descanso, v_row.dia_descanso),
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
          jsonb_build_object('restaurada_despues_de', v_change_id)
      );
    end if;

    insert into public.asignacion_diaria_dirty_queue (
      empleado_id, fecha_inicio, fecha_fin, motivo, payload
    ) values (
      v_row.empleado_id,
      v_overlap_inicio,
      least(
        coalesce(v_original_fin, v_overlap_inicio + 62),
        coalesce(p_fecha_fin, v_overlap_inicio + 62),
        v_overlap_inicio + 62
      ),
      'PLANEACION_VERSION_ASIGNACION',
      jsonb_build_object('pdvId', p_pdv_id, 'motivo', p_motivo)
    );

    empleado_id := v_row.empleado_id;
    return next;
  end loop;
end;
$$;

create or replace function public.aplicar_pdv_estados_vigentes(
  p_fecha date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with latest as (
    select distinct on (state.pdv_id)
      state.pdv_id,
      state.estado
    from public.pdv_estado_vigencia state
    where state.vigente_desde <= p_fecha
      and (state.vigente_hasta is null or state.vigente_hasta >= p_fecha)
    order by state.pdv_id, state.vigente_desde desc, state.created_at desc
  )
  update public.pdv target
  set estatus = case latest.estado when 'PAUSADO' then 'TEMPORAL' else latest.estado end,
      updated_at = now()
  from latest
  where target.id = latest.pdv_id
    and target.estatus is distinct from
      case latest.estado when 'PAUSADO' then 'TEMPORAL' else latest.estado end;
  get diagnostics v_count = row_count;
  return v_count;
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
          'supervisor_reasignacion_id', v_row.id
        ),
        updated_at = now()
    where e.puesto = 'DERMOCONSEJERO'
      and e.supervisor_empleado_id = v_row.supervisor_origen_id
      and e.estatus_laboral <> 'BAJA';

    update public.supervisor_reasignacion_programada
    set estado = 'APLICADA', aplicado_at = now(), updated_at = now()
    where id = v_row.id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.aplicar_pdv_rotaciones_vigentes(
  p_fecha date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_actual record;
  v_count integer := 0;
begin
  for v_row in
    select distinct on (rotation.pdv_id)
      rotation.*
    from public.pdv_rotacion_vigencia rotation
    where rotation.vigente_desde <= p_fecha
      and (rotation.vigente_hasta is null or rotation.vigente_hasta >= p_fecha)
    order by rotation.pdv_id, rotation.vigente_desde desc, rotation.created_at desc
  loop
    select master.* into v_actual
    from public.pdv_rotacion_maestra master
    where master.pdv_id = v_row.pdv_id and master.vigente
    order by master.updated_at desc
    limit 1;

    if found
      and v_actual.clasificacion_maestra = (
        case v_row.naturaleza when 'ROTATIVA' then 'ROTATIVO' else 'FIJO' end
      )
      and v_actual.grupo_rotacion_codigo is not distinct from v_row.grupo_rotacion
      and v_actual.grupo_tamano is not distinct from v_row.grupo_tamano
      and v_actual.slot_rotacion is not distinct from v_row.slot_rotacion then
      continue;
    end if;

    update public.pdv_rotacion_maestra
    set vigente = false, updated_at = now()
    where pdv_id = v_row.pdv_id and vigente;

    insert into public.pdv_rotacion_maestra (
      cuenta_cliente_id, pdv_id, clasificacion_maestra, grupo_rotacion_codigo,
      grupo_tamano, slot_rotacion, fuente, vigente, observaciones, metadata
    ) values (
      v_row.cuenta_cliente_id,
      v_row.pdv_id,
      case v_row.naturaleza when 'ROTATIVA' then 'ROTATIVO' else 'FIJO' end,
      v_row.grupo_rotacion,
      v_row.grupo_tamano,
      v_row.slot_rotacion,
      'IMPORTADA',
      true,
      'Actualizada por Planeación Mensual: ' || v_row.motivo,
      jsonb_build_object('source', 'planeacion_mensual', 'vigencia_id', v_row.id)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

do $$
begin
  if to_regprocedure('public.previsualizar_planeacion_mensual_asignaciones_v1(uuid,date,jsonb)') is null then
    alter function public.previsualizar_planeacion_mensual(uuid, date, jsonb)
      rename to previsualizar_planeacion_mensual_asignaciones_v1;
  end if;
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
  v_payload jsonb;
  v_tipo text;
  v_index integer := 0;
  v_fecha_inicio date;
  v_fecha_fin date;
  v_empleado_id uuid;
  v_pdv_id uuid;
  v_supervisor_origen_id uuid;
  v_supervisor_destino_id uuid;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_base_ops jsonb;
  v_base jsonb;
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
    v_tipo := upper(trim(coalesce(v_op ->> 'tipoOperacion', '')));
    v_payload := coalesce(v_op -> 'payload', '{}'::jsonb);
    begin
      v_fecha_inicio := (v_op ->> 'fechaInicio')::date;
      v_fecha_fin := nullif(v_op ->> 'fechaFin', '')::date;
      v_empleado_id := nullif(v_op ->> 'empleadoId', '')::uuid;
      v_pdv_id := nullif(coalesce(v_op ->> 'pdvOrigenId', v_op ->> 'pdvDestinoId'), '')::uuid;
      v_supervisor_origen_id := nullif(v_payload ->> 'supervisorOrigenId', '')::uuid;
      v_supervisor_destino_id := nullif(v_payload ->> 'supervisorDestinoId', '')::uuid;
    exception when others then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'CONTRATO_OPERACION_INVALIDO', 'operationIndex', v_index
      ));
      continue;
    end;

    if v_tipo not in (
      'ASIGNAR_DC', 'LIBERAR_DC', 'MOVER_DC', 'CAMBIAR_ROTACION',
      'CAMBIAR_DESCANSO', 'CAMBIAR_HORARIO', 'CAMBIAR_ESTADO_PDV',
      'AGREGAR_EVENTO', 'REASIGNAR_SUPERVISOR'
    ) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'TIPO_OPERACION_NO_SOPORTADO', 'operationIndex', v_index
      ));
    end if;
    if v_fecha_inicio is null or v_fecha_inicio < v_mes or v_fecha_inicio > v_mes_fin then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'FECHA_FUERA_DEL_MES', 'operationIndex', v_index
      ));
    end if;
    if v_fecha_fin is not null and v_fecha_fin < v_fecha_inicio then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'RANGO_INVALIDO', 'operationIndex', v_index
      ));
    end if;
    if trim(coalesce(v_op ->> 'motivo', '')) = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'MOTIVO_REQUERIDO', 'operationIndex', v_index
      ));
    end if;
    if v_tipo in ('CAMBIAR_ROTACION', 'CAMBIAR_DESCANSO', 'CAMBIAR_HORARIO', 'CAMBIAR_ESTADO_PDV')
       and (v_pdv_id is null or not exists (
         select 1 from public.cuenta_cliente_pdv ccp
         where ccp.cuenta_cliente_id = p_cuenta_cliente_id and ccp.pdv_id = v_pdv_id
       )) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'PDV_FUERA_DE_CUENTA', 'operationIndex', v_index
      ));
    end if;
    if v_tipo in ('CAMBIAR_DESCANSO', 'CAMBIAR_HORARIO', 'AGREGAR_EVENTO')
       and (v_empleado_id is null or not exists (
         select 1 from public.empleado e
         where e.id = v_empleado_id
           and e.puesto = 'DERMOCONSEJERO'
           and e.estatus_laboral <> 'BAJA'
           and (
             exists (
               select 1 from public.usuario u
               where u.empleado_id = e.id
                 and u.cuenta_cliente_id = p_cuenta_cliente_id
                 and u.estado_cuenta <> 'BAJA'
             )
             or exists (
               select 1 from public.asignacion a
               where a.empleado_id = e.id
                 and a.cuenta_cliente_id = p_cuenta_cliente_id
             )
           )
       )) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'DC_INVALIDA', 'operationIndex', v_index
      ));
    end if;
    if v_tipo = 'CAMBIAR_ROTACION'
       and upper(coalesce(v_payload ->> 'tipo', '')) not in ('FIJA', 'ROTATIVA') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'ROTACION_INVALIDA', 'operationIndex', v_index
      ));
    end if;
    if v_tipo = 'CAMBIAR_ROTACION'
       and upper(v_payload ->> 'tipo') = 'ROTATIVA'
       and trim(coalesce(v_payload ->> 'grupoRotacion', '')) = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'GRUPO_ROTACION_REQUERIDO', 'operationIndex', v_index
      ));
    end if;
    if v_tipo = 'CAMBIAR_ROTACION'
       and upper(v_payload ->> 'tipo') = 'ROTATIVA'
       and (
         coalesce(v_payload ->> 'grupoTamano', '') not in ('2', '3')
         or upper(coalesce(v_payload ->> 'slotRotacion', '')) not in ('A', 'B', 'C')
         or (v_payload ->> 'grupoTamano' = '2' and upper(v_payload ->> 'slotRotacion') = 'C')
       ) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'ROTACION_GRUPO_INCOMPLETO', 'operationIndex', v_index
      ));
    end if;
    if v_tipo = 'CAMBIAR_ESTADO_PDV'
       and upper(coalesce(v_payload ->> 'estadoPdv', '')) not in ('ACTIVO', 'PAUSADO', 'INACTIVO') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'ESTADO_PDV_INVALIDO', 'operationIndex', v_index
      ));
    end if;
    if v_tipo = 'AGREGAR_EVENTO'
       and (trim(coalesce(v_payload ->> 'eventoNombre', '')) = '' or v_fecha_fin is null) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'EVENTO_INCOMPLETO', 'operationIndex', v_index
      ));
    end if;
    if v_tipo = 'REASIGNAR_SUPERVISOR' and (
      nullif(v_payload ->> 'supervisorOrigenId', '') is null
      or nullif(v_payload ->> 'supervisorDestinoId', '') is null
      or v_payload ->> 'supervisorOrigenId' = v_payload ->> 'supervisorDestinoId'
    ) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'SUSTITUCION_SUPERVISOR_INVALIDA', 'operationIndex', v_index
      ));
    end if;
    if v_tipo = 'REASIGNAR_SUPERVISOR' and not exists (
      select 1
      from public.supervisor_pdv sp
      join public.cuenta_cliente_pdv ccp on ccp.pdv_id = sp.pdv_id
      where sp.empleado_id = v_supervisor_origen_id
        and ccp.cuenta_cliente_id = p_cuenta_cliente_id
        and sp.activo
    ) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'SUPERVISOR_ORIGEN_FUERA_DE_CUENTA', 'operationIndex', v_index
      ));
    end if;
    if v_tipo = 'REASIGNAR_SUPERVISOR' and not exists (
      select 1
      from public.empleado e
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
              and sp.activo
          )
        )
    ) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'SUPERVISOR_DESTINO_FUERA_DE_CUENTA', 'operationIndex', v_index
      ));
    end if;
    if v_tipo = 'LIBERAR_DC' then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'code', 'PDV_LIBRE_POR_CAMBIO', 'operationIndex', v_index,
        'pdvId', v_op ->> 'pdvOrigenId', 'fechaInicio', v_fecha_inicio
      ));
    end if;
  end loop;

  select coalesce(jsonb_agg(value), '[]'::jsonb)
  into v_base_ops
  from jsonb_array_elements(p_operaciones)
  where upper(value ->> 'tipoOperacion') in ('ASIGNAR_DC', 'LIBERAR_DC', 'MOVER_DC');

  if jsonb_array_length(v_base_ops) > 0 then
    v_base := public.previsualizar_planeacion_mensual_asignaciones_v1(
      p_cuenta_cliente_id, p_mes, v_base_ops
    );
    v_errors := v_errors || coalesce(v_base -> 'errors', '[]'::jsonb);
    v_warnings := v_warnings || coalesce(v_base -> 'warnings', '[]'::jsonb);
  else
    v_base := jsonb_build_object('conflicts', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'mes', v_mes,
    'errors', v_errors,
    'warnings', v_warnings,
    'conflicts', coalesce(v_base -> 'conflicts', '[]'::jsonb),
    'impact', jsonb_build_object(
      'operations', jsonb_array_length(p_operaciones),
      'employees', (
        select count(distinct nullif(value ->> 'empleadoId', ''))
        from jsonb_array_elements(p_operaciones)
      ),
      'pdvs', (
        select count(distinct pdv_id) from (
          select nullif(value ->> 'pdvOrigenId', '') pdv_id from jsonb_array_elements(p_operaciones)
          union
          select nullif(value ->> 'pdvDestinoId', '') from jsonb_array_elements(p_operaciones)
        ) scoped where pdv_id is not null
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
        v_tipo_asignacion, v_factor, coalesce(nullif(v_payload ->> 'diasLaborales', ''), 'LUN-SAB'),
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

revoke all on function public.planeacion_versionar_asignaciones_pdv(
  uuid, uuid, uuid, date, date, text, numeric, text, text, uuid, text
) from public, anon, authenticated;
revoke all on function public.aplicar_supervisor_reasignaciones_vigentes(date)
  from public, anon, authenticated;
revoke all on function public.aplicar_pdv_estados_vigentes(date)
  from public, anon, authenticated;
revoke all on function public.aplicar_pdv_rotaciones_vigentes(date)
  from public, anon, authenticated;
revoke all on function public.previsualizar_planeacion_mensual(uuid, date, jsonb)
  from public, anon, authenticated;
revoke all on function public.aplicar_planeacion_mensual(uuid, date, text, bigint, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.previsualizar_planeacion_mensual(uuid, date, jsonb) to service_role;
grant execute on function public.aplicar_planeacion_mensual(uuid, date, text, bigint, jsonb, uuid)
  to service_role;
grant execute on function public.aplicar_supervisor_reasignaciones_vigentes(date) to service_role;
grant execute on function public.aplicar_pdv_estados_vigentes(date) to service_role;
grant execute on function public.aplicar_pdv_rotaciones_vigentes(date) to service_role;
