-- =====================================================
-- Fase 5 - Dispersión mensual avanzada de materiales por PDV
-- Objetivo:
--   reemplazar la importación simple por lotes mensuales con
--   preview, confirmación, resurtidos, inventario por PDV,
--   conteos de jornada y evidencia de mercadeo.
-- =====================================================

create table if not exists public.material_distribucion_lote (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  mes_operacion date not null,
  estado text not null default 'BORRADOR_PREVIEW' check (
    estado in ('BORRADOR_PREVIEW', 'CONFIRMADO', 'CANCELADO')
  ),
  archivo_nombre text not null,
  archivo_url text,
  archivo_hash text,
  archivo_mime_type text,
  archivo_tamano_bytes bigint,
  gemini_status text not null default 'SIN_INTENTO' check (
    gemini_status in ('SIN_INTENTO', 'OK', 'ADVERTENCIA', 'ERROR', 'NO_CONFIGURADO')
  ),
  advertencias jsonb not null default '[]'::jsonb,
  resumen jsonb not null default '{}'::jsonb,
  preview_data jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by_usuario_id uuid references public.usuario(id) on delete set null,
  confirmado_por_usuario_id uuid references public.usuario(id) on delete set null,
  confirmado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_trunc('month', mes_operacion)::date = mes_operacion)
);

alter table public.material_distribucion_mensual
  add column if not exists lote_id uuid references public.material_distribucion_lote(id) on delete set null,
  add column if not exists cadena_snapshot text,
  add column if not exists id_pdv_cadena_snapshot text,
  add column if not exists sucursal_snapshot text,
  add column if not exists nombre_dc_snapshot text,
  add column if not exists territorio_snapshot text,
  add column if not exists hoja_origen text;

alter table public.material_distribucion_detalle
  add column if not exists material_nombre_snapshot text,
  add column if not exists material_tipo_mes text,
  add column if not exists mecanica_canje text,
  add column if not exists indicaciones_producto text,
  add column if not exists instrucciones_mercadeo text,
  add column if not exists requiere_ticket_mes boolean not null default false,
  add column if not exists requiere_evidencia_entrega_mes boolean not null default false,
  add column if not exists requiere_evidencia_mercadeo boolean not null default false,
  add column if not exists es_regalo_dc boolean not null default false,
  add column if not exists excluir_de_registrar_entrega boolean not null default false,
  add column if not exists total_columna_hoja integer,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.material_inventario_movimiento (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  material_catalogo_id uuid not null references public.material_catalogo(id) on delete restrict,
  lote_id uuid references public.material_distribucion_lote(id) on delete set null,
  distribucion_id uuid references public.material_distribucion_mensual(id) on delete set null,
  distribucion_detalle_id uuid references public.material_distribucion_detalle(id) on delete set null,
  conteo_jornada_id uuid,
  empleado_id uuid references public.empleado(id) on delete set null,
  tipo_movimiento text not null check (
    tipo_movimiento in (
      'RECEPCION_LOTE',
      'ENTREGA_CLIENTE',
      'AJUSTE_FUERA_TURNO',
      'MERMA',
      'APERTURA_JORNADA',
      'CIERRE_JORNADA'
    )
  ),
  sentido text not null default 'NEUTRO' check (sentido in ('ENTRADA', 'SALIDA', 'NEUTRO')),
  cantidad integer not null check (cantidad >= 0),
  cantidad_delta integer not null,
  motivo text,
  observaciones text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.material_conteo_jornada (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  fecha_operacion date not null,
  momento text not null check (momento in ('APERTURA', 'CIERRE')),
  observaciones text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pdv_id, fecha_operacion, momento)
);

create table if not exists public.material_conteo_jornada_detalle (
  id uuid primary key default gen_random_uuid(),
  conteo_id uuid not null references public.material_conteo_jornada(id) on delete cascade,
  material_catalogo_id uuid not null references public.material_catalogo(id) on delete restrict,
  cantidad_contada integer not null check (cantidad_contada >= 0),
  diferencia_detectada integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conteo_id, material_catalogo_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'material_inventario_movimiento_conteo_fkey'
  ) then
    alter table public.material_inventario_movimiento
      add constraint material_inventario_movimiento_conteo_fkey
      foreign key (conteo_jornada_id) references public.material_conteo_jornada(id) on delete set null;
  end if;
