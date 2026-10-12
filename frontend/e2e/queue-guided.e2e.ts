import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { expect, test, type Page } from "@playwright/test";
import type {
  GuidedCheckpoint,
  QueueCapacityResult,
  QueueCapacityState,
} from "../src/api/types";

const id = "queues-tail-latency";
const moduleRoute = `/draft/topics/${id}`;
const topicPath = `/api/v1/draft/topics/${id}`;
const runPath = `/api/v1/simulations/${id}/runs`;
const checkpoints: GuidedCheckpoint[] = JSON.parse(
  readFileSync(
    new URL(`../../content/topics/${id}/checkpoints.json`, import.meta.url),
    "utf8",
  ),
);
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
const validResult = ajv.compile(
  JSON.parse(
    JSON.stringify({
      ...openapi.components.schemas.QueueCapacityResult,
      $defs: openapi.components.schemas,
    })
      .split("#/components/schemas/")
      .join("#/$defs/"),
  ),
);

const reveal = (page: Page) =>
  page.getByRole("button", { name: "Run and reveal", exact: true });
const prediction = (page: Page) =>
  page
    .getByRole("tabpanel", { name: "Guided", exact: true })
    .getByRole("textbox", { name: /^Your prediction/ });
const inspector = (page: Page) =>
  page.getByRole("region", { name: "Selected queue event", exact: true });

function observeRuns(page: Page) {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(runPath))
      posts.push(request.postData()!);
  });
  return posts;
}

async function runJava(page: Page) {
  const pending = page.waitForResponse(
    (response) =>
      response.url().endsWith(runPath) &&
      response.request().method() === "POST",
  );
  await reveal(page).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const result: QueueCapacityResult = await response.json();
  expect(validResult(result), JSON.stringify(validResult.errors)).toBe(true);
  return result;
}

async function selectCheckpoint(page: Page, checkpoint: GuidedCheckpoint) {
  await page
    .getByRole("navigation", { name: "Checkpoints", exact: true })
    .getByRole("button", { name: checkpoint.title, exact: false })
    .click();
  // The URL can update before React commits the newly selected textarea.
  await expect(
    page.getByRole("heading", { name: checkpoint.title, exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`checkpoint=${checkpoint.id}`));
}

async function assertSnapshot(page: Page, state: QueueCapacityState) {
  const waiting = page.getByRole("region", {
    name: "Shared waiting queue",
    exact: true,
  });
  await expect(waiting.getByRole("listitem")).toHaveCount(
    state.queuedJobIds.length,
  );
  for (let index = 0; index < state.queuedJobIds.length; index++)
    await expect(waiting.getByRole("listitem").nth(index)).toContainText(
      state.queuedJobIds[index]!,
    );
  if (!state.queuedJobIds.length)
    await expect(waiting).toContainText("No waiting jobs");
  for (const worker of state.workers) {
    const card = page.getByRole("region", {
      name: `Worker ${worker.id}`,
      exact: true,
    });
    await expect(card).toContainText(worker.jobId ?? "Idle");
    if (worker.jobId) {
      await expect(card).toContainText(`Started at ${worker.startedAtMs} ms`);
      await expect(card).toContainText(
        `Scheduled completion: ${worker.scheduledCompletionAtMs} ms`,
      );
    }
  }
}

async function captureFromTop(page: Page, path: string) {
  // Settle font layout before positioning; manual focus checks happen before this capture.
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path, fullPage: true });
}

