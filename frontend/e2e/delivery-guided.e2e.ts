import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { expect, test, type Page } from "@playwright/test";
import type { DeliveryResult, GuidedCheckpoint } from "../src/api/types";
const id = "queues-delivery";
const route = `/draft/topics/${id}`;
const topicPath = `/api/v1/draft/topics/${id}`;
const runPath = `/api/v1/simulations/${id}/runs`;
const checkpoints: GuidedCheckpoint[] = JSON.parse(
  readFileSync(
    new URL(`../../content/topics/${id}/checkpoints.json`, import.meta.url),
    "utf8",
  ),
);
const schema = JSON.parse(
  readFileSync(
    new URL(
      "../../contracts/queue-delivery.result.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const validResult = new Ajv2020({
  strict: true,
  strictRequired: false,
}).compile(schema);
const panel = (page: Page) =>
  page.getByRole("tabpanel", { name: "Guided", exact: true });
const reveal = (page: Page) =>
  panel(page).getByRole("button", { name: "Run and reveal", exact: true });
const prediction = (page: Page) =>
  panel(page).getByRole("textbox", { name: /^Your prediction/ });
const inspector = (page: Page) =>
  panel(page).getByRole("region", {
    name: "Selected delivery event",
    exact: true,
  });
function observeRuns(page: Page) {
  const runs: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(runPath))
      runs.push(request.postData()!);
  });
  return runs;
}
async function runJava(page: Page): Promise<DeliveryResult> {
  const pending = page.waitForResponse(
    (response) =>
      response.url().endsWith(runPath) &&
      response.request().method() === "POST",
  );
  await reveal(page).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(validResult(result), JSON.stringify(validResult.errors)).toBe(true);
  return result;
}
async function selectCheckpoint(page: Page, checkpoint: GuidedCheckpoint) {
  await panel(page)
    .getByRole("navigation", { name: "Checkpoints", exact: true })
    .getByRole("button", { name: checkpoint.title, exact: false })
    .click();
  await expect(
    panel(page).getByRole("heading", { name: checkpoint.title, exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`checkpoint=${checkpoint.id}`));
}
function targetEvent(result: DeliveryResult, checkpoint: GuidedCheckpoint) {
  const target = checkpoint.target;
  if (!("messageId" in target) || !("attemptId" in target))
    throw new Error("Delivery targets require both semantic identities");
  const matches = result.events.filter(
    (event) =>
      event.messageId === target.messageId &&
      event.attemptId === target.attemptId &&
      event.kind === target.kind,
  );
  const event = matches[target.occurrence - 1];
  expect(event).toBeTruthy();
  return event!;
}
async function assertJavaPrefix(
  page: Page,
  result: DeliveryResult,
  sequence: number,
) {
  // Expected records come from returned full replacements, never a browser simulation.
  const messages = new Map(
    result.initialState.messages.map((message) => [message.id, message]),
  );
  const consumers = new Map(
    result.initialState.consumers.map((consumer) => [consumer.id, consumer]),
  );
  const ledger = [];
  for (const event of result.events) {
    if (event.sequence > sequence) break;
    for (const message of event.changes.messages)
      messages.set(message.id, message);
    for (const consumer of event.changes.consumers)
      consumers.set(consumer.id, consumer);
    if (event.ledgerEntry) ledger.push(event.ledgerEntry);
  }
  const labels = {
    NOT_ENQUEUED: "Not enqueued",
    READY: "Ready",
    LEASED: "Leased",
    ACKNOWLEDGED: "Acknowledged",
    DEAD_LETTERED: "Dead lettered",
  };
  for (const message of Array.from(messages.values())) {
    const item = panel(page).getByRole("listitem", {
      name: `Message ${message.id}`,
      exact: true,
    });
    await expect(item).toContainText(labels[message.status]);
    await expect(item).toContainText(
      `Current attempt: ${message.currentAttemptId ?? "None"}`,
    );
  }
  for (const consumer of Array.from(consumers.values()))
    await expect(
      panel(page).getByRole("listitem", {
        name: `Consumer ${consumer.id}`,
        exact: true,
      }),
    ).toContainText(
      `Current processing attempt: ${consumer.currentAttemptId ?? "None"}`,
    );
  const region = panel(page).getByRole("region", {
    name: "Committed ledger at the selected position",
    exact: true,
  });
  await expect(region.getByRole("listitem")).toHaveCount(ledger.length);
  for (const entry of ledger)
    await expect(region).toContainText(
      `Committed at ${entry.committedAtMs} ms`,
    );
}
async function tab(page: Page, name: string) {
  const item = page.getByRole("tab", { name, exact: true });
  await item.click();
  await expect(item).toHaveAttribute("aria-selected", "true");
}
async function capture(page: Page, path: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path, fullPage: true });
}

