---
name: offline-sync-patterns
description: Patrones de sincronización offline con IndexedDB
---

# Offline Sync Patterns - Beteele PWA

## Cuando Usar
- Al implementar cualquier feature que modifique datos
- Cambios en cola de sincronización
- Debugging de conflictos offline
- Optimizar tiempo de sync

## Arquitectura

```typescript
// 1. Guardar en IndexedDB primero
async function saveAttendanceOffline(record: AttendanceRecord) {
  await db.offline_queue.add({
    collection: 'attendance',
    action: 'create',
    data: record,
    timestamp: Date.now(),
    synced: false
  });
  
  // Intentar sync inmediato si hay conexión
  if (navigator.onLine) {
    await syncQueue();
  }
}

// 2. Sincronizar FIFO al recuperar conexión
async function syncQueue() {
  const pending = await db.offline_queue
    .where('synced').equals(false)
    .sortBy('timestamp');
  
  for (const item of pending) {
    try {
      await pb.collection(item.collection).create(item.data);
      
      // Marcar como sincronizado
      await db.offline_queue.update(item.id, { synced: true });
    } catch (error) {
      // Log error pero continuar con siguiente
      console.error('Sync failed for', item.id, error);
    }
  }
  
  // Limpiar registros sincronizados
  await db.offline_queue.where('synced').equals(true).delete();
}

// 3. Listener de conexión
window.addEventListener('online', syncQueue);
```

## Manejo de Conflictos
```typescript
// Si registro fue modificado online mientras estaba offline
async function handleConflict(local: Record, remote: Record) {
  // Estrategia: Last Write Wins
  if (local.updated_at > remote.updated_at) {
    return await pb.collection('attendance').update(remote.id, local);
  } else {
    // Descartar cambio local
    await db.offline_queue.delete(local.queue_id);
  }
}
```
