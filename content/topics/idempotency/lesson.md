# Idempotency: One Intent, Repeated Calls

A server adds one unit, but its response disappears. The caller cannot tell whether the
write happened. Retrying may add another unit. Learn how retaining the original result
beside the write can let the next call return a receipt without publishing another effect.

This draft is a bounded Java model of one add-units endpoint. It is available by direct
link while its prerequisites and release reviews remain pending.

## Learning outcomes

- Separate a caller's missing response from a server's published effect.
- Compare unprotected, split and atomic publication using the same calls and schedule.
- Explain why an earlier lookup miss does not authorize a later protected write.
- Choose key scope, payload checking and retention while stating their limits.
- Explain an observed result to a teammate and defend a production boundary in an interview.

## Explain it simply

Give one intended write a stable key. When a retry arrives, the server can recognize that
key and return the original receipt. The difficult part is making the write and its retained
result agree when calls overlap or a handler stops between actions.

In the default example, call a adds one unit and loses its response. Call b repeats the
same intent. Without protection the public ledger contains two effects. Under atomic
publication it contains one effect, and b receives the receipt naming a's effect.

**Predict first:** If the handler stops after publishing an effect but before saving its
key, will a later lookup find proof of that effect? Try the split-crash-gap scenario.

## Prerequisites

Read the draft Transactions & Isolation topic for private preparation and joint publication,
and Delivery, ACKs & Duplicate Work for the difference between an effect and its observation.
Both remain technical drafts. Timeouts & Retries separately explores when callers send more
attempts; this model runs only the calls and actions you explicitly author.

## Mental model

Keep four places separate:

| Place | What it holds | What it cannot establish alone |
| --- | --- | --- |
| Handler | A call's observation, private units and cached receipt | That prepared work is public |
| Public ledger | Published add-units effects | That the caller received a response |
| Retained key history | Tenant/key, payload units and original receipt | Protection after that record expires |
| Caller observation | Received response, missing response or handler crash | The absence of a public effect |

The lookup identity is the pair **(tenantId, key)** for this fixed endpoint. The operationId
is an audit label grouping intended work; the server never uses it to deduplicate.
Tenant scope is namespacing here, not an implemented authorization system.

A receipt contains the original effectId and units. A replay does not replace that identity
with the retry call's ID. A receipt shown inside a handler snapshot is cached server state;
only a responded call with a receipt demonstrates its modeled receipt observation.

```text
Caller -- authored call --> Handler -- lookup --> Retained tenant/key history
                               |
                         private preparation
                               |
                 atomic current-key check + publication
                         /                  \
                 Public ledger       Retained original receipt
                               |
Caller <-- response or loss -- Handler
```

Text equivalent: the handler observes the retained key, may prepare units privately, then
atomic save checks the current key and publishes the ledger effect with its retained receipt
as one transition. A later response can still be lost. Split mode publishes the ledger effect
earlier, leaving a gap before saving the result.

## How it works

Every complete call follows LOOKUP, WRITE_EFFECT, SAVE_RESULT and then RESPOND or
LOSE_RESPONSE. CRASH_HANDLER can end it after lookup, work or save. Equal-time actions
run in the order you authored. Java validates the whole program before executing it.

| Mode | Work action | Save action | Failure boundary |
| --- | --- | --- | --- |
| NO_DEDUP | Publishes an effect | Makes its receipt without keeping a key | A repeated call can publish again |
| SPLIT_EFFECT_RECORD | Publishes an effect | Inserts a retained result only if the current key is absent | Crash or a losing save can leave an extra public effect |
| ATOMIC_EFFECT_RECORD | Prepares units privately | Rechecks the current key and publishes effect plus result together, or discards private work | Guarantees are scoped to the current retained key and this model |

A matching lookup caches the original receipt. A different payload under the same current
key produces a payload conflict. Later work/save steps are still visible as skipped actions.
In atomic mode, two calls may both miss initially. The second save checks again: it either
replays the winner or rejects a different payload. It cannot rely on its old miss.

Before each authored action, Java expires keys when time is at least expiresAtMs. Expired
rows remain teaching history, but new lookups cannot use them. Expiry never removes ledger
effects. No timer runs between selected snapshots or after the last authored action.

## Worked example

Use unprotected-response-loss: retention 100 ms; a and b share tenant t, key k, operation op,
and payload one unit. Each call's actions share a virtual time. a runs at 0 ms and loses
its response; b runs at 10 ms and responds.

| Action prefix | Unprotected evidence | Atomic evidence with only mode changed |
| --- | --- | --- |
| a completes work | effect-a is public | One unit is private; ledger is empty |
| a saves | Receipt effect-a is ready; no key stored | effect-a and record-a publish together; expiry is 100 ms |
| a loses response | One public effect; caller has no response | Same missing observation; public effect and record remain |
| b looks up | Bypasses protection | Finds record-a and caches its receipt |
| b responds | Receives effect-b; two public units | Receives effect-a; one public unit |

There are two configured calls and one audited logical operation in either run.
Unprotected: two effects, two units and one extra effect. Atomic: one effect, one unit and
zero extra effects. Both have one missing response and one received receipt. The atomic
run's server replay count is one. These are Java model results, not a production benchmark.

