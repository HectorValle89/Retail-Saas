-- Migración: Control de límite mensual estricto en calendario y exclusión de supervisores en BAJA sin visitas en el mes
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
      supervisor.estatus_laboral as supervisor_estatus_laboral,
      supervisor.fecha_baja as supervisor_fecha_baja,
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
      and (
        supervisor.estatus_laboral <> 'BAJA'
        or coalesce(supervisor.fecha_baja, '1900-01-01'::date) > p_month_start
        or exists (
          select 1
          from public.ruta_semanal_visita v
          where v.ruta_semanal_id = ruta.id
            and (ruta.semana_inicio + (v.dia_semana - 1))::date between p_month_start and p_month_end
        )
        or exists (
          select 1
          from public.ruta_agenda_evento ev
          where ev.ruta_semanal_id = ruta.id
            and ev.fecha_operacion between p_month_start and p_month_end
        )
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
      ruta.supervisor_estatus_laboral,
      ruta.supervisor_fecha_baja,
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
  'Resume el calendario mensual exacto excluyendo supervisores dados de baja sin actividad en el mes.';
