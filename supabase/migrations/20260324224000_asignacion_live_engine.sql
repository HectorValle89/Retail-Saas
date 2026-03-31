alter table public.asignacion
  add column if not exists naturaleza text not null default 'BASE'
    check (naturaleza in ('BASE', 'MOVIMIENTO')),
  add column if not exists retorna_a_base boolean not null default false,
  add column if not exists asignacion_base_id uuid references public.asignacion(id) on delete set null,
  add column if not exists asignacion_origen_id uuid references public.asignacion(id) on delete set null,
  add column if not exists prioridad integer not null default 100 check (prioridad >= 0),
  add column if not exists motivo_movimiento text,
  add column if not exists generado_automaticamente boolean not null default false;

create index if not exists idx_asignacion_motor_empleado
on public.asignacion(empleado_id, estado_publicacion, fecha_inicio desc, coalesce(fecha_fin, '9999-12-31'::date));

create index if not exists idx_asignacion_naturaleza
on public.asignacion(naturaleza, fecha_inicio desc);
