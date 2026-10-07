import type { BeforeSendEvent } from "@vercel/analytics";

// Only page locations are needed; query strings and fragments can contain learner input.
export function redactAnalyticsUrl(event: BeforeSendEvent) {
  try {
    const url = new URL(event.url);
    return { ...event, url: `${url.origin}${url.pathname}` };
  } catch {
    return null;
  }
}
