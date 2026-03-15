-- =====================================================
-- Fase 0 - Catalogos operativos base
-- Objetivo:
--   incorporar catalogos reales de producto y misiones
--   para usar los archivos Excel del negocio como fuente
--   de verdad en la carga inicial.
-- =====================================================

create table if not exists public.producto (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  nombre text not null,
  nombre_corto text not null,
  categoria text not null,
  top_30 boolean not null default false,
  activo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mision_dia
add column if not exists codigo text;

alter table public.mision_dia
add column if not exists peso integer not null default 1;

create unique index if not exists idx_mision_dia_codigo on public.mision_dia(codigo)
where codigo is not null;

create trigger trg_producto_updated_at
before update on public.producto
for each row execute function public.actualizar_updated_at();

alter table public.producto enable row level security;

create policy "producto_select_interno"
on public.producto
for select
to authenticated
using (public.es_usuario_interno());

