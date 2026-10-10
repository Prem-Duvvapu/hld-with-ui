# Decision 0020: Record reading and exact-answer practice reviews explicitly

## Context

HLD-10D shows current saved answers and reference views, but neither establishes completion.
The first-release blueprint separates reading from attempted predictions, transfer reasoning
and design decisions. Personal reasoning remains local; Java already supplies the canonical
published identities, content versions and valid activity/option IDs for a learning path.

## Decision

Add explicit self-reported progress controls to available steps in the path. A learner chooses
“I've read this lesson” independently of “Mark saved answers reviewed.” The latter records only
nonblank text or a valid selected option for a current authored activity. It asks the learner
to compare and explain their reasoning; it does not grade free text or certify correct answers,
completed modules, a completed path or mastery. Reference-only records never count as attempts.

Keep `hld-completion-v1` separate from `hld-practice-v1` and bookmarks. Its closed envelope is
`{app: "hld-with-ui", kind: "completion", schemaVersion: 1, records}`. At most 200 records and
256 KiB of UTF-8 JSON are accepted. Reading records contain kind, moduleId, contentVersion and
updatedAt. Practice records also contain an exact copy of the reviewed PracticeAnswer.
Reading identity is module/kind; review identity is module/kind/activity. Explicit re-review
replaces the corresponding mark. No visit, answer save, reference reveal or Java run writes marks.

A reading mark counts only for the current published version. A review additionally requires a
current authored ID/kind/choice and an exact match of the working answer's value, timestamp and
reference state. Changed or removed answers, earlier versions, drafts and unavailable modules
cannot produce current review counts. This is conservative evidence matching, not assessment.
A snapshot is used rather than a timestamp alone so edits within the same millisecond invalidate
reviews. Clearing an answer makes its retained review stop counting; it does not delete the backup.

The path shows available steps, saved-answer engagement, lessons explicitly marked read and
answers explicitly marked reviewed separately. It offers controls only on published core steps;
optional Rate Limiter and the draft workshop are outside this first contribution's mark controls.

## Storage and recovery

- Denied writes retain new marks in session memory with a visible warning and download/retry.
- Malformed/unsupported raw data is preserved and cannot be overwritten. Session marks and the
  previous bytes can be downloaded separately; resolving unsupported data remains an explicit
  recovery task, as with the existing answer store.
- Another-tab changes block durable writes; local session evidence and remote bytes are preserved.
- Imports validate a strict envelope, semantic IDs, ISO times, versions, matching answer identities,
  nonempty evidence, uniqueness and both bounds. Previews are private and revision/raw-byte bound.
- Import is **explicit full replacement**, not merging. The preview names incoming/current counts
  and that marks for other modules will also be replaced. It offers Download and Keep current marks.
  Cancel, stale/forged previews and failed writes preserve current marks. Answers and bookmarks
  are never changed; importing marks alone does not restore working answers or make reviews count.
- Module clear has its own confirmation, preserves other modules and restores stable focus.

## Alternatives

- Automatically marking visits or references would mistake engagement for completion.
- Adding completion fields to answer schema v1 would require a migration and could silently alter
  working-answer imports and conflict semantics. A separate evidence envelope preserves compatibility.
- Timestamp-only review anchors cannot distinguish two different answers saved in the same millisecond.
- A general storage abstraction is unnecessary for this bounded evidence format. Existing Practice
  validation is reused for snapshots; a later concrete need can justify broader extraction.
- Merging completion imports requires conflict decisions and tombstones. Explicit replacement is
  a smaller understandable first policy with a clear preview and existing-data safeguards.

## Consequences and migration

No answer/bookmark migration, dependencies, services or Java behavioral change. Completion backups
contain reviewed answer copies and should be treated like answer backups. Keep both backups when
moving browsers; restored marks count only after matching working answers are also present.
Historical/unavailable evidence remains downloadable without guessed destinations. Page-level
controls, optional-depth tracking and an evidence-backed definition of whole-path completion can
be added later; this contribution makes no such whole-path claim. Human learning/screen-reader
review and backend deployment freshness remain independent release gates.

## Verification

[HLD-10E](../work-items/HLD-10E.md) records actual checks. Unit tests verify explicit actions,
exact-value/same-millisecond invalidation, current-version/publication boundaries, scoped clear,
UTF-8/record bounds, denied/quota/corrupt storage, other tabs, import privacy/staleness and failures.
Real-Java browser journeys cover keyboard marks, reload, backup replacement, exact answer-byte
preservation, edits, session-only downloads, both themes/widths and actual 200% zoom.
