alter table public.asignacion
  add column if not exists horario_referencia text;

create index if not exists idx_asignacion_vigencia
on public.asignacion(fecha_inicio, coalesce(fecha_fin, '9999-12-31'::date));