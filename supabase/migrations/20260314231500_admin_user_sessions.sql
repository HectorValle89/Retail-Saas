-- =====================================================
-- Admin auth sessions view
-- Objetivo:
--   exponer sesiones auth activas/inactivas a administradores
--   sin abrir acceso directo al esquema auth.
-- =====================================================

create or replace function public.admin_list_auth_sessions()
returns table (
  auth_user_id uuid,
  session_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  refreshed_at timestamptz,
  not_after timestamptz,
  user_agent text,
  ip text,
  aal text,
  tag text,
  is_active boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesion autenticada requerida para consultar sesiones auth.';
  end if;

  if not public.es_administrador() then
    raise exception 'Solo administradores pueden consultar sesiones auth.';
  end if;

  return query
  select
    s.user_id as auth_user_id,
    s.id as session_id,
    s.created_at,
    s.updated_at,
    case
      when s.refreshed_at is null then null
      else s.refreshed_at at time zone 'utc'
    end as refreshed_at,
    s.not_after,
    s.user_agent,
    host(s.ip) as ip,
    s.aal::text as aal,
    s.tag,
    coalesce(s.not_after > timezone('utc', now()), true) as is_active
  from auth.sessions s
  order by coalesce(s.refreshed_at at time zone 'utc', s.updated_at, s.created_at) desc;
end;
$$;

revoke all on function public.admin_list_auth_sessions() from public;
grant execute on function public.admin_list_auth_sessions() to authenticated;

create or replace function public.admin_list_auth_session_summaries()
returns table (
  auth_user_id uuid,
  active_sessions_count integer,
  total_sessions_count integer,
  last_session_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesion autenticada requerida para consultar sesiones auth.';
  end if;

  if not public.es_administrador() then
    raise exception 'Solo administradores pueden consultar sesiones auth.';
  end if;

  return query
  select
    s.user_id as auth_user_id,
    count(*) filter (where coalesce(s.not_after > timezone('utc', now()), true))::integer as active_sessions_count,
    count(*)::integer as total_sessions_count,
    max(coalesce(s.refreshed_at at time zone 'utc', s.updated_at, s.created_at)) as last_session_at
  from auth.sessions s
  group by s.user_id
  order by last_session_at desc nulls last;
end;
$$;

revoke all on function public.admin_list_auth_session_summaries() from public;
grant execute on function public.admin_list_auth_session_summaries() to authenticated;

create or replace function public.admin_list_auth_sessions_for_user(p_auth_user_id uuid)
returns table (
  auth_user_id uuid,
  session_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  refreshed_at timestamptz,
  not_after timestamptz,
  user_agent text,
  ip text,
  aal text,
  tag text,
  is_active boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesion autenticada requerida para consultar sesiones auth.';
  end if;

  if not public.es_administrador() then
    raise exception 'Solo administradores pueden consultar sesiones auth.';
  end if;

  return query
  select
    s.user_id as auth_user_id,
    s.id as session_id,
    s.created_at,
    s.updated_at,
    case
      when s.refreshed_at is null then null
      else s.refreshed_at at time zone 'utc'
    end as refreshed_at,
    s.not_after,
    s.user_agent,
    host(s.ip) as ip,
    s.aal::text as aal,
    s.tag,
    coalesce(s.not_after > timezone('utc', now()), true) as is_active
  from auth.sessions s
  where s.user_id = p_auth_user_id
  order by coalesce(s.refreshed_at at time zone 'utc', s.updated_at, s.created_at) desc;
end;
$$;

revoke all on function public.admin_list_auth_sessions_for_user(uuid) from public;
grant execute on function public.admin_list_auth_sessions_for_user(uuid) to authenticated;
