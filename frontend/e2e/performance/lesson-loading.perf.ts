import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import type { CaseStudyDetail, TopicDetail } from "../../src/api/types";

type ReadingRoute = {
  id: string;
  route: string;
  endpoint: string;
  descriptor?: string;
  workshop?: boolean;
};
const routes: ReadingRoute[] = [
  {
    id: "request-flow",
    route: "/topics/request-flow?view=study",
    endpoint: "/api/v1/topics/request-flow",
    descriptor: "/api/v1/simulations/request-flow",
  },
  {
    id: "capacity-estimation",
    route: "/topics/capacity-estimation?view=study",
    endpoint: "/api/v1/topics/capacity-estimation",
    descriptor: "/api/v1/estimators/capacity-estimation",
  },
  {
    id: "cache-aside",
    route: "/topics/cache-aside?view=study",
    endpoint: "/api/v1/topics/cache-aside",
    descriptor: "/api/v1/simulations/cache-aside",
  },
  {
    id: "distributed-rate-limiter",
    route: "/topics/distributed-rate-limiter?view=study",
    endpoint: "/api/v1/topics/distributed-rate-limiter",
    descriptor: "/api/v1/simulations/distributed-rate-limiter",
  },
  {
    id: "url-shortener",
    route: "/case-studies/url-shortener?stage=requirements",
    endpoint: "/api/v1/case-studies/url-shortener",
    workshop: true,
  },
];
type CacheMode = "browser-context-cold" | "same-context-warm";
const modes: CacheMode[] = ["browser-context-cold", "same-context-warm"];
const sampleCount = Number(process.env.LESSON_SAMPLES ?? 3);
if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 10)
  throw new Error("LESSON_SAMPLES must be an integer from 1 to 10.");
const output = resolve(
  process.env.LESSON_OUTPUT ?? "target/lesson-loading-evidence.json",
);
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const provenance = {
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  configured: process.env.HLD_PERFORMANCE_REVISION ?? null,
  dirty: !!execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=normal"],
    { encoding: "utf8" },
  ).trim(),
  sha256: Object.fromEntries(
    [
      "e2e/performance/lesson-loading.perf.ts",
      "playwright.lessons.config.ts",
      "playwright.config.ts",
      "package.json",
      "src/app/App.tsx",
      "src/components/ModuleShell.tsx",
      "src/features/learning/StudyView.tsx",
      "src/features/workshop/DesignWorkshop.tsx",
      "src/pages/RequestFlowPage.tsx",
      "src/pages/CapacityEstimationPage.tsx",
      "src/pages/CacheAsidePage.tsx",
      "src/pages/RateLimiterPage.tsx",
      "src/pages/WorkshopPage.tsx",
      "../backend/target/hld-backend-0.1.0-SNAPSHOT.jar",
    ].map((path) => [path, hash(readFileSync(path))]),
  ),
};
type Resource = {
  name: string;
  startTime: number;
  requestStart: number | null;
  responseStart: number | null;
  responseEnd: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
};
type Observation = { readyAt: number; settledAt: number; api: Resource[] };
type Expected = {
  title: string;
  version: string;
  outcomes: number;
  headings: string[];
  stageIds: string[];
  stageTitles: string[];
  stageId: string;
  stageTitle: string;
  prompt: string;
  endpoints: string[];
  workshop: boolean;
};
type Sample = {
  route: string;
  viewport: number;
  cacheMode: CacheMode;
  prime: boolean;
  iteration: number;
  contentVersion: string;
  contentSha256: string;
  navigationStartToSemanticReadyMs: number;
  navigationStartToReadyAndTwoFramesMs: number;
  contentResponseEndToReadyAndTwoFramesMs: number;
  lastRequiredApiResponseEndToReadyAndTwoFramesMs: number;
  api: Resource[];
  javascript: Resource[];
  javascriptTotals: {
    chunks: number;
    transferSize: number;
    encodedBodySize: number;
    decodedBodySize: number;
  };
  semantic: {
    lessonHeadings: string[];
    authoredStages: string[];
    outcomes: number;
  };
  posts: string[];
};
const samples: Sample[] = [];
let chromium = "";
declare global {
  interface Window {
    __hldLessonProbe?: Observation;
  }
}

