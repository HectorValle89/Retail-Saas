---
name: sql-indexing-strategy
description: Estrategia de índices SQL para queries frecuentes
---

# SQL Indexing Strategy - PocketBase

## Queries Frecuentes en Beteele

```sql
-- 1. Asistencia por usuario y fecha (Dashboard DC)
SELECT * FROM attendance 
WHERE user_id = ? AND created >= ? AND created <= ?;

CREATE INDEX idx_attendance_user_date ON attendance(user_id, created);

-- 2. Asignaciones por DC y PDV (Planificador de rutas)
SELECT * FROM assignments_daily 
WHERE dc_id = ? AND pdv_id = ? AND date >= ?;

CREATE INDEX idx_assignments_dc_pdv_date ON assignments_daily(dc_id, pdv_id, date);

-- 3. Empleados por territorio (Panel RH)
SELECT * FROM employees 
WHERE territory = ? AND status = 'active';

CREATE INDEX idx_employees_territory_status ON employees(territory, status);
```

## Verificar Performance
```sql
EXPLAIN QUERY PLAN 
SELECT * FROM attendance WHERE user_id = 'DC01' AND created >= '2026-01-01';

-- Debe mostrar: USING INDEX idx_attendance_user_date
```