test("all eight checkpoints reveal actual Java targets, snapshots and bounded preset reuse", async ({
  page,
}) => {
  const posts = observeRuns(page);
  const runs = new Map<string, QueueCapacityResult>();
  await page.goto(`${moduleRoute}?view=guided`);
  await expect(reveal(page)).toBeVisible();
  expect(posts).toHaveLength(0);
  expect(checkpoints).toHaveLength(8);
  for (const checkpoint of checkpoints) {
    await selectCheckpoint(page, checkpoint);
    await prediction(page).fill(
      `I predict the transition for ${checkpoint.id}.`,
    );
    let result = runs.get(checkpoint.presetId);
    if (!result) {
      result = await runJava(page);
      runs.set(checkpoint.presetId, result);
    } else await reveal(page).click();
    expect("jobId" in checkpoint.target).toBe(true);
    if (!("jobId" in checkpoint.target))
      throw new Error("Queue checkpoints require a job selector");
    const jobId = checkpoint.target.jobId;
    const matches = result.events.filter(
      (event) => event.jobId === jobId && event.kind === checkpoint.target.kind,
    );
    const target = matches[checkpoint.target.occurrence - 1];
    expect(target).toBeTruthy();
    await expect(inspector(page)).toContainText(target!.kind);
    await expect(inspector(page)).toContainText(target!.jobId);
    await expect(
      page.getByText(
        `Event ${target!.sequence} of ${result.events.length} · ${target!.timeMs} ms`,
        { exact: true },
      ),
    ).toBeVisible();
    await assertSnapshot(page, target!.state);
    await expect(
      page.getByRole("heading", { name: "3. Why it happens", exact: true }),
    ).toBeVisible();
    const recommended = checkpoint.tradeoff.options.find(
      (option) => option.id === checkpoint.tradeoff.recommendedOptionId,
    )!;
    await page
      .getByRole("radio", { name: recommended.label, exact: true })
      .check();
    await expect(page.locator(".guided-feedback")).toContainText(
      "Recommended choice.",
    );
    if (checkpoint.id === "censored-completion") {
      expect(result.status).toBe("limited");
      expect(result.metrics.completed).toBe(0);
      await expect(
        page.getByRole("status").filter({ hasText: "Partial Java trace:" }),
      ).toContainText("1 running");
      await expect(
        page.getByRole("status").filter({ hasText: "Partial Java trace:" }),
      ).toContainText("Scheduled completions are not observed completions.");
    }
  }
  expect(posts).toHaveLength(5);
  await selectCheckpoint(page, checkpoints[0]!);
  await expect(inspector(page)).toContainText("job-1");
  expect(posts).toHaveLength(5);
});

