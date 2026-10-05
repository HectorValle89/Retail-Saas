-- Cuotas mensuales persistidas para dashboard y exportacion.
-- Todo calculo diario ocurre al escribir; las lecturas consumen una fila por PDV o DC.

create table if not exists public.cuota_mensual_resumen_pdv (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  mes date not null,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  cuota_mensual numeric(14,2) not null default 0 check (cuota_mensual >= 0),
  cuota_atribuida numeric(14,2) not null default 0 check (cuota_atribuida >= 0),
  cuota_no_atribuida numeric(14,2) not null default 0 check (cuota_no_atribuida >= 0),
  dias_con_cuota integer not null default 0 check (dias_con_cuota >= 0),
  dias_cubiertos integer not null default 0 check (dias_cubiertos >= 0),
  version bigint not null default 1,
  refreshed_at timestamptz not null default now(),
  unique (cuenta_cliente_id, mes, pdv_id)
);

create table if not exists public.cuota_mensual_resumen_dc (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  mes date not null,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  periodo_id uuid references public.nomina_periodo(id) on delete set null,
  cuota_individual numeric(14,2) not null default 0 check (cuota_individual >= 0),
  avance_monto numeric(14,2) not null default 0 check (avance_monto >= 0),
  cumplimiento_porcentaje numeric(8,2) not null default 0 check (cumplimiento_porcentaje >= 0),
  estado text not null default 'EN_CURSO' check (estado in ('EN_CURSO', 'CUMPLIDA', 'RIESGO')),
  dias_laborados integer not null default 0 check (dias_laborados >= 0),
  pdvs_atendidos integer not null default 0 check (pdvs_atendidos >= 0),
  version bigint not null default 1,
  refreshed_at timestamptz not null default now(),
  unique (cuenta_cliente_id, mes, empleado_id)
);

create index if not exists idx_cuota_mensual_resumen_pdv_scope
  on public.cuota_mensual_resumen_pdv(cuenta_cliente_id, mes, pdv_id);
create index if not exists idx_cuota_mensual_resumen_dc_scope
  on public.cuota_mensual_resumen_dc(cuenta_cliente_id, mes, cumplimiento_porcentaje, empleado_id);
create index if not exists idx_cuota_mensual_resumen_dc_periodo
  on public.cuota_mensual_resumen_dc(periodo_id, estado, cumplimiento_porcentaje);

alter table public.cuota_mensual_resumen_pdv enable row level security;
alter table public.cuota_mensual_resumen_dc enable row level security;

drop policy if exists cuota_mensual_resumen_pdv_select_scope on public.cuota_mensual_resumen_pdv;
create policy cuota_mensual_resumen_pdv_select_scope
on public.cuota_mensual_resumen_pdv for select to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

drop policy if exists cuota_mensual_resumen_dc_select_scope on public.cuota_mensual_resumen_dc;
create policy cuota_mensual_resumen_dc_select_scope
on public.cuota_mensual_resumen_dc for select to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

grant select on table public.cuota_mensual_resumen_pdv to authenticated, service_role;
grant select on table public.cuota_mensual_resumen_dc to authenticated, service_role;
grant insert, update, delete on table public.cuota_mensual_resumen_pdv to service_role;
grant insert, update, delete on table public.cuota_mensual_resumen_dc to service_role;

create or replace view public.cuota_mensual_resumen_v
with (security_invoker = true)
as
select
  summary.id,
  summary.cuenta_cliente_id,
  summary.mes,
  summary.empleado_id,
  employee.id_nomina,
  employee.nombre_completo,
  employee.supervisor_empleado_id,
  summary.periodo_id,
  summary.cuota_individual,
  summary.avance_monto,
  summary.cumplimiento_porcentaje,
  summary.estado,
  summary.dias_laborados,
  summary.pdvs_atendidos,
  summary.version,
  summary.refreshed_at
from public.cuota_mensual_resumen_dc summary
join public.empleado employee on employee.id = summary.empleado_id;

grant select on public.cuota_mensual_resumen_v to authenticated, service_role;

