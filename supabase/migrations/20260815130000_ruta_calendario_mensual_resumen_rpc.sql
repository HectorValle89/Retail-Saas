-- Resumen mensual agregado de rutas.
-- Evita descargar visitas individuales en la matriz y mantiene el detalle bajo demanda.

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
      ruta.estatus,
      ruta.notas,
      ruta.metadata,
      ruta.updated_at,
      supervisor.nombre_completo as supervisor_nombre,
      supervisor.zona as supervisor_zona
    from public.ruta_semanal ruta
    inner join public.empleado supervisor
      on supervisor.id = ruta.supervisor_empleado_id
    where p_month_start is not null
      and p_month_end between p_month_start and (p_month_start + 30)
      and ruta.semana_inicio <= p_month_end
      and (ruta.semana_inicio + 6) >= p_month_start
      and (
        p_cuenta_cliente_id is null
        or ruta.cuenta_cliente_id = p_cuenta_cliente_id
      )
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
      visita.ruta_semanal_id,
      visita.dia_semana,
      count(*) filter (where visita.estatus <> 'CANCELADA') as planned_count,
      count(*) filter (where visita.estatus = 'COMPLETADA') as completed_count
    from public.ruta_semanal_visita visita
    inner join scoped_routes ruta
      on ruta.id = visita.ruta_semanal_id
    group by visita.ruta_semanal_id, visita.dia_semana
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
    inner join scoped_routes ruta
      on ruta.id = evento.ruta_semanal_id
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
    where reposicion.fecha_origen between p_month_start and p_month_end
      and reposicion.estado not in ('DESCARTADA', 'EJECUTADA')
      and visita.estatus <> 'CANCELADA'
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
      on visits.ruta_semanal_id = day.id
      and visits.dia_semana = day.dia_semana
    left join event_counts events
      on events.ruta_semanal_id = day.id
      and events.fecha_operacion = day.fecha
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
    'routes',
    coalesce(
      (
        select jsonb_agg(
          to_jsonb(summary_routes)
          order by semana_inicio, route_updated_at desc, supervisor_nombre
        )
        from summary_routes
      ),
      '[]'::jsonb
    ),
    'days',
    coalesce(
      (
        select jsonb_agg(
          to_jsonb(summary_days)
          order by fecha, route_id, dia_semana
        )
        from summary_days
      ),
      '[]'::jsonb
    )
  );
$$;

comment on function public.rpc_ruta_calendario_mensual_resumen(date, date, uuid, uuid)
is 'Devuelve contadores agregados por ruta y día para la matriz mensual; el detalle se consulta por separado.';

revoke all on function public.rpc_ruta_calendario_mensual_resumen(date, date, uuid, uuid)
from public;
revoke all on function public.rpc_ruta_calendario_mensual_resumen(date, date, uuid, uuid)
from anon, authenticated;
grant execute on function public.rpc_ruta_calendario_mensual_resumen(date, date, uuid, uuid)
to postgres, service_role;
