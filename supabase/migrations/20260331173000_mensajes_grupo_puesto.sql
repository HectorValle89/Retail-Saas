alter table public.mensaje_interno
  drop constraint if exists mensaje_interno_grupo_destino_check;

alter table public.mensaje_interno
  add constraint mensaje_interno_grupo_destino_check
  check (grupo_destino in ('TODOS_DCS', 'ZONA', 'SUPERVISOR', 'PUESTO'));
