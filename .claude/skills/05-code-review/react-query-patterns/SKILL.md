---
name: react-query-patterns
description: Patrones de React Query para caching y sincronización
---

# React Query Patterns

## Setup
```typescript
// app/providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,  // 5 min
      cacheTime: 10 * 60 * 1000,  // 10 min
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

## Queries
```typescript
import { useQuery } from '@tanstack/react-query';

function useAssignments(dcId: string) {
  return useQuery({
    queryKey: ['assignments', dcId],
    queryFn: () => pb.collection('assignments_daily').getList(1, 50, {
      filter: `dc_id = "${dcId}"`
    }),
    staleTime: 5 * 60 * 1000
  });
}
```

## Mutations
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';

function useCreateAttendance() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: AttendanceData) => 
      pb.collection('attendance').create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    }
  });
}
```
