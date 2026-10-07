# 0008: Save practice answers locally with explicit recovery

Status: accepted — 2026-10-07

## Context

Practice answers survive tab changes, but a route change or reload discards them. Learners need to compare and revise their explanations over multiple sessions. HLD-08 starts with one real consumer before adding workshop drafts, guided predictions, or progress tracking. Anonymous learning does not require a database or account.

## Decision

- The shared Practice view saves choices, explanations, and whether a reference was revealed. All four pages pass their Java-delivered topic ID and content version; no second topic catalog is introduced.
- `practiceStorage.ts` owns browser storage. A session store and `useSyncExternalStore` keep presentation and storage separate, including across route changes when persistence is unavailable.
- The `hld-practice-v1` key holds `{app: "hld-with-ui", schemaVersion: 1, answers: [...]}`. Each record has stable `topicId`/`activityId`, `contentVersion`, an ISO `updatedAt`, a discriminated text/choice answer, and `referenceViewed`. A reference viewed with empty text is not a written attempt. No completion or mastery is inferred.
- Validate exact fields, types, unique activity identities, timestamps, IDs, and bounds: 4,000 characters per explanation, 200 stored records, and 256 KiB of UTF-8 JSON. Empty text is valid. Do not store simulation inputs or traces.
- Load never writes. Retain records for removed activities; expose only activities in the current delivered questions. Older answers remain visible, with an explicit notice. Previous reference/choice feedback is not current until the learner edits, chooses, or explicitly compares again.
- Unsupported, corrupt, duplicate, or oversized saved documents are kept untouched. Access/write failures keep new work in session memory, show a warning, and allow downloading answers. When readable, the previous raw document can also be downloaded byte-for-byte. Automatic retry, import, conflict resolution, and reset are HLD-08B.
- Before each write, reread storage. Merge another tab's changes to other activities; refuse to overwrite a changed answer for the same activity and offer downloads. This detects intervening writes; it is not a transactional cross-tab synchronization protocol. Other tabs do not update live.
- Answers remain in this browser and explicitly downloaded files. No answer enters a URL, API call, analytics event, or server log.

## Alternatives

- Per-question storage calls: would duplicate schema and failure handling in presentation components.
- Save only on unmount: would lose work on abrupt reload or navigation.
- Server persistence: adds account, authorization, and deployment requirements before a demonstrated need.
- Silently replace invalid data with an empty document: risks losing a learner's only copy and prevents recovery.

## Consequences and migration

This is the first durable answer schema; there is no older app answer schema to migrate. Future compatible migrations must validate before replacing data; unknown versions remain read-only. Preferences use separate keys and are unaffected. Practice now survives refresh; playground runs and Guided predictions still live in component memory. Downloads are backups, with import planned in HLD-08B.

## Verification

Storage tests exercise no-write load, Unicode, preserved IDs/versions, strict validation, quota/access failure, and intervening cross-tab changes. Practice tests cover revision, reference reveal without an attempt, repeat choices, older-version review, and memory fallback. Browser checks exercise real Java-delivered questions, reload and routes, downloads, unavailable/corrupt/unsupported storage, mobile themes, keyboard focus, and reduced motion. Actual results are recorded in [HLD-08A](../work-items/HLD-08A.md).
