begin;

create table if not exists public.ruta_cuota_supervisor_pdv (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  supervisor_empleado_id uuid not null references public.empleado(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  visitas_mensuales integer not null check (visitas_mensuales between 0 and 999),
  vigente_desde date not null,
  vigente_hasta date,
  creado_por_usuario_id uuid references public.usuario(id) on delete set null,
  actualizado_por_usuario_id uuid references public.usuario(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ruta_cuota_vigencia_mes_inicio_check
    check (extract(day from vigente_desde) = 1),
  constraint ruta_cuota_vigencia_rango_check
    check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  constraint ruta_cuota_version_unica
    unique (cuenta_cliente_id, supervisor_empleado_id, pdv_id, vigente_desde)
);

create index if not exists idx_ruta_cuota_cuenta_supervisor_vigencia
on public.ruta_cuota_supervisor_pdv (
  cuenta_cliente_id,
  supervisor_empleado_id,
  vigente_desde desc
);

create index if not exists idx_ruta_cuota_supervisor_pdv_vigencia
on public.ruta_cuota_supervisor_pdv (
  supervisor_empleado_id,
  pdv_id,
  vigente_desde desc,
  vigente_hasta
);

drop trigger if exists trg_ruta_cuota_supervisor_pdv_updated_at
on public.ruta_cuota_supervisor_pdv;

create trigger trg_ruta_cuota_supervisor_pdv_updated_at
before update on public.ruta_cuota_supervisor_pdv
for each row execute function public.actualizar_updated_at();

alter table public.ruta_cuota_supervisor_pdv enable row level security;

drop policy if exists "ruta_cuota_select_operacion"
on public.ruta_cuota_supervisor_pdv;

create policy "ruta_cuota_select_operacion"
on public.ruta_cuota_supervisor_pdv
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

grant select on table public.ruta_cuota_supervisor_pdv to authenticated;
grant select, insert, update on table public.ruta_cuota_supervisor_pdv to service_role;
revoke insert, update, delete on table public.ruta_cuota_supervisor_pdv from authenticated;

create or replace function public.guardar_ruta_cuotas_supervisor(
  p_cuenta_cliente_id uuid,
  p_supervisor_empleado_id uuid,
  p_vigente_desde date,
  p_cuotas jsonb,
  p_usuario_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_mes date := date_trunc('month', p_vigente_desde)::date;
  v_entry record;
  v_pdv_id uuid;
  v_visitas integer;
  v_siguiente_vigencia date;
  v_resultado jsonb := '{}'::jsonb;
begin
  if p_cuenta_cliente_id is null or p_supervisor_empleado_id is null then
    raise exception 'La cuenta y el supervisor son obligatorios.';
  end if;

  if p_vigente_desde is null or p_vigente_desde <> v_mes then
    raise exception 'La vigencia debe iniciar el primer día de un mes.';
  end if;

  if jsonb_typeof(p_cuotas) <> 'object' or p_cuotas = '{}'::jsonb then
    raise exception 'Se requiere al menos una cuota por PDV.';
  end if;

  if not exists (
    select 1
    from public.empleado e
    where e.id = p_supervisor_empleado_id
      and e.puesto = 'SUPERVISOR'
      and e.estatus_laboral = 'ACTIVO'
  ) then
    raise exception 'El supervisor no existe o no está activo.';
  end if;

  if not exists (
    select 1
    from public.usuario u
    where u.empleado_id = p_supervisor_empleado_id
      and u.cuenta_cliente_id = p_cuenta_cliente_id
      and u.estado_cuenta not in ('SUSPENDIDA', 'BAJA')
  ) and not exists (
    select 1
    from public.ruta_semanal ruta
    where ruta.supervisor_empleado_id = p_supervisor_empleado_id
      and ruta.cuenta_cliente_id = p_cuenta_cliente_id
  ) and not exists (
    select 1
    from public.asignacion asignacion
    where asignacion.supervisor_empleado_id = p_supervisor_empleado_id
      and asignacion.cuenta_cliente_id = p_cuenta_cliente_id
  ) then
    raise exception 'El supervisor no pertenece a la cuenta seleccionada.';
  end if;

  for v_entry in
    select key, value
    from jsonb_each_text(p_cuotas)
  loop
    begin
      v_pdv_id := v_entry.key::uuid;
    exception when invalid_text_representation then
      raise exception 'La cuota contiene un identificador de PDV inválido.';
    end;

    if v_entry.value !~ '^[0-9]+$' then
      raise exception 'La cuota del PDV % debe ser un entero no negativo.', v_pdv_id;
    end if;

    v_visitas := v_entry.value::integer;
    if v_visitas > 999 then
      raise exception 'La cuota del PDV % no puede superar 999 visitas mensuales.', v_pdv_id;
    end if;

    if not exists (
      select 1
      from public.cuenta_cliente_pdv ccp
      where ccp.cuenta_cliente_id = p_cuenta_cliente_id
        and ccp.pdv_id = v_pdv_id
        and ccp.activo = true
        and (ccp.fecha_fin is null or ccp.fecha_fin >= v_mes)
    ) then
      raise exception 'El PDV % no pertenece a la cuenta activa de la cuota.', v_pdv_id;
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(
        p_cuenta_cliente_id::text || ':' || p_supervisor_empleado_id::text || ':' || v_pdv_id::text,
        0
      )
    );

    select min(cuota.vigente_desde)
    into v_siguiente_vigencia
    from public.ruta_cuota_supervisor_pdv cuota
    where cuota.cuenta_cliente_id = p_cuenta_cliente_id
      and cuota.supervisor_empleado_id = p_supervisor_empleado_id
      and cuota.pdv_id = v_pdv_id
      and cuota.vigente_desde > v_mes;

    update public.ruta_cuota_supervisor_pdv cuota
    set
      vigente_hasta = v_mes - 1,
      actualizado_por_usuario_id = p_usuario_id,
      updated_at = now()
    where cuota.cuenta_cliente_id = p_cuenta_cliente_id
      and cuota.supervisor_empleado_id = p_supervisor_empleado_id
      and cuota.pdv_id = v_pdv_id
      and cuota.vigente_desde < v_mes
      and (cuota.vigente_hasta is null or cuota.vigente_hasta >= v_mes);

    insert into public.ruta_cuota_supervisor_pdv (
      cuenta_cliente_id,
      supervisor_empleado_id,
      pdv_id,
      visitas_mensuales,
      vigente_desde,
      vigente_hasta,
      creado_por_usuario_id,
      actualizado_por_usuario_id,
      metadata
    )
    values (
      p_cuenta_cliente_id,
      p_supervisor_empleado_id,
      v_pdv_id,
      v_visitas,
      v_mes,
      case when v_siguiente_vigencia is null then null else v_siguiente_vigencia - 1 end,
      p_usuario_id,
      p_usuario_id,
      jsonb_build_object('origen', 'GESTION_CUOTAS_RECURRENTES')
    )
    on conflict (cuenta_cliente_id, supervisor_empleado_id, pdv_id, vigente_desde)
    do update set
      visitas_mensuales = excluded.visitas_mensuales,
      vigente_hasta = excluded.vigente_hasta,
      actualizado_por_usuario_id = excluded.actualizado_por_usuario_id,
      metadata = public.ruta_cuota_supervisor_pdv.metadata || excluded.metadata,
      updated_at = now();

    v_resultado := v_resultado || jsonb_build_object(v_pdv_id::text, v_visitas);
  end loop;

  return v_resultado;
end;
$$;

revoke all on function public.guardar_ruta_cuotas_supervisor(uuid, uuid, date, jsonb, uuid)
from public, anon, authenticated;
grant execute on function public.guardar_ruta_cuotas_supervisor(uuid, uuid, date, jsonb, uuid)
to service_role;

with legacy_versions as (
  select
    ruta.cuenta_cliente_id,
    ruta.supervisor_empleado_id,
    quota.key::uuid as pdv_id,
    quota.value::integer as visitas_mensuales,
    row_number() over (
      partition by ruta.cuenta_cliente_id, ruta.supervisor_empleado_id, quota.key
      order by ruta.updated_at desc, ruta.semana_inicio desc, ruta.id desc
    ) as version_rank
  from public.ruta_semanal ruta
  cross join lateral jsonb_each_text(
    coalesce(ruta.metadata -> 'pdvMonthlyQuotas', '{}'::jsonb)
  ) quota
  where quota.key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and quota.value ~ '^[0-9]+$'
    and quota.value::integer between 0 and 999
)
insert into public.ruta_cuota_supervisor_pdv (
  cuenta_cliente_id,
  supervisor_empleado_id,
  pdv_id,
  visitas_mensuales,
  vigente_desde,
  vigente_hasta,
  metadata
)
select
  legacy.cuenta_cliente_id,
  legacy.supervisor_empleado_id,
  legacy.pdv_id,
  legacy.visitas_mensuales,
  date_trunc('month', timezone('America/Mexico_City', now()))::date,
  null,
  jsonb_build_object('origen', 'BACKFILL_RUTA_SEMANAL_METADATA')
from legacy_versions legacy
where legacy.version_rank = 1
on conflict (cuenta_cliente_id, supervisor_empleado_id, pdv_id, vigente_desde)
do nothing;

with periodo_actual as (
  select
    date_trunc('month', timezone('America/Mexico_City', now()))::date as mes_inicio,
    (date_trunc('month', timezone('America/Mexico_City', now())) + interval '1 month - 1 day')::date
      as mes_fin
), pares_operativos as (
  select distinct
    ccp.cuenta_cliente_id,
    sp.empleado_id as supervisor_empleado_id,
    sp.pdv_id
  from public.supervisor_pdv sp
  join public.empleado supervisor
    on supervisor.id = sp.empleado_id
   and supervisor.puesto = 'SUPERVISOR'
   and supervisor.estatus_laboral = 'ACTIVO'
  join public.cuenta_cliente_pdv ccp
    on ccp.pdv_id = sp.pdv_id
   and ccp.activo = true
  cross join periodo_actual periodo
  where sp.activo = true
    and sp.fecha_inicio <= periodo.mes_fin
    and (sp.fecha_fin is null or sp.fecha_fin >= periodo.mes_inicio)
    and ccp.fecha_inicio <= periodo.mes_fin
    and (ccp.fecha_fin is null or ccp.fecha_fin >= periodo.mes_inicio)

  union

  select distinct
    asignacion.cuenta_cliente_id,
    asignacion.supervisor_empleado_id,
    asignacion.pdv_id
  from public.asignacion asignacion
  join public.empleado supervisor
    on supervisor.id = asignacion.supervisor_empleado_id
   and supervisor.puesto = 'SUPERVISOR'
   and supervisor.estatus_laboral = 'ACTIVO'
  cross join periodo_actual periodo
  where asignacion.cuenta_cliente_id is not null
    and asignacion.supervisor_empleado_id is not null
    and asignacion.estado_publicacion = 'PUBLICADA'
    and asignacion.fecha_inicio <= periodo.mes_fin
    and (asignacion.fecha_fin is null or asignacion.fecha_fin >= periodo.mes_inicio)
)
insert into public.ruta_cuota_supervisor_pdv (
  cuenta_cliente_id,
  supervisor_empleado_id,
  pdv_id,
  visitas_mensuales,
  vigente_desde,
  vigente_hasta,
  metadata
)
select
  par.cuenta_cliente_id,
  par.supervisor_empleado_id,
  par.pdv_id,
  0,
  periodo.mes_inicio,
  null,
  jsonb_build_object('origen', 'INICIALIZACION_ESTRUCTURAL')
from pares_operativos par
cross join periodo_actual periodo
on conflict (cuenta_cliente_id, supervisor_empleado_id, pdv_id, vigente_desde)
do nothing;

comment on table public.ruta_cuota_supervisor_pdv is
  'Cuotas mensuales recurrentes de visita por supervisor y PDV, versionadas por vigencia.';

comment on column public.ruta_cuota_supervisor_pdv.vigente_hasta is
  'Nulo significa vigencia abierta; una nueva versión cierra automáticamente la anterior.';

commit;
