-- Migración: Soporte para registros "Hoy no tuve ventas" (SIN_VENTAS) y "Hoy no hice registros" (SIN_REGISTROS)
-- Ajusta el trigger de consolidación automática para omitir la creación de filas en public.venta si es un reporte sin ventas.

create or replace function public.fn_captura_publica_consolidacion_automatica()
returns trigger as $$
declare
  v_asistencia_id uuid;
  v_empleado_nombre text;
  v_supervisor_id uuid;
  v_pdv_nombre text;
  v_pdv_clave_btl text;
  v_pdv_zona text;
  v_cadena_nombre text;
  v_asignacion_id uuid;
  v_producto_sku text;
  v_producto_nombre text;
begin
  -- Solo consolidar si el registro viene como RECIBIDO
  if new.estatus = 'RECIBIDO' then
    -- Asegurar que el id de la captura esté generado para usarlo en la metadata de consolidación
    if new.id is null then
      new.id := gen_random_uuid();
    end if;

    -- Buscar o crear la asistencia para los tipos que requieren validación de jornada (VENTA y LOVE_ISDIN)
    if new.tipo_registro in ('VENTA', 'LOVE_ISDIN') then
      -- 1. Intentar encontrar una asistencia existente para el día
      select id into v_asistencia_id
      from public.asistencia
      where empleado_id = new.empleado_id
        and pdv_id = new.pdv_id
        and fecha_operacion = new.fecha_operativa;

      -- 2. Si no existe, crear una asistencia validada por defecto
      if v_asistencia_id is null then
        -- Resolver nombres y datos estructurales
        select nombre_completo, supervisor_empleado_id
        into v_empleado_nombre, v_supervisor_id
        from public.empleado
        where id = new.empleado_id;

        select p.nombre, p.clave_btl, p.zona, c.nombre
        into v_pdv_nombre, v_pdv_clave_btl, v_pdv_zona, v_cadena_nombre
        from public.pdv p
        left join public.cadena c on c.id = p.cadena_id
        where p.id = new.pdv_id;

        select id
        into v_asignacion_id
        from public.asignacion
        where empleado_id = new.empleado_id
          and pdv_id = new.pdv_id
          and fecha_inicio <= new.fecha_operativa
          and (fecha_fin is null or fecha_fin >= new.fecha_operativa)
        order by fecha_inicio desc
        limit 1;

        -- Insertar asistencia
        insert into public.asistencia (
          cuenta_cliente_id,
          asignacion_id,
          empleado_id,
          supervisor_empleado_id,
          pdv_id,
          fecha_operacion,
          empleado_nombre,
          pdv_clave_btl,
          pdv_nombre,
          pdv_zona,
          cadena_nombre,
          check_in_utc,
          check_out_utc,
          estatus,
          origen,
          estado_gps,
          biometria_estado,
          metadata
        ) values (
          new.cuenta_cliente_id,
          v_asignacion_id,
          new.empleado_id,
          v_supervisor_id,
          new.pdv_id,
          new.fecha_operativa,
          coalesce(v_empleado_nombre, coalesce(new.empleado_nombre_snapshot, 'Dermoconsejera')),
          coalesce(v_pdv_clave_btl, '—'),
          coalesce(v_pdv_nombre, coalesce(new.pdv_nombre_snapshot, 'Punto de Venta')),
          v_pdv_zona,
          v_cadena_nombre,
          (new.fecha_operativa || ' 08:00:00 America/Mexico_City')::timestamptz,
          (new.fecha_operativa || ' 17:00:00 America/Mexico_City')::timestamptz,
          'VALIDA',
          'ONLINE',
          'DENTRO_GEOCERCA',
          'NO_EVALUADA',
          jsonb_build_object('creado_por_consolidacion_automatica', true, 'captura_registro_id', new.id)
        ) returning id into v_asistencia_id;
      else
        -- Si ya existe la asistencia, nos aseguramos que esté validada y tenga check_in para pasar el trigger de venta
        update public.asistencia
        set estatus = 'VALIDA',
            check_in_utc = coalesce(check_in_utc, (new.fecha_operativa || ' 08:00:00 America/Mexico_City')::timestamptz),
            check_out_utc = coalesce(check_out_utc, (new.fecha_operativa || ' 17:00:00 America/Mexico_City')::timestamptz)
        where id = v_asistencia_id
          and (estatus = 'RECHAZADA' or check_in_utc is null);
      end if;
    end if;

    -- Procesar consolidación según tipo
    if new.tipo_registro = 'VENTA' then
      -- Solo insertar en la tabla de ventas física si NO es un reporte de "Sin Ventas"
      if coalesce(new.subtipo_registro, '') != 'SIN_VENTAS' then
        -- Resolver producto
        select sku, nombre
        into v_producto_sku, v_producto_nombre
        from public.producto
        where id = new.producto_id;

        insert into public.venta (
          cuenta_cliente_id,
          asistencia_id,
          empleado_id,
          pdv_id,
          producto_id,
          producto_sku,
          producto_nombre,
          fecha_utc,
          total_unidades,
          total_monto,
          confirmada,
          origen,
          observaciones,
          metadata
        ) values (
          new.cuenta_cliente_id,
          v_asistencia_id,
          new.empleado_id,
          new.pdv_id,
          new.producto_id,
          coalesce(v_producto_sku, ''),
          coalesce(v_producto_nombre, coalesce(new.producto_nombre_snapshot, 'Producto')),
          coalesce(new.created_at, now()),
          new.cantidad,
          coalesce(new.monto, 0),
          true,
          'ONLINE',
          new.observaciones,
          jsonb_build_object('captura_publica_id', new.id)
        );
      end if;

      -- Cambiar estatus de la captura
      new.estatus := 'CONSOLIDADO';

    elsif new.tipo_registro = 'LOVE_ISDIN' then
      -- Consolidar LOVE_ISDIN (solo si es exitoso creamos las afiliaciones)
      if new.subtipo_registro = 'LOVE_EXITOSO' then
        for i in 1..coalesce(new.cantidad, 1) loop
          insert into public.love_isdin (
            cuenta_cliente_id,
            asistencia_id,
            empleado_id,
            pdv_id,
            afiliado_nombre,
            ticket_folio,
            fecha_utc,
            estatus,
            evidencia_url,
            evidencia_hash,
            origen,
            metadata
          ) values (
            new.cuenta_cliente_id,
            v_asistencia_id,
            new.empleado_id,
            new.pdv_id,
            coalesce(new.observaciones, 'Afiliado Love ISDIN'),
            new.folio_ticket,
            coalesce(new.created_at, now()),
            'VALIDA',
            new.foto_evidencia_url,
            new.foto_evidencia_hash,
            'ONLINE',
            jsonb_build_object('captura_publica_id', new.id, 'loop_index', i)
          );
        end loop;
      end if;

      -- Cambiar estatus de la captura
      new.estatus := 'CONSOLIDADO';

    elsif new.tipo_registro in ('CANJE', 'DESABASTO') then
      new.estatus := 'CONSOLIDADO';
    end if;

  end if;

  return new;
end;
$$ language plpgsql security definer;
