import { expect, test, type Page } from "@playwright/test";

// Real integration: every value below comes from the packaged Java backend.
// Expected numbers are hand-checkable fixtures from docs/IMPLEMENTATION_PLAN.md
// section 8 or were computed from the module's first preset.

function metricCard(page: Page, label: string) {
  return page.locator("article", {
    has: page.getByText(label, { exact: true }),
  });
}

test.describe("published modules run their Java model", () => {
  test("request flow: six-request baseline, then fewer arrivals", async ({
    page,
  }) => {
    await page.goto("/topics/request-flow");
    await page.getByRole("button", { name: /Run experiment/ }).click();
    const metrics = page.getByLabel("Run metrics");
    await expect(metrics).toContainText("MEAN LATENCY200.0ms");
    await expect(metrics).toContainText("P95 LATENCY300ms");
    await expect(metrics).toContainText("THROUGHPUT20.0req / sec");

    await page.getByLabel("Arrival times (ms)").fill("0, 0");
    await page.getByRole("button", { name: /Run experiment/ }).click();
    await expect(metrics).toContainText("COMPLETED2requests");
    await expect(metrics).toContainText("MEAN LATENCY100.0ms");
  });

  test("rate limiter: shared window rejects the overflow, a higher limit admits more", async ({
    page,
  }) => {
    await page.goto("/topics/distributed-rate-limiter");
    await page.getByRole("button", { name: "Run request burst" }).click();
    const metrics = page.getByLabel("Rate limiter metrics");
    await expect(metrics).toContainText("REJECTED3");

    await page.getByLabel("Limit / capacity").fill("6");
    await page.getByRole("button", { name: "Run request burst" }).click();
    await expect(metrics).toContainText("REJECTED2");
  });

  test("cache-aside: baseline stale hit, then TTL 0 sends every read to origin", async ({
    page,
  }) => {
    await page.goto("/topics/cache-aside");
    await page.getByRole("button", { name: "Run simulation" }).click();
    const outcomes = page.getByRole("table", { name: "Cache GET outcomes" });
    await expect(outcomes.getByRole("row").nth(3)).toContainText("HIT");
    await expect(outcomes.getByRole("row").nth(3)).toContainText("Yes");
    await expect(
      page.getByText("Origin Reads", { exact: true }).locator(".."),
    ).toContainText("2");

    await page.getByLabel("TTL (ms)").fill("0");
    await page.getByRole("button", { name: "Run simulation" }).click();
    await expect(
      page.getByText("Origin Reads", { exact: true }).locator(".."),
    ).toContainText("4");
    await expect(
      page.getByText("Cache Hits", { exact: true }).locator(".."),
    ).toContainText("0");
  });

  test("capacity: interview baseline, then a higher peak factor", async ({
    page,
  }) => {
    await page.goto("/topics/capacity-estimation");
    await page.getByRole("button", { name: /Calculate estimate/ }).click();
    const targetPeak = metricCard(page, "Target peak");
    await expect(targetPeak).toContainText("752.3");

    await page.getByLabel(/Peak factor/).fill("8");
    await page.getByRole("button", { name: /Calculate estimate/ }).click();
    await expect(targetPeak).toContainText("1,203.7");
  });
});

test.describe("module navigation", () => {
  test("keeps inputs, results, and history across tabs without rerunning", async ({
    page,
  }) => {
    const runs: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") runs.push(request.url());
    });
    await page.goto("/topics/cache-aside");
    await page.getByLabel("TTL (ms)").fill("250");
    await page.getByRole("button", { name: "Run simulation" }).click();
    const outcomes = page.getByRole("table", { name: "Cache GET outcomes" });
    await expect(outcomes).toBeVisible();

    await page.getByRole("tab", { name: /Study/ }).click();
    await expect(page).toHaveURL(/view=study/);
    await page.goBack();
    await expect(page.getByRole("tab", { name: /Playground/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByLabel("TTL (ms)")).toHaveValue("250");
    await expect(outcomes).toBeVisible();
    await page.goForward();
    await expect(page).toHaveTitle("Study · Cache-Aside | HLD with UI");
    expect(runs).toHaveLength(1);
  });

  test("normalizes an unsupported view and shows a not-found page for unknown routes", async ({
    page,
  }) => {
    await page.goto("/topics/cache-aside?view=bogus");
    await expect(page.getByRole("tab", { name: /Playground/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page).not.toHaveURL(/view=/);

    await page.goto("/topics/does-not-exist");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "That route is outside the system.",
    );
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`320px ${colorScheme} layout`, () => {
    test.use({
      viewport: { width: 320, height: 800 },
      colorScheme,
      reducedMotion: "reduce",
    });

    for (const [path, run, resultLabel] of [
      ["/topics/request-flow", /Run experiment/, "Run metrics"],
      [
        "/topics/distributed-rate-limiter",
        /Run request burst/,
        "Rate limiter metrics",
      ],
      ["/topics/cache-aside", /Run simulation/, "Cache GET outcomes"],
      ["/topics/capacity-estimation", /Calculate estimate/, "Target peak"],
    ] as const) {
      test(`${path} has no page overflow after a run`, async ({ page }) => {
        await page.goto(path);
        await page.getByRole("button", { name: run }).click();
        // Measure only once the Java result is on screen.
        await expect(
          page
            .getByLabel(resultLabel)
            .or(page.getByText(resultLabel, { exact: true }))
            .first(),
        ).toBeVisible();
        await expect(page.locator("[role=alert]")).toHaveCount(0);
        await expect
          .poll(() =>
            page.evaluate(() => {
              const root = document.documentElement;
              return root.scrollWidth - root.clientWidth;
            }),
          )
          .toBeLessThanOrEqual(0);
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          colorScheme,
        );
      });
    }
  });
}
