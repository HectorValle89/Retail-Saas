-- =====================================================
-- Fase 1 - Sincronizacion de claims JWT
-- Objetivo:
--   propagar `puesto`, `empleado_id`, `cuenta_cliente_id`
--   y `estado_cuenta` desde tablas de negocio hacia auth.users.
-- =====================================================

create or replace function public.construir_claims_usuario(p_auth_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_usuario record;
begin
  select
    u.auth_user_id,
    u.empleado_id,
    u.cuenta_cliente_id,
    u.estado_cuenta,
    e.puesto
  into v_usuario
  from public.usuario u
  join public.empleado e on e.id = u.empleado_id
  where u.auth_user_id = p_auth_user_id;

  if not found then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'rol', v_usuario.puesto,
    'empleado_id', v_usuario.empleado_id,
    'cuenta_cliente_id', v_usuario.cuenta_cliente_id,
    'estado_cuenta', v_usuario.estado_cuenta
  );
end;
$$;

create or replace function public.refrescar_claims_auth_user(p_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims jsonb;
begin
  if p_auth_user_id is null then
    return;
  end if;

  v_claims := public.construir_claims_usuario(p_auth_user_id);

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('claims', v_claims)
    || v_claims
  where id = p_auth_user_id;
end;
$$;

create or replace function public.trg_refrescar_claims_desde_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refrescar_claims_auth_user(new.auth_user_id);
  return new;
end;
$$;

create or replace function public.trg_refrescar_claims_desde_empleado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid;
begin
  for v_auth_user_id in
    select u.auth_user_id
    from public.usuario u
    where u.empleado_id = new.id
      and u.auth_user_id is not null
  loop
    perform public.refrescar_claims_auth_user(v_auth_user_id);
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_usuario_refrescar_claims on public.usuario;
create trigger trg_usuario_refrescar_claims
after insert or update of auth_user_id, empleado_id, cuenta_cliente_id, estado_cuenta
on public.usuario
for each row
execute function public.trg_refrescar_claims_desde_usuario();

drop trigger if exists trg_empleado_refrescar_claims on public.empleado;
create trigger trg_empleado_refrescar_claims
after update of puesto
on public.empleado
for each row
execute function public.trg_refrescar_claims_desde_empleado();
