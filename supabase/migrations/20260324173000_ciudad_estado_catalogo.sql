alter table public.ciudad
add column if not exists estado text;

update public.ciudad
set estado = case upper(trim(nombre))
  when 'CIUDAD DE MEXICO' then 'CIUDAD DE MEXICO'
  when 'CDMX' then 'CIUDAD DE MEXICO'
  when 'MONTERREY' then 'NUEVO LEON'
  when 'GUADALAJARA' then 'JALISCO'
  when 'PUEBLA' then 'PUEBLA'
  when 'MERIDA' then 'YUCATAN'
  when 'QUERETARO' then 'QUERETARO'
  when 'LEON' then 'GUANAJUATO'
  when 'HERMOSILLO' then 'SONORA'
  when 'CULIACAN' then 'SINALOA'
  when 'MAZATLAN' then 'SINALOA'
  else estado
end
where estado is null or btrim(estado) = '';

create index if not exists idx_ciudad_estado on public.ciudad(estado);
