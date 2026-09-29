# Historical brief: P0-01 bootstrap (completed)

> **Historical record — not current instructions.** `P0-01` is done (see [the roadmap](ROADMAP.md#phase-0-executable-foundation)). Do not follow the steps below to set up or extend the project. For startup and checks, use the [README](../README.md#development) and [CONTRIBUTING](../CONTRIBUTING.md). For the next task, use [the implementation plan](IMPLEMENTATION_PLAN.md#5-delivery-sequence-and-dependencies) and the roadmap.

The text below is the original acceptance brief, kept unchanged so the bootstrap decisions remain traceable.

## Objective

Make a fresh checkout start a React/TypeScript frontend and Java backend, with a working API request and clear development instructions. This proves the development path before the project invests in models or lessons.

## Read first

`AGENTS.md`, `docs/PROJECT_PLAN.md`, `docs/ARCHITECTURE.md`, and Phase 0 in `docs/ROADMAP.md`. Use LLD-with-UI's shared module experience as the product reference; the full tab shell belongs to `P0-03`.

## Implementation steps

1. Inspect the environment and current files; preserve unrelated changes. Select mutually compatible supported React/Vite/TypeScript, Node, Java, Spring Boot, Maven, and testing versions. Record exact requirements in README and build files.
2. Create `frontend/` with a minimal accessible app, strict TypeScript, theme tokens, a typed API helper, and one honest welcome/status view. It should state that the curriculum is being built without displaying fabricated completed topics.
3. Create `backend/` with Maven Wrapper and a single Spring Boot entry point. Add a bounded health response suitable for local readiness. Choose its precise route and document it; it is not a curriculum endpoint.
4. Configure the frontend development proxy and environment-overridable ports. A user-visible backend error must remain an error, not a successful-looking mock result.
5. Complete and test the existing root launcher for Linux/WSL against the real applications. Confirm executable permissions, toolchain checks, clear output, interrupt cleanup, and no broad killing of unrelated Java/Node processes. Document separate frontend/backend commands for other environments until tested launchers exist.
6. Add a minimal `.gitignore` for dependencies, builds, logs, local secrets, and IDE metadata. Do not delete the existing user's `.idea/` directory.
7. Add targeted tests for API readiness/error behavior and launcher cleanup where useful. Existing toolchain-generated smoke tests do not substitute for verifying a real browser-to-Java request.
8. Update README with actual tested setup/build/check commands and update `P0-01` with evidence.

## Acceptance checklist

- Fresh dependency installation uses committed lockfiles; Java builds through the wrapper.
- Frontend builds with no TypeScript errors; backend package builds and tests execute.
- Starting both apps exposes the printed URLs; the frontend successfully reaches Java through the proxy.
- Stopping the root launcher terminates only processes it owns; occupied ports are explained.
- A backend outage yields a useful frontend state with a retry action.
- No database, cloud account, Redis, Kafka, or container runtime is required for this local foundation.
- Setup documentation distinguishes tested commands from future work.

## Handoff

Record versions, tested environment, commands/results, any launcher portability limits, and the actual health endpoint. The next items are `P0-02` contracts and `P0-03` shell once its dependencies exist. Do not implement a fake model merely to make the home page appear populated.
