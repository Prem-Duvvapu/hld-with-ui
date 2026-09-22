# 0001: Compile the backend for Java 17 and test on Java 21

Status: accepted — 2026-09-22

## Context

The architecture proposed Java 21. The owner's current development environment has Java 17, while the repository CI uses Java 21. The first slice should run through `start.sh` without requiring a local Java replacement and should still receive coverage on the newer LTS runtime.

## Decision

Compile the Spring Boot 4 backend for Java 17 bytecode. Treat Java 17 as the minimum local runtime and run CI with Java 21. Pin Maven through the wrapper and keep the frontend's independent minimum at Node 20.19.

## Alternatives considered

- Require Java 21 locally. This would preserve the proposed baseline but prevent the owner from running the first slice in the current environment.
- Use an older Spring Boot line. This would add no value because the selected Spring Boot 4 release supports Java 17.
- Add containers now. The first module does not need the extra build and runtime path.

## Consequences

Backend code cannot use Java language or library features introduced after Java 17. CI still detects runtime compatibility issues on Java 21. A future baseline increase needs an explicit decision and updated setup documentation.

## Migration

Set `java.version` in `backend/pom.xml` to 17, keep CI on Java 21, and document Java 17 or newer in the README.

## Verification

`./mvnw -B verify` passes locally on Java 17. The pull request CI must pass on Java 21 before merge.
