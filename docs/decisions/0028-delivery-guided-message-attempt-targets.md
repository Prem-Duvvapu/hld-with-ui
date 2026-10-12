# Decision 0028: target delivery teaching by message and attempt

Status: accepted for HLD-14C; publication remains pending.

## Context

The delivery model separates a logical message from its attempts, durable records and ACKs.
A checkpoint needs to select the right attempt even when several share a message and event kind.
Existing Guided targets identify a cache operation or capacity job. The model's narration and
array positions are presentation details; neither is a stable authored identity.

## Decision

Add a third closed target family containing `messageId`, `attemptId`, `kind` and `occurrence`.
Both IDs are required together and must agree with model 1.0.0's bounded attempt identity.
Exactly one family is allowed: cache operation, capacity job, or delivery message/attempt pair.
Preserve existing cache/queue JSON and positive occurrence rules; the new delivery family
bounds occurrence to the default 10,000-event ceiling. No new numeric attempt field is added.

Canonical checkpoint schemas drive OpenAPI/generated types. Delivery selector capabilities
are checked against the selected event kind's actual required/non-null rules, so an enqueue
or pure consumer event cannot claim an attempt selector just because the global event schema
has optional message/attempt properties. Java tests run the named preset, resolve the exact
pair/kind/occurrence, reconstruct all prior complete-record changes and verify authored facts.

Reuse the shared Guided answer lifecycle through a delivery adapter. Returned Java data supplies
evidence; missing targets keep explanations unavailable. Saved predictions/choices do not
restore traces after reload. Content version 1.1.0 advertises eight Guided checkpoints alongside
the existing Practice questions. HTTP contract 1.4.0 adds target fields; model/schema remain
1.0.0/1.0. The draft route and published discovery boundary stay unchanged.

Architecture and Message sequence are labeled authored explanations with textual equivalents.
They describe broker/consumer/ledger ownership and three causal paths without invoking Java
or presenting illustration selection as measured behavior. Playground/Guided provide executable
evidence over the same declared model.

## Alternatives

- A message-only target with occurrence can be ambiguous to an author when repeated attempts
  share the same event kind; explicit returned attempt identity makes the intended teaching clearer.
- A numeric attempt selector would introduce a new wire key when the emitted attempt ID already
  identifies the modeled attempt.
- Array indexes or narration parsing would tie content to incidental ordering or wording.
- A separate Guided state machine would duplicate the verified persistence/reset/version guards.

## Consequences

The concrete delivery module now has six authored working views. Eight checkpoints cover eight
presets; the no-recovery preset stays covered by Playground and Practice. There is no claim
that all nine presets have a Guided checkpoint, or that broker confirmation deduplicates effects.
Legacy source/resources and question IDs remain stable. Older answers stay visible and require
fresh review against changed content. No transaction, broker service or provider integration is added.

## Migration

Regenerate canonical checkpoint OpenAPI/types together. Preserve the existing four-argument Java
constructor for cache/job callers and the omitted-null wire shape. Update capabilities/version
and checkpoint content together with the renderer. A future model with different attempt IDs
needs an explicit contract change rather than silently interpreting these identifiers differently.

## Verification

HLD-14C records actual schema negatives/legacy fixtures, Java selector/state/numeric teaching
checks, frontend resolver/lifecycle tests, real Java Guided/browser journeys, both-theme responsive
and keyboard checks, packaged content and final-head CI. Human accessibility/newcomer review and
published prerequisite closure remain separate gates; this decision does not establish them.
