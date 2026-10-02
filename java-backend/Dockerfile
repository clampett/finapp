# Java Spring Boot Backend Dockerfile
FROM eclipse-temurin:17-jdk-alpine

WORKDIR /app

# Copy Maven files and source code
COPY pom.xml .
COPY src ./src

# Install Maven using apk (Alpine package manager)
RUN apk add --no-cache maven

# Build the application
RUN mvn clean package -DskipTests

# Run the application 
ENTRYPOINT ["java", "-jar", "target/*.jar"]