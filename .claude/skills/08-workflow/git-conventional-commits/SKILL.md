---
name: git-conventional-commits
description: Commits estructurados con Conventional Commits
---

# Git Conventional Commits - Beteele

## Cuando Usar
- SIEMPRE antes de hacer commit
- Al generar changelog automático
- Antes de release (semantic versioning)

## Formato
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

## Types
- `feat`: Nueva funcionalidad
- `fix`: Bug fix
- `refactor`: Cambio código sin cambiar comportamiento
- `perf`: Mejora de performance
- `test`: Agregar/modificar tests
- `docs`: Documentación
- `chore`: Mantenimiento (deps, config)

## Ejemplos Beteele
```bash
# Feature nueva
git commit -m "feat(asistencia): agregar cálculo de cuotas por bloque mensual"

# Bug fix
git commit -m "fix(matriz): corregir loop infinito en useEffect de currentMonth"

# Performance
git commit -m "perf(dashboard): optimizar query con índice en user_id + created"

# Breaking change
git commit -m "feat(api): migrar de Firebase a PocketBase

BREAKING CHANGE: Cambiar toda capa de datos de Firestore a SQLite"
```

## Comandos
```bash
# Commit interactivo
git commit

# Push con tags automáticos (semantic-release)
git push --follow-tags origin main
```
