create table if not exists public.mensaje_encuesta_pregunta (
  id uuid primary key default gen_random_uuid(),
  mensaje_id uuid not null references public.mensaje_interno(id) on delete cascade,
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete cascade,
  orden integer not null,
  titulo text not null,
  descripcion text null,
  tipo_pregunta text not null check (tipo_pregunta in ('OPCION_MULTIPLE', 'RESPUESTA_LIBRE')),
  opciones jsonb not null default '[]'::jsonb,
  obligatoria boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (mensaje_id, orden)
);

create table if not exists public.mensaje_encuesta_respuesta (
  id uuid primary key default gen_random_uuid(),
  mensaje_id uuid not null references public.mensaje_interno(id) on delete cascade,
  mensaje_receptor_id uuid not null references public.mensaje_receptor(id) on delete cascade,
  pregunta_id uuid not null references public.mensaje_encuesta_pregunta(id) on delete cascade,
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete cascade,
  empleado_id uuid not null references public.empleado(id) on delete cascade,
  opcion_id text null,
  opcion_label text null,
  respuesta_texto text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (mensaje_receptor_id, pregunta_id)
);

create index if not exists mensaje_encuesta_pregunta_mensaje_idx
  on public.mensaje_encuesta_pregunta (mensaje_id, orden);

create index if not exists mensaje_encuesta_pregunta_cuenta_idx
  on public.mensaje_encuesta_pregunta (cuenta_cliente_id, mensaje_id);

create index if not exists mensaje_encuesta_respuesta_mensaje_idx
  on public.mensaje_encuesta_respuesta (mensaje_id, pregunta_id);

create index if not exists mensaje_encuesta_respuesta_receptor_idx
  on public.mensaje_encuesta_respuesta (mensaje_receptor_id, pregunta_id);

create index if not exists mensaje_encuesta_respuesta_cuenta_idx
  on public.mensaje_encuesta_respuesta (cuenta_cliente_id, mensaje_id);

drop trigger if exists set_mensaje_encuesta_pregunta_updated_at on public.mensaje_encuesta_pregunta;
create trigger set_mensaje_encuesta_pregunta_updated_at
before update on public.mensaje_encuesta_pregunta
for each row
execute function public.set_updated_at();

drop trigger if exists set_mensaje_encuesta_respuesta_updated_at on public.mensaje_encuesta_respuesta;
create trigger set_mensaje_encuesta_respuesta_updated_at
before update on public.mensaje_encuesta_respuesta
for each row
execute function public.set_updated_at();

alter table public.mensaje_encuesta_pregunta enable row level security;
alter table public.mensaje_encuesta_respuesta enable row level security;

drop policy if exists mensaje_encuesta_pregunta_select_authenticated on public.mensaje_encuesta_pregunta;
create policy mensaje_encuesta_pregunta_select_authenticated
on public.mensaje_encuesta_pregunta
for select
using (auth.role() = 'authenticated');

drop policy if exists mensaje_encuesta_pregunta_insert_authenticated on public.mensaje_encuesta_pregunta;
create policy mensaje_encuesta_pregunta_insert_authenticated
on public.mensaje_encuesta_pregunta
for insert
with check (auth.role() = 'authenticated');

drop policy if exists mensaje_encuesta_pregunta_update_authenticated on public.mensaje_encuesta_pregunta;
create policy mensaje_encuesta_pregunta_update_authenticated
on public.mensaje_encuesta_pregunta
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists mensaje_encuesta_respuesta_select_authenticated on public.mensaje_encuesta_respuesta;
create policy mensaje_encuesta_respuesta_select_authenticated
on public.mensaje_encuesta_respuesta
for select
using (auth.role() = 'authenticated');

drop policy if exists mensaje_encuesta_respuesta_insert_authenticated on public.mensaje_encuesta_respuesta;
create policy mensaje_encuesta_respuesta_insert_authenticated
on public.mensaje_encuesta_respuesta
for insert
with check (auth.role() = 'authenticated');

drop policy if exists mensaje_encuesta_respuesta_update_authenticated on public.mensaje_encuesta_respuesta;
create policy mensaje_encuesta_respuesta_update_authenticated
on public.mensaje_encuesta_respuesta
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
