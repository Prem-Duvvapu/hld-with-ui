import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { ReservationResult, GuidedCheckpoint } from "../src/api/types";
const id = "transactions-isolation";
const route = `/draft/topics/${id}`;
const topicPath = `/api/v1/draft/topics/${id}`;
const runPath = `/api/v1/simulations/${id}/runs`;
const checkpoints: GuidedCheckpoint[] = JSON.parse(
  readFileSync(
    new URL(`../../content/topics/${id}/checkpoints.json`, import.meta.url),
    "utf8",
  ),
).filter((checkpoint: GuidedCheckpoint) => checkpoint.simulationId === id);
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
async function runJava(page: Page): Promise<ReservationResult> {
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
  result: ReservationResult,
  checkpoint: GuidedCheckpoint,
) {
  const target = checkpoint.target;
  if (!("stepId" in target)) throw new Error("Expected operation target");
  const outcome = result.outcomes.find(
    (item) => item.stepId === target.stepId && item.kind === target.kind,
  )!;
  expect(outcome).toBeTruthy();
  await expect(evidence(page)).toHaveAttribute(
    "aria-label",
    `Evidence for ${outcome.stepId}`,
  );
  await expect(evidence(page)).toContainText(outcome.explanation);
  const snapshot = panel(page).getByRole("region", {
    name: "Selected reservation snapshot",
    exact: true,
  });
  for (const [label, value] of [
    ["Remaining units", outcome.postState.remainingUnits],
    ["Allocated units", outcome.postState.allocatedUnits],
    ["Accounted units", outcome.postState.invariants.accountedUnits],
  ] as const) {
    await expect(
      snapshot
        .locator(".reservation-counts > div")
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator("dd"),
    ).toHaveText(String(value));
  }
  for (const actor of outcome.postState.reservations) {
    const item = snapshot.getByRole("listitem", {
      name: `Reservation ${actor.id}`,
      exact: true,
    });
    const statusLabel = {
      NOT_READ: "Not read yet",
      READ_OBSERVED: "Read observed",
      ACCEPTED: "Accepted",
      REJECTED: "Rejected",
    }[actor.status];
    await expect(item).toContainText(statusLabel);
    await expect(item.locator("dd").first()).toHaveText(String(actor.quantity));
    await expect(item.locator("dd").last()).toHaveText(
      actor.observedRemaining === undefined
        ? "Not read yet"
        : String(actor.observedRemaining),
    );
  }
  const flags = snapshot
    .getByLabel("Invariant checks at this snapshot", { exact: true })
    .locator("dd");
  await expect(flags).toHaveText(
    [
      outcome.postState.invariants.remainingNonnegative,
      outcome.postState.invariants.allocatedWithinCapacity,
      outcome.postState.invariants.unitsConserved,
    ].map((passed) => (passed ? "Preserved" : "Violated")),
  );
  await expect(
    panel(page).getByRole("region", {
      name: "Whole schedule summary",
      exact: true,
    }),
  ).toHaveCount(0);
}

