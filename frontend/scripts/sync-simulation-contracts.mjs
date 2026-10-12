import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const names = {
  state: "QueueCapacityState",
  event: "QueueCapacityEvent",
  outcome: "QueueCapacityOutcome",
  metrics: "QueueCapacityMetrics",
};

// Canonical schemas own queue model and guided content shape. Export normal internal OpenAPI refs
// so existing generation and response validators need no remote resolution.
function exportSchema(value) {
  if (Array.isArray(value)) return value.map(exportSchema);
  if (value === null || typeof value !== "object") return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (["$schema", "$id", "$defs"].includes(key)) continue;
    if (key === "$ref" && child.startsWith("#/$defs/")) {
      const name = names[child.slice("#/$defs/".length)];
      if (!name) throw new Error(`Unsupported queue definition: ${child}`);
      result[key] = `#/components/schemas/${name}`;
    } else result[key] = exportSchema(child);
  }
  return result;
}

const apiPath = resolve(root, "contracts/openapi.json");
const openapi = read("contracts/openapi.json");
const input = read("contracts/queue-capacity.input.schema.json");
const result = read("contracts/queue-capacity.result.schema.json");
openapi.components.schemas.QueueCapacityInput = exportSchema(input);
openapi.components.schemas.QueueCapacityResult = exportSchema(result);
for (const [definition, name] of Object.entries(names)) {
  if (!result.$defs[definition]) throw new Error(`Missing ${definition}`);
  openapi.components.schemas[name] = exportSchema(result.$defs[definition]);
}
openapi.components.schemas.GuidedCheckpoint = exportSchema(
  read("contracts/checkpoints.schema.json").items,
);
writeFileSync(apiPath, JSON.stringify(openapi, null, 2) + "\n");