test("saved guided answers resume their exact draft checkpoint, require fresh Java evidence, and reset together", async ({
  page,
}) => {
  const posts = observeRuns(page);
  const checkpoint = checkpoints[1]!;
  const answer = "Job 2 waits until job 1 releases the single worker at 10 ms.";
  const recommended = checkpoint.tradeoff.options.find(
    (option) => option.id === checkpoint.tradeoff.recommendedOptionId,
  )!;
  await page.goto(`${moduleRoute}?view=guided&checkpoint=${checkpoint.id}`);
  await expect(
    page.getByRole("heading", { name: checkpoint.title, exact: true }),
  ).toBeVisible();
  await prediction(page).fill(answer);
  await runJava(page);
  await page
    .getByRole("radio", { name: recommended.label, exact: true })
    .check();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("hld-practice-v1") ?? "{}").answers
            ?.length,
      ),
    )
    .toBe(2);
  const backup = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hld-practice-v1")!),
  );
  expect(
    backup.answers
      .map((entry: { activityId: string }) => entry.activityId)
      .sort(),
  ).toEqual(
    [`${checkpoint.id}-prediction`, `${checkpoint.id}-tradeoff`].sort(),
  );
  expect(
    backup.answers.every(
      (entry: { contentVersion: string }) => entry.contentVersion === "1.1.0",
    ),
  ).toBe(true);
  await page.reload();
  await expect(prediction(page)).toHaveValue(answer);
  await expect(reveal(page)).toBeVisible();
  await expect(inspector(page)).toHaveCount(0);
  expect(posts).toHaveLength(1);
  await page.goto("/");
  const continueLink = page
    .getByRole("region", { name: "Continue learning", exact: true })
    .getByRole("link", { name: "Continue saved work", exact: true });
  await expect(continueLink).toHaveAttribute(
    "href",
    `${moduleRoute}?view=guided&checkpoint=${checkpoint.id}`,
  );
  await continueLink.click();
  await expect(prediction(page)).toHaveValue(answer);
  expect(posts).toHaveLength(1);
  await runJava(page);
  await expect(
    page.getByRole("radio", { name: recommended.label, exact: true }),
  ).toBeChecked();
  await page.getByRole("tab", { name: "Study", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Study", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.goBack();
  await expect(
    page.getByRole("tab", { name: "Guided", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(prediction(page)).toHaveValue(answer);
  await expect(inspector(page)).toBeVisible();
  expect(posts).toHaveLength(2);
  const storage = page.locator(".answer-storage-controls").filter({
    has: page.getByRole("region", {
      name: "Guided answer storage",
      exact: true,
    }),
  });
  await storage
    .getByText("Import answers or reset this module", { exact: true })
    .click();
  await storage
    .getByRole("button", { name: "Reset this module", exact: true })
    .click();
  await expect(
    storage.getByRole("button", { name: "Keep answers", exact: true }),
  ).toBeFocused();
  await storage
    .getByRole("button", { name: "Delete module answers", exact: true })
    .click();
  await expect(prediction(page)).toHaveValue("");
  await expect(inspector(page)).toHaveCount(0);
  await expect(reveal(page)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("hld-practice-v1") ?? "{}").answers
            ?.length,
      ),
    )
    .toBe(0);
  expect(posts).toHaveLength(2);
});

test("explicitly mocked target mismatch preserves the prediction and never invents evidence", async ({
  page,
}) => {
  const posts = observeRuns(page);
  await page.route(`**${topicPath}`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.checkpoints[0].target.jobId = "missing-job";
    await route.fulfill({ response, json: body });
  });
  await page.goto(`${moduleRoute}?view=guided`);
  await prediction(page).fill("Start the first job immediately.");
  await runJava(page);
  await expect(page.getByRole("alert")).toContainText(
    "This checkpoint no longer matches the Java trace",
  );
  await expect(inspector(page)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "3. Why it happens", exact: true }),
  ).toHaveCount(0);
  await expect(prediction(page)).toHaveValue(
    "Start the first job immediately.",
  );
  await page.unroute(`**${topicPath}`);
  await page.reload();
  await expect(prediction(page)).toHaveValue(
    "Start the first job immediately.",
  );
  expect(posts).toHaveLength(1);
  await runJava(page);
  await expect(inspector(page)).toContainText("job-1");
  expect(posts).toHaveLength(2);
});

test("explicitly mocked run failure keeps answers, then explicit retry uses the actual Java model", async ({
  page,
}) => {
  const posts = observeRuns(page);
  await page.route(`**${runPath}`, (route) =>
    route.fulfill({
      status: 503,
      headers: { "Retry-After": "1" },
      json: {
        code: "simulation_busy",
        message: "Queue simulation capacity is busy. Try again.",
        path: runPath,
        timestamp: "2026-10-12T00:00:00Z",
      },
    }),
  );
  await page.goto(`${moduleRoute}?view=guided`);
  await prediction(page).fill("The first job should start at 0 ms.");
  await reveal(page).click();
  await expect(page.getByRole("alert")).toContainText(
    "Queue simulation capacity is busy",
  );
  await expect(prediction(page)).toHaveValue(
    "The first job should start at 0 ms.",
  );
  await expect(inspector(page)).toHaveCount(0);
  await page.unroute(`**${runPath}`);
  await runJava(page);
  await expect(inspector(page)).toContainText("job-1");
  expect(posts).toHaveLength(2);
});

test("explicitly mocked missing preset and missing guided capability stay visibly unavailable", async ({
  page,
}) => {
  const posts = observeRuns(page);
  await page.route(`**${topicPath}`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.checkpoints[0].presetId = "unavailable";
    await route.fulfill({ response, json: body });
  });
  await page.goto(`${moduleRoute}?view=guided`);
  await expect(reveal(page)).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText(
    "is not available from the Java model",
  );
  await expect(inspector(page)).toHaveCount(0);
  await page.unroute(`**${topicPath}`);
  await page.route(`**${topicPath}`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.topic.capabilities = body.topic.capabilities.filter(
      (capability: string) => capability !== "guided",
    );
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Guided", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Playground", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("button", { name: "Run queue simulation", exact: true }),
  ).toBeVisible();
  expect(posts).toHaveLength(0);
});

