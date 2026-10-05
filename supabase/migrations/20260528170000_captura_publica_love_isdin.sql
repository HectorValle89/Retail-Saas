-- Migración: Soporte para LOVE_ISDIN, subtipos y evidencias fotográficas en capturas públicas

-- 1. Actualizar las acciones válidas en la tabla de links
alter table public.captura_publica_link drop constraint if exists captura_publica_link_acciones_validas;
alter table public.captura_publica_link add constraint captura_publica_link_acciones_validas
  check (acciones_habilitadas <@ array['VENTA', 'CANJE', 'DESABASTO', 'LOVE_ISDIN']::text[]);

-- 2. Actualizar el check de tipo de registro en la tabla de capturas
alter table public.captura_publica_registro drop constraint if exists captura_publica_registro_tipo_registro_check;
alter table public.captura_publica_registro add constraint captura_publica_registro_tipo_registro_check
  check (tipo_registro in ('VENTA', 'CANJE', 'DESABASTO', 'LOVE_ISDIN'));

-- 3. Agregar columnas para subtipo y foto de evidencia si no existen
alter table public.captura_publica_registro add column if not exists subtipo_registro text;
alter table public.captura_publica_registro add column if not exists foto_evidencia_url text;
alter table public.captura_publica_registro add column if not exists foto_evidencia_hash text;

comment on column public.captura_publica_registro.subtipo_registro is 'Clasificación secundaria del registro (ej. CANJE_CON_TICKET, LOVE_EXITOSO, LOVE_FALLIDO).';
comment on column public.captura_publica_registro.foto_evidencia_url is 'URL de la foto de evidencia cargada de forma pública (comprimida y optimizada).';
comment on column public.captura_publica_registro.foto_evidencia_hash is 'Hash SHA-256 de la foto para deduplicación en la tabla archivo_hash.';
