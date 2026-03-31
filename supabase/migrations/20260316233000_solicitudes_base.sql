-- =====================================================
-- Fase 5 - Solicitudes operativas (incapacidades, permisos)
-- Objetivo:
--   habilitar un flujo base verificable para captura,
--   aprobacion y formalizacion de solicitudes.
-- =====================================================

create or replace function public.es_operador_solicitudes()
returns boolean
language sql
stable
as $$
  select public.get_my_role() in ('ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'NOMINA', 'RECLUTAMIENTO');
$$;

create table if not exists public.solicitud (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  supervisor_empleado_id uuid references public.empleado(id) on delete set null,
  tipo text not null check (
    tipo in ('INCAPACIDAD', 'VACACIONES', 'PERMISO')
  ),
  fecha_inicio date not null,
  fecha_fin date not null,
  motivo text,
  justificante_url text,
  justificante_hash text,
  estatus text not null default 'BORRADOR' check (
    estatus in ('BORRADOR', 'ENVIADA', 'VALIDADA_SUP', 'REGISTRADA_RH', 'REGISTRADA', 'RECHAZADA')
  ),
  comentarios text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);

create index if not exists idx_solicitud_cuenta_fechas
on public.solicitud(cuenta_cliente_id, fecha_inicio desc, fecha_fin desc);

create index if not exists idx_solicitud_empleado_fechas
on public.solicitud(empleado_id, fecha_inicio desc, fecha_fin desc);

create index if not exists idx_solicitud_estatus
on public.solicitud(estatus, fecha_inicio desc);

create index if not exists idx_solicitud_tipo_estatus
on public.solicitud(tipo, estatus, fecha_inicio desc);

create index if not exists idx_solicitud_justificante_hash
on public.solicitud(justificante_hash)
where justificante_hash is not null;

drop trigger if exists trg_solicitud_updated_at on public.solicitud;
create trigger trg_solicitud_updated_at
before update on public.solicitud
for each row execute function public.actualizar_updated_at();

alter table public.solicitud enable row level security;

drop policy if exists "solicitud_select_base" on public.solicitud;
create policy "solicitud_select_base"
on public.solicitud
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

drop policy if exists "solicitud_write_operacion" on public.solicitud;
create policy "solicitud_write_operacion"
on public.solicitud
for all
to authenticated
using (
  public.es_administrador()
  or public.es_operador_solicitudes()
  or empleado_id = public.get_my_empleado_id()
  or supervisor_empleado_id = public.get_my_empleado_id()
)
with check (
  public.es_administrador()
  or public.es_operador_solicitudes()
  or empleado_id = public.get_my_empleado_id()
  or supervisor_empleado_id = public.get_my_empleado_id()
);