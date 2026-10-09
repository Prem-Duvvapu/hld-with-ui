import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  test(`authored walkthroughs preserve reasoning and expose every causal path in ${theme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 900 });
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/api/"))
        posts.push(request.url());
    });
    await page.goto("/case-studies/url-shortener?stage=flows");
    const original = page.getByRole("textbox", {
      name: "Your original answer",
      exact: true,
    });
    await original.fill(
      "Commit precedes 201; expiry equality rejects; uncertain creates use the same key.",
    );
    await expect(page.locator(".workshop-walkthrough:visible")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Reveal reference answer", exact: true })
      .click();
    const viewer = page.locator(".workshop-walkthrough:visible");
    const picker = viewer.getByRole("combobox", {
      name: "Choose a walkthrough",
    });
    const inspector = viewer.getByLabel("Selected decision", { exact: true });
    await expect(viewer).toContainText("Illustrative, no execution");
    await expect(
      viewer.getByRole("button", { name: "Previous decision", exact: true }),
    ).toBeDisabled();
    await viewer.getByRole("button", { name: /04.*COMMIT/ }).focus();
    await page.keyboard.press("Enter");
    await expect(inspector).toContainText(
      "No partial or pending result may commit",
    );
    await expect(
      viewer.getByRole("button", { name: /04.*COMMIT/ }),
    ).toBeFocused();
    await expect
      .poll(() =>
        viewer
          .locator(".walkthrough-diagram-scroll")
          .evaluate((element) => element.scrollLeft),
      )
      .toBeGreaterThan(0);
    for (const [id, last, text] of [
      ["resolve", 5, "link service never fetches"],
      ["lost-response", 5, "Replay never extends expiry"],
      ["expired", 4, "No destination request"],
    ] as const) {
      await picker.selectOption(id);
      await expect(viewer.getByRole("status")).toContainText("Step 1");
      await viewer
        .getByRole("button", { name: new RegExp(`0${last}`) })
        .click();
      await expect(inspector).toContainText(text);
      await expect(
        viewer.getByRole("button", { name: "Next decision", exact: true }),
      ).toBeDisabled();
      const transcript = viewer.locator("details");
      if ((await transcript.getAttribute("open")) === null)
        await transcript.locator("summary").click();
      await expect(transcript).toContainText(text);
      await expect(transcript.locator("ol > li")).toHaveCount(last);
    }
    await picker.selectOption("create");
    await expect(viewer.getByRole("status")).toContainText("Step 4 of 5");
    await expect(original).toHaveAttribute("readonly", "");
    await page
      .getByRole("textbox", { name: "Your revised answer", exact: true })
      .fill(
        "Atomic storage protects retained-key replay; HTTP no-store does not synchronize an internal cache.",
      );
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      if (width !== 768) {
        await page.evaluate(() => document.fonts.ready);
        await viewer.evaluate((element) =>
          element.scrollIntoView({ block: "start" }),
        );
        await page.screenshot({
          path: `test-results/hld-09b2-flows-${width}-${theme}.png`,
        });
      }
    }
    await page.setViewportSize({ width: 320, height: 900 });
    await expect
      .poll(() =>
        viewer
          .locator(".walkthrough-diagram-scroll")
          .evaluate((element) => element.scrollLeft),
      )
      .toBeGreaterThan(0);
    await page
      .getByRole("button", { name: "Previous stage", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Baseline architecture", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Reveal reference answer", exact: true })
      .click();
    const baseline = page.locator(".workshop-walkthrough:visible");
    await expect(baseline.getByRole("combobox")).toHaveCount(0);
    await baseline.getByRole("button", { name: /04.*destination/ }).click();
    await expect(
      baseline.getByLabel("Selected decision", { exact: true }),
    ).toContainText("separate request");
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await baseline.evaluate((element) =>
        element.scrollIntoView({ block: "start" }),
      );
      await page.screenshot({
        path: `test-results/hld-09b2-baseline-${width}-${theme}.png`,
      });
    }
    await page.getByRole("button", { name: "Next stage", exact: true }).click();
    await expect(viewer.getByRole("status")).toContainText("Step 4 of 5");
    await page.reload();
    await expect(original).toHaveValue(
      "Commit precedes 201; expiry equality rejects; uncertain creates use the same key.",
    );
    await expect(
      page.getByRole("textbox", { name: "Your revised answer", exact: true }),
    ).toHaveValue(
      "Atomic storage protects retained-key replay; HTTP no-store does not synchronize an internal cache.",
    );
    await expect(viewer.getByRole("status")).toContainText("Step 1 of 5");
    await expect(
      page.getByRole("button", { name: "Next stage", exact: true }),
    ).toBeEnabled();
    expect(posts).toEqual([]);
  });
}
