import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import type {
  DeliveryDescriptor,
  DeliveryResult,
  DeliveryState,
} from "../src/api/types";

const id = "queues-delivery";
const route = `/draft/topics/${id}`;
const descriptorPath = `/api/v1/simulations/${id}`;
const runPath = `${descriptorPath}/runs`;
const ajv = new Ajv2020({ strict: true, strictRequired: false });
const schema = JSON.parse(
  readFileSync(
    new URL(
      "../../contracts/queue-delivery.result.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const valid = ajv.compile(schema);
const questions = JSON.parse(
  readFileSync(
    new URL(`../../content/topics/${id}/questions.json`, import.meta.url),
    "utf8",
  ),
);
const run = (page: Page) =>
  page.getByRole("button", { name: "Run delivery simulation", exact: true });
const position = (page: Page) =>
  page.getByText(/^(Initial state · \d+ events|Event \d+ of \d+ · \d+ ms)$/);
function posts(page: Page) {
  const inputs: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(runPath))
      inputs.push(request.postData()!);
  });
  return inputs;
}
async function descriptor(
  request: APIRequestContext,
): Promise<DeliveryDescriptor> {
  const response = await request.get(descriptorPath);
  expect(response.status()).toBe(200);
  return response.json();
}
async function preset(
  page: Page,
  request: APIRequestContext,
  presetId: string,
) {
  const item = (await descriptor(request)).presets.find(
    (item) => item.id === presetId,
  )!;
  expect(item).toBeTruthy();
  await page.getByRole("button", { name: item.title, exact: true }).click();
}
async function runActual(page: Page): Promise<DeliveryResult> {
  const pending = page.waitForResponse(
    (response) =>
      response.url().endsWith(runPath) &&
      response.request().method() === "POST",
  );
  await run(page).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(valid(body), JSON.stringify(valid.errors)).toBe(true);
  await expect(position(page)).toHaveText(
    `Initial state · ${body.events.length} events`,
  );
  return body;
}
async function end(page: Page) {
  const seek = page.getByLabel("Trace position", { exact: true });
  await seek.focus();
  await page.keyboard.press("End");
}
async function state(page: Page, current: DeliveryState, ledgerCount: number) {
  const broker = page.getByRole("region", {
    name: "Broker messages at the selected position",
    exact: true,
  });
  const consumers = page.getByRole("region", {
    name: "Consumers at the selected position",
    exact: true,
  });
  for (const message of current.messages) {
    const item = broker.getByRole("listitem", {
      name: `Message ${message.id}`,
      exact: true,
    });
    await expect(item).toContainText(
      `${message.deliveryCount} delivery attempts`,
    );
    const labels = {
      NOT_ENQUEUED: "Not enqueued",
      READY: "Ready",
      LEASED: "Leased",
      ACKNOWLEDGED: "Acknowledged",
      DEAD_LETTERED: "Dead lettered",
    };
    await expect(item).toContainText(labels[message.status]);
    await expect(item).toContainText(
      `Current attempt: ${message.currentAttemptId ?? "None"}`,
    );
  }
  for (const consumer of current.consumers) {
    const item = consumers.getByRole("listitem", {
      name: `Consumer ${consumer.id}`,
      exact: true,
    });
    await expect(item).toContainText(
      `Current processing attempt: ${consumer.currentAttemptId ?? "None"}`,
    );
    await expect(item).toContainText(
      consumer.status === "DOWN" ? "Down" : "Up",
    );
  }
  await expect(
    page
      .getByRole("region", {
        name: "Committed ledger at the selected position",
        exact: true,
      })
      .getByRole("listitem"),
  ).toHaveCount(ledgerCount);
}

