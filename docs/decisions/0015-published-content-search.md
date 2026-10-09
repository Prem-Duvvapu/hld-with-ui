# 0015: Search packaged public content in Java

Status: accepted — 2026-10-09

## Context

The learner needs to find an explanation such as stale reads or token buckets without knowing the module title. HLD-10 requires public-content search, stable routes and readable excerpts. Manual URL-shortener publication gates remain open; search can be completed independently using existing published lessons.

## Decision

- Build a small in-memory document list at Java startup from the canonical catalog: published topic lessons and published workshop stages, including stage prompts, references, rubric and walkthrough narrative. Do not index drafts, planned entries, source URLs as separate documents or learner answers.
- Add `GET /api/v1/search` and versioned typed response/hit contracts. A hit carries catalog metadata, an optional stage ID/title, a stable internal route and plain excerpt.
- Bound text to 100 UTF-16 code units and results to 20 pages, with the total match count. Blank text returns no matches; other text needs at least two units. Validate level/capability and reject unknown/repeated query parameters. Normalize compatibility forms/case for literal matching; every whitespace-separated term must occur. Rank title before summary before body, then canonical order/ID and authored stage order.
- Keep excerpts within 222 Unicode code points, preserving surrogate pairs and trimming nearby word boundaries. Formatting is a plain snippet transformation, not Markdown execution or a claim to reproduce the full lesson. React renders excerpts as text.
- Add a lazy search route and header link. Use explicit form submission, level/activity filters, clear, announced loading/count/error/no-result states, and normal keyboard links. Preserve criteria through URL refresh/history; preserve form focus and refuse outdated responses. Edits show which submitted result remains visible until applied.

## Alternatives

- An external search service: unjustified for the current packaged catalog and adds infrastructure.
- A frontend content copy: duplicates public data and can drift from publication/capability state.
- Title-only search: misses useful terminology inside explanations.
- Fuzzy or AI search: adds complexity before a concrete need; the literal matching rule is visible to learners.
- Include draft workshops: would bypass explicit publication/review boundaries.

## Consequences and migration

Existing topic/case/simulation and saved-answer contracts remain compatible. The Java artifact must include the new endpoint before a deployed frontend search is exercised. An older backend yields a recoverable search error, with ordinary module navigation available. No dependency, service, account, AI tutor, progress score or publication change is introduced. Bookmarks/resume remain separate HLD-10 work.

## Verification

Require semantic Java fixtures for ranking, all-term/level/capability filtering, result limits/counts/order, Unicode/literal punctuation and future published-stage links. Real packaged-API/browser evidence must validate the response and draft exclusion, primary keyboard/history flow, loading/error/empty/validation recovery, and three widths × two themes with reduced motion. Visual review supplements assertions and retains real screen-reader/newcomer gates. Record executed evidence in [HLD-10A](../work-items/HLD-10A.md).
