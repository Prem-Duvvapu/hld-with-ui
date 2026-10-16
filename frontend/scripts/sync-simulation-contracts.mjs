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
const dataInputId =
  "https://hld-with-ui.dev/schemas/data-access.input.schema.json";
const dataInputNames = {
  identifier: "DataAccessIdentifier",
  row: "DataAccessRow",
  operation: "DataAccessOperation",
};
const dataResultNames = {
  outcome: "DataAccessOutcome",
  work: "DataAccessWork",
  totals: "DataAccessTotals",
  conflict: "DataAccessConflict",
};
const reservationInputId =
  "https://hld-with-ui.dev/schemas/transactions-isolation.input.schema.json";
const reservationInputNames = {
  identifier: "ReservationIdentifier",
  reservation: "ReservationRequest",
  step: "ReservationStep",
};
const reservationResultNames = {
  reservationState: "ReservationActorState",
  allocation: "ReservationAllocation",
  invariants: "ReservationInvariants",
  state: "ReservationState",
  outcome: "ReservationOutcome",
  metrics: "ReservationMetrics",
};
const atomicityInputId =
  "https://hld-with-ui.dev/schemas/transaction-atomicity.input.schema.json";
const atomicityInputNames = {
  identifier: "AtomicityIdentifier",
  transaction: "AtomicityTransaction",
  step: "AtomicityStep",
};
const atomicityResultNames = {
  pendingAllocation: "AtomicityPendingAllocation",
  allocation: "AtomicityAllocation",
  transactionState: "AtomicityTransactionState",
  invariants: "AtomicityInvariants",
  state: "AtomicityState",
  outcome: "AtomicityOutcome",
  metrics: "AtomicityMetrics",
};

const retryInputId =
  "https://hld-with-ui.dev/schemas/timeouts-retries.input.schema.json";
const retryInputNames = {
  identifier: "RetryIdentifier",
  request: "RetryRequest",
};
const retryResultNames = {
  attemptIdentifier: "RetryAttemptIdentifier",
  requestState: "RetryRequestState",
  attemptState: "RetryAttemptState",
  workerState: "RetryWorkerState",
  state: "RetryState",
  event: "RetryEvent",
};

