# 0018: Keep module bookmarks separate from answer evidence

## Context

HLD-08 saves authored answers and reference-view state. HLD-10B resumes that reasoning.
A learner also needs to save a concept before answering it. A bookmark is a navigation
reference; treating it as an answer would create misleading Continue learning or completion evidence.

## Decision

Use a separate `hld-bookmarks-v1` browser key and strict JSON envelope: app `hld-with-ui`,
kind `bookmarks`, schema version 1, and at most 100 references/64 KiB. Each reference has a
semantic module ID, catalog kind, content version and UTC save timestamp. Titles, publication,
capabilities and destinations come from current Java-delivered catalog collections, not the backup.

The shared module shell offers a pressed Save module button for published entries. Drafts have
no bookmark control. Home shows the actual bookmark count; a lazy `/bookmarks` reading list
checks topic and case collections independently. One failed collection does not hide a module
validated by the other. Pending/error/unpublished references have no guessed route. Updated
content is labeled for fresh review. Importing a draft reference cannot publish or link that draft.

Bookmark backups are separate from answer backups. A strict import previews new IDs and
retained existing saves before applying. Duplicate IDs, extra fields, malformed timestamps,
unknown versions and oversized/over-count data are rejected. Existing save metadata wins;
bookmarks have no authored text needing a conflict editor. Previews belong to their creating
store and revision; changed, forged or reused previews cannot apply. Observed changes from
another tab prevent import or durable replacement; this is not cross-tab synchronization or
an atomic browser-storage transaction.

Reads and visits never write. An explicit save/remove/clear/import can remain in session memory
when durable storage fails, with an outer warning and download option. Corrupt/unsupported
previous bytes remain untouched and downloadable; retry cannot silently replace them. Reset
requires confirmation and affects only bookmarks. Removing a row or clearing the list focuses
the stable heading; applying/canceling a preview returns focus to the file control.

## Alternatives

- Encode bookmarks as Practice choices: mixes navigation with authored learning evidence.
- Migrate the answer envelope to a combined version: couples a small navigation feature to
  existing answer import/recovery contracts and requires every old backup to migrate.
- Store titles/routes in a bookmark: duplicates catalog metadata and trusts stale destinations.

## Consequences and migration

No answer-envelope, content, Java model or API migration. Old answer backups remain valid.
Learners download answer and bookmark backups separately; neither is described as the other's
full backup. No personal answer text, visit telemetry or mastery score is added. Bookmarks save
whole modules; actual saved question/checkpoint/stage resume stays in HLD-10B. The first learning
path and explicit completion evidence remain independent work.

## Verification

Bounded store fixtures cover restore, strict validation, metadata merge, stale/forged previews,
count/UTF-8 byte limits, quota/denied reads, corrupt data, retry and observed external writes.
Component/browser flows check pressed state, public-only destinations, partial catalog failure,
answer preservation, backup/import/reset and keyboard focus. Executed results and visual evidence
belong in [HLD-10C](../work-items/HLD-10C.md) and its PR; manual publication review is unchanged.
