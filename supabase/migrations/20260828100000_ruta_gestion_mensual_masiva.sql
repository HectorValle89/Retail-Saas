begin;

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
  v_ruta_ids uuid[] := '{}'::uuid[];
  v_supervisor_ids uuid[] := '{}'::uuid[];
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

  select
    count(*)::integer,
    count(*) filter (
      where ruta.estatus in ('EN_PROGRESO', 'CERRADA')
        or exists (
          select 1
          from public.ruta_semanal_visita visita
          where visita.ruta_semanal_id = ruta.id
            and (visita.estatus = 'COMPLETADA' or visita.completada_en is not null)
        )
    )::integer,
    count(*) filter (
      where ruta.estatus not in ('EN_PROGRESO', 'CERRADA')
        and not exists (
          select 1
          from public.ruta_semanal_visita visita
          where visita.ruta_semanal_id = ruta.id
            and (visita.estatus = 'COMPLETADA' or visita.completada_en is not null)
        )
        and ruta.semana_inicio + 6 < v_hoy
    )::integer
  into v_total, v_protegidas_ejecucion, v_protegidas_pasadas
  from public.ruta_semanal ruta
  where ruta.cuenta_cliente_id = p_cuenta_cliente_id
    and ruta.semana_inicio <= v_mes_fin
    and ruta.semana_inicio + 6 >= p_mes;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat('ruta-mes:', p_cuenta_cliente_id::text, ':', p_mes::text, ':', v_accion),
      0
    )
  );

  select
    coalesce(array_agg(objetivo.id), '{}'::uuid[]),
    coalesce(array_agg(distinct objetivo.supervisor_empleado_id), '{}'::uuid[]),
    count(*) filter (
      where objetivo.semana_inicio < p_mes
        or objetivo.semana_inicio + 6 > v_mes_fin
    )::integer
  into v_ruta_ids, v_supervisor_ids, v_semanas_limite
  from (
    select
      ruta.id,
      ruta.supervisor_empleado_id,
      ruta.semana_inicio
    from public.ruta_semanal ruta
    where ruta.cuenta_cliente_id = p_cuenta_cliente_id
      and ruta.semana_inicio <= v_mes_fin
      and ruta.semana_inicio + 6 >= p_mes
      and ruta.semana_inicio + 6 >= v_hoy
      and ruta.estatus not in ('EN_PROGRESO', 'CERRADA')
      and not exists (
        select 1
        from public.ruta_semanal_visita visita
        where visita.ruta_semanal_id = ruta.id
          and (visita.estatus = 'COMPLETADA' or visita.completada_en is not null)
      )
      and case
        when v_accion = 'LIBERAR' then ruta.estatus = 'PUBLICADA'
        else
          ruta.estatus = 'BORRADOR'
          and coalesce(ruta.metadata -> 'approval' ->> 'state', 'PENDIENTE_COORDINACION') =
            'PENDIENTE_COORDINACION'
          and coalesce(ruta.metadata -> 'changeRequest' ->> 'status', 'NINGUNO') <> 'PENDIENTE'
          and exists (
            select 1
            from public.ruta_semanal_visita visita
            where visita.ruta_semanal_id = ruta.id
              and visita.estatus = 'PLANIFICADA'
          )
      end
    for update
  ) objetivo;

  v_elegibles := coalesce(array_length(v_ruta_ids, 1), 0);
  v_no_listas := greatest(
    0,
    v_total - v_elegibles - v_protegidas_ejecucion - v_protegidas_pasadas
  );

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
    'ruta_semanal',
    ruta.id::text,
    'EVENTO',
    jsonb_build_object(
      'evento', case
        when v_accion = 'LIBERAR' then 'ruta_mes_liberada'
        else 'ruta_mes_aprobada'
      end,
      'accion_mensual', v_accion,
      'mes', to_char(p_mes, 'YYYY-MM'),
      'semana_inicio', ruta.semana_inicio,
      'estado_anterior', ruta.estatus,
      'approval_state_anterior',
        coalesce(ruta.metadata -> 'approval' ->> 'state', 'PENDIENTE_COORDINACION'),
      'estado_nuevo', case when v_accion = 'LIBERAR' then 'BORRADOR' else 'PUBLICADA' end,
      'approval_state_nuevo',
        case when v_accion = 'LIBERAR' then 'CAMBIOS_SOLICITADOS' else 'APROBADA' end,
      'nota', v_nota
    ),
    p_usuario_id,
    p_cuenta_cliente_id
  from public.ruta_semanal ruta
  where ruta.id = any(v_ruta_ids);

  update public.ruta_semanal ruta
  set
    estatus = case when v_accion = 'LIBERAR' then 'BORRADOR' else 'PUBLICADA' end,
    metadata = jsonb_set(
      case
        when v_accion = 'LIBERAR' then coalesce(ruta.metadata, '{}'::jsonb) - 'changeRequest'
        else coalesce(ruta.metadata, '{}'::jsonb)
      end,
      '{approval}',
      coalesce(ruta.metadata -> 'approval', '{}'::jsonb) || jsonb_build_object(
        'state', case
          when v_accion = 'LIBERAR' then 'CAMBIOS_SOLICITADOS'
          else 'APROBADA'
        end,
        'note', v_nota,
        'reviewedAt', v_ahora,
        'reviewedByUsuarioId', p_usuario_id
      ),
      true
    ),
    updated_by_usuario_id = p_usuario_id,
    updated_at = v_ahora
  where ruta.id = any(v_ruta_ids);

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
  'Previsualiza o ejecuta en una transacción la aprobación/liberación de rutas semanales solapadas con un mes, preservando rutas iniciadas, cerradas o ejecutadas.';

commit;
