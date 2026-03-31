create table if not exists public.asignacion_diaria_resuelta (
  fecha date not null,
  empleado_id uuid not null references public.empleado(id) on delete cascade,
  pdv_id uuid null references public.pdv(id) on delete set null,
  supervisor_empleado_id uuid null references public.empleado(id) on delete set null,
  coordinador_empleado_id uuid null references public.empleado(id) on delete set null,
  cuenta_cliente_id uuid null references public.cuenta_cliente(id) on delete set null,
  estado_operativo text not null
    check (estado_operativo in ('ASIGNADA_PDV', 'FORMACION', 'VACACIONES', 'INCAPACIDAD', 'FALTA_JUSTIFICADA', 'SIN_ASIGNACION')),
  origen text not null
    check (origen in ('BASE', 'COBERTURA_TEMPORAL', 'COBERTURA_PERMANENTE', 'FORMACION', 'VACACIONES', 'INCAPACIDAD', 'JUSTIFICACION', 'NINGUNO')),
  referencia_tabla text null
    check (referencia_tabla in ('asignacion', 'solicitud', 'formacion') or referencia_tabla is null),
  referencia_id uuid null,
  mensaje_operativo text null,
  laborable boolean not null default false,
  trabaja_en_tienda boolean not null default false,
  sede_formacion text null,
  horario_inicio text null,
  horario_fin text null,
  flags jsonb not null default '{}'::jsonb,
  refreshed_at timestamptz not null default timezone('utc', now()),
  primary key (empleado_id, fecha)
);

create index if not exists idx_asignacion_diaria_resuelta_fecha
  on public.asignacion_diaria_resuelta(fecha desc);

create index if not exists idx_asignacion_diaria_resuelta_supervisor_fecha
  on public.asignacion_diaria_resuelta(supervisor_empleado_id, fecha desc);

create index if not exists idx_asignacion_diaria_resuelta_coordinador_fecha
  on public.asignacion_diaria_resuelta(coordinador_empleado_id, fecha desc);

create index if not exists idx_asignacion_diaria_resuelta_cuenta_fecha
  on public.asignacion_diaria_resuelta(cuenta_cliente_id, fecha desc);

create index if not exists idx_asignacion_diaria_resuelta_estado_fecha
  on public.asignacion_diaria_resuelta(estado_operativo, fecha desc);

create index if not exists idx_asignacion_diaria_resuelta_pdv_fecha
  on public.asignacion_diaria_resuelta(pdv_id, fecha desc);

create index if not exists idx_asignacion_diaria_resuelta_flags_gin
  on public.asignacion_diaria_resuelta using gin (flags jsonb_path_ops);

create table if not exists public.asignacion_diaria_dirty_queue (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleado(id) on delete cascade,
  fecha_inicio date not null,
  fecha_fin date not null,
  motivo text not null,
  payload jsonb not null default '{}'::jsonb,
  estado text not null default 'PENDIENTE'
    check (estado in ('PENDIENTE', 'PROCESANDO', 'PROCESADO', 'ERROR')),
  intentos integer not null default 0 check (intentos >= 0),
  error_message text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  procesado_at timestamptz null,
  constraint asignacion_diaria_dirty_queue_rango_valido
    check (fecha_fin >= fecha_inicio)
);

create index if not exists idx_asignacion_diaria_dirty_queue_estado_created
  on public.asignacion_diaria_dirty_queue(estado, created_at asc);

create index if not exists idx_asignacion_diaria_dirty_queue_empleado_rango
  on public.asignacion_diaria_dirty_queue(empleado_id, fecha_inicio asc, fecha_fin asc);
