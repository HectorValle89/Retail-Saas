---
name: brainstorming-features
description: Brainstorming estructurado antes de implementar features
---

# Brainstorming Features - Beteele

## Cuando Usar
- ANTES de modificar esquema de colecciones PocketBase
- ANTES de implementar features complejas
- Cuando requerimientos sean vagos

## Proceso

### 1. Definir Problema
```markdown
## Problema
Usuarios: Administradores necesitan asignar una DC a un PDV temporalmente por 3 días

Dolor actual: Sistema solo permite asignaciones mensuales, crear asignación mensual 
para 3 días sobrescribe el resto del mes
```

### 2. Requisitos
```markdown
## Requisitos Funcionales
- [ ] Permitir asignación con fecha inicio y fin
- [ ] Calcular cuota diaria solo para días del rango
- [ ] No afectar asignaciones existentes fuera del rango
- [ ] Validar que no haya overlap con otras asignaciones

## Requisitos No Funcionales
- [ ] Respetar atomicidad diaria
- [ ] Mantener integridad relacional SQL
- [ ] No romper reportes de nómina
```

### 3. Opciones de Diseño
```markdown
## Opción A: Campo temporal en assignments_daily
Pros: Mínimo cambio en esquema
Contras: Lógica compleja de cleanup

## Opción B: Tabla separada temp_assignments
Pros: Separación de concerns
Contras: Más joins en queries

## Opción C: Flag "assignment_type" enum(regular, temporary)
Pros: Flexible, extensible
Contras: Requiere migración de datos existentes

## Decisión: Opción C
```

### 4. Impacto
```markdown
## Impacto en Esquema
- Agregar campo `assignment_type` a assignments_daily
- Migrar registros existentes a type='regular'
- Actualizar API Rules

## Impacto en Lógica
- Modificar `calcularMetaDiaria()` para considerar type
- Actualizar queries en dashboard supervisor
```

### 5. ADR
Crear ADR-XXX con decisión final
```
