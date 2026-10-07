# 0009: Preview answer imports and keep simulation evidence transient

Status: accepted — 2026-10-07

## Context

HLD-08A saves Practice answers and offers downloads. Learners also need to restore a backup, resolve differences deliberately, and keep Guided predictions across sessions. These actions must preserve existing work and must not make saved text look like a current simulation result or mastery.

## Decision

- Reuse the existing `hld-practice-v1` envelope and schema version 1. Guided activities use `<checkpoint-id>-prediction` and `<checkpoint-id>-tradeoff` under the Java-delivered topic ID/content version. Content validation rejects collisions with Practice question IDs within the same topic.
- Save predictions and tradeoff choices, with reference-view metadata. Keep simulation inputs/results, playback, and selected checkpoint transient. After reload, show saved answers and require an explicit Java run to regenerate evidence. An earlier reveal alone never displays an invented trace or automatically runs Java.
- Shared answer controls provide download, file selection, an import preview, per-conflict choices, module-scoped reset confirmation, and retry after a save failure. Personal answers never enter a request or URL.
- Validate a complete import before mutation: exact schema/fields/types, semantic IDs, content versions, ISO timestamps, duplicates, 4,000-character explanations, 200 records, and 256 KiB UTF-8. Unknown/removed activity records are retained for backups, while learning panels render only currently delivered activities.
- Preserve nonempty local answers by default. For the same content version, empty local answers can accept incoming answers, and identical answers can merge reference-view evidence. Different-version matches are explicit conflicts; never silently transfer current review to another content version. Each conflicting imported answer requires a deliberate choice.
- The preview contains copies; an internal store-bound plan owns the actual merge. Applying a forged, modified, stale, or different-store preview cannot replace data. Reject a preview after local edits or intervening storage changes. Revalidate the chosen merged document and write durably before updating accepted state.
- Import and reset failures leave existing memory/disk answers unchanged and report failure. Retry saving may persist accepted session answers once access/quota recovers; unknown/corrupt original data stays read-only. Cross-tab comparison detects intervening writes, not simultaneous atomic transactions.
- Reset requires a named module confirmation. The backup tools also offer a selector derived from saved topic IDs, so learners can remove a retired module that occupies the record limit without clearing other modules. It deletes only that module's Practice and Guided records, preserving other modules and preferences. A successful reset increments a session epoch so a previously pending Java response cannot recreate deleted Guided answers. Cached run data remains transient and is never serialized.
- Keep accepted session data within export/import bounds. Refuse an edit that exceeds the document limit with a visible message and preserve the previous accepted answer; download/reset can free space. Access/quota failures still retain bounded new edits in memory.

## Alternatives

- Replace all answers on import: risks losing a newer local explanation.
- Infer completion from references or imported text: cannot demonstrate learning or current correctness.
- Store simulation traces with answers: adds size/version/replay complexity and risks presenting stale evidence.
- Clear the entire browser key from a module button: violates the stated reset scope and could discard unrelated module work.

## Consequences and migration

Existing HLD-08A exports import without a schema migration. No Java/API/model contract changes. Guided identity derives from authored checkpoint IDs; ID changes require a future explicit migration instead of guesswork. Workshop drafts and progress remain future consumers. Unsupported schema versions are not replaced automatically; download the original and resolve compatibility before retrying.

## Verification

Storage tests cover merge rules, stale/tampered previews, transactional failures, bounds, retry and reset epochs. Guided tests cover restoration without auto-run, edits during a run, and a reset before the response returns. Real-Java browser journeys cover backup round trips, choices, rejection cases, scope, recovery, and responsive keyboard interactions. Results are recorded in [HLD-08B](../work-items/HLD-08B.md).
