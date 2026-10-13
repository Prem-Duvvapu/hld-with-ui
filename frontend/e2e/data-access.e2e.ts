import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { expect, test, type Page } from "@playwright/test";
import type { DataAccessDescriptor, DataAccessResult } from "../src/api/types";
const route = "/draft/topics/data-access-models";
const topicPath = "/api/v1/draft/topics/data-access-models";
const descriptorPath = "/api/v1/simulations/data-access-models";
const runPath = `${descriptorPath}/runs`;
const read = (path: string) =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: true, strictRequired: false });
ajv.addSchema(read("contracts/data-access.input.schema.json"));
const validResult = ajv.compile(
  read("contracts/data-access.result.schema.json"),
);
const questions = read(
  "content/topics/data-access-models/questions.json",
) as Array<{ id: string; prompt: string }>;
const runButton = (page: Page) =>
  page.getByRole("button", { name: "Run access analysis", exact: true });
function observe(page: Page) {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(runPath))
      posts.push(request.postData()!);
  });
  return posts;
}
async function runJava(page: Page): Promise<DataAccessResult> {
  const pending = page.waitForResponse(
    (response) =>
      response.url().endsWith(runPath) &&
      response.request().method() === "POST",
  );
  await runButton(page).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(validResult(result), JSON.stringify(validResult.errors)).toBe(true);
  await expect(
    page.getByText(
      "Analysis complete. These results match the submitted design.",
      { exact: true },
    ),
  ).toBeVisible();
  return result;
}
async function selectedCounts(
  page: Page,
  result: DataAccessResult,
  position = 0,
) {
  const outcome = result.outcomes[position]!;
  const evidence = page.getByRole("article", {
    name: `Evidence for ${outcome.operationId}`,
    exact: true,
  });
  for (const [label, expected] of [
    ["Index entries examined", outcome.work.indexEntriesExamined],
    ["Base records examined", outcome.work.baseRowsExamined],
    ["Records returned", outcome.work.returnedRows],
    ["Base record writes", outcome.work.baseWrites],
  ] as const) {
    await expect(
      evidence
        .locator(".access-counts > div")
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator("dd"),
    ).toHaveText(String(expected));
  }
  if (outcome.returnedIds.length)
    await expect(
      evidence
        .getByRole("region", {
          name: "Returned records for this operation",
          exact: true,
        })
        .locator("tbody th"),
    ).toHaveText(outcome.returnedIds);
}

test("all seven scenarios reconcile actual Java access work and append-only write outcomes", async ({
  page,
  request,
}) => {
  const posts = observe(page);
  const descriptor: DataAccessDescriptor = await (
    await request.get(descriptorPath)
  ).json();
  await page.goto(route);
  await expect(runButton(page)).toBeVisible();
  expect(posts).toHaveLength(0);
  const expectedEntries: Record<string, number> = {
    baseline: 2,
    "table-scan": 0,
    "time-first": 6,
  };
  for (const preset of descriptor.presets) {
    await page.getByRole("button", { name: preset.title, exact: true }).click();
    const result = await runJava(page);
    expect(result.input).toEqual(preset.input);
    await selectedCounts(page, result);
    if (["baseline", "table-scan", "time-first"].includes(preset.id)) {
      expect(result.outcomes[0]!.returnedIds).toEqual(["b2", "b3"]);
      expect(result.totals.indexEntriesExamined).toBe(
        expectedEntries[preset.id],
      );
    }
    if (preset.id === "duplicate-key") {
      await expect(
        page.getByText("Insert rejected", { exact: true }),
      ).toBeVisible();
      expect(result.finalRows).toHaveLength(12);
      expect(result.outcomes[0]!.work.baseWrites).toBe(0);
    }
    if (preset.id === "no-unique" || preset.id === "insert-order") {
      await expect(
        page.getByText("Record inserted", { exact: true }),
      ).toBeVisible();
      expect(result.finalRows).toHaveLength(13);
      await page
        .getByRole("button", { name: "Next operation", exact: true })
        .click();
      await selectedCounts(page, result, 1);
      expect(result.outcomes[1]!.returnedIds).toEqual(["b2", "b5", "b3"]);
    }
  }
  expect(posts).toHaveLength(7);
});