test("all eight Guided targets reveal exact Java message attempts and preserve honest prefix state", async ({
  page,
}) => {
  const runs = observeRuns(page);
  const results = new Map<string, DeliveryResult>();
  await page.goto(`${route}?view=guided`);
  await expect(reveal(page)).toBeVisible();
  expect(runs).toHaveLength(0);
  expect(checkpoints).toHaveLength(8);
  for (const checkpoint of checkpoints) {
    await selectCheckpoint(page, checkpoint);
    await prediction(page).fill(
      `I predict ${checkpoint.id} because delivery, effect and ACK are separate.`,
    );
    const result = await runJava(page);
    results.set(checkpoint.presetId, result);
    const event = targetEvent(result, checkpoint);
    await expect(inspector(page)).toContainText(event.kind);
    await expect(inspector(page)).toContainText(event.attemptId!);
    await expect(
      panel(page).getByText(
        `Event ${event.sequence} of ${result.events.length} · ${event.timeMs} ms`,
        { exact: true },
      ),
    ).toBeVisible();
    await assertJavaPrefix(page, result, event.sequence);
    await expect(
      panel(page).getByRole("heading", {
        name: "3. Why it happens",
        exact: true,
      }),
    ).toBeVisible();
    const choice = checkpoint.tradeoff.options.find(
      (option) => option.id === checkpoint.tradeoff.recommendedOptionId,
    )!;
    await panel(page)
      .getByRole("radio", { name: choice.label, exact: true })
      .check();
    await expect(panel(page).locator(".guided-feedback")).toContainText(
      "Recommended choice.",
    );
    if (checkpoint.presetId === "virtual-limit") {
      expect(result.status).toBe("limited");
      expect(result.metrics.acknowledgedWithoutEffect).toBeUndefined();
      await expect(
        panel(page)
          .getByRole("status")
          .filter({ hasText: "Partial Java trace:" }),
      ).toContainText("Scheduled work is unobserved");
    }
  }
  expect(runs).toHaveLength(8);
  await selectCheckpoint(page, checkpoints[0]!);
  await expect(inspector(page)).toContainText("m1-a1");
  await reveal(page).click();
  expect(runs).toHaveLength(8);
  const result = results.get("baseline")!;
  await assertJavaPrefix(
    page,
    result,
    targetEvent(result, checkpoints[0]!).sequence,
  );
});

