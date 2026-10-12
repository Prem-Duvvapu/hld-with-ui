import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import type { QueueCapacityResult, QueueCapacityState } from "../src/api/types";

const id = "queues-tail-latency";
const route = `/draft/topics/${id}`;
const topicPath = `/api/v1/draft/topics/${id}`;
const descriptorPath = `/api/v1/simulations/${id}`;
const runPath = `${descriptorPath}/runs`;
// The shared versioned browser backup contract; keep runtime application modules out of Node tests.
const practiceStorageKey = "hld-practice-v1";
const openapi = JSON.parse(
  readFileSync(
    new URL("../../contracts/openapi.json", import.meta.url),
    "utf8",
  ),
);
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
addFormats(ajv);
ajv.addFormat("int64", true);
function validator(schema: object) {
  return ajv.compile(
    JSON.parse(
      JSON.stringify({ ...schema, $defs: openapi.components.schemas })
        .split("#/components/schemas/")
        .join("#/$defs/"),
    ),
  );
}
const validTopic = validator(openapi.components.schemas.TopicDetail);
const validDescriptor = validator(
  openapi.paths[descriptorPath].get.responses["200"].content["application/json"]
    .schema,
);
const validResult = validator(openapi.components.schemas.QueueCapacityResult);
const validProblem = validator(openapi.components.schemas.ApiError);
const questions = JSON.parse(
  readFileSync(
    new URL(`../../content/topics/${id}/questions.json`, import.meta.url),
    "utf8",
  ),
);
const written = questions.find(
  (question: { options?: unknown[] }) => !question.options,
);

const runButton = (page: Page) =>
  page.getByRole("button", { name: "Run queue simulation", exact: true });
const metrics = (page: Page) =>
  page.getByLabel("Queue run metrics", { exact: true });
const position = (page: Page) =>
  page.getByText(/^(Initial state · \d+ events|Event \d+ of \d+ · \d+ ms)$/);
function observePosts(page: Page) {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(runPath))
      posts.push(request.postData()!);
  });
  return posts;
}
async function runActual(page: Page) {
  const pending = page.waitForResponse(
    (response) =>
      response.url().endsWith(runPath) &&
      response.request().method() === "POST",
  );
  await runButton(page).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const result: QueueCapacityResult = await response.json();
  expect(validResult(result), JSON.stringify(validResult.errors)).toBe(true);
  await expect(metrics(page)).toBeVisible();
  await expect(
    page.getByText(`Model v${result.modelVersion} · Virtual time · FIFO`, {
      exact: true,
    }),
  ).toBeVisible();
  return result;
}
async function descriptor(request: APIRequestContext) {
  const response = await request.get(descriptorPath);
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(validDescriptor(body), JSON.stringify(validDescriptor.errors)).toBe(
    true,
  );
  return body;
}
async function selectPreset(
  page: Page,
  request: APIRequestContext,
  presetId: string,
) {
  const body = await descriptor(request);
  const preset = body.presets.find(
    (entry: { id: string }) => entry.id === presetId,
  );
  expect(preset).toBeTruthy();
  await page.getByRole("button", { name: preset.title, exact: true }).click();
}
async function assertSnapshot(page: Page, state: QueueCapacityState) {
  const waiting = page.getByRole("region", {
    name: "Shared waiting queue",
    exact: true,
  });
  await expect(waiting.getByRole("listitem")).toHaveCount(
    state.queuedJobIds.length,
  );
  if (state.queuedJobIds.length === 0)
    await expect(waiting).toContainText(/no waiting jobs/i);
  else {
    for (const job of state.queuedJobIds)
      await expect(waiting).toContainText(job);
    const rendered = await waiting.innerText();
    const offsets = state.queuedJobIds.map((job) => rendered.indexOf(job));
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  }
  for (const worker of state.workers) {
    const card = page.getByRole("region", {
      name: `Worker ${worker.id}`,
      exact: true,
    });
    await expect(card).toContainText(worker.jobId ?? "Idle");
    if (worker.jobId) {
      await expect(
        card.getByText(`Started at ${worker.startedAtMs} ms`, { exact: true }),
      ).toBeVisible();
      await expect(
        card.getByText(
          `Scheduled completion: ${worker.scheduledCompletionAtMs} ms`,
          { exact: true },
        ),
      ).toBeVisible();
    }
  }
}

