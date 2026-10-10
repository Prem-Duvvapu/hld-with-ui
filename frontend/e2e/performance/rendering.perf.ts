import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { cpus, platform, release, totalmem } from "node:os";
import { expect, test, type CDPSession, type Page } from "@playwright/test";
import type {
  CacheAsideResult,
  CapacityEstimateResult,
  RateLimiterResult,
  RequestFlowResult,
} from "../../src/api/types";

type Module =
  | "request-flow"
  | "cache-aside"
  | "distributed-rate-limiter"
  | "capacity-estimation";
type Workload = {
  id: string;
  module: Module;
  count: number;
  nodes?: number;
  largeValues?: boolean;
  updatesOnly?: boolean;
  maximumScalars?: boolean;
};
const workloads: Workload[] = [
  { id: "flow-tiny", module: "request-flow", count: 1, nodes: 1 },
  { id: "flow-max-count", module: "request-flow", count: 100, nodes: 8 },
  { id: "cache-tiny-get", module: "cache-aside", count: 1 },
  { id: "cache-max-cold-gets", module: "cache-aside", count: 100 },
  {
    id: "cache-max-key-value",
    module: "cache-aside",
    count: 100,
    largeValues: true,
  },
  {
    id: "cache-max-key-value-updates",
    module: "cache-aside",
    count: 100,
    largeValues: true,
    updatesOnly: true,
  },
  {
    id: "limiter-tiny",
    module: "distributed-rate-limiter",
    count: 1,
    nodes: 1,
  },
  {
    id: "limiter-max-count",
    module: "distributed-rate-limiter",
    count: 500,
    nodes: 20,
  },
  { id: "capacity-baseline", module: "capacity-estimation", count: 0 },
  {
    id: "capacity-max-scalars",
    module: "capacity-estimation",
    count: 0,
    maximumScalars: true,
  },
];
const samplesPerWorkload = Number(process.env.PERF_SAMPLES ?? 3);
if (
  !Number.isInteger(samplesPerWorkload) ||
  samplesPerWorkload < 1 ||
  samplesPerWorkload > 10
)
  throw new Error("PERF_SAMPLES must be an integer from 1 to 10.");
const output = resolve(
  process.env.PERF_OUTPUT ?? "target/browser-performance-evidence.json",
);
const metricNames = [
  "TaskDuration",
  "ScriptDuration",
  "LayoutDuration",
  "RecalcStyleDuration",
  "LayoutCount",
  "RecalcStyleCount",
];
type Metrics = Record<string, number>;
type Observation = {
  start: number;
  resourceStart: number;
  requestStart: number;
  responseStart: number;
  responseEnd: number;
  readyAt: number;
  settledAt: number;
};
type Selection = {
  sequence: number;
  phase: string;
  actionToReadyAndTwoFramesMs: number;
  chromiumMetricDeltas: Metrics;
  stateRows: number;
};
type Sample = {
  workload: string;
  viewport: number;
  warmup: boolean;
  input: unknown;
  modelVersion: string;
  responseBytes: number;
  httpResourceTiming: {
    startTime: number;
    requestStart: number | null;
    responseStart: number | null;
    responseEnd: number;
  };
  localProxyHttpRoundTripAndBodyMs: number;
  rows: {
    events: number;
    outcomes: number;
    state: number;
    calculationSteps: number;
  };
  responseEndToSemanticReadyMs: number;
  responseEndToReadyAndTwoFramesMs: number;
  chromiumRunActionToReadyMetricDeltas: Metrics;
  selections: Selection[];
};
const samples: Sample[] = [];
let browserVersion = "";
const revision = {
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  configured:
    process.env.HLD_PERFORMANCE_REVISION ?? process.env.PERF_REVISION ?? null,
  dirty:
    execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
      encoding: "utf8",
    }).trim().length > 0,
};
const sourceHashes = Object.fromEntries(
  [
    "src/features/request-flow/Playground.tsx",
    "src/features/cache-aside/CachePlayback.tsx",
    "src/features/cache-aside/CacheAsidePlayground.tsx",
    "src/features/rate-limiter/RateLimiterPlayground.tsx",
    "src/features/capacity-estimation/CapacityCalculator.tsx",
    "../backend/target/hld-backend-0.1.0-SNAPSHOT.jar",
  ].map((path) => [
    path,
    createHash("sha256").update(readFileSync(path)).digest("hex"),
  ]),
);
declare global {
  interface Window {
    __hldRenderProbe?: Observation;
  }
}