function markdownHeadings(markdown: string) {
  let fence = false;
  const headings: string[] = [];
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    const heading = !fence && line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      // Current authored headings are plain text. Fail if an author changes
      // that assumption rather than silently measuring a partial lesson.
      if (/[[\]`*_]/.test(heading[1]!))
        throw new Error(
          "Lesson heading markup needs a deliberate measurement-parser update.",
        );
      headings.push(heading[1]!);
    }
  }
  return headings;
}
function summarize(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b),
    middle = Math.floor(ordered.length / 2);
  return {
    samples: values,
    median: ordered.length
      ? ordered.length % 2
        ? ordered[middle]
        : (ordered[middle - 1]! + ordered[middle]!) / 2
      : null,
    min: ordered[0] ?? null,
    max: ordered[ordered.length - 1] ?? null,
  };
}
function report() {
  const groups = routes.flatMap((route) =>
    [1440, 320].flatMap((viewport) =>
      modes.map((cacheMode) => {
        const matching = samples.filter(
          (sample) =>
            sample.route === route.id &&
            sample.viewport === viewport &&
            sample.cacheMode === cacheMode,
        );
        const measured = matching.filter((sample) => !sample.prime);
        const names = [
          "navigationStartToSemanticReadyMs",
          "navigationStartToReadyAndTwoFramesMs",
          "contentResponseEndToReadyAndTwoFramesMs",
          "lastRequiredApiResponseEndToReadyAndTwoFramesMs",
        ] as const;
        return {
          route: route.id,
          viewport,
          cacheMode,
          measuredCount: measured.length,
          primeCount: matching.filter((sample) => sample.prime).length,
          timings: Object.fromEntries(
            names.map((name) => [
              name,
              summarize(measured.map((sample) => sample[name])),
            ]),
          ),
          javascriptTotals: Object.fromEntries(
            ["transferSize", "encodedBodySize", "decodedBodySize"].map(
              (name) => [
                name,
                summarize(
                  measured.map(
                    (sample) =>
                      sample.javascriptTotals[
                        name as keyof Sample["javascriptTotals"]
                      ],
                  ),
                ),
              ],
            ),
          ),
        };
      }),
    ),
  );
  const complete = groups.every(
    (group) =>
      group.measuredCount === sampleCount &&
      group.primeCount === (group.cacheMode === "same-context-warm" ? 1 : 0),
  );
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(
    output,
    JSON.stringify(
      {
        schemaVersion: 1,
        recordedAt: new Date().toISOString(),
        complete,
        expectedGroups: 20,
        expectedMeasuredSamples: 20 * sampleCount,
        expectedPrimingNavigations: 10,
        provenance,
        environment: {
          platform: platform(),
          release: release(),
          cpu: cpus()[0]?.model,
          logicalCpus: cpus().length,
          hostMemoryBytes: totalmem(),
          node: process.version,
          chromium,
          workers: 1,
          lightTheme: true,
          reducedMotion: "reduce",
          viewports: [
            { width: 1440, height: 900 },
            { width: 320, height: 900 },
          ],
        },
        method: {
          browserCold:
            "Each measured cold sample opens a new isolated browser context with default HTTP cache enabled, no prior navigation/storage and no service-worker seeding. Browser process, OS/network and Java server are already warm; this is not a cold-machine/server measurement.",
          browserWarm:
            "A fresh context first performs one recorded, excluded priming navigation. Measured visits then navigate through about:blank back to the same direct reading URL in that context. HTTP caching/revalidation follows actual server headers; no cache disabling, interception or assumed cache hit. This is repeated document loading, not a React SPA/tab switch.",
          readiness:
            "Before document code runs, native MutationObserver and PerformanceObserver wait for actual required Java GET body completion, title/version/outcome count, the full authored lesson heading list or all draft stage controls+current stage prompt. Readiness timestamp is followed by two requestAnimationFrame callbacks; navigation start and API response-end intervals include scheduling/styles/layout, not isolated React CPU or physical paint.",
          javascript:
            "ResourceTiming entries for same-origin production /assets/*.js completed by ready+two frames. URL/chunk names and actual transferSize, encodedBodySize, decodedBodySize recorded separately. Transfer includes HTTP overhead and may be zero for cache; encoded bytes are not decoded bytes or gzip estimates. JavaScript resources completing later are outside this bounded readiness observation. Font completion is not a readiness gate.",
          validation:
            "Actual browser Java content equals standalone preflight Java content; headers/stages/controls reconcile with that content. All POST requests observed through semantic/assertion completion must remain absent. No model runs, calculator submissions, note edits, or progress marks.",
          limits:
            "Three samples per group by default, no percentile/threshold or physical/mobile/screen-reader/newcomer/hosted performance claim. Host idleness is not established. Zero unavailable request/header times become null; raw transfer-size zeros remain factual browser observations.",
        },
        groups,
        samples,
      },
      null,
      2,
    ) + "\n",
  );
  return complete;
}

async function installProbe(page: Page, expected: Expected) {
  await page.addInitScript((expected) => {
    const observation: Observation = { readyAt: 0, settledAt: 0, api: [] };
    window.__hldLessonProbe = observation;
    let settling = false;
    const mutation = new MutationObserver(check);
    const resources = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const pathname = new URL(entry.name).pathname;
        if (!expected.endpoints.includes(pathname)) continue;
        const resource = entry as PerformanceResourceTiming;
        observation.api.push({
          name: pathname,
          startTime: resource.startTime,
          requestStart: resource.requestStart || null,
          responseStart: resource.responseStart || null,
          responseEnd: resource.responseEnd,
          transferSize: resource.transferSize,
          encodedBodySize: resource.encodedBodySize,
          decodedBodySize: resource.decodedBodySize,
        });
      }
      check();
    });
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    function check() {
      if (
        settling ||
        !expected.endpoints.every((path) =>
          observation.api.some((entry) => entry.name === path),
        )
      )
        return;
      if (
        document.querySelector(".module-header h1")?.textContent?.trim() !==
          expected.title ||
        document.querySelector(".version-pill strong")?.textContent?.trim() !==
          `v${expected.version}` ||
        document.querySelectorAll(".learning-outcomes li").length !==
          expected.outcomes
      )
        return;
      const active = document.querySelector('[role="tabpanel"]:not([hidden])');
      if (!active) return;
      if (expected.workshop) {
        const buttons = Array.from(
          active.querySelectorAll(".workshop-navigation button"),
        );
        const current = active.querySelector(
          ".workshop-stage-heading h2[tabindex]",
        );
        const stage = active.querySelector(
          `article[aria-labelledby="stage-${expected.stageId}"]`,
        );
        if (
          buttons.length !== expected.stageIds.length ||
          current?.getAttribute("id") !== `stage-${expected.stageId}` ||
          current.textContent?.trim() !== expected.stageTitle ||
          !stage?.querySelector("textarea") ||
          normalize(
            stage.querySelector(".workshop-step .prose")?.textContent ?? "",
          ) !== normalize(expected.prompt)
        )
          return;
      } else {
        const headings = Array.from(
          active.querySelectorAll(
            ".reading-layout article.prose h1,.reading-layout article.prose h2,.reading-layout article.prose h3,.reading-layout article.prose h4,.reading-layout article.prose h5,.reading-layout article.prose h6",
          ),
        ).map((heading) => heading.textContent!.trim());
        if (
          JSON.stringify(headings) !== JSON.stringify(expected.headings) ||
          !active.querySelector(".reading-aside") ||
          !document
            .querySelector('[role="tab"][aria-selected="true"]')
            ?.textContent?.includes("Study")
        )
          return;
      }
      settling = true;
      observation.readyAt = performance.now();
      mutation.disconnect();
      resources.disconnect();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          observation.settledAt = performance.now();
        }),
      );
    }
    mutation.observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    resources.observe({ entryTypes: ["resource"] });
  }, expected);
}

async function context(
  browser: Browser,
  baseURL: string,
  viewport: number,
  expected: Expected,
) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: viewport, height: 900 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  const page = await context.newPage();
  await installProbe(page, expected);
  return { context, page };
}

for (const viewport of [1440, 320])
  for (const route of routes)
    for (const cacheMode of modes) {
      test(`${route.id}: ${cacheMode} reading at ${viewport}px`, async ({
        browser,
        request,
        baseURL,
      }) => {
        chromium = browser.version();
        const preflight = await request.get(route.endpoint);
        expect(preflight.status()).toBe(200);
        const reference = (await preflight.json()) as
          TopicDetail | CaseStudyDetail;
        const entry = "topic" in reference ? reference.topic : reference.entry;
        const headings =
          "topic" in reference
            ? markdownHeadings(reference.lessonMarkdown)
            : [];
        const workshop = "workshop" in reference ? reference.workshop : null;
        const first = workshop?.stages[0];
        const expected: Expected = {
          title: entry.title,
          version: entry.contentVersion,
          outcomes: entry.outcomes.length,
          headings,
          stageIds: workshop?.stages.map((stage) => stage.id) ?? [],
          stageTitles: workshop?.stages.map((stage) => stage.title) ?? [],
          stageId: first?.id ?? "",
          stageTitle: first?.title ?? "",
          prompt: first?.prompt ?? "",
          endpoints: [
            route.endpoint,
            ...(route.descriptor ? [route.descriptor] : []),
          ],
          workshop: !!workshop,
        };
        expect(entry.id).toBe(route.id);
        if (route.workshop) {
          expect(entry.status).toBe("draft");
          expect(first!.id).toBe("requirements");
        } else expect(headings.length).toBeGreaterThan(0);
        const contentSha256 = hash(JSON.stringify(reference));
        let warm: Awaited<ReturnType<typeof context>> | undefined;
        if (cacheMode === "same-context-warm")
          warm = await context(browser, baseURL!, viewport, expected);
        try {
          for (
            let iteration = cacheMode === "same-context-warm" ? 0 : 1;
            iteration <= sampleCount;
            iteration++
          ) {
            const current =
              warm ?? (await context(browser, baseURL!, viewport, expected));
            const { page } = current;
            const posts: string[] = [];
            const onRequest = (request: {
              method(): string;
              url(): string;
            }) => {
              if (request.method() === "POST") posts.push(request.url());
            };
            page.on("request", onRequest);
            try {
              if (warm && iteration > 0) await page.goto("about:blank");
              const responsePromise = page.waitForResponse(
                (response) =>
                  new URL(response.url()).pathname === route.endpoint &&
                  response.request().method() === "GET",
              );
              await page.goto(route.route, { waitUntil: "domcontentloaded" });
              const response = await responsePromise;
              expect(response.status()).toBe(200);
              await page.waitForFunction(
                () => window.__hldLessonProbe?.settledAt,
              );
              const observation = (await page.evaluate(
                () => window.__hldLessonProbe,
              ))!;
              const javascript = await page.evaluate(
                (settledAt) =>
                  performance
                    .getEntriesByType("resource")
                    .filter((entry) => {
                      const url = new URL(entry.name);
                      return (
                        url.origin === location.origin &&
                        url.pathname.startsWith("/assets/") &&
                        url.pathname.endsWith(".js") &&
                        (entry as PerformanceResourceTiming).responseEnd <=
                          settledAt
                      );
                    })
                    .map((entry) => {
                      const resource = entry as PerformanceResourceTiming;
                      return {
                        name: new URL(resource.name).pathname,
                        startTime: resource.startTime,
                        requestStart: resource.requestStart || null,
                        responseStart: resource.responseStart || null,
                        responseEnd: resource.responseEnd,
                        transferSize: resource.transferSize,
                        encodedBodySize: resource.encodedBodySize,
                        decodedBodySize: resource.decodedBodySize,
                      };
                    }),
                observation.settledAt,
              );
              expect(await response.json()).toEqual(reference);
              await expect(page.locator(".module-header h1")).toHaveText(
                entry.title,
              );
              await expect(
                page.getByRole("link", {
                  name: "Back to all modules",
                  exact: true,
                }),
              ).toBeVisible();
              await expect(page.locator(".learning-outcomes li")).toHaveCount(
                entry.outcomes.length,
              );
              const actualHeadings = await page
                .locator(".reading-layout article.prose :is(h1,h2,h3,h4,h5,h6)")
                .allTextContents();
              let authoredStages: string[] = [];
              if (workshop) {
                authoredStages = await page
                  .locator(".workshop-navigation button")
                  .allTextContents();
                expect(
                  authoredStages.map((text) => text.replace(/^\d+/, "").trim()),
                ).toEqual(expected.stageTitles);
                await expect(
                  page.getByRole("textbox", {
                    name: "Your original answer",
                    exact: true,
                  }),
                ).toHaveValue("");
                await expect(
                  page.getByRole("button", {
                    name: "Reveal reference answer",
                    exact: true,
                  }),
                ).toBeEnabled();
                await expect(
                  page.getByRole("heading", {
                    name: first!.title,
                    exact: true,
                  }),
                ).toBeVisible();
                await expect(
                  page.getByRole("region", {
                    name: "Draft workshop",
                    exact: true,
                  }),
                ).toContainText(`${workshop.stages.length} authored stages`);
              } else {
                expect(actualHeadings).toEqual(headings);
                await expect(
                  page.getByRole("tab", { name: /Study/ }),
                ).toHaveAttribute("aria-selected", "true");
                await expect(
                  page.getByRole("button", {
                    name: "Save module",
                    exact: true,
                  }),
                ).toBeEnabled();
                await expect(
                  page.locator(".reading-layout article.prose h2").last(),
                ).toHaveText("Further reading");
              }
              await expect(page.getByRole("alert")).toHaveCount(0);
              await expect(
                page.locator(".run-button:visible,#run-cache-aside:visible"),
              ).toHaveCount(0);
              expect(posts).toEqual([]);
              expect(javascript.length).toBeGreaterThan(0);
              expect(current.context.serviceWorkers()).toHaveLength(0);
              const content = observation.api.find(
                (entry) => entry.name === route.endpoint,
              )!;
              const last = Math.max(
                ...observation.api.map((entry) => entry.responseEnd),
              );
              samples.push({
                route: route.id,
                viewport,
                cacheMode,
                prime: cacheMode === "same-context-warm" && iteration === 0,
                iteration,
                contentVersion: entry.contentVersion,
                contentSha256,
                navigationStartToSemanticReadyMs: observation.readyAt,
                navigationStartToReadyAndTwoFramesMs: observation.settledAt,
                contentResponseEndToReadyAndTwoFramesMs:
                  observation.settledAt - content.responseEnd,
                lastRequiredApiResponseEndToReadyAndTwoFramesMs:
                  observation.settledAt - last,
                api: observation.api,
                javascript,
                javascriptTotals: {
                  chunks: javascript.length,
                  transferSize: javascript.reduce(
                    (sum, entry) => sum + entry.transferSize,
                    0,
                  ),
                  encodedBodySize: javascript.reduce(
                    (sum, entry) => sum + entry.encodedBodySize,
                    0,
                  ),
                  decodedBodySize: javascript.reduce(
                    (sum, entry) => sum + entry.decodedBodySize,
                    0,
                  ),
                },
                semantic: {
                  lessonHeadings: actualHeadings,
                  authoredStages,
                  outcomes: entry.outcomes.length,
                },
                posts,
              });
              report();
            } finally {
              page.off("request", onRequest);
              if (!warm) await current.context.close();
            }
          }
        } finally {
          await warm?.context.close();
          report();
        }
        console.log(
          `${route.id} ${cacheMode} ${viewport}px: ${sampleCount} samples recorded in ${output}`,
        );
      });
    }
test.beforeAll(() => {
  report();
});
test.afterAll(() => {
  const complete = report();
  if (process.env.LESSON_REQUIRE_COMPLETE === "0") return;
  expect(
    complete,
    "All 20 groups must contain their exact measured and priming counts",
  ).toBe(true);
  expect(samples.filter((sample) => !sample.prime)).toHaveLength(
    20 * sampleCount,
  );
  expect(samples.filter((sample) => sample.prime)).toHaveLength(10);
});