end $$;

create table if not exists public.material_evidencia_mercadeo (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  lote_id uuid not null references public.material_distribucion_lote(id) on delete cascade,
  distribucion_id uuid not null references public.material_distribucion_mensual(id) on delete cascade,
  pdv_id uuid not null references public.pdv(id) on delete restrict,
  empleado_id uuid not null references public.empleado(id) on delete restrict,
  distribucion_detalle_ids uuid[] not null default '{}'::uuid[],
  foto_url text not null,
  foto_hash text,
  foto_capturada_en timestamptz not null default now(),
  observaciones text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (distribucion_id)
);

alter table public.material_distribucion_mensual
  drop constraint if exists material_distribucion_mensual_cuenta_cliente_id_pdv_id_mes_operacion_key;

create unique index if not exists idx_material_distribucion_mensual_lote_pdv
on public.material_distribucion_mensual(lote_id, pdv_id)
where lote_id is not null;

create index if not exists idx_material_distribucion_lote_mes_estado
on public.material_distribucion_lote(cuenta_cliente_id, mes_operacion desc, estado);

create index if not exists idx_material_distribucion_lote_created
on public.material_distribucion_lote(created_at desc);

create index if not exists idx_material_distribucion_mensual_lote
on public.material_distribucion_mensual(lote_id, mes_operacion desc, pdv_id);

create index if not exists idx_material_distribucion_detalle_distribucion_material
on public.material_distribucion_detalle(distribucion_id, material_catalogo_id);

create index if not exists idx_material_distribucion_detalle_flags
on public.material_distribucion_detalle(distribucion_id, excluir_de_registrar_entrega, es_regalo_dc, requiere_evidencia_mercadeo);

create index if not exists idx_material_inventario_movimiento_pdv_material_fecha
on public.material_inventario_movimiento(pdv_id, material_catalogo_id, created_at desc);

create index if not exists idx_material_inventario_movimiento_lote
on public.material_inventario_movimiento(lote_id, distribucion_id);

create index if not exists idx_material_conteo_jornada_pdv_fecha
on public.material_conteo_jornada(pdv_id, fecha_operacion desc, momento);

create index if not exists idx_material_evidencia_mercadeo_pdv_lote
on public.material_evidencia_mercadeo(pdv_id, lote_id);

update public.material_distribucion_detalle detalle
set material_nombre_snapshot = catalogo.nombre,
    material_tipo_mes = catalogo.tipo,
    requiere_ticket_mes = catalogo.requiere_ticket_compra,
    requiere_evidencia_entrega_mes = catalogo.requiere_evidencia_obligatoria
from public.material_catalogo catalogo
where detalle.material_catalogo_id = catalogo.id
  and (
    detalle.material_nombre_snapshot is null
    or detalle.material_tipo_mes is null
  );

drop trigger if exists trg_material_distribucion_lote_updated_at on public.material_distribucion_lote;
create trigger trg_material_distribucion_lote_updated_at
before update on public.material_distribucion_lote
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_material_inventario_movimiento_updated_at on public.material_inventario_movimiento;
create trigger trg_material_inventario_movimiento_updated_at
before update on public.material_inventario_movimiento
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_material_conteo_jornada_updated_at on public.material_conteo_jornada;
create trigger trg_material_conteo_jornada_updated_at
before update on public.material_conteo_jornada
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_material_conteo_jornada_detalle_updated_at on public.material_conteo_jornada_detalle;
create trigger trg_material_conteo_jornada_detalle_updated_at
before update on public.material_conteo_jornada_detalle
for each row execute function public.actualizar_updated_at();

drop trigger if exists trg_material_evidencia_mercadeo_updated_at on public.material_evidencia_mercadeo;
create trigger trg_material_evidencia_mercadeo_updated_at
before update on public.material_evidencia_mercadeo
for each row execute function public.actualizar_updated_at();

alter table public.material_distribucion_lote enable row level security;
alter table public.material_inventario_movimiento enable row level security;
alter table public.material_conteo_jornada enable row level security;
alter table public.material_conteo_jornada_detalle enable row level security;
alter table public.material_evidencia_mercadeo enable row level security;

