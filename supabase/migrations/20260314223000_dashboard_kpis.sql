drop materialized view if exists public.dashboard_kpis;

create materialized view public.dashboard_kpis as
with fechas as (
  select generate_series(current_date - interval '29 day', current_date, interval '1 day')::date as fecha_corte
),
cuentas as (
  select
    id as cuenta_cliente_id,
    nombre as cuenta_cliente_nombre,
    identificador as cuenta_cliente_identificador
  from public.cuenta_cliente
  where activa = true
),
asistencias as (
  select
    a.cuenta_cliente_id,
    a.fecha_operacion::date as fecha_corte,
    count(distinct a.empleado_id)
      filter (where a.estatus in ('VALIDA', 'CERRADA', 'PENDIENTE_VALIDACION')) as promotores_activos,
    count(*) filter (where a.estatus in ('VALIDA', 'CERRADA')) as checkins_validos,
    count(*) filter (where a.estatus = 'PENDIENTE_VALIDACION') as jornadas_pendientes,
    count(*)
      filter (
        where a.estado_gps = 'FUERA_GEOCERCA'
          or a.biometria_estado = 'RECHAZADA'
      ) as alertas_operativas,
    count(*) filter (where a.estatus <> 'RECHAZADA') as jornadas_operadas
  from public.asistencia a
  where a.fecha_operacion between current_date - 29 and current_date
  group by a.cuenta_cliente_id, a.fecha_operacion::date
),
ventas as (
  select
    v.cuenta_cliente_id,
    timezone('America/Mexico_City', v.fecha_utc)::date as fecha_corte,
    count(*) filter (where v.confirmada) as ventas_confirmadas,
    coalesce(sum(v.total_monto) filter (where v.confirmada), 0)::numeric(14, 2) as monto_confirmado
  from public.venta v
  where timezone('America/Mexico_City', v.fecha_utc)::date between current_date - 29 and current_date
  group by v.cuenta_cliente_id, timezone('America/Mexico_City', v.fecha_utc)::date
),
periodos as (
  select
    id,
    fecha_inicio::date as fecha_inicio,
    fecha_fin::date as fecha_fin
  from public.nomina_periodo
),
cuotas as (
  select
    c.cuenta_cliente_id,
    p.fecha_inicio,
    p.fecha_fin,
    count(*) filter (where c.estado = 'CUMPLIDA') as cuotas_cumplidas
  from public.cuota_empleado_periodo c
  join periodos p
    on p.id = c.periodo_id
  group by c.cuenta_cliente_id, p.fecha_inicio, p.fecha_fin
),
ledger as (
  select
    l.cuenta_cliente_id,
    p.fecha_inicio,
    p.fecha_fin,
    coalesce(
      sum(
        case
          when l.tipo_movimiento = 'DEDUCCION' then -l.monto
          else l.monto
        end
      ),
      0
    )::numeric(14, 2) as neto_nomina_periodo
  from public.nomina_ledger l
  join periodos p
    on p.id = l.periodo_id
  where l.cuenta_cliente_id is not null
  group by l.cuenta_cliente_id, p.fecha_inicio, p.fecha_fin
)
select
  f.fecha_corte,
  c.cuenta_cliente_id,
  c.cuenta_cliente_nombre as cuenta_cliente,
  c.cuenta_cliente_identificador as cuenta_cliente_identificador,
  coalesce(a.promotores_activos, 0) as promotores_activos,
  coalesce(a.checkins_validos, 0) as checkins_validos,
  coalesce(a.jornadas_pendientes, 0) as jornadas_pendientes,
  coalesce(a.alertas_operativas, 0) as alertas_operativas,
  coalesce(a.jornadas_operadas, 0) as jornadas_operadas,
  coalesce(v.ventas_confirmadas, 0) as ventas_confirmadas,
  coalesce(v.monto_confirmado, 0)::numeric(14, 2) as monto_confirmado,
  0::integer as afiliaciones_love,
  case
    when coalesce(a.jornadas_operadas, 0) = 0 then 0::numeric(5, 2)
    else round((coalesce(a.checkins_validos, 0)::numeric / a.jornadas_operadas::numeric) * 100, 2)
  end as asistencia_porcentaje,
  coalesce(q.cuotas_cumplidas, 0) as cuotas_cumplidas_periodo,
  coalesce(l.neto_nomina_periodo, 0)::numeric(14, 2) as neto_nomina_periodo,
  timezone('utc', now()) as refreshed_at
from fechas f
cross join cuentas c
left join asistencias a
  on a.cuenta_cliente_id = c.cuenta_cliente_id
 and a.fecha_corte = f.fecha_corte
left join ventas v
  on v.cuenta_cliente_id = c.cuenta_cliente_id
 and v.fecha_corte = f.fecha_corte
left join cuotas q
  on q.cuenta_cliente_id = c.cuenta_cliente_id
 and f.fecha_corte between q.fecha_inicio and q.fecha_fin
left join ledger l
  on l.cuenta_cliente_id = c.cuenta_cliente_id
 and f.fecha_corte between l.fecha_inicio and l.fecha_fin
where
  f.fecha_corte = current_date
  or coalesce(a.promotores_activos, 0) > 0
  or coalesce(a.checkins_validos, 0) > 0
  or coalesce(a.jornadas_pendientes, 0) > 0
  or coalesce(a.alertas_operativas, 0) > 0
  or coalesce(v.ventas_confirmadas, 0) > 0
  or coalesce(v.monto_confirmado, 0) > 0
  or coalesce(q.cuotas_cumplidas, 0) > 0
  or coalesce(l.neto_nomina_periodo, 0) <> 0;

create unique index idx_dashboard_kpis_cuenta_fecha
  on public.dashboard_kpis(cuenta_cliente_id, fecha_corte);

create index idx_dashboard_kpis_fecha
  on public.dashboard_kpis(fecha_corte desc);

create or replace function public.refresh_dashboard_kpis()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view public.dashboard_kpis;
end;
$$;

grant select on public.dashboard_kpis to authenticated;