# Delivery, ACKs & Duplicate Work

Your order worker finishes its database update, but its confirmation never reaches the queue. The queue sends the message again. Has the order update happened zero times, once, or twice? Follow one message through delivery, durable work and confirmation, then decide where the application needs protection against repeated work.

## Learning outcomes

- Count delivery attempts, committed effects and accepted acknowledgments independently.
- Predict how acknowledgment order, a consumer crash and a lost receipt change the outcome.
- Explain an expired lease, a stale token and a dead letter without claiming that processing stopped.
- Distinguish an observed prefix from a settled outcome, and identify the boundary that needs idempotency.

## Explain it simply

A queue can offer the work again when it has no accepted confirmation. The worker may already have done the work. An **acknowledgment**, or **ACK**, is the worker's confirmation to the broker; an **effect** is the durable result of doing the work. These are separate actions.

Imagine handing a numbered task to a teammate. They write its result in a shared notebook, but you never hear their “done.” You hand the task out again. The notebook may receive a second entry. Confirming before writing has the opposite risk: you hear “done,” stop offering the task, and the teammate leaves before writing anything.

The first design choice is when to confirm. The next is how to protect the business operation when confirmation and work cannot succeed together. This model deliberately has no deduplication: every completed attempt appends a new record.

## Prerequisites

Start with **Queues & Tail Latency** at `/draft/topics/queues-tail-latency`. It separates worker capacity, waiting and rejection in an in-memory queue. This draft instead models a broker that can offer a message again after a visibility lease expires. The prerequisite remains draft too; neither topic is in published discovery.

You need only the distinction between waiting and processing. The later Transactions and Isolation and Idempotency modules are not implemented here. They are required before adding an executable transaction or deduplication solution.

## Mental model

```text
Broker: message eligibility + current lease token
    | delivery to one available processing slot
    v
Consumer: ready/down + independently running attempt
    | completed work appends one durable record
    v
Ledger: records survive consumer crashes

Consumer -- ACK with delivery token --> Broker
```

Text equivalent: the broker decides whether a message can be delivered. Each consumer has one processing slot. A completed attempt appends to the durable ledger. The consumer sends its delivery token back to the broker as confirmation. A broker lease and a consumer processing slot have separate lifetimes; expiry changes eligibility without canceling the work.

| Term             | Meaning in this model                                                              |
| ---------------- | ---------------------------------------------------------------------------------- |
| Delivery attempt | One offer of a message to a consumer, with its own ID and token                    |
| Visibility lease | Time until an unacknowledged offer can become eligible again                       |
| Effect           | One durable ledger append; no transaction or deduplication is modeled              |
| Accepted ACK     | Confirmation using the current token, received strictly before its deadline        |
| Dead letter      | Message removed from ordinary retry eligibility after the configured attempt limit |
| Extra effect     | A ledger append beyond a message's first append                                    |

**This is an illustrative model, not a broker emulator or a production measurement.** For example, SQS can deliver duplicates during visibility, which this model does not generate. Its old-handle behavior also differs from our strict stale-token rejection. [SQS visibility](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html), [DeleteMessage](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_DeleteMessage.html).

## How it works

Our running example is message `m1`, enqueued at 0 ms, with consumer `c1`, 50 ms processing, 5 ms ACK delay, a 100 ms lease and at most three deliveries.

- **ACK after effect:** start at 0 ms, append at 50 ms, send confirmation at 55 ms.
- **ACK before effect:** start at 0 ms, confirm at 5 ms, append at 50 ms. This policy requires ACK delay to be shorter than processing.
- A crash cancels uncommitted work and unsent ACKs. It cannot erase a committed ledger record.
- Lease expiry makes the message eligible again, or dead-letters it after the maximum deliveries. It does not stop an active consumer.
- A lost ACK never reaches token validation. A received ACK is accepted only for the current token strictly before its deadline.

At the same virtual time, the model processes effect completion, lease expiry, ACK, crash, recovery/enqueue, then dispatch. Therefore an effect due exactly at a crash time commits first, but an ACK exactly at its deadline is stale. These are declared model rules, not wall-clock scheduling guarantees.

