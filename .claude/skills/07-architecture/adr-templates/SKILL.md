---
name: adr-templates
description: Architecture Decision Records para documentar decisiones técnicas
---

# ADR Templates - Beteele

## Cuando Usar
- Al tomar decisiones arquitectónicas importantes
- Cambios en stack tecnológico (ej. Firebase → PocketBase)
- Cambios en modelo de datos
- Implementar features complejas

## Template ADR

```markdown
# ADR-XXX: [Título Corto]

## Estado
[Propuesto | Aceptado | Rechazado | Obsoleto]

## Contexto
¿Qué problema estamos resolviendo? ¿Qué restricciones tenemos?

## Decisión
¿Qué decidimos hacer y por qué?

## Consecuencias
**Positivo:**
- Ventaja 1
- Ventaja 2

**Negativo:**
- Trade-off 1
- Trade-off 2

**Alternativas Consideradas:**
1. Opción A - Rechazada porque...
2. Opción B - Rechazada porque...

## Referencias
- Links a docs, PRs, issues relevantes
```

## Ejemplo: Cálculo de Cuotas

```markdown
# ADR-005: Atomicidad Diaria en Cálculo de Cuotas

## Estado
Aceptado - 2026-01-15

## Contexto
Necesitamos calcular cuotas de venta para Dermoconsejeras. 
El sistema anterior calculaba promedios mensuales, causando inconsistencias 
cuando las DCs cambiaban de PDV mid-month.

## Decisión
La unidad mínima de verdad es el DÍA. Cada registro en `assignments_daily` 
contiene la cuota diaria calculada como:

```
cuota_diaria = (cuota_mensual / dias_reales_bloque) * factor
```

No se calculan promedios mensuales en frontend.

## Consecuencias
**Positivo:**
- Datos consistentes para nómina
- Facilita asignaciones temporales
- Permite ajustes diarios sin afectar histórico

**Negativo:**
- Mayor volumen de registros (30 rows/mes/DC vs 1)
- Queries más complejas para reportes mensuales

**Alternativas:**
1. Modelo mensual con ajustes - Rechazado (inconsistencias)
2. Tabla de excepciones - Rechazado (complejidad)

## Referencias
- Issue #45: Cuotas incorrectas en asignaciones temporales
- PR #67: Implementación assignments_daily
```
