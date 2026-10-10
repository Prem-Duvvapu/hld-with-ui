import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const key = "hld-bookmarks-v1";
const answersKey = "hld-practice-v1";
const catalog = JSON.parse(
  readFileSync(new URL("../../content/catalog.json", import.meta.url), "utf8"),
) as {
  id: string;
  kind: "topic" | "case-study";
  title: string;
  contentVersion: string;
}[];
const entry = catalog.find((item) => item.id === "request-flow")!;
const records = (ids: string[]) =>
  ids.map((id) => ({
    moduleId: id,
    kind: catalog.find((item) => item.id === id)?.kind ?? "topic",
    contentVersion:
      catalog.find((item) => item.id === id)?.contentVersion ?? "1.0.0",
    savedAt: "2026-10-10T00:00:00.000Z",
  }));
const envelope = (bookmarks: ReturnType<typeof records>) =>
  JSON.stringify({
    app: "hld-with-ui",
    kind: "bookmarks",
    schemaVersion: 1,
    bookmarks,
  });
async function seed(page: Page, raw: string) {
  await page.addInitScript(
    ({ key, raw }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    },
    { key, raw },
  );
}
const durable = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), key);
const answers = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), answersKey);
async function tools(page: Page) {
  await page.getByText("Back up or manage bookmarks", { exact: true }).click();
}
async function download(page: Page, name = "Download bookmarks") {
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  const file = await downloading;
  return readFileSync((await file.path())!, "utf8");
}

test("bookmarks: visits create no progress; a published module saves, reloads and reopens by keyboard", async ({
  page,
}) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/"))
      posts.push(request.url());
  });
  await page.goto("/bookmarks");
  await expect(
    page.getByRole("heading", { name: "No saved modules yet" }),
  ).toBeVisible();
  expect(await durable(page)).toBeNull();
  expect(await answers(page)).toBeNull();
  await page.goto("/topics/request-flow");
  const button = page.getByRole("button", { name: "Save module", exact: true });
  await button.focus();
  await page.keyboard.press("Enter");
  const savedButton = page.getByRole("button", {
    name: "Module saved",
    exact: true,
  });
  await expect(savedButton).toHaveAttribute("aria-pressed", "true");
  await expect(savedButton).toBeFocused();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Module saved", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Back to all modules" }).click();
  await expect(
    page.getByRole("link", { name: "Saved modules (1)", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Start learning", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Continue learning", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Bookmarks", exact: true }).click();
  const link = page.getByRole("link", { name: entry.title, exact: true });
  await expect(link).toHaveAttribute("href", "/topics/request-flow");
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Module saved", exact: true }),
  ).toBeVisible();
  expect(await answers(page)).toBeNull();
  expect(posts).toEqual([]);
});

