alter table public.pdv
add column if not exists activo boolean not null default true;

update public.pdv
set activo = case
  when upper(coalesce(estatus, 'ACTIVO')) = 'ACTIVO' then true
  else false
end
where activo is distinct from case
  when upper(coalesce(estatus, 'ACTIVO')) = 'ACTIVO' then true
  else false
end;

create index if not exists idx_pdv_activo on public.pdv(activo);