test("eight reservation Guided targets match actual Java prefixes and reuse five presets", async ({
  page,
}) => {
  const runs = observeRuns(page);
  const results = new Map<string, ReservationResult>();
  await page.goto(`${route}?view=guided`);
  await expect(reveal(page)).toBeVisible();
  expect(runs).toHaveLength(0);
  expect(checkpoints).toHaveLength(8);
  for (const checkpoint of checkpoints) {
    await selectCheckpoint(page, checkpoint);
    await expect(evidence(page)).toHaveCount(0);
    await prediction(page).fill(
      `I predict ${checkpoint.id}: observations are previews and acceptance needs a boundary.`,
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
  expect(runs).toHaveLength(5);
  await selectCheckpoint(page, checkpoints[0]!);
  await assertOutcome(
    page,
    results.get("protected-baseline")!,
    checkpoints[0]!,
  );
  expect(runs).toHaveLength(5);
});

test("saved reservation reasoning resumes the exact checkpoint with explicit rerun and confirmed reset", async ({
  page,
}) => {
  const runs = observeRuns(page);
  const checkpoint = checkpoints[4]!;
  const answer =
    "B remembers one but must check current zero before acceptance.";
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

test("unmatched reservation target cannot reveal unsupported explanation and retry retains prediction", async ({
  page,
}) => {
  await page.route(`**${topicPath}`, async (intercepted) => {
    const response = await intercepted.fetch();
    const body = await response.json();
    body.checkpoints[0].target.stepId = "missing";
    await intercepted.fulfill({ response, json: body });
  });
  await page.goto(`${route}?view=guided`);
  await prediction(page).fill(
    "Both readers see one unit but neither has reserved it.",
  );
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
  await expect(prediction(page)).toHaveValue(
    "Both readers see one unit but neither has reserved it.",
  );
  await page.unroute(`**${topicPath}`);
  await page.reload();
  await runJava(page);
  await expect(evidence(page)).toBeVisible();
});

test("busy reservation Guided run preserves prediction for an explicit real Java retry", async ({
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
  await prediction(page).fill(
    "Current stock determines acceptance, not the earlier preview.",
  );
  await reveal(page).click();
  await expect(panel(page).getByRole("alert")).toContainText(
    "Keep the prediction",
  );
  await expect(prediction(page)).toHaveValue(
    "Current stock determines acceptance, not the earlier preview.",
  );
  await expect(evidence(page)).toHaveCount(0);
  await page.unroute(`**${runPath}`);
  await runJava(page);
  await expect(evidence(page)).toBeVisible();
  await expect(panel(page).getByRole("alert")).toHaveCount(0);
});

test("authored reservation ownership and three manual paths support keyboard reading without POST", async ({
  page,
}) => {
  const runs = observeRuns(page);
  await page.goto(`${route}?view=architecture`);
  const buttons = page.getByRole("button", { name: /^Inspect / });
  await expect(buttons).toHaveCount(6);
  for (let index = 0; index < (await buttons.count()); index++) {
    const button = buttons.nth(index);
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("region", {
        name: "Selected reservation responsibility",
        exact: true,
      }),
    ).toBeVisible();
  }
  await tab(page, "Operation sequence");
  for (const name of [
    "Both accept from an earlier read",
    "Current stock rejects the later attempt",
    "A serial order hides the flaw",
  ]) {
    await page.getByRole("radio", { name, exact: true }).check();
    const next = page.getByRole("button", {
      name: "Next path step",
      exact: true,
    });
    for (let i = 0; i < 4; i++) {
      await next.focus();
      await page.keyboard.press("Enter");
      if (i < 3) await expect(next).toBeFocused();
    }
    await expect(next).toBeDisabled();
    await expect(
      page.getByRole("region", {
        name: "Selected reservation path step",
        exact: true,
      }),
    ).toContainText(
      name === "Both accept from an earlier read"
        ? "B: ACCEPTED"
        : "B: REJECTED",
    );
    await page.getByText("Full text sequence", { exact: true }).click();
    await expect(
      page
        .getByRole("region", {
          name: "Authored reservation sequence",
          exact: true,
        })
        .getByRole("listitem"),
    ).toHaveCount(5);
    await page.getByText("Full text sequence", { exact: true }).click();
    await page.getByRole("button", { name: "Reset path", exact: true }).click();
    await expect(
      page.getByRole("region", {
        name: "Selected reservation path step",
        exact: true,
      }),
    ).toContainText("Initial");
  }
  expect(runs).toHaveLength(0);
});
for (const theme of ["light", "dark"] as const)
  test(`reservation Guided and authored views fit widths/themes with reduced motion in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.addInitScript(
      (value) => localStorage.setItem("hld-theme", value),
      theme,
    );
    const runs = observeRuns(page);
    await page.goto(`${route}?view=guided`);
    const result = await runJava(page);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const view of ["Guided", "Architecture", "Operation sequence"]) {
        const item = page.getByRole("tab", { name: view, exact: true });
        await item.focus();
        await page.keyboard.press("Enter");
        await expect(item).toBeFocused();
        await expect(item).toHaveAttribute("aria-selected", "true");
        if (view === "Guided")
          await assertOutcome(page, result, checkpoints[0]!);
        if (view === "Architecture") {
          const button = page.getByRole("button", { name: /^Inspect / }).last();
          await button.focus();
          await page.keyboard.press("Enter");
          await expect(button).toBeFocused();
        }
        if (view === "Operation sequence") {
          const next = page.getByRole("button", {
            name: "Next path step",
            exact: true,
          });
          await next.focus();
          await page.keyboard.press("Enter");
          await expect(next).toBeFocused();
          await page
            .getByRole("button", { name: "Reset path", exact: true })
            .click();
        }
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          )
          .toBe(true);
        if (
          (width === 320 && view === "Guided") ||
          (width === 1440 && view !== "Guided")
        ) {
          await page.evaluate(() => document.fonts.ready);
          await page.evaluate(() =>
            window.scrollTo({ top: 0, behavior: "instant" }),
          );
          await page.screenshot({
            path: testInfo.outputPath(
              `reservation-${view.toLowerCase().replace(" ", "-")}-${width}-${theme}.png`,
            ),
            fullPage: true,
          });
        }
      }
    }
    expect(runs).toHaveLength(1);
  });
