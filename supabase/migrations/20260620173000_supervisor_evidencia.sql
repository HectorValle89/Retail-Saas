-- Excepción documentada:
-- `created_at` y `updated_at` se conservan por compatibilidad técnica con los disparadores y utilidades globales del proyecto.

create table if not exists public.supervisor_evidencia (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid not null references public.cuenta_cliente(id) on delete restrict,
  supervisor_empleado_id uuid not null references public.empleado(id) on delete restrict,
  pdv_id uuid references public.pdv(id) on delete restrict,
  fecha_operacion date not null default current_date,
  tipo_evidencia text not null check (
    tipo_evidencia in (
      'MATERIAL_POP',
      'CAMPANA_ESTACIONAL',
      'MALETA_VANITY',
      'EVENTO_ESPECIAL',
      'ADOPTADO_SAN_PABLO',
      'PRODUCTO_MES_LIVERPOOL'
    )
  ),
  fotos jsonb not null default '[]'::jsonb,
  observaciones text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices de performance
create index if not exists idx_supervisor_evidencia_cuenta
on public.supervisor_evidencia(cuenta_cliente_id);

create index if not exists idx_supervisor_evidencia_supervisor
on public.supervisor_evidencia(supervisor_empleado_id, fecha_operacion desc);

create index if not exists idx_supervisor_evidencia_pdv
on public.supervisor_evidencia(pdv_id, fecha_operacion desc);

create index if not exists idx_supervisor_evidencia_tipo
on public.supervisor_evidencia(tipo_evidencia, fecha_operacion desc);

-- Trigger de updated_at
drop trigger if exists trg_supervisor_evidencia_updated_at on public.supervisor_evidencia;
create trigger trg_supervisor_evidencia_updated_at
before update on public.supervisor_evidencia
for each row execute function public.actualizar_updated_at();

-- Habilitar RLS
alter table public.supervisor_evidencia enable row level security;

-- Políticas de RLS
drop policy if exists "supervisor_evidencia_select_base" on public.supervisor_evidencia;
create policy "supervisor_evidencia_select_base"
on public.supervisor_evidencia
for select
to authenticated
using (
  public.es_usuario_interno()
  or (public.es_cliente() and cuenta_cliente_id = public.get_my_cuenta_cliente_id())
  or (supervisor_empleado_id = public.get_my_empleado_id())
);

drop policy if exists "supervisor_evidencia_insert_operacion" on public.supervisor_evidencia;
create policy "supervisor_evidencia_insert_operacion"
on public.supervisor_evidencia
for insert
to authenticated
with check (
  public.get_my_role() in ('ADMINISTRADOR', 'COORDINADOR', 'SUPERVISOR')
);

drop policy if exists "supervisor_evidencia_update_operacion" on public.supervisor_evidencia;
create policy "supervisor_evidencia_update_operacion"
on public.supervisor_evidencia
for update
to authenticated
using (
  public.get_my_role() in ('ADMINISTRADOR', 'COORDINADOR')
  or (supervisor_empleado_id = public.get_my_empleado_id())
);

drop policy if exists "supervisor_evidencia_delete_admin" on public.supervisor_evidencia;
create policy "supervisor_evidencia_delete_admin"
on public.supervisor_evidencia
for delete
to authenticated
using (
  public.get_my_role() = 'ADMINISTRADOR'
);
