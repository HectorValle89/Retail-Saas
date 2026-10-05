begin;

create table if not exists public.ruta_mensual_envio (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  supervisor_empleado_id uuid not null references public.empleado(id) on delete restrict,
  periodo date not null check (periodo = date_trunc('month', periodo)::date),
  estado text not null default 'PENDIENTE_COORDINACION' check (
    estado in (
      'PENDIENTE_COORDINACION',
      'APROBADA',
      'CAMBIOS_SOLICITADOS',
      'EN_PROGRESO',
      'CERRADA'
    )
  ),
  revision integer not null default 1 check (revision > 0),
  total_visitas integer not null default 0 check (total_visitas >= 0),
  total_dias_planeados integer not null default 0 check (total_dias_planeados >= 0),
  enviado_en timestamptz not null default now(),
  enviado_por_usuario_id uuid references public.usuario(id) on delete set null,
  revisado_en timestamptz,
  revisado_por_usuario_id uuid references public.usuario(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supervisor_empleado_id, periodo)
);

create index if not exists idx_ruta_mensual_envio_cuenta_periodo_estado
on public.ruta_mensual_envio(cuenta_cliente_id, periodo desc, estado);

create index if not exists idx_ruta_mensual_envio_supervisor_periodo
on public.ruta_mensual_envio(supervisor_empleado_id, periodo desc);

drop trigger if exists trg_ruta_mensual_envio_updated_at on public.ruta_mensual_envio;
create trigger trg_ruta_mensual_envio_updated_at
before update on public.ruta_mensual_envio
for each row execute function public.actualizar_updated_at();

alter table public.ruta_mensual_envio enable row level security;

