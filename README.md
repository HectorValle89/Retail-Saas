# Field Force Platform

Repositorio operativo de la plataforma retail implementada sobre Next.js 16 + Supabase.

## Fuente de verdad

La especificacion canonica del producto vive en:

- `.kiro/specs/field-force-platform/design.md`
- `.kiro/specs/field-force-platform/requirements.md`
- `.kiro/specs/field-force-platform/tasks.md`

Cualquier backlog, bitacora o resumen fuera de esa carpeta es derivado y debe reconciliarse contra esos tres archivos.

## Estado actual

El repositorio ya contiene una base funcional del producto con:

- Auth operativo con estados de cuenta, claims JWT e invalidacion de contexto auth
- Estructura maestra para clientes, empleados, PDVs, configuracion y reglas
- Planeacion operativa con asignaciones y publicacion controlada
- Ejecucion diaria con asistencias, ventas y cola offline PWA
- Control y gobierno con nomina, cuotas, reportes, ranking y dashboard KPI
- Migraciones Supabase alineadas hasta `20260314223000_dashboard_kpis.sql`

## Regla de trabajo

Antes de seguir implementando, reconciliar siempre el codigo real contra `tasks.md` y despues actualizar documentos derivados como `task.md`, `README.md` y `AGENT_HISTORY.md`.

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Supabase