-- =====================================================
-- LOVE ISDIN - Inventario QR oficial y resumen diario
-- Objetivo:
--   ligar QR oficial por dermoconsejera, endurecer la
--   trazabilidad por PDV y habilitar KPI diarios.
-- =====================================================

create table if not exists public.love_isdin_qr_codigo (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  codigo text not null,
  imagen_url text,
  imagen_hash text,
  estado text not null default 'DISPONIBLE' check (
    estado in ('DISPONIBLE', 'ACTIVO', 'BLOQUEADO', 'BAJA')
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.love_isdin_qr_asignacion (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  qr_codigo_id uuid not null references public.love_isdin_qr_codigo(id) on delete restrict,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  fecha_inicio timestamptz not null default now(),
  fecha_fin timestamptz,
  motivo text,
  observaciones text,
  created_by_usuario_id uuid references public.usuario(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create table if not exists public.love_isdin_qr_import_lote (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  archivo_nombre text not null,
  archivo_hash text,
  estado text not null default 'BORRADOR_PREVIEW' check (
    estado in ('BORRADOR_PREVIEW', 'CONFIRMADO', 'CANCELADO')
  ),
  resumen jsonb not null default '{}'::jsonb,
  advertencias jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  confirmado_por_usuario_id uuid references public.usuario(id) on delete set null,
  confirmado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.love_isdin
  add column if not exists qr_codigo_id uuid references public.love_isdin_qr_codigo(id) on delete set null;

alter table public.love_isdin
  add column if not exists qr_asignacion_id uuid references public.love_isdin_qr_asignacion(id) on delete set null;

create unique index if not exists idx_love_isdin_qr_codigo_unique
on public.love_isdin_qr_codigo(cuenta_cliente_id, codigo);

create index if not exists idx_love_isdin_qr_codigo_estado
on public.love_isdin_qr_codigo(cuenta_cliente_id, estado, created_at desc);

create unique index if not exists idx_love_isdin_qr_asignacion_qr_activa
on public.love_isdin_qr_asignacion(qr_codigo_id)
where fecha_fin is null;

create unique index if not exists idx_love_isdin_qr_asignacion_empleado_activa
on public.love_isdin_qr_asignacion(cuenta_cliente_id, empleado_id)
where fecha_fin is null;

create index if not exists idx_love_isdin_qr_asignacion_empleado_historial
on public.love_isdin_qr_asignacion(cuenta_cliente_id, empleado_id, fecha_inicio desc);

create index if not exists idx_love_isdin_qr_import_lote_estado
on public.love_isdin_qr_import_lote(cuenta_cliente_id, estado, created_at desc);

create index if not exists idx_love_isdin_qr_codigo_fecha
on public.love_isdin(qr_codigo_id, fecha_utc desc);

create index if not exists idx_love_isdin_qr_asignacion_fecha
on public.love_isdin(qr_asignacion_id, fecha_utc desc);

create index if not exists idx_love_isdin_pdv_fecha
on public.love_isdin(pdv_id, fecha_utc desc);

drop trigger if exists trg_love_isdin_qr_codigo_updated_at on public.love_isdin_qr_codigo;
create trigger trg_love_isdin_qr_codigo_updated_at
before update on public.love_isdin_qr_codigo
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_love_isdin_qr_asignacion_updated_at on public.love_isdin_qr_asignacion;
create trigger trg_love_isdin_qr_asignacion_updated_at
before update on public.love_isdin_qr_asignacion
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_love_isdin_qr_import_lote_updated_at on public.love_isdin_qr_import_lote;
create trigger trg_love_isdin_qr_import_lote_updated_at
before update on public.love_isdin_qr_import_lote
for each row execute function public.actualizar_updated_at();

alter table public.love_isdin_qr_codigo enable row level security;
alter table public.love_isdin_qr_asignacion enable row level security;
alter table public.love_isdin_qr_import_lote enable row level security;

drop policy if exists "love_isdin_qr_codigo_select_base" on public.love_isdin_qr_codigo;
create policy "love_isdin_qr_codigo_select_base"
on public.love_isdin_qr_codigo
for select
to authenticated
using (
  public.es_administrador()
  or public.es_operador_love()
  or exists (
    select 1
    from public.love_isdin_qr_asignacion asignacion
    where asignacion.qr_codigo_id = love_isdin_qr_codigo.id
      and asignacion.empleado_id = public.get_my_empleado_id()
      and asignacion.fecha_fin is null
  )
);

drop policy if exists "love_isdin_qr_codigo_write_operacion" on public.love_isdin_qr_codigo;
create policy "love_isdin_qr_codigo_write_operacion"
on public.love_isdin_qr_codigo
for all
to authenticated
using (
  public.es_administrador()
  or public.es_operador_love()
)
with check (
  public.es_administrador()
  or public.es_operador_love()
);

drop policy if exists "love_isdin_qr_asignacion_select_base" on public.love_isdin_qr_asignacion;
create policy "love_isdin_qr_asignacion_select_base"
on public.love_isdin_qr_asignacion
for select
to authenticated
using (
  public.es_administrador()
  or public.es_operador_love()
  or empleado_id = public.get_my_empleado_id()
);

drop policy if exists "love_isdin_qr_asignacion_write_operacion" on public.love_isdin_qr_asignacion;
create policy "love_isdin_qr_asignacion_write_operacion"
on public.love_isdin_qr_asignacion
for all
to authenticated
using (
  public.es_administrador()
  or public.es_operador_love()
)
with check (
  public.es_administrador()
  or public.es_operador_love()
);

drop policy if exists "love_isdin_qr_import_lote_select_base" on public.love_isdin_qr_import_lote;
create policy "love_isdin_qr_import_lote_select_base"
on public.love_isdin_qr_import_lote
for select
to authenticated
using (
  public.es_administrador()
  or public.es_operador_love()
);

drop policy if exists "love_isdin_qr_import_lote_write_operacion" on public.love_isdin_qr_import_lote;
create policy "love_isdin_qr_import_lote_write_operacion"
on public.love_isdin_qr_import_lote
for all
to authenticated
using (
  public.es_administrador()
  or public.es_operador_love()
)
with check (
  public.es_administrador()
  or public.es_operador_love()
);

drop trigger if exists trg_love_isdin_qr_codigo_audit_log on public.love_isdin_qr_codigo;
create trigger trg_love_isdin_qr_codigo_audit_log
after insert or update or delete on public.love_isdin_qr_codigo
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_love_isdin_qr_asignacion_audit_log on public.love_isdin_qr_asignacion;
create trigger trg_love_isdin_qr_asignacion_audit_log
after insert or update or delete on public.love_isdin_qr_asignacion
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_love_isdin_qr_import_lote_audit_log on public.love_isdin_qr_import_lote;
create trigger trg_love_isdin_qr_import_lote_audit_log
after insert or update or delete on public.love_isdin_qr_import_lote
for each row execute function public.audit_log_capture_row_change();

create or replace view public.love_isdin_resumen_diario
with (security_invoker = on) as
select
  timezone('America/Mexico_City', love.fecha_utc)::date as fecha_operacion,
  love.cuenta_cliente_id,
  love.pdv_id,
  love.empleado_id,
  empleado.supervisor_empleado_id,
  pdv.zona,
  cadena.nombre as cadena,
  love.qr_codigo_id,
  count(*)::integer as afiliaciones_total,
  count(*) filter (where love.estatus = 'VALIDA')::integer as afiliaciones_validas,
  count(*) filter (where love.estatus = 'PENDIENTE_VALIDACION')::integer as afiliaciones_pendientes,
  count(*) filter (where love.estatus = 'RECHAZADA')::integer as afiliaciones_rechazadas,
  count(*) filter (where love.estatus = 'DUPLICADA')::integer as afiliaciones_duplicadas
from public.love_isdin love
left join public.empleado empleado
  on empleado.id = love.empleado_id
left join public.pdv pdv
  on pdv.id = love.pdv_id
left join public.cadena cadena
  on cadena.id = pdv.cadena_id
group by
  timezone('America/Mexico_City', love.fecha_utc)::date,
  love.cuenta_cliente_id,
  love.pdv_id,
  love.empleado_id,
  empleado.supervisor_empleado_id,
  pdv.zona,
  cadena.nombre,
  love.qr_codigo_id;
