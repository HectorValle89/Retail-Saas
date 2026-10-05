-- Canal publico de captura operativa
-- Mantiene la captura sin login separada de las tablas finales hasta su validacion.

create table if not exists public.captura_publica_link (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  slug text not null unique,
  nombre text not null,
  descripcion text,
  activo boolean not null default true,
  acciones_habilitadas text[] not null default array['VENTA', 'CANJE', 'DESABASTO']::text[],
  pdv_ids_permitidos uuid[] not null default '{}'::uuid[],
  empleado_ids_permitidos uuid[] not null default '{}'::uuid[],
  vigente_desde timestamptz not null default timezone('utc', now()),
  vigente_hasta timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by_usuario_id uuid references public.usuario(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint captura_publica_link_slug_formato
    check (slug ~ '^[a-z0-9][a-z0-9-]{5,80}$'),
  constraint captura_publica_link_acciones_validas
    check (acciones_habilitadas <@ array['VENTA', 'CANJE', 'DESABASTO']::text[]),
  constraint captura_publica_link_vigencia_valida
    check (vigente_hasta is null or vigente_hasta > vigente_desde)
);

create table if not exists public.captura_publica_registro (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.captura_publica_link(id) on delete restrict,
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  fecha_operativa date not null,
  tipo_registro text not null check (tipo_registro in ('VENTA', 'CANJE', 'DESABASTO')),
  estatus text not null default 'RECIBIDO' check (
    estatus in ('RECIBIDO', 'VALIDADO', 'RECHAZADO', 'CONSOLIDADO')
  ),
  pdv_nombre_snapshot text not null,
  empleado_nombre_snapshot text not null,
  producto_id uuid references public.producto(id) on delete set null,
  producto_nombre_snapshot text,
  material_catalogo_id uuid references public.material_catalogo(id) on delete set null,
  material_nombre_snapshot text,
  cantidad integer,
  monto numeric(12,2),
  folio_ticket text,
  observaciones text,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint captura_publica_registro_cantidad_positiva
    check (cantidad is null or cantidad > 0),
  constraint captura_publica_registro_monto_no_negativo
    check (monto is null or monto >= 0)
);

create index if not exists idx_captura_publica_link_cuenta_activo
  on public.captura_publica_link(cuenta_cliente_id, activo, vigente_desde desc);

create index if not exists idx_captura_publica_registro_cuenta_fecha
  on public.captura_publica_registro(cuenta_cliente_id, fecha_operativa desc);

create index if not exists idx_captura_publica_registro_pdv_fecha
  on public.captura_publica_registro(pdv_id, fecha_operativa desc);

create index if not exists idx_captura_publica_registro_empleado_fecha
  on public.captura_publica_registro(empleado_id, fecha_operativa desc);

create index if not exists idx_captura_publica_registro_tipo_estatus_fecha
  on public.captura_publica_registro(tipo_registro, estatus, fecha_operativa desc);

drop trigger if exists trg_captura_publica_link_updated_at on public.captura_publica_link;
create trigger trg_captura_publica_link_updated_at
before update on public.captura_publica_link
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_captura_publica_registro_updated_at on public.captura_publica_registro;
create trigger trg_captura_publica_registro_updated_at
before update on public.captura_publica_registro
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_captura_publica_link_audit_log on public.captura_publica_link;
create trigger trg_captura_publica_link_audit_log
after insert or update or delete on public.captura_publica_link
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_captura_publica_registro_audit_log on public.captura_publica_registro;
create trigger trg_captura_publica_registro_audit_log
after insert or update or delete on public.captura_publica_registro
for each row execute function public.audit_log_capture_row_change();

alter table public.captura_publica_link enable row level security;
alter table public.captura_publica_registro enable row level security;

drop policy if exists "captura_publica_link_select_admin" on public.captura_publica_link;
create policy "captura_publica_link_select_admin"
on public.captura_publica_link
for select
to authenticated
using (
  public.es_administrador()
  or public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

drop policy if exists "captura_publica_link_write_admin" on public.captura_publica_link;
create policy "captura_publica_link_write_admin"
on public.captura_publica_link
for all
to authenticated
using (public.es_administrador())
with check (public.es_administrador());

drop policy if exists "captura_publica_registro_select_base" on public.captura_publica_registro;
create policy "captura_publica_registro_select_base"
on public.captura_publica_registro
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

drop policy if exists "captura_publica_registro_update_admin" on public.captura_publica_registro;
create policy "captura_publica_registro_update_admin"
on public.captura_publica_registro
for update
to authenticated
using (public.es_administrador() or public.get_my_role() in ('SUPERVISOR', 'COORDINADOR', 'VENTAS', 'LOVE_IS'))
with check (public.es_administrador() or public.get_my_role() in ('SUPERVISOR', 'COORDINADOR', 'VENTAS', 'LOVE_IS'));
