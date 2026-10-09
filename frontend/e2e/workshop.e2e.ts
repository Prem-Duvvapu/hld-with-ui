import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { expect, test, type Page } from "@playwright/test";

const url = "/case-studies/url-shortener";
const key = "hld-practice-v1";
const content = JSON.parse(
  readFileSync(
    new URL(
      "../../content/case-studies/url-shortener/workshop.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const openapi = JSON.parse(
  readFileSync(
    new URL("../../contracts/openapi.json", import.meta.url),
    "utf8",
  ),
);
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
addFormats(ajv);
ajv.addFormat("int64", true);
const validDetail = ajv.compile(
  JSON.parse(
    JSON.stringify({
      ...openapi.components.schemas.CaseStudyDetail,
      $defs: openapi.components.schemas,
    })
      .split("#/components/schemas/")
      .join("#/$defs/"),
  ),
);
const original = (page: Page) =>
  page.getByRole("textbox", {
    name: "Your original answer",
    exact: true,
  });
const revision = (page: Page) =>
  page.getByRole("textbox", { name: "Your revised answer", exact: true });
const check = (page: Page) =>
  page.getByRole("group", {
    name: content.stages[0].rubric[0].prompt,
    exact: true,
  });
async function tools(page: Page) {
  const details = page.locator(".answer-backup-tools:visible");
  if ((await details.getAttribute("open")) === null)
    await details.locator("summary").click();
}
async function reveal(page: Page) {
  const button = page.getByRole("button", {
    name: "Reveal reference answer",
    exact: true,
  });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", {
      name: "2. Compare with the reference",
      exact: true,
    }),
  ).toBeFocused();
}

test("workshop Java response validates its contract and the draft stays outside published discovery", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/v1/case-studies/url-shortener");
  expect(response.status()).toBe(200);
  const detail = await response.json();
  expect(validDetail(detail), JSON.stringify(validDetail.errors)).toBe(true);
  expect(detail.entry).toMatchObject({
    status: "draft",
    kind: "case-study",
    capabilities: ["case-study"],
  });
  expect(
    detail.workshop.stages.map((stage: { id: string }) => stage.id),
  ).toEqual(["requirements", "estimates", "api", "data", "baseline", "flows"]);
  expect(detail.workshop.contentVersion).toBe("1.2.0");
  expect(detail.workshop.stages[0].id).toBe("requirements");
  expect((await request.get("/api/v1/topics/url-shortener")).status()).toBe(
    404,
  );
  expect((await request.get("/api/v1/case-studies/missing")).status()).toBe(
    404,
  );
  await page.goto("/");
  await expect(
    page.locator('a[href="/case-studies/url-shortener"]'),
  ).toHaveCount(0);
  await page.goto(url);
  await expect(
    page.getByRole("region", { name: "Draft workshop" }),
  ).toContainText("6 authored stages");
  await expect(page.getByRole("tab")).toHaveCount(1);
});

