---
name: typescript-strict-typing
description: Tipos TypeScript estrictos desde esquema PocketBase
---

# TypeScript Strict Typing

## Cuando Usar
- Al crear nuevas colecciones en PocketBase
- Modificar esquema de DB
- Crear nuevos componentes que consuman API

## Generar Tipos
```bash
# Usar pocketbase-typegen
npx pocketbase-typegen --db ./pb_data/data.db --out ./src/types/pocketbase-types.ts
```

## Ejemplo
```typescript
// Tipo generado
export interface AssignmentsDailyRecord {
  id: string;
  dc_id: string;
  pdv_id: string;
  date: string;
  quota_daily: number;
  factor: number;
  created: string;
  updated: string;
}

// Uso estricto
import { AssignmentsDailyRecord } from '@/types/pocketbase-types';

async function getAssignment(id: string): Promise<AssignmentsDailyRecord> {
  return await pb.collection('assignments_daily').getOne<AssignmentsDailyRecord>(id);
}
```
