#!/usr/bin/env bash
# Mac/Linux equivalent of start.ps1: PostgreSQL + Python in Docker,
# Spring Boot and Express on the host. Ctrl+C stops everything.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
COMPOSE="$ROOT/docker-compose.yml"
VOLUME="${FINAPP_POSTGRES_VOLUME:-finapp_postgres_data}"
STARTED=0

kill_port() {
  local pids
  pids=$(lsof -ti tcp:"$1" -sTCP:LISTEN 2>/dev/null || true)
  [[ -n "$pids" ]] && kill $pids 2>/dev/null || true
}

cleanup() {
  trap - EXIT INT TERM
  [[ $STARTED == 1 ]] || return 0
  echo "Stopping FinApp..."
  kill_port 8080; kill_port 8081
  jobs -p | xargs kill 2>/dev/null || true
  docker compose -f "$COMPOSE" stop db python-backend >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# Tools needed on the host. Python runs in Docker, so it is not needed here.
for tool in docker node npm java lsof; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool"; exit 1; }
done
JAVA_MAJOR=$(java -version 2>&1 | sed -n '1s/.*version "\([0-9]*\).*/\1/p')
[[ "${JAVA_MAJOR:-0}" -ge 17 ]] || { echo "Java 17 or newer is required (found ${JAVA_MAJOR:-none})."; exit 1; }

# Stop this project's containers from a previous run so they don't hold port 5000.
docker info >/dev/null 2>&1 && docker compose -f "$COMPOSE" stop >/dev/null 2>&1 || true

# Ports: 5000 is often taken by macOS AirPlay Receiver, 5432 by a local PostgreSQL.
for port in 5000 5432 8080 8081; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use."
    [[ $port == 5000 ]] && echo "On a Mac this is usually AirPlay Receiver: System Settings > General > AirDrop & Handoff > turn off AirPlay Receiver."
    [[ $port == 5432 ]] && echo "A local PostgreSQL is probably running. Stop it first (for example: brew services stop postgresql)."
    exit 1
  fi
done
STARTED=1

if ! docker info >/dev/null 2>&1; then
  echo "Starting Docker Desktop..."
  open -a Docker 2>/dev/null || true
  for _ in $(seq 1 45); do docker info >/dev/null 2>&1 && break; sleep 2; done
  docker info >/dev/null 2>&1 || { echo "Docker did not start. Open Docker Desktop and retry."; exit 1; }
fi

docker volume inspect "$VOLUME" >/dev/null 2>&1 || docker volume create "$VOLUME"
docker compose -f "$COMPOSE" stop backend frontend >/dev/null 2>&1 || true
docker compose -f "$COMPOSE" up --build -d db python-backend
docker compose -f "$COMPOSE" logs -f --tail 0 python-backend 2>&1 | sed -u 's/^/[PY] /' &

echo "Waiting for PostgreSQL..."
DB_READY=0
for _ in $(seq 1 60); do
  if docker compose -f "$COMPOSE" exec -T db pg_isready -U postgres -d finapp >/dev/null 2>&1; then
    DB_READY=1
    break
  fi
  sleep 1
done
[[ $DB_READY == 1 ]] || { echo "PostgreSQL did not become ready. Check: docker compose logs db"; exit 1; }

# Install when dependencies are missing or the lockfile changed since the last install.
for pkg in frontend frontend/landing frontend/dashboard; do
  dir="$ROOT/$pkg"
  if [[ ! -d "$dir/node_modules" || "$dir/package-lock.json" -nt "$dir/node_modules" ]]; then
    npm ci --prefix "$dir"
  fi
done
echo "Building landing pages and dashboard..."
(cd "$ROOT/frontend" && npm run build)

export SPRING_PROFILES_ACTIVE=local FINAPP_MAIL_MODE=console FINAPP_SESSION_SECURE=false
export PYTHON_SERVICE_URL=http://localhost:5000
export SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/finapp
export SPRING_DATASOURCE_USERNAME=postgres SPRING_DATASOURCE_PASSWORD=postgres

# Run through sh so Git never sees a file-mode change on mvnw.
cd "$ROOT/java-backend"
sh ./mvnw -q -DskipTests clean compile
sh ./mvnw spring-boot:run 2>&1 | sed -u 's/^/[SPRING] /' &

echo "Waiting for Spring Boot on port 8081 (verification codes show as [SPRING] CODE:)..."
SPRING_UP=0
for _ in $(seq 1 120); do
  if lsof -nP -iTCP:8081 -sTCP:LISTEN >/dev/null 2>&1; then
    SPRING_UP=1
    break
  fi
  sleep 1
done
[[ $SPRING_UP == 1 ]] || { echo "Spring Boot did not start within 2 minutes. See the [SPRING] lines above."; exit 1; }

cd "$ROOT/frontend"
FINAPP_API_UPSTREAM=http://127.0.0.1:8081 node express.js 2>&1 | sed -u 's/^/[WEB] /' &

echo "FinApp: http://localhost:8080 - testuser / test123 - press Ctrl+C to stop."
wait