## Explore in the playground

1. Select the default scenario. Predict the ledger count, then explicitly run it.
2. Step from the initial snapshot through a's lost response. Inspect the public ledger and
   the cached server receipt independently.
3. Change only the protection mode to atomic and run again. Keep the calls and ordered
   steps unchanged. Find b's replayed receipt and its original effect identity.
4. Load split-race, then compare atomic mode. Both calls initially miss. Inspect what each
   save actually does; a losing split save cannot erase its earlier public effect.
5. Try retention-boundary: a publishes at 0 ms, b looks up at 99 ms and c at 100 ms.
   b replays; c publishes again at expiry equality. The earlier effect still exists.
6. Edit a tenant, key, payload or valid terminal action. Make a prediction, run explicitly,
   and use the returned explanation rather than guessing from colors.

Moving a step changes authored order; it does not repair the per-call program or reorder
its time automatically. Fix invalid programs before running. Editing inputs preserves the
previous run with a changed-input notice; it does not make that result evidence for the edit.

### Learn it one checkpoint at a time

In **Guided**, predict a single boundary before revealing its Java evidence. A lost
response can leave a public effect; a losing split save can leave its earlier write;
an atomic save can discard private work and reuse the original receipt. The selected
snapshot shows only that step. The caller may still be waiting even when the server
already has a result. Explain those facts before choosing the tradeoff.

Use **Architecture** to inspect who owns the key, private work, ledger and caller
observation. In **Call sequence**, manually compare a protected lost response, a split
race and the same race with atomic publication. These are labeled authored illustrations,
verified against the corresponding Java programs. Playground edits do not change them.

## Failures and tradeoffs

A tempting explanation is: “The second split save failed, so there was no duplicate write.”
In split-race the second effect was already public. Inspect the ledger as well as the error.
Another is: “A lost response means the write failed.” The default demonstrates the opposite.

- A lookup miss can become stale before publication. Recheck at the protected boundary.
- A stable key can recognize retries, while a fresh key can represent fresh work. Reusing
  one key for two legitimate intents with equal units can replay when the caller wanted a
  second effect; audit labels do not override server lookup.
- Retention bounds stored history in real systems, but also bounds recognition of late
  retries. The 100 ms scenario is an illustrative choice, not a recommended retention.
- A different payload under a live key is rejected here. The selected service contract must
  define what parameters are compared and which responses can be retained.
- Joint publication protects this local effect/result boundary. An external provider call
  needs its own contract and recovery design; this model cannot extend its guarantee there.

Handler crash clears private work and its cached receipt. Public rows stay by an explicit
model rule. This does not demonstrate physical crash persistence, SQL rollback or recovery.

## In a real project

For a repeated order-creation request, first define one intent, the authenticated key scope,
which parameters identify its meaning, and how the original result can be recovered. Place
local state changes and retained result within a boundary your actual storage supports.
Then decide how long callers may retry and what happens after the key is forgotten.

Choose the response contract too. Returning the retained receipt suits callers that need
transparent retries. Another valid contract can report that a resource already exists and
ask the caller to inspect it using a stable identity. That may suit callers that already
reconcile resources, but adds a caller branch and does not promise original-receipt replay.
AWS discusses this distinction. The Playground executes its own three publication modes;
it does not implement that alternative response contract.

Useful investigation evidence includes the scoped key, caller attempt identity, original
receipt identity, publication evidence and retention policy. Avoid logging personal payloads
unnecessarily. A repeated request counter alone cannot show whether effects repeated.

AWS discusses explicit request identity, equivalent results and atomic token/mutation
recording. Stripe illustrates why retention, parameter checking and response behavior are
service-specific; its API v1 and API v2 policies differ. Neither service is emulated here.

## Interview practice

Build a roughly two-minute explanation around this sequence:

1. State the ambiguity: the write may have completed even though its response was lost.
2. Define a stable key scoped to the caller and operation boundary, plus payload comparison.
3. Trace the first publication and retained receipt, then a retry returning that receipt.
4. Explain the crash/race gap in separate writes and the current-key recheck at publication.
5. State the retention and external-effect limits, and name the real recovery evidence needed.

Changed condition: two different intents have identical payloads. Explain why hashing only
that payload cannot identify their intent. Changed condition: a retry arrives after retention.
Explain which old evidence still exists and what the API can promise now.

## Teach it back

**Teammate prompt:** “The caller reports failure, but the ledger changed. Explain how you
would investigate before retrying and which atomic boundary would protect the next attempt.”

**Transfer exercise:** A report request sends an external email after recording a local row.
Does making the local row and key atomic prove the email is sent only once? Explain the
remaining boundary and what provider/reconciliation evidence you would need.

Self-check: identify the ambiguity, use an actual snapshot and receipt ID, explain the
mechanism, state key/payload/retention assumptions, and give one failure or alternative.
A reference reveal or saved answer is not a grade or proof of mastery.

## Further reading

- [AWS: Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
- [Stripe: Idempotent requests](https://docs.stripe.com/api/idempotent_requests)

The endpoint, numbers, modes, complete action grammar and teaching diagrams are original
illustrative choices. This model has no actual network, database, payment, broker, automatic
retry, cancellation, physical durability or universal exactly-once guarantee.