create or replace function public.refrescar_cuota_mensual_resumen(
  p_cuenta_cliente_id uuid,
  p_mes date,
  p_pdv_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_mes_fin date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_version bigint := 1;
  v_attributions integer := 0;
  v_pdv_rows integer := 0;
  v_dc_rows integer := 0;
begin
  if p_cuenta_cliente_id is null or p_mes is null or p_mes <> v_mes then
    raise exception 'CUOTA_RESUMEN_SCOPE_INVALIDO';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'cuota-resumen:' || p_cuenta_cliente_id::text || ':' || v_mes::text, 0
  ));

  select coalesce(max(quota.version), 1) into v_version
  from public.cuotas_diarias_pdv quota
  where quota.cuenta_cliente_id = p_cuenta_cliente_id
    and quota.fecha between v_mes and v_mes_fin
    and quota.estado in ('PUBLICADA', 'CERRADA')
    and (p_pdv_ids is null or cardinality(p_pdv_ids) = 0 or quota.pdv_id = any(p_pdv_ids));

  delete from public.cuota_asignacion_diaria_dc attribution
  where attribution.cuenta_cliente_id = p_cuenta_cliente_id
    and attribution.fecha between v_mes and v_mes_fin
    and attribution.estado_calculo = 'VIGENTE'
    and (p_pdv_ids is null or cardinality(p_pdv_ids) = 0 or attribution.pdv_id = any(p_pdv_ids));

  with coverage as (
    select
      quota.id as cuota_diaria_pdv_id,
      quota.cuenta_cliente_id,
      resolved.empleado_id,
      quota.pdv_id,
      quota.fecha,
      quota.monto_cuota,
      quota.version,
      resolved.referencia_tabla,
      resolved.referencia_id,
      count(*) over (partition by quota.id) as participant_count,
      row_number() over (partition by quota.id order by resolved.empleado_id) as participant_rank
    from public.cuotas_diarias_pdv quota
    join public.asignacion_diaria_resuelta resolved
      on resolved.cuenta_cliente_id = quota.cuenta_cliente_id
     and resolved.pdv_id = quota.pdv_id
     and resolved.fecha = quota.fecha
     and resolved.estado_operativo = 'ASIGNADA_PDV'
     and resolved.trabaja_en_tienda
    where quota.cuenta_cliente_id = p_cuenta_cliente_id
      and quota.fecha between v_mes and v_mes_fin
      and quota.estado in ('PUBLICADA', 'CERRADA')
      and (p_pdv_ids is null or cardinality(p_pdv_ids) = 0 or quota.pdv_id = any(p_pdv_ids))
  ), split as (
    select coverage.*,
      round(coverage.monto_cuota * 100)::bigint as total_cents,
      floor(round(coverage.monto_cuota * 100) / coverage.participant_count)::bigint as base_cents
    from coverage
  )
  insert into public.cuota_asignacion_diaria_dc (
    cuota_diaria_pdv_id, cuenta_cliente_id, empleado_id, pdv_id, fecha,
    cuota_diaria_pdv, factor_participacion, monto_asignado, estado_calculo,
    motivo_ajuste, referencia_asignacion_id, version, metadata
  )
  select
    split.cuota_diaria_pdv_id, split.cuenta_cliente_id, split.empleado_id,
    split.pdv_id, split.fecha, split.monto_cuota,
    1::numeric / split.participant_count,
    (split.base_cents + case
      when split.participant_rank <= split.total_cents - split.base_cents * split.participant_count
      then 1 else 0 end)::numeric / 100,
    'VIGENTE',
    case when split.participant_count > 1 then 'CUOTA_DIVIDIDA_COBERTURA_SIMULTANEA' end,
    case when split.referencia_tabla = 'asignacion' then split.referencia_id end,
    split.version,
    jsonb_build_object('resumenPersistido', true, 'participantesPdvDia', split.participant_count)
  from split;
  get diagnostics v_attributions = row_count;

  delete from public.cuota_mensual_resumen_pdv summary
  where summary.cuenta_cliente_id = p_cuenta_cliente_id and summary.mes = v_mes
    and (p_pdv_ids is null or cardinality(p_pdv_ids) = 0 or summary.pdv_id = any(p_pdv_ids));

  insert into public.cuota_mensual_resumen_pdv (
    cuenta_cliente_id, mes, pdv_id, cuota_mensual, cuota_atribuida,
    cuota_no_atribuida, dias_con_cuota, dias_cubiertos, version, refreshed_at
  )
  select
    quota.cuenta_cliente_id, v_mes, quota.pdv_id,
    sum(quota.monto_cuota), coalesce(sum(daily.attributed), 0),
    greatest(sum(quota.monto_cuota) - coalesce(sum(daily.attributed), 0), 0),
    count(*) filter (where quota.monto_cuota > 0),
    count(*) filter (where coalesce(daily.attributed, 0) > 0),
    max(quota.version), now()
  from public.cuotas_diarias_pdv quota
  left join lateral (
    select sum(attribution.monto_asignado) attributed
    from public.cuota_asignacion_diaria_dc attribution
    where attribution.cuota_diaria_pdv_id = quota.id
      and attribution.estado_calculo = 'VIGENTE'
  ) daily on true
  where quota.cuenta_cliente_id = p_cuenta_cliente_id
    and quota.fecha between v_mes and v_mes_fin
    and quota.estado in ('PUBLICADA', 'CERRADA')
    and (p_pdv_ids is null or cardinality(p_pdv_ids) = 0 or quota.pdv_id = any(p_pdv_ids))
  group by quota.cuenta_cliente_id, quota.pdv_id;
  get diagnostics v_pdv_rows = row_count;

  delete from public.cuota_mensual_resumen_dc summary
  where summary.cuenta_cliente_id = p_cuenta_cliente_id and summary.mes = v_mes;

  insert into public.cuota_mensual_resumen_dc (
    cuenta_cliente_id, mes, empleado_id, periodo_id, cuota_individual,
    avance_monto, cumplimiento_porcentaje, estado, dias_laborados,
    pdvs_atendidos, version, refreshed_at
  )
  select
    attribution.cuenta_cliente_id,
    v_mes,
    attribution.empleado_id,
    period.id,
    sum(attribution.monto_asignado),
    coalesce(sales.avance_monto, 0),
    case when sum(attribution.monto_asignado) > 0
      then round(coalesce(sales.avance_monto, 0) * 100 / sum(attribution.monto_asignado), 2)
      else 0 end,
    case
      when sum(attribution.monto_asignado) > 0
       and coalesce(sales.avance_monto, 0) >= sum(attribution.monto_asignado) then 'CUMPLIDA'
      when sum(attribution.monto_asignado) > 0
       and coalesce(sales.avance_monto, 0) * 100 / sum(attribution.monto_asignado) < 70 then 'RIESGO'
      else 'EN_CURSO'
    end,
    count(distinct attribution.fecha),
    count(distinct attribution.pdv_id),
    max(attribution.version),
    now()
  from public.cuota_asignacion_diaria_dc attribution
  left join lateral (
    select sum(venta.total_monto) avance_monto
    from public.venta venta
    where venta.cuenta_cliente_id = attribution.cuenta_cliente_id
      and venta.empleado_id = attribution.empleado_id
      and venta.confirmada
      and (venta.fecha_utc at time zone 'America/Mexico_City')::date >= v_mes
      and (venta.fecha_utc at time zone 'America/Mexico_City')::date <= v_mes_fin
  ) sales on true
  left join lateral (
    select payroll.id
    from public.nomina_periodo payroll
    where payroll.fecha_inicio <= v_mes_fin and payroll.fecha_fin >= v_mes
    order by payroll.fecha_inicio desc limit 1
  ) period on true
  where attribution.cuenta_cliente_id = p_cuenta_cliente_id
    and attribution.fecha between v_mes and v_mes_fin
    and attribution.estado_calculo in ('VIGENTE', 'CIERRE')
  group by attribution.cuenta_cliente_id, attribution.empleado_id, period.id, sales.avance_monto;
  get diagnostics v_dc_rows = row_count;

  return jsonb_build_object(
    'ok', true, 'mes', v_mes, 'version', v_version,
    'atribuciones', v_attributions, 'pdvs', v_pdv_rows, 'empleados', v_dc_rows
  );
