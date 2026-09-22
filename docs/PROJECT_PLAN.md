# HLD with UI: project plan

Planning baseline: 2026-09-22. Status: proposed product and implementation plan; no application features shipped.

## 1. Product goal

Help a developer explain how a system works, predict how it behaves under load or failure, and choose an architecture with explicit tradeoffs. Learning should transfer both to a production design review and to an interview whiteboard.

The central unit is a **decision supported by an experiment and a clear explanation**. For example: “Our database is overloaded by repeated reads. When does a cache help, what can become stale, and what happens when the cache fails?” A learner should understand this in simple terms and explain it to a teammate or interviewer without memorized jargon.

### Learner outcomes

A learner should be able to:

1. Turn a vague feature request into functional requirements, constraints, measurable service objectives, and stated assumptions.
2. Estimate traffic, storage, concurrency, and bandwidth with units and sensitivity ranges.
3. Trace reads and writes through an architecture, including asynchronous work and failures.
4. Select data models, partition keys, communication patterns, and consistency guarantees based on access patterns.
5. Diagnose saturation, stale reads, retry storms, hot partitions, duplicate processing, and regional failure.
6. Propose a simple initial design, explain when it stops working, and describe a safe migration.
7. Defend alternatives using latency, correctness, availability, cost, security, and operational complexity.

## 2. Position within the existing projects

**LLD with UI is the primary product reference**, explicitly selected by the project owner. Its shared module shell, hands-on operations, guided simulations, diagrams, and design explanations set the direction. DSA and CS fundamentals supply supporting practices. The repository review is summarized with sources in [RESOURCES.md](RESOURCES.md).

| Existing project | Carry forward | HLD focus |
| --- | --- | --- |
| DSA with UI | Execution-backed traces, input contracts, explicit coverage, no substitute animations | Requests, queues, replicas, failures, and system-wide consequences |
| LLD with UI | Java domain behavior, scenario workflows, visible state transitions | Service boundaries and guarantees across processes |
| CS fundamentals with UI | Structured reading, prerequisites, recall practice, accessible themes, content validation | Compose fundamentals into architecture decisions |

Offer concise prerequisite refreshers and optional links to related projects. This project must remain understandable when those sites are unavailable. Avoid duplicating entire OS, Java, networking, or LLD courses.

## 3. Learning experience

### The loop

1. **Understand:** Read a short orientation and inspect a labeled architecture.
2. **Predict:** Answer what will change when a parameter or failure is introduced.
3. **Experiment:** Change a meaningful input and run or step through the model.
4. **Observe:** Follow the request timeline, component state, and computed metrics.
5. **Explain:** Compare prediction with evidence and answer a transfer question.
6. **Teach it back:** Explain the cause, evidence, and choice in plain language, then handle a changed-condition interview question.
7. **Apply:** Make a design decision in a case study or a workplace incident.

Prediction and explanation prompts should accept free text where reasoning matters. Store answers locally. Model answers reveal assumptions and alternatives; they are not automatic judgments of architectural correctness.
Every module follows [the learning standard](LEARNING_STANDARD.md): a one-sentence idea, a small example, mechanism, experiment, tradeoff/failure, and practice explaining it.

### Main surfaces

| Surface | User experience | Release |
| --- | --- | --- |
| Learn | Guided prerequisite order, topic reader, table of contents, tier jumps, glossary links | First release |
| Experiment | Scenario presets, inputs, topology, playback, event log, metrics, explanation | First release |
| Design | Guided requirements, estimates, API/data model, diagram, failure review, decision record | Guided first release; editing later |
| Practice | Recall cards, design prompts, timed interview sessions, self-assessment rubric | Recall first release; timed mode later |
| Progress | Continue learning, bookmarks, completed activities, export/import | First release |
| Search | Search published topics and terminology; filters by level and capability | First release |

Use a shared `HldModulePage` shell inspired by LLD's `LldPage`: **Playground**, **Guided Simulation**, **Architecture**, **Request Sequence**, **Design Details**, and **Practice**. Show only supported tabs. A runnable module opens on its playground with a short orientation; a theory/calculation module opens on its explanation or calculator. Preserve the selected tab in the URL for deep linking. Advanced explanations remain available without running an experiment.

Playground inputs define a workload or operation sequence that Java executes. Guided Simulation uses curated operations and explanation checkpoints over the same model. Architecture and Request Sequence expose the corresponding topology and causal flow. Design Details connects those observations to constraints and alternatives. This gives HLD the concrete, integrated module experience of LLD while focusing on distributed behavior.

### Layout and interaction rules

