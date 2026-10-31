# Build stage — use official Maven image (includes JDK)
FROM maven:3.9-eclipse-temurin-21-alpine AS builder

WORKDIR /app

# Download dependencies first for better layer caching
COPY pom.xml .
RUN mvn dependency:go-offline -B -q

# Copy source and build
COPY src ./src
RUN mvn clean package -DskipTests -B -q

# Runtime stage — JRE only (much smaller than JDK)
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Non-root user for security
RUN addgroup -S spring && adduser -S spring -G spring

COPY --from=builder /app/target/*.jar app.jar

RUN chown spring:spring app.jar

USER spring:spring

EXPOSE 8761

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget -q --spider http://localhost:8761/actuator/health || exit 1

ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]