-- Plantilla base para tablas nuevas en español latino
-- Regla de oro: toda tabla nueva debe nombrarse en español latino.
-- Excepción documentada:
-- `created_at` y `updated_at` se conservan solo si existe una razón técnica real.

create table if not exists public.nombre_tabla_en_espanol (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  estado text not null default 'activo',
  fecha_registro date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nombre_tabla_en_espanol enable row level security;

-- Política de ejemplo. Ajustar según el caso real.
create policy "leer_nombre_tabla_en_espanol"
on public.nombre_tabla_en_espanol
for select
to authenticated
using (true);

-- Si se necesita sincronizar updated_at, agregar trigger según el estándar vigente del proyecto.
