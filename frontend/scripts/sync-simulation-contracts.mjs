import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { kindsSupportingSelectors } from "./event-selector-capabilities.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const names = {
  state: "QueueCapacityState",
  event: "QueueCapacityEvent",
  outcome: "QueueCapacityOutcome",
  metrics: "QueueCapacityMetrics",
};
const deliveryNames = {
  message: "DeliveryMessage",
  consumer: "DeliveryConsumer",
  attempt: "DeliveryAttempt",
  ledger: "DeliveryLedgerEntry",
  state: "DeliveryState",
  changes: "DeliveryChanges",
  event: "DeliveryEvent",
  outcome: "DeliveryMessageOutcome",
  metrics: "DeliveryMetrics",
  failureOutcome: "DeliveryFailureOutcome",
  lostAcknowledgmentOutcome: "DeliveryLostAcknowledgmentOutcome",
};

// Canonical schemas own queue model and guided content shape. Export normal internal OpenAPI refs
// so existing generation and response validators need no remote resolution.
function exportSchema(value, definitions = names) {
  if (Array.isArray(value))
    return value.map((child) => exportSchema(child, definitions));
  if (value === null || typeof value !== "object") return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (["$schema", "$id", "$defs"].includes(key)) continue;
    if (key === "$ref" && child.startsWith("#/$defs/")) {
      const name = definitions[child.slice("#/$defs/".length)];
      if (!name) throw new Error(`Unsupported queue definition: ${child}`);
      result[key] = `#/components/schemas/${name}`;
    } else result[key] = exportSchema(child, definitions);
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
const checkpoints = read("contracts/checkpoints.schema.json");
openapi.components.schemas.GuidedCheckpoint = exportSchema(checkpoints.items);
const deliveryInput = read("contracts/queue-delivery.input.schema.json");
const deliveryResult = read("contracts/queue-delivery.result.schema.json");
const deliveryTarget = checkpoints.items.properties.target.oneOf.find(
  (branch) =>
    branch.required.includes("messageId") &&
    branch.required.includes("attemptId"),
);
const deliveryKinds = kindsSupportingSelectors(deliveryResult.$defs.event, [
  "messageId",
  "attemptId",
]);
if (
  JSON.stringify(deliveryTarget?.properties.kind.enum) !==
  JSON.stringify(deliveryKinds)
)
  throw new Error(
    "Delivery checkpoint kinds differ from the actual event selector capabilities.",
  );
openapi.components.schemas.DeliveryInput = exportSchema(
  deliveryInput,
  deliveryNames,
);
openapi.components.schemas.DeliveryResult = exportSchema(
  deliveryResult,
  deliveryNames,
);
for (const [definition, name] of Object.entries(deliveryNames)) {
  if (!deliveryResult.$defs[definition])
    throw new Error(`Missing ${definition}`);
  openapi.components.schemas[name] = exportSchema(
    deliveryResult.$defs[definition],
    deliveryNames,
  );
}

// The lazy delivery client needs only its descriptor's reachable schemas, not the entire API.
// This generated artifact keeps runtime validation derived from the same canonical HTTP contract.
const descriptorSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  ...openapi.components.schemas.DeliveryDescriptor,
  $defs: Object.fromEntries(
    ["DeliveryLimits", "DeliveryPreset", "DeliveryInput"].map((name) => [
      name,
      openapi.components.schemas[name],
    ]),
  ),
};
const descriptorPath = resolve(
  root,
  "frontend/src/api/schemas/delivery-descriptor.schema.json",
);
mkdirSync(dirname(descriptorPath), { recursive: true });
writeFileSync(
  descriptorPath,
  JSON.stringify(descriptorSchema).replaceAll(
    "#/components/schemas/",
    "#/$defs/",
  ) + "\n",
);
writeFileSync(apiPath, JSON.stringify(openapi, null, 2) + "\n");