drop policy if exists "ruta_mensual_envio_select_operacion" on public.ruta_mensual_envio;
create policy "ruta_mensual_envio_select_operacion"
on public.ruta_mensual_envio
for select
to authenticated
using (
  public.es_usuario_interno()
  and (
    public.es_administrador()
    or supervisor_empleado_id = public.get_my_empleado_id()
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

alter table public.ruta_semanal
add column if not exists ruta_mensual_envio_id uuid
references public.ruta_mensual_envio(id) on delete set null;

create index if not exists idx_ruta_semanal_envio_mensual
on public.ruta_semanal(ruta_mensual_envio_id)
where ruta_mensual_envio_id is not null;

alter table public.ruta_semanal_visita
add column if not exists ruta_mensual_envio_id uuid
references public.ruta_mensual_envio(id) on delete set null;

create index if not exists idx_ruta_visita_envio_mensual_fecha
on public.ruta_semanal_visita(ruta_mensual_envio_id, ruta_semanal_id, dia_semana)
where ruta_mensual_envio_id is not null;

create table if not exists public.ruta_mensual_envio_semana (
  ruta_mensual_envio_id uuid not null references public.ruta_mensual_envio(id) on delete cascade,
  ruta_semanal_id uuid not null references public.ruta_semanal(id) on delete cascade,
  semana_inicio date not null,
  created_at timestamptz not null default now(),
  primary key (ruta_mensual_envio_id, ruta_semanal_id)
);

create index if not exists idx_ruta_mensual_envio_semana_ruta
on public.ruta_mensual_envio_semana(ruta_semanal_id, ruta_mensual_envio_id);

alter table public.ruta_mensual_envio_semana enable row level security;

drop policy if exists "ruta_mensual_envio_semana_select_operacion"
on public.ruta_mensual_envio_semana;
create policy "ruta_mensual_envio_semana_select_operacion"
on public.ruta_mensual_envio_semana
for select
to authenticated
using (
  exists (
    select 1
    from public.ruta_mensual_envio envio
    where envio.id = ruta_mensual_envio_id
  )
);

create or replace function public.rpc_guardar_ruta_mensual(
  p_cuenta_cliente_id uuid,
  p_supervisor_empleado_id uuid,
  p_mes date,
  p_usuario_id uuid,
  p_visitas jsonb,
  p_revision_esperada integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_mes_fin date;
  v_envio_id uuid;
  v_revision integer;
  v_total_visitas integer;
  v_total_dias integer;
  v_rutas_afectadas integer := 0;
begin
  if p_mes is null or p_mes <> date_trunc('month', p_mes)::date then
    raise exception 'RUTA_MENSUAL_MES_INVALIDO';
  end if;

  if p_mes < date_trunc('month', v_hoy)::date then
    raise exception 'RUTA_MENSUAL_MES_PASADO';
  end if;

  if p_mes > (date_trunc('month', v_hoy) + interval '12 months')::date then
    raise exception 'RUTA_MENSUAL_FUERA_HORIZONTE';
  end if;

  if p_visitas is null or jsonb_typeof(p_visitas) <> 'array' then
    raise exception 'RUTA_MENSUAL_PAYLOAD_INVALIDO';
  end if;

  v_mes_fin := (p_mes + interval '1 month - 1 day')::date;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_cuenta_cliente_id::text || ':' || p_supervisor_empleado_id::text || ':' || p_mes::text,
      0
    )
  );

  create temporary table ruta_mensual_payload_tmp (
    fecha date not null,
    pdv_id uuid not null,
    orden smallint not null,
    notas text,
    primary key (fecha, pdv_id),
    unique (fecha, orden)
  ) on commit drop;

  begin
    insert into ruta_mensual_payload_tmp(fecha, pdv_id, orden, notas)
    select
      (item ->> 'fecha')::date,
      (item ->> 'pdvId')::uuid,
      (item ->> 'orden')::smallint,
      nullif(left(trim(item ->> 'notas'), 1000), '')
    from jsonb_array_elements(p_visitas) as payload(item);
  exception
    when invalid_text_representation or not_null_violation or numeric_value_out_of_range
      or unique_violation then
      raise exception 'RUTA_MENSUAL_PAYLOAD_INVALIDO';
  end;

  select count(*), count(distinct fecha)
  into v_total_visitas, v_total_dias
  from ruta_mensual_payload_tmp;

  if v_total_visitas = 0 then
    raise exception 'RUTA_MENSUAL_SIN_VISITAS';
  end if;

  if exists (
    select 1
    from ruta_mensual_payload_tmp payload
    where payload.fecha < p_mes
       or payload.fecha > v_mes_fin
       or payload.fecha < v_hoy
       or payload.orden < 1
       or payload.orden > 99
  ) then
    raise exception 'RUTA_MENSUAL_FECHA_NO_EDITABLE';
  end if;

  if exists (
    select 1
    from ruta_mensual_payload_tmp payload
    where not exists (
      select 1
      from public.cuenta_cliente_pdv cuenta_pdv
      where cuenta_pdv.cuenta_cliente_id = p_cuenta_cliente_id
        and cuenta_pdv.pdv_id = payload.pdv_id
        and cuenta_pdv.activo = true
        and cuenta_pdv.fecha_inicio <= payload.fecha
        and (cuenta_pdv.fecha_fin is null or cuenta_pdv.fecha_fin >= payload.fecha)
    )
    or not (
      exists (
        select 1
        from public.supervisor_pdv relacion
        where relacion.empleado_id = p_supervisor_empleado_id
          and relacion.pdv_id = payload.pdv_id
          and relacion.activo = true
          and relacion.fecha_inicio <= payload.fecha
          and (relacion.fecha_fin is null or relacion.fecha_fin >= payload.fecha)
      )
      or exists (
        select 1
        from public.asignacion asignacion
        where asignacion.supervisor_empleado_id = p_supervisor_empleado_id
          and asignacion.cuenta_cliente_id = p_cuenta_cliente_id
          and asignacion.pdv_id = payload.pdv_id
          and asignacion.estado_publicacion = 'PUBLICADA'
          and asignacion.fecha_inicio <= payload.fecha
          and (asignacion.fecha_fin is null or asignacion.fecha_fin >= payload.fecha)
      )
    )
  ) then
    raise exception 'RUTA_MENSUAL_PDV_FUERA_ALCANCE';
  end if;

  if exists (
    select 1
    from ruta_mensual_payload_tmp payload
    join public.ruta_semanal ruta
      on ruta.supervisor_empleado_id = p_supervisor_empleado_id
     and ruta.semana_inicio = payload.fecha - (extract(isodow from payload.fecha)::integer - 1)
    join public.ruta_semanal_visita visita
      on visita.ruta_semanal_id = ruta.id
     and visita.dia_semana = extract(isodow from payload.fecha)::smallint
    left join public.ruta_mensual_envio envio_anterior
      on envio_anterior.id = visita.ruta_mensual_envio_id
    where visita.estatus = 'COMPLETADA'
       or visita.completada_en is not null
       or envio_anterior.estado in ('APROBADA', 'EN_PROGRESO', 'CERRADA')
       or (
         visita.ruta_mensual_envio_id is null
         and ruta.estatus in ('PUBLICADA', 'EN_PROGRESO', 'CERRADA')
       )
  ) then
    raise exception 'RUTA_MENSUAL_FECHA_PROTEGIDA';
  end if;

  select id, revision
  into v_envio_id, v_revision
  from public.ruta_mensual_envio
  where supervisor_empleado_id = p_supervisor_empleado_id
    and periodo = p_mes
  for update;

  if v_envio_id is not null then
    if p_revision_esperada is not null and p_revision_esperada <> v_revision then
      raise exception 'RUTA_MENSUAL_CAMBIO_CONCURRENTE';
    end if;

    update public.ruta_mensual_envio
    set cuenta_cliente_id = p_cuenta_cliente_id,
        estado = 'PENDIENTE_COORDINACION',
        revision = revision + 1,
        total_visitas = v_total_visitas,
        total_dias_planeados = v_total_dias,
        enviado_en = now(),
        enviado_por_usuario_id = p_usuario_id,
        revisado_en = null,
        revisado_por_usuario_id = null,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'source', 'supervisor_monthly_calendar',
          'compatibilityModel', 'ruta_semanal'
        )
    where id = v_envio_id
    returning revision into v_revision;
  else
    insert into public.ruta_mensual_envio(
      cuenta_cliente_id,
      supervisor_empleado_id,
      periodo,
      estado,
      revision,
      total_visitas,
      total_dias_planeados,
      enviado_por_usuario_id,
      metadata
    )
    values (
      p_cuenta_cliente_id,
      p_supervisor_empleado_id,
      p_mes,
      'PENDIENTE_COORDINACION',
      1,
      v_total_visitas,
      v_total_dias,
      p_usuario_id,
      jsonb_build_object(
        'source', 'supervisor_monthly_calendar',
        'compatibilityModel', 'ruta_semanal'
      )
    )
    returning id, revision into v_envio_id, v_revision;
  end if;

  insert into public.ruta_semanal(
    cuenta_cliente_id,
    supervisor_empleado_id,
    semana_inicio,
    estatus,
    notas,
    created_by_usuario_id,
    updated_by_usuario_id,
    metadata,
    ruta_mensual_envio_id
  )
  select
    p_cuenta_cliente_id,
    p_supervisor_empleado_id,
    semanas.semana_inicio,
    'BORRADOR',
    'Ruta mensual enviada por supervisor para aprobación de coordinación.',
    p_usuario_id,
    p_usuario_id,
    jsonb_build_object(
      'approval', jsonb_build_object(
        'state', 'PENDIENTE_COORDINACION',
        'note', 'Ruta mensual enviada por supervisor.',
        'reviewedAt', null,
        'reviewedByUsuarioId', null
      ),
      'monthlySubmission', jsonb_build_object(
        'id', v_envio_id,
        'period', to_char(p_mes, 'YYYY-MM'),
        'revision', v_revision
      )
    ),
    v_envio_id
  from (
    select distinct
      fecha::date - (extract(isodow from fecha)::integer - 1) as semana_inicio
    from generate_series(p_mes, v_mes_fin, interval '1 day') as dias(fecha)
  ) semanas
  on conflict (supervisor_empleado_id, semana_inicio)
  do update set
    cuenta_cliente_id = excluded.cuenta_cliente_id,
    estatus = 'BORRADOR',
    notas = excluded.notas,
    updated_by_usuario_id = excluded.updated_by_usuario_id,
    updated_at = now(),
    ruta_mensual_envio_id = excluded.ruta_mensual_envio_id,
    metadata = jsonb_set(
      jsonb_set(
        coalesce(ruta_semanal.metadata, '{}'::jsonb),
        '{approval}',
        excluded.metadata -> 'approval',
        true
      ),
      '{monthlySubmission}',
      excluded.metadata -> 'monthlySubmission',
      true
    )
  where ruta_semanal.estatus = 'BORRADOR'
    and not exists (
      select 1
      from public.ruta_semanal_visita ejecutada
      where ejecutada.ruta_semanal_id = ruta_semanal.id
        and (ejecutada.estatus = 'COMPLETADA' or ejecutada.completada_en is not null)
    );

  get diagnostics v_rutas_afectadas = row_count;

  insert into public.ruta_mensual_envio_semana(
    ruta_mensual_envio_id,
    ruta_semanal_id,
    semana_inicio
  )
  select v_envio_id, ruta.id, ruta.semana_inicio
  from public.ruta_semanal ruta
  where ruta.supervisor_empleado_id = p_supervisor_empleado_id
    and ruta.semana_inicio <= v_mes_fin
    and ruta.semana_inicio + 6 >= p_mes
  on conflict (ruta_mensual_envio_id, ruta_semanal_id)
  do nothing;

  select count(*)::integer
  into v_rutas_afectadas
  from public.ruta_mensual_envio_semana
  where ruta_mensual_envio_id = v_envio_id;

  delete from public.ruta_semanal_visita visita
  using public.ruta_semanal ruta
  where visita.ruta_semanal_id = ruta.id
    and visita.ruta_mensual_envio_id = v_envio_id
    and visita.estatus in ('PLANIFICADA', 'CANCELADA')
    and ruta.semana_inicio + (visita.dia_semana - 1) between p_mes and v_mes_fin
    and ruta.semana_inicio + (visita.dia_semana - 1) >= v_hoy;

  insert into public.ruta_semanal_visita(
    ruta_semanal_id,
    ruta_mensual_envio_id,
    cuenta_cliente_id,
    supervisor_empleado_id,
    pdv_id,
    asignacion_id,
    dia_semana,
    orden,
    estatus,
    comentarios,
    metadata
  )
  select
    ruta.id,
    v_envio_id,
    p_cuenta_cliente_id,
    p_supervisor_empleado_id,
    payload.pdv_id,
    asignacion.id,
    extract(isodow from payload.fecha)::smallint,
    payload.orden,
    'CANCELADA',
    payload.notas,
    jsonb_build_object(
      'source', 'ruta_mensual_envio',
      'submissionId', v_envio_id,
      'operationDate', payload.fecha
    )
  from ruta_mensual_payload_tmp payload
  join public.ruta_semanal ruta
    on ruta.supervisor_empleado_id = p_supervisor_empleado_id
   and ruta.semana_inicio = payload.fecha - (extract(isodow from payload.fecha)::integer - 1)
  join public.ruta_mensual_envio_semana enlace
    on enlace.ruta_mensual_envio_id = v_envio_id
   and enlace.ruta_semanal_id = ruta.id
  left join lateral (
    select asignacion.id
    from public.asignacion asignacion
    where asignacion.supervisor_empleado_id = p_supervisor_empleado_id
      and asignacion.cuenta_cliente_id = p_cuenta_cliente_id
      and asignacion.pdv_id = payload.pdv_id
      and asignacion.estado_publicacion = 'PUBLICADA'
      and asignacion.fecha_inicio <= payload.fecha
      and (asignacion.fecha_fin is null or asignacion.fecha_fin >= payload.fecha)
    order by asignacion.fecha_inicio desc, asignacion.created_at desc
    limit 1
  ) asignacion on true;

  select count(*)::integer, count(distinct fecha_operacion)::integer
  into v_total_visitas, v_total_dias
  from (
    select
      (ruta.semana_inicio + (visita.dia_semana - 1))::date as fecha_operacion
    from public.ruta_semanal_visita visita
    join public.ruta_semanal ruta on ruta.id = visita.ruta_semanal_id
    where visita.ruta_mensual_envio_id = v_envio_id
      and (ruta.semana_inicio + (visita.dia_semana - 1)) between p_mes and v_mes_fin
  ) visitas_envio;

  update public.ruta_mensual_envio
  set total_visitas = v_total_visitas,
      total_dias_planeados = v_total_dias
  where id = v_envio_id;

  insert into public.audit_log(
    tabla,
    registro_id,
    accion,
    payload,
    usuario_id,
    cuenta_cliente_id
  )
  values (
    'ruta_mensual_envio',
    v_envio_id::text,
    'EVENTO',
    jsonb_build_object(
      'evento', 'ruta_mensual_enviada_a_coordinacion',
      'periodo', to_char(p_mes, 'YYYY-MM'),
      'revision', v_revision,
      'total_visitas', v_total_visitas,
      'total_dias_planeados', v_total_dias,
      'rutas_compatibilidad', v_rutas_afectadas
    ),
    p_usuario_id,
    p_cuenta_cliente_id
  );

  return jsonb_build_object(
    'ok', true,
    'envioId', v_envio_id,
    'mes', p_mes,
    'revision', v_revision,
    'rutasAfectadas', v_rutas_afectadas,
    'visitas', v_total_visitas,
    'diasPlaneados', v_total_dias
  );
