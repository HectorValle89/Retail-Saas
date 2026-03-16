# Repository Instructions

## Canonical Spec

La fuente de verdad del producto en este repositorio es exclusivamente:

- `.kiro/specs/field-force-platform/design.md`
- `.kiro/specs/field-force-platform/requirements.md`
- `.kiro/specs/field-force-platform/tasks.md`

## Working Rule

Antes de planear, implementar, reconciliar backlog o cerrar una iteracion, consulta las secciones relevantes de esos tres archivos.

Si cualquier otro documento del repositorio entra en conflicto con ellos, prevalece `.kiro/specs/field-force-platform/`.

## UTF-8 Rule

Los tres documentos canonicos ya estan almacenados en UTF-8 valido. Si PowerShell o la terminal muestran mojibake al leerlos, tratalo como un problema de render de consola, no como corrupcion del archivo.

Cuando necesites inspeccionarlos o reconciliarlos, usa lectura UTF-8 segura y evita asumir corrupcion solo por la salida de `Get-Content`.

## Derived Documents

Los siguientes archivos son derivados y deben mantenerse alineados con la especificacion canonical, nunca reemplazarla:

- `task.md`
- `README.md`
- `AGENT_HISTORY.md`

## Reconciliation Rule

Cuando se complete trabajo real en codigo, migraciones, seeds o pruebas:

1. Primero reconciliar `tasks.md` contra el estado real del repo.
2. Despues actualizar los documentos derivados necesarios.
3. No marcar tareas como completas si solo existe implementacion parcial o placeholder.
