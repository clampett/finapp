# One free web-service instance runs the existing web, Java, and Python layers.
FROM node:24-bookworm-slim AS web-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
COPY frontend/landing/package*.json ./landing/
COPY frontend/dashboard/package*.json ./dashboard/
RUN npm ci && npm ci --prefix ./landing && npm ci --prefix ./dashboard
COPY frontend/ ./
RUN npm run build && npm prune --omit=dev

FROM maven:3.9-eclipse-temurin-17 AS java-build
WORKDIR /build/java
COPY java-backend/pom.xml ./
RUN mvn -q dependency:go-offline
COPY java-backend/src/ ./src/
RUN mvn -q package -DskipTests && mv target/*.jar /build/finapp.jar

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-17-jre-headless nodejs tini ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY python-backend/requirements.txt ./python/requirements.txt
RUN pip install --no-cache-dir -r ./python/requirements.txt
COPY python-backend/app/ ./python/app/
COPY --from=web-build /build/frontend/build/ ./frontend/build/
COPY --from=web-build /build/frontend/node_modules/ ./frontend/node_modules/
COPY frontend/express.js frontend/api-proxy.js ./frontend/
COPY --from=java-build /build/finapp.jar ./finapp.jar
COPY deploy/run.py ./run.py
RUN useradd --create-home --uid 10001 finapp && chown -R finapp:finapp /app
USER finapp
ENV PORT=8080 SERVER_PORT=8081 SERVER_ADDRESS=127.0.0.1 PYTHON_SERVICE_URL=http://127.0.0.1:5000 FINAPP_API_UPSTREAM=http://127.0.0.1:8081 PYTHONUNBUFFERED=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--", "python", "/app/run.py"]
