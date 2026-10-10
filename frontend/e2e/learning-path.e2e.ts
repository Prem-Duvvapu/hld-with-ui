import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const pathUrl = "/learning-paths/first-system-design";
const apiUrl = "/api/v1/learning-paths/first-system-design";
const key = "hld-practice-v1";
const completionKey = "hld-completion-v1";
const contract = JSON.parse(
  readFileSync(
    new URL("../../contracts/openapi.json", import.meta.url),
    "utf8",
  ),
);
const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
ajv.addFormat("int64", true);
const schema = JSON.parse(
  JSON.stringify({
    ...contract.components.schemas.LearningPath,
    $defs: contract.components.schemas,
  })
    .split("#/components/schemas/")
    .join("#/$defs/"),
);
const validate = ajv.compile(schema);
const catalog = JSON.parse(
  readFileSync(new URL("../../content/catalog.json", import.meta.url), "utf8"),
) as { id: string; contentVersion: string }[];
const requestQuestions = JSON.parse(
  readFileSync(
    new URL(
      "../../content/topics/request-flow/questions.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { id: string; options?: { id: string }[] }[];
const cacheQuestions = JSON.parse(
  readFileSync(
    new URL("../../content/topics/cache-aside/questions.json", import.meta.url),
    "utf8",
  ),
) as { id: string }[];
const raw = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), key);
const ready = (page: Page) =>
  expect(page.getByRole("list", { name: "Learning path steps" })).toBeVisible();

test("learning path: Java contract and home lead to real ordered prerequisites without draft links or progress writes", async ({
  page,
  request,
}) => {
  const response = await request.get(apiUrl);
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  expect(body.steps.map((step: { moduleId: string }) => step.moduleId)).toEqual(
    ["request-flow", "capacity-estimation", "cache-aside", "url-shortener"],
  );
  expect(body.steps[3]).toMatchObject({ available: false, activities: [] });
  expect(body.steps[3].entry).toBeUndefined();
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/"))
      posts.push(request.url());
  });
  await page.goto("/");
  const start = page.getByRole("link", { name: "Start learning", exact: true });
  await expect(start).toHaveAttribute("href", pathUrl);
  await start.focus();
  await page.keyboard.press("Enter");
  await ready(page);
  await expect(
    page.getByLabel("Path availability and saved reasoning"),
  ).toContainText("3 / 4 steps available");
  await expect(
    page.getByLabel("Path availability and saved reasoning"),
  ).toContainText("0 steps have saved answers");
  await expect(page.locator(".path-step-unavailable a")).toHaveCount(0);
  const prerequisites = page.getByRole("list", {
    name: "Prerequisites for Cache-Aside",
  });
  await expect(prerequisites.getByRole("link")).toHaveCount(2);
  expect(await raw(page)).toBeNull();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), completionKey),
  ).toBeNull();
  expect(posts).toEqual([]);
  await page.getByRole("link", { name: "Open suggested module" }).click();
  await expect(page).toHaveURL(/topics\/request-flow\?view=study$/);
  await expect(page.getByRole("tab", { name: /Study$/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.goBack();
  await ready(page);
  await page.reload();
  await ready(page);
  expect(await raw(page)).toBeNull();
});

test("learning path: actual saved reasoning changes the suggestion and remains exportable without changing answer bytes", async ({
  page,
}) => {
  await page.goto("/topics/request-flow?view=practice");
  await page
    .getByRole("textbox")
    .first()
    .fill(
      "Waiting grows when demand exceeds service capacity; a balancer cannot add workers.",
    );
  const original = await raw(page);
  expect(original).not.toBeNull();
  await page.goto(pathUrl);
  await ready(page);
  await expect(
    page.getByLabel("Path availability and saved reasoning"),
  ).toContainText("1 step has saved answers");
  await expect(
    page.getByRole("link", { name: "Open suggested module" }),
  ).toHaveAttribute("href", "/topics/capacity-estimation?view=study");
  expect(await raw(page)).toBe(original);
  await page
    .getByRole("link", { name: "Continue saved reasoning on home" })
    .click();
  const resume = page.getByRole("region", {
    name: "Continue learning",
    exact: true,
  });
  await expect(
    resume.getByRole("link", { name: "Continue saved work" }),
  ).toBeVisible();
  await resume
    .getByText("Back up or manage saved answers", { exact: true })
    .click();
  const downloading = page.waitForEvent("download");
  await resume
    .getByRole("button", { name: "Download answers", exact: true })
    .click();
  const file = await downloading;
  expect(JSON.parse(readFileSync((await file.path())!, "utf8"))).toEqual(
    JSON.parse(original!),
  );
  await page
    .getByRole("link", { name: "Explore the first learning path" })
    .click();
  await ready(page);
  expect(await raw(page)).toBe(original);
});

test("learning path: earlier, removed and reference-only work stays separate from current answers", async ({
  page,
}) => {
  const version = catalog.find(
    (entry) => entry.id === "request-flow",
  )!.contentVersion;
  const choice = requestQuestions.find((question) => question.options?.length)!;
  const base = {
    topicId: "request-flow",
    contentVersion: version,
    updatedAt: "2026-10-10T00:00:00.000Z",
    referenceViewed: false,
  };
  const original = JSON.stringify({
    app: "hld-with-ui",
    schemaVersion: 1,
    answers: [
      {
        ...base,
        activityId: "request-flow-interview",
        answer: { kind: "text", text: "" },
        referenceViewed: true,
      },
      {
        ...base,
        activityId: "removed-activity",
        answer: { kind: "text", text: "An earlier note" },
      },
      {
        ...base,
        activityId: choice.id,
        answer: { kind: "choice", optionId: "unknown-option" },
      },
      {
        ...base,
        topicId: "cache-aside",
        activityId: cacheQuestions[0]!.id,
        contentVersion: "0.1.0",
        answer: { kind: "text", text: "Earlier cache reasoning" },
      },
    ],
  });
  await page.addInitScript(
    ({ key, original }) => {
      localStorage.setItem(key, original);
    },
    { key, original },
  );
  await page.goto(pathUrl);
  await ready(page);
  await expect(
    page.getByLabel("Path availability and saved reasoning"),
  ).toContainText("0 steps have saved answers");
  await expect(
    page.getByText("1 reference view recorded", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/2 earlier or unavailable activity records/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open suggested module" }),
  ).toHaveAttribute("href", "/topics/request-flow?view=study");
  expect(await raw(page)).toBe(original);
});

test("learning path: backend failure offers retry and unknown routes do not invent a path", async ({
  page,
}) => {
  await page.route(`**${apiUrl}`, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "request_failed",
        message: "Path unavailable for this check",
        fieldErrors: {},
      }),
    }),
  );
  await page.goto(pathUrl);
  await expect(page.getByRole("alert")).toContainText(
    "Path unavailable for this check",
  );
  await expect(
    page.getByRole("list", { name: "Learning path steps" }),
  ).toHaveCount(0);
  await page.unroute(`**${apiUrl}`);
  const retry = page.getByRole("button", { name: "Try again" });
  await retry.focus();
  await page.keyboard.press("Enter");
  await ready(page);
  await expect(retry).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Your first system design",
      exact: true,
    }),
  ).toBeFocused();
  await page.goto("/learning-paths/unknown");
  await expect(
    page.getByRole("heading", { name: "Learning path not found" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open suggested module" }),
  ).toHaveCount(0);
  expect(await raw(page)).toBeNull();
});

