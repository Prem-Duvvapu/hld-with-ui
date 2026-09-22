# HLD with UI

Learn high-level system design by reading, experimenting, diagnosing failures, and defending design decisions. Built for day-to-day engineering and system design interviews.

The idea is simple: **see a system work, change one condition, explain what happened, then choose a design.** Each module will help you answer both “How does this work?” and “How would I explain it to my team or in an interview?”

**Status: planning foundation.** The application has not been implemented. The planned stack is React with TypeScript and a Java Spring Boot backend.

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

There is no application yet. `start.sh` currently reports which frontend and backend files are missing; roadmap item `P0-01` makes it operational and verifies startup/cleanup on a clean checkout.

Planning checks run now with `node scripts/validate-plan.mjs` and `bash -n start.sh`. The [CI workflow](.github/workflows/ci.yaml) runs these checks on PRs and `main`, and runs Java and React builds/tests once both applications exist.

## References

**[lld-with-ui](https://github.com/Prem-Duvvapu/lld-with-ui) is the primary product reference**, as selected by the project owner: hands-on modules, guided simulations, diagrams, and design details in a consistent shell. [dsa-with-ui](https://github.com/Prem-Duvvapu/dsa-with-ui) and [cs-fundamentals-with-ui](https://github.com/Prem-Duvvapu/cs-fundamentals-with-ui) provide supporting practices. The user-provided [system design resource collection](https://github.com/ashishps1/awesome-system-design-resources) is a discovery index; lessons will include primary sources and original explanations.