function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length)
    return { samples: [], median: null, min: null, max: null };
  const middle = Math.floor(sorted.length / 2);
  return {
    samples: values,
    median:
      sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1]! + sorted[middle]!) / 2,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}
function report() {
  const measured = samples.filter((sample) => !sample.warmup);
  const groups = workloads
    .flatMap((workload) =>
      [1440, 320].map((viewport) => {
        const matching = measured.filter(
          (sample) =>
            sample.workload === workload.id && sample.viewport === viewport,
        );
        if (!matching.length) return null;
        return {
          workload: workload.id,
          viewport,
          sampleCount: matching.length,
          warmupCount: samples.filter(
            (sample) =>
              sample.warmup &&
              sample.workload === workload.id &&
              sample.viewport === viewport,
          ).length,
          localProxyRequestToHeadersMs: summary(
            matching
              .filter(
                (sample) =>
                  sample.httpResourceTiming.requestStart !== null &&
                  sample.httpResourceTiming.responseStart !== null,
              )
              .map(
                (sample) =>
                  sample.httpResourceTiming.responseStart! -
                  sample.httpResourceTiming.requestStart!,
              ),
          ),
          localProxyBodyTransferMs: summary(
            matching
              .filter(
                (sample) => sample.httpResourceTiming.responseStart !== null,
              )
              .map(
                (sample) =>
                  sample.httpResourceTiming.responseEnd -
                  sample.httpResourceTiming.responseStart!,
              ),
          ),
          localProxyHttpRoundTripAndBodyMs: summary(
            matching.map((sample) => sample.localProxyHttpRoundTripAndBodyMs),
          ),
          responseEndToSemanticReadyMs: summary(
            matching.map((sample) => sample.responseEndToSemanticReadyMs),
          ),
          responseEndToReadyAndTwoFramesMs: summary(
            matching.map((sample) => sample.responseEndToReadyAndTwoFramesMs),
          ),
          chromiumRunActionToReadyMetricDeltas: Object.fromEntries(
            metricNames.map((name) => [
              name,
              summary(
                matching.map(
                  (sample) =>
                    sample.chromiumRunActionToReadyMetricDeltas[name]!,
                ),
              ),
            ]),
          ),
          selections: ["first", "middle", "last", "backward"].flatMap(
            (phase) => {
              const selections = matching.flatMap((sample) =>
                sample.selections.filter(
                  (selection) => selection.phase === phase,
                ),
              );
              return selections.length
                ? [
                    {
                      phase,
                      actionToReadyAndTwoFramesMs: summary(
                        selections.map(
                          (selection) => selection.actionToReadyAndTwoFramesMs,
                        ),
                      ),
                      chromiumMetricDeltas: Object.fromEntries(
                        metricNames.map((name) => [
                          name,
                          summary(
                            selections.map(
                              (selection) =>
                                selection.chromiumMetricDeltas[name]!,
                            ),
                          ),
                        ]),
                      ),
                    },
                  ]
                : [];
            },
          ),
        };
      }),
    )
    .filter(Boolean);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(
    output,
    JSON.stringify(
      {
        schemaVersion: 1,
        recordedAt: new Date().toISOString(),
        revision,
        sourceHashes,
        environment: {
          platform: platform(),
          release: release(),
          cpu: cpus()[0]?.model,
          logicalCpus: cpus().length,
          hostMemoryBytes: totalmem(),
          node: process.version,
          chromium: browserVersion,
          workers: 1,
          reducedMotion: "reduce",
          colorScheme: "light",
          viewports: [
            { width: 1440, height: 900 },
            { width: 320, height: 900 },
          ],
        },
        method: {
          warmupsPerWorkloadAndViewport: 1,
          measuredSamplesPerWorkloadAndViewport: samplesPerWorkload,
          http: "Same-origin ResourceTiming startTime to responseEnd is local proxy HTTP round-trip plus body completion, not server CPU time. Request/header fields reported as null when unavailable (zero); header and body summaries omit unavailable entries.",
          timing:
            "Browser PerformanceResourceTiming.responseEnd to semantic DOM observer readiness, then two requestAnimationFrame callbacks. Includes browser scheduling/style/layout; not isolated React CPU time or physical paint confirmation.",
          chromiumMetrics:
            "CDP Performance.getMetrics cumulative deltas from before run click to observed settled readiness (and separately per event click). Includes run-loading UI, fetch/JSON handling and test-driver scheduling; duration values are seconds, counts are counts. No CPU throttling.",
          limits:
            "Response bytes are the decoded UTF-8 JSON body, not compressed wire bytes. Local Chromium, one worker and warmed Java/browser asset caches. Raw warmups retained but excluded from summaries; no percentile or threshold claim. Controls/route loading excluded from response-to-ready interval. No production capacity, p95, screen-reader, zoom or learning-effectiveness claim.",
        },
        expectedGroups: workloads.length * 2,
        expectedMeasuredSamples: workloads.length * 2 * samplesPerWorkload,
        expectedWarmups: workloads.length * 2,
        completedGroups: groups.length,
        complete:
          groups.length === workloads.length * 2 &&
          groups.every(
            (group) =>
              group!.sampleCount === samplesPerWorkload &&
              group!.warmupCount === 1,
          ) &&
          samples.filter((sample) => sample.warmup).length ===
            workloads.length * 2,
        groups,
        samples,
      },
      null,
      2,
    ) + "\n",
  );
}
async function metrics(session: CDPSession): Promise<Metrics> {
  const result = await session.send("Performance.getMetrics");
  return Object.fromEntries(
    result.metrics
      .filter((metric: { name: string }) => metricNames.includes(metric.name))
      .map((metric: { name: string; value: number }) => [
        metric.name,
        metric.value,
      ]),
  );
}
const delta = (before: Metrics, after: Metrics) =>
  Object.fromEntries(
    metricNames.map((name) => [name, after[name]! - before[name]!]),
  );

