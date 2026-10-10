# Delivery incidents

## 2026-10-08: Hosted backend serves older content

**Status:** open; detected after PR #42 and reproduced before HLD-09B1.

### Symptom and evidence

- Both `https://hld-backend.onrender.com/api/v1/health` and the Vercel API proxy returned 200.
- Both `/api/v1/case-studies/url-shortener` endpoints returned 500, although the endpoint passed against the packaged local Java artifact and in PR #42 CI.
- Hosted `/api/v1/topics` returned content version 1.0.0 for all four modules. The current canonical catalog contains 1.1.0 for those modules.
- The Vercel frontend deployed PR #42 successfully. Frontend deployment status therefore does not establish backend freshness.

### 2026-10-09 recheck

Before HLD-09B2 delivery, both the Vercel-proxied topics and URL-shortener case requests timed out after 15 seconds each. This establishes neither backend freshness nor recovery; it does not prove the earlier artifact is still deployed. The incident remains open pending a deployed-commit/log check and successful version/case responses.

### 2026-10-10 recheck

During HLD-10D delivery, the Vercel-proxied topics, URL-shortener case and learning-path requests
each timed out after 15 seconds. The new path endpoint was not yet merged at this check, and
these timeouts establish neither its deployment nor backend recovery. The incident stays open;
the successful local/CI artifact and Vercel frontend build remain separate evidence.

### 2026-10-10 warmed runtime verification

HLD-11B rechecked both origins between 13:02:44 and 13:03:44 UTC. Health, topics,
URL-shortener and first-path requests initially timed out after 30 seconds with no HTTP
status/body. A single direct health retry at 13:04:27 returned 200 in 0.727 seconds.
After warming, both direct Render and the Vercel API proxy gave these results:

| Endpoint/check | Observed | Current canonical expectation |
| --- | --- | --- |
| Health | 200, ready / hld-with-ui | Same; health alone does not identify artifact |
| Published topics | 200, all four content versions 1.0.0 | All four 1.1.0 |
| URL-shortener case | 500 `internal_error` | 200, content 1.5.0, ten draft stages |
| First learning path | 500 `internal_error` | 200, available core steps and unavailable draft step |
| Unknown case | 500 `internal_error` | Structured 404 |

Direct capability probes at 13:06:19–27 UTC further establish old behavior:

- Request-flow descriptor 1.1.0 (current 1.1.1), cache descriptor 1.0.0 (current 1.0.1).
- Tiny descriptor-preset flow/cache runs return 400 `invalid_input` with missing
  `L64X128MixRandom`. Current `SeededRandom` already uses `SplittableRandom`; repeating
  that fix would not update the deployed artifact.
- Limiter 1.0.0 baseline works: 8 total, 5 allowed, 3 rejected, 16 events. Capacity baseline
  works with estimated outputs. Matching one model does not establish all-model freshness.
- A 262,145-space raw run POST returns 400, while current default HLD-11A guards return
  413 `request_too_large`. Hosted limit configuration remains unknown.
- Vercel module/workshop deep-link HTML and entry JS/CSS return 200. Those two entry assets
  match the local build bytes; this does not identify all assets or a deployed commit.

Raw evidence is in `/tmp/hld-runtime-live-20261010T130244Z`,
`/tmp/hld-runtime-live-warmed-20261010T130458Z`, and
`/tmp/hld-runtime-live-capabilities-20261010T130619Z` in the verification environment.
The incident remains **open**. Current startup, content, simulation and error checks pass
against the fresh packaged local artifact; hosted recovery still requires a deployed-commit/
log check and successful public API checks. No cloud/authentication mutation was performed.

### Cause and required action

The observed responses indicate an older backend artifact; its exact deployed commit and reason for missing deployment have not been verified. No authenticated Render deployment capability is configured in this environment. Deploy latest `main` for the existing Render service, inspect its deployed commit/logs, and verify the public API again. No credentials belong in this repository.

### Recovery checks

1. Check the deployed backend commit against current `main`.
2. GET health and topics through Render and the Vercel proxy; compare topic versions with the canonical catalog.
3. GET the URL-shortener case; require 200, matching entry/resource content version, and the authored stage IDs.
4. GET an unknown case; require structured 404, then refresh the browser workshop and exercise stage navigation.
5. Record actual successful responses and close this incident only after those checks pass.

Local tests and CI protect the artifact's behavior. These live checks establish that the hosted service actually runs that artifact. Health alone is insufficient.
