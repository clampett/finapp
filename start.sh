#!/usr/bin/env bash
# Mac/Linux equivalent of start.ps1: PostgreSQL + Python in Docker,
# Spring Boot and Express on the host. Ctrl+C stops everything.
set -euo pipefail
 
ROOT="$(cd "$(dirname "$0")" && pwd)"
COMPOSE="$ROOT/docker-compose.yml"
VOLUME="${FINAPP_POSTGRES_VOLUME:-finapp_postgres_data}"
JAVA_PID=""; WEB_PID=""
 
cleanup() {
  echo "Stopping FinApp..."
  [[ -n "$WEB_PID" ]] && kill "$WEB_PID" 2>/dev/null || true
  [[ -n "$JAVA_PID" ]] && pkill -P "$JAVA_PID" 2>/dev/null; kill "$JAVA_PID" 2>/dev/null || true
  docker compose -f "$COMPOSE" stop db python-backend >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# Ports: 5000 is often taken by macOS AirPlay Receiver.
for port in 5000 8080 8081; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use."
    [[ $port == 5000 ]] && echo "On a Mac this is usually AirPlay Receiver: System Settings > General > AirDrop & Handoff > turn off AirPlay Receiver."
    exit 1
  fi
done
f ! docker info >/dev/null 2>&1; then
  echo "Starting Docker Desktop..."
  open -a Docker 2>/dev/null || true
  for _ in $(seq 1 45); do docker info >/dev/null 2>&1 && break; sleep 2; done
  docker info >/dev/null 2>&1 || { echo "Docker did not start. Open Docker Desktop and retry."; exit 1; }
fi

docker volume inspect "$VOLUME" >/dev/null 2>&1 || docker volume create "$VOLUME"
docker compose -f "$COMPOSE" stop backend frontend >/dev/null 2>&1 || true
docker compose -f "$COMPOSE" up --build -d db python-backend
 
echo "Waiting for PostgreSQL..."
for _ in $(seq 1 60); do
  docker compose -f "$COMPOSE" exec -T db pg_isready -U postgres -d finapp >/dev/null 2>&1 && break
  sleep 1
done

for pkg in frontend frontend/landing frontend/dashboard; do
  [[ -d "$ROOT/$pkg/node_modules" ]] || npm ci --prefix "$ROOT/$pkg"
done
echo "Building landing pages and dashboard..."
(cd "$ROOT/frontend" && npm run build)
 
export SPRING_PROFILES_ACTIVE=local FINAPP_MAIL_MODE=console FINAPP_SESSION_SECURE=false
export PYTHON_SERVICE_URL=http://localhost:5000
export SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/finapp
export SPRING_DATASOURCE_USERNAME=postgres SPRING_DATASOURCE_PASSWORD=postgres
 
cd "$ROOT/java-backend"
chmod +x mvnw
./mvnw -q -DskipTests compile
./mvnw spring-boot:run 2>&1 | sed -u 's/^/[SPRING] /' &
JAVA_PID=$!

cho "Waiting for Spring Boot on port 8081 (verification codes show as [SPRING] CODE:)..."
for _ in $(seq 1 90); do
  lsof -nP -iTCP:8081 -sTCP:LISTEN >/dev/null 2>&1 && break
  sleep 1
done

cd "$ROOT/frontend"
FINAPP_API_UPSTREAM=http://127.0.0.1:8081 node express.js 2>&1 | sed -u 's/^/[WEB] /' &
WEB_PID=$!
 
echo "FinApp: http://localhost:8080 - testuser / test123 - press Ctrl+C to stop."
wait