async function controls(page: Page, workload: Workload) {
  await page.goto(`/topics/${workload.module}`);
  if (workload.module === "request-flow") {
    await page
      .getByLabel("Arrival times (ms)", { exact: true })
      .fill(Array(workload.count).fill(0).join(", "));
    await page
      .getByLabel("Node service times (ms)", { exact: true })
      .fill(Array(workload.nodes).fill(100).join(", "));
    await page.getByLabel("Workers / node", { exact: true }).fill("1");
    await page.getByLabel("Queue / node", { exact: true }).fill("100");
  } else if (workload.module === "cache-aside") {
    const operations = workload.largeValues
      ? Array.from({ length: workload.updatesOnly ? 100 : 50 }, (_, i) => {
          const key = `key-${i}-`.padEnd(64, "k");
          return `UPDATE ${key} ${"v".repeat(256)} @0${workload.updatesOnly ? "" : `\nGET ${key} @1`}`;
        }).join("\n")
      : Array(workload.count).fill("GET k @0").join("\n");
    await page.getByLabel(/^Operations \(one per line/).fill(operations);
  } else if (workload.module === "distributed-rate-limiter") {
    await page
      .getByLabel(/^Arrival times/)
      .fill(Array(workload.count).fill(0).join(", "));
    await page
      .getByLabel("Application nodes", { exact: true })
      .fill(String(workload.nodes));
  } else if (workload.maximumScalars) {
    for (const input of await page
      .locator(".capacity-controls input[type=number]")
      .all())
      await input.fill((await input.getAttribute("max"))!);
  }
  await page.evaluate(() => document.fonts.ready);
}

async function probe(page: Page, workload: Workload, endpoint: string) {
  await page.evaluate(
    ({ module, count, largeValues, updatesOnly, endpoint }) => {
      const observation = {
        start: performance.now(),
        resourceStart: 0,
        requestStart: 0,
        responseStart: 0,
        responseEnd: 0,
        readyAt: 0,
        settledAt: 0,
      };
      window.__hldRenderProbe = observation;
      let settling = false;
      const mutation = new MutationObserver(check);
      const resource = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (
            entry.name.endsWith(endpoint) &&
            entry.startTime >= observation.start
          ) {
            const timing = entry as PerformanceResourceTiming;
            observation.resourceStart = timing.startTime;
            observation.requestStart = timing.requestStart;
            observation.responseStart = timing.responseStart;
            observation.responseEnd = timing.responseEnd;
          }
        }
        check();
      });
      function check() {
        if (!observation.responseEnd || settling) return;
        const countRows = (selector: string) =>
          document.querySelectorAll(selector).length;
        const run = document.querySelector<HTMLButtonElement>(
          module === "capacity-estimation"
            ? ".capacity-controls button[type=submit]"
            : module === "cache-aside"
              ? "#run-cache-aside"
              : ".control-panel .run-button",
        );
        if (!run || run.disabled) return;
        const ready =
          module === "request-flow"
            ? countRows(".trace-log tbody tr") > 0 &&
              countRows(".trace-details:not(.trace-log) tbody tr") === count &&
              document
                .querySelector('[aria-label="Trace position"]')
                ?.getAttribute("aria-valuetext")
                ?.startsWith("Event 1 of")
            : module === "cache-aside"
              ? countRows(
                  'table[aria-label="Simulation event trace"] tbody tr',
                ) > 0 &&
                countRows('table[aria-label="Cache GET outcomes"] tbody tr') ===
                  (updatesOnly ? 0 : largeValues ? count / 2 : count) &&
                document
                  .querySelector(".cache-position")
                  ?.textContent?.startsWith("Initial state") &&
                !!document.querySelector("#cache-final-metrics")
              : module === "distributed-rate-limiter"
                ? countRows(".experiment-stage tbody tr") === count &&
                  !!document.querySelector(
                    '[aria-label="Rate limiter metrics"]',
                  )
                : countRows(".calculation-trail li") > 0 &&
                  countRows(".capacity-metrics article") === 4;
        if (!ready) return;
        settling = true;
        observation.readyAt = performance.now();
        mutation.disconnect();
        resource.disconnect();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            observation.settledAt = performance.now();
          }),
        );
      }
      mutation.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      resource.observe({ entryTypes: ["resource"] });
    },
    {
      module: workload.module,
      count: workload.count,
      largeValues: !!workload.largeValues,
      updatesOnly: !!workload.updatesOnly,
      endpoint,
    },
  );
}

