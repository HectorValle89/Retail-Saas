alter table public.ruta_semanal
add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_ruta_semanal_metadata_gin
on public.ruta_semanal
using gin (metadata);
