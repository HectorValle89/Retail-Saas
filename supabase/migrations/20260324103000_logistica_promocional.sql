-- =====================================================
-- Fase 5 - Logistica promocional
-- Objetivo:
--   reemplazar el control simple de entrega_material por
--   un flujo completo de catalogo, dispersion mensual,
--   recepcion formal en tienda y entrega final por PDV.
-- =====================================================

create table if not exists public.material_catalogo (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  nombre text not null,
  tipo text not null,
  cantidad_default integer not null default 1 check (cantidad_default > 0),
  requiere_ticket_compra boolean not null default false,
  requiere_evidencia_obligatoria boolean not null default true,
  activo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cuenta_cliente_id, nombre)
);

create table if not exists public.material_distribucion_mensual (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  supervisor_empleado_id uuid references public.empleado(id) on delete set null,
  confirmado_por_empleado_id uuid references public.empleado(id) on delete set null,
  mes_operacion date not null,
  estado text not null default 'PENDIENTE_RECEPCION' check (
    estado in (
      'PENDIENTE_RECEPCION',
      'RECIBIDA_CONFORME',
      'RECIBIDA_CON_OBSERVACIONES',
      'PENDIENTE_ACLARACION',
      'CANCELADA'
    )
  ),
  firma_recepcion_url text,
  firma_recepcion_hash text,
  foto_recepcion_url text,
  foto_recepcion_hash text,
  foto_recepcion_capturada_en timestamptz,
  confirmado_en timestamptz,
  observaciones text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_trunc('month', mes_operacion)::date = mes_operacion),
  unique (cuenta_cliente_id, pdv_id, mes_operacion)
);

create table if not exists public.material_distribucion_detalle (
  id uuid primary key default gen_random_uuid(),
  distribucion_id uuid not null references public.material_distribucion_mensual(id) on delete cascade,
  material_catalogo_id uuid not null references public.material_catalogo(id) on delete restrict,
  cantidad_enviada integer not null check (cantidad_enviada >= 0),
  cantidad_recibida integer not null default 0 check (cantidad_recibida >= 0),
  cantidad_entregada integer not null default 0 check (cantidad_entregada >= 0),
  cantidad_observada integer not null default 0 check (cantidad_observada >= 0),
  observaciones text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (distribucion_id, material_catalogo_id)
);

