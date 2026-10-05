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
function validator(name: string) {
  return ajv.compile(
    JSON.parse(
      JSON.stringify({
        ...openapi.components.schemas[name],
        $defs: openapi.components.schemas,
      })
        .split("#/components/schemas/")
        .join("#/$defs/"),
    ),
  );
}
const descriptorValid = validator("CacheAsideDescriptor");
const resultValid = validator("CacheAsideResult");
const topicValid = validator("TopicDetail");

test("real topic HTTP responses, including guided checkpoints, satisfy OpenAPI", async ({
  request,
}) => {
  for (const id of ["cache-aside", "request-flow"]) {
    const response = await request.get(`/api/v1/topics/${id}`);
    expect(response.status()).toBe(200);
    const topic = await response.json();
    expect(topicValid(topic), JSON.stringify(topicValid.errors)).toBe(true);
    expect(topic.checkpoints.length > 0).toBe(
      topic.topic.capabilities.includes("guided"),
    );
  }
});

test("real cache HTTP descriptor and completed/limited results satisfy OpenAPI", async ({
  request,
}) => {
  const response = await request.get("/api/v1/simulations/cache-aside");
  expect(response.status()).toBe(200);
  const descriptor = await response.json();
  expect(
    descriptorValid(descriptor),
    JSON.stringify(descriptorValid.errors),
  ).toBe(true);
  const baseline = descriptor.presets[0].input;
  const cases = [
    ...descriptor.presets.map((preset: { input: unknown }) => preset.input),
    { ...baseline, operations: [{ kind: "GET", key: "missing", timeMs: 0 }] },
    {
      ...baseline,
      initialOriginValue: '雪\\"\n',
      operations: [
        { kind: "UPDATE", key: "other", value: "🌱", timeMs: 0 },
        { kind: "GET", key: "other", timeMs: 1 },
        { kind: "GET", key: "k", timeMs: 2 },
      ],
    },
    { ...baseline, operations: [{ kind: "GET", key: "k", timeMs: 59990 }] },
  ];
  for (const input of cases) {
    const run = await request.post("/api/v1/simulations/cache-aside/runs", {
      data: input,
    });
    expect(run.status()).toBe(200);
    const result = await run.json();
    expect(resultValid(result), JSON.stringify(resultValid.errors)).toBe(true);
  }
});

for (const change of ["model", "schema", "event", "initialState"] as const) {
  test(`incompatible cache ${change} shows a recoverable error`, async ({
    page,
  }) => {
    await page.route(
      "**/api/v1/simulations/cache-aside/runs",
      async (route) => {
        const response = await route.fetch();
        const result = await response.json();
        if (change === "model") result.modelVersion = "999.0";
        if (change === "schema") result.schemaVersion = "999.0";
        if (change === "event") result.events[0].kind = "cache.future";
        if (change === "initialState") delete result.initialState;
        await route.fulfill({ response, json: result });
      },
    );
    await page.goto("/topics/cache-aside");
    await page.getByRole("button", { name: "Run simulation" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "incompatible with this app",
    );
    await expect(
      page.getByRole("table", { name: "Cache GET outcomes" }),
    ).toHaveCount(0);
    await page.unroute("**/api/v1/simulations/cache-aside/runs");
    await page.getByRole("button", { name: "Run simulation" }).click();
    await expect(
      page.getByRole("table", { name: "Cache GET outcomes" }),
    ).toBeVisible();
  });
}

test("an incompatible descriptor is rejected before mounting controls", async ({
  page,
}) => {
  await page.route("**/api/v1/simulations/cache-aside", async (route) => {
    const response = await route.fetch();
    const descriptor = await response.json();
    descriptor.modelVersion = "999.0";
    await route.fulfill({ response, json: descriptor });
  });
  await page.goto("/topics/cache-aside");
  await expect(page.getByRole("alert")).toContainText(
    "incompatible with this app",
  );
  await expect(page.getByLabel("TTL (ms)")).toHaveCount(0);
  await page.unroute("**/api/v1/simulations/cache-aside");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("TTL (ms)")).toBeVisible();
});