test("edited index, query limit, primary lookup and empty data produce meaningful Java evidence", async ({
  page,
}) => {
  await page.goto(route);
  await page
    .getByLabel("Secondary index order", { exact: true })
    .selectOption("CREATED_TENANT");
  await page.getByLabel("Result limit", { exact: true }).fill("1");
  let result = await runJava(page);
  expect(result.outcomes[0]!.returnedIds).toEqual(["b2"]);
  expect(result.outcomes[0]!.work).toMatchObject({
    indexEntriesExamined: 6,
    baseRowsExamined: 2,
    matchedRows: 2,
    returnedRows: 1,
  });
  await selectedCounts(page, result);
  await page.getByLabel("Operation", { exact: true }).selectOption("LOOKUP_ID");
  result = await runJava(page);
  expect(result.outcomes[0]!.returnedIds).toEqual(["b2"]);
  expect(result.totals.primaryKeyLookups).toBe(1);
  await page.getByText("Edit the initial records", { exact: true }).click();
  await page.getByLabel("Initial records (JSON)").fill("[]");
  result = await runJava(page);
  expect(result.finalRows).toEqual([]);
  expect(result.outcomes[0]!.returnedIds).toEqual([]);
  await expect(
    page.getByText("The query returned no records.", { exact: true }),
  ).toBeVisible();
  await selectedCounts(page, result);
});

test("blank validation, failed run and mismatched response preserve edited design, prediction and previous evidence", async ({
  page,
}) => {
  const posts = observe(page);
  await page.goto(route);
  await page
    .getByLabel("Your prediction (optional)")
    .fill("Two records; index order changes candidates.");
  const first = await runJava(page);
  await page.getByLabel("Range start", { exact: true }).fill("");
  await runButton(page).click();
  await expect(page.getByRole("alert")).toContainText(
    "Check the highlighted fields",
  );
  expect(posts).toHaveLength(1);
  await selectedCounts(page, first);
  await page.getByLabel("Range start", { exact: true }).fill("20");
  await page.route(
    `**${runPath}`,
    (interception) =>
      interception.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "simulation_busy",
          message: "The Java model is busy. Try again.",
        }),
      }),
    { times: 1 },
  );
  await runButton(page).click();
  await expect(page.getByRole("alert")).toContainText("busy");
  await expect(page.getByLabel("Your prediction (optional)")).toHaveValue(
    "Two records; index order changes candidates.",
  );
  await selectedCounts(page, first);
  await page.route(
    `**${runPath}`,
    async (interception) => {
      const response = await interception.fetch();
      const value = await response.json();
      value.input.enforceBusinessKey = false;
      await interception.fulfill({ response, json: value });
    },
    { times: 1 },
  );
  await runButton(page).click();
  await expect(page.getByRole("alert")).toContainText("incompatible");
  await selectedCounts(page, first);
  await runJava(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("draft loading retries real content and saved Practice resumes the exact question without a run", async ({
  page,
}) => {
  const posts = observe(page);
  await page.route(
    `**${topicPath}`,
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
  await page.goto(`${route}?view=practice&question=${questions[0]!.id}`);
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Practice", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const question = page
    .getByRole("article")
    .filter({ hasText: questions[0]!.prompt });
  await question
    .getByLabel("Your explanation")
    .fill(
      "Choose keys from the required query and preserve a tenant-scoped rule.",
    );
  await page.getByRole("link", { name: /HLD with UI home/ }).click();
  const resume = page
    .getByRole("region", { name: "Continue learning", exact: true })
    .getByRole("link", { name: "Continue saved work", exact: true });
  await expect(resume).toHaveAttribute(
    "href",
    `${route}?view=practice&question=${questions[0]!.id}`,
  );
  await resume.click();
  await expect(page.getByLabel("Your explanation").first()).toHaveValue(
    "Choose keys from the required query and preserve a tenant-scoped rule.",
  );
  expect(posts).toHaveLength(0);
});

test("keyboard operation editing retains focus after removal and does not execute a run", async ({
  page,
}) => {
  const posts = observe(page);
  await page.goto(route);
  const add = page.getByRole("button", { name: "Add operation", exact: true });
  const ids = page.getByLabel("Operation ID", { exact: true });
  await ids.first().fill("edited-query");
  await expect(ids.first()).toBeFocused();
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Operation ID", { exact: true })).toHaveCount(2);
  await ids.nth(1).fill("renamed-operation");
  await expect(ids.nth(1)).toBeFocused();
  await add.click();
  await expect(ids).toHaveCount(3);
  await expect(ids.nth(2)).toHaveValue("operation-2");
  await page
    .getByRole("button", { name: "Remove operation 3", exact: true })
    .click();
  const remove = page.getByRole("button", {
    name: "Remove operation 2",
    exact: true,
  });
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(add).toBeFocused();
  await expect(page.getByLabel("Operation ID", { exact: true })).toHaveCount(1);
  expect(posts).toHaveLength(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`access workbench, Study and Practice fit mobile tablet desktop in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.addInitScript(
      (value) => localStorage.setItem("hld-theme", value),
      theme,
    );
    await page.goto(route);
    await runJava(page);
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
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          )
          .toBe(true);
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: "instant" }),
        );
        await page.screenshot({
          path: testInfo.outputPath(
            `data-access-${view.toLowerCase()}-${width}-${theme}.png`,
          ),
          fullPage: true,
        });
      }
    }
  });
}
