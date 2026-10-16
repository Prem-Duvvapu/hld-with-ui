# 0035 — Keep two transaction experiments in one topic

## Context

The reservation draft teaches stale observations and a current-stock acceptance boundary.
[HLD-17A](../work-items/HLD-17A.md) adds a separate model exposing related writes, private
work, publication and abort. Learners need both questions in one Transactions & Isolation
module while the original replay and saved activities remain identifiable.

## Decision

Keep the canonical topic `transactions-isolation`; append the actual `transaction-atomicity`
simulation when its strict endpoints and renderer exist. Preserve both models' schema 1.0 /
model 1.0.0 and the older reservation input/result goldens. HTTP 1.9 exposes a direct descriptor
and run namespace, covered by the existing shared admission/request/response guards.

Playground offers named Reservation race and Atomicity & abort choices. The URL stores only
the experiment choice. Each visited panel stays mounted and keeps its own controls, prediction,
result and selected snapshot. Atomicity loads its descriptor and renderer lazily when selected.
Its failure/retry state is local; it supplies no fallback outcome or automatic execution.
Unknown choices and missing backend capabilities require an explicit learner choice.

Topic content 1.2.0 extends Study and Practice with eight original atomicity questions while
retaining the older eight question/checkpoint IDs. Existing Guided and authored design views
remain visibly reservation scoped. Topic-level capabilities do not imply that every model has
all six views; atomicity Guided/design need actual authored evidence in a later contribution.

Use canonical closed schemas and generated descriptor/types. Capture the exact payload before
an asynchronous client yield. Validate shape, static program order, semantic references and
reported equality without computing stock, revision increments, flags, counters or winners.
Java returns complete initial/post-step states and authoritative history/final metrics.

## Alternatives

A second topic would duplicate curriculum/prerequisite and answer lifecycle metadata. A new
reservation version would silently replace a different experiment and require replay migration.
A combined untagged form would obscure which algorithm and state vocabulary produced a run.
Eagerly loading both models would add new availability and bundle work to the default experience.
New generic simulation registries or transaction services are unnecessary for this concrete pair.

## Consequences

The learner can compare related questions through a stable shell while retaining independent
work. Source metadata, contracts, API and UI share exact identities. Topic-version review
notices may require revisiting older saved reasoning; those answers are preserved.

The UI distinguishes published data, private work and retained base history; known zero is
never replaced by an absent-value label. Selected snapshot flags and whole-history metrics
have separate scopes. Explicit actor/reference editing and stable UI keys preserve focus;
removing a transaction removes its explicitly associated steps without rewriting other actors.

The original algorithms emulate no SQL isolation level or database recovery. Local COMMITTED
and completed analysis promise no durable storage, acknowledgement, safe retries, retained-key
idempotency or atomic external effect. Draft development, hosted verification and publication
remain separate gates.

## Migration

No existing model replay migration is needed. Existing routes default to reservation; new
links can use `?experiment=atomicity`. Old topic metadata shows atomicity as unavailable while
retaining reservation. Unknown experiment values are explained without silently running a
substitute. Additional Guided/design scope will be added with actual Java-targeted content.

## Verification

[HLD-17B](../work-items/HLD-17B.md) records actual checks. Require strict real HTTP semantics,
limits/admission/recovery, captured client authority, meaningful form/run changes, per-step
snapshot evidence, independent loading/error/history preservation, both themes/responsive
keyboard/reduced motion/native zoom, actual source/rubric agreement, copied jar/container
full golden comparisons and required final-head CI before merge. Passing inherited checks
alone proves no new learning capability.
