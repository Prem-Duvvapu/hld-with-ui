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

### Cause and required action

The observed responses indicate an older backend artifact; its exact deployed commit and reason for missing deployment have not been verified. No authenticated Render deployment capability is configured in this environment. Deploy latest `main` for the existing Render service, inspect its deployed commit/logs, and verify the public API again. No credentials belong in this repository.

### Recovery checks

1. Check the deployed backend commit against current `main`.
2. GET health and topics through Render and the Vercel proxy; compare topic versions with the canonical catalog.
3. GET the URL-shortener case; require 200, matching entry/resource content version, and the authored stage IDs.
4. GET an unknown case; require structured 404, then refresh the browser workshop and exercise stage navigation.
5. Record actual successful responses and close this incident only after those checks pass.

Local tests and CI protect the artifact's behavior. These live checks establish that the hosted service actually runs that artifact. Health alone is insufficient.