for (const theme of ["light", "dark"] as const)
  test(`learning path: ordered steps and optional links fit mobile and desktop in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(pathUrl);
      await ready(page);
      const card = page.locator(".path-step").first();
      await card.getByText(/Record my progress/).click();
      await page.getByText("Back up or manage completion marks").click();
      const reading = card.getByRole("checkbox", {
        name: "I've read this lesson",
      });
      await reading.focus();
      if (!(await reading.isChecked())) await page.keyboard.press("Space");
      await expect(reading).toBeChecked();
      const link = page.getByRole("link", { name: "Open suggested module" });
      await link.focus();
      await expect(link).toBeFocused();
      expect(
        await page.evaluate(() => ({
          page: document.documentElement.scrollWidth <= innerWidth,
          links: Array.from(
            document.querySelectorAll(".learning-path-page a"),
          ).every((element) => {
            const box = element.getBoundingClientRect();
            return box.left >= 0 && box.right <= innerWidth;
          }),
        })),
      ).toEqual({ page: true, links: true });
      // Capture from the top so offscreen fixed elements do not appear in a full-page image.
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await page.screenshot({
        path: testInfo.outputPath(`learning-path-${width}-${theme}.png`),
        fullPage: true,
      });
      const optional = page.getByRole("link", {
        name: "Distributed Rate Limiter",
        exact: true,
      });
      await optional.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/distributed-rate-limiter\?view=study$/);
      await page.goBack();
      await ready(page);
    }
  });

test("completion: explicit marks survive refresh and backup restore, edits invalidate reviews without altering answers", async ({
  page,
}) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/"))
      posts.push(request.url());
  });
  await page.goto("/topics/request-flow?view=practice");
  await page
    .getByRole("textbox")
    .first()
    .fill(
      "Two workers cause waiting during a burst. Bound the queue and reject overload.",
    );
  const original = await raw(page);
  await page.goto(pathUrl);
  await ready(page);
  const card = page.locator(".path-step").first();
  await card.getByText(/Record my progress/).click();
  const reading = card.getByRole("checkbox", { name: "I've read this lesson" });
  await reading.focus();
  await page.keyboard.press("Space");
  const review = card.getByRole("button", { name: "Mark 1 answer reviewed" });
  await review.focus();
  await page.keyboard.press("Enter");
  const summary = page.getByLabel("Explicit reading and practice progress");
  await expect(summary).toContainText("1 lesson marked read");
  await expect(summary).toContainText("1 answer marked reviewed");
  expect(await raw(page)).toBe(original);
  expect(posts).toEqual([]);
  await page.reload();
  await ready(page);
  await expect(summary).toContainText("1 answer marked reviewed");
  await page.getByText("Back up or manage completion marks").click();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download completion marks", exact: true })
    .click();
  const file = await downloading;
  const backup = readFileSync((await file.path())!, "utf8");
  expect(JSON.parse(backup)).toMatchObject({
    app: "hld-with-ui",
    kind: "completion",
    schemaVersion: 1,
  });
  await card.getByText(/Record my progress/).click();
  await card
    .getByRole("button", { name: "Clear these completion marks" })
    .click();
  await expect(
    card.getByRole("button", { name: "Keep my marks" }),
  ).toBeFocused();
  await card
    .getByRole("button", { name: "Confirm clear completion marks" })
    .click();
  await expect(card.getByText(/Record my progress/)).toBeFocused();
  await expect(summary).toContainText("0 lessons marked read");
  expect(await raw(page)).toBe(original);
  await page.getByLabel("Completion backup file").setInputFiles({
    name: "completion.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await expect(
    page.getByRole("group", { name: "Review completion backup" }),
  ).toContainText("replaces all");
  await page
    .getByRole("button", { name: "Replace with this completion backup" })
    .click();
  await expect(page.getByLabel("Completion backup file")).toBeFocused();
  await expect(summary).toContainText("1 answer marked reviewed");
  expect(await raw(page)).toBe(original);
  await page.goto("/topics/request-flow?view=practice");
  await page
    .getByRole("textbox")
    .first()
    .fill("Edited: a balancer cannot increase worker capacity.");
  await page.goto(pathUrl);
  await ready(page);
  await expect(summary).toContainText("0 answers marked reviewed");
  await expect(summary).toContainText("1 lesson marked read");
  expect(posts).toEqual([]);
});
test("completion: denied writes retain session marks, show recovery and export without overwriting other progress", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException("blocked", "SecurityError");
      return original.call(this, name, value);
    };
  }, completionKey);
  await page.goto(pathUrl);
  await ready(page);
  const card = page.locator(".path-step").first();
  await card.getByText(/Record my progress/).click();
  await card.getByRole("checkbox", { name: "I've read this lesson" }).check();
  await expect(
    page.getByLabel("Explicit reading and practice progress"),
  ).toContainText("1 lesson marked read");
  await expect(
    page.getByText(/Completion storage needs attention/),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), completionKey),
  ).toBeNull();
  expect(await raw(page)).toBeNull();
  await page.getByText("Back up or manage completion marks").click();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download completion marks", exact: true })
    .click();
  expect(
    JSON.parse(readFileSync((await (await downloading).path())!, "utf8"))
      .records,
  ).toHaveLength(1);
  await page
    .getByRole("button", { name: "Try saving completion marks again" })
    .click();
  await expect(card.getByRole("checkbox")).toBeChecked();
});
