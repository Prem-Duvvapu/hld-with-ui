import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { expect, test } from "@playwright/test";

const openapi = JSON.parse(
  readFileSync(
    new URL("../../contracts/openapi.json", import.meta.url),
    "utf8",
  ),
);
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
addFormats(ajv);
ajv.addFormat("int64", true);
const resultValid = ajv.compile(
  JSON.parse(
    JSON.stringify({
      ...openapi.components.schemas.CapacityEstimateResult,
      $defs: openapi.components.schemas,
    })
      .split("#/components/schemas/")
      .join("#/$defs/"),
  ),
);

// Real HTTP responses are schema-checked before comparing the lesson's numbers.
test("capacity lesson changes agree with the Java estimator and response contract", async ({
  request,
}) => {
  const descriptorResponse = await request.get(
    "/api/v1/estimators/capacity-estimation",
  );
  expect(descriptorResponse.status()).toBe(200);
  const descriptor = await descriptorResponse.json();
  async function calculate(overrides: Record<string, number> = {}) {
    const response = await request.post(
      "/api/v1/estimators/capacity-estimation/calculations",
      {
        data: { ...descriptor.defaultInput, ...overrides },
      },
    );
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(resultValid(result), JSON.stringify(resultValid.errors)).toBe(true);
    return result;
  }
  const baseline = await calculate();
  expect(baseline.metrics.peakRequestsWithHeadroom).toBeCloseTo(752.3148, 4);
  expect(baseline.metrics.peakResponseMegabitsPerSecond).toBeCloseTo(9.2593, 4);
  expect(
    baseline.sensitivity.map(
      (point: { peakRequestsPerSecond: number }) => point.peakRequestsPerSecond,
    ),
  ).toEqual([
    expect.closeTo(462.96296, 4),
    expect.closeTo(578.7037, 4),
    expect.closeTo(694.44444, 4),
  ]);

  const moreReads = await calculate({ readPercentage: 99 });
  expect(moreReads.metrics.replicatedStorageGigabytes).toBe(109.5);
  expect(moreReads.metrics.peakResponseMegabitsPerSecond).toBe(
    baseline.metrics.peakResponseMegabitsPerSecond,
  );
  const slower = await calculate({ meanLatencyMs: 400 });
  expect(slower.metrics.meanConcurrentRequests).toBe(
    baseline.metrics.meanConcurrentRequests * 2,
  );
  const moreHeadroom = await calculate({ headroomPercentage: 60 });
  expect(moreHeadroom.metrics.peakRequestsWithHeadroom).toBeCloseTo(
    925.9259,
    4,
  );
  expect(moreHeadroom.sensitivity).toEqual(baseline.sensitivity);
});

test("cleared assumptions stay blank, errors focus the field, and an explicit zero reaches Java", async ({
  page,
}) => {
  let calculations = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/calculations") && request.method() === "POST")
      calculations++;
  });
  await page.goto("/topics/capacity-estimation");
  const readShare = page.getByLabel("Read share", { exact: true });
  await readShare.fill("");
  await expect(readShare).toHaveValue("");
  await page.getByRole("button", { name: /Calculate estimate/ }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Check the highlighted assumptions",
  );
  await expect(readShare).toBeFocused();
  await expect(readShare).toHaveAttribute("aria-invalid", "true");
  expect(calculations).toBe(0);
  await readShare.fill("0");
  await page.getByRole("button", { name: /Calculate estimate/ }).click();
  await expect(
    page.getByText("Retained copies", { exact: true }).locator(".."),
  ).toContainText("10,950");
  expect(calculations).toBe(1);
  await page.setViewportSize({ width: 320, height: 800 });
  if ((await page.locator("html").getAttribute("data-theme")) !== "dark") {
    await page.getByRole("button", { name: "Use dark theme" }).click();
  }
  // Fonts and focused controls can anchor scrolling after a one-shot scroll.
  // Position the screenshot only once text layout has settled; fullPage captures the document.
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "test-results/capacity-mobile-dark.png",
    fullPage: true,
  });
});

test("keyboard calculation and tab history preserve the submitted estimate and explain its range", async ({
  page,
}) => {
  await page.goto("/topics/capacity-estimation");
  await page.getByLabel("Mean latency", { exact: true }).fill("200.15");
  const calculate = page.getByRole("button", { name: /Calculate estimate/ });
  await calculate.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Mean in flight", { exact: true }).locator(".."),
  ).toContainText("115.8");
  await expect(
    page.getByText(/These are scenarios, not confidence intervals/),
  ).toBeVisible();
  // Fonts and focused controls can anchor scrolling after a one-shot scroll.
  // Position the screenshot only once text layout has settled; fullPage captures the document.
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "test-results/capacity-desktop-light.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: /Formula map/ }).click();
  await expect(
    page.getByText("peak RPS × kB/response × 8 ÷ 1,000", { exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("Mean latency", { exact: true })).toHaveValue(
    "200.15",
  );
  await page.getByLabel("Peak factor", { exact: true }).fill("10");
  await expect(
    page.getByRole("status").filter({ hasText: "Assumptions changed" }),
  ).toBeVisible();
  await expect(page.getByText("→ × 5", { exact: true })).toBeVisible();
});

// Mocked network failure is separate from the real Java journeys above.
test("a pending calculation locks its assumptions and a failed calculation can be retried", async ({
  page,
}) => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/api/v1/estimators/capacity-estimation/calculations",
    async (route) => {
      await gate;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        json: { message: "Capacity service unavailable." },
      });
    },
  );
  await page.goto("/topics/capacity-estimation");
  await page.getByRole("button", { name: /Calculate estimate/ }).click();
  await expect(page.getByLabel("Peak factor", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Interview baseline" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Calculating your estimate…" }),
  ).toBeVisible();
  release();
  await expect(page.getByRole("alert")).toContainText(
    "Capacity service unavailable",
  );
  await expect(
    page.getByRole("heading", { name: "Your first capacity envelope" }),
  ).toHaveCount(0);
  await page.unroute("**/api/v1/estimators/capacity-estimation/calculations");
  await page.getByRole("button", { name: /Calculate estimate/ }).click();
  await expect(
    page.getByText("Target peak", { exact: true }).locator(".."),
  ).toContainText("752.3");
});
