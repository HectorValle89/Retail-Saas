-- =====================================================
-- Fase 5 - Nomina: aprobacion, dispersion y recibos
-- Objetivo:
--   ampliar el ciclo de vida del periodo de nomina,
--   habilitar lectura propia de recibos y conservar
--   mutabilidad solo durante BORRADOR.
-- =====================================================

alter table public.nomina_periodo
  drop constraint if exists nomina_periodo_estado_check;

update public.nomina_periodo
set estado = case
  when estado = 'ABIERTO' then 'BORRADOR'
  when estado = 'CERRADO' then 'APROBADO'
  else estado
end
where estado in ('ABIERTO', 'CERRADO');

alter table public.nomina_periodo
  add constraint nomina_periodo_estado_check
  check (estado in ('BORRADOR', 'APROBADO', 'DISPERSADO'));

create or replace function public.validar_nomina_periodo_unico_abierto()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado = 'BORRADOR'
    and exists (
      select 1
      from public.nomina_periodo
      where estado = 'BORRADOR'
        and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) then
    raise exception 'NOMINA_SOLO_UN_PERIODO_BORRADOR';
  end if;

  if new.estado in ('APROBADO', 'DISPERSADO') and new.fecha_cierre is null then
    new.fecha_cierre = now();
  end if;

  if new.estado = 'BORRADOR' then
    new.fecha_cierre = null;
  end if;

  return new;
end;
$$;

create or replace function public.validar_nomina_detalle_periodo_abierto()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_estado text;
begin
  select estado
  into v_estado
  from public.nomina_periodo
  where id = new.periodo_id;

  if not found then
    raise exception 'NOMINA_PERIODO_NO_ENCONTRADO';
  end if;

  if v_estado <> 'BORRADOR' then
    raise exception 'NOMINA_PERIODO_INMUTABLE';
  end if;

  return new;
end;
$$;

drop policy if exists "nomina_periodo_select_empleado_propio" on public.nomina_periodo;
create policy "nomina_periodo_select_empleado_propio"
on public.nomina_periodo
for select
to authenticated
using (
  exists (
    select 1
    from public.nomina_ledger l
    where l.periodo_id = nomina_periodo.id
      and l.empleado_id = public.get_my_empleado_id()
  )
  or exists (
    select 1
    from public.cuota_empleado_periodo c
    where c.periodo_id = nomina_periodo.id
      and c.empleado_id = public.get_my_empleado_id()
  )
);

drop policy if exists "cuota_empleado_periodo_select_empleado_propio" on public.cuota_empleado_periodo;
create policy "cuota_empleado_periodo_select_empleado_propio"
on public.cuota_empleado_periodo
for select
to authenticated
using (empleado_id = public.get_my_empleado_id());

drop policy if exists "nomina_ledger_select_empleado_propio" on public.nomina_ledger;
create policy "nomina_ledger_select_empleado_propio"
on public.nomina_ledger
for select
to authenticated
using (empleado_id = public.get_my_empleado_id());