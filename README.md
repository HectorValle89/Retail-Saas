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

## Cierre canónico actual

- Avance del canon: `286 / 287` checkboxes cerrados (`99.7%`), contando todos los checkboxes de `.kiro/specs/field-force-platform/tasks.md`
- Excepción abierta: `0.1.1 Crear proyecto con create-next-app usando flags --typescript --tailwind --app`
- Naturaleza del pendiente: excepción histórica de bootstrap, no brecha funcional vigente

Informe técnico y funcional:

- `docs/informe-cierre-y-funcionamiento-app.md`

## Regla de trabajo

Antes de seguir implementando, reconciliar siempre el codigo real contra `tasks.md` y despues actualizar documentos derivados como `task.md`, `README.md` y `AGENT_HISTORY.md`.

## Regla de encoding

Los documentos, migraciones, seeds y archivos de configuracion deben conservar UTF-8 sin BOM y line endings LF.

Antes de cerrar una iteracion que toque esos archivos, ejecutar:

```bash
npm run docs:check-encoding
```

Para uso diario sobre los documentos derivados mas sensibles:

```bash
npm run docs:check-encoding -- task.md AGENT_HISTORY.md README.md
```

No usar flujos de edicion tipo `Get-Content ... | Set-Content ...` sobre archivos sensibles.

## Hook local de git

El repo incluye un `pre-commit` en `.githooks/pre-commit` para bloquear commits cuando falle la verificacion de encoding.

Instalacion en este clon:

```bash
npm run hooks:install
```

Eso configura `core.hooksPath` hacia `.githooks` en el repositorio local.

El hook valida solo archivos sensibles staged, no todo el worktree.

Ademas ejecuta una verificacion conservadora sobre `.kiro/specs/field-force-platform/tasks.md`: si el commit marca items nuevos como completos en la fuente canonica, exige que tambien exista trabajo real staged en codigo, migraciones, seeds, scripts o pruebas.

## Compactacion de contexto para agentes

Cuando una iteracion larga se acerque a saturacion de contexto, el agente debe compactar antes de perder continuidad:

- reconciliar `task.md` y `AGENT_HISTORY.md`,
- dejar estado real, validaciones, bloqueos y siguiente corte,
- no esperar a una saturacion extrema si la continuidad ya corre riesgo.

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Supabase
