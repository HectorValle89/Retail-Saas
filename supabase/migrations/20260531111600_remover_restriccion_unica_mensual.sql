-- Migración: Eliminar restricción única mensual truncada en material_distribucion_mensual
-- Regla de español latino y UTF-8

alter table public.material_distribucion_mensual
  drop constraint if exists material_distribucion_mensual_cuenta_cliente_id_pdv_id_mes__key;

comment on table public.material_distribucion_mensual is 'Tabla de dispersiones mensuales sin restricción de PDV único para soportar múltiples dermoconsejeras por tienda';
