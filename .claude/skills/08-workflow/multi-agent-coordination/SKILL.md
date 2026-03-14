---
name: multi-agent-coordination
description: Protocolo de coordinación y trazabilidad para múltiples agentes de IA
---

# SKILL: Coordinación Multi-Agente (ISO-Timestamp)

## Propósito
Garantizar que todos los agentes que intervienen en el proyecto Beteele Platform tengan una visión continua y coherente del desarrollo, evitando duplicidad de esfuerzos y conflictos arquitectónicos.

## Instrucciones para el Agente

### 1. Fase de Reconocimiento (Investigación)
- Antes de proponer cambios, el agente **DEBE** revisar los artefactos de sesiones anteriores:
  - `task.md`: Estado actual de las tareas.
  - `walkthrough.md`: Resumen de los cambios realizados.
  - `architectural_audit_alignment.md`: Fuente de verdad arquitectónica.
- Si el contexto ha sido truncado, el agente debe usar `view_file` en estos archivos para reconstruir la historia.

### 2. Fase de Documentación (Trazabilidad)
- **OBLIGATORIO**: Cada actualización de `walkthrough.md` o creación de nuevos documentos debe incluir un timestamp en la parte superior o en cada sección relevante.
- Formato sugerido: `[YYYY-MM-DD HH:mm:ss]` (Hora local o ISO).

### 3. Fase de Continuidad
- No introduzcas nuevas tecnologías o patrones sin documentarlos en un ADR o en el SSOT (`architectural_audit_alignment.md`).
- Si detectas que un agente anterior cometió un error o dejó algo incompleto, documéntalo antes de corregirlo.

## Prompt Reutilizable para Otros Agentes
> "Soy un agente colaborativo. Antes de actuar, he revisado la documentación previa del proyecto. Mis acciones están alineadas con el archivo `architectural_audit_alignment.md` y documentaré mis progresos con fecha y hora en el `walkthrough.md` para asegurar la continuidad de los agentes que me sigan."
