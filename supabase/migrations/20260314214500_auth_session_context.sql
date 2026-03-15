-- =====================================================
-- Auth session context freshness
-- Objetivo:
--   versionar el contexto auth dentro de auth.users para
--   detectar tokens stale cuando cambia el puesto, estado
--   de cuenta o la cuenta cliente operativa.
-- =====================================================

create or replace function public.refrescar_claims_auth_user(p_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims jsonb;
  v_context_updated_at text;
begin
  if p_auth_user_id is null then
    return;
  end if;

  v_context_updated_at := to_char(
    timezone('utc', clock_timestamp()),
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  v_claims :=
    public.construir_claims_usuario(p_auth_user_id)
    || jsonb_build_object('auth_context_updated_at', v_context_updated_at);

  update auth.users
  set raw_app_meta_data =
    (
      coalesce(raw_app_meta_data, '{}'::jsonb)
      - 'claims'
      - 'rol'
      - 'empleado_id'
      - 'cuenta_cliente_id'
      - 'estado_cuenta'
      - 'auth_context_updated_at'
    )
    || jsonb_build_object('claims', v_claims)
    || v_claims
  where id = p_auth_user_id;
end;
$$;

do $$
declare
  v_auth_user_id uuid;
begin
  for v_auth_user_id in
    select auth_user_id
    from public.usuario
    where auth_user_id is not null
  loop
    perform public.refrescar_claims_auth_user(v_auth_user_id);
  end loop;
end;
$$;
