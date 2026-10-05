-- Migración para añadir el tipo 'ENTREGA_UNIFORMES' a la columna tipo_evidencia en supervisor_evidencia
begin;

-- Eliminar el check constraint existente (Postgres lo nombra por defecto supervisor_evidencia_tipo_evidencia_check)
alter table public.supervisor_evidencia
  drop constraint if exists supervisor_evidencia_tipo_evidencia_check;

-- Volver a crear el check constraint con todos los tipos más el nuevo
alter table public.supervisor_evidencia
  add constraint supervisor_evidencia_tipo_evidencia_check
  check (
    tipo_evidencia in (
      'MATERIAL_POP',
      'CAMPANA_ESTACIONAL',
      'MALETA_VANITY',
      'EVENTO_ESPECIAL',
      'ADOPTADO_SAN_PABLO',
      'PRODUCTO_MES_LIVERPOOL',
      'ENTREGA_UNIFORMES'
    )
  );

commit;
