-- =====================================================
-- Fase 2 - Nomina, cuotas y ledger base
-- Objetivo:
--   habilitar periodos de nomina, cuotas comerciales por
--   colaborador y ledger de movimientos para pre-nomina.
-- =====================================================

create or replace function public.es_operador_nomina()
returns boolean
language sql
stable
as $$
  select public.get_my_role() in ('ADMINISTRADOR', 'NOMINA');
$$;

create table if not exists public.nomina_periodo (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  fecha_inicio date not null,
  fecha_fin date not null,
  estado text not null default 'ABIERTO' check (estado in ('ABIERTO', 'CERRADO')),
  fecha_cierre timestamptz,
  observaciones text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);

create table if not exists public.cuota_empleado_periodo (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references public.nomina_periodo(id) on delete cascade,
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  cadena_id uuid references public.cadena(id) on delete restrict,
  objetivo_monto numeric(12,2) not null default 0 check (objetivo_monto >= 0),
  objetivo_unidades integer not null default 0 check (objetivo_unidades >= 0),
  avance_monto numeric(12,2) not null default 0 check (avance_monto >= 0),
  avance_unidades integer not null default 0 check (avance_unidades >= 0),
  factor_cuota numeric(6,2) not null default 1.00 check (factor_cuota > 0),
  cumplimiento_porcentaje numeric(6,2) not null default 0 check (cumplimiento_porcentaje >= 0),
  bono_estimado numeric(12,2) not null default 0 check (bono_estimado >= 0),
  estado text not null default 'EN_CURSO' check (estado in ('EN_CURSO', 'CUMPLIDA', 'RIESGO')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (periodo_id, empleado_id, cuenta_cliente_id, cadena_id)
);

create table if not exists public.nomina_ledger (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references public.nomina_periodo(id) on delete cascade,
  cuenta_cliente_id uuid references public.cuenta_cliente(id) on delete restrict,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  tipo_movimiento text not null check (tipo_movimiento in ('PERCEPCION', 'DEDUCCION', 'AJUSTE')),
  concepto text not null,
  referencia_tabla text,
  referencia_id uuid,
  monto numeric(12,2) not null check (monto >= 0),
  moneda text not null default 'MXN',
  notas text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_nomina_periodo_estado
on public.nomina_periodo(estado, fecha_inicio desc);

create index if not exists idx_cuota_periodo_empleado
on public.cuota_empleado_periodo(periodo_id, empleado_id);

create index if not exists idx_cuota_periodo_cuenta
on public.cuota_empleado_periodo(periodo_id, cuenta_cliente_id);

create index if not exists idx_ledger_periodo_empleado
on public.nomina_ledger(periodo_id, empleado_id, created_at desc);

create index if not exists idx_ledger_periodo_tipo
on public.nomina_ledger(periodo_id, tipo_movimiento, created_at desc);

drop trigger if exists trg_nomina_periodo_updated_at on public.nomina_periodo;
create trigger trg_nomina_periodo_updated_at
before update on public.nomina_periodo
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_cuota_empleado_periodo_updated_at on public.cuota_empleado_periodo;
create trigger trg_cuota_empleado_periodo_updated_at
before update on public.cuota_empleado_periodo
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_nomina_ledger_updated_at on public.nomina_ledger;
create trigger trg_nomina_ledger_updated_at
before update on public.nomina_ledger
for each row execute function public.actualizar_updated_at();

create or replace function public.validar_nomina_periodo_unico_abierto()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado = 'ABIERTO'
    and exists (
      select 1
      from public.nomina_periodo
      where estado = 'ABIERTO'
        and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) then
    raise exception 'NOMINA_SOLO_UN_PERIODO_ABIERTO';
  end if;

  if new.estado = 'CERRADO' and new.fecha_cierre is null then
    new.fecha_cierre = now();
  end if;

  if new.estado = 'ABIERTO' then
    new.fecha_cierre = null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_nomina_periodo_validar_estado on public.nomina_periodo;
create trigger trg_nomina_periodo_validar_estado
before insert or update of estado on public.nomina_periodo
for each row execute function public.validar_nomina_periodo_unico_abierto();

create or replace function public.validar_nomina_detalle_periodo_abierto()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_estado text;
begin
  select estado
  into v_estado
  from public.nomina_periodo
  where id = new.periodo_id;

  if not found then
    raise exception 'NOMINA_PERIODO_NO_ENCONTRADO';
  end if;

  if v_estado <> 'ABIERTO' then
    raise exception 'NOMINA_PERIODO_CERRADO';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cuota_empleado_periodo_validar_abierto on public.cuota_empleado_periodo;
create trigger trg_cuota_empleado_periodo_validar_abierto
before insert or update on public.cuota_empleado_periodo
for each row execute function public.validar_nomina_detalle_periodo_abierto();

drop trigger if exists trg_nomina_ledger_validar_abierto on public.nomina_ledger;
create trigger trg_nomina_ledger_validar_abierto
before insert or update on public.nomina_ledger
for each row execute function public.validar_nomina_detalle_periodo_abierto();

alter table public.nomina_periodo enable row level security;
alter table public.cuota_empleado_periodo enable row level security;
alter table public.nomina_ledger enable row level security;

drop policy if exists "nomina_periodo_select_operador" on public.nomina_periodo;
create policy "nomina_periodo_select_operador"
on public.nomina_periodo
for select
to authenticated
using (public.es_operador_nomina());

drop policy if exists "nomina_periodo_write_operador" on public.nomina_periodo;
create policy "nomina_periodo_write_operador"
on public.nomina_periodo
for all
to authenticated
using (public.es_operador_nomina())
with check (public.es_operador_nomina());

drop policy if exists "cuota_empleado_periodo_select_operador" on public.cuota_empleado_periodo;
create policy "cuota_empleado_periodo_select_operador"
on public.cuota_empleado_periodo
for select
to authenticated
using (public.es_operador_nomina());

drop policy if exists "cuota_empleado_periodo_write_operador" on public.cuota_empleado_periodo;
create policy "cuota_empleado_periodo_write_operador"
on public.cuota_empleado_periodo
for all
to authenticated
using (public.es_operador_nomina())
with check (public.es_operador_nomina());

drop policy if exists "nomina_ledger_select_operador" on public.nomina_ledger;
create policy "nomina_ledger_select_operador"
on public.nomina_ledger
for select
to authenticated
using (public.es_operador_nomina());

drop policy if exists "nomina_ledger_write_operador" on public.nomina_ledger;
create policy "nomina_ledger_write_operador"
on public.nomina_ledger
for all
to authenticated
using (public.es_operador_nomina())
with check (public.es_operador_nomina());
