-- Simplifica la nomenclatura de incapacidades a I (inicial) e IS (subsecuente).
-- La clase procede del formato médico y debe ser confirmada por el actor receptor.

create or replace function public.validar_clasificacion_incapacidad()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_clase text;
begin
  if new.tipo <> 'INCAPACIDAD' then
    return new;
  end if;

  v_clase := upper(trim(coalesce(new.metadata ->> 'incapacidad_clase', '')));

  if v_clase in ('I', 'INICIAL') then
    v_clase := 'INICIAL';
  elsif v_clase in ('IS', 'SUBSECUENTE') then
    v_clase := 'SUBSECUENTE';
  elsif v_clase <> '' then
    raise exception 'INCAPACIDAD_CLASE_INVALIDA';
  end if;

  if v_clase <> '' then
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'incapacidad_clase', v_clase,
      'incapacidad_codigo_asistencia', case when v_clase = 'SUBSECUENTE' then 'IS' else 'I' end
    );
  end if;

  if new.estatus = 'REGISTRADA_RH' and v_clase = '' then
    raise exception 'INCAPACIDAD_CLASE_REQUERIDA_PARA_FORMALIZAR';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_solicitud_validar_clasificacion_incapacidad on public.solicitud;
create trigger trg_solicitud_validar_clasificacion_incapacidad
before insert or update of tipo, estatus, metadata
on public.solicitud
for each row
execute function public.validar_clasificacion_incapacidad();

update public.solicitud
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'incapacidad_clase',
  case
    when upper(trim(coalesce(metadata ->> 'incapacidad_clase', ''))) in ('IS', 'SUBSECUENTE')
      then 'SUBSECUENTE'
    else 'INICIAL'
  end,
  'incapacidad_codigo_asistencia',
  case
    when upper(trim(coalesce(metadata ->> 'incapacidad_clase', ''))) in ('IS', 'SUBSECUENTE')
      then 'IS'
    else 'I'
  end,
  'incapacidad_clasificacion_migrada', true
)
where tipo = 'INCAPACIDAD'
  and coalesce(metadata ->> 'incapacidad_clase', '') <> '';

comment on function public.validar_clasificacion_incapacidad() is
  'Normaliza la clase informada en el formato médico y limita Asistencias a los códigos I e IS.';
