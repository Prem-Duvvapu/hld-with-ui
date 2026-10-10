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
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validProblem = ajv.compile(openapi.components.schemas.ApiError);

test("real Java body-limit and validation errors match the closed ApiError contract", async ({
  request,
}) => {
  const path = "/api/v1/simulations/request-flow/runs";
  const descriptor = await (
    await request.get("/api/v1/simulations/request-flow")
  ).json();
  for (const [url, data, status, code] of [
    [path, " ".repeat(262145), 413, "request_too_large"],
    [path, "{", 400, "invalid_input"],
    [
      "/api/v1/simulations/unknown/runs",
      JSON.stringify(descriptor.presets[0].input),
      404,
      "not_found",
    ],
  ] as const) {
    const response = await request.post(url, {
      data,
      headers: { "Content-Type": "application/json" },
    });
    expect(response.status()).toBe(status);
    const body = await response.json();
    expect(validProblem(body), JSON.stringify(validProblem.errors)).toBe(true);
    expect(body.code).toBe(code);
    expect(body.events).toBeUndefined();
  }
  expect(
    (await request.post(path, { data: descriptor.presets[0].input })).status(),
  ).toBe(200);
});

// Java tests exercise actual admission/body/serialization guards. These explicitly mocked
// responses check how React explains each failure and retries the unchanged user input.
const cases = [
  {
    id: "request-flow",
    button: "Run experiment",
    field: "Workers / node",
    value: "2",
    result: "Run metrics",
    retains: true,
  },
  {
    id: "cache-aside",
    button: "Run simulation",
    field: "TTL (ms)",
    value: "200",
    result: "Cache GET outcomes",
    retains: false,
  },
  {
    id: "distributed-rate-limiter",
    button: "Run request burst",
    field: "Limit / capacity",
    value: "6",
    result: "Rate limiter metrics",
    retains: true,
  },
] as const;
const failures = [
  {
    status: 413,
    code: "request_too_large",
    message: "This workload is too large to send. Reduce it and try again.",
  },
  {
    status: 422,
    code: "result_too_large",
    message:
      "This run produced more data than the app can return. Reduce the workload and try again.",
  },
  {
    status: 503,
    code: "simulation_busy",
    message:
      "The simulator is busy. Keep your inputs and try again in a moment.",
  },
] as const;
for (const model of cases)
  for (const failure of failures) {
    test(`mocked HTTP resource error: ${model.id} ${failure.status} keeps inputs and needs an explicit retry`, async ({
      page,
    }) => {
      const path = `/api/v1/simulations/${model.id}/runs`;
      const posts: string[] = [];
      page.on("request", (request) => {
        if (request.method() === "POST" && request.url().endsWith(path))
          posts.push(request.postData()!);
      });
      await page.goto(`/topics/${model.id}`);
      const run = page.getByRole("button", { name: model.button, exact: true });
      await run.click();
      const result = page.getByLabel(model.result, { exact: true });
      await expect(result).toBeVisible();
      const previous = await result.textContent();
      const field = page.getByLabel(model.field, { exact: true });
      await field.fill(model.value);
      const problem = {
        code: failure.code,
        message: failure.message,
        fieldErrors: {},
        timestamp: "2026-10-10T12:00:00.000Z",
      };
      expect(validProblem(problem), JSON.stringify(validProblem.errors)).toBe(
        true,
      );
      await page.route(`**${path}`, (route) =>
        route.fulfill({
          status: failure.status,
          headers: {
            "Content-Type": "application/json",
            ...(failure.status === 503 ? { "Retry-After": "1" } : {}),
          },
          body: JSON.stringify(problem),
        }),
      );
      await run.click();
      await expect(page.getByRole("alert")).toContainText(failure.message);
      await expect(run).toBeEnabled();
      await expect(field).toHaveValue(model.value);
      expect(posts).toHaveLength(2);
      if (model.retains) {
        await expect(result).toHaveText(previous!);
        await expect(
          page.getByRole("status").filter({ hasText: "Inputs changed." }),
        ).toBeVisible();
      } else await expect(result).toHaveCount(0);
      await page.unroute(`**${path}`);
      await run.focus();
      await page.keyboard.press("Enter");
      await expect(result).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(field).toHaveValue(model.value);
      expect(posts).toHaveLength(3);
      expect(posts[2]).toBe(posts[1]);
    });
  }
for (const theme of ["light", "dark"] as const)
  test(`mocked busy error: keyboard recovery fits mobile and desktop in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const path = "/api/v1/simulations/cache-aside/runs";
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.route(`**${path}`, (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          headers: { "Retry-After": "1" },
          body: JSON.stringify({
            code: "simulation_busy",
            message: failures[2].message,
            fieldErrors: {},
            timestamp: "2026-10-10T12:00:00.000Z",
          }),
        }),
      );
      await page.goto("/topics/cache-aside");
      const run = page.getByRole("button", {
        name: "Run simulation",
        exact: true,
      });
      await run.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("alert")).toContainText(failures[2].message);
      await expect(run).toBeEnabled();
      await run.focus();
      await expect(run).toBeFocused();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await page.screenshot({
        path: testInfo.outputPath(`busy-${width}-${theme}.png`),
        fullPage: true,
      });
      await page.unroute(`**${path}`);
      await run.focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("table", { name: "Cache GET outcomes" }),
      ).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
    }
  });