test("delivery draft descriptors, all nine presets and publication boundaries agree with real Java", async ({
  request,
}) => {
  const topicResponse = await request.get(`/api/v1/draft/topics/${id}`);
  expect(topicResponse.status()).toBe(200);
  const topic = await topicResponse.json();
  expect(topic.topic.status).toBe("draft");
  expect(topic.topic.capabilities).toEqual([
    "study",
    "simulation",
    "guided",
    "practice",
  ]);
  expect(topic.questions).toEqual(questions);
  expect((await request.get(`/api/v1/topics/${id}`)).status()).toBe(404);
  for (const path of [
    "/api/v1/topics",
    "/api/v1/case-studies",
    `/api/v1/search?q=${id}`,
    "/api/v1/learning-paths/first-system-design",
  ])
    expect(
      JSON.stringify(await (await request.get(path)).json()),
    ).not.toContain(`"id":"${id}"`);
  const body = await descriptor(request);
  expect(body.presets).toHaveLength(9);
  const expected: Record<string, [number, number, number, string]> = {
    baseline: [1, 1, 0, "completed"],
    "lost-ack": [2, 2, 1, "completed"],
    "crash-before": [2, 1, 0, "completed"],
    "crash-after": [2, 2, 1, "completed"],
    "early-ack-crash": [1, 0, 0, "completed"],
    "lease-boundary": [2, 2, 1, "completed"],
    "overlapping-attempts": [2, 2, 1, "completed"],
    "virtual-limit": [1, 0, 0, "limited"],
    "no-recovery": [0, 0, 0, "limited"],
  };
  for (const item of body.presets) {
    const response = await request.post(runPath, { data: item.input });
    expect(response.status()).toBe(200);
    const result: DeliveryResult = await response.json();
    expect(valid(result), JSON.stringify(valid.errors)).toBe(true);
    expect([
      result.metrics.deliveryAttempts,
      result.metrics.committedEffects,
      result.metrics.extraEffects,
      result.status,
    ]).toEqual(expected[item.id]);
  }
});

test("explicit Java runs, lost ACK and complete entity replacement preserve broker/consumer/ledger evidence", async ({
  page,
  request,
}) => {
  const inputs = posts(page);
  await page.goto(route);
  await expect(run(page)).toBeEnabled();
  expect(inputs).toHaveLength(0);
  const baseline = await runActual(page);
  await state(page, baseline.initialState, 0);
  await page.getByRole("button", { name: "Next event", exact: true }).click();
  await expect(position(page)).toContainText("Event 1 of");
  await end(page);
  await state(page, baseline.finalState, baseline.ledger.length);
  await expect(
    page.getByRole("region", { name: "Consumers at the selected position" }),
  ).toContainText("No processing slot in use");
  await preset(page, request, "lost-ack");
  const lost = await runActual(page);
  expect(lost.metrics.meanAckLatencyMs).toBe(155);
  expect(lost.metrics.meanFirstEffectLatencyMs).toBe(50);
  const metrics = page.getByRole("region", {
    name: "Delivery run metrics",
    exact: true,
  });
  await expect(
    metrics.getByText("Mean ACK latency", { exact: true }).locator(".."),
  ).toContainText("155");
  await expect(
    metrics
      .getByText("Mean first-effect latency", { exact: true })
      .locator(".."),
  ).toContainText("50");
  await end(page);
  await state(page, lost.finalState, 2);
  await page
    .getByText("Inspect broker, consumer and attempt records", { exact: true })
    .click();
  const attempts = page.getByRole("table", {
    name: "Attempt records at the selected position",
    exact: true,
  });
  await expect(attempts).toContainText("m1-a1");
  await expect(attempts).toContainText("m1-a2");
  await expect(attempts).toContainText("m1-a2-lease");
  await page.getByLabel("Visibility lease (ms)", { exact: true }).fill("101");
  await expect(
    page.getByRole("status").filter({ hasText: /inputs changed/i }),
  ).toBeVisible();
  await runActual(page);
  expect(inputs).toHaveLength(3);
});