// Canonical schemas own model evidence and guided content. Export normal internal OpenAPI refs
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
      if (!name) throw new Error(`Unsupported model definition: ${child}`);
      result[key] = `#/components/schemas/${name}`;
    } else if (key === "$ref" && child.startsWith(dataInputId)) {
      const name =
        child === dataInputId
          ? "DataAccessInput"
          : dataInputNames[child.slice(`${dataInputId}#/$defs/`.length)];
      if (!name) throw new Error(`Unsupported data input reference: ${child}`);
      result[key] = `#/components/schemas/${name}`;
    } else if (key === "$ref" && child.startsWith(reservationInputId)) {
      const name =
        child === reservationInputId
          ? "ReservationInput"
          : reservationInputNames[
              child.slice(`${reservationInputId}#/$defs/`.length)
            ];
      if (!name)
        throw new Error(`Unsupported reservation input reference: ${child}`);
      result[key] = `#/components/schemas/${name}`;
    } else if (key === "$ref" && child.startsWith(atomicityInputId)) {
      const name =
        child === atomicityInputId
          ? "AtomicityInput"
          : atomicityInputNames[
              child.slice(`${atomicityInputId}#/$defs/`.length)
            ];
      if (!name)
        throw new Error(`Unsupported atomicity input reference: ${child}`);
      result[key] = `#/components/schemas/${name}`;
    } else if (key === "$ref" && child.startsWith(retryInputId)) {
      const name =
        child === retryInputId
          ? "RetryInput"
          : retryInputNames[child.slice(`${retryInputId}#/$defs/`.length)];
      if (!name) throw new Error(`Unsupported retry input reference: ${child}`);
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

// Captured result input and row/identifier references retain one canonical owner.
for (const [kind, component, definitions] of [
  ["input", "DataAccessInput", dataInputNames],
  ["result", "DataAccessResult", dataResultNames],
]) {
  const schema = read(`contracts/data-access.${kind}.schema.json`);
  openapi.components.schemas[component] = exportSchema(schema, definitions);
  for (const [definition, name] of Object.entries(definitions)) {
    if (!schema.$defs[definition]) throw new Error(`Missing ${definition}`);
    openapi.components.schemas[name] = exportSchema(
      schema.$defs[definition],
      definitions,
    );
  }
}
const dataTarget = checkpoints.items.properties.target.oneOf.find((branch) =>
  branch.required.includes("operationId"),
);
const dataOutcome = read("contracts/data-access.result.schema.json").$defs
  .outcome;
const dataIdentifier = read("contracts/data-access.input.schema.json").$defs
  .identifier;
const dataKinds = kindsSupportingSelectors(dataOutcome, ["operationId"], {
  [`${dataInputId}#/$defs/identifier`]: dataIdentifier,
});
if (
  JSON.stringify(dataTarget?.properties.kind.enum) !== JSON.stringify(dataKinds)
)
  throw new Error(
    "Data-access checkpoint kinds differ from actual outcome selector capabilities.",
  );

for (const [kind, component, definitions] of [
  ["input", "ReservationInput", reservationInputNames],
  ["result", "ReservationResult", reservationResultNames],
]) {
  const schema = read(`contracts/transactions-isolation.${kind}.schema.json`);
  openapi.components.schemas[component] = exportSchema(schema, definitions);
  for (const [definition, name] of Object.entries(definitions)) {
    if (!schema.$defs[definition]) throw new Error(`Missing ${definition}`);
    openapi.components.schemas[name] = exportSchema(
      schema.$defs[definition],
      definitions,
    );
  }
}
for (const [kind, component, definitions] of [
  ["input", "AtomicityInput", atomicityInputNames],
  ["result", "AtomicityResult", atomicityResultNames],
]) {
  const schema = read(`contracts/transaction-atomicity.${kind}.schema.json`);
  openapi.components.schemas[component] = exportSchema(schema, definitions);
  for (const [definition, name] of Object.entries(definitions)) {
    if (!schema.$defs[definition]) throw new Error(`Missing ${definition}`);
    openapi.components.schemas[name] = exportSchema(
      schema.$defs[definition],
      definitions,
    );
  }
}
for (const [kind, component, definitions] of [
  ["input", "RetryInput", retryInputNames],
  ["result", "RetryResult", retryResultNames],
]) {
  const schema = read(`contracts/timeouts-retries.${kind}.schema.json`);
  openapi.components.schemas[component] = exportSchema(schema, definitions);
  for (const [definition, name] of Object.entries(definitions)) {
    if (!schema.$defs[definition]) throw new Error(`Missing ${definition}`);
    openapi.components.schemas[name] = exportSchema(
      schema.$defs[definition],
      definitions,
    );
  }
}
const transactionTarget = checkpoints.items.properties.target.oneOf.find(
  (branch) => branch.required.includes("stepId"),
);
const reservationOutcome = read(
  "contracts/transactions-isolation.result.schema.json",
).$defs.outcome;
const reservationIdentifier = read(
  "contracts/transactions-isolation.input.schema.json",
).$defs.identifier;
const reservationKinds = kindsSupportingSelectors(
  reservationOutcome,
  ["stepId"],
  {
    [`${reservationInputId}#/$defs/identifier`]: reservationIdentifier,
  },
);
const atomicityOutcome = read(
  "contracts/transaction-atomicity.result.schema.json",
).$defs.outcome;
const atomicityIdentifier = read(
  "contracts/transaction-atomicity.input.schema.json",
).$defs.identifier;
const atomicityKinds = kindsSupportingSelectors(atomicityOutcome, ["stepId"], {
  [`${atomicityInputId}#/$defs/identifier`]: atomicityIdentifier,
});
const transactionKinds = [...new Set([...reservationKinds, ...atomicityKinds])];
if (
  JSON.stringify(transactionTarget?.properties.kind.enum) !==
  JSON.stringify(transactionKinds)
)
  throw new Error(
    "Transaction checkpoint kinds differ from actual reservation and atomicity outcome selector capabilities.",
  );

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
const dataDescriptorSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  ...openapi.components.schemas.DataAccessDescriptor,
  $defs: Object.fromEntries(
    [
      "DataAccessIdentifier",
      "DataAccessRow",
      "DataAccessOperation",
      "DataAccessInput",
      "DataAccessLimits",
      "DataAccessPreset",
    ].map((name) => [name, openapi.components.schemas[name]]),
  ),
};
writeFileSync(
  resolve(root, "frontend/src/api/schemas/data-access-descriptor.schema.json"),
  JSON.stringify(dataDescriptorSchema).replaceAll(
    "#/components/schemas/",
    "#/$defs/",
  ) + "\n",
);
const reservationDescriptorSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  ...openapi.components.schemas.ReservationDescriptor,
  $defs: Object.fromEntries(
    [
      "ReservationIdentifier",
      "ReservationRequest",
      "ReservationStep",
      "ReservationInput",
      "ReservationLimits",
      "ReservationPreset",
    ].map((name) => [name, openapi.components.schemas[name]]),
  ),
};
writeFileSync(
  resolve(root, "frontend/src/api/schemas/reservation-descriptor.schema.json"),
  JSON.stringify(reservationDescriptorSchema).replaceAll(
    "#/components/schemas/",
    "#/$defs/",
  ) + "\n",
);
const atomicityDescriptorSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  ...openapi.components.schemas.AtomicityDescriptor,
  $defs: Object.fromEntries(
    [
      "AtomicityIdentifier",
      "AtomicityTransaction",
      "AtomicityStep",
      "AtomicityInput",
      "AtomicityLimits",
      "AtomicityPreset",
    ].map((name) => [name, openapi.components.schemas[name]]),
  ),
};
writeFileSync(
  resolve(root, "frontend/src/api/schemas/atomicity-descriptor.schema.json"),
  JSON.stringify(atomicityDescriptorSchema).replaceAll(
    "#/components/schemas/",
    "#/$defs/",
  ) + "\n",
);
const retryDescriptorSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  ...openapi.components.schemas.RetryDescriptor,
  $defs: Object.fromEntries(
    [
      "RetryIdentifier",
      "RetryRequest",
      "RetryInput",
      "RetryLimits",
      "RetryPreset",
    ].map((name) => [name, openapi.components.schemas[name]]),
  ),
};
writeFileSync(
  resolve(root, "frontend/src/api/schemas/retry-descriptor.schema.json"),
  JSON.stringify(retryDescriptorSchema).replaceAll(
    "#/components/schemas/",
    "#/$defs/",
  ) + "\n",
);
writeFileSync(apiPath, JSON.stringify(openapi, null, 2) + "\n");
