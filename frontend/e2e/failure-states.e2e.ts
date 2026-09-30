import { expect, test } from "@playwright/test";

// Real integration: values come from the packaged Java backend and match the
// fixtures in docs/IMPLEMENTATION_PLAN.md section 8.
test.describe("cache-aside edge cases against Java", () => {
  test("cold burst: five concurrent misses all reach origin and none hit early", async ({
    page,
  }) => {
    await page.goto("/topics/cache-aside");
    await page
      .getByRole("button", { name: "Cold burst: concurrent misses" })
      .click();
    await page.getByRole("button", { name: "Run simulation" }).click();

    await expect(
      page.getByText("Cache Misses", { exact: true }).locator(".."),
    ).toContainText("5");
    await expect(
      page.getByText("Origin Reads", { exact: true }).locator(".."),
    ).toContainText("5");
    await expect(
      page.getByText("Cache Hits", { exact: true }).locator(".."),
    ).toContainText("0");
    const trace = page.getByRole("table", { name: "Simulation event trace" });
    const originReads = trace
      .getByRole("row")
      .filter({ hasText: "origin.read" });
    await expect(originReads).toHaveCount(5);
    const originReadTimes = [22, 23, 24, 25, 26];
    for (let index = 0; index < originReadTimes.length; index++) {
      await expect(originReads.nth(index).getByRole("cell").nth(1)).toHaveText(
        String(originReadTimes[index]),
      );
    }
  });

  test("a run stopped by the virtual-time budget is labelled partial", async ({
    page,
  }) => {
    await page.goto("/topics/cache-aside");
    await page.getByLabel(/^Operations/).fill("GET k @0\nGET k @59990");
    await page.getByRole("button", { name: "Run simulation" }).click();

    const notice = page
      .getByRole("status")
      .filter({ hasText: "Partial result" });
    await expect(notice).toContainText("virtual_time_limit");
    await expect(notice).toContainText("1 GET(s) incomplete");
    await expect(notice).toContainText("59992 ms");
  });
});

// Mocked network: these cases replace API responses to produce states the
// real backend does not return on demand. They do not replace the real
// integration journeys.
test.describe("mocked network states", () => {
  test("a failed module load shows an error with a working retry", async ({
    page,
  }) => {
    await page.route("**/api/v1/topics/cache-aside", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "unavailable",
          message: "Backend is starting.",
        }),
      }),
    );
    await page.goto("/topics/cache-aside");
    const error = page.getByRole("alert");
    await expect(error).toContainText("We could not load this experience.");
    await expect(error).toContainText("Backend is starting.");

    await page.unroute("**/api/v1/topics/cache-aside");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByLabel("TTL (ms)")).toBeVisible();
  });

  test("a pending run shows progress and locks inputs, then a failed run shows the error without a result", async ({
    page,
  }) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      "**/api/v1/simulations/cache-aside/runs",
      async (route) => {
        await gate;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            code: "internal_error",
            message: "The server could not complete the request.",
          }),
        });
      },
    );
    await page.goto("/topics/cache-aside");
    await page.getByRole("button", { name: "Run simulation" }).click();

    await expect(page.getByRole("button", { name: "Running…" })).toBeDisabled();
    await expect(
      page.getByRole("heading", { name: "Running your workload…" }),
    ).toBeVisible();
    await expect(page.getByLabel("TTL (ms)")).toBeDisabled();

    release();
    await expect(page.getByRole("alert")).toContainText(
      "The server could not complete the request.",
    );
    await expect(
      page.getByRole("table", { name: "Cache GET outcomes" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Run simulation" }),
    ).toBeEnabled();
  });
});