Consumer acknowledgment is distinct from publisher confirmation. RabbitMQ also has connection/channel failure requeue behavior; our explicit lease schedule does not reproduce that mechanism. [RabbitMQ consumer acknowledgments](https://www.rabbitmq.com/docs/confirms).

## Worked example

Choose **Lose ACK for attempt 1** with the baseline timings and ACK-after.

| Virtual time | Evidence                                        | Consequence                       |
| ------------ | ----------------------------------------------- | --------------------------------- |
| 0 ms         | `delivery.started`, attempt 1                   | Token 1 has deadline 100 ms       |
| 50 ms        | `effect.committed`                              | Ledger contains the first record  |
| 55 ms        | `ack.sent`, then `ack.lost`                     | Broker still lacks confirmation   |
| 100 ms       | `lease.expired`, `message.requeued`, delivery 2 | Token 2 replaces token 1          |
| 150 ms       | `effect.committed`                              | Ledger contains a second record   |
| 155 ms       | `ack.accepted`                                  | Broker stops offering the message |

Two deliveries produce two effects, so extra effects are `2 - 1 = 1`. The first-effect latency is `50 - 0 = 50 ms` over one message. Accepted-ACK latency is `155 - 0 = 155 ms` over one message. The second append is not a second first-effect sample. Java supplies these populations and values; React only displays them.

**Tempting wrong explanation:** “The first ACK was lost, so the first update failed.” The ledger entry at 50 ms disproves that. Confirmation uncertainty does not establish whether the business work happened.

Compare the baseline with no loss: one effect at 50 ms, one accepted ACK at 55 ms, one delivery and no extra effect. Change only the first-ACK loss to explain what caused the difference.

## Explore in the playground

The direct draft route is `/draft/topics/queues-delivery`. Use **Playground**, **Study** and **Practice**. Guided checkpoints and authored Architecture/sequence tabs are not available in this slice.

1. Select a preset and make a short prediction before running. Predictions in the Playground stay only while this page is mounted; Practice answers use the existing browser backup tools.
2. Run explicitly. The model does not run just because you open the lesson or change an input.
3. Step or seek through the returned trace. Inspect the broker, consumer and ledger together; read the state tables for the equivalent text.
4. Compare your prediction with Java's returned result, then explain which event changed your reasoning.
5. Change one control and run again. A previous result belongs to the submitted inputs and is labeled stale when the editable inputs differ.

Try these contrasts:

- Crash at 25 ms and recover at 75 ms with the two ACK policies. ACK-before gives one accepted confirmation but no effect; ACK-after gives two deliveries and one effect.
- Crash at 52 ms and recover at 102 ms with ACK-after. The effect at 50 ms survives, the pending ACK is canceled, retry starts at 102 ms, and a second effect commits at 152 ms before ACK at 157 ms.
- Set processing to 95 ms, ACK delay 5 ms, lease 100 ms and maximum attempts two. Change only lease to 101 ms. The equality boundary changes stale confirmation into acceptance.
- Use two consumers, processing 150 ms, ACK delay 5 ms and lease 100 ms. Explain why the ledger changes after the message is dead-lettered.

Advanced inputs let you change message/consumer IDs, enqueue times, fault schedules, lost-ACK selectors and seed within the descriptor's limits. Faults must alternate crash/recovery chronologically per consumer; arrays need not be entered in chronological order. Seed is recorded for replay within this model version; these schedules contain no probabilistic outcome to invent.

Returned metrics describe the whole observed run or prefix, even when playback is at an earlier event. Playback position changes the inspected state; it does not recalculate final statistics.

## Failures and tradeoffs

| Choice or failure | Benefit / reason                                                     | Risk and evidence                                                                  |
| ----------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| ACK before effect | Early confirmation prevents lease-driven redelivery after acceptance | Crash at 25 ms leaves accepted confirmation at 5 ms and zero effects               |
| ACK after effect  | Broker remains eligible to retry work that never committed           | Lost receipt or crash after commit can repeat durable work                         |
| Longer lease      | Gives more time to finish and confirm                                | Delays retry after failure; cannot undo an effect or prove duplicate-free behavior |
| More consumers    | Can process eligible work when another slot is busy/down             | Expired work can overlap; consumer count does not add deduplication                |
| Maximum attempts  | Bounds repeated broker offers                                        | Dead letters need diagnosis; an already running effect may still commit            |

In the overlapping preset, attempt 1 starts at 0 ms and attempt 2 at 100 ms. Their effects commit at 150 and 250 ms. The message becomes dead-lettered at 200 ms; the later effect is still possible because expiry does not fence the ledger. Both ACKs are stale, at 155 and 255 ms. A stale lease token protects this broker's confirmation check only.

A **limited run** reports its observed prefix. With enqueue at 60,000 ms, effect is scheduled at 60,050 ms, ACK at 60,055 ms and expiry at 60,100 ms. The default observation ceiling stops before those events: zero observed effects does not prove eventual loss. Zero-sample latency is unavailable; acknowledged-without-effect is unknown on every limited run.

A **no-future-progress** limit means ready work remains after all valid pending actions drain. Crash the only consumer at 0 ms without recovery: no delivery can start. Add recovery at 75 ms and the run can progress; do not declare a stall before that valid recovery.

## In a real project

Transfer this to an order worker that writes an order update and calls an email provider. State the invariant: retrying the same logical operation must preserve the intended business result. Measure attempts, unique logical requests, durable mutations, ambiguous provider responses, waiting age and dead-letter age separately.

ACK-after helps retain retry eligibility, but protecting local request identity and its mutation needs an atomic boundary. An external provider is outside a local database transaction; provider idempotency or explicit reconciliation needs its own design. [AWS idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/).

Ask a teammate: “If the database commits and the process dies before confirmation, what will the next attempt observe? If the provider times out after sending, how will we find out?” Later modules will implement transactions and idempotency prerequisites. This Playground demonstrates why they are needed; it does not claim exactly-once email, payment or order processing.

## Interview practice

A two-minute explanation can follow this order:

1. State the operation and its correctness requirement.
2. Separate broker delivery, durable business effect and confirmation.
3. Trace the baseline: start 0 ms, effect 50 ms, ACK 55 ms.
4. Show the lost-ACK window: two deliveries, two effects, ACK 155 ms.
5. Choose ACK-after for retry eligibility, then define the application boundary needing duplicate protection.
6. Name the remaining external-provider uncertainty and the evidence you would collect.

Follow-up one: “Processing occasionally takes longer than the lease.” Explain overlapping attempts and why extending the lease changes timing without protecting the ledger.

Follow-up two: “The ACK can be accepted before the effect.” Explain the crash-before-effect loss window; confirmation cannot stand in for a durable result.

Alternative answers are reasonable when they state the business invariant, broker semantics and protected resource. Product names alone do not establish the guarantee.

## Teach it back

Explain the lost-ACK experiment aloud to a teammate without reading the event log. Then explain the early-ACK crash contrast.

Self-check your answer:

- Did I define delivery, effect and ACK separately?
- Did I use the actual 50/55/100/150/155 ms evidence?
- Did I explain which failure leaves repeated work and which leaves missing work?
- Did I state that expiry does not cancel or fence consumer processing?
- Did I keep limited/unknown outcomes distinct from settled counts?
- Did I propose the next application decision without claiming a deduplication feature exists here?

Use Practice to save your own explanation, reveal the reference, compare its rubric, and revise. These are self-checks, not automatic grades or proof of mastery.

## Further reading

- [SQS visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html): eligibility and duplicate-delivery limits.
- [SQS DeleteMessage](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_DeleteMessage.html): current receipt handles and vendor-specific behavior.
- [RabbitMQ acknowledgments and confirms](https://www.rabbitmq.com/docs/confirms): separate consumer/publisher mechanisms.
- [Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/): reasoning about request identity and atomic mutation boundaries.

References explain real systems; all numeric traces and diagrams above are original fixtures of model 1.0.0.
