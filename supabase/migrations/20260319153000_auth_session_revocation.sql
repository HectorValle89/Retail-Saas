-- =====================================================
-- Auth session revocation on role/account-state changes
-- Objetivo:
--   invalidar sesiones activas cuando cambia el contexto
--   operativo del usuario (puesto, cuenta cliente, estado).
-- =====================================================

create or replace function public.invalidar_sesiones_auth_user(p_auth_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_rows integer := 0;
begin
  if p_auth_user_id is null then
    return 0;
  end if;

  update auth.sessions
  set
    not_after = v_now,
    updated_at = v_now
  where user_id = p_auth_user_id
    and coalesce(not_after > v_now, true);

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.invalidar_sesiones_auth_user(uuid) from public;

create or replace function public.trg_refrescar_claims_desde_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.auth_user_id is distinct from new.auth_user_id and old.auth_user_id is not null then
      perform public.invalidar_sesiones_auth_user(old.auth_user_id);
    end if;

    if new.auth_user_id is not null and (
      old.auth_user_id is distinct from new.auth_user_id
      or old.empleado_id is distinct from new.empleado_id
      or old.cuenta_cliente_id is distinct from new.cuenta_cliente_id
      or old.estado_cuenta is distinct from new.estado_cuenta
    ) then
      perform public.invalidar_sesiones_auth_user(new.auth_user_id);
    end if;
  end if;

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

    if tg_op = 'UPDATE' and old.puesto is distinct from new.puesto then
      perform public.invalidar_sesiones_auth_user(v_auth_user_id);
    end if;
  end loop;

  return new;
end;
$$;
