# Build from the repository root: the backend packages ../content onto its classpath,
# so the image needs both backend/ and content/ (see render.yaml dockerContext).

# Stage 1: build the Spring Boot jar with the Maven Wrapper
FROM eclipse-temurin:17-jdk AS build
WORKDIR /app/backend

# Copy the wrapper and pom first so dependency downloads are cached between builds
COPY backend/mvnw backend/pom.xml ./
COPY backend/.mvn ./.mvn
RUN ./mvnw -B -q dependency:go-offline

COPY content /app/content
COPY backend/src ./src
RUN ./mvnw -B -q package -DskipTests

# Stage 2: runtime image
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/backend/target/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
