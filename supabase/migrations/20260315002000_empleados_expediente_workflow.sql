-- =====================================================
-- Empleados: expediente, IMSS y baja operativa
-- Objetivo:
--   cerrar el modulo de Empleados para RECLUTAMIENTO con
--   expediente digital, flujo IMSS, baja formal y dedupe
--   de documentos via archivo_hash.
-- =====================================================

alter table public.empleado
  add column if not exists sueldo_base_mensual numeric(12,2),
  add column if not exists expediente_estado text not null default 'PENDIENTE_DOCUMENTOS'
    check (expediente_estado in ('PENDIENTE_DOCUMENTOS', 'EN_REVISION', 'VALIDADO', 'OBSERVADO')),
  add column if not exists expediente_validado_en timestamptz,
  add column if not exists expediente_validado_por_usuario_id uuid references public.usuario(id) on delete set null,
  add column if not exists expediente_observaciones text,
  add column if not exists imss_estado text not null default 'NO_INICIADO'
    check (imss_estado in ('NO_INICIADO', 'PENDIENTE_DOCUMENTOS', 'EN_PROCESO', 'ALTA_IMSS', 'ERROR')),
  add column if not exists imss_fecha_solicitud date,
  add column if not exists imss_fecha_alta date,
  add column if not exists imss_observaciones text,
  add column if not exists motivo_baja text,
  add column if not exists checklist_baja jsonb not null default '{}'::jsonb;

create table if not exists public.empleado_documento (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleado(id) on delete cascade,
  archivo_hash_id uuid not null references public.archivo_hash(id) on delete restrict,
  categoria text not null check (categoria in ('EXPEDIENTE', 'IMSS', 'BAJA')),
  tipo_documento text not null check (
    tipo_documento in (
      'CURP',
      'RFC',
      'NSS',
      'INE',
      'COMPROBANTE_DOMICILIO',
      'CONTRATO',
      'ALTA_IMSS',
      'BAJA',
      'OTRO'
    )
  ),
  nombre_archivo_original text not null,
  mime_type text,
  tamano_bytes bigint,
  estado_documento text not null default 'CARGADO'
    check (estado_documento in ('CARGADO', 'VALIDADO', 'OBSERVADO')),
  ocr_provider text,
  ocr_resultado jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  creado_por_usuario_id uuid references public.usuario(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empleado_id, archivo_hash_id, categoria)
);

create index if not exists idx_empleado_expediente_estado on public.empleado(expediente_estado);
create index if not exists idx_empleado_imss_estado on public.empleado(imss_estado);
create index if not exists idx_empleado_documento_empleado on public.empleado_documento(empleado_id, created_at desc);
create index if not exists idx_empleado_documento_categoria on public.empleado_documento(categoria, tipo_documento);
create index if not exists idx_empleado_documento_archivo_hash on public.empleado_documento(archivo_hash_id);

create trigger trg_empleado_documento_updated_at
before update on public.empleado_documento
for each row execute function public.actualizar_updated_at();

create or replace function public.es_reclutamiento_o_admin()
returns boolean
language sql
stable
as $$
  select public.get_my_role() in ('ADMINISTRADOR', 'RECLUTAMIENTO');
$$;

create or replace function public.es_reclutamiento_nomina_o_admin()
returns boolean
language sql
stable
as $$
  select public.get_my_role() in ('ADMINISTRADOR', 'RECLUTAMIENTO', 'NOMINA');
$$;

alter table public.empleado_documento enable row level security;

create policy "empleado_documento_select_reclutamiento"
on public.empleado_documento
for select
to authenticated
using (public.es_reclutamiento_nomina_o_admin());

create policy "empleado_documento_insert_reclutamiento"
on public.empleado_documento
for insert
to authenticated
with check (public.es_reclutamiento_o_admin());

create policy "empleado_documento_update_reclutamiento"
on public.empleado_documento
for update
to authenticated
using (public.es_reclutamiento_o_admin())
with check (public.es_reclutamiento_o_admin());