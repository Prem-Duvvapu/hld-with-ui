import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type SavedAnswer = {
  topicId: string;
  activityId: string;
  contentVersion: string;
  updatedAt: string;
  answer: { kind: "text"; text: string };
  referenceViewed: boolean;
};
const key = "hld-practice-v1";
const catalog: { id: string; contentVersion: string }[] = JSON.parse(
  readFileSync(new URL("../../content/catalog.json", import.meta.url), "utf8"),
);
const questions: { id: string; prompt: string; options?: unknown[] }[] =
  JSON.parse(
    readFileSync(
      new URL(
        "../../content/topics/request-flow/questions.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
const interview = questions.find((item) => !item.options)!;
function saved(
  topicId = "request-flow",
  activityId = interview.id,
  contentVersion = catalog.find((entry) => entry.id === topicId)!
    .contentVersion,
): SavedAnswer {
  return {
    topicId,
    activityId,
    contentVersion,
    updatedAt: "2026-10-10T00:00:00.000Z",
    answer: { kind: "text", text: "Personal reasoning stays on this browser." },
    referenceViewed: false,
  };
}
async function seed(page: Page, answers: SavedAnswer[]) {
  await page.addInitScript(
    ({ key, answers }) => {
      if (localStorage.getItem(key) === null)
        localStorage.setItem(
          key,
          JSON.stringify({ app: "hld-with-ui", schemaVersion: 1, answers }),
        );
    },
    { key, answers },
  );
}
const resume = (page: Page) =>
  page.getByRole("region", { name: "Continue learning", exact: true });
const durable = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), key);
async function home(page: Page) {
  await page.getByRole("link", { name: "Back to all modules" }).click();
  await expect(
    resume(page).getByRole("link", { name: "Continue saved work" }),
  ).toBeVisible();
}

test("resume: visits create no progress; saved reasoning resumes its exact question and keyboard focus", async ({
  page,
}) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Foundation modules" }),
  ).toBeVisible();
  await expect(resume(page)).toHaveCount(0);
  expect(await durable(page)).toBeNull();
  await page.goto("/topics/request-flow?view=practice");
  const article = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: interview.prompt, exact: true }),
  });
  await expect(article).toBeVisible();
  expect(await durable(page)).toBeNull();
  await article
    .getByRole("textbox")
    .fill("A finite queue absorbs a burst but cannot create capacity.");
  await home(page);
  const raw = await durable(page);
  await expect(
    page.getByRole("link", { name: "Continue learning", exact: true }),
  ).toHaveAttribute("href", "#continue-learning");
  const link = resume(page).getByRole("link", { name: "Continue saved work" });
  await expect(link).toHaveAttribute(
    "href",
    `/topics/request-flow?view=practice&question=${interview.id}`,
  );
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.locator(`[data-question-id="${interview.id}"]`),
  ).toBeFocused();
  await expect(article.getByRole("textbox")).toHaveValue(
    "A finite queue absorbs a burst but cannot create capacity.",
  );
  expect(await durable(page)).toBe(raw);
  await page.reload();
  await expect(
    page.locator(`[data-question-id="${interview.id}"]`),
  ).toBeFocused();
  expect(await durable(page)).toBe(raw);
  expect(posts).toEqual([]);
});

test("resume: saved draft stage stays out of discovery; backup/reset preserves data and restores focus", async ({
  page,
  request,
}) => {
  await page.goto("/case-studies/url-shortener?stage=operations");
  await page
    .getByRole("textbox", { name: "Your original answer", exact: true })
    .fill("Count included correct redirects within the latency boundary.");
  await home(page);
  await expect(
    resume(page).getByText("Draft workshop · Saved work"),
  ).toBeVisible();
  const raw = await durable(page);
  expect(await (await request.get("/api/v1/case-studies")).json()).toEqual([]);
  const results = (
    await (await request.get("/api/v1/search?q=shortener")).json()
  ).results;
  expect(
    results.every(
      (hit: { entry: { id: string } }) => hit.entry.id !== "url-shortener",
    ),
  ).toBe(true);
  const link = resume(page).getByRole("link", { name: "Continue saved work" });
  await expect(link).toHaveAttribute(
    "href",
    "/case-studies/url-shortener?stage=operations",
  );
  await link.click();
  await expect(
    page.getByRole("textbox", { name: "Your original answer", exact: true }),
  ).toHaveValue(
    "Count included correct redirects within the latency boundary.",
  );
  await home(page);
  await resume(page).locator(".continue-backups > summary").click();
  const downloading = page.waitForEvent("download");
  await resume(page)
    .getByRole("button", { name: "Download answers", exact: true })
    .click();
  const download = await downloading;
  expect(JSON.parse(readFileSync((await download.path())!, "utf8"))).toEqual(
    JSON.parse(raw!),
  );
  await resume(page).locator(".answer-backup-tools > summary").click();
  await resume(page)
    .getByRole("button", { name: "Reset this module", exact: true })
    .click();
  await expect(
    resume(page).getByRole("button", { name: "Keep answers", exact: true }),
  ).toBeFocused();
  await resume(page)
    .getByRole("button", { name: "Delete module answers", exact: true })
    .click();
  await expect(resume(page)).toHaveCount(0);
  await expect(page.locator("#modules")).toBeFocused();
  expect(JSON.parse((await durable(page))!).answers).toEqual([]);
});

