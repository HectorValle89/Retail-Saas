alter table public.asignacion_descanso_override
  add column if not exists modo text null,
  add column if not exists regla_descanso jsonb null;

update public.asignacion_descanso_override
set
  modo = coalesce(modo, 'EXPLICITO'),
  regla_descanso = case
    when regla_descanso is null then null
    else regla_descanso
  end
where modo is null;

alter table public.asignacion_descanso_override
  alter column modo set default 'EXPLICITO';

alter table public.asignacion_descanso_override
  add constraint asignacion_descanso_override_modo_valido
  check (modo in ('EXPLICITO', 'REGLA_MENSUAL'));

alter table public.asignacion_descanso_override
  add constraint asignacion_descanso_override_regla_objeto
  check (
    regla_descanso is null
    or jsonb_typeof(regla_descanso) = 'object'
  );

create index if not exists idx_asignacion_descanso_override_modo
  on public.asignacion_descanso_override(modo);
