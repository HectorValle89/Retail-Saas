-- =====================================================
-- Empleados: datos personales ampliados para OCR
-- Objetivo:
--   extender el expediente laboral con datos personales
--   estructurados que se llenan desde OCR+IA y pueden ser
--   revisados en el flujo administrativo.
-- =====================================================

alter table public.empleado
  add column if not exists fecha_nacimiento date,
  add column if not exists domicilio_completo text,
  add column if not exists codigo_postal text,
  add column if not exists edad integer check (edad is null or edad between 14 and 100),
  add column if not exists anios_laborando integer check (anios_laborando is null or anios_laborando between 0 and 80),
  add column if not exists sexo text,
  add column if not exists estado_civil text,
  add column if not exists originario text,
  add column if not exists sbc_diario numeric(10,2);

comment on column public.empleado.fecha_nacimiento is 'Fecha de nacimiento detectada o confirmada desde expediente.';
comment on column public.empleado.domicilio_completo is 'Domicilio priorizado desde comprobante de domicilio cuando exista.';
comment on column public.empleado.codigo_postal is 'Codigo postal extraido desde expediente.';
comment on column public.empleado.edad is 'Edad detectada o confirmada desde expediente.';
comment on column public.empleado.anios_laborando is 'Antiguedad laboral reportada o calculada para seguimiento administrativo.';
comment on column public.empleado.sexo is 'Sexo reportado en expediente.';
comment on column public.empleado.estado_civil is 'Estado civil reportado en expediente.';
comment on column public.empleado.originario is 'Lugar de origen del empleado.';
comment on column public.empleado.sbc_diario is 'Salario base de cotizacion diario para flujo IMSS/Nomina.';