async function select(
  page: Page,
  session: CDPSession,
  result: RequestFlowResult | CacheAsideResult,
  module: Module,
): Promise<Selection[]> {
  const events = result.events;
  const output: Selection[] = [];
  // Flow initially selects event 1. Move away before measuring its selection,
  // so the first-event sample covers a state change rather than a no-op click.
  const first = page.getByRole("button", {
    name: `View event ${events[0]!.sequence}`,
    exact: true,
  });
  if ((await first.getAttribute("aria-current")) === "step") {
    const last = page.getByRole("button", {
      name: `View event ${events[events.length - 1]!.sequence}`,
      exact: true,
    });
    await last.click();
    await expect(last).toHaveAttribute("aria-current", "step");
  }
  const indexes = [0, Math.floor(events.length / 2), events.length - 1, 0];
  for (const [index, phase] of indexes.map(
    (index, i) => [index, ["first", "middle", "last", "backward"][i]] as const,
  )) {
    const event = events[index]!;
    const button = page.getByRole("button", {
      name: `View event ${event.sequence}`,
      exact: true,
    });
    await button.scrollIntoViewIfNeeded();
    const before = await metrics(session);
    const start = await page.evaluate(() => performance.now());
    await button.click();
    await expect(button).toHaveAttribute("aria-current", "step");
    const inspector = page.locator(
      module === "cache-aside" ? ".cache-inspector" : ".current-event",
    );
    await expect(inspector).toContainText(event.message);
    const settled = await page.evaluate(
      () =>
        new Promise<number>((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve(performance.now())),
          ),
        ),
    );
    const after = await metrics(session);
    await expect(
      page.getByLabel("Trace position", { exact: true }),
    ).toHaveValue(String(index));
    if (module === "cache-aside")
      await expect(page.locator(".cache-position")).toContainText(
        `Event ${index + 1} of ${events.length} · ${event.timeMs} ms`,
      );
    else
      await expect(
        page.getByLabel("Trace position", { exact: true }),
      ).toHaveAttribute(
        "aria-valuetext",
        `Event ${index + 1} of ${events.length}`,
      );
    if (module === "cache-aside")
      await assertCacheState(page, result as CacheAsideResult, index);
    output.push({
      sequence: event.sequence,
      phase: phase!,
      actionToReadyAndTwoFramesMs: settled - start,
      chromiumMetricDeltas: delta(before, after),
      stateRows: await page
        .locator(
          'table[aria-label="Cache and origin state at the selected position"] tbody tr',
        )
        .count(),
    });
  }
  return output;
}

