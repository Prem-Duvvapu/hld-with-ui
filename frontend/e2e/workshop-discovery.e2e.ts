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
const validCollection = ajv.compile(
  JSON.parse(
    JSON.stringify({
      ...openapi.paths["/api/v1/case-studies"].get.responses["200"].content[
        "application/json"
      ].schema,
      $defs: openapi.components.schemas,
    })
      .split("#/components/schemas/")
      .join("#/$defs/"),
  ),
);

test("Java collection honors the contract and keeps the draft out of home discovery", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/v1/case-studies");
  expect(response.status()).toBe(200);
  const entries = await response.json();
  expect(validCollection(entries), JSON.stringify(validCollection.errors)).toBe(
    true,
  );
  expect(entries).toEqual([]);
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Request Flow/ })).toBeVisible();
  await expect(page.getByText("Loading design workshops")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Design workshops", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator('a[href="/case-studies/url-shortener"]'),
  ).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`explicitly mocked published metadata opens the real draft workshop in ${theme}`, async ({
    page,
    request,
  }) => {
    // Production catalog remains draft. Only the discovery response is mocked;
    // following the link still loads the actual Java resource and draft notice.
    const detail = await (
      await request.get("/api/v1/case-studies/url-shortener")
    ).json();
    const entries = [{ ...detail.entry, status: "published" }];
    expect(
      validCollection(entries),
      JSON.stringify(validCollection.errors),
    ).toBe(true);
    await page.route("**/api/v1/case-studies", (route) =>
      route.fulfill({ status: 200, json: entries }),
    );
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/");
    const catalog = page.getByRole("region", {
      name: "Design workshops",
      exact: true,
    });
    const card = catalog.getByRole("link", { name: /URL Shortener/ });
    await expect(card).toHaveAttribute("href", "/case-studies/url-shortener");
    await expect(card).toContainText("Guided design");
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await card.focus();
      await expect(card).toBeFocused();
      await catalog.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `test-results/workshop-discovery-${width}-${theme}.png`,
      });
    }
    await card.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/case-studies\/url-shortener$/);
    await expect(
      page.getByRole("region", { name: "Draft workshop" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Your original answer" }),
    ).toBeVisible();
    await page.goBack();
    await expect(card).toBeVisible();
  });
}

test("workshop loading, failure and keyboard retry leave foundation modules usable", async ({
  page,
}) => {
  let release: () => void = () => undefined;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/case-studies", async (route) => {
    await waiting;
    await route.fulfill({
      status: 503,
      json: { message: "Design workshops are temporarily unavailable." },
    });
  });
  await page.goto("/");
  const catalog = page.getByRole("region", {
    name: "Design workshops",
    exact: true,
  });
  await expect(catalog.getByRole("status")).toHaveText(
    "Loading design workshops…",
  );
  const foundation = page.getByRole("link", { name: /Request Flow/ });
  await expect(foundation).toBeVisible();
  release();
  await expect(catalog.getByRole("alert")).toContainText(
    "Design workshops are temporarily unavailable.",
  );
  await expect(foundation).toBeVisible();
  await page.unroute("**/api/v1/case-studies");
  await catalog.getByRole("button", { name: "Try again" }).focus();
  await page.keyboard.press("Enter");
  await expect(catalog).toHaveCount(0);
  await expect(foundation).toBeVisible();
  await foundation.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", {
      name: "Request Flow & Load Balancing",
      exact: true,
    }),
  ).toBeVisible();
});
