-- =====================================================
-- Sistema de Control de Inventarios Robusto
-- Objetivo:
--   Evolucionar el modulo de logistica promocional hacia
--   un sistema de inventarios con gestion por lotes,
--   caducidades, stock multicapa (fisico/comprometido/
--   disponible), dispersiones con flujo de estados y
--   pre-validacion de cargas masivas.
-- =====================================================

-- --------------------------------------------------
-- 1. Catalogo de productos (SKU, categoria, unidad)
-- --------------------------------------------------
create table if not exists public.producto_catalogo (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  sku text not null,
  descripcion text not null,
  categoria text not null default 'PROMOCIONAL' check (
    categoria in ('PROMOCIONAL', 'MUESTRA', 'POP', 'TESTERS', 'OTRO')
  ),
  unidad_medida text not null default 'PZA' check (
    unidad_medida in ('PZA', 'CAJA', 'KIT', 'ML', 'GR', 'SOBRE', 'OTRO')
  ),
  -- vinculo opcional con material_catalogo legacy
  material_catalogo_id uuid references public.material_catalogo(id) on delete set null,
  activo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cuenta_cliente_id, sku)
);

comment on table public.producto_catalogo is 'Catalogo de productos con SKU, categoria y unidad de medida para el sistema de inventarios.';

