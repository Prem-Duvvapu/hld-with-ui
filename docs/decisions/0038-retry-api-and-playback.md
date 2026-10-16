# 0038 — Deliver retry evidence without recreating policy in React

Date: 2026-10-16. Status: accepted for HLD-18B draft integration.

## Context

The pure retry foundation separates caller waiting from accepted work. An interactive
experience must preserve that separation through strict transport, validation and playback.
A caller failure is a legal model outcome; an API resource failure is a different boundary.

## Decision

Register the unchanged simulator through a small framework configuration and strict byte-input
controller. Derive thirteen descriptor limits from model constants and reuse the eight pure
presets. Keep unknown/null/coerced/duplicate/trailing JSON rejection before execution, existing
shared request/admission guards and whole-response serialization. Valid caller failure returns
completed simulation evidence; oversized output returns 422 without a partial replacement.

Export canonical input/result schemas into additive HTTP 1.11.0 and generated TypeScript.
Generate only the descriptor's reachable five definitions for lazy validation. Capture input
before the first asynchronous yield. Check shapes, identities, reported-history retention and
final-state equality in the client; Java owns scheduling, random draws, counts and ratios.

Register one draft topic only with actual Playground, Study and Practice. The React workbench
renders returned snapshots and selected event explanations. Caller state and server-work state
remain independently visible; complete metrics never masquerade as a selected-prefix verdict.
No existing Guided selector family is widened until the separate authored contribution needs it.

## Alternatives

Direct POJO binding could hide coercion or missing primitive defaults. Registering metadata
before API/renderer/content agreement would advertise an unavailable module. Recomputing state
or policy in React would create conflicting authorities. Reusing broker ACK/lease language
would confuse caller response ownership with message delivery. None serves this learning outcome.

## Consequences and migration

Existing model/schema versions and goldens remain unchanged. There are still four published
modules. The new draft needs its own human/hosted/prerequisite/publication gates and later
Guided/design contribution. The finite batch budget does not emulate a replenishing bucket,
rolling retry ratio or SDK. Accepted work is not a persisted business effect.

## Verification

[HLD-18B](../work-items/HLD-18B.md) records actual API/contract/client/UI/browser/runtime gates
and final CI/delivery evidence. The [retry plan](../TIMEOUTS_RETRIES_IMPLEMENTATION_PLAN.md)
defines model assumptions, replay boundaries and subsequent contributions. An actual configured
GET descriptor example is authored only by the explicit root invocation; ordinary verification
compares it without rewriting.