end;
$$;

create or replace function public.ajustar_cuota_mensual_por_venta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_mes date;
  v_new_mes date;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.confirmada then
    v_old_mes := date_trunc('month', old.fecha_utc at time zone 'America/Mexico_City')::date;
    update public.cuota_mensual_resumen_dc summary
    set avance_monto = greatest(summary.avance_monto - old.total_monto, 0),
        cumplimiento_porcentaje = case when summary.cuota_individual > 0
          then round(greatest(summary.avance_monto - old.total_monto, 0) * 100 / summary.cuota_individual, 2)
          else 0 end,
        estado = case
          when summary.cuota_individual > 0
           and greatest(summary.avance_monto - old.total_monto, 0) >= summary.cuota_individual then 'CUMPLIDA'
          when summary.cuota_individual > 0
           and greatest(summary.avance_monto - old.total_monto, 0) * 100 / summary.cuota_individual < 70 then 'RIESGO'
          else 'EN_CURSO' end,
        refreshed_at = now()
    where summary.cuenta_cliente_id = old.cuenta_cliente_id
      and summary.empleado_id = old.empleado_id and summary.mes = v_old_mes;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.confirmada then
    v_new_mes := date_trunc('month', new.fecha_utc at time zone 'America/Mexico_City')::date;
    update public.cuota_mensual_resumen_dc summary
    set avance_monto = summary.avance_monto + new.total_monto,
        cumplimiento_porcentaje = case when summary.cuota_individual > 0
          then round((summary.avance_monto + new.total_monto) * 100 / summary.cuota_individual, 2)
          else 0 end,
        estado = case
          when summary.cuota_individual > 0
           and summary.avance_monto + new.total_monto >= summary.cuota_individual then 'CUMPLIDA'
          when summary.cuota_individual > 0
           and (summary.avance_monto + new.total_monto) * 100 / summary.cuota_individual < 70 then 'RIESGO'
          else 'EN_CURSO' end,
        refreshed_at = now()
    where summary.cuenta_cliente_id = new.cuenta_cliente_id
      and summary.empleado_id = new.empleado_id and summary.mes = v_new_mes;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_venta_cuota_mensual_resumen on public.venta;
create trigger trg_venta_cuota_mensual_resumen
after insert or update of confirmada, total_monto, empleado_id, cuenta_cliente_id, fecha_utc or delete
on public.venta for each row execute function public.ajustar_cuota_mensual_por_venta();

revoke all on function public.refrescar_cuota_mensual_resumen(uuid, date, uuid[])
  from public, anon, authenticated;
grant execute on function public.refrescar_cuota_mensual_resumen(uuid, date, uuid[])
  to service_role;
revoke all on function public.ajustar_cuota_mensual_por_venta()
  from public, anon, authenticated;
