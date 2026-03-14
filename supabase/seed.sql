-- =====================================================
-- SEED DATA - LexAgenda
-- =====================================================
-- INSTRUCCIONES:
-- 1. Ve a Supabase Dashboard > SQL Editor
-- 2. Copia y pega este script completo
-- 3. Ejecuta (Run)
-- =====================================================

-- Primero, crear usuarios de prueba en auth.users
-- (Supabase requiere que los profiles tengan un user_id válido)

INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'juan.perez@lexagenda.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'ana.martinez@lexagenda.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'carlos.gomez@lexagenda.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated'),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'laura.sanchez@lexagenda.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

-- Insertar identidades (requerido por Supabase auth)
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '{"sub":"11111111-1111-1111-1111-111111111111","email":"juan.perez@lexagenda.com"}', 'email', '11111111-1111-1111-1111-111111111111', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '{"sub":"22222222-2222-2222-2222-222222222222","email":"ana.martinez@lexagenda.com"}', 'email', '22222222-2222-2222-2222-222222222222', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', '{"sub":"33333333-3333-3333-3333-333333333333","email":"carlos.gomez@lexagenda.com"}', 'email', '33333333-3333-3333-3333-333333333333', now(), now()),
  ('44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', '{"sub":"44444444-4444-4444-4444-444444444444","email":"laura.sanchez@lexagenda.com"}', 'email', '44444444-4444-4444-4444-444444444444', now(), now())
ON CONFLICT (id) DO NOTHING;

-- Los profiles se crean automáticamente por el trigger, pero actualizamos los datos
UPDATE profiles SET full_name = 'Dr. Juan Pérez', role = 'lawyer' WHERE id = '11111111-1111-1111-1111-111111111111';
UPDATE profiles SET full_name = 'Dra. Ana Martínez', role = 'lawyer' WHERE id = '22222222-2222-2222-2222-222222222222';
UPDATE profiles SET full_name = 'Dr. Carlos Gómez', role = 'lawyer' WHERE id = '33333333-3333-3333-3333-333333333333';
UPDATE profiles SET full_name = 'Dra. Laura Sánchez', role = 'lawyer' WHERE id = '44444444-4444-4444-4444-444444444444';

-- Insertar datos de abogados
INSERT INTO lawyers (id, user_id, specialty, bio, experience_years, hourly_rate, rating, is_active) VALUES
  ('aaaa1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'Derecho Civil',
   'Especialista en derecho civil con amplia experiencia en contratos, sucesiones y litigios civiles. Graduado con honores de la Universidad Nacional.',
   15, 150.00, 4.9, true),

  ('aaaa2222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   'Derecho Laboral',
   'Experta en derecho laboral y seguridad social. Representación de trabajadores y empresas en conflictos laborales.',
   12, 120.00, 4.8, true),

  ('aaaa3333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333',
   'Derecho Penal',
   'Abogado penalista con más de 10 años de experiencia en defensa penal. Casos de delitos económicos y violencia familiar.',
   10, 180.00, 4.7, true),

  ('aaaa4444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444',
   'Derecho Familiar',
   'Especialista en divorcios, custodia de menores y pensiones alimenticias. Enfoque en mediación y resolución pacífica de conflictos.',
   8, 100.00, 4.9, true)
ON CONFLICT (id) DO NOTHING;

-- Insertar disponibilidad para cada abogado (Lunes a Viernes)
-- Abogado 1: Dr. Juan Pérez (Lunes-Viernes 9-18)
INSERT INTO availability (lawyer_id, day_of_week, start_time, end_time, is_available) VALUES
  ('aaaa1111-1111-1111-1111-111111111111', 1, '09:00:00', '18:00:00', true),
  ('aaaa1111-1111-1111-1111-111111111111', 2, '09:00:00', '18:00:00', true),
  ('aaaa1111-1111-1111-1111-111111111111', 3, '09:00:00', '18:00:00', true),
  ('aaaa1111-1111-1111-1111-111111111111', 4, '09:00:00', '18:00:00', true),
  ('aaaa1111-1111-1111-1111-111111111111', 5, '09:00:00', '18:00:00', true)
ON CONFLICT DO NOTHING;

-- Abogado 2: Dra. Ana Martínez (Lunes-Viernes 8-16)
INSERT INTO availability (lawyer_id, day_of_week, start_time, end_time, is_available) VALUES
  ('aaaa2222-2222-2222-2222-222222222222', 1, '08:00:00', '16:00:00', true),
  ('aaaa2222-2222-2222-2222-222222222222', 2, '08:00:00', '16:00:00', true),
  ('aaaa2222-2222-2222-2222-222222222222', 3, '08:00:00', '16:00:00', true),
  ('aaaa2222-2222-2222-2222-222222222222', 4, '08:00:00', '16:00:00', true),
  ('aaaa2222-2222-2222-2222-222222222222', 5, '08:00:00', '16:00:00', true)
ON CONFLICT DO NOTHING;

-- Abogado 3: Dr. Carlos Gómez (Lunes-Jueves 10-19, Sábado 9-14)
INSERT INTO availability (lawyer_id, day_of_week, start_time, end_time, is_available) VALUES
  ('aaaa3333-3333-3333-3333-333333333333', 1, '10:00:00', '19:00:00', true),
  ('aaaa3333-3333-3333-3333-333333333333', 2, '10:00:00', '19:00:00', true),
  ('aaaa3333-3333-3333-3333-333333333333', 3, '10:00:00', '19:00:00', true),
  ('aaaa3333-3333-3333-3333-333333333333', 4, '10:00:00', '19:00:00', true),
  ('aaaa3333-3333-3333-3333-333333333333', 6, '09:00:00', '14:00:00', true)
ON CONFLICT DO NOTHING;

-- Abogado 4: Dra. Laura Sánchez (Lunes-Viernes 9-17)
INSERT INTO availability (lawyer_id, day_of_week, start_time, end_time, is_available) VALUES
  ('aaaa4444-4444-4444-4444-444444444444', 1, '09:00:00', '17:00:00', true),
  ('aaaa4444-4444-4444-4444-444444444444', 2, '09:00:00', '17:00:00', true),
  ('aaaa4444-4444-4444-4444-444444444444', 3, '09:00:00', '17:00:00', true),
  ('aaaa4444-4444-4444-4444-444444444444', 4, '09:00:00', '17:00:00', true),
  ('aaaa4444-4444-4444-4444-444444444444', 5, '09:00:00', '17:00:00', true)
ON CONFLICT DO NOTHING;

-- Verificar datos insertados
SELECT 'auth.users:' as tabla, count(*) as total FROM auth.users WHERE id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
SELECT 'profiles (lawyers):' as tabla, count(*) as total FROM profiles WHERE role = 'lawyer';
SELECT 'lawyers:' as tabla, count(*) as total FROM lawyers;
SELECT 'availability:' as tabla, count(*) as total FROM availability;
SELECT 'appointment_types:' as tabla, count(*) as total FROM appointment_types;

-- =====================================================
-- CREDENCIALES DE PRUEBA:
-- Email: juan.perez@lexagenda.com | Password: password123
-- Email: ana.martinez@lexagenda.com | Password: password123
-- Email: carlos.gomez@lexagenda.com | Password: password123
-- Email: laura.sanchez@lexagenda.com | Password: password123
-- =====================================================