end;
$$;

revoke all on function public.rpc_guardar_ruta_mensual(
  uuid, uuid, date, uuid, jsonb, integer
) from public, anon, authenticated;
grant execute on function public.rpc_guardar_ruta_mensual(
  uuid, uuid, date, uuid, jsonb, integer
) to service_role, postgres;

comment on function public.rpc_guardar_ruta_mensual(uuid, uuid, date, uuid, jsonb, integer) is
  'Guarda y envía una ruta mensual completa en una sola transacción; mantiene ruta_semanal como corte de compatibilidad para ejecución e historial.';

drop trigger if exists trg_ruta_semanal_sync_envio_mensual on public.ruta_semanal;
drop function if exists public.sincronizar_estado_ruta_mensual_envio();

create or replace function public.rpc_gestionar_rutas_mes(
  p_cuenta_cliente_id uuid,
  p_mes date,
  p_accion text,
  p_usuario_id uuid,
  p_ejecutar boolean default false,
  p_elegibles_esperados integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_accion text := upper(trim(coalesce(p_accion, '')));
  v_mes_fin date;
  v_hoy date := timezone('America/Mexico_City', now())::date;
  v_puesto text;
  v_actor_cuenta_cliente_id uuid;
  v_total integer := 0;
  v_elegibles integer := 0;
  v_protegidas_ejecucion integer := 0;
  v_protegidas_pasadas integer := 0;
  v_no_listas integer := 0;
  v_semanas_limite integer := 0;
  v_envio_ids uuid[] := '{}'::uuid[];
  v_supervisor_ids uuid[] := '{}'::uuid[];
  v_ruta_ids uuid[] := '{}'::uuid[];
  v_ahora timestamptz := now();
  v_nota text;
begin
  if p_cuenta_cliente_id is null or p_usuario_id is null then
    raise exception 'RUTA_MES_CONTEXTO_INVALIDO';
  end if;

  if p_mes is null or extract(day from p_mes)::integer <> 1 then
    raise exception 'RUTA_MES_DEBE_INICIAR_EL_PRIMERO';
  end if;

  if v_accion not in ('APROBAR', 'LIBERAR') then
    raise exception 'RUTA_MES_ACCION_INVALIDA';
  end if;

  select empleado.puesto, usuario.cuenta_cliente_id
  into v_puesto, v_actor_cuenta_cliente_id
  from public.usuario
  join public.empleado on empleado.id = usuario.empleado_id
  where usuario.id = p_usuario_id
    and usuario.estado_cuenta = 'ACTIVA'
    and empleado.estatus_laboral = 'ACTIVO';

  if v_puesto is null
    or v_puesto not in ('ADMINISTRADOR', 'COORDINADOR')
    or (v_puesto = 'COORDINADOR' and v_actor_cuenta_cliente_id is distinct from p_cuenta_cliente_id)
  then
    raise exception 'RUTA_MES_PERMISO_DENEGADO';
  end if;

  v_mes_fin := (p_mes + interval '1 month - 1 day')::date;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat('ruta-mes:', p_cuenta_cliente_id::text, ':', p_mes::text, ':', v_accion),
      0
    )
  );

  select
    count(*)::integer,
    count(*) filter (
      where envio.estado = 'APROBADA'
        and exists (
          select 1
          from public.ruta_semanal_visita visita
          where visita.ruta_mensual_envio_id = envio.id
            and (visita.estatus = 'COMPLETADA' or visita.completada_en is not null)
        )
    )::integer,
    count(*) filter (where v_mes_fin < v_hoy)::integer
  into v_total, v_protegidas_ejecucion, v_protegidas_pasadas
  from public.ruta_mensual_envio envio
  where envio.cuenta_cliente_id = p_cuenta_cliente_id
    and envio.periodo = p_mes;

  select
    coalesce(array_agg(objetivo.id), '{}'::uuid[]),
    coalesce(array_agg(distinct objetivo.supervisor_empleado_id), '{}'::uuid[])
  into v_envio_ids, v_supervisor_ids
  from (
    select envio.id, envio.supervisor_empleado_id
    from public.ruta_mensual_envio envio
    where envio.cuenta_cliente_id = p_cuenta_cliente_id
      and envio.periodo = p_mes
      and v_mes_fin >= v_hoy
      and case
        when v_accion = 'APROBAR' then
          envio.estado = 'PENDIENTE_COORDINACION'
          and exists (
            select 1
            from public.ruta_semanal_visita visita
            where visita.ruta_mensual_envio_id = envio.id
          )
        else
          envio.estado = 'APROBADA'
          and not exists (
            select 1
            from public.ruta_semanal_visita visita
            where visita.ruta_mensual_envio_id = envio.id
              and (visita.estatus = 'COMPLETADA' or visita.completada_en is not null)
          )
      end
    for update
  ) objetivo;

  v_elegibles := coalesce(array_length(v_envio_ids, 1), 0);
  v_no_listas := greatest(
    0,
    v_total - v_elegibles - v_protegidas_ejecucion - v_protegidas_pasadas
  );

  select count(*)::integer
  into v_semanas_limite
  from public.ruta_mensual_envio_semana enlace
  join public.ruta_mensual_envio envio
    on envio.id = enlace.ruta_mensual_envio_id
  where envio.id = any(v_envio_ids)
    and (enlace.semana_inicio < p_mes or enlace.semana_inicio + 6 > v_mes_fin);

  if p_ejecutar and p_elegibles_esperados is not null and p_elegibles_esperados <> v_elegibles then
    raise exception 'RUTA_MES_CAMBIO_CONCURRENTE:%:%', p_elegibles_esperados, v_elegibles;
  end if;

  if not p_ejecutar or v_elegibles = 0 then
    return jsonb_build_object(
      'ok', true,
      'accion', v_accion,
      'mes', to_char(p_mes, 'YYYY-MM'),
      'ejecutado', false,
      'totalRutas', v_total,
      'elegibles', v_elegibles,
      'afectadas', 0,
      'supervisores', coalesce(array_length(v_supervisor_ids, 1), 0),
      'supervisorIds', to_jsonb(v_supervisor_ids),
      'protegidasPorEjecucion', v_protegidas_ejecucion,
      'protegidasPorFecha', v_protegidas_pasadas,
      'noListas', v_no_listas,
      'semanasLimite', v_semanas_limite
    );
  end if;

  v_nota := case
    when v_accion = 'LIBERAR' then
      'Liberación mensual administrativa para ajuste y reenvío del supervisor.'
    else
      'Aprobación administrativa masiva del mes.'
  end;

  insert into public.audit_log (
    tabla,
    registro_id,
    accion,
    payload,
    usuario_id,
    cuenta_cliente_id
  )
  select
    'ruta_mensual_envio',
    envio.id::text,
    'EVENTO',
    jsonb_build_object(
      'evento', case
        when v_accion = 'LIBERAR' then 'ruta_mes_liberada'
        else 'ruta_mes_aprobada'
      end,
      'accion_mensual', v_accion,
      'mes', to_char(p_mes, 'YYYY-MM'),
      'estado_anterior', envio.estado,
      'estado_nuevo', case
        when v_accion = 'LIBERAR' then 'CAMBIOS_SOLICITADOS'
        else 'APROBADA'
      end,
      'nota', v_nota
    ),
    p_usuario_id,
    p_cuenta_cliente_id
  from public.ruta_mensual_envio envio
  where envio.id = any(v_envio_ids);

  update public.ruta_mensual_envio envio
  set estado = case
        when v_accion = 'LIBERAR' then 'CAMBIOS_SOLICITADOS'
        else 'APROBADA'
      end,
      revisado_en = v_ahora,
      revisado_por_usuario_id = p_usuario_id,
      metadata = coalesce(envio.metadata, '{}'::jsonb) || jsonb_build_object(
        'reviewNote', v_nota,
        'reviewedAt', v_ahora,
        'reviewedByUsuarioId', p_usuario_id
      )
  where envio.id = any(v_envio_ids);

  update public.ruta_semanal_visita visita
  set estatus = case when v_accion = 'LIBERAR' then 'CANCELADA' else 'PLANIFICADA' end,
      updated_at = v_ahora
  where visita.ruta_mensual_envio_id = any(v_envio_ids)
    and visita.estatus in ('PLANIFICADA', 'CANCELADA')
    and coalesce(visita.metadata ->> 'operationDate', '') >= v_hoy::text;

  select coalesce(array_agg(distinct enlace.ruta_semanal_id), '{}'::uuid[])
  into v_ruta_ids
  from public.ruta_mensual_envio_semana enlace
  where enlace.ruta_mensual_envio_id = any(v_envio_ids);

  update public.ruta_semanal ruta
  set estatus = case
        when exists (
          select 1
          from public.ruta_mensual_envio_semana enlace_activo
          join public.ruta_mensual_envio envio_activo
            on envio_activo.id = enlace_activo.ruta_mensual_envio_id
          where enlace_activo.ruta_semanal_id = ruta.id
            and envio_activo.estado in ('APROBADA', 'EN_PROGRESO', 'CERRADA')
        ) then 'PUBLICADA'
        else 'BORRADOR'
      end,
      metadata = jsonb_set(
        coalesce(ruta.metadata, '{}'::jsonb),
        '{approval}',
        jsonb_build_object(
          'state', case
            when exists (
              select 1
              from public.ruta_mensual_envio_semana enlace_aprobado
              join public.ruta_mensual_envio envio_aprobado
                on envio_aprobado.id = enlace_aprobado.ruta_mensual_envio_id
              where enlace_aprobado.ruta_semanal_id = ruta.id
                and envio_aprobado.estado in ('APROBADA', 'EN_PROGRESO', 'CERRADA')
            ) then 'APROBADA'
            else 'CAMBIOS_SOLICITADOS'
          end,
          'note', v_nota,
          'reviewedAt', v_ahora,
          'reviewedByUsuarioId', p_usuario_id
        ),
        true
      ),
      updated_by_usuario_id = p_usuario_id,
      updated_at = v_ahora
  where ruta.id = any(v_ruta_ids)
    and ruta.estatus not in ('EN_PROGRESO', 'CERRADA');

  return jsonb_build_object(
    'ok', true,
    'accion', v_accion,
    'mes', to_char(p_mes, 'YYYY-MM'),
    'ejecutado', true,
    'totalRutas', v_total,
    'elegibles', v_elegibles,
    'afectadas', v_elegibles,
    'supervisores', coalesce(array_length(v_supervisor_ids, 1), 0),
    'supervisorIds', to_jsonb(v_supervisor_ids),
    'protegidasPorEjecucion', v_protegidas_ejecucion,
    'protegidasPorFecha', v_protegidas_pasadas,
    'noListas', v_no_listas,
    'semanasLimite', v_semanas_limite
  );
