-- =====================================================
-- Auth activation flow orchestration
-- Objetivo:
--   Persistir el estado fino de activacion, recuperacion y
--   cambio de correo para soportar reintentos y rescates.
-- =====================================================

create or replace function public.set_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.auth_activation_flow (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuario(id) on delete cascade,
  auth_user_id uuid null references auth.users(id) on delete cascade,
  tipo_flujo text not null check (
    tipo_flujo in ('PRIMER_INGRESO', 'RESET_PASSWORD', 'CHANGE_EMAIL')
  ),
  estado text not null check (
    estado in (
      'AWAITING_EMAIL_CONFIRMATION',
      'EMAIL_CONFIRMED_PASSWORD_PENDING',
      'RESET_LINK_SENT',
      'RESET_PASSWORD_PENDING',
      'RELOGIN_REQUIRED',
      'COMPLETED',
      'EXPIRED',
      'CANCELLED'
    )
  ),
  correo_anterior text null,
  correo_pendiente text null,
  correo_confirmado text null,
  link_sent_at timestamptz null,
  link_expires_at timestamptz null,
  email_confirmed_at timestamptz null,
  otp_code_hash text null,
  otp_expires_at timestamptz null,
  otp_sent_at timestamptz null,
  otp_attempts integer not null default 0 check (otp_attempts >= 0),
  activation_ticket_hash text null,
  activation_ticket_expires_at timestamptz null,
  password_set_at timestamptz null,
  completed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_auth_activation_flow_usuario_tipo_estado
  on public.auth_activation_flow (usuario_id, tipo_flujo, estado);

create index if not exists idx_auth_activation_flow_auth_user
  on public.auth_activation_flow (auth_user_id, tipo_flujo, estado);

create index if not exists idx_auth_activation_flow_correo_pendiente
  on public.auth_activation_flow (lower(correo_pendiente));

create index if not exists idx_auth_activation_flow_correo_confirmado
  on public.auth_activation_flow (lower(correo_confirmado));

create unique index if not exists uq_auth_activation_flow_activo
  on public.auth_activation_flow (usuario_id, tipo_flujo)
  where estado in (
    'AWAITING_EMAIL_CONFIRMATION',
    'EMAIL_CONFIRMED_PASSWORD_PENDING',
    'RESET_LINK_SENT',
    'RESET_PASSWORD_PENDING',
    'RELOGIN_REQUIRED'
  );

drop trigger if exists set_timestamp_auth_activation_flow on public.auth_activation_flow;
create trigger set_timestamp_auth_activation_flow
before update on public.auth_activation_flow
for each row execute function public.set_timestamp();

alter table public.auth_activation_flow enable row level security;
