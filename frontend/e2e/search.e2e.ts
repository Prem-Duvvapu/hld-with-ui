import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { expect, test } from "@playwright/test";

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
const validSearch = ajv.compile(
  JSON.parse(
    JSON.stringify({
      ...openapi.components.schemas.SearchResponse,
      $defs: openapi.components.schemas,
    })
      .split("#/components/schemas/")
      .join("#/$defs/"),
  ),
);

test("packaged Java search validates the contract and excludes drafts", async ({
  request,
}) => {
  const response = await request.get(
    "/api/v1/search?q=stale%20reads&capability=simulation",
  );
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(validSearch(body), JSON.stringify(validSearch.errors)).toBe(true);
  expect(body.results[0].path).toBe("/topics/cache-aside?view=study");
  expect(
    body.results.every(
      (hit: { entry: { status: string } }) => hit.entry.status === "published",
    ),
  ).toBe(true);
  const draft = await (
    await request.get("/api/v1/search?q=codes&capability=case-study")
  ).json();
  expect(validSearch(draft), JSON.stringify(validSearch.errors)).toBe(true);
  expect(draft.results).toEqual([]);
  expect((await request.get("/api/v1/search?q=cache&q=queue")).status()).toBe(
    400,
  );
  expect(
    (await request.get("/api/v1/search?q=cache&typo=guided")).status(),
  ).toBe(400);
});

test("search restores criteria through a real lesson and browser history", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Search", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Start with a concept/)).toBeVisible();
  await page.getByRole("searchbox").fill("stale reads");
  await page.getByRole("combobox", { name: "Activity" }).selectOption("guided");
  const submit = page.getByRole("button", { name: "Search", exact: true });
  await submit.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Results for “stale reads”" }),
  ).toBeVisible();
  await expect(submit).toBeFocused();
  const hit = page.getByRole("link", { name: /Cache-Aside/ });
  await expect(hit).toHaveAttribute("href", "/topics/cache-aside?view=study");
  await hit.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: /Study/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.goBack();
  await expect(page.getByRole("searchbox")).toHaveValue("stale reads");
  await expect(page.getByRole("combobox", { name: "Activity" })).toHaveValue(
    "guided",
  );
  await expect(hit).toBeVisible();
  await page.reload();
  await expect(hit).toBeVisible();
  await page.getByRole("button", { name: "Clear search and filters" }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Activity" })).toHaveValue(
    "",
  );
  await expect(page.getByText(/Start with a concept/)).toBeVisible();
});

test("honest no-result, validation, loading and backend-error states recover", async ({
  page,
}) => {
  await page.goto("/search?q=codes&capability=case-study");
  await expect(page.getByRole("status")).toHaveText("No matches");
  await expect(page.getByRole("link", { name: /URL Shortener/ })).toHaveCount(
    0,
  );
  await page.goto("/search?q=cache&q=queue");
  await expect(page.getByRole("alert")).toContainText(
    "unsupported or repeated filters",
  );
  await page.getByRole("button", { name: "Clear search link" }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await page.goto(`/search?q=${"x".repeat(101)}`);
  await expect(page.getByRole("alert")).toContainText("at most 100");
  let release: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/search?**", async (route) => {
    await wait;
    await route.fulfill({
      status: 503,
      json: { message: "Search temporarily unavailable." },
    });
  });
  await page.goto("/search?q=stale+reads");
  await expect(page.getByRole("status")).toHaveText(
    "Searching published content…",
  );
  release();
  await expect(page.getByRole("alert")).toContainText(
    "Search temporarily unavailable.",
  );
  await page.unroute("**/api/v1/search?**");
  await page.getByRole("button", { name: "Try again" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: /Cache-Aside/ })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`real search results are readable at all widths in ${theme} with reduced motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto(
      "/search?q=token+bucket&level=Intermediate&capability=simulation",
    );
    const hit = page.getByRole("link", { name: /Distributed Rate Limiter/ });
    await expect(hit).toBeVisible();
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await hit.focus();
      await expect(hit).toBeFocused();
      const card = (await hit.boundingBox())!;
      const action = (await hit.locator(".card-link").boundingBox())!;
      expect(action.y).toBeGreaterThanOrEqual(card.y);
      expect(action.y + action.height).toBeLessThanOrEqual(
        card.y + card.height,
      );
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await page.screenshot({
        path: `test-results/search-${width}-${theme}.png`,
        fullPage: true,
      });
    }
    await page
      .getByRole("combobox", { name: "Level" })
      .selectOption("Beginner");
    await expect(page.getByRole("note")).toContainText(
      "Select Search to apply",
    );
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("No matches");
  });
}
