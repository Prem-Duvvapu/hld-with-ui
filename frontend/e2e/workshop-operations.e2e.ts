import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import workshop from "../../content/case-studies/url-shortener/workshop.json" with { type: "json" };

for (const theme of ["light", "dark"] as const) {
  test(`operations and defense are usable and saved in ${theme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 900 });
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/api/"))
        posts.push(request.url());
    });
    await page.goto("/case-studies/url-shortener?stage=operations");
    const original = page.getByRole("textbox", {
      name: "Your original answer",
      exact: true,
    });
    const revision = page.getByRole("textbox", {
      name: "Your revised answer",
      exact: true,
    });
    await expect(
      page.getByRole("heading", {
        name: "Operate, protect and roll back safely",
        exact: true,
      }),
    ).toBeVisible();
    await original.fill(
      "Compare user outcomes and pool waiting before attributing a cause; bound work during rollback.",
    );
    await page
      .getByRole("button", { name: "Reveal reference answer", exact: true })
      .click();
    const viewer = page.locator(".workshop-walkthrough:visible");
    await viewer.getByRole("button", { name: /04.*Preserve/ }).focus();
    await page.keyboard.press("Enter");
    await expect(
      viewer.getByRole("button", { name: /04.*Preserve/ }),
    ).toBeFocused();
    await expect(
      viewer.getByLabel("Selected decision", { exact: true }),
    ).toContainText("503 with no Location");
    await viewer.getByRole("combobox").selectOption("compatible-rollout");
    await viewer.getByRole("button", { name: /06.*Retire/ }).click();
    await expect(
      viewer.getByLabel("Selected decision", { exact: true }),
    ).toContainText("Never truncate an existing replay promise");
    const transcript = viewer.locator("details");
    await transcript.locator("summary").click();
    await expect(transcript).toContainText(
      "Never truncate an existing replay promise",
    );
    await revision.fill(
      "Rollback must preserve permanent reservations, current eligibility and retained replay windows.",
    );
    const criterion = workshop.stages.find(
      (stage) => stage.id === "operations",
    )!.rubric[0]!;
    await page
      .getByRole("group", { name: criterion.prompt, exact: true })
      .getByRole("radio", { name: "Covered in my answer", exact: true })
      .check();
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
          path: `../docs/work-items/assets/hld-09b4/operations-${width}-${theme}.png`,
        });
      }
    }
    await page.getByRole("button", { name: "Next stage", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Explain and defend your design",
        exact: true,
      }),
    ).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Next stage", exact: true }),
    ).toBeDisabled();
    await original.fill(
      "Start with the promise, quantify assumptions, trace the primary authority and justify one evolution.",
    );
    await page
      .getByRole("button", { name: "Reveal reference answer", exact: true })
      .click();
    await viewer.getByRole("button", { name: /06.*Challenge/ }).click();
    await expect(
      viewer.getByLabel("Selected decision", { exact: true }),
    ).toContainText("explicit new correctness/recovery rules");
    await expect(
      viewer.getByRole("button", { name: "Next decision", exact: true }),
    ).toBeDisabled();
    await revision.fill(
      "A strict mapping hit still reads primary eligibility; cache-only outage service changes the promise.",
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
          path: `../docs/work-items/assets/hld-09b4/defense-${width}-${theme}.png`,
        });
      }
    }
    await page.reload();
    await expect(revision).toHaveValue(
      "A strict mapping hit still reads primary eligibility; cache-only outage service changes the promise.",
    );
    await page
      .getByRole("button", { name: "Previous stage", exact: true })
      .click();
    await expect(revision).toHaveValue(
      "Rollback must preserve permanent reservations, current eligibility and retained replay windows.",
    );
    await expect(
      page
        .getByRole("group", { name: criterion.prompt, exact: true })
        .getByRole("radio", { name: "Covered in my answer", exact: true }),
    ).toBeChecked();
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download answers", exact: true })
      .click();
    const backup = JSON.parse(
      readFileSync((await (await pending).path())!, "utf8"),
    );
    expect(
      backup.answers.map((answer: { activityId: string }) => answer.activityId),
    ).toEqual(
      expect.arrayContaining([
        "operations-attempt",
        "operations-revision",
        "operations-check-boundary",
        "defense-attempt",
        "defense-revision",
      ]),
    );
    expect(posts).toEqual([]);
  });
}
