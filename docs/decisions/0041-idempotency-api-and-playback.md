# 0041: Idempotency transport and snapshot playback

Date: 2026-11-19. Status: accepted for the HLD-19B draft integration.

## Context

The pure Java foundation already defines effect/result publication, receipt identity and
finite action order. Learners need to edit those inputs and inspect the evidence without
introducing a second state machine or implying that a local rule protects remote effects.

## Decision

Register one explicit draft at `/draft/topics/idempotency` with Playground, Study and
Practice. Add strict descriptor/run endpoints under `/api/v1/simulations/idempotency` using
existing whole-request, whole-response and shared admission guards. Derive descriptor limits
from Java constants and presets from the existing pure model. Export canonical schemas into
HTTP 1.13 and generated types; lazy client checks cover shape and static identity/history
consistency. Capture input before asynchronous schema loading.

React selects initialState or one actual postState. Preserve equal-time steps independently.
Private units, public effects, retained history and caller observations have separate labels.
Final metrics describe the whole completed program, not the selected prefix. Expiry occurs
only in returned Java actions; browser playback timers change presentation only.

## Alternatives

A frontend reproduction would drift from the Java model. Publishing only static results
would prevent meaningful input changes. Adding empty Guided/design tabs would overstate
coverage. Reusing retry attempts or broker identities would merge distinct model boundaries.

## Consequences

One canonical catalog row advertises only supported capabilities. Shared answer persistence
works without storing traces or adding automatic POSTs. Explicit retry retains editable input;
changed inputs preserve clearly labeled old results. No new service, library or database is
required. The draft increases learning coverage but does not close publication reviews.

## Migration

This is additive HTTP 1.13.0. Existing inputs, model/schema versions, golden pairs, routes,
checkpoint selector families, answer envelopes and published topics remain compatible.

## Verification

HLD-19B records actual API, contract, UI, browser, accessibility and copied-runtime evidence.
Required final-source CI must pass before squash delivery. Human and hosted review remain
independent of local automation and preview build status.
