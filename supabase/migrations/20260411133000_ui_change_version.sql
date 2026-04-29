-- =====================================================
-- Infraestructura de invalidacion selectiva de UI
-- Objetivo:
--   permitir que la aplicacion detecte cambios por modulo,
--   superficie y scope sin escuchar tablas operativas grandes
--   ni refrescar rutas completas.
-- =====================================================

create table if not exists public.ui_change_version (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid references public.cuenta_cliente(id) on delete cascade,
  module text not null,
  surface text not null,
  scope_key text not null,
  role_target text not null default 'ALL',
  empleado_id uuid references public.empleado(id) on delete cascade,
  supervisor_empleado_id uuid references public.empleado(id) on delete cascade,
  version bigint not null default 1,
  last_event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ui_change_version_role_target_check check (
    role_target in (
      'ALL',
      'DERMOCONSEJERO',
      'SUPERVISOR',
      'COORDINADOR',
      'RECLUTAMIENTO',
      'NOMINA',
      'LOGISTICA',
      'LOVE_IS',
      'VENTAS',
      'ADMINISTRADOR',
      'CLIENTE'
    )
  ),
  constraint ui_change_version_unique_scope unique (module, surface, scope_key, role_target)
);

create index if not exists idx_ui_change_version_account_module_surface
  on public.ui_change_version(cuenta_cliente_id, module, surface);

create index if not exists idx_ui_change_version_scope_key
  on public.ui_change_version(scope_key);

create index if not exists idx_ui_change_version_empleado
  on public.ui_change_version(empleado_id);

create index if not exists idx_ui_change_version_supervisor
  on public.ui_change_version(supervisor_empleado_id);

create index if not exists idx_ui_change_version_updated_at
  on public.ui_change_version(updated_at desc);

create trigger trg_ui_change_version_updated_at
before update on public.ui_change_version
for each row execute function public.actualizar_updated_at();

alter table public.ui_change_version enable row level security;

drop policy if exists "ui_change_version_select_operacion" on public.ui_change_version;
create policy "ui_change_version_select_operacion"
on public.ui_change_version
for select
to authenticated
using (
  public.es_administrador()
  or (
    public.es_usuario_interno()
    and (
      cuenta_cliente_id is null
      or cuenta_cliente_id = public.get_my_cuenta_cliente_id()
    )
    and (
      scope_key = 'global'
      or scope_key = ('cuenta:' || public.get_my_cuenta_cliente_id()::text)
      or scope_key = ('empleado:' || public.get_my_empleado_id()::text)
      or scope_key = ('supervisor:' || public.get_my_empleado_id()::text)
      or empleado_id = public.get_my_empleado_id()
      or supervisor_empleado_id = public.get_my_empleado_id()
    )
  )
);

create or replace function public.touch_ui_change_version(
  p_cuenta_cliente_id uuid,
  p_module text,
  p_surface text,
  p_scope_key text,
  p_role_target text default 'ALL',
  p_empleado_id uuid default null,
  p_supervisor_empleado_id uuid default null,
  p_last_event_type text default 'updated',
  p_metadata jsonb default '{}'::jsonb
)
returns public.ui_change_version
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ui_change_version;
begin
  insert into public.ui_change_version (
    cuenta_cliente_id,
    module,
    surface,
    scope_key,
    role_target,
    empleado_id,
    supervisor_empleado_id,
    version,
    last_event_type,
    metadata
  )
  values (
    p_cuenta_cliente_id,
    p_module,
    p_surface,
    p_scope_key,
    coalesce(nullif(p_role_target, ''), 'ALL'),
    p_empleado_id,
    p_supervisor_empleado_id,
    1,
    coalesce(nullif(p_last_event_type, ''), 'updated'),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (module, surface, scope_key, role_target)
  do update
  set
    cuenta_cliente_id = coalesce(excluded.cuenta_cliente_id, public.ui_change_version.cuenta_cliente_id),
    empleado_id = coalesce(excluded.empleado_id, public.ui_change_version.empleado_id),
    supervisor_empleado_id = coalesce(excluded.supervisor_empleado_id, public.ui_change_version.supervisor_empleado_id),
    version = public.ui_change_version.version + 1,
    last_event_type = excluded.last_event_type,
    metadata = coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant select on public.ui_change_version to authenticated;
grant execute on function public.touch_ui_change_version(uuid, text, text, text, text, uuid, uuid, text, jsonb) to authenticated;

alter publication supabase_realtime add table public.ui_change_version;