- Desktop experiment: inputs at left, topology/timeline in the center, inspector and metrics alongside; explanatory text remains easy to reach.
- Mobile: stacked controls, diagram with explicit pan/zoom, readable event table, and inspector below. No page-wide horizontal overflow.
- Support play, pause, next event, previous event, reset, speed, event seek, and replay with the same inputs. First slice implements these for bounded returned traces.
- Clicking a node or event connects visual state, narration, and metrics. A selected request can be followed across its causal events.
- “Why did this happen?” must explain the active rule using the trace, not generic prose unrelated to the current run.
- Metrics include units, observation windows, denominators, and model assumptions. Distinguish estimated values, simulated measurements, and real lab measurements.
- Use semantic design tokens for both themes. Color is accompanied by labels or shapes; motion is optional.
- All diagrams have a textual description; graph operations have keyboard alternatives. Target WCAG 2.2 AA, checked automatically and manually.
- Loading, validation, unavailable experiments, empty search, network failure, and trace limits have explicit states. Never replace an error with a plausible-looking result.

## 4. First release: a complete small learning path

Ship three concept modules and one guided case study before expanding the catalog:

| ID | Outcome | Required evidence |
| --- | --- | --- |
| `request-flow` | Explain the path from client to service and how balancing plus finite workers affects waiting | Round-robin/least-outstanding comparison, slow node and failed node presets, queue and latency traces |
| `capacity-estimation` | Convert workload assumptions into a capacity range | Editable unit-aware calculator; average/peak requests, storage, bandwidth, concurrency; worked example and limits |
| `cache-aside` | Explain hits, misses, expiration, stale data, and origin load | Actual key/value/TTL state; cold/warm/skewed workloads; origin update and cache-unavailable scenarios |
| `url-shortener` | Defend a read-heavy service design and its evolution | Requirements, estimates, API/data model, baseline and evolved diagrams, links to the three experiments, failure review and rubric |

The case study is a guided workshop with editable answers, not a general-purpose architecture simulator. The capacity calculator is labeled an estimator. It may share validated Java calculation services but is not falsely counted as an event simulation.

Release gates: fresh-checkout startup works; all four modules are complete; numeric examples reconcile with implementations; relevant tests and accessibility checks pass; progress export/import works; unknown routes and failed API calls are handled; README accurately describes shipped capabilities.

### First-release exclusions

Defer arbitrary diagram execution, distributed consensus animation, real Kafka/Redis/PostgreSQL clusters, account sync, collaborative editing, gamified streaks, public leaderboards, automated interview grading, and AI tutoring. Add these only through later roadmap decisions.

## 5. Two applied learning tracks

### Engineering track

Use incident cards: symptom → evidence → hypotheses → experiment → mitigation → long-term fix → validation. Examples include cache expiry causing database overload, retries multiplying a dependency outage, a queue growing faster than workers can drain it, and an idempotency gap causing duplicate work.

Each major case study includes an operational checklist: useful signals, alert rationale, fallback behavior, rollout/rollback, data migration, and recovery verification. Later optional labs connect the model to real Java applications and infrastructure.

### Interview track

Practice a 45-minute session: clarify requirements (5), estimate (5), draw the baseline (10), deep dive (15), address failures/tradeoffs (7), recap (3). Allow changing these times.

Score each dimension from 0–3 using descriptions: absent, named without reasoning, justified under assumptions, justified with alternatives and failure analysis. Dimensions: requirements, estimates, API/data modeling, architecture, consistency/failure handling, operations/security, and communication. Keep scores as self-assessment; do not claim hiring predictions.

## 6. Success criteria

Measure learning through observable tasks:

- Before/after transfer questions: can a learner explain a new scenario without repeating the demo?
- Can they reproduce a failure, identify the first saturated component, and justify a fix?
- Can they give a valid alternative and state the condition under which it wins?
- Can a new contributor ship one module using only the documented contracts?

Initial evaluation: manually walk a newcomer through the first path, collect confusing steps and unsupported assumptions, and revise before broad expansion. Do not set invented learning-effectiveness percentages without observations.

Product health: published modules satisfying their gates, broken-link/reference count, deterministic fixture results, failed user journeys, accessibility defects, and measured bundle/trace sizes. Generate counts from the catalog once implemented. Reading completion and assessment evidence remain separate.

## 7. Scope and operating principles

- Prefer a smaller complete curriculum over a larger catalog with shallow or misleading experiments.
- Design for anonymous local use and a hosted single-user learning session first. No database or login required for the first release.
- Educational numbers are explicit assumptions. Avoid fixed cloud cost claims; future cost estimators accept user-provided prices and record region/date.
- Maintain original, cited content. The linked resource index informs discovery, not a requirement to reproduce every item.
- Revisit the roadmap after the first slice and first release using implementation and learner evidence.

Detailed delivery dependencies are in [ROADMAP.md](ROADMAP.md); the full topic progression is in [CURRICULUM.md](CURRICULUM.md).
The detailed visual and engineering review bar is in [EXPERIENCE_AND_QUALITY.md](EXPERIENCE_AND_QUALITY.md).
