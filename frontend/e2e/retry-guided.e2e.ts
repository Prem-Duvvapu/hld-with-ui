import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type {
  GuidedCheckpoint,
  RetryEvent,
  RetryResult,
} from "../src/api/types";
import {
  callerLabels,
  requestPhaseLabels,
  retryTime,
  workLabels,
} from "../src/features/retries/retryLabels";

const route = "/draft/topics/timeouts-retries";
const runPath = "/api/v1/simulations/timeouts-retries/runs";
const checkpoints = JSON.parse(
  readFileSync(
    new URL(
      "../../content/topics/timeouts-retries/checkpoints.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as GuidedCheckpoint[];
const guided = (page: Page) =>
  page.getByRole("tabpanel", { name: "Guided", exact: true });
const reveal = (page: Page) =>
  guided(page).getByRole("button", { name: "Run and reveal", exact: true });
const evidence = (page: Page) =>
  guided(page).getByRole("region", {
    name: "Java retry evidence at this checkpoint",
    exact: true,
  });
function observe(page: Page) {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(runPath))
      posts.push(request.postData()!);
  });
  return posts;
}
async function run(page: Page): Promise<RetryResult> {
  const pending = page.waitForResponse(
    (response) =>
      response.url().endsWith(runPath) &&
      response.request().method() === "POST",
  );
  await reveal(page).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  return response.json();
}
async function fact(scope: Locator, label: string, value: string | number) {
  await expect(
    scope.getByText(label, { exact: true }).locator("..").locator("dd"),
  ).toHaveText(String(value));
}
async function capture(
  page: Page,
  panel: Locator,
  width: number,
  path: string,
) {
  if (width === 320) {
    // Capture from the document origin so fixed/sticky navigation keeps its real position.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path, fullPage: true });
  } else await panel.screenshot({ path });
}
async function prefix(
  page: Page,
  result: RetryResult,
  checkpoint: GuidedCheckpoint,
) {
  const target = checkpoint.target;
  if (!("requestId" in target))
    throw new Error("Expected retry request identity");
  const matches = result.events.filter(
    (event) =>
      event.requestId === target.requestId &&
      event.kind === target.kind &&
      (!("attemptId" in target) || event.attemptId === target.attemptId),
  );
  const event: RetryEvent | undefined = matches[target.occurrence - 1];
  expect(event).toBeDefined();
  const state = event!.postState;
  await expect(evidence(page)).toContainText(event!.explanation);
  const snapshot = evidence(page).getByRole("region", {
    name: "Selected retry snapshot",
    exact: true,
  });
  await expect(snapshot.getByRole("article", { name: /^Caller / })).toHaveCount(
    state.requests.length,
  );
  for (const request of state.requests) {
    const card = snapshot.getByRole("article", {
      name: `Caller ${request.id}`,
      exact: true,
    });
    await expect(card.getByRole("heading")).toHaveText(
      `${request.id} · ${requestPhaseLabels[request.phase]}`,
    );
    await fact(card, "Attempts sent", request.attemptsSent);
    await fact(card, "Active attempt", request.activeAttemptId ?? "None");
    await fact(
      card,
      "Scheduled retry",
      request.nextRetryAtMs === undefined
        ? "None scheduled"
        : retryTime(request.nextRetryAtMs),
    );
    await fact(card, "Caller finished", retryTime(request.finishedAtMs));
    if (request.id === event!.requestId)
      await expect(card).toHaveAttribute("data-selected", "true");
    else await expect(card).not.toHaveAttribute("data-selected");
  }
  await expect(
    snapshot
      .getByRole("region", { name: "Retry server waiting queue", exact: true })
      .locator("li"),
  ).toHaveText(state.queue);
  await expect(
    snapshot
      .getByRole("region", { name: "Retry server workers", exact: true })
      .locator("li"),
  ).toHaveText(
    state.workers.map(
      (worker) => `${worker.id} · ${worker.attemptId ?? "Idle"}`,
    ),
  );
  await expect(
    snapshot.getByRole("article", { name: /^Retry attempt / }),
  ).toHaveCount(state.attempts.length);
  for (const attempt of state.attempts) {
    const card = snapshot.getByRole("article", {
      name: `Retry attempt ${attempt.id}`,
      exact: true,
    });
    await expect(card.locator(".retry-state-pair strong")).toHaveText([
      callerLabels[attempt.callerState],
      workLabels[attempt.workState],
    ]);
    await fact(card, "Sent", retryTime(attempt.sentAtMs));
    await fact(card, "Work started", retryTime(attempt.startedAtMs));
    await fact(card, "Work completed", retryTime(attempt.completedAtMs));
    await fact(
      card,
      "Caller finished waiting",
      retryTime(attempt.callerFinishedAtMs),
    );
  }
  await expect(
    guided(page).getByText(checkpoint.explanation, { exact: true }),
  ).toBeVisible();
  await expect(
    guided(page).getByRole("region", {
      name: "Whole retry experiment summary",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(guided(page).getByRole("slider")).toHaveCount(0);
}

test("eight retry checkpoints reveal exact Java request/attempt prefixes and retain evidence across tabs", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const posts = observe(page);
  await page.goto(`${route}?view=guided`);
  await expect(reveal(page)).toBeVisible();
  expect(posts).toHaveLength(0);
  expect(checkpoints).toHaveLength(8);
  for (const checkpoint of checkpoints) {
    await guided(page)
      .getByRole("navigation", { name: "Checkpoints", exact: true })
      .getByRole("button", { name: checkpoint.title, exact: false })
      .click();
    await expect(
      guided(page).getByRole("heading", {
        name: checkpoint.title,
        exact: true,
      }),
    ).toBeFocused();
    await guided(page)
      .getByRole("textbox", { name: /^Your prediction/ })
      .fill(
        `For ${checkpoint.id}, distinguish caller waiting from accepted work.`,
      );
    const result = await run(page);
    await prefix(page, result, checkpoint);
    const recommended = checkpoint.tradeoff.options.find(
      (option) => option.id === checkpoint.tradeoff.recommendedOptionId,
    )!;
    await guided(page)
      .getByRole("radio", { name: recommended.label, exact: true })
      .check();
    await expect(
      guided(page)
        .getByRole("status")
        .filter({ hasText: "Recommended choice." }),
    ).toBeVisible();
  }
  expect(posts).toHaveLength(8);
  await page.getByRole("tab", { name: "Architecture", exact: true }).click();
  await page.goBack();
  await expect(evidence(page)).toBeVisible();
  expect(posts).toHaveLength(8);
  await guided(page)
    .getByRole("navigation", { name: "Checkpoints", exact: true })
    .getByRole("button", { name: checkpoints[0]!.title, exact: false })
    .click();
  await expect(evidence(page)).toBeVisible();
  expect(posts).toHaveLength(8);
});

test("retry reasoning reloads without a trace, versioned imports stay explicit and reset hides cached reveals", async ({
  page,
}) => {
  const posts = observe(page);
  const prediction =
    "The 50 ms caller timeout leaves the accepted attempt running.";
  await page.goto(`${route}?view=guided&checkpoint=${checkpoints[0]!.id}`);
  await guided(page)
    .getByRole("textbox", { name: /^Your prediction/ })
    .fill(prediction);
  await run(page);
  await page.reload();
  await expect(
    guided(page).getByRole("textbox", { name: /^Your prediction/ }),
  ).toHaveValue(prediction);
  await expect(evidence(page)).toHaveCount(0);
  expect(posts).toHaveLength(1);
  await run(page);
  expect(posts).toHaveLength(2);
  await guided(page)
    .getByText("Import answers or reset this module", { exact: true })
    .click();
  await guided(page)
    .getByRole("button", { name: "Reset this module", exact: true })
    .click();
  await expect(
    guided(page).getByRole("button", { name: "Keep answers", exact: true }),
  ).toBeFocused();
  await guided(page)
    .getByRole("button", { name: "Delete module answers", exact: true })
    .click();
  await expect(
    guided(page).getByRole("textbox", { name: /^Your prediction/ }),
  ).toHaveValue("");
  await expect(evidence(page)).toHaveCount(0);
  // Reset hides reveal state; explicitly revealing may reuse this session's Java result.
  await reveal(page).click();
  await expect(evidence(page)).toBeVisible();
  expect(posts).toHaveLength(2);
  const oldAnswer = {
    app: "hld-with-ui",
    schemaVersion: 1,
    answers: [
      {
        topicId: "timeouts-retries",
        activityId: `${checkpoints[1]!.id}-prediction`,
        contentVersion: "1.0.0",
        updatedAt: "2026-10-15T12:00:00.000Z",
        answer: {
          kind: "text",
          text: "My earlier reasoning stays reviewable.",
        },
        referenceViewed: true,
      },
    ],
  };
  await guided(page)
    .getByLabel("Answer backup file", { exact: true })
    .setInputFiles({
      name: "retry-answer-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(oldAnswer)),
    });
  await expect(
    guided(page).getByRole("heading", {
      name: "Review imported answers",
      exact: true,
    }),
  ).toBeVisible();
  await guided(page)
    .getByRole("button", { name: "Apply import", exact: true })
    .click();
  await guided(page)
    .getByRole("navigation", { name: "Checkpoints", exact: true })
    .getByRole("button", { name: checkpoints[1]!.title, exact: false })
    .click();
  await expect(
    guided(page).getByRole("textbox", { name: /^Your prediction/ }),
  ).toHaveValue("My earlier reasoning stays reviewable.");
  await expect(
    guided(page)
      .getByRole("note")
      .filter({ hasText: "saved for content v1.0.0" }),
  ).toBeVisible();
  await expect(evidence(page)).toHaveCount(0);
  expect(posts).toHaveLength(2);
});

test("retry Guided locks a pending reveal, preserves prediction on failure and recovers only explicitly", async ({
  page,
}) => {
  const posts = observe(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${runPath}`, async (intercept) => {
    await gate;
    await intercept.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "server_busy",
        message: "Retry model is busy. Try again explicitly.",
        fieldErrors: [],
      }),
    });
  });
  await page.goto(`${route}?view=guided`);
  const answer = guided(page).getByRole("textbox", {
    name: /^Your prediction/,
  });
  await answer.fill("A timeout does not remove admitted work.");
  await reveal(page).click();
  const pending = guided(page).getByRole("button", {
    name: "Running the Java model…",
    exact: true,
  });
  await expect(pending).toBeDisabled();
  await expect(evidence(page)).toHaveCount(0);
  release();
  await expect(guided(page).getByRole("alert")).toContainText("busy");
  await expect(answer).toHaveValue("A timeout does not remove admitted work.");
  await expect(evidence(page)).toHaveCount(0);
  expect(posts).toHaveLength(1);
  await page.unroute(`**${runPath}`);
  const result = await run(page);
  await prefix(page, result, checkpoints[0]!);
  expect(posts).toHaveLength(2);
});

test("an unresolved retry identity withholds snapshot and explanation", async ({
  page,
}) => {
  await page.route(
    "**/api/v1/draft/topics/timeouts-retries",
    async (intercept) => {
      const response = await intercept.fetch();
      const body = await response.json();
      // A well-formed but absent identity must never borrow another caller's evidence.
      body.checkpoints[0].target.requestId = "missing";
      body.checkpoints[0].target.attemptId = "missing-a1";
      await intercept.fulfill({ response, json: body });
    },
  );
  await page.goto(`${route}?view=guided`);
  await run(page);
  await expect(guided(page).getByRole("alert")).toContainText(
    "no longer matches the Java evidence",
  );
  await expect(evidence(page)).toHaveCount(0);
  await expect(
    guided(page).getByText(checkpoints[0]!.explanation, { exact: true }),
  ).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`retry Guided and authored design views fit mobile tablet desktop in ${theme}`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const posts = observe(page);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto(`${route}?view=guided`);
      const button = reveal(page);
      await button.focus();
      await expect(button).toBeFocused();
      const response = page.waitForResponse(
        (item) =>
          item.url().endsWith(runPath) && item.request().method() === "POST",
      );
      await page.keyboard.press("Enter");
      const result = await (await response).json();
      await prefix(page, result, checkpoints[0]!);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      if (width !== 768)
        await capture(
          page,
          guided(page),
          width,
          info.outputPath(`retry-guided-${width}-${theme}.png`),
        );
      const before = posts.length;
      for (const view of ["Architecture", "Request sequence"]) {
        const tab = page.getByRole("tab", { name: view, exact: true });
        await tab.focus();
        await page.keyboard.press("Enter");
        await expect(tab).toBeFocused();
        const panel = page.getByRole("tabpanel", { name: view, exact: true });
        if (view === "Architecture") {
          const inspect = panel
            .getByRole("button", { name: /^Inspect / })
            .last();
          await inspect.focus();
          await page.keyboard.press("Enter");
          await expect(inspect).toBeFocused();
          await expect(
            panel.getByRole("region", {
              name: "Selected retry responsibility",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            panel.getByRole("region", {
              name: "Retry architecture text equivalent",
              exact: true,
            }),
          ).toBeVisible();
        } else {
          const paths = panel.getByRole("radio");
          await expect(paths).toHaveCount(3);
          for (let index = 0; index < 3; index++) {
            await paths.nth(index).check();
            const next = panel.getByRole("button", {
              name: "Next retry path step",
              exact: true,
            });
            await next.focus();
            await page.keyboard.press("Enter");
            await expect(next).toBeFocused();
            await expect(
              panel.getByRole("region", {
                name: "Selected retry path step",
                exact: true,
              }),
            ).toBeVisible();
          }
          await panel
            .getByText("Full retry text sequence", { exact: true })
            .click();
          await expect(
            panel.getByRole("region", {
              name: "Authored retry sequence",
              exact: true,
            }),
          ).toBeVisible();
        }
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          )
          .toBe(true);
        if (width !== 768)
          await capture(
            page,
            panel,
            width,
            info.outputPath(
              `retry-${view === "Architecture" ? "architecture" : "sequence"}-${width}-${theme}.png`,
            ),
          );
      }
      expect(posts).toHaveLength(before);
    }
    expect(posts).toHaveLength(3);
  });
}
