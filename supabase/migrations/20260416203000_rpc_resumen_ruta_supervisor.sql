-- [2026-04-16] RPC Resumen Ruta Supervisor
-- Reduce la carga inicial del dashboard de supervision devolviendo solo conteos y banderas
-- para la ruta del dia, sin transferir listas historicas completas.

create or replace function public.rpc_resumen_ruta_supervisor(
  p_cuenta_cliente_id uuid,
  p_supervisor_empleado_id uuid,
  p_current_week_start date,
  p_next_week_start date
)
returns jsonb
language sql
security definer
set search_path = public
as $$
with rutas as (
  select id, semana_inicio
  from public.ruta_semanal
  where supervisor_empleado_id = p_supervisor_empleado_id
    and (p_cuenta_cliente_id is null or cuenta_cliente_id = p_cuenta_cliente_id)
),
visitas as (
  select estatus
  from public.ruta_semanal_visita
  where supervisor_empleado_id = p_supervisor_empleado_id
    and (p_cuenta_cliente_id is null or cuenta_cliente_id = p_cuenta_cliente_id)
),
pendientes as (
  select 1 as marker
  from public.ruta_visita_pendiente_reposicion
  where supervisor_empleado_id = p_supervisor_empleado_id
    and (p_cuenta_cliente_id is null or cuenta_cliente_id = p_cuenta_cliente_id)
)
select jsonb_build_object(
  'totalRutas', (select count(*)::bigint from rutas),
  'totalVisitas', (select count(*)::bigint from visitas),
  'visitasCompletadas', (select count(*)::bigint from visitas where estatus = 'COMPLETADA'),
  'pendientesReposicion', (select count(*)::bigint from pendientes),
  'currentWeekStart', p_current_week_start,
  'nextWeekStart', p_next_week_start,
  'nextWeekEnd', (p_next_week_start + 6),
  'hasCurrentWeekRoute', exists(select 1 from rutas where semana_inicio = p_current_week_start),
  'hasNextWeekRoute', exists(select 1 from rutas where semana_inicio = p_next_week_start)
    and (select count(*)::bigint from visitas) > 0
);
$$;
