-- =====================================================
-- Fase 1 - Base de asignaciones
-- Alineado a:
--   1. .kiro/specs/field-force-platform/design.md
--   2. .kiro/specs/field-force-platform/requirements.md
--   3. .kiro/specs/field-force-platform/tasks.md
-- =====================================================

create table if not exists public.asignacion (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid references public.cuenta_cliente(id) on delete restrict,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  supervisor_empleado_id uuid references public.empleado(id) on delete restrict,
  clave_btl text,
  tipo text not null check (tipo in ('FIJA', 'ROTATIVA', 'COBERTURA')),
  factor_tiempo numeric(6,3) not null default 1.000 check (factor_tiempo > 0),
  dias_laborales text,
  dia_descanso text,
  fecha_inicio date not null,
  fecha_fin date,
  observaciones text,
  estado_publicacion text not null default 'BORRADOR' check (estado_publicacion in ('BORRADOR', 'PUBLICADA')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_asignacion_empleado on public.asignacion(empleado_id, fecha_inicio desc);
create index if not exists idx_asignacion_pdv on public.asignacion(pdv_id, fecha_inicio desc);
create index if not exists idx_asignacion_cuenta_cliente on public.asignacion(cuenta_cliente_id, fecha_inicio desc);
create index if not exists idx_asignacion_estado_publicacion on public.asignacion(estado_publicacion);

create trigger trg_asignacion_updated_at
before update on public.asignacion
for each row execute function public.actualizar_updated_at();

alter table public.asignacion enable row level security;

create policy "asignacion_select_base"
on public.asignacion
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

create policy "asignacion_insert_admin"
on public.asignacion
for insert
to authenticated
with check (public.es_administrador());

create policy "asignacion_update_admin"
on public.asignacion
for update
to authenticated
using (public.es_administrador())
with check (public.es_administrador());
