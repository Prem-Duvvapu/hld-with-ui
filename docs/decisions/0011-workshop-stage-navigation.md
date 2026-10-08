# 0011: Navigate authored workshop stages by stable URL

Status: accepted — 2026-10-08

## Context

The URL-shortener workshop now has three concrete stages. Rendering every attempt, reference, rubric, and revision together produces a long page and makes returning to one decision difficult. The existing topic shell already treats view selection as URL presentation state and keeps learning answers separately in the bounded local store.

## Decision

- Derive ordered stage navigation exclusively from the Java-delivered workshop resource. Stable `?stage=<id>` URLs select an authored stage; no numeric indexes or duplicate stage catalog belong in URLs.
- Show one stage at a time, with its ordinal, authored total, previous/next actions, and a visible current-stage indicator. The draft notice continues to distinguish authored stages from the full unpublished journey.
- Preserve browser history and direct refresh. Missing/unsupported stage selection uses the first authored stage. It never selects planned content or creates completion evidence.
- Keep attempt/revision/rubric records in the existing case/activity/version namespace. Stage selection carries no personal text. Reference reveal remains stage-local; scoped reset invalidates review state as before.
- Focus after the router has committed the selected panel; an animation frame alone can race navigation. Initial deep links and browser history do not trigger explicit-action focus. Use native keyboard-accessible stage buttons with `aria-current="step"`, meaningful heading focus for explicit navigation, semantic tokens, and mobile layouts. Keep stage panels mounted under hidden wrappers so a session-only reference reveal survives stage changes when a full store blocks a new record. Reduced motion does not remove any operation.
- Bump the material authored content to 1.1.0 without a storage-schema migration. Preserve previous answers and require current-version comparison/self-checks rather than silently renewing review.

## Alternatives

- Render all stages at once: viable for a one-stage draft, increasingly hard to read and revisit as the journey grows.
- Store a separate stage index in local storage: introduces an additional migration and a conflict with shareable URLs without a concrete need.
- Interpret reference views or stage visits as completion: would claim learning evidence the application does not have.

## Consequences and migration

Existing `/case-studies/url-shortener` links still open Requirements. Stage-specific links can be shared without sharing notes. Existing answer exports remain compatible. The workshop stays draft and outside published discovery; a full design, case discovery, manual accessibility checks, and learning validation are still required.

## Verification

Record actual stage isolation, original/revision persistence, direct URLs, refresh/history, reset/full-storage behavior, keyboard focus, responsive/theme, and real-Java API results in [HLD-09B1](../work-items/HLD-09B1.md). A passing local artifact does not close [the hosted backend incident](../INCIDENTS.md).
