---
name: error-logging-sentry
description: Error tracking con Sentry para Beteele
---

# Error Logging - Sentry

## Setup
```bash
npm install @sentry/nextjs
npx @sentry/wizard -i nextjs
```

## Configuración
```typescript
// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
  
  beforeSend(event) {
    // No enviar datos sensibles
    delete event.request?.headers?.['authorization'];
    return event;
  }
});
```

## Uso
```typescript
try {
  await syncOfflineQueue();
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      component: 'offline-sync',
      user_role: currentUser.role
    }
  });
}
```