-- --------------------------------------------------
-- 2. Gestion por lotes y caducidades
-- --------------------------------------------------
create table if not exists public.producto_lote (
  id uuid primary key default gen_random_uuid(),
  producto_catalogo_id uuid not null references public.producto_catalogo(id) on delete restrict,
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  numero_lote text not null,
  fecha_caducidad date not null,
  cantidad_inicial integer not null check (cantidad_inicial > 0),
  estado text not null default 'VIGENTE' check (
    estado in ('VIGENTE', 'PROXIMO_VENCER', 'VENCIDO', 'AGOTADO')
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (producto_catalogo_id, numero_lote, cuenta_cliente_id)
);

comment on table public.producto_lote is 'Lotes de productos con numero de lote y fecha de caducidad obligatorios.';

-- --------------------------------------------------
-- 3. Movimientos de inventario (entradas, salidas, compromisos)
-- --------------------------------------------------
create table if not exists public.inventario_movimiento_v2 (
  id uuid primary key default gen_random_uuid(),
  producto_catalogo_id uuid not null references public.producto_catalogo(id) on delete restrict,
  producto_lote_id uuid references public.producto_lote(id) on delete set null,
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  tipo text not null check (
    tipo in (
      'CARGA_INICIAL',
      'ENTRADA_COMPRA',
      'ENTRADA_DEVOLUCION',
      'SALIDA_MERMA',
      'SALIDA_AJUSTE',
      'SALIDA_DANIO',
      'COMPROMISO_DISPERSION',
      'LIBERACION_COMPROMISO',
      'ENVIO_DISPERSION'
    )
  ),
  sentido text not null check (sentido in ('ENTRADA', 'SALIDA')),
  cantidad integer not null check (cantidad > 0),
  motivo text,
  referencia_tipo text check (
    referencia_tipo is null or referencia_tipo in ('DISPERSION', 'CARGA_MASIVA', 'MANUAL')
  ),
  referencia_id uuid,
  empleado_id uuid references public.empleado(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.inventario_movimiento_v2 is 'Registro de todos los movimientos de inventario: entradas, salidas, compromisos de dispersion y envios.';

-- --------------------------------------------------
-- 4. Modificar dispersiones para flujo de estados
-- --------------------------------------------------
-- Agregar nuevos estados al check constraint de material_distribucion_mensual
alter table public.material_distribucion_mensual
  drop constraint if exists material_distribucion_mensual_estado_check;

alter table public.material_distribucion_mensual
  add constraint material_distribucion_mensual_estado_check check (
    estado in (
      'PENDIENTE_RECEPCION',
      'RECIBIDA_CONFORME',
      'RECIBIDA_CON_OBSERVACIONES',
      'PENDIENTE_ACLARACION',
      'CANCELADA',
      'PLANEADA',
      'EN_TRANSITO',
      'ENTREGADA'
    )
  );

-- Campos adicionales para flujo de dispersion
alter table public.material_distribucion_mensual
  add column if not exists enviado_en timestamptz,
  add column if not exists entregado_en timestamptz;

-- Campo para etiquetar productos que no requieren reporte de entrega
alter table public.material_distribucion_detalle
  add column if not exists requiere_reporte_entrega boolean not null default true;

comment on column public.material_distribucion_detalle.requiere_reporte_entrega
  is 'Si es false, este producto no requiere que el supervisor genere reporte de entrega a DC.';

-- --------------------------------------------------
-- 5. Log de cargas masivas (Excel/CSV)
-- --------------------------------------------------
create table if not exists public.carga_masiva_log (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  tipo_carga text not null check (
    tipo_carga in ('INVENTARIO_INICIAL', 'ENTRADA_COMPRA', 'DISPERSION_MENSUAL')
  ),
  archivo_nombre text not null,
  archivo_url text,
  archivo_hash text,
  archivo_mime_type text,
  archivo_tamano_bytes bigint,
  estado text not null default 'VALIDANDO' check (
    estado in ('VALIDANDO', 'CON_ERRORES', 'LISTO_PARA_PROCESAR', 'PROCESADO', 'CANCELADO')
  ),
  filas_totales integer not null default 0,
  filas_validas integer not null default 0,
  filas_con_error integer not null default 0,
  errores jsonb not null default '[]'::jsonb,
  resumen jsonb not null default '{}'::jsonb,
  preview_data jsonb not null default '{}'::jsonb,
  procesado_en timestamptz,
  empleado_id uuid references public.empleado(id) on delete set null,
  created_by_usuario_id uuid references public.usuario(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.carga_masiva_log is 'Registro y trazabilidad de importaciones masivas con pre-validacion de errores.';

-- --------------------------------------------------
-- 6. Vista de stock actual (fisico, comprometido, disponible)
-- --------------------------------------------------
create or replace view public.v_stock_actual as
with movimientos_netos as (
  select
    im.producto_catalogo_id,
    im.producto_lote_id,
    im.cuenta_cliente_id,
    sum(case when im.sentido = 'ENTRADA' then im.cantidad else 0 end) as total_entradas,
    sum(case when im.sentido = 'SALIDA' and im.tipo != 'COMPROMISO_DISPERSION' then im.cantidad else 0 end) as total_salidas,
    sum(case when im.tipo = 'COMPROMISO_DISPERSION' then im.cantidad else 0 end) as total_comprometido_mov,
    sum(case when im.tipo = 'LIBERACION_COMPROMISO' then im.cantidad else 0 end) as total_liberado
  from public.inventario_movimiento_v2 im
  group by im.producto_catalogo_id, im.producto_lote_id, im.cuenta_cliente_id
)
select
  mn.producto_catalogo_id,
  mn.producto_lote_id,
  mn.cuenta_cliente_id,
  pc.sku,
  pc.descripcion,
  pc.categoria,
  pc.unidad_medida,
  pl.numero_lote,
  pl.fecha_caducidad,
  (mn.total_entradas - mn.total_salidas) as stock_fisico,
  greatest(mn.total_comprometido_mov - mn.total_liberado, 0) as stock_comprometido,
  (mn.total_entradas - mn.total_salidas) - greatest(mn.total_comprometido_mov - mn.total_liberado, 0) as stock_disponible,
  case
    when pl.fecha_caducidad is null then 'SIN_LOTE'
    when pl.fecha_caducidad <= current_date then 'VENCIDO'
    when pl.fecha_caducidad <= current_date + interval '30 days' then 'PROXIMO_VENCER'
    else 'VIGENTE'
  end as estado_caducidad
from movimientos_netos mn
join public.producto_catalogo pc on pc.id = mn.producto_catalogo_id
left join public.producto_lote pl on pl.id = mn.producto_lote_id;

comment on view public.v_stock_actual is 'Vista de stock en tiempo real con capas: fisico, comprometido y disponible, mas estado de caducidad.';

-- --------------------------------------------------
-- 7. Indices para consultas de stock
-- --------------------------------------------------
create index if not exists idx_producto_catalogo_cuenta_sku
on public.producto_catalogo(cuenta_cliente_id, sku);

create index if not exists idx_producto_catalogo_cuenta_activo
on public.producto_catalogo(cuenta_cliente_id, activo, categoria);

create index if not exists idx_producto_lote_producto_caducidad
on public.producto_lote(producto_catalogo_id, fecha_caducidad asc);

create index if not exists idx_producto_lote_cuenta_estado
on public.producto_lote(cuenta_cliente_id, estado, fecha_caducidad asc);

create index if not exists idx_inventario_movimiento_v2_producto_lote
on public.inventario_movimiento_v2(producto_catalogo_id, producto_lote_id, created_at desc);

create index if not exists idx_inventario_movimiento_v2_cuenta_tipo
on public.inventario_movimiento_v2(cuenta_cliente_id, tipo, created_at desc);

create index if not exists idx_inventario_movimiento_v2_referencia
on public.inventario_movimiento_v2(referencia_tipo, referencia_id)
where referencia_id is not null;

create index if not exists idx_carga_masiva_log_cuenta_tipo
on public.carga_masiva_log(cuenta_cliente_id, tipo_carga, created_at desc);

create index if not exists idx_carga_masiva_log_estado
on public.carga_masiva_log(estado, created_at desc);

-- --------------------------------------------------
-- 8. Triggers de updated_at
-- --------------------------------------------------
drop trigger if exists trg_producto_catalogo_updated_at on public.producto_catalogo;
create trigger trg_producto_catalogo_updated_at
before update on public.producto_catalogo
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_producto_lote_updated_at on public.producto_lote;
create trigger trg_producto_lote_updated_at
before update on public.producto_lote
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_inventario_movimiento_v2_updated_at on public.inventario_movimiento_v2;
create trigger trg_inventario_movimiento_v2_updated_at
before update on public.inventario_movimiento_v2
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_carga_masiva_log_updated_at on public.carga_masiva_log;
create trigger trg_carga_masiva_log_updated_at
before update on public.carga_masiva_log
for each row execute function public.actualizar_updated_at();

-- --------------------------------------------------
-- 9. Row Level Security
-- --------------------------------------------------
alter table public.producto_catalogo enable row level security;
alter table public.producto_lote enable row level security;
alter table public.inventario_movimiento_v2 enable row level security;
alter table public.carga_masiva_log enable row level security;

-- producto_catalogo: lectura interna + cliente de su cuenta
drop policy if exists "producto_catalogo_select_base" on public.producto_catalogo;
create policy "producto_catalogo_select_base"
on public.producto_catalogo
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

-- producto_catalogo: escritura admin/logistica
drop policy if exists "producto_catalogo_write_admin" on public.producto_catalogo;
create policy "producto_catalogo_write_admin"
on public.producto_catalogo
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

-- producto_lote: lectura interna + cliente
drop policy if exists "producto_lote_select_base" on public.producto_lote;
create policy "producto_lote_select_base"
on public.producto_lote
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

-- producto_lote: escritura admin/logistica
drop policy if exists "producto_lote_write_admin" on public.producto_lote;
create policy "producto_lote_write_admin"
on public.producto_lote
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

-- inventario_movimiento_v2: lectura interna + cliente
drop policy if exists "inventario_movimiento_v2_select_base" on public.inventario_movimiento_v2;
create policy "inventario_movimiento_v2_select_base"
on public.inventario_movimiento_v2
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

-- inventario_movimiento_v2: escritura admin/logistica/supervisor/dc
drop policy if exists "inventario_movimiento_v2_write_operacion" on public.inventario_movimiento_v2;
create policy "inventario_movimiento_v2_write_operacion"
on public.inventario_movimiento_v2
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

-- carga_masiva_log: lectura interna + cliente
drop policy if exists "carga_masiva_log_select_base" on public.carga_masiva_log;
create policy "carga_masiva_log_select_base"
on public.carga_masiva_log
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

-- carga_masiva_log: escritura admin/logistica
drop policy if exists "carga_masiva_log_write_admin" on public.carga_masiva_log;
create policy "carga_masiva_log_write_admin"
on public.carga_masiva_log
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

-- --------------------------------------------------
-- 10. Triggers de auditoria
-- --------------------------------------------------
drop trigger if exists trg_producto_catalogo_audit_log on public.producto_catalogo;
create trigger trg_producto_catalogo_audit_log
after insert or update or delete on public.producto_catalogo
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_producto_lote_audit_log on public.producto_lote;
create trigger trg_producto_lote_audit_log
after insert or update or delete on public.producto_lote
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_inventario_movimiento_v2_audit_log on public.inventario_movimiento_v2;
create trigger trg_inventario_movimiento_v2_audit_log
after insert or update or delete on public.inventario_movimiento_v2
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_carga_masiva_log_audit_log on public.carga_masiva_log;
create trigger trg_carga_masiva_log_audit_log
after insert or update or delete on public.carga_masiva_log
for each row execute function public.audit_log_capture_row_change();
