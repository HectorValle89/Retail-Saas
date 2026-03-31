create table if not exists public.mensaje_adjunto (
  id uuid primary key default gen_random_uuid(),
  mensaje_id uuid not null references public.mensaje_interno(id) on delete cascade,
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete cascade,
  archivo_hash_id uuid not null references public.archivo_hash(id) on delete restrict,
  nombre_archivo_original text not null,
  mime_type text null,
  tamano_bytes integer null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists mensaje_adjunto_mensaje_idx
  on public.mensaje_adjunto (mensaje_id, created_at desc);
create index if not exists mensaje_adjunto_cuenta_idx
  on public.mensaje_adjunto (cuenta_cliente_id, mensaje_id);
create index if not exists mensaje_adjunto_archivo_hash_idx
  on public.mensaje_adjunto (archivo_hash_id);

drop trigger if exists set_mensaje_adjunto_updated_at on public.mensaje_adjunto;
create trigger set_mensaje_adjunto_updated_at
before update on public.mensaje_adjunto
for each row
execute function public.set_updated_at();

alter table public.mensaje_adjunto enable row level security;

drop policy if exists mensaje_adjunto_select_authenticated on public.mensaje_adjunto;
create policy mensaje_adjunto_select_authenticated
on public.mensaje_adjunto
for select
using (auth.role() = 'authenticated');

drop policy if exists mensaje_adjunto_insert_authenticated on public.mensaje_adjunto;
create policy mensaje_adjunto_insert_authenticated
on public.mensaje_adjunto
for insert
with check (auth.role() = 'authenticated');

drop policy if exists mensaje_adjunto_update_authenticated on public.mensaje_adjunto;
create policy mensaje_adjunto_update_authenticated
on public.mensaje_adjunto
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
