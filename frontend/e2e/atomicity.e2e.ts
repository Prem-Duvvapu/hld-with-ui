import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { expect, test, type Page } from "@playwright/test";
import type {
  AtomicityDescriptor,
  AtomicityResult,
  AtomicityState,
} from "../src/api/types";
const route = "/draft/topics/transactions-isolation?experiment=atomicity";
const descriptorPath = "/api/v1/simulations/transaction-atomicity";
const runPath = `${descriptorPath}/runs`;
const read = (path: string) =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: true, strictRequired: false });
ajv.addSchema(read("contracts/transaction-atomicity.input.schema.json"));
const validate = ajv.compile(
  read("contracts/transaction-atomicity.result.schema.json"),
);
const controls = (page: Page) =>
  page.getByRole("region", {
    name: "Edit the atomicity schedule",
    exact: true,
  });
const runButton = (page: Page) =>
  page.getByRole("button", { name: "Run atomicity experiment", exact: true });
function observe(page: Page) {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(runPath))
      posts.push(request.postData()!);
  });
  return posts;
}
async function runJava(page: Page): Promise<AtomicityResult> {
  const pending = page.waitForResponse(
    (response) =>
      response.url().endsWith(runPath) &&
      response.request().method() === "POST",
  );
  await runButton(page).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(validate(result), JSON.stringify(validate.errors)).toBe(true);
  await expect(
    page.getByRole("region", {
      name: "Java atomicity analysis results",
      exact: true,
    }),
  ).toBeVisible();
  return result;
}
async function snapshot(page: Page, result: AtomicityResult, position: number) {
  await page
    .getByRole("slider", { name: "Atomicity snapshot position", exact: true })
    .fill(String(position));
  const state: AtomicityState = position
    ? result.outcomes[position - 1]!.postState
    : result.initialState;
  const selected = page.getByRole("region", {
    name: "Selected atomicity snapshot",
    exact: true,
  });
  for (const [label, value] of [
    ["Remaining units", state.remainingUnits],
    ["Allocated units", state.allocatedUnits],
    ["Accounted units", state.invariants.accountedUnits],
    ["Published revision", state.revision],
  ] as const)
    await expect(
      selected
        .locator(".atomicity-counts > div")
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator("dd"),
    ).toHaveText(String(value));
  await expect(
    selected.getByRole("listitem", { name: /^Transaction / }),
  ).toHaveCount(result.input.transactions.length);
  await expect(
    selected.getByRole("definition").filter({ hasText: "Violated" }),
  ).toHaveCount(
    [
      state.invariants.remainingNonnegative,
      state.invariants.allocatedWithinCapacity,
      state.invariants.unitsConserved,
      state.invariants.abortedEffectsAbsent,
    ].filter((value) => !value).length,
  );
  for (const actor of state.transactions) {
    const card = selected.getByRole("listitem", {
      name: `Transaction ${actor.id}`,
      exact: true,
    });
    for (const [label, value] of [
      ["Stock units already published", actor.appliedStockUnits],
      ["Stock units prepared privately", actor.pendingStockUnits],
      ["Captured stock", actor.baseRemaining ?? "Not begun"],
      ["Captured revision", actor.baseRevision ?? "Not begun"],
      [
        "Private remaining proposal",
        actor.workingRemaining ?? "No private workspace",
      ],
    ] as const)
      await expect(
        card
          .locator("dl > div")
          .filter({ has: page.getByText(label, { exact: true }) })
          .locator("dd"),
      ).toHaveText(String(value));
  }
}

test("all eight Java presets expose published/private snapshots and distinguish prefix history from final flags", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const posts = observe(page);
  const descriptor: AtomicityDescriptor = await (
    await request.get(descriptorPath)
  ).json();
  expect(descriptor.presets).toHaveLength(8);
  await page.goto(route);
  await expect(runButton(page)).toBeVisible();
  expect(posts).toHaveLength(0);
  for (const preset of descriptor.presets) {
    await controls(page)
      .getByRole("button", { name: preset.title, exact: true })
      .click();
    const result = await runJava(page);
    expect(result.input).toEqual(preset.input);
    for (let position = 0; position <= result.outcomes.length; position++)
      await snapshot(page, result, position);
    if (preset.id === "baseline")
      expect(result.metrics).toMatchObject({
        abortedTransactionsWithEffects: 1,
        invariantStatus: "VIOLATED",
        firstViolationStepId: "decrement-a",
      });
    if (preset.id === "protected-baseline")
      expect(result.finalState).toMatchObject({
        remainingUnits: 1,
        allocatedUnits: 0,
        revision: 0,
      });
    if (preset.id === "split-commit") {
      expect(result.finalState.invariants.unitsConserved).toBe(true);
      expect(result.metrics.invariantStatus).toBe("VIOLATED");
    }
    if (preset.id === "split-abort-after-record") {
      expect(result.finalState.invariants.unitsConserved).toBe(true);
      expect(result.finalState.invariants.abortedEffectsAbsent).toBe(false);
    }
    if (preset.id === "conservative-conflict")
      expect(result.metrics).toMatchObject({
        finalRemainingUnits: 2,
        conflictedTransactions: 1,
      });
    await snapshot(page, result, 0);
    await expect(
      page.getByRole("region", {
        name: "Whole atomicity experiment summary",
        exact: true,
      }),
    ).toContainText(
      result.metrics.invariantStatus === "PRESERVED" ? "Preserved" : "Violated",
    );
  }
  expect(posts).toHaveLength(8);
});

