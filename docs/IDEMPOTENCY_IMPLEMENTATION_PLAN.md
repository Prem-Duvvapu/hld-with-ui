# Idempotency implementation plan

Prepared 2026-10-28. This freezes the new model's first version; it is not implementation
or verification evidence. Baseline: PR #80, squash `bdf18dc`, required CI `38946555748` passed.
Follow AGENTS.md and CONTRIBUTING.md. Each contribution starts from updated main.

## 1. Learning outcome

**If a write happened but its response was lost, how can a retry return the same result
without performing another write?** Compare the same calls and action order under three
explicit protection modes. Then change the key, payload, tenant or retention boundary.

Canonical model/curriculum ID `idempotency`; Java package `com.hld.idempotency`.
Schema `1.0`, model `1.0.0`, kind `simulation`, result status `completed`.
Technical prerequisites: `transactions-isolation` and `queues-delivery`; retry teaching is
available separately. Publication requires their independent release gates.

One fixed illustrative endpoint adds positive units to an append-only ledger. This is a
logical state machine, with manually ordered virtual-time actions. It performs no database,
payment, provider, broker, external network or real process crash. It supplies no physical
durability, SQL isolation, automatic retry, cancellation or cross-service exactly-once guarantee.
There is no randomness, so no unused seed control. Identical input/version replays exactly.

## 2. Closed input

`IdempotencyInput(schemaVersion, modelVersion, mode, retentionMs, calls, schedule)`.

| Field | Bounds |
| --- | --- |
| mode | `NO_DEDUP`, `SPLIT_EFFECT_RECORD`, `ATOMIC_EFFECT_RECORD` |
| retentionMs | Integer 1–10000, measured from record publication; replay does not extend it |
| calls | 1–12, configured order retained in snapshots |
| schedule | 2–48 steps, nondecreasing time; equal-time execution follows authored order |
| Every authored ID | Whole ASCII `[a-z][a-z0-9-]{0,31}`, at most 32 characters |

Each call has exactly `id`, `operationId`, `tenantId`, `key`, `units` (integer 1–1000).
Call IDs are unique. `(tenantId, operationId)` is an audit label for intended work and must
describe consistent units across its calls. It is **never** used by the server to deduplicate.
The server's lookup identity is the typed tuple `(tenantId, key)` for this single endpoint;
units are the payload comparison. Two legitimate intents may have identical payloads.

Each step has exactly `id`, `callId`, `timeMs` (integer 0–10000) and `action`.
Step IDs are globally unique and references resolve to configured calls. Reject nulls,
unknown versions/enums/fields, invalid bounds, reordered times and malformed programs.
All programs are validated before executing any state change. Do not sort or repair input.

Every call follows `LOOKUP → WRITE_EFFECT → SAVE_RESULT → RESPOND | LOSE_RESPONSE`,
or ends with `CRASH_HANDLER` after LOOKUP, WRITE_EFFECT or SAVE_RESULT. A crash directly
after LOOKUP is a two-step program. Every configured call must end; no actions follow its
terminal action. This grammar is the same in all modes. A cached replay/conflict can skip
business actions, but its structural WRITE_EFFECT and SAVE_RESULT steps still advance the
program and report `ACTION_SKIPPED` explicitly. One outcome per authored step.

## 3. Authoritative transitions

Before **each** step, mark previously ACTIVE key records EXPIRED when
`timeMs >= expiresAtMs`. Never remove their associated ledger effects. Historical expired
rows remain only as teaching evidence; they do not participate in server lookup. No timer
or future cleanup extends the final observation time.

### LOOKUP

- NO_DEDUP bypasses the key store (`LOOKUP_BYPASSED`).
- Other modes inspect the current active scoped key. Missing gives `LOOKUP_MISSED`.
- Same units gives `LOOKUP_REPLAYED`, caches the original receipt and sets resolution REPLAYED.
- Different units gives `LOOKUP_CONFLICT`, no receipt and resolution PAYLOAD_CONFLICT.
- A lookup miss is an observation, never authority to publish a later protected effect.

### WRITE_EFFECT

For a cached replay/conflict, skip without new work. Otherwise NO_DEDUP and SPLIT append
one public effect (`EFFECT_PUBLISHED`). ATOMIC prepares units privately
(`EFFECT_PREPARED`) and publishes nothing yet. The later UI must label this difference;
the action name is not a claim that private work is already public.

### SAVE_RESULT

- A cached replay/conflict is skipped; its remembered receipt/decision remains usable even
  if its key expires after LOOKUP. It creates no effect or key entry.
- NO_DEDUP makes a receipt for its published effect, resolution EXECUTED (`RESULT_READY`),
  without retaining a key.
