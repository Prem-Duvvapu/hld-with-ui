import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type QuestionFixture = {
  id: string;
  prompt: string;
  options?: { id: string; label: string }[];
  correctOptionId?: string;
};
const storageKey = "hld-practice-v1";
const topics = [
  "request-flow",
  "capacity-estimation",
  "distributed-rate-limiter",
  "cache-aside",
];
const catalog: { id: string; contentVersion: string }[] = JSON.parse(
  readFileSync(new URL("../../content/catalog.json", import.meta.url), "utf8"),
);
function questions(topicId: string): QuestionFixture[] {
  return JSON.parse(
    readFileSync(
      new URL(
        `../../content/topics/${topicId}/questions.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
}
function card(page: Page, question: QuestionFixture) {
  return page.getByRole("article").filter({
    has: page.getByRole("heading", { name: question.prompt, exact: true }),
  });
}
function practicePath(topicId = "request-flow") {
  return `/topics/${topicId}?view=practice`;
}
async function downloadedText(page: Page, buttonName: string) {
  const result = page.waitForEvent("download");
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const download = await result;
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFileSync(path!, "utf8");
}
async function seed(page: Page, raw: string) {
  await page.addInitScript(
    ({ storageKey, raw }) => {
      if (sessionStorage.getItem("hld-practice-test-seeded") !== "yes") {
        localStorage.setItem(storageKey, raw);
        sessionStorage.setItem("hld-practice-test-seeded", "yes");
      }
    },
    { storageKey, raw },
  );
}

for (const topicId of topics) {
  test(`saved practice: ${topicId} preserves choices, explanations, and revealed references across reload`, async ({
    page,
  }) => {
    const items = questions(topicId);
    const choice = items.find((question) => question.options)!;
    const written = items.find((question) => !question.options)!;
    const note = `My ${topicId} explanation: state assumptions, trace one request, and defend the failure tradeoff.`;
    await page.goto(practicePath(topicId));
    const storage = page.getByRole("region", {
      name: "Practice answer storage",
    });
    await expect(storage).toContainText("Saved on this browser");
    await expect(
      page.getByRole("button", { name: "Download answers", exact: true }),
    ).toBeDisabled();
    // Opening a page is not an attempt and must not create a saved record.
    expect(
      await page.evaluate((key) => localStorage.getItem(key), storageKey),
    ).toBeNull();
    await card(page, choice)
      .locator(`input[value="${choice.correctOptionId}"]`)
      .check();
    await card(page, written).getByRole("textbox").fill(note);
    const compare = card(page, written).getByRole("button", {
      name: "Compare with a model answer",
    });
    await compare.focus();
    await page.keyboard.press("Enter");
    await expect(
      card(page, written).getByText("Example answer", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(card(page, written).getByRole("textbox")).toHaveValue(note);
    await expect(
      card(page, choice).locator(`input[value="${choice.correctOptionId}"]`),
    ).toBeChecked();
    await expect(card(page, choice).getByRole("status")).toContainText(
      "That reasoning holds",
    );
    await expect(
      card(page, written).getByText("Example answer", { exact: true }),
    ).toBeVisible();
    const exported = JSON.parse(await downloadedText(page, "Download answers"));
    expect(exported).toMatchObject({ app: "hld-with-ui", schemaVersion: 1 });
    expect(exported.answers).toContainEqual(
      expect.objectContaining({
        topicId,
        activityId: written.id,
        contentVersion: catalog.find((entry) => entry.id === topicId)!
          .contentVersion,
        answer: { kind: "text", text: note },
        referenceViewed: true,
      }),
    );
    expect(exported.answers).toHaveLength(2);
  });
}

test("saved practice: navigation keeps separate module answers", async ({
  page,
}) => {
  const first = questions("request-flow").find(
    (question) => !question.options,
  )!;
  const second = questions("cache-aside").find(
    (question) => !question.options,
  )!;
  await page.goto(practicePath());
  await card(page, first)
    .getByRole("textbox")
    .fill("Queue waiting time differs from service time.");
  await page.getByRole("link", { name: "HLD with UI home" }).click();
  await page.locator('a[href="/topics/cache-aside"]').click();
  await page.getByRole("tab", { name: /Practice/ }).click();
  await card(page, second)
    .getByRole("textbox")
    .fill("A warm hit and a cold miss have different failure paths.");
  await page.getByRole("link", { name: "HLD with UI home" }).click();
  await page.locator('a[href="/topics/request-flow"]').click();
  await page.getByRole("tab", { name: /Practice/ }).click();
  await expect(card(page, first).getByRole("textbox")).toHaveValue(
    "Queue waiting time differs from service time.",
  );
  const exported = JSON.parse(await downloadedText(page, "Download answers"));
  expect(exported.answers).toHaveLength(2);
  expect(
    exported.answers.map((answer: { topicId: string }) => answer.topicId),
  ).toEqual(expect.arrayContaining(["request-flow", "cache-aside"]));
});

for (const failure of ["denied", "quota"] as const) {
  test(`saved practice: ${failure} storage preserves session answers and provides a download`, async ({
    page,
  }) => {
    await page.addInitScript(
      ({ storageKey, failure }) => {
        if (failure === "denied") {
          Object.defineProperty(window, "localStorage", {
            configurable: true,
            get() {
              throw new DOMException("Storage denied", "SecurityError");
            },
          });
        } else {
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function (key, value) {
            if (key === storageKey)
              throw new DOMException("Quota exceeded", "QuotaExceededError");
            original.call(this, key, value);
          };
        }
      },
      { storageKey, failure },
    );
    const question = questions("request-flow").find((item) => !item.options)!;
    await page.goto(practicePath());
    await card(page, question)
      .getByRole("textbox")
      .fill("Preserve this explanation when browser storage cannot save.");
    await expect(
      page.getByRole("region", { name: "Practice answer storage" }),
    ).toContainText("Answers are kept for this session only");
    await page.getByRole("link", { name: "HLD with UI home" }).click();
    await page.locator('a[href="/topics/request-flow"]').click();
    await page.getByRole("tab", { name: /Practice/ }).click();
    await expect(card(page, question).getByRole("textbox")).toHaveValue(
      "Preserve this explanation when browser storage cannot save.",
    );
    const exported = JSON.parse(await downloadedText(page, "Download answers"));
    expect(exported.answers[0].answer.text).toBe(
      "Preserve this explanation when browser storage cannot save.",
    );
  });
}

for (const [name, raw] of [
  ["corrupt", "{preserve my unreadable previous data"],
  [
    "future",
    JSON.stringify({
      app: "hld-with-ui",
      schemaVersion: 2,
      answers: [],
      futureField: "Keep this untouched",
    }),
  ],
]) {
  test(`saved practice: ${name} data is not overwritten and the original can be downloaded`, async ({
    page,
  }) => {
    await seed(page, raw!);
    const question = questions("request-flow").find((item) => !item.options)!;
    await page.goto(practicePath());
    await expect(
      page.getByRole("region", { name: "Practice answer storage" }),
    ).toContainText("Answers are kept for this session only");
    await card(page, question)
      .getByRole("textbox")
      .fill("New work must not replace previous unreadable data.");
    expect(
      await page.evaluate((key) => localStorage.getItem(key), storageKey),
    ).toBe(raw);
    expect(await downloadedText(page, "Download previous data")).toBe(raw);
    const current = JSON.parse(await downloadedText(page, "Download answers"));
    expect(current.answers[0].answer.text).toBe(
      "New work must not replace previous unreadable data.",
    );
    await page.reload();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), storageKey),
    ).toBe(raw);
    await expect(card(page, question).getByRole("textbox")).toHaveValue("");
  });
}

test("saved practice: older content keeps answers but requires a new review before showing references", async ({
  page,
}) => {
  const topicId = "request-flow";
  const choice = questions(topicId).find((question) => question.options)!;
  const written = questions(topicId).find((question) => !question.options)!;
  const raw = JSON.stringify({
    app: "hld-with-ui",
    schemaVersion: 1,
    answers: [
      {
        topicId,
        activityId: choice.id,
        contentVersion: "0.9.0",
        updatedAt: "2026-10-01T00:00:00.000Z",
        answer: { kind: "choice", optionId: choice.correctOptionId },
        referenceViewed: true,
      },
      {
        topicId,
        activityId: written.id,
        contentVersion: "0.9.0",
        updatedAt: "2026-10-01T00:00:00.000Z",
        answer: {
          kind: "text",
          text: "My previous explanation remains editable.",
        },
        referenceViewed: true,
      },
    ],
  });
  await seed(page, raw);
  await page.goto(practicePath());
  await expect(card(page, written).getByRole("textbox")).toHaveValue(
    "My previous explanation remains editable.",
  );
  await expect(card(page, written).getByRole("note")).toContainText(
    "content v0.9.0",
  );
  await expect(
    card(page, written).getByText("Example answer", { exact: true }),
  ).toHaveCount(0);
  await expect(card(page, choice).getByRole("status")).toHaveCount(0);
  await expect(
    card(page, choice).locator(`input[value="${choice.correctOptionId}"]`),
  ).toBeEnabled();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(raw);
  await card(page, choice)
    .getByRole("button", { name: "Review saved choice" })
    .click();
  await expect(card(page, choice).getByRole("status")).toContainText(
    "That reasoning holds",
  );
  const compare = card(page, written).getByRole("button", {
    name: "Compare with a model answer",
  });
  await compare.focus();
  await page.keyboard.press("Enter");
  await expect(
    card(page, written).getByText("Example answer", { exact: true }),
  ).toBeVisible();
  await expect(card(page, written).getByRole("textbox")).toHaveValue(
    "My previous explanation remains editable.",
  );
  const exported = JSON.parse(await downloadedText(page, "Download answers"));
  expect(
    exported.answers.every(
      (answer: { contentVersion: string }) =>
        answer.contentVersion ===
        catalog.find((entry) => entry.id === topicId)!.contentVersion,
    ),
  ).toBe(true);
});

for (const theme of ["light", "dark"] as const) {
  test(`saved practice: 320px ${theme} keyboard flow works with reduced motion`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
    await page.goto(practicePath());
    const question = questions("request-flow").find((item) => !item.options)!;
    const field = card(page, question).getByRole("textbox");
    await field.focus();
    await page.keyboard.type(
      "I can explain the queue and defend a bounded waiting policy.",
    );
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(
      "I can explain the queue and defend a bounded waiting policy.",
    );
    await page.keyboard.press("Tab");
    await expect(
      card(page, question).getByRole("button", {
        name: "Compare with a model answer",
      }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      card(page, question).getByText("Example answer", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: `test-results/saved-practice-mobile-${theme}.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: `test-results/saved-practice-desktop-${theme}.png`,
      fullPage: true,
    });
    await page.reload();
    await expect(field).toHaveValue(
      "I can explain the queue and defend a bounded waiting policy.",
    );
  });
}
