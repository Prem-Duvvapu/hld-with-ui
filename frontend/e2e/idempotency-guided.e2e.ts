import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type {
  GuidedCheckpoint,
  IdempotencyResult,
  IdempotencyState,
} from "../src/api/types";
import {
  callerObservation,
  phaseLabels,
  lookupLabels,
  resolutionLabels,
} from "../src/features/idempotency/idempotencyLabels";

const route = "/draft/topics/idempotency";
const runPath = "/api/v1/simulations/idempotency/runs";
const authoredPaths = JSON.parse(
  readFileSync(
    new URL(
      "../src/features/idempotency/idempotencyAuthoredPaths.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  id: string;
  title: string;
  steps: { id: string; state: IdempotencyState }[];
}[];
const checkpoints = JSON.parse(
  readFileSync(
    new URL(
      "../../content/topics/idempotency/checkpoints.json",
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
    name: "Java idempotency evidence at this checkpoint",
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
async function run(page: Page): Promise<IdempotencyResult> {
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
  await expect(panel).toBeVisible();
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
  // Preserve real fixed/sticky positions instead of stitching a tall panel from a scrolled viewport.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path, fullPage: true });
}
async function assertState(selected: Locator, state: IdempotencyState) {
  await fact(selected, "Published units", state.publishedUnits);
  await fact(selected, "Active retained keys", state.activeKeyCount);
  await fact(selected, "Expired historical keys", state.expiredKeyCount);
  await expect(selected.getByRole("article", { name: /^Call / })).toHaveCount(
    state.calls.length,
  );
  for (const call of state.calls) {
    const card = selected.getByRole("article", {
      name: `Call ${call.id}`,
      exact: true,
    });
    await expect(card.getByRole("heading")).toHaveText(
      `${call.id} · ${phaseLabels[call.phase]}`,
    );
    await expect(card.locator(".idem-state-pair strong")).toHaveText([
      String(call.pendingUnits),
      callerObservation(call),
    ]);
    await fact(
      card,
      "Lookup observation",
      call.lookupDisposition
        ? lookupLabels[call.lookupDisposition]
        : "Not looked up",
    );
    await fact(
      card,
      "Server resolution",
      call.resolution ? resolutionLabels[call.resolution] : "Not resolved",
    );
    await fact(
      card,
      "Record observed at lookup",
      call.observedRecordId ?? "None",
    );
    await fact(
      card,
      "Record used at resolution",
      call.resolvedRecordId ?? "None",
    );
    await fact(
      card,
      "This call's public effect",
      call.publishedEffectId ?? "None",
    );
    await fact(
      card,
      "Server-side receipt",
      call.receipt
        ? `${call.receipt.effectId} · ${call.receipt.units} units`
        : "None cached",
    );
  }
  await expect(
    selected
      .getByRole("region", { name: "Public effect ledger", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(state.effects.length);
  await expect(
    selected
      .getByRole("region", { name: "Retained key history", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(state.keyRecords.length);
  for (const effect of state.effects) {
    const row = selected.getByRole("listitem", {
      name: `Effect ${effect.id}`,
      exact: true,
    });
    await expect(row).toContainText(`${effect.units} units`);
    await expect(row).toContainText(`published at ${effect.publishedAtMs} ms`);
  }
  for (const record of state.keyRecords) {
    const row = selected.getByRole("listitem", {
      name: `Key record ${record.id}`,
      exact: true,
    });
    await expect(row).toHaveAttribute("data-status", record.status);
    await fact(
      row,
      "Original receipt",
      `${record.receipt.effectId} · ${record.receipt.units} units`,
    );
    await fact(row, "Expires at", `${record.expiresAtMs} ms`);
  }
}
async function prefix(
  page: Page,
  result: IdempotencyResult,
  checkpoint: GuidedCheckpoint,
) {
  const target = checkpoint.target;
  if (!("stepId" in target))
    throw new Error("Expected idempotency step identity");
  const matches = result.outcomes.filter(
    (outcome) =>
      outcome.stepId === target.stepId && outcome.kind === target.kind,
  );
  expect(matches).toHaveLength(1);
  const outcome = matches[0]!;
  await expect(evidence(page)).toContainText(outcome.explanation);
  await assertState(
    evidence(page).getByRole("region", {
      name: "Selected idempotency snapshot",
      exact: true,
    }),
    outcome.postState,
  );
  await expect(
    guided(page).getByText(checkpoint.explanation, { exact: true }),
  ).toBeVisible();
  await expect(
    guided(page).getByRole("region", {
      name: "Whole idempotency experiment summary",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(guided(page).getByRole("slider")).toHaveCount(0);
}

test("eight idempotency checkpoints reveal exact Java call/private/ledger prefixes and retain evidence across tabs", async ({
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
        `For ${checkpoint.id}, distinguish server receipts from caller observations.`,
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

test("idempotency reasoning reloads without a trace, versioned imports stay explicit and reset hides cached reveals", async ({
  page,
}) => {
  const posts = observe(page);
  const prediction = "A lost response can leave an already published effect.";
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
  await page.goto("/");
  const savedWork = page.getByRole("region", {
    name: "Continue learning",
    exact: true,
  });
  await savedWork
    .getByRole("link", { name: "Continue saved work", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(
      `/draft/topics/idempotency\\?view=guided&checkpoint=${checkpoints[0]!.id}$`,
    ),
  );
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
        topicId: "idempotency",
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
      name: "idempotency-answer-backup.json",
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

test("idempotency Guided locks a pending reveal, preserves prediction on failure and recovers only explicitly", async ({
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
        message: "Idempotency model is busy. Try again explicitly.",
        fieldErrors: [],
      }),
    });
  });
  await page.goto(`${route}?view=guided`);
  const answer = guided(page).getByRole("textbox", {
    name: /^Your prediction/,
  });
  await answer.fill("Losing a response does not remove its public effect.");
  await reveal(page).click();
  const pending = guided(page).getByRole("button", {
    name: "Running the Java model…",
    exact: true,
  });
  await expect(pending).toBeDisabled();
  await expect(evidence(page)).toHaveCount(0);
  release();
  await expect(guided(page).getByRole("alert")).toContainText("busy");
  await expect(answer).toHaveValue(
    "Losing a response does not remove its public effect.",
  );
  await expect(evidence(page)).toHaveCount(0);
  expect(posts).toHaveLength(1);
  await page.unroute(`**${runPath}`);
  const result = await run(page);
  await prefix(page, result, checkpoints[0]!);
  expect(posts).toHaveLength(2);
});

test("an unresolved idempotency identity withholds snapshot and explanation", async ({
  page,
}) => {
  await page.route("**/api/v1/draft/topics/idempotency", async (intercept) => {
    const response = await intercept.fetch();
    const body = await response.json();
    // A valid model kind at an existing step can still fail to match actual execution.
    body.checkpoints[0].target.kind = "ATOMIC_COMMITTED";
    await intercept.fulfill({ response, json: body });
  });
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
  test(`idempotency Guided and authored design views fit mobile tablet desktop in ${theme}`, async ({
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
          info.outputPath(`idempotency-guided-${width}-${theme}.png`),
        );
      const before = posts.length;
      for (const view of ["Architecture", "Call sequence"]) {
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
              name: "Selected idempotency responsibility",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            panel.getByRole("region", {
              name: "Idempotency architecture text equivalent",
              exact: true,
            }),
          ).toBeVisible();
        } else {
          const paths = panel.getByRole("radio");
          await expect(paths).toHaveCount(3);
          for (let index = 0; index < 3; index++) {
            await paths.nth(index).check();
            const next = panel.getByRole("button", {
              name: "Next idempotency path step",
              exact: true,
            });
            await next.focus();
            await page.keyboard.press("Enter");
            await expect(next).toBeFocused();
            await expect(
              panel.getByRole("region", {
                name: "Selected idempotency path step",
                exact: true,
              }),
            ).toBeVisible();
          }
          await panel
            .getByText("Full idempotency text sequence", { exact: true })
            .click();
          await expect(
            panel.getByRole("region", {
              name: "Authored idempotency sequence",
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
              `idempotency-${view === "Architecture" ? "architecture" : "sequence"}-${width}-${theme}.png`,
            ),
          );
      }
      expect(posts).toHaveLength(before);
    }
    expect(posts).toHaveLength(3);
  });
}

test("all three authored call paths show every Java-verified state and recover keyboard focus at their ends", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const posts = observe(page);
  await page.goto(`${route}?view=sequence`);
  const panel = page.getByRole("tabpanel", {
    name: "Call sequence",
    exact: true,
  });
  for (const path of authoredPaths) {
    await panel.getByRole("radio", { name: path.title, exact: true }).check();
    const scene = panel.getByRole("region", {
      name: "Selected idempotency path step",
      exact: true,
    });
    const next = panel.getByRole("button", {
      name: "Next idempotency path step",
      exact: true,
    });
    const previous = panel.getByRole("button", {
      name: "Previous idempotency path step",
      exact: true,
    });
    await expect(previous).toBeDisabled();
    for (let index = 0; index < path.steps.length; index++) {
      const step = path.steps[index]!;
      await expect(scene).toContainText(step.id);
      await assertState(
        scene.getByRole("region", {
          name: "Selected idempotency snapshot",
          exact: true,
        }),
        step.state,
      );
      if (index < path.steps.length - 1) {
        await next.focus();
        await page.keyboard.press("Enter");
      }
    }
    await expect(next).toBeDisabled();
    await expect(previous).toBeFocused();
    await panel
      .getByRole("button", { name: "Reset idempotency path", exact: true })
      .click();
    await expect(previous).toBeDisabled();
    await assertState(
      scene.getByRole("region", {
        name: "Selected idempotency snapshot",
        exact: true,
      }),
      path.steps[0]!.state,
    );
  }
  await panel
    .getByText("Full idempotency text sequence", { exact: true })
    .click();
  const text = panel.getByRole("region", {
    name: "Authored idempotency sequence",
    exact: true,
  });
  await expect(text).toBeVisible();
  await expect(text.locator(":scope > ol > li")).toHaveCount(9);
  expect(posts).toHaveLength(0);
});

test("invalid draft checkpoint metadata fails visibly before a run and recovers on explicit retry", async ({
  page,
}) => {
  const posts = observe(page);
  await page.route(
    "**/api/v1/draft/topics/idempotency",
    async (intercepted) => {
      const response = await intercepted.fetch();
      const body = await response.json();
      body.checkpoints[0].target.kind = "TRANSACTION_COMMITTED";
      await intercepted.fulfill({ response, json: body });
    },
  );
  await page.goto(`${route}?view=guided`);
  await expect(page.getByRole("alert")).toContainText("incompatible");
  await expect(page.getByRole("tab")).toHaveCount(0);
  expect(posts).toHaveLength(0);
  await page.unroute("**/api/v1/draft/topics/idempotency");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(reveal(page)).toBeVisible();
  expect(posts).toHaveLength(0);
});