test("saved Guided reasoning resumes its exact draft checkpoint, reruns explicitly and resets with confirmation", async ({
  page,
}) => {
  const runs = observeRuns(page);
  const checkpoint = checkpoints[1]!;
  const answer =
    "The lost ACK leaves the first ledger record; retrying appends a second effect.";
  const choice = checkpoint.tradeoff.options.find(
    (option) => option.id === checkpoint.tradeoff.recommendedOptionId,
  )!;
  await page.goto(`${route}?view=guided&checkpoint=${checkpoint.id}`);
  await prediction(page).fill(answer);
  await runJava(page);
  await panel(page)
    .getByRole("radio", { name: choice.label, exact: true })
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
  await page.reload();
  await expect(prediction(page)).toHaveValue(answer);
  await expect(inspector(page)).toHaveCount(0);
  expect(runs).toHaveLength(1);
  await page.goto("/");
  const link = page
    .getByRole("region", { name: "Continue learning", exact: true })
    .getByRole("link", { name: "Continue saved work", exact: true });
  await expect(link).toHaveAttribute(
    "href",
    `${route}?view=guided&checkpoint=${checkpoint.id}`,
  );
  await link.click();
  await expect(
    panel(page).getByRole("heading", { name: checkpoint.title, exact: true }),
  ).toBeFocused();
  await expect(prediction(page)).toHaveValue(answer);
  expect(runs).toHaveLength(1);
  await runJava(page);
  await expect(
    panel(page).getByRole("radio", { name: choice.label, exact: true }),
  ).toBeChecked();
  await tab(page, "Study");
  await page.goBack();
  await expect(
    page.getByRole("tab", { name: "Guided", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(inspector(page)).toBeVisible();
  expect(runs).toHaveLength(2);
  const storage = panel(page)
    .locator(".answer-storage-controls")
    .filter({
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
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("hld-practice-v1") ?? "{}").answers
            ?.length,
      ),
    )
    .toBe(0);
  expect(runs).toHaveLength(2);
});

test("explicitly mocked unmatched occurrence preserves prediction and cannot reveal unsupported explanation", async ({
  page,
}) => {
  const runs = observeRuns(page);
  await page.route(`**${topicPath}`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.checkpoints[0].target.occurrence = 2;
    await route.fulfill({ response, json: body });
  });
  await page.goto(`${route}?view=guided`);
  await prediction(page).fill("The first effect precedes the ACK.");
  await runJava(page);
  await expect(panel(page).getByRole("alert")).toContainText(
    "This checkpoint no longer matches the Java trace",
  );
  await expect(inspector(page)).toHaveCount(0);
  await expect(
    panel(page).getByRole("heading", {
      name: "3. Why it happens",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(prediction(page)).toHaveValue(
    "The first effect precedes the ACK.",
  );
  await page.unroute(`**${topicPath}`);
  await page.reload();
  await expect(prediction(page)).toHaveValue(
    "The first effect precedes the ACK.",
  );
  await runJava(page);
  await expect(inspector(page)).toContainText("effect.committed");
  expect(runs).toHaveLength(2);
});

test("explicitly mocked busy Guided run retains reasoning until real Java retry", async ({
  page,
}) => {
  const runs = observeRuns(page);
  await page.route(`**${runPath}`, (route) =>
    route.fulfill({
      status: 503,
      headers: { "Retry-After": "1" },
      json: {
        code: "simulation_busy",
        message: "Keep the prediction and retry explicitly.",
        fieldErrors: {},
        timestamp: "2026-10-12T19:00:00Z",
      },
    }),
  );
  await page.goto(`${route}?view=guided`);
  await prediction(page).fill("An effect does not confirm the broker.");
  await reveal(page).click();
  await expect(panel(page).getByRole("alert")).toContainText(
    "Keep the prediction",
  );
  await expect(prediction(page)).toHaveValue(
    "An effect does not confirm the broker.",
  );
  await expect(inspector(page)).toHaveCount(0);
  expect(runs).toHaveLength(1);
  await page.unroute(`**${runPath}`);
  await runJava(page);
  await expect(inspector(page)).toContainText("effect.committed");
  await expect(panel(page).getByRole("alert")).toHaveCount(0);
  expect(runs).toHaveLength(2);
});

test("authored ownership and all three sequence paths are keyboard reading flows with no simulation POST", async ({
  page,
}) => {
  const runs = observeRuns(page);
  await page.goto(`${route}?view=architecture`);
  const inspect = page.getByRole("button", {
    name: "Inspect ledger effects",
    exact: true,
  });
  await inspect.focus();
  await page.keyboard.press("Enter");
  await expect(inspect).toBeFocused();
  await expect(inspect).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("region", {
      name: "Selected delivery boundary",
      exact: true,
    }),
  ).toContainText(/ledger|durable/i);
  await expect(
    page.getByRole("region", {
      name: "Delivery ownership text equivalent",
      exact: true,
    }),
  ).toContainText("current token");
  await tab(page, "Message sequence");
  for (const [label, times] of [
    ["Baseline · effect then ACK", [0, 50, 55]],
    ["Lost ACK · repeated effect", [0, 50, 55, 100, 150, 155]],
    ["Early ACK · cancelled work", [0, 5, 25, 75]],
  ] as const) {
    await page.getByRole("radio", { name: label, exact: true }).check();
    const list = page
      .getByRole("region", { name: "Full authored message path", exact: true })
      .getByRole("listitem");
    await expect(list).toHaveCount(times.length);
    for (let index = 0; index < times.length; index++)
      await expect(list.nth(index)).toContainText(`${times[index]} ms`);
    for (let index = 1; index < times.length; index++) {
      const next = page.getByRole("button", {
        name: "Next path step",
        exact: true,
      });
      await next.focus();
      await page.keyboard.press("Enter");
      await expect(next).toBeFocused();
      await expect(
        page.getByRole("region", {
          name: "Selected authored message step",
          exact: true,
        }),
      ).toContainText(
        `Step ${index + 1} of ${times.length} · ${times[index]} ms`,
      );
    }
    await expect(
      page.getByRole("button", { name: "Next path step", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Reset authored path", exact: true })
      .click();
    await expect(
      page.getByRole("region", {
        name: "Selected authored message step",
        exact: true,
      }),
    ).toContainText("Step 1");
  }
  expect(runs).toHaveLength(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`delivery Guided and authored views fit mobile tablet desktop in ${theme} reduced motion`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 900 });
    const runs = observeRuns(page);
    const checkpoint = checkpoints[1]!;
    await page.goto(`${route}?view=guided&checkpoint=${checkpoint.id}`);
    await prediction(page).fill("The committed record survives the lost ACK.");
    const result = await runJava(page);
    const event = targetEvent(result, checkpoint);
    await expect(inspector(page)).toBeVisible();
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await tab(page, "Guided");
      await assertJavaPrefix(page, result, event.sequence);
      const next = panel(page).getByRole("button", {
        name: "Next event",
        exact: true,
      });
      await next.focus();
      await page.keyboard.press("Enter");
      await expect(next).toBeFocused();
      const previous = panel(page).getByRole("button", {
        name: "Previous event",
        exact: true,
      });
      await previous.focus();
      await page.keyboard.press("Enter");
      await expect(previous).toBeFocused();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await capture(
        page,
        testInfo.outputPath(`delivery-guided-${width}-${theme}.png`),
      );
      await tab(page, "Architecture");
      await page
        .getByRole("button", { name: "Inspect ledger effects", exact: true })
        .click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await capture(
        page,
        testInfo.outputPath(`delivery-architecture-${width}-${theme}.png`),
      );
      await tab(page, "Message sequence");
      await page
        .getByRole("radio", { name: "Lost ACK · repeated effect", exact: true })
        .check();
      const pathNext = page.getByRole("button", {
        name: "Next path step",
        exact: true,
      });
      await pathNext.focus();
      await page.keyboard.press("Enter");
      await expect(pathNext).toBeFocused();
      await page
        .getByRole("button", { name: "Reset authored path", exact: true })
        .click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await capture(
        page,
        testInfo.outputPath(`delivery-sequence-${width}-${theme}.png`),
      );
    }
    expect(runs).toHaveLength(1);
  });
}
