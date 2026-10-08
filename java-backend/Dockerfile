# Java Spring Boot Backend Dockerfile
FROM node:24-alpine AS frontend

WORKDIR /app

# Copy and install frontend dependencies for landing
COPY frontend/landing/package*.json ./
RUN npm ci --workdir ./frontend/landing

# Copy and install frontend dependencies for dashboard
COPY frontend/dashboard/package*.json ./
RUN npm ci --workdir ./frontend/dashboard

# Copy all frontend files
COPY frontend/ ./frontend/

# Build frontend applications
RUN cd frontend/landing && npm run build
RUN cd frontend/dashboard && npm run build

# Build backend
FROM eclipse-temurin:17-jdk-alpine

WORKDIR /app

RUN apk add --no-cache maven

# Copy Maven files and source code
COPY pom.xml .
RUN mvn -q dependency:go-offline

COPY src ./src

# Build the application
RUN mvn -q clean package -DskipTests && mv target/*.jar app.jar

# Run the application 
ENTRYPOINT ["java", "-jar", "app.jar"]