drop policy if exists "material_distribucion_lote_select_base" on public.material_distribucion_lote;
create policy "material_distribucion_lote_select_base"
on public.material_distribucion_lote
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

drop policy if exists "material_distribucion_lote_write_operacion" on public.material_distribucion_lote;
create policy "material_distribucion_lote_write_operacion"
on public.material_distribucion_lote
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

drop policy if exists "material_inventario_movimiento_select_base" on public.material_inventario_movimiento;
create policy "material_inventario_movimiento_select_base"
on public.material_inventario_movimiento
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

drop policy if exists "material_inventario_movimiento_write_operacion" on public.material_inventario_movimiento;
create policy "material_inventario_movimiento_write_operacion"
on public.material_inventario_movimiento
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

drop policy if exists "material_conteo_jornada_select_base" on public.material_conteo_jornada;
create policy "material_conteo_jornada_select_base"
on public.material_conteo_jornada
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

drop policy if exists "material_conteo_jornada_write_operacion" on public.material_conteo_jornada;
create policy "material_conteo_jornada_write_operacion"
on public.material_conteo_jornada
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

drop policy if exists "material_conteo_jornada_detalle_select_base" on public.material_conteo_jornada_detalle;
create policy "material_conteo_jornada_detalle_select_base"
on public.material_conteo_jornada_detalle
for select
to authenticated
using (
  exists (
    select 1
    from public.material_conteo_jornada conteo
    where conteo.id = material_conteo_jornada_detalle.conteo_id
      and (
        public.es_usuario_interno()
        or (public.es_cliente() and conteo.cuenta_cliente_id = public.get_my_cuenta_cliente_id())
      )
  )
);

drop policy if exists "material_conteo_jornada_detalle_write_operacion" on public.material_conteo_jornada_detalle;
create policy "material_conteo_jornada_detalle_write_operacion"
on public.material_conteo_jornada_detalle
for all
to authenticated
using (
  exists (
    select 1
    from public.material_conteo_jornada conteo
    where conteo.id = material_conteo_jornada_detalle.conteo_id
      and (
        public.es_administrador()
        or public.get_my_role() in ('LOGISTICA', 'COORDINADOR', 'SUPERVISOR')
        or conteo.empleado_id = public.get_my_empleado_id()
      )
  )
)
with check (
  exists (
    select 1
    from public.material_conteo_jornada conteo
    where conteo.id = material_conteo_jornada_detalle.conteo_id
      and (
        public.es_administrador()
        or public.get_my_role() in ('LOGISTICA', 'COORDINADOR', 'SUPERVISOR')
        or conteo.empleado_id = public.get_my_empleado_id()
      )
  )
);

drop policy if exists "material_evidencia_mercadeo_select_base" on public.material_evidencia_mercadeo;
create policy "material_evidencia_mercadeo_select_base"
on public.material_evidencia_mercadeo
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
);

drop policy if exists "material_evidencia_mercadeo_write_operacion" on public.material_evidencia_mercadeo;
create policy "material_evidencia_mercadeo_write_operacion"
on public.material_evidencia_mercadeo
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

drop trigger if exists trg_material_distribucion_lote_audit_log on public.material_distribucion_lote;
create trigger trg_material_distribucion_lote_audit_log
after insert or update or delete on public.material_distribucion_lote
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_material_inventario_movimiento_audit_log on public.material_inventario_movimiento;
create trigger trg_material_inventario_movimiento_audit_log
after insert or update or delete on public.material_inventario_movimiento
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_material_conteo_jornada_audit_log on public.material_conteo_jornada;
create trigger trg_material_conteo_jornada_audit_log
after insert or update or delete on public.material_conteo_jornada
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_material_conteo_jornada_detalle_audit_log on public.material_conteo_jornada_detalle;
create trigger trg_material_conteo_jornada_detalle_audit_log
after insert or update or delete on public.material_conteo_jornada_detalle
for each row execute function public.audit_log_capture_row_change();

drop trigger if exists trg_material_evidencia_mercadeo_audit_log on public.material_evidencia_mercadeo;
create trigger trg_material_evidencia_mercadeo_audit_log
after insert or update or delete on public.material_evidencia_mercadeo
for each row execute function public.audit_log_capture_row_change();
