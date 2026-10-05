-- Migración: 20261005110000_agregar_columna_version_publicada_lote.sql
-- Propósito: Agregar columna version_publicada a la tabla public.planeacion_cambio_lote
-- para permitir que aplicar_planeacion_mensual registre la versión publicada sin error
-- "column version_publicada of relation planeacion_cambio_lote does not exist".

alter table public.planeacion_cambio_lote
  add column if not exists version_publicada bigint;

comment on column public.planeacion_cambio_lote.version_publicada is
  'Número de versión generado e incrementado en ui_change_version al publicar exitosamente el lote de cambios.';
