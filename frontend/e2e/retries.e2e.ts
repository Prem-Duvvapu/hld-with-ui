import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import Ajv2020 from "ajv/dist/2020.js";
import type {
  RetryDescriptor,
  RetryResult,
  RetryState,
} from "../src/api/types";

const route = "/draft/topics/timeouts-retries";
const runPath = "/api/v1/simulations/timeouts-retries/runs";
const read = (path: string) =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: true, strictRequired: false });
ajv.addSchema(read("contracts/timeouts-retries.input.schema.json"));
const valid = ajv.compile(
  read("contracts/timeouts-retries.result.schema.json"),
);
const descriptor = read(
  "contracts/examples/timeouts-retries-descriptor.json",
) as RetryDescriptor;
const button = (page: Page) =>
  page.getByRole("button", { name: "Run retry experiment", exact: true });
function posts(page: Page) {
  const bodies: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(runPath))
      bodies.push(request.postData()!);
  });
  return bodies;
}
async function run(page: Page): Promise<RetryResult> {
  const pending = page.waitForResponse(
    (response) =>
      response.url().endsWith(runPath) &&
      response.request().method() === "POST",
  );
  await button(page).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(valid(result), JSON.stringify(valid.errors)).toBe(true);
  await expect(
    page.getByRole("region", {
      name: "Java retry simulation results",
      exact: true,
    }),
  ).toBeVisible();
  return result;
}
async function fact(scope: Locator, label: string, value: string | number) {
  await expect(
    scope.getByText(label, { exact: true }).locator("..").locator("dd"),
  ).toHaveText(String(value));
}
async function snapshot(page: Page, result: RetryResult, position: number) {
  await page
    .getByRole("slider", { name: "Retry snapshot position", exact: true })
    .fill(String(position));
  const state: RetryState = position
    ? result.events[position - 1]!.postState
    : result.initialState;
  const selected = page.getByRole("region", {
    name: "Selected retry snapshot",
    exact: true,
  });
  for (const request of state.requests) {
    const caller = selected.getByRole("article", {
      name: `Caller ${request.id}`,
      exact: true,
    });
    await fact(caller, "Attempts sent", request.attemptsSent);
    await fact(caller, "Active attempt", request.activeAttemptId ?? "None");
    await fact(
      caller,
      "Scheduled retry",
      request.nextRetryAtMs === undefined
        ? "None scheduled"
        : `${request.nextRetryAtMs} ms`,
    );
  }
  await expect(
    selected
      .getByRole("region", { name: "Retry server waiting queue", exact: true })
      .locator("li"),
  ).toHaveText(state.queue);
  await expect(
    selected
      .getByRole("region", { name: "Retry server workers", exact: true })
      .locator("li"),
  ).toHaveText(
    state.workers.map(
      (worker) => `${worker.id} · ${worker.attemptId ?? "Idle"}`,
    ),
  );
  for (const attempt of state.attempts) {
    const card = selected.getByRole("article", {
      name: `Retry attempt ${attempt.id}`,
      exact: true,
    });
    await fact(card, "Sent", `${attempt.sentAtMs} ms`);
    await fact(
      card,
      "Work started",
      attempt.startedAtMs === undefined
        ? "Not observed"
        : `${attempt.startedAtMs} ms`,
    );
    await fact(
      card,
      "Work completed",
      attempt.completedAtMs === undefined
        ? "Not observed"
        : `${attempt.completedAtMs} ms`,
    );
  }
  if (position)
    await expect(
      page
        .getByRole("region", { name: "Selected retry event", exact: true })
        .getByText(result.events[position - 1]!.explanation, { exact: true }),
    ).toBeVisible();
  return selected;
}

test("all eight actual Java scenarios replay with exact caller/work snapshots and no automatic runs", async ({
  page,
  request,
}) => {
  const sent = posts(page);
  await page.goto(route);
  await expect(button(page)).toBeVisible();
  expect(sent).toHaveLength(0);
  for (const preset of descriptor.presets) {
    await page.getByRole("button", { name: preset.title, exact: true }).click();
    const result = await run(page);
    expect(result.input).toEqual(preset.input);
    const reference = await request.post(runPath, { data: preset.input });
    expect(reference.status()).toBe(200);
    expect(result).toEqual(await reference.json());
    await snapshot(page, result, 0);
    const interesting = result.events.findIndex(
      (event) =>
        event.kind === "RETRY_BLOCKED_BY_DEADLINE" ||
        event.kind === "ATTEMPT_TIMED_OUT",
    );
    if (interesting >= 0) await snapshot(page, result, interesting + 1);
    await snapshot(page, result, result.events.length);
    const summary = page.getByRole("region", {
      name: "Whole retry experiment summary",
      exact: true,
    });
    await fact(summary, "Attempts sent", result.metrics.attemptsSent);
    await fact(
      summary,
      "Completed server work",
      result.metrics.completedServerWork,
    );
    await fact(summary, "Failed callers", result.metrics.failedRequests);
  }
  expect(sent).toHaveLength(8);
  expect((await request.get("/api/v1/topics")).status()).toBe(200);
  expect(
    (await (await request.get("/api/v1/topics")).json()).some(
      (entry: { id: string }) => entry.id === "timeouts-retries",
    ),
  ).toBe(false);
  expect((await request.get("/api/v1/topics/timeouts-retries")).status()).toBe(
    404,
  );
});

