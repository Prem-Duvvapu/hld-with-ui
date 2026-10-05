import { expect, test, type Page } from "@playwright/test";

// Cache playback against the packaged Java backend. Every state below is
// carried by the real trace (decision 0006); see docs/work-items/HLD-05.md.

const inspector = (page: Page) => page.locator(".cache-inspector");
const position = (page: Page) => page.locator(".cache-position");
const stateRow = (page: Page) =>
  page
    .getByRole("table", {
      name: "Cache and origin state at the selected position",
    })
    .getByRole("row")
    .nth(1);
const viewEvent = (page: Page, sequence: number) =>
  page.getByRole("button", { name: `View event ${sequence}` }).click();

test.describe("cache playback against Java", () => {
  test("baseline: initial state, fill, update, stale hit, expiry, refill", async ({
    page,
  }) => {
    await page.goto("/topics/cache-aside");
    await page.getByRole("button", { name: "Run simulation" }).click();

    await expect(position(page)).toHaveText("Initial state · 9 events");
    await expect(stateRow(page)).toContainText("No entry");
    await expect(stateRow(page)).toContainText("v1 (version 1)");
    await expect(
      page.getByRole("heading", { name: "Final run metrics" }),
    ).toBeVisible();

    await viewEvent(page, 2);
    await expect(inspector(page)).toContainText("Cache has no entry for k.");
    await viewEvent(page, 3);
    await expect(inspector(page)).toContainText(
      "Cache holds k = v1 (version 1), filled at 22 ms, fresh until 122 ms.",
    );
    await viewEvent(page, 5);
    await expect(inspector(page)).toContainText("origin.update");
    await expect(stateRow(page)).toContainText("v2 (version 2)");
    await expect(stateRow(page)).toContainText("fresh, behind origin");

    await viewEvent(page, 6);
    await expect(inspector(page)).toContainText("at 72 ms");
    await expect(inspector(page)).toContainText("a hit returns stale data");
    await viewEvent(page, 7);
    await expect(inspector(page)).toContainText(
      "expired at 122 ms; a lookup now misses",
    );
    await viewEvent(page, 9);
    await expect(stateRow(page)).toContainText("v2 (version 2)142242fresh");
    await expect(
      page.getByRole("button", { name: "Next event" }),
    ).toBeDisabled();

    // Backward then forward returns the same rendered state.
    const atEnd = await inspector(page).innerText();
    await page.getByRole("button", { name: "Reset to initial state" }).click();
    await expect(position(page)).toHaveText("Initial state · 9 events");
    await viewEvent(page, 9);
    expect(await inspector(page).innerText()).toBe(atEnd);
  });

  test("cold burst: no entry before the first fill at 22 ms", async ({
    page,
  }) => {
    await page.goto("/topics/cache-aside");
    await page.getByRole("button", { name: /Cold burst/ }).click();
    await page.getByRole("button", { name: "Run simulation" }).click();

    for (const sequence of [5, 6]) {
      await viewEvent(page, sequence);
      await expect(stateRow(page)).toContainText("No entry");
    }
    await expect(inspector(page)).toContainText("origin.read");
    await viewEvent(page, 7);
    await expect(inspector(page)).toContainText("cache.fill");
    await expect(stateRow(page)).toContainText("v1 (version 1)22122fresh");

    const trace = page.getByRole("table", { name: "Simulation event trace" });
    await expect(trace.getByRole("row", { name: /origin\.read/ })).toHaveCount(
      5,
    );
  });

  test("keyboard: the slider and step buttons move the cursor", async ({
    page,
  }) => {
    await page.goto("/topics/cache-aside");
    await page.getByRole("button", { name: "Run simulation" }).click();
    const slider = page.getByLabel("Trace position");
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(position(page)).toContainText("Event 1 of 9 · 2 ms");
    await page.getByRole("button", { name: "Next event" }).focus();
    await page.keyboard.press("Enter");
    await expect(position(page)).toContainText("Event 2 of 9 · 22 ms");
  });

  test("leaving the tab pauses playback and keeps the cursor without rerunning", async ({
    page,
  }) => {
    const runs: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") runs.push(request.url());
    });
    await page.goto("/topics/cache-aside");
    await page.getByRole("button", { name: "Run simulation" }).click();
    await page.getByLabel("Playback speed").selectOption("1200");
    await page.getByRole("button", { name: "Play trace" }).click();
    await expect(position(page)).toContainText("Event 1 of 9");

    await page.getByRole("tab", { name: /Study/ }).click();
    await page.waitForTimeout(2_600);
    await page.getByRole("tab", { name: /Playground/ }).click();
    const paused = await position(page).innerText();
    await expect(
      page.getByRole("button", { name: "Play trace" }),
    ).toBeVisible();
    expect(paused).not.toContain("Event 9 of 9");
    await page.waitForTimeout(1_500);
    await expect(position(page)).toHaveText(paused);
    expect(runs).toHaveLength(1);
  });
});