test("bookmarks: answer data survives bookmark backup, removal, preview, restore and confirmed reset", async ({
  page,
}) => {
  await page.goto("/topics/request-flow?view=practice");
  await page
    .getByRole("textbox")
    .first()
    .fill("A queue absorbs a burst but cannot create service capacity.");
  const personal = await answers(page);
  await page.getByRole("button", { name: "Save module", exact: true }).click();
  await page.getByRole("link", { name: "Bookmarks", exact: true }).click();
  await expect(
    page.getByRole("link", { name: entry.title, exact: true }),
  ).toBeVisible();
  await tools(page);
  const backup = await download(page);
  expect(JSON.parse(backup)).toEqual(JSON.parse((await durable(page))!));
  await page
    .getByRole("button", {
      name: `Remove bookmark for ${entry.title}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved modules", exact: true }),
  ).toBeFocused();
  const empty = await durable(page);
  await page
    .getByLabel("Import a bookmark backup", { exact: true })
    .setInputFiles({
      name: "hld-bookmarks.json",
      mimeType: "application/json",
      buffer: Buffer.from(backup),
    });
  await expect(page.getByText(/1 new bookmarks will be added/)).toBeVisible();
  expect(await durable(page)).toBe(empty);
  await page
    .getByRole("button", { name: "Apply bookmark import", exact: true })
    .click();
  await expect(
    page.getByLabel("Import a bookmark backup", { exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("link", { name: entry.title, exact: true }),
  ).toBeVisible();
  expect(await answers(page)).toBe(personal);
  const restored = await durable(page);
  await page
    .getByRole("button", { name: "Clear all bookmarks", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Keep bookmarks", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Keep bookmarks", exact: true })
    .click();
  expect(await durable(page)).toBe(restored);
  await page
    .getByRole("button", { name: "Clear all bookmarks", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove all bookmarks", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved modules", exact: true }),
  ).toBeFocused();
  expect(JSON.parse((await durable(page))!).bookmarks).toEqual([]);
  expect(await answers(page)).toBe(personal);
  await page.goto("/case-studies/url-shortener");
  await expect(
    page.getByRole("heading", {
      name: "URL Shortener Design Workshop",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save module", exact: true }),
  ).toHaveCount(0);
});

test("bookmarks: updated and unpublished imported references stay honest; a failed collection does not block other modules", async ({
  page,
}) => {
  const bookmarked = records([
    "request-flow",
    "url-shortener",
    "retired-module",
  ]);
  bookmarked[0]!.contentVersion = "0.1.0";
  const original = envelope(bookmarked);
  await seed(page, original);
  await page.route("**/api/v1/case-studies", (route) => route.abort());
  await page.goto("/bookmarks");
  await expect(
    page.getByRole("link", { name: entry.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Content has changed since you saved/),
  ).toBeVisible();
  await expect(
    page.getByText(/Current availability could not be checked/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "URL Shortener Design Workshop",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.unroute("**/api/v1/case-studies");
  await page
    .getByRole("button", { name: "Check availability again", exact: true })
    .click();
  await expect(
    page.getByText(/not in the current published catalog/),
  ).toHaveCount(2);
  expect(await durable(page)).toBe(original);
  await tools(page);
  await page
    .getByLabel("Import a bookmark backup", { exact: true })
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          app: "hld-with-ui",
          kind: "bookmarks",
          schemaVersion: 2,
          bookmarks: [],
        }),
      ),
    });
  await expect(page.getByRole("alert")).toContainText("unsupported version");
  await expect(
    page.getByRole("button", { name: "Apply bookmark import", exact: true }),
  ).toHaveCount(0);
  expect(await durable(page)).toBe(original);
});

test("bookmarks: denied writes keep a session reading list and backup until explicit retry succeeds", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    const state = window as Window & { bookmarkWritesDenied?: boolean };
    state.bookmarkWritesDenied = true;
    Storage.prototype.setItem = function (key, value) {
      if (key === "hld-bookmarks-v1" && state.bookmarkWritesDenied)
        throw new DOMException("Denied", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.goto("/topics/request-flow");
  await page.getByRole("button", { name: "Save module", exact: true }).click();
  await expect(
    page.getByText(/Bookmarks are kept for this session only/),
  ).toBeVisible();
  expect(await durable(page)).toBeNull();
  await page
    .getByRole("link", { name: "Open bookmark backups", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: entry.title, exact: true }),
  ).toBeVisible();
  await tools(page);
  expect(JSON.parse(await download(page)).bookmarks).toHaveLength(1);
  await page.evaluate(() => {
    (
      window as Window & { bookmarkWritesDenied?: boolean }
    ).bookmarkWritesDenied = false;
  });
  await page
    .getByRole("button", { name: "Try saving bookmarks again", exact: true })
    .click();
  await expect(
    page.getByText("Your session bookmarks are now saved on this browser.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(JSON.parse((await durable(page))!).bookmarks).toHaveLength(1);
  expect(await answers(page)).toBeNull();
});

test("bookmarks: corrupt previous data is downloadable and never replaced by a new save", async ({
  page,
}) => {
  await seed(page, "{broken");
  await page.goto("/topics/request-flow");
  await page.getByRole("button", { name: "Save module", exact: true }).click();
  await page
    .getByRole("link", { name: "Open bookmark backups", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: entry.title, exact: true }),
  ).toBeVisible();
  await tools(page);
  expect(await download(page, "Download previous bookmark data")).toBe(
    "{broken",
  );
  expect(JSON.parse(await download(page)).bookmarks).toHaveLength(1);
  await page
    .getByRole("button", { name: "Try saving bookmarks again", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "cannot be safely replaced",
  );
  expect(await durable(page)).toBe("{broken");
});

for (const theme of ["light", "dark"] as const) {
  test(`bookmarks: list, backup and shared navigation fit all widths in ${theme} with reduced motion`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await seed(
      page,
      envelope(
        records([
          "request-flow",
          "distributed-rate-limiter",
          "retired-" + "module".repeat(8),
        ]),
      ),
    );
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/bookmarks");
      await expect(
        page.getByRole("link", { name: entry.title, exact: true }),
      ).toBeVisible();
      const nav = page.getByRole("navigation", {
        name: "Learning tools",
        exact: true,
      });
      const bookmarked = nav.getByRole("link", {
        name: "Bookmarks",
        exact: true,
      });
      await bookmarked.focus();
      await expect(bookmarked).toBeFocused();
      const fits = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth <= innerWidth,
        links: Array.from(
          document.querySelectorAll(".header-tools a, .bookmark-row a"),
        ).every((element) => {
          const box = element.getBoundingClientRect();
          return box.left >= 0 && box.right <= innerWidth;
        }),
      }));
      expect(fits).toEqual({ page: true, links: true });
      await page.screenshot({
        path: testInfo.outputPath(`bookmarks-${width}-${theme}.png`),
        fullPage: true,
      });
      await tools(page);
      const backup = page.getByRole("button", {
        name: "Download bookmarks",
        exact: true,
      });
      await backup.focus();
      await expect(backup).toBeFocused();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
    }
  });
}