async function assertCacheState(
  page: Page,
  result: CacheAsideResult,
  position: number,
) {
  // Compare Java's initial state and latest emitted key snapshots directly.
  // This does not execute operations, infer outcomes, or parse narration.
  const states = new Map<
    string,
    Pick<CacheAsideResult["events"][number], "cacheEntry" | "originValue">
  >();
  for (const { key, value, version } of result.initialState.origin)
    states.set(key, { originValue: { value, version } });
  for (const event of result.events.slice(0, position + 1))
    states.set(event.key, {
      cacheEntry: event.cacheEntry,
      originValue: event.originValue,
    });
  const actual = await page
    .locator(
      'table[aria-label="Cache and origin state at the selected position"] tbody tr',
    )
    .evaluateAll((rows) =>
      rows.map((row) =>
        Array.from(row.querySelectorAll("td")).map((cell) =>
          cell.textContent!.trim(),
        ),
      ),
    );
  expect(
    actual.map((cells) => [cells[0], cells[1], cells[2], cells[3], cells[5]]),
  ).toEqual(
    Array.from(states).map(([key, state]) => [
      key,
      state.cacheEntry
        ? `${state.cacheEntry.value} (version ${state.cacheEntry.version})`
        : "—",
      String(state.cacheEntry?.filledAtMs ?? "—"),
      String(state.cacheEntry?.expiresAtMs ?? "—"),
      state.originValue
        ? `${state.originValue.value} (version ${state.originValue.version})`
        : "Not found",
    ]),
  );
}

async function assertFlowMetrics(page: Page, result: RequestFlowResult) {
  const metrics = result.metrics;
  const expected = [
    ["COMPLETED", String(metrics.completed)],
    ["REJECTED", String(metrics.rejected)],
    ["FAILED", String(metrics.failed)],
    [
      "MEAN LATENCY",
      metrics.meanLatencyMs === null ? "—" : metrics.meanLatencyMs.toFixed(1),
    ],
    ["P95 LATENCY", String(metrics.p95LatencyMs ?? "—")],
    [
      "THROUGHPUT",
      metrics.throughputPerSecond === null
        ? "—"
        : metrics.throughputPerSecond.toFixed(1),
    ],
  ];
  const actual = await page
    .getByLabel("Run metrics", { exact: true })
    .locator("article")
    .evaluateAll((cards) =>
      cards.map((card) => [
        card.querySelector("small")!.textContent!.trim(),
        card.querySelector("strong")!.textContent!.trim(),
      ]),
    );
  expect(actual).toEqual(expected);
}

