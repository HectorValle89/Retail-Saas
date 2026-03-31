-- Fase 5 - Gastos: categoria explicita para formaciones
-- Permite registrar gastos cuya categoria principal es FORMACION
-- sin depender unicamente de la relacion formacion_evento_id.

alter table public.gasto
  drop constraint if exists gasto_tipo_check;

alter table public.gasto
  add constraint gasto_tipo_check
  check (
    tipo in (
      'VIATICOS',
      'TRANSPORTE',
      'ALIMENTOS',
      'MATERIAL_POP',
      'FORMACION',
      'HOSPEDAJE',
      'OTRO'
    )
  );