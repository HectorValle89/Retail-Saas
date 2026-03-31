create or replace function public.dashboard_kpis_source_rows(
  p_fecha_inicio date,
  p_fecha_fin date
)
returns table (
  fecha_corte date,
  cuenta_cliente_id uuid,
  cuenta_cliente text,
  cuenta_cliente_identificador text,
  promotores_activos bigint,
  checkins_validos bigint,
  jornadas_pendientes bigint,
  alertas_operativas bigint,
  jornadas_operadas bigint,
  ventas_confirmadas bigint,
  monto_confirmado numeric(14, 2),
  afiliaciones_love integer,
  asistencia_porcentaje numeric(5, 2),
  cuotas_cumplidas_periodo bigint,
  neto_nomina_periodo numeric(14, 2),
  refreshed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
with fechas as (
  select generate_series(p_fecha_inicio, p_fecha_fin, interval '1 day')::date as fecha_corte
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
  where a.fecha_operacion between p_fecha_inicio and p_fecha_fin
  group by a.cuenta_cliente_id, a.fecha_operacion::date
),
ventas as (
  select
    v.cuenta_cliente_id,
    timezone('America/Mexico_City', v.fecha_utc)::date as fecha_corte,
    count(*) filter (where v.confirmada) as ventas_confirmadas,
    coalesce(sum(v.total_monto) filter (where v.confirmada), 0)::numeric(14, 2) as monto_confirmado
  from public.venta v
  where timezone('America/Mexico_City', v.fecha_utc)::date between p_fecha_inicio and p_fecha_fin
  group by v.cuenta_cliente_id, timezone('America/Mexico_City', v.fecha_utc)::date
),
periodos as (
  select
    id,
    fecha_inicio::date as fecha_inicio,
    fecha_fin::date as fecha_fin
  from public.nomina_periodo
  where fecha_fin::date >= p_fecha_inicio
    and fecha_inicio::date <= p_fecha_fin
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
$$;

create table if not exists public.dashboard_kpis_incremental (
  fecha_corte date not null,
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete cascade,
  cuenta_cliente text not null,
  cuenta_cliente_identificador text null,
  promotores_activos integer not null default 0,
  checkins_validos integer not null default 0,
  jornadas_pendientes integer not null default 0,
  alertas_operativas integer not null default 0,
  jornadas_operadas integer not null default 0,
  ventas_confirmadas integer not null default 0,
  monto_confirmado numeric(14, 2) not null default 0,
  afiliaciones_love integer not null default 0,
  asistencia_porcentaje numeric(5, 2) not null default 0,
  cuotas_cumplidas_periodo integer not null default 0,
  neto_nomina_periodo numeric(14, 2) not null default 0,
  refreshed_at timestamptz not null default timezone('utc', now()),
  primary key (cuenta_cliente_id, fecha_corte)
);

insert into public.dashboard_kpis_incremental (
  fecha_corte,
  cuenta_cliente_id,
  cuenta_cliente,
  cuenta_cliente_identificador,
  promotores_activos,
  checkins_validos,
  jornadas_pendientes,
  alertas_operativas,
  jornadas_operadas,
  ventas_confirmadas,
  monto_confirmado,
  afiliaciones_love,
  asistencia_porcentaje,
  cuotas_cumplidas_periodo,
  neto_nomina_periodo,
  refreshed_at
)
select
  fecha_corte,
  cuenta_cliente_id,
  cuenta_cliente,
  cuenta_cliente_identificador,
  promotores_activos::integer,
  checkins_validos::integer,
  jornadas_pendientes::integer,
  alertas_operativas::integer,
  jornadas_operadas::integer,
  ventas_confirmadas::integer,
  monto_confirmado,
  afiliaciones_love,
  asistencia_porcentaje,
  cuotas_cumplidas_periodo::integer,
  neto_nomina_periodo,
  refreshed_at
from public.dashboard_kpis
on conflict (cuenta_cliente_id, fecha_corte) do update
set
  cuenta_cliente = excluded.cuenta_cliente,
  cuenta_cliente_identificador = excluded.cuenta_cliente_identificador,
  promotores_activos = excluded.promotores_activos,
  checkins_validos = excluded.checkins_validos,
  jornadas_pendientes = excluded.jornadas_pendientes,
  alertas_operativas = excluded.alertas_operativas,
  jornadas_operadas = excluded.jornadas_operadas,
  ventas_confirmadas = excluded.ventas_confirmadas,
  monto_confirmado = excluded.monto_confirmado,
  afiliaciones_love = excluded.afiliaciones_love,
  asistencia_porcentaje = excluded.asistencia_porcentaje,
  cuotas_cumplidas_periodo = excluded.cuotas_cumplidas_periodo,
  neto_nomina_periodo = excluded.neto_nomina_periodo,
  refreshed_at = excluded.refreshed_at;

drop materialized view if exists public.dashboard_kpis;

alter table public.dashboard_kpis_incremental
  rename to dashboard_kpis;

create index if not exists idx_dashboard_kpis_fecha
  on public.dashboard_kpis(fecha_corte desc);

create or replace function public.refresh_dashboard_kpis_incremental(
  p_fecha_inicio date default current_date,
  p_fecha_fin date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha_inicio date := coalesce(p_fecha_inicio, current_date);
  v_fecha_fin date := coalesce(p_fecha_fin, p_fecha_inicio, current_date);
begin
  if v_fecha_fin < v_fecha_inicio then
    raise exception 'Rango de fechas invalido para refresh_dashboard_kpis_incremental: % < %', v_fecha_fin, v_fecha_inicio;
  end if;

  delete from public.dashboard_kpis
  where fecha_corte between v_fecha_inicio and v_fecha_fin;

  insert into public.dashboard_kpis (
    fecha_corte,
    cuenta_cliente_id,
    cuenta_cliente,
    cuenta_cliente_identificador,
    promotores_activos,
    checkins_validos,
    jornadas_pendientes,
    alertas_operativas,
    jornadas_operadas,
    ventas_confirmadas,
    monto_confirmado,
    afiliaciones_love,
    asistencia_porcentaje,
    cuotas_cumplidas_periodo,
    neto_nomina_periodo,
    refreshed_at
  )
  select
    fecha_corte,
    cuenta_cliente_id,
    cuenta_cliente,
    cuenta_cliente_identificador,
    promotores_activos::integer,
    checkins_validos::integer,
    jornadas_pendientes::integer,
    alertas_operativas::integer,
    jornadas_operadas::integer,
    ventas_confirmadas::integer,
    monto_confirmado,
    afiliaciones_love,
    asistencia_porcentaje,
    cuotas_cumplidas_periodo::integer,
    neto_nomina_periodo,
    refreshed_at
  from public.dashboard_kpis_source_rows(v_fecha_inicio, v_fecha_fin)
  on conflict (cuenta_cliente_id, fecha_corte) do update
  set
    cuenta_cliente = excluded.cuenta_cliente,
    cuenta_cliente_identificador = excluded.cuenta_cliente_identificador,
    promotores_activos = excluded.promotores_activos,
    checkins_validos = excluded.checkins_validos,
    jornadas_pendientes = excluded.jornadas_pendientes,
    alertas_operativas = excluded.alertas_operativas,
    jornadas_operadas = excluded.jornadas_operadas,
    ventas_confirmadas = excluded.ventas_confirmadas,
    monto_confirmado = excluded.monto_confirmado,
    afiliaciones_love = excluded.afiliaciones_love,
    asistencia_porcentaje = excluded.asistencia_porcentaje,
    cuotas_cumplidas_periodo = excluded.cuotas_cumplidas_periodo,
    neto_nomina_periodo = excluded.neto_nomina_periodo,
    refreshed_at = excluded.refreshed_at;
end;
$$;

create or replace function public.refresh_dashboard_kpis()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_dashboard_kpis_incremental(current_date, current_date);
end;
$$;

select public.refresh_dashboard_kpis_incremental(current_date - 29, current_date);

grant select on public.dashboard_kpis to authenticated;
