---
name: performance-optimization
description: Optimización de performance para componentes y queries
---

# Performance Optimization - Beteele

## Cuando Usar
- Matriz de asistencia tarda >2s en cargar
- Dashboards lentos con muchos datos
- Sincronización offline tarda >5s
- Re-renders excesivos detectados

## Estrategias

### 1. Query Optimization (PocketBase)
```typescript
// ❌ LENTO: Sin paginación
const all = await pb.collection('attendance').getFullList();  // 10K+ registros

// ✅ RÁPIDO: Con paginación + filtros
const page = await pb.collection('attendance').getList(1, 50, {
  filter: 'created >= "2026-01-01"',
  sort: '-created',
  fields: 'id,user_id,status,created'  // Solo campos necesarios
});
```

### 2. Component Memoization
```typescript
// Matriz pesada con 500+ filas
const AttendanceMatrix = memo(function AttendanceMatrix({ data }) {
  const sortedData = useMemo(
    () => data.sort((a, b) => a.name.localeCompare(b.name)),
    [data]
  );
  
  return <Table data={sortedData} />;
});
```

### 3. Índices SQL (PocketBase)
```sql
-- Crear índice para queries frecuentes
CREATE INDEX idx_attendance_user_date 
ON attendance(user_id, created);

CREATE INDEX idx_assignments_dc_pdv 
ON assignments_daily(dc_id, pdv_id, date);
```

## Métricas Target Beteele
- Matriz 500 usuarios: < 2s
- Sync offline 50 registros: < 5s
- Dashboard supervisor: < 1s
- API P95 latencia: < 200ms
