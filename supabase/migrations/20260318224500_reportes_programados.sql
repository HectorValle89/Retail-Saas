create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists public.reporte_programado (
  id uuid primary key default gen_random_uuid(),
  cuenta_cliente_id uuid null references public.cuenta_cliente(id) on delete cascade,
  creado_por_usuario_id uuid not null references public.usuario(id) on delete restrict,
  destinatario_email text not null,
  seccion text not null check (seccion in ('clientes', 'asistencias', 'ventas', 'campanas', 'ranking_ventas', 'ranking_cuotas', 'gastos', 'love', 'nomina', 'bitacora')),
  formato text not null check (formato in ('csv', 'xlsx', 'pdf')),
  periodicidad text not null check (periodicidad in ('SEMANAL', 'MENSUAL')),
  dia_semana smallint null check (dia_semana between 0 and 6),
  dia_mes smallint null check (dia_mes between 1 and 28),
  hora_utc time not null default '08:00:00',
  activa boolean not null default true,
  ultima_ejecucion_en timestamptz null,
  proxima_ejecucion_en timestamptz not null,
  ultimo_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint reporte_programado_cadencia_chk check (
    (periodicidad = 'SEMANAL' and dia_semana is not null) or
    (periodicidad = 'MENSUAL' and dia_mes is not null)
  )
);

create index if not exists reporte_programado_cuenta_idx on public.reporte_programado(cuenta_cliente_id, activa, proxima_ejecucion_en);
create index if not exists reporte_programado_due_idx on public.reporte_programado(activa, proxima_ejecucion_en);

alter table public.reporte_programado enable row level security;

create policy "reporte_programado_select_admin"
on public.reporte_programado
for select
using (
  public.get_my_role() = 'ADMINISTRADOR'
  and (
    cuenta_cliente_id is null
    or cuenta_cliente_id = public.get_my_account_id()
    or public.get_my_account_id() is null
  )
);

create policy "reporte_programado_insert_admin"
on public.reporte_programado
for insert
with check (
  public.get_my_role() = 'ADMINISTRADOR'
  and (
    cuenta_cliente_id is null
    or cuenta_cliente_id = public.get_my_account_id()
    or public.get_my_account_id() is null
  )
);

create policy "reporte_programado_update_admin"
on public.reporte_programado
for update
using (
  public.get_my_role() = 'ADMINISTRADOR'
  and (
    cuenta_cliente_id is null
    or cuenta_cliente_id = public.get_my_account_id()
    or public.get_my_account_id() is null
  )
)
with check (
  public.get_my_role() = 'ADMINISTRADOR'
  and (
    cuenta_cliente_id is null
    or cuenta_cliente_id = public.get_my_account_id()
    or public.get_my_account_id() is null
  )
);

create or replace function public.invoke_reportes_scheduler()
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
    raise exception 'Faltan secretos project_url y/o anon_key en Vault para invocar reportes-scheduler';
  end if;

  select net.http_post(
    url := project_url || '/functions/v1/reportes-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    ),
    body := jsonb_build_object('triggeredAt', now()),
    timeout_milliseconds := 15000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_reportes_scheduler() from public;
grant execute on function public.invoke_reportes_scheduler() to postgres, service_role;

create or replace function public.configure_reportes_scheduler_schedule(
  cron_expression text default '20 6 * * *'
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
    raise notice 'Saltando programacion de reportes-scheduler: faltan secretos project_url y/o anon_key en Vault';
    return;
  end if;

  perform cron.unschedule('reportes-scheduler-daily')
  where exists (
    select 1
    from cron.job
    where jobname = 'reportes-scheduler-daily'
  );

  perform cron.schedule(
    'reportes-scheduler-daily',
    cron_expression,
    format(
      $job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        ),
        body := jsonb_build_object('triggeredAt', now()),
        timeout_milliseconds := 15000
      ) as request_id;
      $job$,
      project_url || '/functions/v1/reportes-scheduler',
      anon_key
    )
  );
end;
$$;

revoke all on function public.configure_reportes_scheduler_schedule(text) from public;
grant execute on function public.configure_reportes_scheduler_schedule(text) to postgres, service_role;

select public.configure_reportes_scheduler_schedule();
