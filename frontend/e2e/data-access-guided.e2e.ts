import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { DataAccessResult, GuidedCheckpoint } from "../src/api/types";
const id = "data-access-models";
const route = `/draft/topics/${id}`;
const topicPath = `/api/v1/draft/topics/${id}`;
const runPath = `/api/v1/simulations/${id}/runs`;
const checkpoints: GuidedCheckpoint[] = JSON.parse(
  readFileSync(
    new URL(`../../content/topics/${id}/checkpoints.json`, import.meta.url),
    "utf8",
  ),
);
const panel = (page: Page) =>
  page.getByRole("tabpanel", { name: "Guided", exact: true });
const prediction = (page: Page) =>
  panel(page).getByRole("textbox", { name: /^Your prediction/ });
const reveal = (page: Page) =>
  panel(page).getByRole("button", { name: "Run and reveal", exact: true });
const evidence = (page: Page) =>
  panel(page).getByRole("article", { name: /^Evidence for / });
function observeRuns(page: Page) {
  const runs: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(runPath))
      runs.push(request.postData()!);
  });
  return runs;
}
async function runJava(page: Page): Promise<DataAccessResult> {
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
async function tab(page: Page, name: string) {
  const item = page.getByRole("tab", { name, exact: true });
  await item.click();
  await expect(item).toHaveAttribute("aria-selected", "true");
}
async function assertOutcome(
  page: Page,
  result: DataAccessResult,
  checkpoint: GuidedCheckpoint,
) {
  const target = checkpoint.target;
  if (!("operationId" in target)) throw new Error("Expected operation target");
  const outcome = result.outcomes.find(
    (item) =>
      item.operationId === target.operationId && item.kind === target.kind,
  )!;
  expect(outcome).toBeTruthy();
  await expect(evidence(page)).toHaveAttribute(
    "aria-label",
    `Evidence for ${outcome.operationId}`,
  );
  await expect(evidence(page)).toContainText(outcome.explanation);
  await expect(evidence(page)).toContainText(
    `Record count: ${outcome.recordCountBefore} before this operation → ${outcome.recordCountAfter} after it.`,
  );
  const counts = evidence(page).getByRole("definition");
  const expectedCounts = [
    outcome.work.indexEntriesExamined,
    outcome.work.baseRowsExamined,
    outcome.work.returnedRows,
    outcome.work.baseWrites,
  ];
  for (let index = 0; index < expectedCounts.length; index++)
    await expect(counts.nth(index)).toHaveText(String(expectedCounts[index]));
  if (outcome.kind === "INSERT")
    await expect(evidence(page)).toContainText(
      outcome.accepted ? "Record inserted" : "Insert rejected",
    );
  else
    for (const rowId of outcome.returnedIds)
      await expect(
        evidence(page).getByRole("rowheader", { name: rowId, exact: true }),
      ).toBeVisible();
  await expect(
    panel(page).getByLabel("Whole workload counts", { exact: true }),
  ).toHaveCount(0);
  await expect(panel(page).getByText(/Final record set/)).toHaveCount(0);
}

test("eight Guided outcomes match real Java evidence and reuse seven presets", async ({
  page,
}) => {
  const runs = observeRuns(page);
  const results = new Map<string, DataAccessResult>();
  await page.goto(`${route}?view=guided`);
  await expect(reveal(page)).toBeVisible();
  expect(runs).toHaveLength(0);
  expect(checkpoints).toHaveLength(8);
  for (const checkpoint of checkpoints) {
    await selectCheckpoint(page, checkpoint);
    await prediction(page).fill(
      `I predict ${checkpoint.id}: access work and write rules are separate.`,
    );
    let result = results.get(checkpoint.presetId);
    if (!result) {
      result = await runJava(page);
      results.set(checkpoint.presetId, result);
    } else await reveal(page).click();
    await assertOutcome(page, result, checkpoint);
    const choice = checkpoint.tradeoff.options.find(
      (option) => option.id === checkpoint.tradeoff.recommendedOptionId,
    )!;
    await panel(page)
      .getByRole("radio", { name: choice.label, exact: true })
      .check();
    await expect(panel(page).locator(".guided-feedback")).toContainText(
      "Recommended choice.",
    );
  }
  expect(runs).toHaveLength(7);
  await selectCheckpoint(page, checkpoints[0]!);
  await assertOutcome(page, results.get("baseline")!, checkpoints[0]!);
  expect(runs).toHaveLength(7);
});

test("saved data reasoning resumes the exact checkpoint with explicit rerun and confirmed reset", async ({
  page,
}) => {
  const runs = observeRuns(page);
  const checkpoint = checkpoints[4]!;
  const answer = "A new primary ID can conflict with beta/k2.";
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
  await expect(evidence(page)).toHaveCount(0);
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
  await expect(evidence(page)).toBeVisible();
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
  await expect(evidence(page)).toHaveCount(0);
  expect(runs).toHaveLength(2);
});

test("unmatched operation target cannot reveal unsupported explanation and retry retains prediction", async ({
  page,
}) => {
  await page.route(`**${topicPath}`, async (intercepted) => {
    const response = await intercepted.fetch();
    const body = await response.json();
    body.checkpoints[0].target.operationId = "missing";
    await intercepted.fulfill({ response, json: body });
  });
  await page.goto(`${route}?view=guided`);
  await prediction(page).fill("Two entries should match beta.");
  await runJava(page);
  await expect(panel(page).getByRole("alert")).toContainText(
    "This checkpoint no longer matches the Java evidence",
  );
  await expect(evidence(page)).toHaveCount(0);
  await expect(
    panel(page).getByRole("heading", {
      name: "3. Why it happens",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(prediction(page)).toHaveValue("Two entries should match beta.");
  await page.unroute(`**${topicPath}`);
  await page.reload();
  await runJava(page);
  await expect(evidence(page)).toBeVisible();
});

test("busy data Guided run preserves prediction for an explicit real Java retry", async ({
  page,
}) => {
  await page.route(`**${runPath}`, (intercepted) =>
    intercepted.fulfill({
      status: 503,
      headers: { "Retry-After": "1" },
      json: {
        code: "simulation_busy",
        message: "Keep the prediction and retry explicitly.",
        fieldErrors: {},
        timestamp: "2026-10-13T19:00:00Z",
      },
    }),
  );
  await page.goto(`${route}?view=guided`);
  await prediction(page).fill("Same rows, different candidate work.");
  await reveal(page).click();
  await expect(panel(page).getByRole("alert")).toContainText(
    "Keep the prediction",
  );
  await expect(prediction(page)).toHaveValue(
    "Same rows, different candidate work.",
  );
  await expect(evidence(page)).toHaveCount(0);
  await page.unroute(`**${runPath}`);
  await runJava(page);
  await expect(evidence(page)).toBeVisible();
  await expect(panel(page).getByRole("alert")).toHaveCount(0);
});

test("authored access responsibilities and three operation paths support keyboard reading without Java runs", async ({
  page,
}) => {
  const runs = observeRuns(page);
  await page.goto(`${route}?view=architecture`);
  const inspect = page.getByRole("button", {
    name: "Inspect Scoped business rule",
    exact: true,
  });
  await inspect.focus();
  await page.keyboard.press("Enter");
  await expect(inspect).toBeFocused();
  await expect(inspect).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("region", {
      name: "Selected access responsibility",
      exact: true,
    }),
  ).toContainText("beta/k2");
  await expect(
    page.getByRole("region", {
      name: "Access ownership text equivalent",
      exact: true,
    }),
  ).toContainText("rejection changes nothing");
  await tab(page, "Operation sequence");
  for (const name of [
    "Read · one tenant's range",
    "Write · accept a new business key",
    "Write · reject a scoped conflict",
  ]) {
    await page.getByRole("radio", { name, exact: true }).check();
    await expect(
      page
        .getByRole("region", {
          name: "Full authored operation path",
          exact: true,
        })
        .getByRole("listitem"),
    ).toHaveCount(5);
    const next = page.getByRole("button", {
      name: "Next path step",
      exact: true,
    });
    for (let i = 1; i < 5; i++) {
      await next.focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("region", {
          name: "Selected authored operation step",
          exact: true,
        }),
      ).toContainText(`Step ${i + 1} of 5`);
      if (i < 4) await expect(next).toBeFocused();
    }
    await expect(next).toBeDisabled();
    await page
      .getByRole("button", { name: "Reset authored path", exact: true })
      .click();
    await expect(
      page.getByRole("region", {
        name: "Selected authored operation step",
        exact: true,
      }),
    ).toContainText("Step 1 of 5");
  }
  expect(runs).toHaveLength(0);
});
for (const theme of ["light", "dark"] as const) {
  test(`data Guided and authored views fit three widths in ${theme} reduced motion`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 900 });
    const runs = observeRuns(page);
    await page.goto(`${route}?view=guided`);
    await prediction(page).fill("Two entries, two fetched rows.");
    const result = await runJava(page);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [name, slug] of [
        ["Guided", "guided"],
        ["Architecture", "architecture"],
        ["Operation sequence", "sequence"],
      ]) {
        await tab(page, name!);
        if (name === "Guided") {
          await assertOutcome(page, result, checkpoints[0]!);
          if (width === 320) {
            const table = evidence(page).getByRole("region", {
              name: "Returned records for this operation",
              exact: true,
            });
            expect(
              await table.evaluate(
                (element) => element.scrollWidth > element.clientWidth,
              ),
            ).toBe(true);
            await table.focus();
            await table.evaluate((element) => {
              element.setAttribute("data-scroll-complete", "false");
              element.addEventListener(
                "scrollend",
                () => element.setAttribute("data-scroll-complete", "true"),
                { once: true },
              );
            });
            await page.keyboard.press("ArrowRight");
            await expect
              .poll(() => table.evaluate((element) => element.scrollLeft))
              .toBeGreaterThan(0);
            await expect(table).toHaveAttribute("data-scroll-complete", "true");
            await table.evaluate((element) =>
              element.scrollTo({ left: 0, behavior: "instant" }),
            );
            await expect
              .poll(() => table.evaluate((element) => element.scrollLeft))
              .toBe(0);
          }
        }
        if (name === "Architecture") {
          const button = page.getByRole("button", {
            name: "Inspect Ordered access view",
            exact: true,
          });
          await button.focus();
          await page.keyboard.press("Enter");
          await expect(button).toBeFocused();
        }
        if (name === "Operation sequence") {
          const next = page.getByRole("button", {
            name: "Next path step",
            exact: true,
          });
          await next.focus();
          await page.keyboard.press("Enter");
          await expect(next).toBeFocused();
          await page
            .getByRole("button", { name: "Reset authored path", exact: true })
            .click();
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: "instant" }),
        );
        await page.screenshot({
          path: testInfo.outputPath(
            `data-access-${slug}-${width}-${theme}.png`,
          ),
          fullPage: true,
        });
      }
    }
    expect(runs).toHaveLength(1);
  });
}