- SPLIT performs insert-if-absent against the **current active** scoped key. If absent, save
  its effect's receipt and set EXECUTED (`RESULT_STORED`). If occupied, set RESULT_SAVE_CONFLICT
  with no receipt (`RESULT_SAVE_CONFLICT`); the already published effect cannot be undone.
  Never overwrite the winning record or claim that this late failure prevented its effect.
- ATOMIC rechecks the **current** active scoped key inside the same indivisible transition
  as publication. If absent, append the prepared effect and its retained receipt together,
  clear private units and set EXECUTED (`ATOMIC_COMMITTED`). If occupied with equal units,
  discard private units and reuse the original receipt, REPLAYED (`REPLAYED_AT_COMMIT`).
  If occupied with different units, discard private units, return no receipt and set
  PAYLOAD_CONFLICT (`CONFLICT_AT_COMMIT`). Never publish a second effect on these branches.

A retained record is created at this SAVE_RESULT time and expires at time + retentionMs.
Derived effect ID is `effect-<callId>`; derived record ID is `record-<callId>` (both at most
39 characters). Each call can publish at most one of each. A receipt contains only original
`effectId` and `units`, so replay never substitutes a new call ID or new effect ID into it.
The current call's identity stays outside the saved receipt.

### Response and crash

RESPOND and LOSE_RESPONSE end the call and emit RESPONSE_RECEIVED / RESPONSE_LOST, whether
the ready result is a receipt or an error. Response loss is a modeled missing observation;
it does not undo any published data. A received error is not a received receipt.

CRASH_HANDLER ends only that call (`HANDLER_CRASHED`), clears its private units and cached
receipt, and leaves public effects/key records unchanged. Retain prior observations,
resolved-record identity, published-effect identity and resolution as **history**, not live
private work. A crash after commit may therefore retain EXECUTED with no cached receipt.
This is an explicit model rule, not proof of real crash persistence.

## 4. Immutable result contract

`IdempotencyResult(simulationId, schemaVersion, modelVersion, kind, status, input,
initialState, outcomes, finalState, metrics, assumptions)`.

Nested records (all list ownership defensive; absent optional facts omitted, known zero retained):

```text
State(calls, effects, keyRecords, publishedUnits, activeKeyCount, expiredKeyCount)
CallState(id, phase, lookupDisposition?, observedRecordId?, resolvedRecordId?, pendingUnits,
          publishedEffectId?, receipt?, resolution?)
Effect(id, callId, operationId, tenantId, units, publishedAtMs)
Receipt(effectId, units)
KeyRecord(id, tenantId, key, units, receipt, createdAtMs, expiresAtMs, status)
Outcome(sequence, stepId, callId, timeMs, action, kind, postState, explanation)
```

State calls retain configured order; effects and records retain publication order.
`observedRecordId` is the record actually found at LOOKUP; `resolvedRecordId` is the record
actually used for replay/conflict/save. A later recheck must not rewrite the earlier observation.
For a newly stored record, resolvedRecordId names it; NO_DEDUP has neither record reference.

| Vocabulary | Values |
| --- | --- |
| Call phase | NOT_STARTED, LOOKED_UP, WORK_DONE, RESULT_READY, RESPONDED, RESPONSE_LOST, CRASHED |
| Lookup disposition | BYPASSED, MISSING, MATCHED, CONFLICT |
| Resolution | EXECUTED, REPLAYED, PAYLOAD_CONFLICT, RESULT_SAVE_CONFLICT |
| Key status | ACTIVE, EXPIRED |
| Outcome kind | LOOKUP_BYPASSED, LOOKUP_MISSED, LOOKUP_REPLAYED, LOOKUP_CONFLICT, EFFECT_PUBLISHED, EFFECT_PREPARED, ACTION_SKIPPED, RESULT_READY, RESULT_STORED, RESULT_SAVE_CONFLICT, ATOMIC_COMMITTED, REPLAYED_AT_COMMIT, CONFLICT_AT_COMMIT, RESPONSE_RECEIVED, RESPONSE_LOST, HANDLER_CRASHED |

Metrics fields:

`calls`, `logicalOperations`, `publishedEffects`, `publishedUnits`, `operationsWithRepeatedEffects`,
`extraEffects`, `activeKeyRecords`, `expiredKeyRecords`, `replayedCalls`, `payloadConflicts`,
`resultSaveConflicts`, `responsesReceived`, `responsesLost`, `crashedCalls`,
`crashedCallsWithEffects`, `receiptsReceived`, `finalTimeMs`.

Logical operation grouping is `(tenantId, operationId)`, for audit counts only.
`extraEffects = sum(max(effectsForOperation - 1, 0))`; expired or changed keys can legitimately
increase it. It is not a universal invariant violation. Replay/conflict counts describe server
resolutions, including later crashed calls; caller response/receipt counts remain separate.
crashedCallsWithEffects counts only that call's own publishedEffectId, not another call's replay.
Final time is the last authored step's time. Initial time has no scheduled expiry or callbacks.