test("quantity edits and reordered commit winner change Java outcomes, while illegal or blank input sends no request", async ({
  page,
  request,
}) => {
  const posts = observe(page);
  await page.goto(route);
  await controls(page)
    .getByLabel("Transaction 1 quantity", { exact: true })
    .fill("2");
  const insufficient = await runJava(page);
  expect(insufficient.input.transactions[0]!.quantity).toBe(2);
  expect(insufficient.metrics.abortedTransactionsWithEffects).toBe(0);
  expect(insufficient.finalState.remainingUnits).toBe(1);
  await controls(page)
    .getByLabel("Initial stock (units)", { exact: true })
    .fill("");
  await runButton(page).click();
  await expect(page.getByRole("alert")).toContainText("highlighted fields");
  expect(posts).toHaveLength(1);
  const descriptor: AtomicityDescriptor = await (
    await request.get(descriptorPath)
  ).json();
  await controls(page)
    .getByRole("button", {
      name: descriptor.presets.find(
        (preset) => preset.id === "protected-conflict",
      )!.title,
      exact: true,
    })
    .click();
  await controls(page)
    .getByRole("button", { name: "Move step 8 up", exact: true })
    .click();
  const reversed = await runJava(page);
  expect(reversed.finalState.allocations[0]!.transactionId).toBe("b");
  expect(reversed.outcomes[reversed.outcomes.length - 1]!.reason).toBe(
    "REVISION_CONFLICT",
  );
  await controls(page)
    .getByRole("button", { name: "Move step 3 up", exact: true })
    .click();
  await controls(page)
    .getByRole("button", { name: "Move step 2 up", exact: true })
    .click();
  await runButton(page).click();
  await expect(page.getByRole("alert")).toContainText("highlighted fields");
  expect(posts).toHaveLength(2);
});

test("experiment and tab history preserve separate drafts/results and lazy loading never runs a model", async ({
  page,
}) => {
  const posts = observe(page);
  let atomicityLoads = 0;
  page.on("request", (request) => {
    if (request.method() === "GET" && request.url().endsWith(descriptorPath))
      atomicityLoads++;
  });
  await page.goto("/draft/topics/transactions-isolation");
  await page.getByLabel("Reservation 1 quantity", { exact: true }).fill("2");
  expect(atomicityLoads).toBe(0);
  await page.getByRole("button", { name: /^Atomicity & abort/ }).click();
  const result = await runJava(page);
  await snapshot(page, result, 2);
  await controls(page)
    .getByLabel("Transaction 1 quantity", { exact: true })
    .fill("3");
  await page.getByRole("button", { name: /^Reservation race/ }).click();
  await expect(
    page.getByLabel("Reservation 1 quantity", { exact: true }),
  ).toHaveValue("2");
  await page.goBack();
  await expect(
    controls(page).getByLabel("Transaction 1 quantity", { exact: true }),
  ).toHaveValue("3");
  await expect(
    page.getByRole("slider", {
      name: "Atomicity snapshot position",
      exact: true,
    }),
  ).toHaveValue("2");
  await page.getByRole("tab", { name: "Study", exact: true }).click();
  await page.getByRole("tab", { name: "Playground", exact: true }).click();
  await expect(
    controls(page).getByLabel("Transaction 1 quantity", { exact: true }),
  ).toHaveValue("3");
  expect(atomicityLoads).toBe(1);
  expect(posts).toHaveLength(1);
});

test("descriptor and run failures preserve local work, retry independently and show incompatible data honestly", async ({
  page,
}) => {
  await page.route(`**${descriptorPath}`, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Atomicity temporarily offline" }),
    }),
  );
  await page.goto(route);
  await expect(page.getByRole("alert")).toContainText(
    "Atomicity temporarily offline",
  );
  await page.getByRole("button", { name: /^Reservation race/ }).click();
  await expect(
    page.getByRole("button", { name: "Run reservation schedule", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Atomicity & abort/ }).click();
  await page.unroute(`**${descriptorPath}`);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const result = await runJava(page);
  await snapshot(page, result, 2);
  await controls(page)
    .getByLabel("Transaction 1 quantity", { exact: true })
    .fill("2");
  await page.route(`**${runPath}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "completed" }),
    }),
  );
  await runButton(page).click();
  await expect(page.getByRole("alert")).toContainText("incompatible");
  await expect(
    controls(page).getByLabel("Transaction 1 quantity", { exact: true }),
  ).toHaveValue("2");
  await expect(
    page.getByRole("slider", {
      name: "Atomicity snapshot position",
      exact: true,
    }),
  ).toHaveValue("2");
  await page.unroute(`**${runPath}`);
  const recovered = await runJava(page);
  expect(recovered.input.transactions[0]!.quantity).toBe(2);
});

for (const theme of ["light", "dark"] as const)
  test(`atomicity primary flow fits 320 768 1440 with reduced motion and keyboard focus in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.addInitScript(
      (value) => localStorage.setItem("hld-theme", value),
      theme,
    );
    await page.goto(route);
    const result = await runJava(page);
    await snapshot(page, result, 3);
    const add = controls(page).getByRole("button", {
      name: "Add transaction",
      exact: true,
    });
    await add.focus();
    await page.keyboard.press("Enter");
    const remove = controls(page).getByRole("button", {
      name: "Remove transaction 2 and its steps",
      exact: true,
    });
    await remove.focus();
    await page.keyboard.press("Enter");
    await expect(add).toBeFocused();
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const view of ["Playground", "Study", "Practice"]) {
        const tab = page.getByRole("tab", { name: view, exact: true });
        await tab.focus();
        await page.keyboard.press("Enter");
        await expect(tab).toBeFocused();
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          )
          .toBe(true);
        if (
          (width === 320 && view === "Playground") ||
          (width === 1440 && view !== "Playground")
        ) {
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({
            path: testInfo.outputPath(
              `atomicity-${view.toLowerCase()}-${width}-${theme}.png`,
            ),
            fullPage: true,
          });
        }
      }
    }
  });
