-- =====================================================
-- PROJECTS/CASES TABLE - LexAgenda
-- =====================================================
-- INSTRUCCIONES:
-- 1. Ve a Supabase Dashboard > SQL Editor
-- 2. Copia y pega este script completo
-- 3. Ejecuta (Run)
-- =====================================================

-- Crear tipo ENUM para estados de proyecto
DO $$ BEGIN
    CREATE TYPE project_status AS ENUM (
        'pending',      -- Pendiente de iniciar
        'active',       -- En proceso
        'on_hold',      -- En espera
        'completed',    -- Completado
        'cancelled'     -- Cancelado
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Crear tabla de proyectos/casos
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lawyer_id UUID NOT NULL REFERENCES lawyers(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    status project_status DEFAULT 'pending',
    case_type TEXT, -- Tipo de caso (civil, penal, laboral, etc.)
    start_date DATE DEFAULT CURRENT_DATE,
    due_date DATE,
    budget DECIMAL(12, 2) DEFAULT 0,
    amount_paid DECIMAL(12, 2) DEFAULT 0,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Crear índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_projects_lawyer_id ON projects(lawyer_id);
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_due_date ON projects(due_date);

-- Habilitar RLS (Row Level Security)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Política: Admins pueden ver todos los proyectos
CREATE POLICY "Admins can view all projects" ON projects
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Política: Admins pueden insertar proyectos
CREATE POLICY "Admins can insert projects" ON projects
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Política: Admins pueden actualizar proyectos
CREATE POLICY "Admins can update projects" ON projects
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Política: Abogados pueden ver sus propios proyectos
CREATE POLICY "Lawyers can view own projects" ON projects
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM lawyers
            WHERE lawyers.id = projects.lawyer_id
            AND lawyers.user_id = auth.uid()
        )
    );

-- Política: Abogados pueden actualizar sus propios proyectos
CREATE POLICY "Lawyers can update own projects" ON projects
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM lawyers
            WHERE lawyers.id = projects.lawyer_id
            AND lawyers.user_id = auth.uid()
        )
    );

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_projects_updated_at();

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
SELECT 'Tabla projects creada:' as mensaje,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects') as existe;
