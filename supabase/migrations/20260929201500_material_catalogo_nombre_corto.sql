-- Agrega columna nombre_corto a material_catalogo para uso en vistas compactas operativas
alter table public.material_catalogo
add column if not exists nombre_corto text;

comment on column public.material_catalogo.nombre_corto is 'Nombre corto o abreviado del material para vistas compactas móviles y operativas';
