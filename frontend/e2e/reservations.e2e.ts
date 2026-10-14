import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { expect, test, type Page } from "@playwright/test";
import type {
  ReservationDescriptor,
  ReservationResult,
  ReservationState,
} from "../src/api/types";
const route = "/draft/topics/transactions-isolation";
const descriptorPath = "/api/v1/simulations/transactions-isolation";
const runPath = `${descriptorPath}/runs`;
const read = (path: string) =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: true, strictRequired: false });
ajv.addSchema(read("contracts/transactions-isolation.input.schema.json"));
const validate = ajv.compile(
  read("contracts/transactions-isolation.result.schema.json"),
);
const questions = read(
  "content/topics/transactions-isolation/questions.json",
) as Array<{ id: string; prompt: string }>;
const runButton = (page: Page) =>
  page.getByRole("button", { name: "Run reservation schedule", exact: true });
function observe(page: Page) {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(runPath))
      posts.push(request.postData()!);
  });
  return posts;
}
async function runJava(page: Page): Promise<ReservationResult> {
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
      name: "Java reservation analysis results",
      exact: true,
    }),
  ).toBeVisible();
  return result;
}
async function snapshot(
  page: Page,
  result: ReservationResult,
  position: number,
) {
  await page
    .getByRole("slider", { name: "Snapshot position", exact: true })
    .fill(String(position));
  const state: ReservationState = position
    ? result.outcomes[position - 1]!.postState
    : result.initialState;
  const selected = page.getByRole("region", {
    name: "Selected reservation snapshot",
    exact: true,
  });
  for (const [label, value] of [
    ["Remaining units", state.remainingUnits],
    ["Allocated units", state.allocatedUnits],
    ["Accounted units", state.invariants.accountedUnits],
  ] as const) {
    await expect(
      selected
        .locator(".reservation-counts > div")
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator("dd"),
    ).toHaveText(String(value));
  }
  await expect(
    selected
      .getByRole("list", { name: "Reservation observations" })
      .getByRole("listitem"),
  ).toHaveCount(result.input.reservations.length);
  await expect(
    selected.getByRole("definition").filter({ hasText: "Violated" }),
  ).toHaveCount(
    [
      state.invariants.remainingNonnegative,
      state.invariants.allocatedWithinCapacity,
      state.invariants.unitsConserved,
    ].filter((value) => !value).length,
  );
}
test("all eight Java scenarios show every prefix and keep whole-schedule safety separate", async ({
  page,
  request,
}) => {
  const posts = observe(page);
  const descriptor: ReservationDescriptor = await (
    await request.get(descriptorPath)
  ).json();
  expect(descriptor.presets).toHaveLength(8);
  await page.goto(route);
  await expect(runButton(page)).toBeVisible();
  expect(posts).toHaveLength(0);
  for (const preset of descriptor.presets) {
    await page.getByRole("button", { name: preset.title, exact: true }).click();
    const result = await runJava(page);
    expect(result.input).toEqual(preset.input);
    for (let i = 0; i <= result.outcomes.length; i++)
      await snapshot(page, result, i);
    if (preset.id === "unsafe-baseline") {
      expect(result.metrics).toMatchObject({
        acceptedReservations: 2,
        invariantStatus: "VIOLATED",
        firstViolationStepId: "attempt-b",
      });
    }
    if (preset.id === "protected-baseline") {
      expect(result.metrics).toMatchObject({
        acceptedReservations: 1,
        rejectedReservations: 1,
        invariantStatus: "PRESERVED",
      });
    }
    if (preset.id === "conservation-gap") {
      expect(result.finalState.invariants).toMatchObject({
        allocatedWithinCapacity: true,
        unitsConserved: false,
      });
    }
    if (preset.id === "stale-restoration") {
      expect(
        result.outcomes.map((step) => step.postState.remainingUnits),
      ).toEqual([2, 2, 0, 1]);
    }
    await snapshot(page, result, 0);
    await expect(
      page.getByRole("region", { name: "Whole schedule summary" }),
    ).toContainText(
      result.metrics.invariantStatus === "PRESERVED" ? "Preserved" : "Violated",
    );
  }
  expect(posts).toHaveLength(8);
});
test("edited IDs, quantity, strategy, winner and four actors change actual Java evidence", async ({
  page,
}) => {
  await page.goto(route);
  await page.getByLabel("Initial stock (units)").fill("2");
  await page.getByLabel("Reservation 1 ID").fill("buyer-a");
  await page.getByLabel("Reservation 1 quantity").fill("2");
  await page
    .getByLabel("Reservation strategy")
    .selectOption("ATOMIC_CONDITIONAL_RESERVATION");
  let result = await runJava(page);
  expect(result.finalState.allocations).toEqual([
    { reservationId: "buyer-a", quantity: 2, stepId: "attempt-a" },
  ]);
  await page
    .getByRole("button", { name: "Move step 4 up", exact: true })
    .click();
  result = await runJava(page);
  expect(result.finalState.allocations[0]!.reservationId).toBe("b");
  expect(result.metrics.finalRemainingUnits).toBe(1);
  await page
    .getByRole("button", { name: "Add reservation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add reservation", exact: true })
    .click();
  result = await runJava(page);
  expect(result.input.reservations).toHaveLength(4);
  expect(result.outcomes).toHaveLength(8);
  expect(result.metrics.acceptedReservations).toBe(2);
  expect(result.metrics.invariantStatus).toBe("PRESERVED");
  await snapshot(page, result, 8);
});
test("invalid and failed requests retain prediction and previous evidence, then explicit retry succeeds", async ({
  page,
}) => {
  const posts = observe(page);
  await page.goto(route);
  await page
    .getByLabel("Your prediction (optional)")
    .fill("Both stale readers may allocate one unit.");
  const first = await runJava(page);
  await page.getByLabel("Initial stock (units)").fill("");
  await runButton(page).click();
  await expect(page.getByRole("alert")).toContainText("highlighted fields");
  expect(posts).toHaveLength(1);
  await snapshot(page, first, 4);
  await page.getByLabel("Initial stock (units)").fill("1");
  await page
    .getByRole("button", { name: "Move step 3 up", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move step 2 up", exact: true })
    .click();
  await runButton(page).click();
  await expect(page.getByRole("alert")).toContainText("highlighted fields");
  expect(posts).toHaveLength(1);
  await page
    .getByRole("button", { name: "Both read one unit", exact: true })
    .click();
  await page.route(
    `**${runPath}`,
    (interception) =>
      interception.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "The Java model is busy. Try again." }),
      }),
    { times: 1 },
  );
  await runButton(page).click();
  await expect(page.getByRole("alert")).toContainText("busy");
  await snapshot(page, first, 4);
  await page.route(
    `**${runPath}`,
    async (interception) => {
      const response = await interception.fetch();
      const body = await response.json();
      body.input.initialUnits = 2;
      await interception.fulfill({ response, json: body });
    },
    { times: 1 },
  );
  await runButton(page).click();
  await expect(page.getByRole("alert")).toContainText("incompatible");
  await expect(page.getByLabel("Your prediction (optional)")).toHaveValue(
    "Both stale readers may allocate one unit.",
  );
  await snapshot(page, first, 4);
  await runJava(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("pending run locks input and presets until the actual Java response arrives", async ({
  page,
}) => {
  await page.goto(route);
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    `**${runPath}`,
    async (interception) => {
      const response = await interception.fetch();
      await barrier;
      await interception.fulfill({ response });
    },
    { times: 1 },
  );
  try {
    await runButton(page).click();
    await expect(
      page.getByRole("button", { name: "Running in Java…", exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel("Initial stock (units)")).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: "Check current stock atomically",
        exact: true,
      }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(
    page.getByRole("region", { name: "Java reservation analysis results" }),
  ).toBeVisible();
  await expect(runButton(page)).toBeEnabled();
});
test("draft content retries and saved Practice resumes its exact question without POST", async ({
  page,
}) => {
  const posts = observe(page);
  await page.route(
    "**/api/v1/draft/topics/transactions-isolation",
    (interception) =>
      interception.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Draft content is temporarily unavailable.",
        }),
      }),
    { times: 1 },
  );
  await page.goto(`${route}?view=practice&question=${questions[1]!.id}`);
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const question = page
    .getByRole("article")
    .filter({ hasText: questions[1]!.prompt });
  await question
    .getByLabel("Your explanation")
    .fill("Check current stock at the atomic acceptance boundary.");
  await page.getByRole("link", { name: /HLD with UI home/ }).click();
  const resume = page
    .getByRole("region", { name: "Continue learning", exact: true })
    .getByRole("link", { name: "Continue saved work", exact: true });
  await expect(resume).toHaveAttribute(
    "href",
    `${route}?view=practice&question=${questions[1]!.id}`,
  );
  await resume.click();
  await expect(page.getByLabel("Your explanation").nth(1)).toHaveValue(
    "Check current stock at the atomic acceptance boundary.",
  );
  expect(posts).toHaveLength(0);
});
test("keyboard ID editing, reorder and removal preserve focus and never run automatically", async ({
  page,
}) => {
  const posts = observe(page);
  await page.goto(route);
  const id = page.getByLabel("Reservation 1 ID");
  await id.fill("renamed");
  await expect(id).toBeFocused();
  const move = page.getByRole("button", {
    name: "Move step 2 up",
    exact: true,
  });
  await move.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Move step 1 down", exact: true }),
  ).toBeFocused();
  const add = page.getByRole("button", {
    name: "Add reservation",
    exact: true,
  });
  await add.click();
  const remove = page.getByRole("button", {
    name: "Remove reservation 3",
    exact: true,
  });
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(add).toBeFocused();
  expect(posts).toHaveLength(0);
});
for (const theme of ["light", "dark"] as const)
  test(`reservation Playground Study Practice fit 320 768 1440 with reduced motion in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.addInitScript(
      (value) => localStorage.setItem("hld-theme", value),
      theme,
    );
    await page.goto(route);
    const result = await runJava(page);
    await snapshot(page, result, 4);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const view of ["Playground", "Study", "Practice"]) {
        const tab = page.getByRole("tab", { name: view, exact: true });
        await tab.focus();
        await page.keyboard.press("Enter");
        await expect(tab).toBeFocused();
        await expect(tab).toHaveAttribute("aria-selected", "true");
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
          await page.evaluate(() =>
            window.scrollTo({ top: 0, behavior: "instant" }),
          );
          await page.screenshot({
            path: testInfo.outputPath(
              `reservations-${view.toLowerCase()}-${width}-${theme}.png`,
            ),
            fullPage: true,
          });
        }
      }
    }
  });
