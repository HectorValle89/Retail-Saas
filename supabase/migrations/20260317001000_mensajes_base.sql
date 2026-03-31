create table if not exists public.mensaje_interno (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete cascade,
  creado_por_usuario_id uuid null references public.usuario(id) on delete set null,
  titulo text not null,
  cuerpo text not null,
  tipo text not null default 'MENSAJE' check (tipo in ('MENSAJE', 'ENCUESTA')),
  grupo_destino text not null check (grupo_destino in ('TODOS_DCS', 'ZONA', 'SUPERVISOR')),
  zona text null,
  supervisor_empleado_id uuid null references public.empleado(id) on delete set null,
  opciones_respuesta jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.mensaje_receptor (
  id uuid primary key default gen_random_uuid(),
  mensaje_id uuid not null references public.mensaje_interno(id) on delete cascade,
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete cascade,
  empleado_id uuid not null references public.empleado(id) on delete cascade,
  leido_en timestamptz null,
  respondido_en timestamptz null,
  respuesta text null,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'LEIDO', 'RESPONDIDO')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (mensaje_id, empleado_id)
);

create index if not exists mensaje_interno_cuenta_created_idx
  on public.mensaje_interno (cuenta_cliente_id, created_at desc);
create index if not exists mensaje_interno_grupo_idx
  on public.mensaje_interno (grupo_destino, zona, supervisor_empleado_id);
create index if not exists mensaje_receptor_empleado_estado_idx
  on public.mensaje_receptor (empleado_id, estado, created_at desc);
create index if not exists mensaje_receptor_cuenta_idx
  on public.mensaje_receptor (cuenta_cliente_id, mensaje_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_mensaje_interno_updated_at on public.mensaje_interno;
create trigger set_mensaje_interno_updated_at
before update on public.mensaje_interno
for each row
execute function public.set_updated_at();

drop trigger if exists set_mensaje_receptor_updated_at on public.mensaje_receptor;
create trigger set_mensaje_receptor_updated_at
before update on public.mensaje_receptor
for each row
execute function public.set_updated_at();

alter table public.mensaje_interno enable row level security;
alter table public.mensaje_receptor enable row level security;

drop policy if exists mensaje_interno_select_authenticated on public.mensaje_interno;
create policy mensaje_interno_select_authenticated
on public.mensaje_interno
for select
using (auth.role() = 'authenticated');

drop policy if exists mensaje_interno_insert_authenticated on public.mensaje_interno;
create policy mensaje_interno_insert_authenticated
on public.mensaje_interno
for insert
with check (auth.role() = 'authenticated');

drop policy if exists mensaje_interno_update_authenticated on public.mensaje_interno;
create policy mensaje_interno_update_authenticated
on public.mensaje_interno
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists mensaje_receptor_select_authenticated on public.mensaje_receptor;
create policy mensaje_receptor_select_authenticated
on public.mensaje_receptor
for select
using (auth.role() = 'authenticated');

drop policy if exists mensaje_receptor_insert_authenticated on public.mensaje_receptor;
create policy mensaje_receptor_insert_authenticated
on public.mensaje_receptor
for insert
with check (auth.role() = 'authenticated');

drop policy if exists mensaje_receptor_update_authenticated on public.mensaje_receptor;
create policy mensaje_receptor_update_authenticated
on public.mensaje_receptor
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');