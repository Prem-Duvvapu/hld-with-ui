# HLD with UI

Learn high-level system design by reading, experimenting, diagnosing failures, and defending design decisions. Built for day-to-day engineering and system design interviews.

The idea is simple: **see a system work, change one condition, explain what happened, then choose a design.** Each module will help you answer both “How does this work?” and “How would I explain it to my team or in an interview?”

**Status: first working vertical slice.** The application includes a React/TypeScript learning shell, a Java/Spring Boot API, and the interactive Request Flow & Load Balancing module. Later roadmap modules remain planned.

## Start here

Read the [project plan](docs/PROJECT_PLAN.md) for the product vision, learning experience, first release, and success criteria.

| Document | Purpose |
| --- | --- |
| [Agent instructions](AGENTS.md) | How to start, contribute, validate, and hand off work |
| [Contributing](CONTRIBUTING.md) | Branch, PR, CI, and local-check workflow |
| [Project plan](docs/PROJECT_PLAN.md) | What we are building and why |
| [Experience and quality](docs/EXPERIENCE_AND_QUALITY.md) | UI/UX and frontend/backend engineering standards |
| [Learning standard](docs/LEARNING_STANDARD.md) | Make every concept simple to understand and explain |
| [Curriculum](docs/CURRICULUM.md) | Ordered concepts, experiments, case studies, and learning paths |
| [SDE-2 interview priority](docs/SDE2_INTERVIEW_PRIORITY.md) | Evidence-based case order and recurring backend follow-ups |
| [First release blueprint](docs/RELEASE_ONE_BLUEPRINT.md) | Exact learning flows and worked fixtures for the first four modules |
| [Architecture](docs/ARCHITECTURE.md) | Proposed stack, modules, storage, and API boundaries |
| [Simulation specification](docs/SIMULATION_SPEC.md) | Deterministic execution, event contracts, metrics, and correctness |
| [Content specification](content/CONTENT_SPEC.md) | Lesson and case-study authoring requirements |
| [Delivery roadmap](docs/ROADMAP.md) | Work packages, dependencies, acceptance criteria, and current status |
| [Research and sources](docs/RESOURCES.md) | Related projects, primary references, and source policy |
| [Contribution template](docs/templates/WORK_ITEM.md) | A bounded task and evidence-based handoff |

The learning loop is **understand → predict → experiment → observe → explain → apply**. Every released module must make a learner better at making a concrete engineering decision.

The build order is: establish the React/Java foundation → finish one excellent request-flow module → add capacity estimation and caching → connect them in a URL shortener workshop → expand into queues, storage, reliability, and advanced distributed systems. The [roadmap](docs/ROADMAP.md) gives each step a completion gate.

The first complete learning experience will cover **request flow and load balancing**, followed by **capacity estimation**, **cache-aside**, and a **URL shortener design workshop**. See the roadmap for exact release gates.

## Development

Requirements: Java 17 or newer, Node.js 20.19 or newer, and npm.

```bash
npm ci --prefix frontend
./start.sh
```

Open `http://localhost:5173`. The launcher starts the frontend and backend, prints both URLs, and stops both when you press Ctrl+C. Override its ports with `FRONTEND_PORT` and `BACKEND_PORT`.

Run the same local checks as CI:

```bash
node scripts/validate-plan.mjs
bash -n start.sh
(cd backend && ./mvnw -B verify)
(cd frontend && npm run contracts:check && npm run typecheck && npm run lint && npm run format:check && npm test && npm run build)
```

The [CI workflow](.github/workflows/ci.yaml) runs these gates on pull requests and `main`.

API and content contracts live in [contracts](contracts/README.md). React API types are generated from OpenAPI, and CI rejects generated-type drift, malformed content, broken prerequisites, unresolved sources, and capabilities without a registered model.

## Implemented learning module

**Request Flow & Load Balancing** follows the complete learning loop:

- study a plain-language model of routing, finite workers, queues, and rejection;
- run bounded deterministic experiments against the Java model;
- play, pause, step, and seek through the authoritative event trace;
- inspect latency, throughput, rejection, and per-request outcomes;
- use architecture, sequence, quiz, and interview-answer views to explain the result.

Model v1.0.0 intentionally excludes network delay, failures, retries, and health-check delay. Its metrics describe a finite illustrative run, not a production benchmark.

## References

**[lld-with-ui](https://github.com/Prem-Duvvapu/lld-with-ui) is the primary product reference**, as selected by the project owner: hands-on modules, guided simulations, diagrams, and design details in a consistent shell. [dsa-with-ui](https://github.com/Prem-Duvvapu/dsa-with-ui) and [cs-fundamentals-with-ui](https://github.com/Prem-Duvvapu/cs-fundamentals-with-ui) provide supporting practices. The user-provided [system design resource collection](https://github.com/ashishps1/awesome-system-design-resources) is a discovery index; lessons will include primary sources and original explanations.
