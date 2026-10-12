# Decision 0026: Admit complete delivery transitions before committing state

## Context

The queue-capacity prerequisite is implemented and technically reviewed in HLD-13A/B/C.
Delivery introduces transitions with several explanatory events: an ACK send and one disposition,
lease expiry and broker requeue/dead-letter, or a consumer crash and local cancellations.
Stopping between those events could leave committed state or counters absent from the trace.
The existing request-flow emitter is concrete and supplies no reusable virtual scheduler.

## Decision

Implement one plain Java `queues-delivery` model with a local priority queue ordered by
virtual time, declared phase and insertion sequence. Preserve all existing model rules.
Use the existing `SimulationContext` solely for the external cooperative deadline; the
model makes no random choices, sleeps, network calls or wall-clock timing decisions.

A transition stages immutable post-event entity changes, optional ledger appends, future
actions and reached-fault metadata. Check the whole event batch against event count,
conservative escaped JSON bytes, virtual time and the cooperative guard before committing
any of them. A rejected batch leaves the state, ledger, counters and scheduler additions
at the preceding emitted prefix. Playback can inspect intermediate events inside an admitted
batch, but execution cannot return half of it.

Events carry typed changed/new message, consumer and attempt records rather than repeated
full histories. Each changed entity is its complete post-event record: replace it by stable
ID rather than shallow-merging. With the configured omitted-null JSON representation, an absent
nullable field clears its former value; it must not preserve an earlier processing pointer. The initial state plus changes reconstructs presentation; narration has no
behavioral role. Effects carry one explicit ledger append. Results also provide complete
final state, message/attempt outcomes, ledger and authoritative metrics.

Lease expiry first marks the attempt token expired. Its broker allocation remains `LEASED`
for that intermediate event, then the next event in the same batch makes it ready or
dead-lettered. Allocation is not token validity. Similarly, crash marks a consumer down
before cancellation clears its processing slot. Quiescent final-state invariants require
valid current leased tokens and no processing retained by a down consumer.

Keep effect, ACK and lease status independent. A committed effect can coexist with an
expired lease and cancelled ACK. ACK-before does not release a processing slot. Expiry
neither fences nor cancels an effect, including a valid append after dead-lettering.

## Versioned choices

- Input arrays can be unsorted. Validate a sorted copy of each consumer's failure schedule;
  preserve original indexes and input order. There are eight failure actions total.
- Initially insert failure actions before message enqueues. At equal time/phase, recovery
  therefore precedes enqueue. Dispatch uses availability time then message input order,
  and first available consumer in input order.
- Seed is a signed JavaScript-safe integer. It is metadata, with no stochastic choices.
- ACK transport loss happens before token receipt validation; one send has one disposition.
- Pending ACKs include the planned ACK-after-effect. A scheduled timestamp is not observed work.
- ACK-without-effect is unavailable for any limited run, not confirmed loss. Loss selectors
  distinguish reached transport loss, observed cancellation, nonexistent settled attempts
  and prefixes where a future outcome remains unobserved.
- Prune cancelled/invalid actions before choosing the next time. Process explicit faults
  even after broker acknowledgment; settle remaining effects before classifying completion.
- `no_future_progress` is model-local limited status after valid actions drain with ready
  work and no consumer able to proceed. It is not registered as an HTTP capability here.
- Defaults retain 60,000 ms observation and existing event/byte/deadline guards. Custom
  domain budgets may allow larger times. The standalone envelope uses a conservative
  6,260,000 ms bound: 60,000 plus 100 maximum deliveries times (60,000 + 1,000 + 1,000).

The local byte estimator traverses only the typed immutable record/list vocabulary. It counts
all field names and nullable values, exact printable ASCII and conservative escaped UTF-16 strings, numeric widths and
JSON delimiters. Unsupported shapes fail explicitly. Actual application JSON serialization
checks the estimate, event-array limits and complete-result bounds; this is not a heap estimate.

## Alternatives

- Emit incrementally and roll back after a guard: risks partial ledger/counter/scheduler mutations.
- One terminal attempt enum: cannot represent independent effect, token and ACK facts.
- Reuse request-flow scheduling or retrofit a universal runner: changes unrelated tie policies.
- Copy full history into every event: duplicates bounded history and unnecessarily consumes trace bytes.
- Stop when the broker is empty: omits pending effects, ACKs or explicit fault actions.

## Limits and sources

This is a teaching model with a durable ledger append, not a broker SDK or database emulator.
[SQS visibility](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html)
can permit another receive after timeout and can also duplicate during visibility; the latter
failure mode is excluded. [SQS DeleteMessage](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_DeleteMessage.html)
does not promise this model's deterministic stale-token rejection.
[RabbitMQ acknowledgments](https://www.rabbitmq.com/docs/confirms) separate consumer confirmation
from publisher confirmation and use connection/channel failure recovery rules different from this lease model.
[Idempotent API guidance](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
motivates a later atomic protection boundary, which is not implemented by this append-only model.
References reviewed 2026-10-12; all implementation, explanations and diagrams are original.

## Migration and verification

Domain records and standalone schemas do not register a bean, endpoint, catalog entry or React
renderer. OpenAPI and published discovery remain unchanged. The next contribution must add
strict HTTP parsing, resource/admission/recovery checks and explicit draft delivery before UI work.
[HLD-14A](../work-items/HLD-14A.md) records exact semantic, replay, isolation, prefix, serialization
and required CI evidence. Human learning/accessibility and hosted publication reviews remain open.
