create table if not exists public.campana_pdv_producto_meta (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campana(id) on delete cascade,
  campana_pdv_id uuid not null references public.campana_pdv(id) on delete cascade,
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  producto_id uuid not null references public.producto(id) on delete restrict,
  cuota numeric(12,2) not null check (cuota >= 0),
  tipo_meta text not null default 'VENTA' check (tipo_meta in ('VENTA', 'EXHIBICION')),
  observaciones text,
  created_by_usuario_id uuid references public.usuario(id) on delete set null,
  updated_by_usuario_id uuid references public.usuario(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campana_id, pdv_id, producto_id)
);

create index if not exists idx_campana_pdv_producto_meta_campana_pdv
on public.campana_pdv_producto_meta(campana_id, campana_pdv_id);

create index if not exists idx_campana_pdv_producto_meta_pdv_producto
on public.campana_pdv_producto_meta(pdv_id, producto_id);

create index if not exists idx_campana_pdv_producto_meta_cuenta
on public.campana_pdv_producto_meta(cuenta_cliente_id, campana_id);

create trigger trg_campana_pdv_producto_meta_updated_at
before update on public.campana_pdv_producto_meta
for each row execute function public.actualizar_updated_at();

alter table public.campana_pdv_producto_meta enable row level security;

create policy "campana_pdv_producto_meta_select_operacion"
on public.campana_pdv_producto_meta
for select
to authenticated
using (
  public.get_my_role() = any (array['ADMINISTRADOR', 'VENTAS', 'SUPERVISOR', 'COORDINADOR', 'LOGISTICA', 'DERMOCONSEJERO', 'CLIENTE'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

create policy "campana_pdv_producto_meta_insert_manager"
on public.campana_pdv_producto_meta
for insert
to authenticated
with check (
  public.get_my_role() = any (array['ADMINISTRADOR', 'VENTAS'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

create policy "campana_pdv_producto_meta_update_manager"
on public.campana_pdv_producto_meta
for update
to authenticated
using (
  public.get_my_role() = any (array['ADMINISTRADOR', 'VENTAS'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
)
with check (
  public.get_my_role() = any (array['ADMINISTRADOR', 'VENTAS'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);

create policy "campana_pdv_producto_meta_delete_manager"
on public.campana_pdv_producto_meta
for delete
to authenticated
using (
  public.get_my_role() = any (array['ADMINISTRADOR', 'VENTAS'])
  and (
    public.get_my_cuenta_cliente_id() is null
    or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
  )
);
