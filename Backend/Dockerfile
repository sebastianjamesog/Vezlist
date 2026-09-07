FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src src
RUN mvn -B -q package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 vezlist
COPY --from=build /workspace/target/vezlist-api-*.jar app.jar
USER vezlist
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
