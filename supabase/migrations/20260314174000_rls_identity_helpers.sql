-- =====================================================
-- Fase 0 - Correccion de helpers de identidad para RLS
-- Objetivo:
--   evitar recursion en policies al derivar rol, empleado y
--   cuenta_cliente desde tablas con RLS habilitado.
-- =====================================================

create or replace function public.get_my_empleado_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empleado_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  select u.empleado_id
  into v_empleado_id
  from public.usuario u
  where u.auth_user_id = auth.uid()
  limit 1;

  return v_empleado_id;
end;
$$;

create or replace function public.get_my_cuenta_cliente_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cuenta_cliente_id uuid;
begin
  v_cuenta_cliente_id := public.jwt_cuenta_cliente_id();

  if v_cuenta_cliente_id is not null then
    return v_cuenta_cliente_id;
  end if;

  if auth.uid() is null then
    return null;
  end if;

  select u.cuenta_cliente_id
  into v_cuenta_cliente_id
  from public.usuario u
  where u.auth_user_id = auth.uid()
  limit 1;

  return v_cuenta_cliente_id;
end;
$$;

create or replace function public.get_my_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol text;
begin
  v_rol := nullif(public.jwt_claim_text('rol'), '');

  if v_rol is not null then
    return v_rol;
  end if;

  if auth.uid() is null then
    return '';
  end if;

  select e.puesto
  into v_rol
  from public.usuario u
  join public.empleado e on e.id = u.empleado_id
  where u.auth_user_id = auth.uid()
  limit 1;

  return coalesce(v_rol, '');
end;
$$;
