create table if not exists public.registro_extemporaneo (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id),
  empleado_id uuid not null references public.empleado(id),
  supervisor_empleado_id uuid null references public.empleado(id),
  pdv_id uuid not null references public.pdv(id),
  asistencia_id uuid null references public.asistencia(id),
  fecha_operativa date not null,
  fecha_registro_utc timestamptz not null default timezone('utc', now()),
  tipo_registro text not null check (tipo_registro in ('VENTA', 'LOVE_ISDIN', 'AMBAS')),
  estatus text not null default 'PENDIENTE_APROBACION' check (estatus in ('PENDIENTE_APROBACION', 'APROBADO', 'RECHAZADO')),
  motivo text not null,
  motivo_rechazo text null,
  evidencia_url text null,
  evidencia_hash text null,
  evidencia_thumbnail_url text null,
  evidencia_thumbnail_hash text null,
  venta_payload jsonb not null default '{}'::jsonb,
  love_payload jsonb not null default '{}'::jsonb,
  venta_registro_id uuid null references public.venta(id),
  love_registro_id uuid null references public.love_isdin(id),
  aprobado_por_empleado_id uuid null references public.empleado(id),
  aprobado_en timestamptz null,
  rechazado_por_empleado_id uuid null references public.empleado(id),
  rechazado_en timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_registro_extemporaneo_cuenta_estatus_fecha
  on public.registro_extemporaneo(cuenta_cliente_id, estatus, fecha_operativa desc);

create index if not exists idx_registro_extemporaneo_supervisor_estatus_fecha
  on public.registro_extemporaneo(supervisor_empleado_id, estatus, fecha_operativa desc);

create index if not exists idx_registro_extemporaneo_empleado_fecha
  on public.registro_extemporaneo(empleado_id, fecha_operativa desc);

create index if not exists idx_registro_extemporaneo_pdv_fecha
  on public.registro_extemporaneo(pdv_id, fecha_operativa desc);
