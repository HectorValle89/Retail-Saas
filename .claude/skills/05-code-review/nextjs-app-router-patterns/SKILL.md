---
name: nextjs-app-router-patterns
description: Patrones de Next.js App Router para Beteele
---

# Next.js App Router Patterns

## Server Components (Default)
```typescript
// app/dashboard/page.tsx
import { pb } from '@/lib/pocketbase';

export default async function DashboardPage() {
  // Fetch en Server Component (no afecta bundle size)
  const assignments = await pb.collection('assignments_daily').getList(1, 10);
  
  return <AssignmentsList data={assignments} />;
}
```

## Client Components (Solo cuando necesario)
```typescript
'use client';  // Solo si usa hooks, eventos, state

import { useState } from 'react';

export function AttendanceForm() {
  const [loading, setLoading] = useState(false);
  // ...
}
```

## Loading States
```typescript
// app/dashboard/loading.tsx
export default function Loading() {
  return <AttendanceMatrixSkeleton />;
}
```

## Error Boundaries
```typescript
// app/dashboard/error.tsx
'use client';

export default function Error({ error, reset }: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div>
      <h2>Error al cargar dashboard</h2>
      <button onClick={reset}>Reintentar</button>
    </div>
  );
}
```
