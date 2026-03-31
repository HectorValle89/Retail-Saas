-- =====================================================
-- Fase 7.7 - Scheduling diario de limpieza de archivos huerfanos
-- Objetivo:
--   programar la Edge Function `storage-orphans-cleanup`
--   usando pg_cron + pg_net y Vault cuando exista.
--   Si Vault no esta disponible, la migracion no falla y
--   deja la programacion lista para configuracion posterior.
-- =====================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (
    select 1
    from pg_available_extensions
    where name = 'vault'
  ) then
    execute 'create extension if not exists vault with schema vault';
  else
    raise notice 'vault no esta disponible en este proyecto; el cron no se autoprogramara hasta configurar secretos por otro medio.';
  end if;
end;
$$;

create or replace function public.try_get_vault_secret(secret_name text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  secret_value text;
begin
  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into secret_value
      using secret_name;
  exception
    when undefined_table or invalid_schema_name then
      return null;
  end;

  return secret_value;
end;
$$;

revoke all on function public.try_get_vault_secret(text) from public;
grant execute on function public.try_get_vault_secret(text) to postgres, service_role;

create or replace function public.invoke_storage_orphans_cleanup(
  dry_run boolean default false,
  delete_expired_orphans boolean default true
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  project_url text;
  anon_key text;
  request_id bigint;
begin
  project_url := public.try_get_vault_secret('project_url');
  anon_key := public.try_get_vault_secret('anon_key');

  if coalesce(project_url, '') = '' or coalesce(anon_key, '') = '' then
    raise exception 'Faltan secretos project_url y/o anon_key en Vault para invocar storage-orphans-cleanup';
  end if;

  select net.http_post(
    url := project_url || '/functions/v1/storage-orphans-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    ),
    body := jsonb_build_object(
      'dryRun', dry_run,
      'deleteExpiredOrphans', delete_expired_orphans,
      'triggeredAt', now()
    ),
    timeout_milliseconds := 10000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_storage_orphans_cleanup(boolean, boolean) from public;
grant execute on function public.invoke_storage_orphans_cleanup(boolean, boolean) to postgres, service_role;

create or replace function public.configure_storage_orphans_cleanup_schedule(
  cron_expression text default '15 3 * * *',
  dry_run boolean default false,
  delete_expired_orphans boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  project_url text;
  anon_key text;
begin
  project_url := public.try_get_vault_secret('project_url');
  anon_key := public.try_get_vault_secret('anon_key');

  if coalesce(project_url, '') = '' or coalesce(anon_key, '') = '' then
    raise notice 'Saltando programacion de storage-orphans-cleanup: faltan secretos project_url y/o anon_key en Vault';
    return;
  end if;

  perform cron.unschedule('storage-orphans-cleanup-daily')
  where exists (
    select 1
    from cron.job
    where jobname = 'storage-orphans-cleanup-daily'
  );

  perform cron.schedule(
    'storage-orphans-cleanup-daily',
    cron_expression,
    format(
      $job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        ),
        body := jsonb_build_object(
          'dryRun', %L::boolean,
          'deleteExpiredOrphans', %L::boolean,
          'triggeredAt', now()
        ),
        timeout_milliseconds := 10000
      ) as request_id;
      $job$,
      project_url || '/functions/v1/storage-orphans-cleanup',
      anon_key,
      dry_run,
      delete_expired_orphans
    )
  );
end;
$$;

revoke all on function public.configure_storage_orphans_cleanup_schedule(text, boolean, boolean) from public;
grant execute on function public.configure_storage_orphans_cleanup_schedule(text, boolean, boolean) to postgres, service_role;

select public.configure_storage_orphans_cleanup_schedule();
