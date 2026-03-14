---
name: docker-pocketbase-setup
description: Contenedorizar PocketBase en VPS con backups automáticos
---

# Docker PocketBase Setup

## Dockerfile
```dockerfile
FROM alpine:latest

RUN apk add --no-cache \
    unzip \
    ca-certificates \
    sqlite

WORKDIR /app

RUN wget https://github.com/pocketbase/pocketbase/releases/download/v0.20.0/pocketbase_0.20.0_linux_amd64.zip \
    && unzip pocketbase_0.20.0_linux_amd64.zip \
    && rm pocketbase_0.20.0_linux_amd64.zip

EXPOSE 8090

CMD ["./pocketbase", "serve", "--http=0.0.0.0:8090"]
```

## docker-compose.yml
```yaml
version: '3.8'
services:
  pocketbase:
    build: .
    ports:
      - "8090:8090"
    volumes:
      - ./pb_data:/app/pb_data
      - ./pb_backups:/app/pb_backups
    restart: unless-stopped
    environment:
      - TZ=America/Mexico_City
```

## Backup Script
```bash
#!/bin/bash
# /app/backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
sqlite3 /app/pb_data/data.db ".backup '/app/pb_backups/backup_${DATE}.db'"
find /app/pb_backups -name "backup_*.db" -mtime +7 -delete
```

## Crontab
```bash
0 2 * * * /app/backup.sh
```
