import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { AtomicityResult, GuidedCheckpoint } from "../src/api/types";
const route = "/draft/topics/transactions-isolation";
const runPath = "/api/v1/simulations/transaction-atomicity/runs";
const descriptorPath = "/api/v1/simulations/transaction-atomicity";
const checkpoints = (
  JSON.parse(
    readFileSync(
      new URL(
        "../../content/topics/transactions-isolation/checkpoints.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as GuidedCheckpoint[]
).filter((checkpoint) => checkpoint.simulationId === "transaction-atomicity");
const guided = (page: Page) =>
  page.getByRole("tabpanel", { name: "Guided", exact: true });
const reveal = (page: Page) =>
  guided(page).getByRole("button", { name: "Run and reveal", exact: true });
function observe(page: Page) {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  return posts;
}
async function run(page: Page): Promise<AtomicityResult> {
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
async function assertPrefix(
  page: Page,
  result: AtomicityResult,
  checkpoint: GuidedCheckpoint,
) {
  if (!("stepId" in checkpoint.target))
    throw new Error("Expected actual step target");
  const target = checkpoint.target;
  const matches = result.outcomes.filter(
    (outcome) =>
      outcome.stepId === target.stepId && outcome.kind === target.kind,
  );
  expect(matches).toHaveLength(1);
  const outcome = matches[0]!;
  const selected = guided(page).getByRole("region", {
    name: "Selected atomicity snapshot",
    exact: true,
  });
  await expect(
    selected.getByRole("article", {
      name: `Atomicity evidence for ${outcome.stepId}`,
      exact: true,
    }),
  ).toContainText(outcome.explanation);
  await expect(selected.locator(".atomicity-counts dd")).toHaveText(
    [
      outcome.postState.remainingUnits,
      outcome.postState.allocatedUnits,
      outcome.postState.invariants.accountedUnits,
      outcome.postState.revision,
    ].map(String),
  );
  await expect(
    selected
      .getByLabel("Published invariant checks at this step", { exact: true })
      .locator("dd"),
  ).toHaveText(
    [
      outcome.postState.invariants.remainingNonnegative,
      outcome.postState.invariants.allocatedWithinCapacity,
      outcome.postState.invariants.unitsConserved,
      outcome.postState.invariants.abortedEffectsAbsent,
    ].map((value) => (value ? "Preserved" : "Violated")),
  );
  for (const actor of outcome.postState.transactions) {
    const row = selected.getByRole("listitem", {
      name: `Transaction ${actor.id}`,
      exact: true,
    });
    await expect(row.locator("dd")).toHaveText([
      String(actor.quantity),
      String(actor.appliedStockUnits),
      String(actor.baseRemaining ?? "Not begun"),
      String(actor.baseRevision ?? "Not begun"),
      String(actor.workingRemaining ?? "No private workspace"),
      String(actor.pendingStockUnits),
      actor.pendingAllocation
        ? `${actor.pendingAllocation.quantity} units · step ${actor.pendingAllocation.stepId} · not published`
        : "No private allocation",
      ...(actor.failureReason
        ? [
            {
              USER_ABORT: "Explicit user abort",
              INSUFFICIENT_STOCK: "Insufficient stock",
              REVISION_CONFLICT: "Published revision changed",
            }[actor.failureReason] + ` (${actor.failureReason})`,
          ]
        : []),
    ]);
  }
  await expect(
    guided(page).getByText(checkpoint.explanation, { exact: true }),
  ).toBeVisible();
  await expect(
    guided(page).getByRole("region", {
      name: "Whole atomicity experiment summary",
    }),
  ).toHaveCount(0);
  await expect(guided(page).getByRole("slider")).toHaveCount(0);
}

test("eight atomicity checkpoints reveal exact Java prefixes and cache only their own model", async ({
  page,
}) => {
  const posts = observe(page);
  await page.goto(`${route}?view=guided&experiment=atomicity`);
  await expect(reveal(page)).toBeVisible();
  expect(posts).toHaveLength(0);
  expect(checkpoints).toHaveLength(8);
  const results = new Map<string, AtomicityResult>();
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
        `My prediction for ${checkpoint.id}: inspect the published and private state.`,
      );
    let result = results.get(checkpoint.presetId);
    if (!result) {
      result = await run(page);
      results.set(checkpoint.presetId, result);
    } else await reveal(page).click();
    await assertPrefix(page, result, checkpoint);
    const choice = checkpoint.tradeoff.options.find(
      (option) => option.id === checkpoint.tradeoff.recommendedOptionId,
    )!;
    await guided(page).getByLabel(choice.label, { exact: true }).check();
    await expect(
      guided(page)
        .getByRole("status")
        .filter({ hasText: "Recommended choice." }),
    ).toBeVisible();
  }
  expect(posts.filter((url) => url.endsWith(runPath))).toHaveLength(
    results.size,
  );
  expect(posts.every((url) => url.endsWith(runPath))).toBe(true);
});

test("saved atomicity reasoning resumes its experiment, isolates shared preset names and requires rerun after reload", async ({
  page,
}) => {
  const posts = observe(page);
  const checkpoint = checkpoints.find(
    (item) => item.presetId === "protected-baseline",
  )!;
  let descriptorGets = 0;
  page.on("request", (request) => {
    if (request.url().endsWith(descriptorPath)) descriptorGets++;
  });
  await page.goto(`${route}?view=guided&checkpoint=${checkpoint.id}`);
  await expect(
    guided(page).getByRole("heading", { name: checkpoint.title, exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/experiment=atomicity/);
  await guided(page)
    .getByRole("textbox", { name: /^Your prediction/ })
    .fill(
      "An abort discards private changes, while the captured base remains history.",
    );
  await run(page);
  await page.getByRole("button", { name: /^Reservation race/ }).click();
  await expect(
    guided(page).getByRole("heading", {
      name: "A read has not reserved the unit",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    guided(page).getByRole("region", { name: "Selected reservation snapshot" }),
  ).toHaveCount(0);
  const reservationResponse = page.waitForResponse((response) =>
    response.url().endsWith("/simulations/transactions-isolation/runs"),
  );
  await reveal(page).click();
  expect((await reservationResponse).status()).toBe(200);
  await expect(
    guided(page).getByRole("region", { name: "Selected reservation snapshot" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Atomicity & abort/ }).click();
  await expect(
    guided(page).getByRole("region", { name: "Selected atomicity snapshot" }),
  ).toBeVisible();
  expect(posts).toHaveLength(2);
  await page.getByRole("tab", { name: "Playground", exact: true }).click();
  await expect(
    page.getByLabel("Transaction 1 quantity", { exact: true }),
  ).toBeVisible();
  expect(descriptorGets).toBe(1);
  await page.getByRole("tab", { name: "Guided", exact: true }).click();
  await page.reload();
  await expect(
    guided(page).getByRole("textbox", { name: /^Your prediction/ }),
  ).toHaveValue(
    "An abort discards private changes, while the captured base remains history.",
  );
  await expect(
    guided(page).getByRole("region", { name: "Selected atomicity snapshot" }),
  ).toHaveCount(0);
  expect(posts).toHaveLength(2);
  await run(page);
  expect(posts).toHaveLength(3);
});

test("atomicity Guided preserves reasoning on run failure and retries explicitly", async ({
  page,
}) => {
  const checkpoint = checkpoints[0]!;
  await page.route(`**${runPath}`, async (intercept) => {
    await intercept.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "server_busy",
        message: "The model is busy. Retry this experiment.",
        details: [],
      }),
    });
    await page.unroute(`**${runPath}`);
  });
  await page.goto(`${route}?view=guided&experiment=atomicity`);
  await guided(page)
    .getByRole("textbox", { name: /^Your prediction/ })
    .fill("Published split stock remains after abort.");
  await reveal(page).click();
  await expect(guided(page).getByRole("alert")).toBeVisible();
  await expect(
    guided(page).getByRole("textbox", { name: /^Your prediction/ }),
  ).toHaveValue("Published split stock remains after abort.");
  await expect(
    guided(page).getByText(checkpoint.explanation, { exact: true }),
  ).toHaveCount(0);
  const result = await run(page);
  await assertPrefix(page, result, checkpoint);
});

test("a missing atomicity target withholds explanation rather than borrowing another snapshot", async ({
  page,
}) => {
  const checkpoint = checkpoints[0]!;
  await page.route(
    "**/api/v1/draft/topics/transactions-isolation",
    async (intercept) => {
      const response = await intercept.fetch();
      const body = await response.json();
      body.checkpoints.find(
        (item: GuidedCheckpoint) => item.id === checkpoint.id,
      ).target.stepId = "missing";
      await intercept.fulfill({ response, json: body });
    },
  );
  await page.goto(`${route}?view=guided&experiment=atomicity`);
  await run(page);
  await expect(guided(page).getByRole("alert")).toContainText(
    "no longer matches the Java evidence",
  );
  await expect(
    guided(page).getByText(checkpoint.explanation, { exact: true }),
  ).toHaveCount(0);
  await expect(
    guided(page).getByRole("region", { name: "Selected atomicity snapshot" }),
  ).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`atomicity Guided and ownership reading fit mobile tablet desktop in ${theme}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const posts = observe(page);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto(`${route}?view=guided&experiment=atomicity`);
      await guided(page)
        .getByRole("textbox", { name: /^Your prediction/ })
        .fill("Stock was already visible before this abort.");
      const button = reveal(page);
      await button.focus();
      await expect(button).toBeFocused();
      const response = page.waitForResponse(
        (item) =>
          item.url().endsWith(runPath) && item.request().method() === "POST",
      );
      await page.keyboard.press("Enter");
      const result = (await (await response).json()) as AtomicityResult;
      await assertPrefix(page, result, checkpoints[0]!);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      if (width === 320)
        await page.screenshot({
          path: testInfo.outputPath(`atomicity-guided-320-${theme}.png`),
          fullPage: true,
        });
      if (width === 1440)
        await guided(page).screenshot({
          path: testInfo.outputPath(`atomicity-guided-1440-${theme}.png`),
        });
      const previous = posts.length;
      const architecture = page.getByRole("tab", {
        name: "Architecture",
        exact: true,
      });
      await architecture.focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("heading", {
          name: "Which changes become visible together?",
          exact: true,
        }),
      ).toBeVisible();
      const inspect = page.getByRole("button", {
        name: "Inspect One publication boundary",
        exact: true,
      });
      await inspect.focus();
      await page.keyboard.press("Enter");
      await expect(inspect).toBeFocused();
      await expect(
        page.getByRole("region", {
          name: "Selected atomicity responsibility",
          exact: true,
        }),
      ).toContainText("A mismatch aborts and discards");
      await expect(
        page.getByRole("region", {
          name: "Atomicity ownership text equivalent",
          exact: true,
        }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      expect(posts).toHaveLength(previous);
      if (width === 320)
        await page.screenshot({
          path: testInfo.outputPath(`atomicity-architecture-320-${theme}.png`),
          fullPage: true,
        });
      if (width === 1440)
        await page
          .getByRole("tabpanel", { name: "Architecture", exact: true })
          .locator(".atomicity-concepts")
          .screenshot({
            path: testInfo.outputPath(
              `atomicity-architecture-1440-${theme}.png`,
            ),
          });
      await page
        .getByRole("tab", { name: "Operation sequence", exact: true })
        .click();
      for (const path of [
        "Separate writes leave a partial operation",
        "Publish both prepared pieces together",
        "Discard a conflicting private proposal",
      ]) {
        await page.getByRole("radio", { name: path, exact: true }).check();
        const next = page.getByRole("button", {
          name: "Next atomicity path step",
          exact: true,
        });
        await next.focus();
        await page.keyboard.press("Enter");
        await expect(next).toBeFocused();
        await expect(
          page.getByRole("region", {
            name: "Selected atomicity path step",
            exact: true,
          }),
        ).toBeVisible();
        const fullText = page.getByText("Full atomicity text sequence", {
          exact: true,
        });
        if (
          !(await page
            .getByRole("region", {
              name: "Authored atomicity sequence",
              exact: true,
            })
            .isVisible())
        )
          await fullText.click();
        await expect(
          page.getByRole("region", {
            name: "Authored atomicity sequence",
            exact: true,
          }),
        ).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          )
          .toBe(true);
      }
      expect(posts).toHaveLength(previous);
      if (width === 320)
        await page.screenshot({
          path: testInfo.outputPath(`atomicity-sequence-320-${theme}.png`),
          fullPage: true,
        });
      if (width === 1440)
        await page
          .getByRole("tabpanel", { name: "Operation sequence", exact: true })
          .locator(".atomicity-concepts")
          .screenshot({
            path: testInfo.outputPath(`atomicity-sequence-1440-${theme}.png`),
          });
    }
    expect(posts).toHaveLength(3);
  });
}
