alter table public.pdv
add column if not exists metadata jsonb not null default '{}'::jsonb;