end;
$$;

revoke all on function public.rpc_gestionar_rutas_mes(
  uuid, date, text, uuid, boolean, integer
) from public, anon, authenticated;
grant execute on function public.rpc_gestionar_rutas_mes(
  uuid, date, text, uuid, boolean, integer
) to service_role, postgres;

comment on function public.rpc_gestionar_rutas_mes(uuid, date, text, uuid, boolean, integer) is
  'Previsualiza o ejecuta aprobación/liberación por envío mensual exacto sin mezclar días de semanas limítrofes.';

create or replace function public.rpc_ruta_calendario_mensual_resumen(
  p_month_start date,
  p_month_end date,
  p_cuenta_cliente_id uuid default null,
  p_supervisor_empleado_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with scoped_routes as materialized (
    select
      ruta.id,
      ruta.cuenta_cliente_id,
      ruta.supervisor_empleado_id,
      ruta.semana_inicio,
      case
        when envio.id is null then ruta.estatus
        when envio.estado in ('PENDIENTE_COORDINACION', 'CAMBIOS_SOLICITADOS') then 'BORRADOR'
        when ruta.estatus in ('EN_PROGRESO', 'CERRADA') then ruta.estatus
        else 'PUBLICADA'
      end as estatus,
      ruta.notas,
      case
        when envio.id is null then ruta.metadata
        else jsonb_set(
          coalesce(ruta.metadata, '{}'::jsonb),
          '{approval}',
          jsonb_build_object(
            'state', case
              when envio.estado = 'CAMBIOS_SOLICITADOS' then 'CAMBIOS_SOLICITADOS'
              when envio.estado in ('APROBADA', 'EN_PROGRESO', 'CERRADA') then 'APROBADA'
              else 'PENDIENTE_COORDINACION'
            end,
            'reviewedAt', envio.revisado_en,
            'reviewedByUsuarioId', envio.revisado_por_usuario_id,
            'monthlySubmissionId', envio.id,
            'monthlyRevision', envio.revision
          ),
          true
        )
      end as metadata,
      greatest(ruta.updated_at, coalesce(envio.updated_at, ruta.updated_at)) as updated_at,
      supervisor.nombre_completo as supervisor_nombre,
      supervisor.zona as supervisor_zona,
      envio.id as ruta_mensual_envio_id
    from public.ruta_semanal ruta
    inner join public.empleado supervisor
      on supervisor.id = ruta.supervisor_empleado_id
    left join lateral (
      select mensual.*
      from public.ruta_mensual_envio_semana enlace
      join public.ruta_mensual_envio mensual
        on mensual.id = enlace.ruta_mensual_envio_id
      where enlace.ruta_semanal_id = ruta.id
        and mensual.periodo = p_month_start
      limit 1
    ) envio on true
    where p_month_start is not null
      and p_month_end between p_month_start and (p_month_start + 30)
      and ruta.semana_inicio <= p_month_end
      and (ruta.semana_inicio + 6) >= p_month_start
      and (
        envio.id is not null
        or not exists (
          select 1
          from public.ruta_mensual_envio_semana cualquier_enlace
          where cualquier_enlace.ruta_semanal_id = ruta.id
        )
      )
      and (p_cuenta_cliente_id is null or ruta.cuenta_cliente_id = p_cuenta_cliente_id)
      and (
        p_supervisor_empleado_id is null
        or ruta.supervisor_empleado_id = p_supervisor_empleado_id
      )
  ),
  route_days as (
    select
      ruta.*,
      day_number.dia_semana,
      (ruta.semana_inicio + (day_number.dia_semana - 1))::date as fecha
    from scoped_routes ruta
    cross join generate_series(1, 7) as day_number(dia_semana)
    where (ruta.semana_inicio + (day_number.dia_semana - 1))::date
      between p_month_start and p_month_end
  ),
  visit_counts as (
    select
      day.id as ruta_semanal_id,
      day.dia_semana,
      count(visita.id) filter (
        where day.ruta_mensual_envio_id is not null
          or visita.estatus <> 'CANCELADA'
      ) as planned_count,
      count(visita.id) filter (where visita.estatus = 'COMPLETADA') as completed_count
    from route_days day
    left join public.ruta_semanal_visita visita
      on visita.ruta_semanal_id = day.id
      and visita.dia_semana = day.dia_semana
      and (
        (day.ruta_mensual_envio_id is not null
          and visita.ruta_mensual_envio_id = day.ruta_mensual_envio_id)
        or (day.ruta_mensual_envio_id is null and visita.ruta_mensual_envio_id is null)
      )
    group by day.id, day.dia_semana, day.ruta_mensual_envio_id
  ),
  event_counts as (
    select
      evento.ruta_semanal_id,
      evento.fecha_operacion,
      count(*) as event_count,
      sum(
        case
          when jsonb_typeof(evento.metadata -> 'displacedVisitIds') = 'array'
            then jsonb_array_length(evento.metadata -> 'displacedVisitIds')
          when jsonb_typeof(evento.metadata -> 'displaced_visit_ids') = 'array'
            then jsonb_array_length(evento.metadata -> 'displaced_visit_ids')
          else 0
        end
      ) as displaced_count
    from public.ruta_agenda_evento evento
    inner join scoped_routes ruta on ruta.id = evento.ruta_semanal_id
    where evento.fecha_operacion between p_month_start and p_month_end
    group by evento.ruta_semanal_id, evento.fecha_operacion
  ),
  replacement_counts as (
    select
      visita.ruta_semanal_id,
      visita.dia_semana,
      count(distinct visita.id) as replacement_pending_count
    from public.ruta_visita_pendiente_reposicion reposicion
    inner join public.ruta_semanal_visita visita
      on visita.id = reposicion.ruta_semanal_visita_id
    inner join scoped_routes ruta
      on ruta.id = visita.ruta_semanal_id
      and (
        (ruta.ruta_mensual_envio_id is not null
          and visita.ruta_mensual_envio_id = ruta.ruta_mensual_envio_id)
        or (ruta.ruta_mensual_envio_id is null and visita.ruta_mensual_envio_id is null)
      )
    where reposicion.fecha_origen between p_month_start and p_month_end
      and reposicion.estado not in ('DESCARTADA', 'EJECUTADA')
    group by visita.ruta_semanal_id, visita.dia_semana
  ),
  summary_days as (
    select
      day.id as route_id,
      day.dia_semana,
      day.fecha,
      coalesce(visits.planned_count, 0)::bigint as planned_count,
      coalesce(visits.completed_count, 0)::bigint as completed_count,
      coalesce(events.event_count, 0)::bigint as event_count,
      coalesce(events.displaced_count, 0)::bigint as displaced_count,
      coalesce(replacements.replacement_pending_count, 0)::bigint
        as replacement_pending_count
    from route_days day
    left join visit_counts visits
      on visits.ruta_semanal_id = day.id and visits.dia_semana = day.dia_semana
    left join event_counts events
      on events.ruta_semanal_id = day.id and events.fecha_operacion = day.fecha
    left join replacement_counts replacements
      on replacements.ruta_semanal_id = day.id
      and replacements.dia_semana = day.dia_semana
  ),
  summary_routes as (
    select
      ruta.id as route_id,
      ruta.cuenta_cliente_id,
      ruta.supervisor_empleado_id,
      ruta.supervisor_nombre,
      ruta.supervisor_zona,
      ruta.semana_inicio,
      ruta.estatus as route_status,
      ruta.notas as route_notes,
      ruta.metadata as route_metadata,
      ruta.updated_at as route_updated_at
    from scoped_routes ruta
  )
  select jsonb_build_object(
    'routes', coalesce(
      (select jsonb_agg(to_jsonb(summary_routes) order by semana_inicio, route_updated_at desc)
       from summary_routes),
      '[]'::jsonb
    ),
    'days', coalesce(
      (select jsonb_agg(to_jsonb(summary_days) order by fecha, route_id, dia_semana)
       from summary_days),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.rpc_ruta_calendario_mensual_resumen(date, date, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.rpc_ruta_calendario_mensual_resumen(date, date, uuid, uuid)
to postgres, service_role;

comment on function public.rpc_ruta_calendario_mensual_resumen(date, date, uuid, uuid) is
  'Resume el calendario por envío mensual exacto e incluye borradores pendientes sin mezclar semanas limítrofes.';

commit;