async function assertCacheMetrics(page: Page, result: CacheAsideResult) {
  const metrics = result.metrics;
  const expected = [
    ["Total GETs", String(metrics.totalGets)],
    ["Cache Hits", String(metrics.cacheHits)],
    ["Cache Misses", String(metrics.cacheMisses)],
    ["Stale Reads", String(metrics.staleReads)],
    ["Cache Bypasses", String(metrics.cacheBypasses)],
    ["Failed GETs", String(metrics.failedGets)],
    ["Origin Reads", String(metrics.originReads)],
    [
      "Hit Ratio",
      metrics.cacheHits + metrics.cacheMisses === 0
        ? "—"
        : `${(metrics.hitRatio * 100).toFixed(1)}%`,
    ],
  ];
  const actual = await page
    .locator(".playground-results .metrics-bar .metric")
    .evaluateAll((cards) =>
      cards.map((card) => [
        card.querySelector(".metric-label")!.textContent!.trim(),
        card.querySelector(".metric-value")!.textContent!.trim(),
      ]),
    );
  expect(actual).toEqual(expected);
}

for (const viewport of [1440, 320])
  for (const workload of workloads) {
    test(`${workload.id} at ${viewport}px: real Java render and seek samples`, async ({
      page,
      browser,
    }) => {
      browserVersion = browser.version();
      await page.setViewportSize({ width: viewport, height: 900 });
      await page.emulateMedia({
        reducedMotion: "reduce",
        colorScheme: "light",
      });
      const session = await page.context().newCDPSession(page);
      await session.send("Performance.enable");
      for (let iteration = 0; iteration <= samplesPerWorkload; iteration++) {
        await controls(page, workload);
        const endpoint =
          workload.module === "capacity-estimation"
            ? `/api/v1/estimators/${workload.module}/calculations`
            : `/api/v1/simulations/${workload.module}/runs`;
        await probe(page, workload, endpoint);
        const before = await metrics(session);
        const responsePromise = page.waitForResponse(
          (response) =>
            response.url().endsWith(endpoint) &&
            response.request().method() === "POST",
        );
        await page
          .getByRole("button", {
            name:
              workload.module === "request-flow"
                ? /Run experiment/
                : workload.module === "cache-aside"
                  ? "Run simulation"
                  : workload.module === "distributed-rate-limiter"
                    ? /Run request burst/
                    : /Calculate estimate/,
          })
          .click();
        const response = await responsePromise;
        expect(response.status()).toBe(200);
        await page.waitForFunction(() => window.__hldRenderProbe?.settledAt);
        const observation = (await page.evaluate(
          () => window.__hldRenderProbe,
        ))!;
        const after = await metrics(session);
        const body = await response.body();
        const result = JSON.parse(body.toString()) as
          | RequestFlowResult
          | CacheAsideResult
          | RateLimiterResult
          | CapacityEstimateResult;
        const rows = { events: 0, outcomes: 0, state: 0, calculationSteps: 0 };
        let selections: Selection[] = [];
        if (
          "events" in result &&
          (workload.module === "request-flow" ||
            workload.module === "cache-aside")
        ) {
          rows.events = await page
            .getByRole("button", { name: /^View event \d+$/ })
            .count();
          expect(rows.events).toBe(result.events.length);
          expect(result.status).toBe("completed");
        }
        if (workload.module === "request-flow") {
          const flow = result as RequestFlowResult;
          rows.outcomes = await page
            .locator(".trace-details:not(.trace-log) tbody tr")
            .count();
          expect(rows.outcomes).toBe(flow.outcomes.length);
          expect(rows.outcomes).toBe(workload.count);
          expect(await page.locator(".trace-nodes .trace-node").count()).toBe(
            workload.nodes,
          );
          await assertFlowMetrics(page, flow);
          selections = await select(page, session, flow, workload.module);
        } else if (workload.module === "cache-aside") {
          const cache = result as CacheAsideResult;
          rows.outcomes = await page
            .locator('table[aria-label="Cache GET outcomes"] tbody tr')
            .count();
          expect(rows.outcomes).toBe(cache.outcomes.length);
          expect(cache.metrics.totalGets).toBe(
            workload.updatesOnly
              ? 0
              : workload.largeValues
                ? 50
                : workload.count,
          );
          await assertCacheMetrics(page, cache);
          await assertCacheState(page, cache, -1);
          selections = await select(page, session, cache, workload.module);
          rows.state = selections.find(
            (selection) => selection.phase === "last",
          )!.stateRows;
          const touched = new Set([
            "k",
            ...cache.events.map((event) => event.key),
          ]);
          expect(rows.state).toBe(touched.size);
        } else if (workload.module === "distributed-rate-limiter") {
          const limiter = result as RateLimiterResult;
          expect(limiter.status).toBe("completed");
          rows.outcomes = await page
            .locator(".experiment-stage tbody tr")
            .count();
          expect(rows.outcomes).toBe(limiter.outcomes.length);
          expect(limiter.metrics.total).toBe(workload.count);
          await expect(page.getByLabel("Rate limiter metrics")).toContainText(
            `ALLOWED${limiter.metrics.allowed}`,
          );
          await expect(page.getByLabel("Rate limiter metrics")).toContainText(
            `REJECTED${limiter.metrics.rejected}`,
          );
        } else {
          const capacity = result as CapacityEstimateResult;
          expect(capacity.status).toBe("estimated");
          rows.calculationSteps = await page
            .locator(".calculation-trail li")
            .count();
          expect(rows.calculationSteps).toBe(capacity.steps.length);
          const format = (value: number) =>
            new Intl.NumberFormat("en-US", {
              maximumFractionDigits: value < 10 ? 2 : 1,
            }).format(value);
          for (const [label, key] of [
            ["Target peak", "peakRequestsWithHeadroom"],
            ["Retained copies", "replicatedStorageGigabytes"],
            ["Peak response", "peakResponseMegabitsPerSecond"],
            ["Mean in flight", "meanConcurrentRequests"],
          ] as const)
            await expect(
              page
                .getByText(label, { exact: true })
                .locator("..")
                .locator("strong"),
            ).toHaveText(format(capacity.metrics[key]));
        }
        await expect(page.getByRole("alert")).toHaveCount(0);
        const sample: Sample = {
          workload: workload.id,
          viewport,
          warmup: iteration === 0,
          input: response.request().postDataJSON(),
          modelVersion:
            "modelVersion" in result
              ? result.modelVersion
              : `schema:${result.schemaVersion}`,
          responseBytes: body.length,
          httpResourceTiming: {
            startTime: observation.resourceStart,
            requestStart:
              observation.requestStart > 0 ? observation.requestStart : null,
            responseStart:
              observation.responseStart > 0 ? observation.responseStart : null,
            responseEnd: observation.responseEnd,
          },
          localProxyHttpRoundTripAndBodyMs:
            observation.responseEnd - observation.resourceStart,
          rows,
          responseEndToSemanticReadyMs:
            observation.readyAt - observation.responseEnd,
          responseEndToReadyAndTwoFramesMs:
            observation.settledAt - observation.responseEnd,
          chromiumRunActionToReadyMetricDeltas: delta(before, after),
          selections,
        };
        samples.push(sample);
        report();
      }
      await session.detach();
      console.log(
        `${workload.id} ${viewport}px: ${samplesPerWorkload} measured samples saved to ${output}`,
      );
    });
  }

test.beforeAll(() => report());
test.afterAll(() => {
  report();
  if (process.env.PERF_REQUIRE_COMPLETE === "0") return;
  expect(samples.filter((sample) => !sample.warmup)).toHaveLength(
    workloads.length * 2 * samplesPerWorkload,
  );
  expect(samples.filter((sample) => sample.warmup)).toHaveLength(
    workloads.length * 2,
  );
  for (const workload of workloads)
    for (const viewport of [1440, 320]) {
      const group = samples.filter(
        (sample) =>
          sample.workload === workload.id && sample.viewport === viewport,
      );
      expect(group.filter((sample) => !sample.warmup)).toHaveLength(
        samplesPerWorkload,
      );
      expect(group.filter((sample) => sample.warmup)).toHaveLength(1);
    }
});