test("real Java draft contracts and meaningful presets agree while public discovery excludes the draft", async ({
  request,
}) => {
  const topic = await request.get(topicPath);
  expect(topic.status()).toBe(200);
  const detail = await topic.json();
  expect(validTopic(detail), JSON.stringify(validTopic.errors)).toBe(true);
  expect(detail.topic.status).toBe("draft");
  const unavailable = await request.get(`/api/v1/topics/${id}`);
  expect(unavailable.status()).toBe(404);
  const problem = await unavailable.json();
  expect(validProblem(problem), JSON.stringify(validProblem.errors)).toBe(true);
  for (const path of ["/api/v1/topics", "/api/v1/case-studies"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(
      (await response.json()).some((entry: { id: string }) => entry.id === id),
    ).toBe(false);
  }
  const search = await request.get("/api/v1/search?q=queues-tail-latency");
  expect(search.status()).toBe(200);
  expect(JSON.stringify(await search.json())).not.toContain(`"id":"${id}"`);
  const path = await request.get("/api/v1/learning-paths/first-system-design");
  expect(path.status()).toBe(200);
  expect(JSON.stringify(await path.json())).not.toContain(id);
  const body = await descriptor(request);
  expect(body.presets.map((preset: { id: string }) => preset.id)).toEqual(
    expect.arrayContaining([
      "baseline",
      "larger-buffer",
      "more-workers",
      "slow-job",
      "virtual-limit",
    ]),
  );
  for (const preset of body.presets) {
    const response = await request.post(runPath, { data: preset.input });
    expect(response.status()).toBe(200);
    const result: QueueCapacityResult = await response.json();
    expect(validResult(result), JSON.stringify(validResult.errors)).toBe(true);
    if (preset.id === "baseline") {
      expect(result.metrics.completed).toBe(2);
      expect(result.metrics.rejected).toBe(2);
      expect(result.metrics.meanSuccessfulLatencyMs).toBe(15);
    } else if (preset.id === "larger-buffer") {
      expect(result.metrics.completed).toBe(4);
      expect(result.metrics.meanSuccessfulLatencyMs).toBe(25);
    } else if (preset.id === "more-workers") {
      expect(result.metrics.completed).toBe(3);
      expect(result.metrics.rejected).toBe(1);
    } else if (preset.id === "slow-job") {
      expect(result.outcomes.map((job) => job.startTimeMs)).toEqual([
        0, 100, 101, 102,
      ]);
    } else if (preset.id === "virtual-limit") {
      expect(result.status).toBe("limited");
      expect(result.truncationReason).toBe("virtual_time_limit");
      expect(result.metrics.running).toBe(1);
      expect(result.metrics.successfulSamples).toBe(0);
      expect(result.metrics.meanSuccessfulLatencyMs).toBeUndefined();
    }
  }
});

test("queue inputs run only explicitly, change real results and seek the authoritative Java snapshots", async ({
  page,
}) => {
  const posts = observePosts(page);
  await page.goto(route);
  await expect(
    page.getByRole("region", { name: "Draft queue module" }),
  ).toBeVisible();
  await expect(runButton(page)).toBeEnabled();
  expect(posts).toHaveLength(0);
  const first = await runActual(page);
  await expect(metrics(page)).toContainText(/Completed\s*2/);
  await expect(metrics(page)).toContainText(/Rejected\s*2/);
  await expect(
    metrics(page)
      .getByText("Mean successful latency", { exact: true })
      .locator(".."),
  ).toContainText("15");
  await expect(position(page)).toHaveText(
    `Initial state · ${first.events.length} events`,
  );
  await assertSnapshot(page, first.initialState);
  await page.getByRole("button", { name: "Next event", exact: true }).click();
  await assertSnapshot(page, first.events[0]!.state);
  await page.getByRole("button", { name: "Next event", exact: true }).click();
  await assertSnapshot(page, first.events[1]!.state);
  const seek = page.getByLabel("Trace position", { exact: true });
  await seek.focus();
  await page.keyboard.press("End");
  await assertSnapshot(page, first.finalState);
  await page
    .getByRole("button", { name: "Previous event", exact: true })
    .click();
  await assertSnapshot(page, first.events[first.events.length - 2]!.state);
  await page.getByLabel("Waiting slots", { exact: true }).fill("3");
  await expect(
    page.getByRole("status").filter({ hasText: "Inputs changed" }),
  ).toBeVisible();
  const larger = await runActual(page);
  expect(larger.metrics.completed).toBe(4);
  expect(larger.metrics.meanSuccessfulLatencyMs).toBe(25);
  await expect(metrics(page)).toContainText(/Completed\s*4/);
  await expect(
    metrics(page)
      .getByText("Mean successful latency", { exact: true })
      .locator(".."),
  ).toContainText("25");
  await page.getByLabel("Waiting slots", { exact: true }).fill("1");
  await page.getByLabel("Workers", { exact: true }).fill("2");
  const workers = await runActual(page);
  expect(workers.metrics.completed).toBe(3);
  expect(workers.metrics.rejected).toBe(1);
  await expect(metrics(page)).toContainText(/Completed\s*3/);
  expect(posts).toHaveLength(3);
});

test("slow work keeps FIFO waiting visible and a virtual limit never fabricates completion", async ({
  page,
  request,
}) => {
  await page.goto(route);
  await selectPreset(page, request, "slow-job");
  const slow = await runActual(page);
  expect(slow.outcomes.map((job) => job.startTimeMs)).toEqual([
    0, 100, 101, 102,
  ]);
  const outcomes = page.getByRole("table", {
    name: "Queue job outcomes",
    exact: true,
  });
  await expect(
    outcomes.getByRole("row").filter({ hasText: "job-2" }),
  ).toContainText("100");
  await selectPreset(page, request, "virtual-limit");
  const limited = await runActual(page);
  expect(limited.status).toBe("limited");
  expect(limited.metrics.completed).toBe(0);
  expect(limited.metrics.running).toBe(1);
  expect(limited.metrics.meanSuccessfulLatencyMs).toBeUndefined();
  await expect(
    page.getByRole("status").filter({ hasText: "Virtual time limit reached" }),
  ).toBeVisible();
  await expect(metrics(page)).toContainText(/1 running/);
  await expect(metrics(page)).toContainText(/unavailable/i);
  await page.getByLabel("Trace position", { exact: true }).focus();
  await page.keyboard.press("End");
  await assertSnapshot(page, limited.finalState);
  await expect(outcomes).toContainText("RUNNING");
  await expect(outcomes).not.toContainText("COMPLETED");
});

test("hidden panels pause browser playback and history preserves inputs without rerunning Java", async ({
  page,
}) => {
  const posts = observePosts(page);
  await page.goto(route);
  await page.getByLabel("Waiting slots", { exact: true }).fill("3");
  await runActual(page);
  // Only React playback timers are controlled; the run still comes from the actual Java API.
  await page.clock.install();
  await page.getByLabel("Playback speed", { exact: true }).selectOption("1200");
  await page.getByRole("button", { name: "Play trace", exact: true }).click();
  await page.clock.fastForward(1200);
  await expect(position(page)).toContainText("Event 1 of");
  const paused = await position(page).innerText();
  await page.getByRole("tab", { name: "Study", exact: true }).click();
  await expect(page).toHaveURL(/view=study/);
  await expect(
    page.getByRole("tab", { name: "Study", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.clock.fastForward(10_000);
  await page.goBack();
  await expect(
    page.getByRole("tab", { name: "Playground", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(position(page)).toHaveText(paused);
  await expect(
    page.getByRole("button", { name: "Play trace", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Waiting slots", { exact: true })).toHaveValue(
    "3",
  );
  await page.clock.fastForward(5000);
  await expect(position(page)).toHaveText(paused);
  await page.goForward();
  await expect(
    page.getByRole("tab", { name: "Study", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(posts).toHaveLength(1);
});

test("draft practice saves, reloads and resumes its exact question from home without starting a run", async ({
  page,
}) => {
  const posts = observePosts(page);
  await page.goto(`${route}?view=practice`);
  await expect(
    page.getByRole("tab", { name: "Practice", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const article = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: written.prompt, exact: true }),
  });
  const field = article.getByRole("textbox", {
    name: "Your explanation",
    exact: true,
  });
  const answer =
    "A larger waiting queue accepts this burst but makes later jobs wait longer; it adds no worker capacity.";
  await field.fill(answer);
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), practiceStorageKey),
    )
    .toContain(answer);
  await article
    .getByRole("button", { name: "Compare with a model answer", exact: true })
    .click();
  await expect(
    article.getByText("Example answer", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(field).toHaveValue(answer);
  await expect(
    article.getByText("Example answer", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Study", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Study", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("region", { name: "Draft queue module" }),
  ).toBeVisible();
  await page.goto("/");
  const continuation = page.getByRole("region", {
    name: "Continue learning",
    exact: true,
  });
  await expect(
    continuation.getByText("Draft topic · Saved work", { exact: true }),
  ).toBeVisible();
  const link = continuation.getByRole("link", { name: "Continue saved work" });
  await expect(link).toHaveAttribute(
    "href",
    `${route}?view=practice&question=${written.id}`,
  );
  await link.click();
  await expect(page).toHaveURL(
    new RegExp(`view=practice&question=${written.id}$`),
  );
  await expect(field).toHaveValue(answer);
  await expect(
    page.locator(`[data-question-id="${written.id}"]`),
  ).toBeFocused();
  expect(posts).toHaveLength(0);
});

test("explicitly mocked draft load error retries the actual Java lesson", async ({
  page,
}) => {
  await page.route(`**${topicPath}`, (request) => request.abort());
  await page.goto(route);
  await expect(page.getByRole("alert")).toContainText(/cannot reach/i);
  await expect(runButton(page)).toHaveCount(0);
  await page.unroute(`**${topicPath}`);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(runButton(page)).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const failure of [
  {
    status: 413,
    code: "request_too_large",
    message: "This workload is too large to send. Reduce it and try again.",
  },
  {
    status: 422,
    code: "result_too_large",
    message:
      "This run produced more data than the app can return. Reduce the workload and try again.",
  },
  {
    status: 503,
    code: "simulation_busy",
    message:
      "The simulator is busy. Keep your inputs and try again in a moment.",
  },
]) {
  test(`explicitly mocked run error ${failure.status} keeps inputs and labeled prior results until a real retry`, async ({
    page,
  }) => {
    const posts = observePosts(page);
    await page.goto(route);
    await runActual(page);
    const previous = await metrics(page).textContent();
    await page.getByLabel("Waiting slots", { exact: true }).fill("3");
    const problem = {
      code: failure.code,
      message: failure.message,
      fieldErrors: {},
      timestamp: "2026-10-12T18:00:00Z",
    };
    expect(validProblem(problem), JSON.stringify(validProblem.errors)).toBe(
      true,
    );
    await page.route(`**${runPath}`, (request) =>
      request.fulfill({
        status: failure.status,
        contentType: "application/json",
        headers: failure.status === 503 ? { "Retry-After": "1" } : {},
        json: problem,
      }),
    );
    await runButton(page).click();
    await expect(page.getByRole("alert")).toContainText(problem.message);
    await expect(runButton(page)).toBeEnabled();
    await expect(page.getByLabel("Waiting slots", { exact: true })).toHaveValue(
      "3",
    );
    await expect(metrics(page)).toHaveText(previous!);
    await expect(
      page.getByRole("status").filter({ hasText: "Inputs changed" }),
    ).toBeVisible();
    expect(posts).toHaveLength(2);
    await page.unroute(`**${runPath}`);
    const recovered = await runActual(page);
    expect(recovered.metrics.completed).toBe(4);
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(posts).toHaveLength(3);
    expect(posts[2]).toBe(posts[1]);
  });
}

for (const incompatibility of ["model", "schema", "event"] as const) {
  test(`explicitly incompatible ${incompatibility} cannot render a trace and recovers after an explicit retry`, async ({
    page,
  }) => {
    await page.route(`**${runPath}`, async (request) => {
      const response = await request.fetch();
      const body = await response.json();
      if (incompatibility === "model") body.modelVersion = "99.0.0";
      if (incompatibility === "schema") body.schemaVersion = "99.0";
      if (incompatibility === "event") body.events[0].kind = "job.fabricated";
      await request.fulfill({ response, json: body });
    });
    await page.goto(route);
    await runButton(page).click();
    await expect(page.getByRole("alert")).toContainText(/incompatible/i);
    await expect(
      page.getByRole("table", { name: "Queue job outcomes", exact: true }),
    ).toHaveCount(0);
    await page.unroute(`**${runPath}`);
    await runActual(page);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`draft keyboard run and playback fit mobile/tablet/desktop in ${theme} with reduced motion`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto(route);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await runButton(page).focus();
      await page.keyboard.press("Enter");
      await expect(metrics(page)).toBeVisible();
      await expect(position(page)).toContainText("Initial state");
      const next = page.getByRole("button", {
        name: "Next event",
        exact: true,
      });
      await next.focus();
      await page.keyboard.press("Enter");
      await expect(next).toBeFocused();
      await expect(position(page)).toContainText("Event 1 of");
      const seek = page.getByLabel("Trace position", { exact: true });
      await seek.focus();
      await page.keyboard.press("End");
      await expect(seek).toBeFocused();
      await expect(
        page.getByRole("button", { name: "Next event", exact: true }),
      ).toBeDisabled();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      // Capture the full document without a scrolled sticky rail obscuring content.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: testInfo.outputPath(`queue-${width}-${theme}.png`),
        fullPage: true,
      });
    }
  });
}