test("edited inputs, blanks, late work and tab/history preserve the actual submitted run", async ({
  page,
}) => {
  const sent = posts(page);
  await page.goto(route);
  const first = await run(page);
  expect(first.metrics.lateCompletions).toBe(2);
  const queued = first.events.findIndex(
    (event) => event.kind === "WORK_QUEUED",
  );
  const selected = await snapshot(page, first, queued + 1);
  await expect(
    selected
      .getByRole("article", { name: "Retry attempt a-a1", exact: true })
      .getByText("Timed out", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Attempt timeout (ms)", { exact: true }).fill("");
  await expect(
    page.getByText(
      "Inputs changed. These results belong to the previous submitted workload. Run again to compare.",
      { exact: true },
    ),
  ).toBeVisible();
  await button(page).click();
  expect(sent).toHaveLength(1);
  await expect(
    page.getByLabel("Attempt timeout (ms)", { exact: true }),
  ).toBeFocused();
  await page.getByLabel("Attempt timeout (ms)", { exact: true }).fill("100");
  await page.getByRole("tab", { name: "Study", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Worked example", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByLabel("Attempt timeout (ms)", { exact: true }),
  ).toHaveValue("100");
  await expect(
    page.getByRole("slider", { name: "Retry snapshot position", exact: true }),
  ).toHaveValue(String(queued + 1));
  const healthy = await run(page);
  expect(healthy.input.attemptTimeoutMs).toBe(100);
  expect(healthy.metrics).toMatchObject({
    succeededRequests: 1,
    attemptsSent: 1,
    completedServerWork: 1,
    finalTimeMs: 80,
  });
  expect(sent).toHaveLength(2);
  await page.getByRole("tab", { name: "Practice", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Your explanation", exact: true }),
  ).toHaveCount(8);
  await page
    .locator('[data-question-id="retry-timeout-does-not-prove-cancellation"]')
    .getByRole("textbox", { name: "Your explanation", exact: true })
    .fill(
      "The caller stopped waiting; accepted work still completed. I need an effect-safety boundary before retrying a write.",
    );
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage
          .getItem("hld-practice-v1")
          ?.includes("accepted work still completed"),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Your explanation", exact: true }),
  ).toHaveCount(8);
  await expect(
    page
      .locator('[data-question-id="retry-timeout-does-not-prove-cancellation"]')
      .getByRole("textbox", { name: "Your explanation", exact: true }),
  ).toHaveValue(/accepted work still completed/);
  expect(sent).toHaveLength(2);
});

test("run failure keeps previous evidence and explicit retry recovers without an automatic POST", async ({
  page,
}) => {
  const sent = posts(page);
  await page.goto(route);
  await run(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = () => {};
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route(`**${runPath}`, async (handler) => {
    entered();
    await held;
    await handler.fulfill({
      status: 503,
      contentType: "application/json",
      headers: { "Retry-After": "1" },
      body: JSON.stringify({
        code: "simulation_busy",
        message: "The simulator is busy. Try again.",
        fieldErrors: {},
        timestamp: "2026-10-16T17:00:00Z",
      }),
    });
  });
  await button(page).click();
  try {
    await reached;
    await expect(
      page.getByRole("button", {
        name: "Running retry experiment…",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByLabel("Attempt timeout (ms)", { exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.getByRole("alert")).toContainText(/busy|try again/i);
  await expect(
    page.getByRole("region", {
      name: "Java retry simulation results",
      exact: true,
    }),
  ).toBeVisible();
  expect(sent).toHaveLength(2);
  await page.unroute(`**${runPath}`);
  await run(page);
  expect(sent).toHaveLength(3);
});

for (const theme of ["light", "dark"] as const) {
  test(`retry flow fits mobile tablet desktop with keyboard and reduced motion in ${theme}`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.addInitScript(
      (value) => localStorage.setItem("hld-theme", value),
      theme,
    );
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(route);
      await page.getByLabel("Attempt timeout (ms)", { exact: true }).focus();
      await page.keyboard.press("Tab");
      await expect(
        page.getByLabel("Overall timeout (ms)", { exact: true }),
      ).toBeFocused();
      const result = await run(page);
      await snapshot(page, result, result.events.length);
      for (const view of ["Playground", "Study", "Practice"]) {
        await page.getByRole("tab", { name: view, exact: true }).click();
        await expect(
          page.getByRole("tab", { name: view, exact: true }),
        ).toHaveAttribute("aria-selected", "true");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(
            `retries-${view.toLowerCase()}-${width}-${theme}.png`,
          ),
          fullPage: true,
        });
      }
    }
  });
}
