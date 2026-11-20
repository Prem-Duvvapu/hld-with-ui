import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import Ajv2020 from "ajv/dist/2020.js";
import type {
  IdempotencyDescriptor,
  IdempotencyResult,
  IdempotencyState,
} from "../src/api/types";

const route = "/draft/topics/idempotency";
const runPath = "/api/v1/simulations/idempotency/runs";
const read = (path: string) =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: true, strictRequired: false });
ajv.addSchema(read("contracts/idempotency.input.schema.json"));
const valid = ajv.compile(read("contracts/idempotency.result.schema.json"));
const runButton = (page: Page) =>
  page.getByRole("button", { name: "Run idempotency experiment", exact: true });
function posts(page: Page) {
  const bodies: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(runPath))
      bodies.push(request.postData()!);
  });
  return bodies;
}
async function run(page: Page): Promise<IdempotencyResult> {
  const pending = page.waitForResponse(
    (response) =>
      response.url().endsWith(runPath) &&
      response.request().method() === "POST",
  );
  await runButton(page).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(valid(result), JSON.stringify(valid.errors)).toBe(true);
  await expect(
    page.getByRole("region", {
      name: "Java idempotency simulation results",
      exact: true,
    }),
  ).toBeVisible();
  return result;
}
async function fact(scope: Locator, label: string, value: string | number) {
  await expect(
    scope.getByText(label, { exact: true }).locator("..").locator("dd"),
  ).toHaveText(String(value));
}
async function snapshot(
  page: Page,
  result: IdempotencyResult,
  position: number,
) {
  await page
    .getByRole("slider", { name: "Idempotency snapshot position", exact: true })
    .fill(String(position));
  const state: IdempotencyState = position
    ? result.outcomes[position - 1]!.postState
    : result.initialState;
  const selected = page.getByRole("region", {
    name: "Selected idempotency snapshot",
    exact: true,
  });
  await fact(selected, "Published units", state.publishedUnits);
  await fact(selected, "Active retained keys", state.activeKeyCount);
  await fact(selected, "Expired historical keys", state.expiredKeyCount);
  for (const call of state.calls) {
    const card = selected.getByRole("article", {
      name: `Call ${call.id}`,
      exact: true,
    });
    await expect(
      card
        .getByText("Private prepared units", { exact: true })
        .locator("..")
        .locator("strong"),
    ).toHaveText(String(call.pendingUnits));
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

for (const id of [
  "unprotected-response-loss",
  "split-crash-gap",
  "split-race",
  "atomic-response-loss",
  "atomic-race",
  "payload-conflict",
  "atomic-payload-race",
  "retention-boundary",
  "key-and-tenant-scope",
]) {
  test(`idempotency ${id} renders actual Java initial and every ordered snapshot`, async ({
    page,
  }) => {
    const bodies = posts(page);
    await page.goto(route);
    await expect(runButton(page)).toBeVisible();
    expect(bodies).toEqual([]);
    const descriptor = (await (
      await page.request.get("/api/v1/simulations/idempotency")
    ).json()) as IdempotencyDescriptor;
    const preset = descriptor.presets.find((preset) => preset.id === id)!;
    await page.getByLabel("Scenario", { exact: true }).selectOption(id);
    const result = await run(page);
    expect(result.input).toEqual(preset.input);
    expect(result).toEqual(
      read(`contracts/examples/idempotency-${id}-result.json`),
    );
    for (let position = 0; position <= result.outcomes.length; position++)
      await snapshot(page, result, position);
    for (const key of [
      "publishedEffects",
      "publishedUnits",
      "extraEffects",
      "receiptsReceived",
    ] as const)
      expect(result.metrics[key]).toBe(
        read(`contracts/examples/idempotency-${id}-result.json`).metrics[key],
      );
    expect(bodies).toHaveLength(1);
  });
}

test("idempotency mode-only comparison preserves schedule and original receipt identity", async ({
  page,
}) => {
  await page.goto(route);
  const baseline = await run(page);
  expect(baseline.metrics.publishedEffects).toBe(2);
  await page
    .getByLabel("Protection mode", { exact: true })
    .selectOption("ATOMIC_EFFECT_RECORD");
  await expect(page.getByText(/Inputs changed/)).toBeVisible();
  const atomic = await run(page);
  expect(atomic.input).toEqual({
    ...baseline.input,
    mode: "ATOMIC_EFFECT_RECORD",
  });
  expect(atomic.metrics.publishedEffects).toBe(1);
  expect(atomic.finalState.calls[1]!.receipt).toEqual({
    effectId: "effect-a",
    units: 1,
  });
  await snapshot(page, atomic, 0);
  await snapshot(page, atomic, atomic.outcomes.length);
});

test("idempotency edits units, key and ordered programs without silent repair", async ({
  page,
}) => {
  const bodies = posts(page);
  await page.goto(route);
  await page.getByText("Calls and identity (2)", { exact: true }).click();
  await page.getByLabel("Call 1 units", { exact: true }).fill("3");
  await page.getByLabel("Call 2 units", { exact: true }).fill("3");
  const changed = await run(page);
  expect(changed.metrics.publishedUnits).toBe(6);
  await snapshot(page, changed, changed.outcomes.length);
  expect(changed.finalState.effects.map((effect) => effect.units)).toEqual([
    3, 3,
  ]);
  await page
    .getByLabel("Protection mode", { exact: true })
    .selectOption("ATOMIC_EFFECT_RECORD");
  await page.getByLabel("Call 2 key", { exact: true }).fill("new-key");
  const separate = await run(page);
  expect(separate.metrics.publishedEffects).toBe(2);
  expect(separate.metrics.extraEffects).toBe(1);
  await snapshot(page, separate, separate.outcomes.length);
  await page.getByText("Ordered steps (8)", { exact: true }).click();
  const move = page.getByRole("button", {
    name: "Move step 1 down",
    exact: true,
  });
  await move.focus();
  await page.keyboard.press("Enter");
  const before = bodies.length;
  await runButton(page).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(bodies).toHaveLength(before);
  await expect(page.locator('[aria-invalid="true"]').first()).toBeFocused();
});

test("idempotency Study and Practice preserve local answers and never run implicitly", async ({
  page,
}) => {
  const bodies = posts(page);
  await page.goto(`${route}?view=study`);
  await expect(
    page.getByRole("heading", {
      name: "Idempotency: One Intent, Repeated Calls",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(6);
  await page.getByRole("tab", { name: "Practice", exact: true }).click();
  const answer = page.getByLabel("Your explanation", { exact: true }).first();
  await answer.fill(
    "A missing response cannot erase the effect. Check the original receipt before retrying.",
  );
  await page
    .getByRole("button", { name: "Compare with a model answer", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Example answer", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Practice", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByLabel("Your explanation", { exact: true }).first(),
  ).toHaveValue(/original receipt/);
  await page.getByRole("tab", { name: "Playground", exact: true }).click();
  await expect(runButton(page)).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("tab", { name: "Practice", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.goto("/");
  const savedWork = page.getByRole("region", {
    name: "Continue learning",
    exact: true,
  });
  await expect(savedWork).toContainText("Idempotency & Retained Results");
  await savedWork
    .getByRole("link", { name: "Continue saved work", exact: true })
    .click();
  await expect(page).toHaveURL(
    /\/draft\/topics\/idempotency\?view=practice&question=idem-lost-response-public-effect$/,
  );
  await expect(
    page
      .locator('[data-question-id="idem-lost-response-public-effect"]')
      .getByLabel("Your explanation", { exact: true }),
  ).toHaveValue(/original receipt/);
  expect(bodies).toEqual([]);
});

for (const width of [320, 768, 1440])
  for (const theme of ["light", "dark"] as const) {
    test(`idempotency is readable at ${width}px in ${theme} with reduced motion`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 950 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (value) => localStorage.setItem("hld-theme", value),
        theme,
      );
      await page.goto(route);
      const result = await run(page);
      await snapshot(page, result, result.outcomes.length);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        )
        .toBe(true);
      await page.getByRole("tab", { name: "Study", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("tab", { name: "Study", exact: true }),
      ).toBeFocused();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        )
        .toBe(true);
      await page.getByRole("tab", { name: "Playground", exact: true }).click();
      await page
        .getByRole("heading", {
          name: "Follow work, receipt and response separately",
          exact: true,
        })
        .evaluate((element) => element.scrollIntoView({ block: "start" }));
      await page.evaluate(() => window.scrollBy(0, -80));
      await info.attach(`idempotency-${width}-${theme}`, {
        body: await page.screenshot({
          path: info.outputPath(`idempotency-${width}-${theme}.png`),
        }),
        contentType: "image/png",
      });
    });
  }

test("idempotency keeps captured evidence through pending, busy error and explicit retry", async ({
  page,
}) => {
  const bodies = posts(page);
  await page.goto(route);
  const first = await run(page);
  await page.getByLabel("Result retention (ms)", { exact: true }).fill("200");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${runPath}`, async (request) => {
    await gate;
    await request.fulfill({
      status: 503,
      contentType: "application/json",
      headers: { "Retry-After": "1" },
      body: JSON.stringify({
        code: "simulation_busy",
        message: "The teaching server is busy. Try again explicitly.",
        fieldErrors: {},
        timestamp: "2026-11-19T00:00:00Z",
      }),
    });
  });
  await runButton(page).click();
  await expect(
    page.getByRole("button", {
      name: "Running idempotency in Java…",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.getByLabel("Scenario", { exact: true })).toBeDisabled();
  await expect(
    page.getByLabel("Protection mode", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Result retention (ms)", { exact: true }),
  ).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText(
    "The teaching server is busy",
  );
  await expect(runButton(page)).toBeEnabled();
  expect(bodies).toHaveLength(2);
  expect(JSON.parse(bodies[1]!)).toEqual({ ...first.input, retentionMs: 200 });
  await expect(
    page.getByRole("region", {
      name: "Java idempotency simulation results",
      exact: true,
    }),
  ).toBeVisible();
  await page.unroute(`**${runPath}`);
  const retried = await run(page);
  expect(retried.input.retentionMs).toBe(200);
  expect(bodies).toHaveLength(3);
});

test("idempotency playback is keyboard operable and pauses when hidden", async ({
  page,
}) => {
  const bodies = posts(page);
  await page.goto(route);
  await run(page);
  const position = page.getByLabel("Idempotency snapshot position", {
    exact: true,
  });
  const next = page.getByRole("button", {
    name: "Next idempotency step",
    exact: true,
  });
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(position).toHaveValue("1");
  await expect(next).toBeFocused();
  await page
    .getByRole("button", { name: "Previous idempotency step", exact: true })
    .click();
  await expect(position).toHaveValue("0");
  await page
    .getByRole("combobox", { name: "Idempotency playback speed", exact: true })
    .selectOption("350");
  await page
    .getByRole("button", { name: "Play idempotency trace", exact: true })
    .click();
  const study = page.getByRole("tab", { name: "Study", exact: true });
  await study.click();
  await expect(study).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("tabpanel", {
      name: "Playground",
      exact: true,
      includeHidden: true,
    }),
  ).toBeHidden();
  // A presentation timer would have advanced while reading if the hidden panel were active.
  const hiddenPosition = await position.inputValue();
  await page.waitForTimeout(800);
  await page.getByRole("tab", { name: "Playground", exact: true }).click();
  await expect(position).toHaveValue(hiddenPosition);
  await expect(
    page.getByRole("button", { name: "Play idempotency trace", exact: true }),
  ).toBeVisible();
  expect(bodies).toHaveLength(1);
});
