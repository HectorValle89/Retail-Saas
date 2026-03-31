-- =====================================================
-- Fase 4-5 - LOVE ISDIN, gastos y entrega de material
-- Objetivo:
--   habilitar la operacion diaria y el control operativo
--   de afiliaciones, gastos y materiales.
-- =====================================================

create or replace function public.es_operador_love()
returns boolean
language sql
stable
as $$
  select public.get_my_role() in ('ADMINISTRADOR', 'LOVE_IS', 'SUPERVISOR', 'COORDINADOR');
$$;

create or replace function public.es_operador_control_operativo()
returns boolean
language sql
stable
as $$
  select public.get_my_role() in ('ADMINISTRADOR', 'NOMINA', 'LOGISTICA', 'SUPERVISOR', 'COORDINADOR');
$$;

create table if not exists public.love_isdin (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  asistencia_id uuid references public.asistencia(id) on delete set null,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  qr_personal text,
  afiliado_nombre text not null,
  afiliado_contacto text,
  ticket_folio text,
  fecha_utc timestamptz not null default now(),
  estatus text not null default 'PENDIENTE_VALIDACION' check (
    estatus in ('PENDIENTE_VALIDACION', 'VALIDA', 'RECHAZADA', 'DUPLICADA')
  ),
  evidencia_url text,
  evidencia_hash text,
  origen text not null default 'ONLINE' check (
    origen in ('ONLINE', 'OFFLINE_SYNC', 'AJUSTE_ADMIN')
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gasto (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  supervisor_empleado_id uuid references public.empleado(id) on delete set null,
  pdv_id uuid references public.pdv(id) on delete set null,
  formacion_evento_id uuid references public.formacion_evento(id) on delete set null,
  tipo text not null check (
    tipo in ('VIATICOS', 'TRANSPORTE', 'ALIMENTOS', 'MATERIAL_POP', 'HOSPEDAJE', 'OTRO')
  ),
  monto numeric(12,2) not null check (monto >= 0),
  moneda text not null default 'MXN',
  fecha_gasto date not null default current_date,
  comprobante_url text,
  comprobante_hash text,
  estatus text not null default 'PENDIENTE' check (
    estatus in ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'REEMBOLSADO')
  ),
  notas text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.entrega_material (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  supervisor_empleado_id uuid references public.empleado(id) on delete set null,
  pdv_id uuid references public.pdv(id) on delete set null,
  tipo_material text not null,
  descripcion_material text,
  cantidad integer not null default 1 check (cantidad > 0),
  fecha_entrega date not null default current_date,
  fecha_devolucion date,
  estado text not null default 'ENTREGADO' check (
    estado in ('ENTREGADO', 'DEVUELTO_PARCIAL', 'DEVUELTO', 'PERDIDO', 'DANADO')
  ),
  evidencia_entrega_url text,
  evidencia_entrega_hash text,
  evidencia_devolucion_url text,
  evidencia_devolucion_hash text,
  observaciones text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fecha_devolucion is null or fecha_devolucion >= fecha_entrega)
);

create index if not exists idx_love_isdin_cuenta_fecha
on public.love_isdin(cuenta_cliente_id, fecha_utc desc);

create index if not exists idx_love_isdin_empleado_fecha
on public.love_isdin(empleado_id, fecha_utc desc);

create index if not exists idx_love_isdin_estatus
on public.love_isdin(estatus, fecha_utc desc);

create index if not exists idx_gasto_cuenta_fecha
on public.gasto(cuenta_cliente_id, fecha_gasto desc);

create index if not exists idx_gasto_empleado_fecha
on public.gasto(empleado_id, fecha_gasto desc);

create index if not exists idx_gasto_estatus
on public.gasto(estatus, fecha_gasto desc);

create index if not exists idx_entrega_material_cuenta_fecha
on public.entrega_material(cuenta_cliente_id, fecha_entrega desc);

create index if not exists idx_entrega_material_empleado
on public.entrega_material(empleado_id, fecha_entrega desc);

create index if not exists idx_entrega_material_estado
on public.entrega_material(estado, fecha_entrega desc);

drop trigger if exists trg_love_isdin_updated_at on public.love_isdin;
create trigger trg_love_isdin_updated_at
before update on public.love_isdin
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_gasto_updated_at on public.gasto;
create trigger trg_gasto_updated_at
before update on public.gasto
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_entrega_material_updated_at on public.entrega_material;
create trigger trg_entrega_material_updated_at
before update on public.entrega_material
for each row execute function public.actualizar_updated_at();

alter table public.love_isdin enable row level security;
alter table public.gasto enable row level security;
alter table public.entrega_material enable row level security;

drop policy if exists "love_isdin_select_base" on public.love_isdin;
create policy "love_isdin_select_base"
on public.love_isdin
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

drop policy if exists "love_isdin_write_operacion" on public.love_isdin;
create policy "love_isdin_write_operacion"
on public.love_isdin
for all
to authenticated
using (
  public.es_administrador()
  or public.es_operador_love()
  or empleado_id = public.get_my_empleado_id()
)
with check (
  public.es_administrador()
  or public.es_operador_love()
  or empleado_id = public.get_my_empleado_id()
);

drop policy if exists "gasto_select_base" on public.gasto;
create policy "gasto_select_base"
on public.gasto
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

drop policy if exists "gasto_write_operacion" on public.gasto;
create policy "gasto_write_operacion"
on public.gasto
for all
to authenticated
using (
  public.es_administrador()
  or public.es_operador_control_operativo()
  or empleado_id = public.get_my_empleado_id()
  or supervisor_empleado_id = public.get_my_empleado_id()
)
with check (
  public.es_administrador()
  or public.es_operador_control_operativo()
  or empleado_id = public.get_my_empleado_id()
  or supervisor_empleado_id = public.get_my_empleado_id()
);

drop policy if exists "entrega_material_select_base" on public.entrega_material;
create policy "entrega_material_select_base"
on public.entrega_material
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

drop policy if exists "entrega_material_write_operacion" on public.entrega_material;
create policy "entrega_material_write_operacion"
on public.entrega_material
for all
to authenticated
using (
  public.es_administrador()
  or public.es_operador_control_operativo()
  or empleado_id = public.get_my_empleado_id()
  or supervisor_empleado_id = public.get_my_empleado_id()
)
with check (
  public.es_administrador()
  or public.es_operador_control_operativo()
  or empleado_id = public.get_my_empleado_id()
  or supervisor_empleado_id = public.get_my_empleado_id()
);
