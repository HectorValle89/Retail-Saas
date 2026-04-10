-- MIGRACION BASE PARA REFERENCIAS DE R2 EN POSTGRES
create table if not exists public.archivo_referencia (
    id uuid primary key default gen_random_uuid(),
    modulo varchar(50) not null,
    referencia_entidad_id uuid not null,
    r2_object_key varchar(255) unique not null,
    content_type varchar(100),
    file_size_bytes bigint,
    is_public boolean default false,
    creado_en timestamptz not null default now(),
    creado_por uuid references auth.users(id)
);

comment on table public.archivo_referencia is 'Tabla maestra para llevar el inventario de binarios descargados hacia Cloudflare R2.';

create index if not exists idx_archivo_modulo_entidad on public.archivo_referencia(modulo, referencia_entidad_id);
create index if not exists idx_archivo_creador on public.archivo_referencia(creado_por);

alter table public.archivo_referencia enable row level security;

create policy "Lectura compartida para creadores y roles jerarquicos" 
on public.archivo_referencia for select 
to authenticated using (
   creado_por = auth.uid() or
   (auth.jwt() ->> 'rol') in ('ADMINISTRADOR', 'COORDINADOR', 'SUPERVISOR', 'CLIENTE')
);

create policy "Insercion estricta atada a la sesion activa" 
on public.archivo_referencia for insert 
to authenticated with check (
   creado_por = auth.uid()
);

create policy "Eliminacion solo por el creador original o admin" 
on public.archivo_referencia for delete 
to authenticated using (
   creado_por = auth.uid() or
   (auth.jwt() ->> 'rol') = 'ADMINISTRADOR'
);
