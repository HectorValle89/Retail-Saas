-- Fix notification triggers for guest clients
-- Run this in Supabase SQL Editor

-- 1. Update notify_appointment_created function to handle guest clients
CREATE OR REPLACE FUNCTION notify_appointment_created()
RETURNS TRIGGER AS $$
DECLARE
    client_user_id UUID;
    lawyer_user_id UUID;
    client_name TEXT;
    lawyer_name TEXT;
    apt_date TEXT;
BEGIN
    -- Get client info (may be NULL for guest clients)
    SELECT c.user_id, COALESCE(c.full_name, p.full_name) INTO client_user_id, client_name
    FROM clients c
    LEFT JOIN profiles p ON p.id = c.user_id
    WHERE c.id = NEW.client_id;

    -- Get lawyer info
    SELECT l.user_id, p.full_name INTO lawyer_user_id, lawyer_name
    FROM lawyers l
    JOIN profiles p ON p.id = l.user_id
    WHERE l.id = NEW.lawyer_id;

    -- Format date
    apt_date := to_char(NEW.scheduled_at AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI');

    -- Notification for lawyer (always)
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
        lawyer_user_id,
        'appointment_created',
        'Nueva cita agendada',
        'El cliente ' || COALESCE(client_name, 'Sin nombre') || ' ha agendado una cita para el ' || apt_date,
        jsonb_build_object('appointment_id', NEW.id, 'client_name', client_name, 'scheduled_at', NEW.scheduled_at)
    );

    -- Notification for client (only if has user account)
    IF client_user_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, type, title, message, data)
        VALUES (
            client_user_id,
            'appointment_created',
            'Cita confirmada',
            'Tu cita con ' || COALESCE(lawyer_name, 'el abogado') || ' ha sido agendada para el ' || apt_date,
            jsonb_build_object('appointment_id', NEW.id, 'lawyer_name', lawyer_name, 'scheduled_at', NEW.scheduled_at)
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update notify_appointment_status_change function to handle guest clients
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
    -- Only act if status changed
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Get client info (may be NULL for guest clients)
    SELECT c.user_id, COALESCE(c.full_name, p.full_name) INTO client_user_id, client_name
    FROM clients c
    LEFT JOIN profiles p ON p.id = c.user_id
    WHERE c.id = NEW.client_id;

    -- Get lawyer info
    SELECT l.user_id, p.full_name INTO lawyer_user_id, lawyer_name
    FROM lawyers l
    JOIN profiles p ON p.id = l.user_id
    WHERE l.id = NEW.lawyer_id;

    -- Format date
    apt_date := to_char(NEW.scheduled_at AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI');

    -- Determine notification type and messages
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

    -- Notification for lawyer (always)
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
        lawyer_user_id,
        notif_type,
        notif_title,
        notif_message_lawyer,
        jsonb_build_object('appointment_id', NEW.id, 'status', NEW.status, 'scheduled_at', NEW.scheduled_at)
    );

    -- Notification for client (only if has user account)
    IF client_user_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, type, title, message, data)
        VALUES (
            client_user_id,
            notif_type,
            notif_title,
            notif_message_client,
            jsonb_build_object('appointment_id', NEW.id, 'status', NEW.status, 'scheduled_at', NEW.scheduled_at)
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Recreate triggers
CREATE TRIGGER on_appointment_created
    AFTER INSERT ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION notify_appointment_created();

CREATE TRIGGER on_appointment_status_change
    AFTER UPDATE ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION notify_appointment_status_change();
