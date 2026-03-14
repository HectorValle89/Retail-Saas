-- =====================================================
-- NOTIFICATIONS TABLE - LexAgenda
-- =====================================================
-- INSTRUCCIONES:
-- 1. Ve a Supabase Dashboard > SQL Editor
-- 2. Copia y pega este script completo
-- 3. Ejecuta (Run)
-- =====================================================

-- Crear tipo ENUM para tipos de notificación
DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM (
        'appointment_created',
        'appointment_confirmed',
        'appointment_cancelled',
        'appointment_reminder',
        'payment_received',
        'case_update',
        'document_request'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Crear tabla de notificaciones
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Crear índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(user_id, created_at DESC);

-- Habilitar RLS (Row Level Security)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios solo pueden ver sus propias notificaciones
CREATE POLICY "Users can view own notifications" ON notifications
    FOR SELECT
    USING (auth.uid() = user_id);

-- Política: Los usuarios pueden marcar como leídas sus propias notificaciones
CREATE POLICY "Users can update own notifications" ON notifications
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Política: El sistema (service_role) puede insertar notificaciones para cualquier usuario
CREATE POLICY "System can insert notifications" ON notifications
    FOR INSERT
    WITH CHECK (true);

-- Política: Los usuarios pueden eliminar sus propias notificaciones
CREATE POLICY "Users can delete own notifications" ON notifications
    FOR DELETE
    USING (auth.uid() = user_id);

-- Habilitar realtime para la tabla de notificaciones
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Función para crear notificación de cita creada
CREATE OR REPLACE FUNCTION notify_appointment_created()
RETURNS TRIGGER AS $$
DECLARE
    client_user_id UUID;
    lawyer_user_id UUID;
    client_name TEXT;
    lawyer_name TEXT;
    apt_date TEXT;
BEGIN
    -- Obtener user_ids y nombres
    SELECT c.user_id, p.full_name INTO client_user_id, client_name
    FROM clients c
    JOIN profiles p ON p.id = c.user_id
    WHERE c.id = NEW.client_id;

    SELECT l.user_id, p.full_name INTO lawyer_user_id, lawyer_name
    FROM lawyers l
    JOIN profiles p ON p.id = l.user_id
    WHERE l.id = NEW.lawyer_id;

    -- Formatear fecha
    apt_date := to_char(NEW.scheduled_at AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI');

    -- Notificar al abogado
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
        lawyer_user_id,
        'appointment_created',
        'Nueva cita agendada',
        'El cliente ' || COALESCE(client_name, 'Sin nombre') || ' ha agendado una cita para el ' || apt_date,
        jsonb_build_object('appointment_id', NEW.id, 'client_name', client_name, 'scheduled_at', NEW.scheduled_at)
    );

    -- Notificar al cliente
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
        client_user_id,
        'appointment_created',
        'Cita confirmada',
        'Tu cita con ' || COALESCE(lawyer_name, 'el abogado') || ' ha sido agendada para el ' || apt_date,
        jsonb_build_object('appointment_id', NEW.id, 'lawyer_name', lawyer_name, 'scheduled_at', NEW.scheduled_at)
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para notificar cambios de estado
CREATE OR REPLACE FUNCTION notify_appointment_status_change()
RETURNS TRIGGER AS $$
DECLARE
    client_user_id UUID;
    lawyer_user_id UUID;
    client_name TEXT;
    lawyer_name TEXT;
    apt_date TEXT;
    notif_title TEXT;
    notif_message_client TEXT;
    notif_message_lawyer TEXT;
    notif_type notification_type;
BEGIN
    -- Solo actuar si el estado cambió
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Obtener user_ids y nombres
    SELECT c.user_id, p.full_name INTO client_user_id, client_name
    FROM clients c
    JOIN profiles p ON p.id = c.user_id
    WHERE c.id = NEW.client_id;

    SELECT l.user_id, p.full_name INTO lawyer_user_id, lawyer_name
    FROM lawyers l
    JOIN profiles p ON p.id = l.user_id
    WHERE l.id = NEW.lawyer_id;

    -- Formatear fecha
    apt_date := to_char(NEW.scheduled_at AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI');

    -- Determinar tipo de notificación y mensajes
    CASE NEW.status
        WHEN 'confirmed' THEN
            notif_type := 'appointment_confirmed';
            notif_title := 'Cita confirmada';
            notif_message_client := 'Tu cita con ' || COALESCE(lawyer_name, 'el abogado') || ' del ' || apt_date || ' ha sido confirmada';
            notif_message_lawyer := 'Has confirmado la cita con ' || COALESCE(client_name, 'el cliente') || ' del ' || apt_date;
        WHEN 'cancelled' THEN
            notif_type := 'appointment_cancelled';
            notif_title := 'Cita cancelada';
            notif_message_client := 'Tu cita con ' || COALESCE(lawyer_name, 'el abogado') || ' del ' || apt_date || ' ha sido cancelada';
            notif_message_lawyer := 'La cita con ' || COALESCE(client_name, 'el cliente') || ' del ' || apt_date || ' ha sido cancelada';
        WHEN 'completed' THEN
            notif_type := 'appointment_confirmed';
            notif_title := 'Cita completada';
            notif_message_client := 'Tu cita con ' || COALESCE(lawyer_name, 'el abogado') || ' ha sido marcada como completada';
            notif_message_lawyer := 'Has completado la cita con ' || COALESCE(client_name, 'el cliente');
        ELSE
            RETURN NEW;
    END CASE;

    -- Notificar al cliente
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
        client_user_id,
        notif_type,
        notif_title,
        notif_message_client,
        jsonb_build_object('appointment_id', NEW.id, 'status', NEW.status, 'scheduled_at', NEW.scheduled_at)
    );

    -- Notificar al abogado
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
        lawyer_user_id,
        notif_type,
        notif_title,
        notif_message_lawyer,
        jsonb_build_object('appointment_id', NEW.id, 'status', NEW.status, 'scheduled_at', NEW.scheduled_at)
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear triggers
DROP TRIGGER IF EXISTS on_appointment_created ON appointments;
CREATE TRIGGER on_appointment_created
    AFTER INSERT ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION notify_appointment_created();

DROP TRIGGER IF EXISTS on_appointment_status_change ON appointments;
CREATE TRIGGER on_appointment_status_change
    AFTER UPDATE ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION notify_appointment_status_change();

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
SELECT 'Tabla notifications creada:' as mensaje,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') as existe;

SELECT 'Triggers creados:' as mensaje, count(*) as total
FROM information_schema.triggers
WHERE trigger_name IN ('on_appointment_created', 'on_appointment_status_change');