test("policy and exact deadline contrasts change authoritative results; post-dead-letter effects stay visible", async ({
  page,
  request,
}) => {
  await page.goto(route);
  await preset(page, request, "early-ack-crash");
  const early = await runActual(page);
  expect(early.metrics.acknowledgedWithoutEffect).toBe(1);
  await end(page);
  await state(page, early.finalState, 0);
  await page
    .getByLabel("ACK policy", { exact: true })
    .selectOption("ACK_AFTER_EFFECT");
  const after = await runActual(page);
  expect(after.metrics.committedEffects).toBe(1);
  expect(after.metrics.deliveryAttempts).toBe(2);
  await preset(page, request, "lease-boundary");
  const boundary = await runActual(page);
  expect(boundary.metrics.deadLetteredMessages).toBe(1);
  expect(boundary.metrics.ackLatencySamples).toBe(0);
  await page.getByLabel("Visibility lease (ms)", { exact: true }).fill("101");
  const accepted = await runActual(page);
  expect(accepted.metrics.deliveryAttempts).toBe(1);
  expect(accepted.metrics.meanAckLatencyMs).toBe(100);
  await preset(page, request, "overlapping-attempts");
  const overlap = await runActual(page);
  await end(page);
  await state(page, overlap.finalState, 2);
  expect(overlap.lastVirtualTimeMs).toBe(255);
  await page.getByText(/Inspect the full event trace \(/).click();
  const trace = page.getByRole("table", {
    name: "Delivery simulation event trace",
    exact: true,
  });
  const dlq = overlap.events.find(
    (event) => event.kind === "message.dead-lettered",
  )!;
  await trace
    .getByRole("button", { name: `View event ${dlq.sequence}`, exact: true })
    .click();
  await expect(
    page
      .getByRole("region", {
        name: "Committed ledger at the selected position",
      })
      .getByRole("listitem"),
  ).toHaveCount(1);
  await end(page);
  await expect(
    page.getByRole("region", {
      name: "Committed ledger at the selected position",
    }),
  ).toContainText("Committed at 250 ms");
});

test("message row filtering preserves every earlier world change and pending limited evidence", async ({
  page,
  request,
}) => {
  await page.goto(route);
  await page.getByText("Advanced workload and faults", { exact: true }).click();
  await page.getByLabel("Messages", { exact: true }).fill("m1, 0\nm2, 0");
  await page.getByLabel("Consumers", { exact: true }).fill("c1\nc2");
  const result = await runActual(page);
  await page.getByText(/Inspect the full event trace \(/).click();
  await page.getByLabel("Message filter", { exact: true }).selectOption("m1");
  const m1Events = result.events.filter((event) => event.messageId === "m1");
  const lastM1 = m1Events[m1Events.length - 1]!;
  await page
    .getByRole("button", { name: `View event ${lastM1.sequence}`, exact: true })
    .click();
  const priorEffects = result.events.filter(
    (event) => event.sequence <= lastM1.sequence && event.ledgerEntry,
  );
  await expect(
    page
      .getByRole("region", {
        name: "Committed ledger at the selected position",
      })
      .getByRole("listitem"),
  ).toHaveCount(priorEffects.length);
  expect(priorEffects.some((event) => event.messageId === "m2")).toBe(true);
  await preset(page, request, "virtual-limit");
  const limited = await runActual(page);
  expect(limited.truncationReason).toBe("virtual_time_limit");
  expect(limited.metrics.acknowledgedWithoutEffect).toBeUndefined();
  const prefixMetrics = page.getByRole("region", {
    name: "Delivery run metrics",
    exact: true,
  });
  await expect(
    prefixMetrics
      .getByText("Acknowledged without effect", { exact: true })
      .locator(".."),
  ).toContainText("Unavailable");
  await expect(
    prefixMetrics.getByText("Mean ACK latency", { exact: true }).locator(".."),
  ).toContainText("Unavailable");
  await end(page);
  await state(page, limited.finalState, 0);
  await page
    .getByText("Inspect broker, consumer and attempt records", { exact: true })
    .click();
  await expect(
    page.getByRole("table", {
      name: "Attempt records at the selected position",
      exact: true,
    }),
  ).toContainText("60050");
  await preset(page, request, "no-recovery");
  const stalled = await runActual(page);
  expect(stalled.truncationReason).toBe("no_future_progress");
  await end(page);
  await state(page, stalled.finalState, 0);
});

test("invalid advanced faults focus their field and no Java request is manufactured", async ({
  page,
}) => {
  const inputs = posts(page);
  await page.goto(route);
  await expect(run(page)).toBeEnabled();
  await page.getByText("Advanced workload and faults", { exact: true }).click();
  await page
    .getByLabel("Consumer failures", { exact: true })
    .fill("c1, RECOVER, 25");
  await run(page).click();
  await expect(
    page.getByLabel("Consumer failures", { exact: true }),
  ).toBeFocused();
  await expect(
    page.getByLabel("Consumer failures", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  expect(inputs).toHaveLength(0);
  await page
    .getByLabel("Consumer failures", { exact: true })
    .fill("c1, RECOVER, 75\nc1, CRASH, 25");
  const result = await runActual(page);
  expect(result.metrics.committedEffects).toBe(1);
  expect(inputs).toHaveLength(1);
});

test("hidden playback pauses and browser history keeps inputs and result without another run", async ({
  page,
}) => {
  const inputs = posts(page);
  await page.goto(route);
  await page.getByLabel("Visibility lease (ms)", { exact: true }).fill("101");
  await runActual(page);
  await page.clock.install();
  await page.getByLabel("Playback speed", { exact: true }).selectOption("1200");
  await page.getByRole("button", { name: "Play trace", exact: true }).click();
  await page.clock.fastForward(1200);
  const paused = await position(page).innerText();
  await page.getByRole("tab", { name: "Study", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Study", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.clock.fastForward(10000);
  await page.goBack();
  await expect(position(page)).toHaveText(paused);
  await expect(
    page.getByLabel("Visibility lease (ms)", { exact: true }),
  ).toHaveValue("101");
  await expect(
    page.getByRole("button", { name: "Play trace", exact: true }),
  ).toBeVisible();
  expect(inputs).toHaveLength(1);
});

test("draft Practice answers survive reload and resume from home at their exact question", async ({
  page,
}) => {
  const inputs = posts(page);
  const question = questions[0];
  await page.goto(`${route}?view=practice`);
  const article = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: question.prompt, exact: true }),
  });
  const field = article.getByRole("textbox", {
    name: "Your explanation",
    exact: true,
  });
  const answer =
    "A committed effect survives the lost ACK; the retry appends again, so delivery and work counts differ.";
  await field.fill(answer);
  await article
    .getByRole("button", { name: "Compare with a model answer", exact: true })
    .click();
  await expect(
    article.getByText("Example answer", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(field).toHaveValue(answer);
  await page.goto("/");
  const card = page.getByRole("region", {
    name: "Continue learning",
    exact: true,
  });
  const link = card.getByRole("link", { name: "Continue saved work" });
  await expect(link).toHaveAttribute(
    "href",
    `${route}?view=practice&question=${question.id}`,
  );
  await link.click();
  await expect(
    page.locator(`[data-question-id="${question.id}"]`),
  ).toBeFocused();
  await expect(field).toHaveValue(answer);
  expect(inputs).toHaveLength(0);
});

for (const status of [413, 422, 503]) {
  test(`explicitly mocked ${status} preserves inputs and prior Java result until explicit retry`, async ({
    page,
  }) => {
    const inputs = posts(page);
    await page.goto(route);
    const baseline = await runActual(page);
    await page.getByLabel("Visibility lease (ms)", { exact: true }).fill("101");
    const code =
      status === 413
        ? "request_too_large"
        : status === 422
          ? "result_too_large"
          : "simulation_busy";
    await page.route(`**${runPath}`, (request) =>
      request.fulfill({
        status,
        contentType: "application/json",
        json: {
          code,
          message: "Keep this workload and explicitly retry.",
          fieldErrors: {},
          timestamp: "2026-10-12T19:00:00Z",
        },
      }),
    );
    await run(page).click();
    await expect(page.getByRole("alert")).toContainText("Keep this workload");
    await expect(
      page.getByLabel("Visibility lease (ms)", { exact: true }),
    ).toHaveValue("101");
    await expect(position(page)).toHaveText(
      `Initial state · ${baseline.events.length} events`,
    );
    await page.unroute(`**${runPath}`);
    await runActual(page);
    expect(inputs).toHaveLength(3);
    expect(inputs[2]).toBe(inputs[1]);
  });
}
for (const mismatch of ["model", "schema", "event", "identity"] as const) {
  test(`incompatible ${mismatch} response cannot become a displayed trace and explicit retry recovers`, async ({
    page,
  }) => {
    await page.route(`**${runPath}`, async (request) => {
      const response = await request.fetch();
      const body = await response.json();
      if (mismatch === "model") body.modelVersion = "99.0.0";
      if (mismatch === "schema") body.schemaVersion = "99.0";
      if (mismatch === "event") body.events[0].kind = "message.fabricated";
      if (mismatch === "identity") body.seed += 1;
      await request.fulfill({ response, json: body });
    });
    await page.goto(route);
    await run(page).click();
    await expect(page.getByRole("alert")).toContainText(/incompatible/i);
    await expect(position(page)).toHaveCount(0);
    await page.unroute(`**${runPath}`);
    await runActual(page);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}
for (const theme of ["light", "dark"] as const) {
  test(`delivery keyboard playback and three tabs fit mobile tablet desktop in ${theme} reduced motion`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto(route);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await run(page).focus();
      await page.keyboard.press("Enter");
      await expect(position(page)).toContainText("Initial state");
      const next = page.getByRole("button", {
        name: "Next event",
        exact: true,
      });
      await next.focus();
      await page.keyboard.press("Enter");
      await expect(next).toBeFocused();
      const seek = page.getByLabel("Trace position", { exact: true });
      await seek.focus();
      await page.keyboard.press("End");
      await expect(seek).toBeFocused();
      await expect(next).toBeDisabled();
      for (const tab of ["Study", "Practice", "Playground"]) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        await expect(
          page.getByRole("tab", { name: tab, exact: true }),
        ).toHaveAttribute("aria-selected", "true");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: testInfo.outputPath(`delivery-${width}-${theme}.png`),
        fullPage: true,
      });
    }
  });
}

test("explicit draft-load retry reaches the actual lesson without automatically running", async ({
  page,
}) => {
  const inputs = posts(page);
  const path = `/api/v1/draft/topics/${id}`;
  await page.route(`**${path}`, (request) => request.abort());
  await page.goto(route);
  await expect(page.getByRole("alert")).toContainText(/cannot reach/i);
  await expect(run(page)).toHaveCount(0);
  await page.unroute(`**${path}`);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(run(page)).toBeEnabled();
  await expect(
    page.getByRole("region", { name: "Draft delivery module", exact: true }),
  ).toBeVisible();
  expect(inputs).toHaveLength(0);
});

test("canonical delivery validation stays lazy on a published lesson and loads for the explicit draft", async ({
  page,
}) => {
  const compilerRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/assets\/deliveryCompatibility-[^/]+\.js/.test(request.url()))
      compilerRequests.push(request.url());
  });
  await page.goto("/topics/request-flow?view=study");
  await expect(
    page.getByRole("tab", { name: "Study", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(compilerRequests).toHaveLength(0);
  await page.goto(route);
  await expect(run(page)).toBeEnabled();
  expect(compilerRequests).toHaveLength(1);
  await runActual(page);
  expect(compilerRequests).toHaveLength(1);
});
