import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  test(`cache evolution and failures preserve eligibility decisions in ${theme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 900 });
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/api/"))
        posts.push(request.url());
    });
    await page.goto("/case-studies/url-shortener?stage=evolution");
    await expect(
      page.getByRole("heading", {
        name: "Evolve caching and scale deliberately",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Your original answer", exact: true })
      .fill(
        "A mapping hit does not eliminate current eligibility reads. First measure the actual bottleneck.",
      );
    await page
      .getByRole("button", { name: "Reveal reference answer", exact: true })
      .click();
    const viewer = page.locator(".workshop-walkthrough:visible");
    await viewer.getByRole("button", { name: /03.*SQL/ }).focus();
    await page.keyboard.press("Enter");
    await expect(
      viewer.getByLabel("Selected decision", { exact: true }),
    ).toContainText("only required current existence/expiry/takedown metadata");
    await expect(viewer.getByRole("button", { name: /03.*SQL/ })).toBeFocused();
    await viewer.getByRole("combobox").selectOption("mapping-miss");
    await viewer.getByRole("button", { name: /03.*SQL/ }).click();
    await expect(
      viewer.getByLabel("Selected decision", { exact: true }),
    ).toContainText("one primary lookup");
    await page
      .getByRole("textbox", { name: "Your revised answer", exact: true })
      .fill(
        "95% mapping hits cut full-row transfer, while total primary lookup demand remains unchanged.",
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
        await viewer.evaluate((element) =>
          element.scrollIntoView({ block: "start" }),
        );
        await page.screenshot({
          path: `../frontend/test-results/hld-09b3-evolution-${width}-${theme}.png`,
        });
      }
    }
    await page.getByRole("button", { name: "Next stage", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Diagnose failures without breaking promises",
        exact: true,
      }),
    ).toBeFocused();
    await page
      .getByRole("textbox", { name: "Your original answer", exact: true })
      .fill(
        "A failed eligibility lookup is 503, never permission from an old cache entry.",
      );
    await page
      .getByRole("button", { name: "Reveal reference answer", exact: true })
      .click();
    const failure = page.locator(".workshop-walkthrough:visible");
    const picker = failure.getByRole("combobox");
    for (const [id, result, proof] of [
      ["cache-outage", "302", "primary result succeeds"],
      ["primary-outage", "503", "Do not misreport 404"],
      ["stale-revoked", "404", "does not cancel a response already authorized"],
      ["stale-expired", "404", "Never reassign the expired code"],
    ] as const) {
      await picker.selectOption(id);
      await failure
        .getByRole("button", { name: new RegExp(`0[45].*${result}`) })
        .click();
      await expect(
        failure.getByLabel("Selected decision", { exact: true }),
      ).toContainText(proof);
      await expect(
        failure.getByRole("button", { name: "Next decision", exact: true }),
      ).toBeDisabled();
      const transcript = failure.locator("details");
      if ((await transcript.getAttribute("open")) === null)
        await transcript.locator("summary").click();
      await expect(transcript).toContainText(proof);
    }
    await picker.selectOption("primary-outage");
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
        await failure.evaluate((element) =>
          element.scrollIntoView({ block: "start" }),
        );
        await page.screenshot({
          path: `../frontend/test-results/hld-09b3-failures-${width}-${theme}.png`,
        });
      }
    }
    await expect(
      page.getByRole("button", { name: "Next stage", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Previous stage", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Your revised answer", exact: true }),
    ).toHaveValue(
      "95% mapping hits cut full-row transfer, while total primary lookup demand remains unchanged.",
    );
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "Your revised answer", exact: true }),
    ).toHaveValue(
      "95% mapping hits cut full-row transfer, while total primary lookup demand remains unchanged.",
    );
    expect(posts).toEqual([]);
  });
}
