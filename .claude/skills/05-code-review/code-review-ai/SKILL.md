---
name: code-review-ai
description: Review automatizado con detección de patrones problemáticos
---

# AI Code Review - Beteele SAAS

## Cuando Usar
- Antes de crear Pull Request
- Después de refactoring grande
- Al integrar código de múltiples desarrolladores
- Cambios en lógica de negocio crítica

## Patrones a Detectar

### 1. N+1 Queries
```typescript
// ❌ PROBLEMA DETECTADO
async function getAssignmentsWithDetails() {
  const assignments = await pb.collection('assignments_daily').getFullList();
  
  for (const assignment of assignments) {
    // ❌ N+1: Query en loop
    const pdv = await pb.collection('pdv').getOne(assignment.pdv_id);
    const dc = await pb.collection('employees').getOne(assignment.dc_id);
  }
}

// ✅ FIX PROPUESTO
async function getAssignmentsWithDetails() {
  const assignments = await pb.collection('assignments_daily').getFullList({
    expand: 'pdv_id,dc_id'  // ✅ Single query con joins
  });
}
```

### 2. Componentes sin Error Handling
```typescript
// ❌ DETECTADO: Sin try-catch
async function syncOfflineRecords() {
  const queue = await getOfflineQueue();
  await pb.collection('attendance').create(queue);  // ❌ Puede fallar
}

// ✅ FIX
async function syncOfflineRecords() {
  try {
    const queue = await getOfflineQueue();
    await pb.collection('attendance').create(queue);
    await clearQueue();
  } catch (error) {
    logError('Sync failed', error);
    // Mantener en cola para retry
  }
}
```

### 3. Re-renders Excesivos
```typescript
// ❌ DETECTADO: Dependency array problemática
useEffect(() => {
  fetchAttendanceData(filters);
}, [filters]);  // ❌ filters es objeto, cambia ref cada render

// ✅ FIX
useEffect(() => {
  fetchAttendanceData(filters);
}, [filters.startDate, filters.endDate, filters.dcId]);  // ✅ Primitivos
```

## Checklist de Review

- [ ] Queries optimizadas (expand, pagination)
- [ ] Error handling en async functions
- [ ] Tipos TypeScript estrictos (no `any`)
- [ ] Memoization de valores costosos
- [ ] Validación de inputs de usuario
- [ ] Naming conventions (camelCase, PascalCase, snake_case DB)
