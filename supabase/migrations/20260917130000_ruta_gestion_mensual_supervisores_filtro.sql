-- Migration: 20260917130000_ruta_gestion_mensual_supervisores_filtro.sql
-- Description: Permitir filtrar por supervisores específicos en rpc_gestionar_rutas_mes
--              para habilitar la aprobación y liberación mensual granular.

begin;

drop function if exists public.rpc_gestionar_rutas_mes(uuid, date, text, uuid, boolean, integer);

create or replace function public.rpc_gestionar_rutas_mes(
  p_cuenta_cliente_id uuid,
  p_mes date,
  p_accion text,
  p_usuario_id uuid,
  p_ejecutar boolean default false,
  p_elegibles_esperados integer default null,
  p_supervisor_empleado_ids uuid[] default null
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
  v_filtrar_supervisores boolean := (
    p_supervisor_empleado_ids is not null
    and array_length(p_supervisor_empleado_ids, 1) is not null
    and array_length(p_supervisor_empleado_ids, 1) > 0
  );
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
    and envio.periodo = p_mes
    and (not v_filtrar_supervisores or envio.supervisor_empleado_id = any(p_supervisor_empleado_ids));

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
      and (not v_filtrar_supervisores or envio.supervisor_empleado_id = any(p_supervisor_empleado_ids))
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
  uuid, date, text, uuid, boolean, integer, uuid[]
) from public, anon, authenticated;

grant execute on function public.rpc_gestionar_rutas_mes(
  uuid, date, text, uuid, boolean, integer, uuid[]
) to service_role, postgres;

comment on function public.rpc_gestionar_rutas_mes(uuid, date, text, uuid, boolean, integer, uuid[]) is
  'Previsualiza o ejecuta aprobación/liberación por envío mensual exacto con filtro opcional de supervisores.';

commit;
