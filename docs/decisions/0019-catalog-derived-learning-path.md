# 0019: Resolve the first learning path from packaged catalog and content

## Context

Search, bookmarks and saved-answer resume work, but a new learner still needs a clear order.
The first-release path is Request Flow → Capacity → Cache-Aside → URL Shortener. The workshop
is draft and must remain outside published discovery until its human/prerequisite gates pass.
Saved answers alone cannot establish completion or mastery.

## Decision

Author bounded module references/purposes in `content/learning-paths.json`, validated with a
closed version-1 schema. Java repeats uniqueness, bounds, known-reference and prerequisite-order
checks at startup. Resolve published metadata and actual answer identities from CatalogService;
resolve path responses once at startup without per-request mutation. Expose `GET /api/v1/learning-paths/{id}` with generated
React types. Unknown IDs return the existing structured 404.

An unavailable step has its editorial purpose/ID, `available: false`, and no entry/activity
metadata. React renders a clearly unavailable upcoming step with no link. Optional unpublished
references are omitted. This does not change the canonical workshop's draft state or its explicit
route/saved-answer resume. No Java simulation behavior changes.

Java derives Practice question IDs/choice options, Guided prediction/tradeoff identities and
published workshop attempt/revision/rubric identities from their authored resources. Workshop
self-check values remain the existing `yes`/`revisit` UI contract. React checks current version,
activity ID, answer kind and choice membership before counting saved work. Reference views are
shown separately. Earlier/removed/incompatible records remain in the existing answer backup.

Suggest the first available step without a current answer; when all available steps have an
answer, suggest revisiting the first. This is navigation guidance, not assessment or completion.
No page visit writes storage, sends answers to Java, or runs a simulation. Save/recovery/export
remain owned by the existing Practice store and controls.

## Alternatives

- A React-maintained path/catalog would duplicate publication and prerequisite state.
- Sorting the full catalog would incorrectly place optional Rate Limiter within the first path.
- Publishing the draft to fill the last slot would bypass release checks.
- Inferring completion from answers or visits would conflate engagement and learning evidence.

## Consequences and migration

No stored format changes, new dependencies or services. Home's new-visitor Start learning opens
the path; saved-work Continue learning keeps its current action. The path also has a persistent
home link. An older/unavailable deployed Java endpoint shows an explicit error/404 rather than
a guessed path. Backend deployment freshness remains a separate open operational issue.

Explicit completion, return/next navigation inside module pages, and first-release human reviews
remain separate contributions. The public path currently has three available core steps and one
unavailable workshop slot; Rate Limiter is optional depth.

## Verification

Java tests check canonical order/identities, publication transitions, unknown paths and invalid
bounds/order/references. Content fixtures reject malformed paths. React tests distinguish current
answers, reference-only/older/removed records, storage failure, retry, incompatible responses and
stale route replies. Real-Java browser tests cover the OpenAPI response, home navigation,
refresh/history, actual saved answers/export, unavailable destinations, responsive themes and
keyboard flow. Native zoom extends the existing actual 200% journeys. Execution results live in
[HLD-10D](../work-items/HLD-10D.md) and the contribution PR; manual human review stays open.