test("workshop original, revision and self-check reload and round-trip through a reviewed backup without POSTing notes", async ({
  page,
}) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/"))
      posts.push(request.url());
  });
  await page.goto(url);
  await original(page).fill(
    "Create stable codes; redirect only active links; clarify expiry.",
  );
  await reveal(page);
  await expect(original(page)).toHaveAttribute("readonly", "");
  await check(page)
    .getByRole("radio", { name: "Covered in my answer", exact: true })
    .check();
  await revision(page).fill(
    "Expiry is checked on cached reads, and ambiguous creates need a retry policy.",
  );
  await page.getByRole("button", { name: "Next stage", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: content.stages[1].title, exact: true }),
  ).toBeFocused();
  await original(page).fill(
    "Keep reads and writes separate; label bytes and requests per second.",
  );
  await reveal(page);
  await revision(page).fill(
    "Peak changes traffic; record size changes storage, not request count.",
  );
  await page
    .getByRole("group", {
      name: content.stages[1].rubric[0].prompt,
      exact: true,
    })
    .getByRole("radio", { name: "Needs a revision", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Previous stage", exact: true })
    .click();
  await page.reload();
  await expect(original(page)).toHaveValue(
    "Create stable codes; redirect only active links; clarify expiry.",
  );
  await expect(revision(page)).toHaveValue(
    "Expiry is checked on cached reads, and ambiguous creates need a retry policy.",
  );
  await expect(
    check(page).getByRole("radio", {
      name: "Covered in my answer",
      exact: true,
    }),
  ).toBeChecked();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download answers", exact: true })
    .click();
  const backup = readFileSync((await (await pending).path())!, "utf8");
  expect(
    JSON.parse(backup).answers.map(
      (answer: { activityId: string }) => answer.activityId,
    ),
  ).toEqual(
    expect.arrayContaining([
      "requirements-attempt",
      "requirements-revision",
      "requirements-check-behavior",
      "estimates-attempt",
      "estimates-revision",
      `estimates-check-${content.stages[1].rubric[0].id}`,
    ]),
  );
  await tools(page);
  await page
    .getByRole("button", { name: "Reset this module", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete module answers", exact: true })
    .click();
  await expect(original(page)).toHaveValue("");
  await expect(revision(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Next stage", exact: true }).click();
  await expect(original(page)).toHaveValue("");
  await expect(revision(page)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Previous stage", exact: true })
    .click();
  await page.getByLabel("Answer backup file", { exact: true }).setInputFiles({
    name: "workshop-answers.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await expect(
    page.getByRole("heading", { name: "Review imported answers", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Apply import", exact: true }).click();
  await expect(revision(page)).toHaveValue(
    "Expiry is checked on cached reads, and ambiguous creates need a retry policy.",
  );
  await expect(original(page)).toHaveValue(
    "Create stable codes; redirect only active links; clarify expiry.",
  );
  await page.getByRole("button", { name: "Next stage", exact: true }).click();
  await expect(original(page)).toHaveValue(
    "Keep reads and writes separate; label bytes and requests per second.",
  );
  await expect(revision(page)).toHaveValue(
    "Peak changes traffic; record size changes storage, not request count.",
  );
  await expect(
    page
      .getByRole("group", {
        name: content.stages[1].rubric[0].prompt,
        exact: true,
      })
      .getByRole("radio", { name: "Needs a revision", exact: true }),
  ).toBeChecked();
  expect(posts).toEqual([]);
  expect(page.url()).not.toContain("Expiry");
});

test("workshop older content keeps its original reasoning but requires fresh reference and self-check review", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          app: "hld-with-ui",
          schemaVersion: 1,
          answers: [
            {
              topicId: "url-shortener",
              activityId: "requirements-attempt",
              contentVersion: "0.9.0",
              updatedAt: "2026-10-01T00:00:00.000Z",
              answer: {
                kind: "text",
                text: "My older design assumed links never expire.",
              },
              referenceViewed: true,
            },
            {
              topicId: "url-shortener",
              activityId: "requirements-check-behavior",
              contentVersion: "0.9.0",
              updatedAt: "2026-10-01T00:00:00.000Z",
              answer: { kind: "choice", optionId: "yes" },
              referenceViewed: true,
            },
          ],
        }),
      );
    },
    { key },
  );
  await page.goto(url);
  await expect(original(page)).toHaveValue(
    "My older design assumed links never expire.",
  );
  await expect(page.getByRole("note")).toContainText("older lesson");
  await expect(
    page.getByRole("heading", {
      name: "2. Compare with the reference",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review the current reference", exact: true })
    .click();
  await expect(
    check(page).getByRole("radio", {
      name: "Covered in my answer",
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(original(page)).toHaveValue(
    "My older design assumed links never expire.",
  );
});

test("workshop load states retry a failed request and an unknown case has a clear 404", async ({
  page,
}) => {
  let release: () => void = () => undefined;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/case-studies/url-shortener", async (route) => {
    await waiting;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      json: { message: "Workshop unavailable." },
    });
  });
  await page.goto(url);
  await expect(
    page.getByRole("status").filter({ hasText: "Loading the module" }),
  ).toBeVisible();
  release();
  await expect(page.getByRole("alert")).toContainText("Workshop unavailable.");
  await page.unroute("**/api/v1/case-studies/url-shortener");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(original(page)).toBeVisible();
  await page.goto("/case-studies/missing");
  await expect(
    page.getByRole("heading", {
      name: "That route is outside the system.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("stage deep links, keyboard navigation and browser history show one authored stage and preserve drafts", async ({
  page,
}) => {
  await page.goto(`${url}?stage=api&view=workshop`);
  await expect(
    page.getByRole("heading", { name: content.stages[2].title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next stage", exact: true }),
  ).toBeEnabled();
  await original(page).fill(
    "A retry key must have an explicit scope and expiry.",
  );
  const previous = page.getByRole("button", {
    name: "Previous stage",
    exact: true,
  });
  await previous.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: content.stages[1].title, exact: true }),
  ).toBeFocused();
  await expect(page).toHaveURL(/stage=estimates/);
  await expect(page).toHaveURL(/view=workshop/);
  await original(page).fill(
    "Estimate mean concurrency from mean traffic and latency.",
  );
  await page.goBack();
  await expect(original(page)).toHaveValue(
    "A retry key must have an explicit scope and expiry.",
  );
  await page.goForward();
  await expect(original(page)).toHaveValue(
    "Estimate mean concurrency from mean traffic and latency.",
  );
  await page.reload();
  await expect(original(page)).toHaveValue(
    "Estimate mean concurrency from mean traffic and latency.",
  );
  await expect(page.getByRole("textbox")).toHaveCount(1);
  await page.goto(`${url}?stage=not-authored`);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "requested stage is unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: content.stages[0].title, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Workshop stages", exact: true })
    .getByRole("button", { name: new RegExp(content.stages[1].title) })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "requested stage" }),
  ).toHaveCount(0);
  await expect(
    page.locator('.workshop-navigation [aria-current="step"]'),
  ).toHaveText(new RegExp(content.stages[1].title));
});

test("full storage keeps transient reviews stage-local across navigation and clears them on reload without overwriting accepted work", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          app: "hld-with-ui",
          schemaVersion: 1,
          answers: Array.from({ length: 200 }, (_, i) => ({
            topicId: "retired-module",
            activityId: `answer-${i}`,
            contentVersion: "1.0.0",
            updatedAt: "2026-10-01T00:00:00.000Z",
            answer: { kind: "text", text: "Keep this work" },
            referenceViewed: false,
          })),
        }),
      ),
    { key },
  );
  await page.goto(url);
  const before = await page.evaluate((key) => localStorage.getItem(key), key);
  await reveal(page);
  await expect(
    page.getByRole("region", { name: "Workshop answer storage" }),
  ).toContainText("answer limit");
  await page.getByRole("button", { name: "Next stage", exact: true }).click();
  await expect(
    page.getByRole("region", {
      name: "2. Compare with the reference",
      exact: true,
    }),
  ).toHaveCount(0);
  await reveal(page);
  await page
    .getByRole("button", { name: "Previous stage", exact: true })
    .click();
  await expect(
    page.getByRole("region", {
      name: "2. Compare with the reference",
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    before,
  );
  await page.reload();
  await expect(
    page.getByRole("region", {
      name: "2. Compare with the reference",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    before,
  );
});

for (const theme of ["light", "dark"] as const) {
  test(`workshop ${theme} keyboard flow fits mobile, tablet and desktop with reduced motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(url);
    await original(page).focus();
    await page.keyboard.type(
      "Active links have one stable owner; expiry stays correct during a cache outage.",
    );
    await reveal(page);
    await check(page)
      .getByRole("radio", { name: "Needs a revision", exact: true })
      .focus();
    await page.keyboard.press("Space");
    await expect(
      check(page).getByRole("radio", { name: "Needs a revision", exact: true }),
    ).toBeChecked();
    await revision(page).focus();
    await page.keyboard.type(
      "I will define create and redirect behavior, latency boundaries, abuse policy and non-goals.",
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
        await page
          .getByRole("region", { name: "Draft workshop", exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `test-results/workshop-${width}-${theme}.png`,
        });
        await page.locator(".workshop-checks:visible").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `test-results/workshop-review-${width}-${theme}.png`,
        });
      }
    }
    await page.reload();
    await expect(revision(page)).toHaveValue(
      "I will define create and redirect behavior, latency boundaries, abuse policy and non-goals.",
    );
    for (const stage of content.stages.slice(1)) {
      await page
        .getByRole("navigation", { name: "Workshop stages", exact: true })
        .getByRole("button", { name: new RegExp(stage.title) })
        .click();
      await expect(
        page.getByRole("heading", { name: stage.title, exact: true }),
      ).toBeFocused();
      await original(page).fill(
        `My ${stage.id} reasoning states the assumptions.`,
      );
      await reveal(page);
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
          await page
            .getByRole("navigation", { name: "Workshop stages", exact: true })
            .scrollIntoViewIfNeeded();
          await page.screenshot({
            path: `test-results/workshop-${stage.id}-${width}-${theme}.png`,
          });
        }
      }
    }
  });
}