test("resume: guided checkpoint survives reload/history without starting a simulation", async ({
  page,
}) => {
  const runs: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") runs.push(request.url());
  });
  await page.goto("/topics/cache-aside?view=guided");
  await page
    .getByRole("navigation", { name: "Checkpoints" })
    .getByRole("button", { name: "Stale hit", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your prediction (optional)", exact: true })
    .fill("The cache may return v1 while origin is at v2.");
  await home(page);
  await expect(
    resume(page).getByRole("link", { name: "Continue saved work" }),
  ).toHaveAttribute(
    "href",
    "/topics/cache-aside?view=guided&checkpoint=stale-hit",
  );
  await resume(page).getByRole("link", { name: "Continue saved work" }).click();
  await expect(
    page.getByRole("heading", { name: "Stale hit", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("textbox", {
      name: "Your prediction (optional)",
      exact: true,
    }),
  ).toHaveValue("The cache may return v1 while origin is at v2.");
  const raw = await durable(page);
  await page
    .getByRole("navigation", { name: "Checkpoints" })
    .getByRole("button", { name: "Warm hit", exact: true })
    .click();
  await expect(page).toHaveURL(/checkpoint=warm-hit/);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Stale hit", exact: true }),
  ).toBeFocused();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Stale hit", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Run and reveal", exact: true }),
  ).toBeEnabled();
  expect(await durable(page)).toBe(raw);
  expect(runs).toEqual([]);
});

test("resume: changed content and removed activities/modules keep their backups without inventing links", async ({
  page,
}) => {
  await seed(page, [
    saved("request-flow", interview.id, "0.9.0"),
    {
      ...saved("url-shortener", "retired-stage-attempt"),
      updatedAt: "2026-10-09T00:00:00.000Z",
    },
    {
      ...saved(),
      topicId: "retired-module",
      updatedAt: "2026-10-08T00:00:00.000Z",
    },
  ]);
  await page.goto("/");
  await expect(resume(page).getByRole("note")).toContainText(
    "Content has changed",
  );
  const raw = await durable(page);
  await resume(page)
    .getByRole("combobox", { name: "Saved module" })
    .selectOption("url-shortener");
  await expect(
    resume(page).getByRole("link", { name: "Open current module" }),
  ).toHaveAttribute("href", "/case-studies/url-shortener");
  await expect(resume(page).getByRole("note")).toContainText(
    "no longer in the module",
  );
  await resume(page)
    .getByRole("combobox", { name: "Saved module" })
    .selectOption("retired-module");
  await expect(resume(page).getByRole("note")).toContainText(
    "no longer available",
  );
  await expect(resume(page).getByRole("link")).toHaveCount(0);
  expect(await durable(page)).toBe(raw);
});

test("resume: failed content check can be retried while browsing and saved answers remain usable", async ({
  page,
}) => {
  await seed(page, [saved()]);
  let fail = true;
  await page.route("**/api/v1/topics/request-flow", (route) =>
    fail ? route.abort() : route.continue(),
  );
  await page.goto("/");
  await expect(resume(page).getByRole("alert")).toContainText("Cannot reach");
  await expect(
    page.getByRole("link", { name: /Request Flow & Load Balancing/ }),
  ).toBeVisible();
  const raw = await durable(page);
  fail = false;
  await resume(page).getByRole("button", { name: "Try again" }).click();
  await expect(
    resume(page).getByRole("link", { name: "Continue saved work" }),
  ).toBeVisible();
  expect(await durable(page)).toBe(raw);
});

for (const theme of ["light", "dark"] as const) {
  test(`resume: controls stay usable at all widths in ${theme} with reduced motion`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await seed(page, [
      saved("url-shortener", "defense-attempt"),
      { ...saved(), updatedAt: "2026-10-09T00:00:00.000Z" },
    ]);
    await page.goto("/");
    await expect(
      resume(page).getByRole("link", { name: "Continue saved work" }),
    ).toBeVisible();
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await resume(page)
        .getByRole("combobox", { name: "Saved module" })
        .focus();
      await expect(
        resume(page).getByRole("combobox", { name: "Saved module" }),
      ).toBeFocused();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await resume(page)
          .locator(".continue-card")
          .evaluate((card) => {
            const outer = card.getBoundingClientRect();
            const link = card.querySelector("a")!.getBoundingClientRect();
            return (
              link.left >= outer.left &&
              link.right <= outer.right &&
              link.top >= outer.top &&
              link.bottom <= outer.bottom
            );
          }),
      ).toBe(true);
      await resume(page).screenshot({
        path: testInfo.outputPath(`continue-${width}-${theme}.png`),
      });
    }
    await resume(page).locator(".continue-backups > summary").click();
    await resume(page)
      .getByRole("button", { name: "Download answers", exact: true })
      .focus();
    await expect(
      resume(page).getByRole("button", {
        name: "Download answers",
        exact: true,
      }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
