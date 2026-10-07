import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Question = { id: string; prompt: string; options?: unknown[] };
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
function written(topicId = "request-flow"): Question {
  const questions: Question[] = JSON.parse(
    readFileSync(
      new URL(
        `../../content/topics/${topicId}/questions.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
  return questions.find((question) => !question.options)!;
}
function record(text: string, topicId = "request-flow"): SavedAnswer {
  return {
    topicId,
    activityId: written(topicId).id,
    contentVersion: catalog.find((entry) => entry.id === topicId)!
      .contentVersion,
    updatedAt: "2026-10-01T00:00:00.000Z",
    answer: { kind: "text", text },
    referenceViewed: false,
  };
}
function backup(answers: SavedAnswer[]) {
  return JSON.stringify({ app: "hld-with-ui", schemaVersion: 1, answers });
}
function field(page: Page, topicId = "request-flow") {
  return page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", {
        name: written(topicId).prompt,
        exact: true,
      }),
    })
    .getByRole("textbox");
}
function path(topicId = "request-flow") {
  return `/topics/${topicId}?view=practice`;
}
async function upload(page: Page, contents: string) {
  await openTools(page);
  await page.getByLabel("Answer backup file", { exact: true }).setInputFiles({
    name: "hld-answers.json",
    mimeType: "application/json",
    buffer: Buffer.from(contents),
  });
}
async function openTools(page: Page) {
  const tools = page.locator(".answer-backup-tools:visible");
  if ((await tools.getAttribute("open")) === null)
    await tools.locator("summary").click();
}
async function download(page: Page): Promise<string> {
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download answers", exact: true })
    .click();
  const result = await pending;
  return readFileSync((await result.path())!, "utf8");
}
async function durable(page: Page) {
  return page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
}

test("answer lifecycle: backup round trip and confirmed reset preserve another module", async ({
  page,
}) => {
  await page.goto(path("cache-aside"));
  await field(page, "cache-aside").fill(
    "Keep this cache explanation independently.",
  );
  await page.goto(path());
  await field(page).fill("Waiting in a bounded queue differs from processing.");
  const raw = await download(page);
  expect(JSON.parse(raw).answers).toHaveLength(2);

  await openTools(page);

  await page
    .getByRole("button", { name: "Reset this module", exact: true })
    .click();
  await expect(
    page.getByText("Delete this module’s saved answers?", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep answers", exact: true }).click();
  await expect(field(page)).toHaveValue(
    "Waiting in a bounded queue differs from processing.",
  );
  await page
    .getByRole("button", { name: "Reset this module", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete module answers", exact: true })
    .click();
  await expect(field(page)).toHaveValue("");
  expect(JSON.parse((await durable(page))!).answers).toHaveLength(1);

  await upload(page, raw);
  await expect(
    page.getByRole("heading", { name: "Review imported answers", exact: true }),
  ).toBeVisible();
  await expect(field(page)).toHaveValue("");
  await page.getByRole("button", { name: "Apply import", exact: true }).click();
  await expect(field(page)).toHaveValue(
    "Waiting in a bounded queue differs from processing.",
  );
  await page.reload();
  await expect(field(page)).toHaveValue(
    "Waiting in a bounded queue differs from processing.",
  );
  await page.goto(path("cache-aside"));
  await expect(field(page, "cache-aside")).toHaveValue(
    "Keep this cache explanation independently.",
  );
});

test("answer lifecycle: conflicts keep local by default and replace only after an explicit choice", async ({
  page,
}) => {
  await page.goto(path());
  await field(page).fill("My local explanation.");
  const incoming = backup([record("Imported alternative explanation.")]);
  await upload(page, incoming);
  await expect(page.getByLabel("Keep local", { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Apply import", exact: true }).click();
  await expect(field(page)).toHaveValue("My local explanation.");
  await upload(page, incoming);
  await page.getByLabel("Use imported", { exact: true }).check();
  await page
    .getByRole("button", { name: "Cancel import", exact: true })
    .click();
  await expect(field(page)).toHaveValue("My local explanation.");
  await upload(page, incoming);
  await page.getByLabel("Use imported", { exact: true }).check();
  await page.getByRole("button", { name: "Apply import", exact: true }).click();
  await page.reload();
  await expect(field(page)).toHaveValue("Imported alternative explanation.");
});

test("answer lifecycle: malformed, future-version, and oversized files leave existing answers untouched", async ({
  page,
}) => {
  await page.goto(path());
  await field(page).fill("Do not replace my saved work with an invalid file.");
  const original = await durable(page);
  for (const contents of [
    "{ broken json",
    JSON.stringify({ app: "hld-with-ui", schemaVersion: 99, answers: [] }),
    " ".repeat(256 * 1024 + 1),
  ]) {
    await upload(page, contents);
    await expect(page.getByRole("alert").last()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Apply import", exact: true }),
    ).toHaveCount(0);
    await expect(field(page)).toHaveValue(
      "Do not replace my saved work with an invalid file.",
    );
    expect(await durable(page)).toBe(original);
  }
});

test("answer lifecycle: edits after preview require a new review and do not overwrite newer work", async ({
  page,
}) => {
  await page.goto(path());
  await field(page).fill("Before preview.");
  await upload(page, backup([record("Imported copy.")]));
  await page.getByLabel("Use imported", { exact: true }).check();
  await field(page).fill("New reasoning typed after reviewing the backup.");
  await page.getByRole("button", { name: "Apply import", exact: true }).click();
  await expect(page.getByRole("alert").last()).toContainText(
    /changed|review|again/i,
  );
  await expect(field(page)).toHaveValue(
    "New reasoning typed after reviewing the backup.",
  );
  await page.reload();
  await expect(field(page)).toHaveValue(
    "New reasoning typed after reviewing the backup.",
  );
});

test("answer lifecycle: a quota failure does not claim an imported answer was saved", async ({
  page,
}) => {
  await page.goto(path());
  await field(page).fill("Durable work before storage fills.");
  const original = await durable(page);
  await upload(
    page,
    backup([record("Imported text that cannot be persisted.")]),
  );
  await page.getByLabel("Use imported", { exact: true }).check();
  await page.evaluate((storageKey) => {
    localStorage.setItem("hld-test-quota", "blocked");
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (item, value) {
      if (item === storageKey && this.getItem("hld-test-quota") === "blocked")
        throw new DOMException("Full", "QuotaExceededError");
      setItem.call(this, item, value);
    };
  }, key);
  await page.getByRole("button", { name: "Apply import", exact: true }).click();
  await expect(page.getByRole("alert").last()).toBeVisible();
  expect(await durable(page)).toBe(original);
  await expect(field(page)).toHaveValue("Durable work before storage fills.");
  await page.setViewportSize({ width: 768, height: 900 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.evaluate(() => localStorage.removeItem("hld-test-quota"));
  await page
    .getByRole("button", { name: "Try saving again", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Practice answer storage" }),
  ).toContainText("Saved on this browser");
  await page.reload();
  await expect(field(page)).toHaveValue("Durable work before storage fills.");
});

test("answer lifecycle: Guided prediction and tradeoff reload without automatically running Java", async ({
  page,
}) => {
  const runs: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/runs"))
      runs.push(request.url());
  });
  await page.goto("/topics/cache-aside?view=guided");
  await page
    .getByRole("textbox", { name: "Your prediction (optional)", exact: true })
    .fill("The first miss fills at 22 ms after the origin read.");
  await page
    .getByRole("button", { name: "Run and reveal", exact: true })
    .click();
  await expect(page.locator(".guided .cache-inspector")).toContainText(
    "event 3 at 22 ms",
  );
  await page.getByLabel("Lower the TTL", { exact: true }).check();
  expect(runs).toHaveLength(1);
  const saved = JSON.parse((await durable(page))!);
  expect(saved.answers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        activityId: "cold-miss-fill-prediction",
        answer: {
          kind: "text",
          text: "The first miss fills at 22 ms after the origin read.",
        },
      }),
      expect.objectContaining({
        activityId: "cold-miss-fill-tradeoff",
        answer: { kind: "choice", optionId: "lower-ttl" },
      }),
    ]),
  );
  await page.reload();
  await expect(
    page.getByRole("textbox", {
      name: "Your prediction (optional)",
      exact: true,
    }),
  ).toHaveValue("The first miss fills at 22 ms after the origin read.");
  await expect(page.locator(".guided .cache-inspector")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Run and reveal", exact: true }),
  ).toBeVisible();
  expect(runs).toHaveLength(1);
  await page
    .getByRole("button", { name: "Run and reveal", exact: true })
    .click();
  await expect(page.getByLabel("Lower the TTL", { exact: true })).toBeChecked();
  await expect(page.locator(".guided .cache-inspector")).toContainText(
    "event 3 at 22 ms",
  );
  expect(runs).toHaveLength(2);
});

test("answer lifecycle: retired-module records can be reset safely when they fill the answer limit", async ({
  page,
}) => {
  await page.goto(path());
  const retired = Array.from({ length: 200 }, (_, index) => ({
    ...record(`Preserved answer ${index + 1} from a retired module.`),
    topicId: "retired-module",
    activityId: `retired-answer-${index + 1}`,
  }));
  await upload(page, backup(retired));
  await expect(
    page.getByRole("heading", { name: "Review imported answers", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Apply import", exact: true }).click();
  expect(JSON.parse((await durable(page))!).answers).toHaveLength(200);
  await expect(field(page)).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Reset this module", exact: true }),
  ).toBeDisabled();

  await page
    .getByRole("combobox", { name: "Saved module to reset", exact: true })
    .selectOption("retired-module");
  await page
    .getByRole("button", { name: "Reset selected saved module", exact: true })
    .click();
  const confirmation = page.getByRole("region", {
    name: "Confirm module reset",
  });
  await expect(confirmation).toContainText("retired-module");
  await expect(confirmation).toContainText("200");
  await confirmation
    .getByRole("button", { name: "Delete module answers", exact: true })
    .click();
  expect(JSON.parse((await durable(page))!).answers).toEqual([]);
  await field(page).fill(
    "The freed answer slot now saves my current reasoning.",
  );
  await page.reload();
  await expect(field(page)).toHaveValue(
    "The freed answer slot now saves my current reasoning.",
  );
  const saved = JSON.parse((await durable(page))!);
  expect(saved.answers).toHaveLength(1);
  expect(saved.answers[0]).toMatchObject({
    topicId: "request-flow",
    activityId: written().id,
  });
});

for (const theme of ["light", "dark"] as const) {
  test(`answer lifecycle: ${theme} mobile and desktop import/reset work with keyboard and reduced motion`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
    await page.goto(path());
    await field(page).fill(
      "My local reasoning stays until I explicitly replace it.",
    );
    await upload(
      page,
      backup([record("Compare this imported alternative before applying.")]),
    );
    const keep = page.getByLabel("Keep local", { exact: true });
    await keep.focus();
    await expect(keep).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(
      page.getByLabel("Use imported", { exact: true }),
    ).toBeChecked();
    await page
      .getByRole("button", { name: "Apply import", exact: true })
      .focus();
    await expect(
      page.getByRole("button", { name: "Apply import", exact: true }),
    ).toBeFocused();
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      await page
        .getByRole("heading", { name: "Review imported answers", exact: true })
        .scrollIntoViewIfNeeded();
      const image = {
        path: `test-results/answer-import-${width}-${theme}.png`,
      };
      if (width === 320)
        await page.locator(".answer-import-preview:visible").screenshot(image);
      else await page.screenshot(image);
    }
    await page.keyboard.press("Enter");
    await expect(field(page)).toHaveValue(
      "Compare this imported alternative before applying.",
    );
    await expect(
      page.locator(".answer-backup-tools:visible summary"),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Reset this module", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: "Keep answers", exact: true }),
    ).toBeFocused();
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      await page
        .getByText("Delete this module’s saved answers?", { exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `test-results/answer-reset-${width}-${theme}.png`,
      });
    }
    await page.keyboard.press("Enter");
    await expect(
      page.getByText("Delete this module’s saved answers?", { exact: true }),
    ).toHaveCount(0);
    await expect(field(page)).toHaveValue(
      "Compare this imported alternative before applying.",
    );
    await expect(
      page.getByRole("button", { name: "Reset this module", exact: true }),
    ).toBeFocused();
  });
}
