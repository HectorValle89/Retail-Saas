---
name: pwa-service-worker
description: Service Worker para PWA offline-first
---

# PWA Service Worker - Beteele

## Registro
```typescript
// app/layout.tsx
useEffect(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
}, []);
```

## Service Worker
```javascript
// public/sw.js
const CACHE_NAME = 'beteele-v1';
const urlsToCache = [
  '/',
  '/dashboard',
  '/asistencia',
  '/offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});
```

## Web Manifest
```json
{
  "name": "Beteele Platform",
  "short_name": "Beteele",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563eb",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    }
  ]
}
```