create table if not exists public.material_entrega_promocional (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  distribucion_id uuid references public.material_distribucion_mensual(id) on delete set null,
  distribucion_detalle_id uuid references public.material_distribucion_detalle(id) on delete set null,
  material_catalogo_id uuid not null references public.material_catalogo(id) on delete restrict,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  cantidad_entregada integer not null check (cantidad_entregada > 0),
  fecha_utc timestamptz not null default now(),
  evidencia_material_url text,
  evidencia_material_hash text,
  evidencia_pdv_url text,
  evidencia_pdv_hash text,
  ticket_compra_url text,
  ticket_compra_hash text,
  observaciones text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_material_catalogo_cuenta_activo
on public.material_catalogo(cuenta_cliente_id, activo, nombre);

create index if not exists idx_material_distribucion_mes_pdv
on public.material_distribucion_mensual(cuenta_cliente_id, mes_operacion desc, pdv_id);

create index if not exists idx_material_distribucion_estado
on public.material_distribucion_mensual(estado, mes_operacion desc);

create index if not exists idx_material_distribucion_detalle_distribucion
on public.material_distribucion_detalle(distribucion_id, material_catalogo_id);

create index if not exists idx_material_entrega_promocional_mes
on public.material_entrega_promocional(cuenta_cliente_id, fecha_utc desc, pdv_id);

create index if not exists idx_material_entrega_promocional_material
on public.material_entrega_promocional(material_catalogo_id, fecha_utc desc);

drop trigger if exists trg_material_catalogo_updated_at on public.material_catalogo;
create trigger trg_material_catalogo_updated_at
before update on public.material_catalogo
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_material_distribucion_mensual_updated_at on public.material_distribucion_mensual;
create trigger trg_material_distribucion_mensual_updated_at
before update on public.material_distribucion_mensual
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_material_distribucion_detalle_updated_at on public.material_distribucion_detalle;
create trigger trg_material_distribucion_detalle_updated_at
before update on public.material_distribucion_detalle
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_material_entrega_promocional_updated_at on public.material_entrega_promocional;
create trigger trg_material_entrega_promocional_updated_at
before update on public.material_entrega_promocional
for each row execute function public.actualizar_updated_at();

alter table public.material_catalogo enable row level security;
alter table public.material_distribucion_mensual enable row level security;
alter table public.material_distribucion_detalle enable row level security;
alter table public.material_entrega_promocional enable row level security;

drop policy if exists "material_catalogo_select_base" on public.material_catalogo;
create policy "material_catalogo_select_base"
on public.material_catalogo
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

drop policy if exists "material_catalogo_write_logistica" on public.material_catalogo;
create policy "material_catalogo_write_logistica"
on public.material_catalogo
for all
to authenticated
using (
  public.es_administrador()
  or public.get_my_role() in ('LOGISTICA', 'COORDINADOR')
)
with check (
  public.es_administrador()
  or public.get_my_role() in ('LOGISTICA', 'COORDINADOR')
);

drop policy if exists "material_distribucion_mensual_select_base" on public.material_distribucion_mensual;
create policy "material_distribucion_mensual_select_base"
on public.material_distribucion_mensual
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

drop policy if exists "material_distribucion_mensual_write_operacion" on public.material_distribucion_mensual;
create policy "material_distribucion_mensual_write_operacion"
on public.material_distribucion_mensual
for all
to authenticated
using (
  public.es_administrador()
  or public.get_my_role() in ('LOGISTICA', 'COORDINADOR', 'SUPERVISOR')
  or confirmado_por_empleado_id = public.get_my_empleado_id()
)
with check (
  public.es_administrador()
  or public.get_my_role() in ('LOGISTICA', 'COORDINADOR', 'SUPERVISOR')
  or confirmado_por_empleado_id = public.get_my_empleado_id()
);

drop policy if exists "material_distribucion_detalle_select_base" on public.material_distribucion_detalle;
create policy "material_distribucion_detalle_select_base"
on public.material_distribucion_detalle
for select
to authenticated
using (
  exists (
    select 1
    from public.material_distribucion_mensual distribucion
    where distribucion.id = material_distribucion_detalle.distribucion_id
      and (
        public.es_usuario_interno()
        or (public.es_cliente() and distribucion.cuenta_cliente_id = public.get_my_cuenta_cliente_id())
      )
  )
);

drop policy if exists "material_distribucion_detalle_write_operacion" on public.material_distribucion_detalle;
create policy "material_distribucion_detalle_write_operacion"
on public.material_distribucion_detalle
for all
to authenticated
using (
  exists (
    select 1
    from public.material_distribucion_mensual distribucion
    where distribucion.id = material_distribucion_detalle.distribucion_id
      and (
        public.es_administrador()
        or public.get_my_role() in ('LOGISTICA', 'COORDINADOR', 'SUPERVISOR')
        or distribucion.confirmado_por_empleado_id = public.get_my_empleado_id()
      )
  )
)
with check (
  exists (
    select 1
    from public.material_distribucion_mensual distribucion
    where distribucion.id = material_distribucion_detalle.distribucion_id
      and (
        public.es_administrador()
        or public.get_my_role() in ('LOGISTICA', 'COORDINADOR', 'SUPERVISOR')
        or distribucion.confirmado_por_empleado_id = public.get_my_empleado_id()
      )
  )
);

drop policy if exists "material_entrega_promocional_select_base" on public.material_entrega_promocional;
create policy "material_entrega_promocional_select_base"
on public.material_entrega_promocional
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

drop policy if exists "material_entrega_promocional_write_operacion" on public.material_entrega_promocional;
create policy "material_entrega_promocional_write_operacion"
on public.material_entrega_promocional
for all
to authenticated
using (
  public.es_administrador()
  or public.get_my_role() in ('LOGISTICA', 'COORDINADOR', 'SUPERVISOR')
  or empleado_id = public.get_my_empleado_id()
)
with check (
  public.es_administrador()
  or public.get_my_role() in ('LOGISTICA', 'COORDINADOR', 'SUPERVISOR')
  or empleado_id = public.get_my_empleado_id()
);

drop trigger if exists trg_material_catalogo_audit_log on public.material_catalogo;
create trigger trg_material_catalogo_audit_log
after insert or update or delete on public.material_catalogo
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_material_distribucion_mensual_audit_log on public.material_distribucion_mensual;
create trigger trg_material_distribucion_mensual_audit_log
after insert or update or delete on public.material_distribucion_mensual
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_material_distribucion_detalle_audit_log on public.material_distribucion_detalle;
create trigger trg_material_distribucion_detalle_audit_log
after insert or update or delete on public.material_distribucion_detalle
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_material_entrega_promocional_audit_log on public.material_entrega_promocional;
create trigger trg_material_entrega_promocional_audit_log
after insert or update or delete on public.material_entrega_promocional
for each row execute function public.audit_log_capture_row_change();
