create unique index if not exists usuario_correo_verificado_unique
on public.usuario (lower(correo_electronico))
where correo_electronico is not null and correo_verificado = true;
