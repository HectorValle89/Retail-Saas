# 📜 AGENT_HISTORY.md - Registro Maestro de la Fábrica

Este archivo es el registro obligatorio de todas las intervenciones realizadas por agentes de IA en el proyecto Retail.

---

## [2026-03-14 09:41:52] - Regla de Oro para Tablas en Español Latino (Codex)
- **Contexto**: El usuario solicitó convertir en política irrompible que toda tabla creada por agentes use español latino.
- **Acción**:
    - Añadida la regla de oro en `CLAUDE.md`.
    - Añadida la regla de oro en `GEMINI.md`.
    - Alineada la política para tablas, columnas de negocio y excepciones documentadas.
- **Estado**: Norma central activa para futuras migraciones, esquemas y creación de tablas.

## [2026-03-14 09:41:52] - Checklist y Plantilla SQL para Tablas en Español Latino (Codex)
- **Contexto**: Se requirió volver operativa la regla de oro para que ningún agente la omita al crear tablas.
- **Acción**:
    - Creada la guía `supabase/NORMA_TABLAS_ESPANOL_LATINO.md`.
    - Creada la plantilla `supabase/PLANTILLA_TABLA_ESPANOL_LATINO.sql`.
    - Enlazadas ambas piezas desde `CLAUDE.md` y `GEMINI.md`.
- **Estado**: Regla reforzada con checklist y base reutilizable para futuras migraciones.

## [2026-03-14 08:58] - Inicialización y Alineación V3 (Antigravity)
- **Contexto**: El usuario solicitó revisar e implementar las reglas y skills del repositorio.
- **Acción**: 
    - Realizada exploración inicial del repositorio.
    - Identificada la ausencia de archivos de protocolo obligatorios (`AGENT_HISTORY.md`, `architectural_audit_alignment.md`, `task.md`).
    - Validado el stack: Next.js 16, React 19, Supabase, Zustand, Tailwind CSS 3.4 (Alineado con el Golden Path).
- **Cambios**:
    - Creación de `AGENT_HISTORY.md`.
    - Creación de `architectural_audit_alignment.md`.
    - Creación de `task.md` (Raíz) para seguimiento de tareas del proyecto.
- **Estado**: Fábrica alineada con protocolos V3.

## [2026-03-14 15:15] - Saneamiento Crítico de Mojibake (Antigravity)
- **Contexto**: El usuario reportó corrupción de caracteres (mojibake) en archivos de documentación y reglas.
- **Acción**: 
    - Saneamiento manual de todos los archivos de la raíz (`GEMINI.md`, `README.md`, `CLAUDE.md`, `AGENT_HISTORY.md` y `architectural_audit_alignment.md`) a UTF-8 puro.
    - Eliminación de patrones de corrupción como `Ã±` y `Ã¡`.
    - **Nota**: Se descartaron archivos externos (`ANALISIS_LEXAGENDA.md` y `BUSINESS_LOGIC.md`) por no pertenecer a este proyecto.
- **Estado**: Documentación legítima de Retail reparada y estandarizada a UTF-8 sin BOM.

## [2026-03-14 12:45] - Conexión de Supabase (Antigravity)
- **Contexto**: El usuario creó un nuevo proyecto en Supabase para el entorno Retail.
- **Acción**: 
    - Configuración del archivo `.env.local` con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
    - Registro del password de la base de datos para futuras migraciones.
- **Estado**: Aplicación conectada al backend de Supabase.

### 💡 Lecciones Aprendidas (Auto-Blindaje)
- **Error**: Se introdujo mojibake al guardar archivos con codificación inconsistente (ANSI/UTF-16 en un entorno UTF-8).
- **Causa Raíz**: Uso de herramientas de edición de archivos que no forzaban UTF-8 sin BOM de forma predeterminada.
- **Fix**: Configuración estricta de las herramientas de edición para usar únicamente UTF-8. Implementación de una validación visual obligatoria de caracteres especiales antes de cada commit.
- **Prevención**: La regla de UTF-8 ahora es una directriz crítica en `GEMINI.md` que debe ser consultada por todo agente antes de su primera intervención.