test("architecture and authored job paths support direct links, keyboard inspection and history without Java runs", async ({
  page,
}) => {
  const posts = observeRuns(page);
  await page.goto(`${moduleRoute}?view=architecture`);
  await expect(
    page.getByRole("heading", {
      name: "How does a job get a worker?",
      exact: true,
    }),
  ).toBeVisible();
  const waiting = page.getByRole("button", {
    name: "Inspect waiting capacity",
    exact: true,
  });
  await waiting.focus();
  await page.keyboard.press("Enter");
  await expect(waiting).toBeFocused();
  await expect(
    page.getByRole("region", { name: "Selected queue boundary", exact: true }),
  ).toContainText("Join the shared FIFO");
  await expect(
    page
      .getByRole("region", {
        name: "Admission flow text equivalent",
        exact: true,
      })
      .getByRole("listitem"),
  ).toHaveCount(4);
  await page.getByRole("tab", { name: "Job sequence", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Three jobs, three admission paths",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/view=sequence/);
  const secondJob = page.getByRole("radio", {
    name: "Job 2 · waits",
    exact: true,
  });
  await secondJob.focus();
  await page.keyboard.press("Space");
  await expect(secondJob).toBeChecked();
  const inspectThird = page.getByRole("button", {
    name: "Inspect path step 3: The older waiter starts next",
    exact: true,
  });
  await inspectThird.focus();
  await page.keyboard.press("Enter");
  await expect(inspectThird).toBeFocused();
  const selected = page.getByRole("region", {
    name: "Selected authored job step",
    exact: true,
  });
  await expect(selected).toContainText("Step 3 of 4 · 10 ms");
  await page
    .getByRole("button", { name: "Next path step", exact: true })
    .click();
  await expect(selected).toContainText("Step 4 of 4 · 20 ms");
  await page.goBack();
  await expect(
    page.getByRole("tab", { name: "Architecture", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(waiting).toHaveAttribute("aria-pressed", "true");
  await page.goForward();
  await expect(
    page.getByRole("tab", { name: "Job sequence", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(selected).toContainText("Step 4 of 4 · 20 ms");
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Job sequence", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByText(/selecting a step does not execute a new run/),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: "Job 3 · rejected", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Next path step", exact: true })
    .click();
  await expect(selected).toContainText("no service start or completion");
  expect(posts).toHaveLength(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`${theme} reduced-motion queue views remain readable across mobile, tablet and desktop`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const posts = observeRuns(page);
    let evidence: QueueCapacityResult | undefined;
    await page.goto(`${moduleRoute}?view=architecture`);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const tab of [
        "Playground",
        "Guided",
        "Study",
        "Architecture",
        "Job sequence",
        "Practice",
      ]) {
        const target = page.getByRole("tab", { name: tab, exact: true });
        await target.click();
        await expect(target).toHaveAttribute("aria-selected", "true");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        if (tab === "Guided") {
          if (!evidence) {
            await selectCheckpoint(page, checkpoints[1]!);
            await prediction(page).fill(
              "Job 2 waits while job 1 owns the single worker.",
            );
            evidence = await runJava(page);
          }
          const queued = evidence.events.find(
            (event) => event.jobId === "job-2" && event.kind === "job.queued",
          )!;
          await expect(inspector(page)).toContainText("job-2");
          await expect(inspector(page)).toContainText("job.queued");
          await assertSnapshot(page, queued.state);
          const layout = await page.evaluate(() => ({
            viewport: innerWidth,
            document: document.documentElement.scrollWidth,
            evidence: Array.from(document.querySelectorAll("*"))
              .map((element) => ({
                tag: element.tagName,
                text: element.textContent?.slice(0, 60),
                class: element.className,
                left: element.getBoundingClientRect().left,
                right: element.getBoundingClientRect().right,
                scroll: element.scrollWidth,
                width: element.clientWidth,
              }))
              .filter(
                (element) => element.right > innerWidth && element.width > 0,
              ),
          }));
          expect(layout.document, JSON.stringify(layout)).toBeLessThanOrEqual(
            layout.viewport,
          );
          await captureFromTop(
            page,
            testInfo.outputPath(`queue-guided-${theme}-${width}.png`),
          );
        }
        if (tab === "Study") {
          const worked = page
            .getByRole("region", {
              name: "Scrollable lesson table",
              exact: true,
            })
            .filter({
              has: page.getByRole("columnheader", { name: "Job", exact: true }),
            });
          await expect(
            worked.getByRole("columnheader", {
              name: "Successful latency",
              exact: true,
            }),
          ).toBeVisible();
          const secondJob = worked.getByRole("row").filter({
            has: page.getByRole("cell", { name: "job-2", exact: true }),
          });
          await expect(secondJob.getByRole("cell")).toHaveText([
            "job-2",
            "Waits",
            "10 ms",
            "20 ms",
            "10 ms",
            "20 ms",
          ]);
          const tradeoffs = page
            .getByRole("region", {
              name: "Scrollable lesson table",
              exact: true,
            })
            .filter({
              has: page.getByRole("columnheader", {
                name: "Choice",
                exact: true,
              }),
            });
          if (width === 1440)
            expect(
              await tradeoffs.evaluate(
                (node) => node.scrollWidth <= node.clientWidth,
              ),
            ).toBe(true);
          await tradeoffs.screenshot({
            path: testInfo.outputPath(
              `queue-study-table-${theme}-${width}.png`,
            ),
          });
          await worked.focus();
          await expect(worked).toBeFocused();
          if (
            await worked.evaluate((node) => node.scrollWidth > node.clientWidth)
          ) {
            await page.keyboard.press("ArrowRight");
            await expect
              .poll(() => worked.evaluate((node) => node.scrollLeft))
              .toBeGreaterThan(0);
          }
          const layout = await page.evaluate(() => ({
            viewport: innerWidth,
            document: document.documentElement.scrollWidth,
            evidence: Array.from(document.querySelectorAll("*"))
              .map((element) => ({
                tag: element.tagName,
                text: element.textContent?.slice(0, 60),
                class: element.className,
                left: element.getBoundingClientRect().left,
                right: element.getBoundingClientRect().right,
                scroll: element.scrollWidth,
                width: element.clientWidth,
              }))
              .filter(
                (element) => element.right > innerWidth && element.width > 0,
              ),
          }));
          expect(layout.document, JSON.stringify(layout)).toBeLessThanOrEqual(
            layout.viewport,
          );
        }
        if (tab === "Study")
          await captureFromTop(
            page,
            testInfo.outputPath(`queue-study-${theme}-${width}.png`),
          );
        if (tab === "Architecture") {
          const rejection = page.getByRole("button", {
            name: "Inspect rejection",
            exact: true,
          });
          await rejection.focus();
          await page.keyboard.press("Enter");
          await expect(rejection).toBeFocused();
          await expect(
            page.getByRole("region", {
              name: "Selected queue boundary",
              exact: true,
            }),
          ).toContainText("Reject this arrival");
          await captureFromTop(
            page,
            testInfo.outputPath(`queue-architecture-${theme}-${width}.png`),
          );
        }
        if (tab === "Job sequence") {
          await page
            .getByRole("radio", { name: "Job 2 · waits", exact: true })
            .check();
          await page
            .getByRole("button", {
              name: "Inspect path step 3: The older waiter starts next",
              exact: true,
            })
            .click();
          await expect(
            page
              .getByRole("region", {
                name: "Full authored job path",
                exact: true,
              })
              .getByRole("listitem"),
          ).toHaveCount(4);
          await captureFromTop(
            page,
            testInfo.outputPath(`queue-sequence-${theme}-${width}.png`),
          );
        }
      }
    }
    // The revealed baseline is reused across widths and tab round trips.
    expect(posts).toHaveLength(1);
  });
}
