create table if not exists public.asignacion_descanso_override (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid null references public.cuenta_cliente(id) on delete cascade,
  asignacion_id uuid not null references public.asignacion(id) on delete cascade,
  empleado_id uuid not null references public.empleado(id) on delete cascade,
  vigente_desde date not null,
  vigente_hasta date null,
  fechas_descanso text[] not null default '{}'::text[],
  fechas_trabajo text[] not null default '{}'::text[],
  observaciones text null,
  activo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint asignacion_descanso_override_vigencia_valida
    check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

create unique index if not exists idx_asignacion_descanso_override_activo_unico
  on public.asignacion_descanso_override(asignacion_id)
  where activo;

create index if not exists idx_asignacion_descanso_override_asignacion_fecha
  on public.asignacion_descanso_override(asignacion_id, vigente_desde desc, vigente_hasta desc);

create index if not exists idx_asignacion_descanso_override_empleado_fecha
  on public.asignacion_descanso_override(empleado_id, vigente_desde desc, vigente_hasta desc);

create index if not exists idx_asignacion_descanso_override_cuenta_activo
  on public.asignacion_descanso_override(cuenta_cliente_id, activo);
