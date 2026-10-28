# 0040 — Model idempotency at the effect and saved-result boundary

## Context

The queue model shows duplicate effects after missing acknowledgments. The retry model
separates caller waiting from accepted work. Reservation and atomicity teach conditional
acceptance and joint publication, but neither protects repeated effects with retained keys.
The next curriculum topic must demonstrate that guarantee and its boundaries concretely.

## Decision

Add a separate pure Java model for one illustrative ledger-add endpoint. Use the same
bounded authored call/step program under no protection, split effect/result writes and atomic
effect/result publication. Atomic publication rechecks the current tenant/key entry in the
same transition as a new effect and saved receipt. Split publication uses insert-if-absent;
its late conflict cannot erase an earlier public effect.

An operation ID groups intended work for audit evidence only. Server recognition uses the
typed tenant/key tuple, and compares units as its small payload. Saved receipts retain the
original effect identity. Virtual-time expiry removes active key protection, preserving
effects and explicitly historical rows. A modeled handler crash clears private work and
cached receipt; it is not a claim about actual disk persistence or process recovery.

## Alternatives

- Reusing the retry completion count as a business-effect count would invent an unmodeled
  guarantee. Adding key protection directly to broker ACK handling would hide the application boundary.
- A prior lookup alone cannot authorize an atomic write: another call can publish first.
- A generic one-effect-per-operation assertion would hide changed-key and expiry cases.
- Real infrastructure would add setup and operational scope before the logical contract is proven.

## Consequences and migration

HLD-19A introduces only pure Java, standalone contracts/examples and tests. Existing models,
HTTP/OpenAPI versions, catalog entries and UI capabilities are unchanged. The exact first
version is frozen in [the handoff](../IDEMPOTENCY_IMPLEMENTATION_PLAN.md); API/renderer and
original lesson/Practice follow as HLD-19B, then Guided/design as HLD-19C. No new service,
paid dependency, database, provider or distributed exactly-once claim is introduced.

## Verification

[HLD-19A](../work-items/HLD-19A.md) records actual checks. Required evidence includes nine
tiny scenarios, mode-only comparisons, both key-conflict boundaries, loss/crash/race,
expiry equality, stable receipt and scoped identities, defensive ownership, exact replay,
concurrent isolation, configured Java serialization and strict standalone schemas. A maximum
fixture measures bytes without proving a universal bound. Publication remains separate.
