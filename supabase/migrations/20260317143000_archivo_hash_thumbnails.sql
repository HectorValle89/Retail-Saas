alter table public.archivo_hash
  add column if not exists miniatura_sha256 text,
  add column if not exists miniatura_bucket text,
  add column if not exists miniatura_ruta_archivo text,
  add column if not exists miniatura_mime_type text,
  add column if not exists miniatura_tamano_bytes bigint;

create index if not exists idx_archivo_hash_miniatura_sha256
  on public.archivo_hash(miniatura_sha256)
  where miniatura_sha256 is not null;
