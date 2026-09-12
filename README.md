# Orquestador de Automatizaciones (MVP)

Proyecto personal de investigación: un mini-orquestador de RPA en **Python +
React** para dejar de correr scripts sueltos y empezar a gobernar procesos:
colas transaccionales por ítem, ejecución concurrente en workers, bóveda de
credenciales, schedules cron y un dashboard con métricas por bot.

> Este repo es un **MVP / prueba de concepto personal**, no un producto
> terminado. Incluye un solo bot de demostración (contra
> [rpachallenge.com](https://www.rpachallenge.com/), un sitio público pensado
> justamente para practicar RPA) para mostrar el flujo completo sin exponer
> ningún dato ni proceso real.

## Por qué

La mayoría del RPA "casero" (scripts + cron) se rompe por lo mismo: no hay
colas con reintentos, no hay visibilidad de qué pasó con cada ítem, y las
credenciales terminan hardcodeadas. Esta idea ataca esos tres puntos con
piezas simples y conocidas (FastAPI, Celery, Postgres, Redis) en vez de
depender de una plataforma comercial.

## Arranque rápido (Docker)

```bash
cp .env.example .env
docker compose up --build
# API:     http://localhost:8000       (docs: http://localhost:8000/docs)
# Postgres: localhost:5432  (orch / orch / orchestrator)
```

Frontend (en otra terminal, en tu máquina — necesita Node.js):

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Demo de concurrencia real (varios workers tomando ítems de la misma cola):

```bash
docker compose up --build --scale worker=3
```

## Arquitectura

| Servicio | Rol |
|---|---|
| `api` (FastAPI)      | CRUD + encola tareas. No ejecuta bots. |
| `worker` (Celery)    | Ejecuta cada bot como subprocess aislado. Se escala con réplicas. |
| `beat` (Celery Beat) | Dispara schedules cron y tareas de mantenimiento (reaper). |
| `db` (PostgreSQL)    | Todo el estado. |
| `redis`              | Broker de Celery + slots de concurrencia por proceso. |
| `storage/` (volumen) | Archivos de entrada, evidencias, logs, snapshots. |

## Estructura

```
backend/
  app/            API FastAPI (models, services, api, workers, dto, timeutils)
  sdk/            orchestrator_sdk.py  <- lo que importan los bots
  bots/
    rpa_challenge/  bot de demo (Playwright) contra rpachallenge.com
  alembic/        migraciones (listo para producción; el MVP usa app.initdb)
frontend/         React + Vite + MUI (tema corporativo, modo día/noche)
storage/          artefactos en disco (gitignored)
docker-compose.yml
```

## Limitaciones (a propósito, por ser MVP)

- Un solo bot de demostración incluido.
- Pensado para correr **local**, no está endurecido para producción
  (sin auth multiusuario, sin TLS, credenciales de ejemplo en `.env.example`).
- La bóveda de credenciales existe pero no reemplaza un gestor de secretos real.
- Sin ambientes separados (dev/qa/prod) todavía — es la siguiente pieza en el roadmap.
- Sin selección de "máquina destino" por worker (útil cuando el cliente tiene
  varias máquinas con distinto software instalado) — también en roadmap.

## Roadmap (ideas, no implementado)

- Ambientes aislados (dev/qa/prod) con stacks y credenciales separadas.
- Routing de tareas a workers específicos por etiqueta/máquina (vía colas
  nombradas de Celery).
- Selectores "self-healing" (fallback visual/heurístico cuando un selector
  de UI deja de existir) para que los bots sean más robustos a cambios de
  interfaz.
