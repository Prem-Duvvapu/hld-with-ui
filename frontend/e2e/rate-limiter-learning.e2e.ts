import { expect, test } from "@playwright/test";

const path = "/topics/distributed-rate-limiter";

test("rate-limiter window and refill examples distinguish allowance from run totals", async ({
  page,
}) => {
  await page.goto(path);
  await page
    .getByLabel(/^Arrival times/)
    .fill("999, 999, 999, 999, 999, 1000, 1000, 1000, 1000, 1000");
  const run = page.getByRole("button", { name: /Run request burst/ });
  await run.focus();
  await page.keyboard.press("Enter");
  const metrics = page.getByLabel("Rate limiter metrics");
  await expect(metrics).toContainText("ALLOWED10");
  await expect(metrics).toContainText("WINDOW ALLOWANCE5");
  await expect(page.getByText(/Later windows reset allowance/)).toBeVisible();
  await page.getByLabel(/^Algorithm/).selectOption("TOKEN_BUCKET");
  await page.getByLabel("Limit / capacity", { exact: true }).fill("2");
  await page.getByLabel(/^Refill/).fill("2");
  await page.getByLabel(/^Arrival times/).fill("0, 0, 0, 250, 500");
  await run.click();
  await expect(metrics).toContainText("ALLOWED3");
  await expect(metrics).toContainText("REJECTED2");
  await expect(metrics).toContainText("BURST CAPACITY2");
  const fourth = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: "Request 4", exact: true }),
  });
  await expect(fourth).toContainText("REJECTED");
  await expect(
    fourth.getByRole("cell", { name: "250 ms", exact: true }),
  ).toHaveCount(2);
  await page.getByRole("tab", { name: /Decision flow/ }).click();
  await expect(page.getByText(/optional Retry-After uses/)).toBeVisible();
  await page.goBack();
  await expect(metrics).toContainText("ALLOWED3");
  await expect(page.getByLabel(/^Arrival times/)).toHaveValue(
    "0, 0, 0, 250, 500",
  );
});

test("rate-limiter outage explains unknown quota and preserves local enforcement", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path);
  await page.getByRole("button", { name: "Counter backend outage" }).click();
  const run = page.getByRole("button", { name: /Run request burst/ });
  const metrics = page.getByLabel("Rate limiter metrics");
  await run.click();
  await expect(metrics).toContainText("ALLOWED0");
  await expect(metrics).toContainText("BYPASSED6");
  await expect(
    page.getByRole("cell", { name: "Unknown", exact: true }),
  ).toHaveCount(6);
  await expect(page.getByText(/do not prove quota exhaustion/)).toBeVisible();
  await page
    .getByRole("combobox", { name: "When unavailable", exact: true })
    .selectOption("FAIL_CLOSED");
  await run.click();
  await expect(metrics).toContainText("REJECTED6");
  await expect(metrics).toContainText("BYPASSED0");
  await page.setViewportSize({ width: 320, height: 800 });
  if ((await page.locator("html").getAttribute("data-theme")) !== "dark") {
    await page.getByRole("button", { name: "Use dark theme" }).click();
  }
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "test-results/rate-outage-mobile-dark.png",
    fullPage: true,
  });
  await page
    .getByRole("combobox", { name: "Counter placement", exact: true })
    .selectOption("LOCAL_PER_NODE");
  await run.click();
  await expect(metrics).toContainText("ALLOWED6");
  await expect(metrics).toContainText("REJECTED0");
  await expect(page.getByText("Counter unavailable for this run")).toHaveCount(
    0,
  );
});
