-- Normaliza el estado de cuenta para soportar el flujo de primer login

alter table public.usuario
  drop constraint if exists usuario_estado_cuenta_check;

alter table public.usuario
  add constraint usuario_estado_cuenta_check
  check (
    estado_cuenta in (
      'PROVISIONAL',
      'PENDIENTE_VERIFICACION_EMAIL',
      'PENDIENTE_PRIMER_LOGIN',
      'ACTIVA',
      'SUSPENDIDA',
      'BAJA'
    )
  );
