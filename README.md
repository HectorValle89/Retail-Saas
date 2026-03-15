# Field Force Platform

Base de aplicacion Next.js 16 + Supabase orientada a la plataforma retail definida en:

- `.kiro/specs/field-force-platform/design.md`
- `.kiro/specs/field-force-platform/requirements.md`
- `.kiro/specs/field-force-platform/tasks.md`

## Estado actual

El repositorio ya fue limpiado del dominio anterior y ahora conserva una base alineada al producto retail:

- Dashboard y navegacion base por modulos del dominio
- Pantallas placeholder para `empleados`, `pdvs`, `asignaciones`, `asistencias`, `ventas`, `nomina`, `reportes` y `configuracion`
- Tipos iniciales de dominio retail en `src/types/database.ts`
- Seed SQL vaciado del dominio heredado y reservado para el esquema retail final

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Supabase

## Siguiente fase recomendada

1. Construir el esquema Supabase retail en espanol latino.
2. Implementar auth con rol derivado de `puesto` y estados de cuenta.
3. Levantar estructura maestra: `empleado`, `usuario`, `pdv`, `cuenta_cliente`.
4. Continuar con `asignaciones` y `asistencias`.
