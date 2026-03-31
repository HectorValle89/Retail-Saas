create table if not exists public.push_subscription (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid null references public.cuenta_cliente(id) on delete cascade,
  usuario_id uuid not null references public.usuario(id) on delete cascade,
  empleado_id uuid not null references public.empleado(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text null,
  ultima_suscripcion_en timestamptz not null default timezone('utc', now()),
  ultimo_envio_en timestamptz null,
  ultimo_error text null,
  activa boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists push_subscription_usuario_activa_idx
  on public.push_subscription (usuario_id, activa, updated_at desc);
create index if not exists push_subscription_empleado_activa_idx
  on public.push_subscription (empleado_id, activa, updated_at desc);
create index if not exists push_subscription_cuenta_activa_idx
  on public.push_subscription (cuenta_cliente_id, activa, updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_push_subscription_updated_at on public.push_subscription;
create trigger set_push_subscription_updated_at
before update on public.push_subscription
for each row
execute function public.set_updated_at();

alter table public.push_subscription enable row level security;

drop policy if exists push_subscription_select_self on public.push_subscription;
create policy push_subscription_select_self
on public.push_subscription
for select
using (
  auth.role() = 'authenticated'
  and (
    empleado_id = public.get_my_empleado_id()
    or public.get_my_role() = 'ADMINISTRADOR'
  )
);

drop policy if exists push_subscription_insert_self on public.push_subscription;
create policy push_subscription_insert_self
on public.push_subscription
for insert
with check (
  auth.role() = 'authenticated'
  and (
    empleado_id = public.get_my_empleado_id()
    or public.get_my_role() = 'ADMINISTRADOR'
  )
);

drop policy if exists push_subscription_update_self on public.push_subscription;
create policy push_subscription_update_self
on public.push_subscription
for update
using (
  auth.role() = 'authenticated'
  and (
    empleado_id = public.get_my_empleado_id()
    or public.get_my_role() = 'ADMINISTRADOR'
  )
)
with check (
  auth.role() = 'authenticated'
  and (
    empleado_id = public.get_my_empleado_id()
    or public.get_my_role() = 'ADMINISTRADOR'
  )
);

drop policy if exists push_subscription_delete_self on public.push_subscription;
create policy push_subscription_delete_self
on public.push_subscription
for delete
using (
  auth.role() = 'authenticated'
  and (
    empleado_id = public.get_my_empleado_id()
    or public.get_my_role() = 'ADMINISTRADOR'
  )
);