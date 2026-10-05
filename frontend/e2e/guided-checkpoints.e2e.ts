import { expect, test } from "@playwright/test";

// Guided checkpoints run the real Java presets; see docs/work-items/HLD-06A.md.

const inspector = (page: import("@playwright/test").Page) =>
  page.locator(".guided .cache-inspector");

test.describe("guided cache checkpoints against Java", () => {
  test("predict, reveal the fill at 22 ms, then choose a tradeoff", async ({
    page,
  }) => {
    const runs: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") runs.push(request.url());
    });
    await page.goto("/topics/cache-aside?view=guided");
    await expect(
      page.getByRole("heading", { name: "Cold miss, then fill" }),
    ).toBeVisible();

    await page
      .getByLabel("Your prediction (optional)")
      .fill("At 22 ms, after the origin read; the GET takes 22 ms.");
    await page.getByRole("button", { name: "Run and reveal" }).click();
    await expect(inspector(page)).toContainText("event 3 at 22 ms");
    await expect(inspector(page)).toContainText(
      "Cache holds k = v1 (version 1), filled at 22 ms, fresh until 122 ms.",
    );
    await expect(
      page.getByLabel("Your prediction (revise it after seeing the evidence)"),
    ).toHaveValue("At 22 ms, after the origin read; the GET takes 22 ms.");

    await page.getByLabel("Lower the TTL").check();
    await expect(page.getByRole("status")).toContainText(
      "Recommended: Load (warm) the key into the cache before traffic arrives.",
    );

    // Another baseline checkpoint reuses the same run.
    await page.getByRole("button", { name: /Stale hit/ }).click();
    await page.getByRole("button", { name: "Run and reveal" }).click();
    await expect(inspector(page)).toContainText("event 6 at 72 ms");
    expect(runs).toHaveLength(1);
  });

  test("cold burst and origin failure resolve to their Java events", async ({
    page,
  }) => {
    await page.goto("/topics/cache-aside?view=guided");
    await page
      .getByRole("button", { name: /Five misses, five origin reads/ })
      .click();
    await page.getByRole("button", { name: "Run and reveal" }).click();
    await expect(inspector(page)).toContainText("event 14 at 26 ms");

    await page
      .getByRole("button", { name: /Origin down on a cold cache/ })
      .click();
    await page.getByRole("button", { name: "Run and reveal" }).click();
    await expect(inspector(page)).toContainText("cache.error");
    await expect(inspector(page)).toContainText("Cache has no entry for k.");
  });

  test("guided answers survive a tab round trip", async ({ page }) => {
    await page.goto("/topics/cache-aside?view=guided");
    await page.getByLabel("Your prediction (optional)").fill("A miss.");
    await page.getByRole("tab", { name: /Study/ }).click();
    await page.getByRole("tab", { name: /Guided/ }).click();
    await expect(page.getByLabel("Your prediction (optional)")).toHaveValue(
      "A miss.",
    );
  });
});
