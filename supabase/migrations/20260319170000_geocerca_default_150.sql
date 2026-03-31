update public.configuracion
set valor = '150'::jsonb,
    updated_at = now()
where clave = 'geocerca.radio_default_metros'
  and (valor is null or valor::text <> '150');
