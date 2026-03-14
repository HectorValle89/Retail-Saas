---
name: c4-architecture-docs
description: Documentación C4 para arquitectura Beteele
---

# C4 Architecture Documentation

## Cuando Usar
- Al inicio de features grandes (ej. módulo RH)
- Onboarding de nuevos desarrolladores
- Cambios en arquitectura core (ej. migración Firebase → PocketBase)
- Auditorías técnicas

## Nivel 1: Context Diagram
```mermaid
C4Context
  title Context Diagram - Beteele SAAS

  Person(dc, "Dermoconsejera", "Operaria de campo")
  Person(supervisor, "Supervisor", "Gestiona territorio")
  Person(admin, "Admin RH", "Gestiona empleados")
  
  System(beteele, "Beteele Platform", "SAAS para asistencia y objetivos")
  
  System_Ext(cloudflare, "Cloudflare Pages", "Hosting PWA")
  System_Ext(vps, "VPS Hetzner", "PocketBase Backend")
  
  Rel(dc, beteele, "Registra asistencia")
  Rel(supervisor, beteele, "Revisa cumplimiento")
  Rel(admin, beteele, "Gestiona nómina")
  
  Rel(beteele, cloudflare, "Deploy frontend")
  Rel(beteele, vps, "Almacena datos")
```

## Nivel 2: Container Diagram
```mermaid
C4Container
  title Container Diagram - Beteele

  Container(pwa, "PWA", "Next.js 15 + TypeScript", "Interfaz Mobile-First")
  Container(api, "API", "PocketBase", "Backend SQL + Auth")
  ContainerDb(db, "Database", "SQLite WAL", "Datos relacionales")
  Container(indexeddb, "IndexedDB", "Browser", "Cola offline")
  
  Rel(pwa, api, "REST API + Realtime")
  Rel(pwa, indexeddb, "Guarda offline")
  Rel(api, db, "Queries SQL")
```

## Nivel 3: Component Diagram (Módulo Asistencia)
```mermaid
C4Component
  title Components - Módulo Asistencia

  Component(camera, "CameraCapture", "React Component", "Foto con timestamp")
  Component(form, "AttendanceForm", "React Component", "Form registro")
  Component(sync, "SyncQueue", "Service", "Cola offline → PocketBase")
  Component(calc, "QuotaCalculator", "Lib", "Cálculo de cuotas")
  
  ComponentDb(pb_attendance, "attendance", "PocketBase Collection")
  ComponentDb(pb_assignments, "assignments_daily", "PocketBase Collection")
  
  Rel(camera, form, "Attach photo")
  Rel(form, sync, "Submit offline")
  Rel(sync, pb_attendance, "Sync when online")
  Rel(calc, pb_assignments, "Read quota rules")
```
