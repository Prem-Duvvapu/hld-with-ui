import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type Worker,
} from "@playwright/test";

// This API exists only inside the isolated test extension's worker.
declare const chrome: {
  tabs: {
    query(
      options: Record<string, unknown>,
    ): Promise<{ id?: number; url?: string }[]>;
    setZoomSettings(
      id: number,
      settings: { mode: "automatic"; scope: "per-tab" },
    ): Promise<void>;
    setZoom(id: number, factor: number): Promise<void>;
    getZoom(id: number): Promise<number>;
  };
};

async function nativeZoom(page: Page, worker: Worker, factor: number) {
  const actual = await worker.evaluate(
    async ({ url, factor }) => {
      const tab = (await chrome.tabs.query({})).find((tab) => tab.url === url);
      if (tab?.id === undefined)
        throw new Error("Owned application tab not found");
      await chrome.tabs.setZoomSettings(tab.id, {
        mode: "automatic",
        scope: "per-tab",
      });
      await chrome.tabs.setZoom(tab.id, factor);
      return chrome.tabs.getZoom(tab.id);
    },
    { url: page.url(), factor },
  );
  expect(actual).toBe(factor);
}

for (const theme of ["light", "dark"] as const) {
  test(`native 200% browser zoom keeps all learning flows usable in ${theme}`, async ({
    baseURL,
  }, testInfo) => {
    test.setTimeout(60_000);
    const profile = await mkdtemp(join(tmpdir(), "hld-zoom-"));
    const extension = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "fixtures/native-zoom",
    );
    let context: BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext(profile, {
        baseURL,
        channel: "chromium",
        headless: true,
        viewport: null,
        args: [
          `--disable-extensions-except=${extension}`,
          `--load-extension=${extension}`,
          "--window-size=1440,1000",
        ],
      });
      const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent("serviceworker"));
      const page = await context.newPage();
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const cdp = await context.newCDPSession(page);
      const { windowId } = await cdp.send("Browser.getWindowForTarget");
      const evidence: unknown[] = [];
      for (const pixels of [1440, 640]) {
        await page.goto("/topics/request-flow");
        await nativeZoom(page, worker, 1);
        await cdp.send("Browser.setWindowBounds", {
          windowId,
          bounds: { width: pixels, height: 1000 },
        });
        await expect.poll(() => page.evaluate(() => innerWidth)).toBe(pixels);
        const baseDpr = await page.evaluate(() => devicePixelRatio);
        for (const id of [
          "request-flow",
          "capacity-estimation",
          "distributed-rate-limiter",
          "cache-aside",
          "url-shortener",
        ]) {
          await page.goto(
            id === "url-shortener"
              ? "/case-studies/url-shortener?stage=operations"
              : `/topics/${id}`,
          );
          await nativeZoom(page, worker, 2);
          await expect
            .poll(() => page.evaluate(() => devicePixelRatio))
            .toBe(baseDpr * 2);
          await expect
            .poll(() => page.evaluate(() => innerWidth))
            .toBe(pixels / 2);
          let target: Locator;
          if (id === "request-flow") {
            const run = page.getByRole("button", { name: /Run experiment/ });
            await run.focus();
            await page.keyboard.press("Enter");
            target = page.getByLabel("Run metrics", { exact: true });
            await expect(target).toContainText("COMPLETED6requests");
          } else if (id === "capacity-estimation") {
            const run = page.getByRole("button", {
              name: /Calculate estimate/,
            });
            await run.focus();
            await page.keyboard.press("Enter");
            target = page.locator("article", {
              has: page.getByText("Target peak", { exact: true }),
            });
            await expect(target).toContainText("752.3");
          } else if (id === "distributed-rate-limiter") {
            const run = page.getByRole("button", {
              name: "Run request burst",
              exact: true,
            });
            await run.focus();
            await page.keyboard.press("Enter");
            target = page.getByLabel("Rate limiter metrics", { exact: true });
            await expect(target).toContainText("REJECTED3");
          } else if (id === "cache-aside") {
            const run = page.getByRole("button", {
              name: "Run simulation",
              exact: true,
            });
            await page.route(
              "**/api/v1/simulations/cache-aside/runs",
              (route) =>
                route.fulfill({
                  status: 503,
                  contentType: "application/json",
                  body: JSON.stringify({
                    code: "request_failed",
                    message: "Zoom review: backend unavailable.",
                    fieldErrors: {},
                  }),
                }),
            );
            await run.focus();
            await page.keyboard.press("Enter");
            await expect(page.getByRole("alert")).toContainText(
              "Zoom review: backend unavailable.",
            );
            await page.unroute("**/api/v1/simulations/cache-aside/runs");
            await run.focus();
            await page.keyboard.press("Enter");
            target = page.getByRole("table", { name: "Cache GET outcomes" });
            await expect(target).toContainText("MISS");
            await expect(target).toContainText("HIT");
          } else {
            const original = page.getByRole("textbox", {
              name: "Your original answer",
              exact: true,
            });
            if ((await original.getAttribute("readonly")) === null) {
              await original.fill(
                "Preserve ownership and primary eligibility during rollback.",
              );
              await page
                .getByRole("button", {
                  name: "Reveal reference answer",
                  exact: true,
                })
                .click();
            }
            const viewer = page.locator(".workshop-walkthrough:visible");
            const decision = viewer.getByRole("button", {
              name: /04.*Preserve/,
            });
            await decision.focus();
            await page.keyboard.press("Enter");
            await expect(decision).toBeFocused();
            target = viewer.getByLabel("Selected decision", { exact: true });
            await expect(target).toContainText("503 with no Location");
          }
          await expect
            .poll(() =>
              page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            )
            .toBe(true);
          await target.evaluate((element) =>
            element.scrollIntoView({ block: "center" }),
          );
          const state = await page.evaluate(() => ({
            cssWidth: innerWidth,
            dpr: devicePixelRatio,
            pageWidth: document.documentElement.scrollWidth,
          }));
          evidence.push({ id, theme, windowPixels: pixels, zoom: 2, ...state });
          const shot = process.env.HLD_ZOOM_EVIDENCE_DIR
            ? join(
                process.env.HLD_ZOOM_EVIDENCE_DIR,
                `${id}-${pixels / 2}-${theme}.png`,
              )
            : testInfo.outputPath(`${id}-${pixels / 2}-${theme}.png`);
          // Capture the native viewport without a CSS-coordinate clipping rectangle.
          const { data } = await cdp.send("Page.captureScreenshot", {
            format: "png",
            captureBeyondViewport: false,
            fromSurface: false,
          });
          await mkdir(dirname(shot), { recursive: true });
          const pixelsBuffer = Buffer.from(data, "base64");
          expect(pixelsBuffer.readUInt32BE(16)).toBe(pixels); // Native PNG width, not CSS viewport width.
          await writeFile(shot, pixelsBuffer);
          await testInfo.attach(`${id}-${pixels / 2}-${theme}`, {
            path: shot,
            contentType: "image/png",
          });
        }
      }
      await testInfo.attach("native-zoom-observations", {
        body: JSON.stringify(evidence, null, 2),
        contentType: "application/json",
      });
    } finally {
      try {
        await context?.close();
      } finally {
        await rm(profile, { recursive: true, force: true });
      }
    }
  });
}
