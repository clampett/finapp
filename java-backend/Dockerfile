# Java Spring Boot Backend Dockerfile
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