At most 12 public effects, 12 retained/historical records, 48 outcomes and 12000 published
units exist; expiresAtMs is at most 20000. All time arithmetic fits int. Assert structural
references, receipt ownership and at most one active record per scoped key in Java. Do not
invent a blanket one-effect-per-intent guarantee. Measure actual max-boundary serialization
without claiming one fixture proves a universal HTTP byte ceiling.

## 5. Nine canonical scenarios and original tiny fixtures

Unless overridden: retention100 ms, units1, tenant `t`, key `k`, calls `a`,`b` sharing
operation `op`. A full call uses LOOKUP/WRITE_EFFECT/SAVE_RESULT/terminal, all at its stated time.

| Preset ID | Mode and program | Required evidence |
| --- | --- | --- |
| unprotected-response-loss | NO_DEDUP; a full at0 with LOSE_RESPONSE; b full at10 with RESPOND | Two effects, two units, one extra effect, one missing response; b gets its own new receipt |
| split-crash-gap | SPLIT; a LOOKUP/WRITE_EFFECT/CRASH at0; b full RESPOND at10 | Two effects; only b's record; a's effect survives its crash; retry sees a missing key |
| split-race | SPLIT; a/b LOOKUP, a/b WRITE, a/b SAVE at0; a/b RESPOND at1 | Both effects publish; only a's record wins; b has RESULT_SAVE_CONFLICT, no receipt, and its public effect remains |
| atomic-response-loss | Same program as unprotected, ATOMIC | One effect; b replays a's receipt after a's response was lost |
| atomic-race | Same program as split-race, ATOMIC | Both observe missing; b's publication recheck replays a's receipt and discards private work; one effect |
| payload-conflict | ATOMIC; a op-one units1 full RESPOND at0; b op-two units2 same key full at10 | Lookup conflict; one original effect/record unchanged; b's work/save skipped |
| atomic-payload-race | ATOMIC; same race schedule, a op-one units1 / b op-two units2 | Both miss, but b's publication recheck rejects different units with no b effect |
| retention-boundary | ATOMIC; a/b/c same intent/key, full RESPOND at0/99/100 | b replays original; equality expires a's key protection; c publishes again; old effect remains; two records, one expired |
| key-and-tenant-scope | ATOMIC; a(t,op,k) at0, b(t,op,new) at10, c(other,op,k) at20 | Three effects/keys for two audited operations; fresh key adds an effect; another tenant independently uses k |

Default is unprotected-response-loss. These nine cover all sixteen outcome kinds. Author all
nine input/result pairs from the configured Java mapper; they are small compared with stress
traces. Ordinary checks compare without writing. Root alone uses an explicit authoring flag.
Never regenerate old models' goldens. Maximum-boundary output stays in memory/logs.

Also test changing only mode for the crash/race programs, crash after atomic commit, cached
replay crossing expiry after a new record is created, expiry +1/before equality, different
intents with identical payload, ambiguous concatenation-resistant tenant/key tuples, complete
grammar rejection, unknown references, list ownership, exact replay and concurrent run isolation.

## 6. Delivery stages and actual evidence

1. **HLD-19A:** pure Java input/validator/result/simulator/presets, standalone schemas, actual
   examples, semantic/serialization/contract tests, decision and honest roadmap. No endpoint,
   catalog entry, renderer or capability is registered. Record actual local and required CI
   results, squash merge, delete only the owned branch and update main.
2. **HLD-19B:** strict APIs, Java-derived descriptor limits, canonical HTTP/generated/lazy
   contracts, direct draft Playground/Study/Practice. Editable calls and ordered steps with
   keyboard move controls; initial/post-step playback separates private work, ledger, retained
   key history and caller observation. Plain explanations and transfer/interview questions.
   Verify mode-only comparisons, meaningful edits, error/pending/stale/retry, responsive themes,
   keyboard/reduced motion/native zoom and copied runtime.
3. **HLD-19C:** Java-resolved Guided checkpoints, inspectable Architecture and authored manual
   sequences with text equivalents. Preserve shared answer/reset/version/history behavior.
   Then compose Notification Service. Human/hosted/prerequisite/publication reviews remain.

## 7. Primary sources and model choices

Reopened 2026-10-28. Original explanations, constants and traces; no source code/assets copied.

- [AWS: Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
  supports caller-scoped identity, atomic token/mutation boundaries, equivalent results,
  retained parameters and service-dependent retention. This model does not implement AWS APIs.
- [Stripe: Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
  distinguishes API v1 saved-response policy from API v2 recovery behavior. Its key retention
  and parameter rules are examples, not universal defaults or a policy reproduced here.

The fixed endpoint, units-only payload, modes, private preparation, complete program grammar,
exact expiry equality, history snapshots and receipt/error policy are original model choices.
No arbitrary production timeout/retention recommendation or real storage guarantee follows.
