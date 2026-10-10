# 0017: Resume recorded learning activities

## Context

HLD-08 saves Practice, Guided and workshop answers in one bounded, versioned browser store.
Learners can revisit those answers, but home offers no route back to the actual question,
checkpoint or stage. Page visits are not completion evidence. URL Shortener remains draft.

## Decision

Derive Continue learning from existing meaningful answer records: nonempty text, a recorded
choice, or an explicitly viewed reference. Ignore empty unrevealed fields. Select the latest
record per module by recorded UTC timestamp, then stable ID for ties. A selector exposes the
other saved modules; no completion counts or mastery claims are produced.

Ask Java for the selected topic detail. Only an actual 404 permits a case-detail lookup,
because the existing saved-answer schema does not store a module kind. Match activity IDs
against current authored questions, checkpoints, stages and rubric criteria. Do not maintain
another topic/stage list or derive destinations from guessed string prefixes. Fetch one
selected resource, ignore superseded responses, and expose pending/error/retry states.

Resume Practice with `?view=practice&question=<authored-id>`, Guided with
`?view=guided&checkpoint=<authored-id>`, and workshops with the existing `?stage=` contract.
The shared shell supplies the two topic activity selectors to their actual consumers. A resumed
question/checkpoint receives keyboard focus without an animated scroll. Checkpoint selections
are history entries and survive refresh; switching tabs retains their selected checkpoint.

A removed activity links to its current module with a clear notice. A removed module has no
invented route, and remains available in backups. Earlier content versions stay untouched and
require fresh review. An existing saved draft can reopen its explicit draft route, with a draft
label; this is personal saved-work navigation and does not publish it in catalogs or search.

Reuse the existing answer backup/import/reset controls on home. Session-only storage warnings
remain visible when backup tools are collapsed. Confirmed reset restores focus to the remaining
saved-work heading or the foundation section if the last saved module is removed.

## Alternatives

- Save every visited URL: simpler, but creates visit telemetry and cannot distinguish recorded
  reasoning from passive navigation; it also admits stale and unsupported routes.
- Extend the answer envelope with last-view state: unnecessary for this slice; existing stable
  answer IDs already name all three authored consumers.
- Frontend module/stage registry: duplicates the Java-delivered catalog and authored content.

## Consequences and migration

No storage, content, OpenAPI or model-version migration. Existing backups work unchanged.
Only module IDs are used in GET requests; answer text is not sent to the server, URLs or analytics.
No Java run, trace or playground input is restored automatically. Timestamp ordering is a
navigation convenience, not a record of learner proficiency or elapsed study time.

The latest recorded activity can differ from the last page visited. Bookmarks, a first-path
view and explicit completed-activity evidence remain independent work. Manual newcomer and
screen-reader publication gates remain open.

## Verification

Resolver fixtures cover every authored workshop stage and criterion, exact question/checkpoint
links, missing capabilities, removed activity IDs and version mismatches. Component checks cover
empty/loading/retry/stale-response/session-only/corrupt-storage states and preserved data. Real
Java browser journeys cover question focus, draft-stage resume, checkpoint reload/history with
zero automatic run POSTs, backup/reset, removed content and 320/768/1440 layouts in both themes.
Executed results are recorded in [HLD-10B](../work-items/HLD-10B.md) and its contribution PR.
