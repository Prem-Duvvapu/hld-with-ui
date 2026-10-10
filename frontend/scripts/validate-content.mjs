import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(frontendRoot, "..");
const contentRoot = resolve(root, "content");
const errors = [];
const schemaValidators = new Map();
const readJson = (path) =>
  JSON.parse(readFileSync(resolve(root, path), "utf8"));
const catalog = readJson("content/catalog.json");
const openapi = readJson("contracts/openapi.json");

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
addFormats(ajv);
ajv.addFormat("int64", true);

function validateSchema(schemaPath, value, label) {
  let validate = schemaValidators.get(schemaPath);
  if (!validate) {
    validate = ajv.compile(readJson(schemaPath));
    schemaValidators.set(schemaPath, validate);
  }
  if (!validate(value)) {
    for (const issue of validate.errors ?? []) {
      errors.push(`${label}${issue.instancePath || "/"} ${issue.message}`);
    }
  }
}

function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) errors.push(`${label}: duplicate ${value}`);
    seen.add(value);
  }
}

function contentFile(relativePath, entryId) {
  const absolute = resolve(contentRoot, relativePath);
  if (!absolute.startsWith(contentRoot + sep)) {
    errors.push(`${entryId}: path escapes content root: ${relativePath}`);
  } else if (!existsSync(absolute)) {
    errors.push(`${entryId}: missing content file: ${relativePath}`);
  }
  return absolute;
}

validateSchema("contracts/catalog.schema.json", catalog, "catalog");

function openApiSchema(name) {
  const serialized = JSON.stringify({
    ...openapi.components.schemas[name],
    $defs: openapi.components.schemas,
  }).replaceAll("#/components/schemas/", "#/$defs/");
  return JSON.parse(serialized);
}

for (const example of ["request-flow-baseline", "request-flow-overload"]) {
  const input = readJson(`contracts/examples/${example}.json`);
  const validate = ajv.compile(openApiSchema("RequestFlowInput"));
  if (!validate(input)) {
    for (const issue of validate.errors ?? []) {
      errors.push(`${example}${issue.instancePath || "/"} ${issue.message}`);
    }
  }
}

unique(
  catalog.map((entry) => entry.id),
  "catalog",
);

const entries = new Map(catalog.map((entry) => [entry.id, entry]));
for (const entry of catalog) {
  for (const prerequisite of entry.prerequisites ?? []) {
    if (prerequisite === entry.id)
      errors.push(`${entry.id}: cannot require itself`);
    if (!entries.has(prerequisite))
      errors.push(`${entry.id}: unknown prerequisite ${prerequisite}`);
    else if (
      entry.status === "published" &&
      entries.get(prerequisite).status !== "published"
    )
      errors.push(
        `${entry.id}: published entry requires unpublished ${prerequisite}`,
      );
  }
}

const visited = new Set();
const active = new Set();
function visit(id) {
  if (active.has(id)) {
    errors.push(`${id}: prerequisite cycle`);
    return;
  }
  if (visited.has(id)) return;
  active.add(id);
  for (const prerequisite of entries.get(id)?.prerequisites ?? [])
    visit(prerequisite);
  active.delete(id);
  visited.add(id);
}
for (const id of entries.keys()) visit(id);

function descriptorIds(pathPrefix) {
  return new Set(
    Object.entries(openapi.paths ?? {})
      .filter(
        ([path, item]) =>
          path.startsWith(pathPrefix) && !path.endsWith("/runs") && item.get,
      )
      .map(([, item]) =>
        item.get.responses?.["200"]?.content?.["application/json"]?.schema?.[
          "$ref"
        ]
          ?.split("/")
          .at(-1),
      )
      .map((schemaName) =>
        schemaName
          ? openapi.components?.schemas?.[schemaName]?.properties?.id?.const
          : undefined,
      )
      .filter(Boolean),
  );
}

const knownSimulationIds = descriptorIds("/api/v1/simulations/");
const knownEstimatorIds = descriptorIds("/api/v1/estimators/");
const questionIds = [];
const checkpointIds = [];
const workshopIds = [];
const publishedWorkshopStages = [
  "requirements",
  "estimates",
  "api",
  "data",
  "baseline",
  "flows",
  "evolution",
  "failures",
  "operations",
  "defense",
];

// Event kinds a simulation can emit, read from its run-result contract.
function eventKinds(simulationId) {
  const ref = (schema) => schema?.$ref?.split("/").at(-1);
  const result =
    openapi.paths?.[`/api/v1/simulations/${simulationId}/runs`]?.post
      ?.responses?.["200"]?.content?.["application/json"]?.schema;
  const event = ref(
    openapi.components.schemas[ref(result)]?.properties?.events?.items,
  );
  return new Set(
    openapi.components.schemas[event]?.properties?.kind?.enum ?? [],
  );
}

const requiredHeadings = [
  "Learning outcomes",
  "Explain it simply",
  "Prerequisites",
  "Mental model",
  "How it works",
  "Worked example",
  "Explore in the playground",
  "Failures and tradeoffs",
  "In a real project",
  "Interview practice",
  "Teach it back",
  "Further reading",
];

function validateWorkshop(entry) {
  if (entry.workshopPath !== `case-studies/${entry.id}/workshop.json`) {
    errors.push(`${entry.id}: workshopPath must belong to this case study`);
    return;
  }
  const path = contentFile(entry.workshopPath, entry.id);
  const resourcePath = contentFile(entry.resourcesPath, entry.id);
  if (!existsSync(path) || !existsSync(resourcePath)) return;
  const workshop = JSON.parse(readFileSync(path, "utf8"));
  validateSchema(
    "contracts/workshop.schema.json",
    workshop,
    `${entry.id} workshop`,
  );
  const validate = ajv.compile(openApiSchema("Workshop"));
  if (!validate(workshop))
    for (const issue of validate.errors ?? [])
      errors.push(
        `${entry.id} API workshop${issue.instancePath || "/"} ${issue.message}`,
      );
  const resources = JSON.parse(readFileSync(resourcePath, "utf8"));
  validateSchema(
    "contracts/resources.schema.json",
    resources,
    `${entry.id} resources`,
  );
  unique(
    resources.map((resource) => resource.id),
    `${entry.id} resources`,
  );
  const sources = new Set(resources.map((resource) => resource.id));
  for (const id of entry.sourceIds ?? [])
    if (!sources.has(id))
      errors.push(`${entry.id}: unknown catalog source ${id}`);
  if (
    workshop.id !== entry.id ||
    workshop.contentVersion !== entry.contentVersion
  )
    errors.push(`${entry.id}: workshop identity/version differs from catalog`);
  if (!entry.capabilities.includes("case-study"))
    errors.push(`${entry.id}: workshop requires case-study capability`);
  if (!openapi.paths["/api/v1/case-studies/{id}"]?.get)
    errors.push(`${entry.id}: case-study API is absent from OpenAPI`);
  const stageIds = (workshop.stages ?? []).map((stage) => stage.id);
  unique(stageIds, `${entry.id} stages`);
  if (entry.status === "published")
    for (const id of publishedWorkshopStages)
      if (!stageIds.includes(id))
        errors.push(`${entry.id}: published workshop missing stage ${id}`);
  const activities = [];
  for (const stage of workshop.stages ?? []) {
    workshopIds.push(`${entry.id}/${stage.id}`);
    activities.push(`${stage.id}-attempt`, `${stage.id}-revision`);
    unique(
      (stage.rubric ?? []).map((criterion) => criterion.id),
      `${entry.id}/${stage.id} rubric`,
    );
    for (const criterion of stage.rubric ?? [])
      activities.push(`${stage.id}-check-${criterion.id}`);
    unique(
      (stage.walkthroughs ?? []).map((item) => item.id),
      `${entry.id}/${stage.id} walkthroughs`,
    );
    for (const diagram of stage.walkthroughs ?? []) {
      const prefix = `${entry.id}/${stage.id}/${diagram.id}`;
      const nodes = (diagram.nodes ?? []).map((node) => node.id);
      unique(nodes, `${prefix} nodes`);
      unique(
        (diagram.steps ?? []).map((step) => step.id),
        `${prefix} steps`,
      );
      for (const step of diagram.steps ?? [])
        if (!nodes.includes(step.from) || !nodes.includes(step.to))
          errors.push(`${prefix}/${step.id}: unknown walkthrough node`);
    }
    for (const sourceId of stage.sourceIds ?? [])
      if (!sources.has(sourceId) || !(entry.sourceIds ?? []).includes(sourceId))
        errors.push(`${entry.id}/${stage.id}: unknown source ${sourceId}`);
    for (const link of stage.experimentLinks ?? []) {
      const related = entries.get(link.topicId);
      if (
        !related ||
        related.kind !== "topic" ||
        related.status !== "published" ||
        !related.capabilities.some((capability) =>
          ["simulation", "estimator"].includes(capability),
        )
      )
        errors.push(
          `${entry.id}/${stage.id}: unavailable experiment ${link.topicId}`,
        );
    }
  }
  unique(activities, `${entry.id} saved activities`);
  if (
    entry.id.length > 100 ||
    entry.contentVersion.length > 32 ||
    activities.some((id) => id.length > 100)
  )
    errors.push(
      `${entry.id}: saved activity identity exceeds local answer bounds`,
    );
}

for (const entry of catalog.filter((item) => item.status !== "planned")) {
  if (entry.kind === "case-study") {
    validateWorkshop(entry);
    continue;
  }
  const activityIds = [];
  if (entry.id.length > 100 || entry.contentVersion.length > 32)
    errors.push(`${entry.id}: identity/version exceeds local answer bounds`);
  const lessonPath = contentFile(entry.lessonPath, entry.id);
  const questionsPath = contentFile(entry.questionsPath, entry.id);
  const resourcesPath = contentFile(entry.resourcesPath, entry.id);

  if (entry.capabilities.includes("study") && !entry.lessonPath)
    errors.push(`${entry.id}: study requires lessonPath`);
  if (entry.capabilities.includes("practice") && !entry.questionsPath)
    errors.push(`${entry.id}: practice requires questionsPath`);
  if (entry.capabilities.includes("simulation")) {
    for (const id of entry.simulationIds ?? []) {
      if (!knownSimulationIds.has(id))
        errors.push(`${entry.id}: simulation ${id} is absent from OpenAPI`);
    }
  }
  if (entry.capabilities.includes("estimator")) {
    for (const id of entry.estimatorIds ?? []) {
      if (!knownEstimatorIds.has(id))
        errors.push(`${entry.id}: estimator ${id} is absent from OpenAPI`);
    }
  }

  if (entry.capabilities.includes("guided")) {
    const checkpointsPath = contentFile(entry.checkpointsPath, entry.id);
    const checkpoints = existsSync(checkpointsPath)
      ? JSON.parse(readFileSync(checkpointsPath, "utf8"))
      : [];
    validateSchema(
      "contracts/checkpoints.schema.json",
      checkpoints,
      `${entry.id} checkpoints`,
    );
    // Presets and trace resolution are checked by Java tests, which run them.
    for (const checkpoint of checkpoints) {
      checkpointIds.push(`${entry.id}/${checkpoint.id}`);
      activityIds.push(
        `${checkpoint.id}-prediction`,
        `${checkpoint.id}-tradeoff`,
      );
      if (!(entry.simulationIds ?? []).includes(checkpoint.simulationId))
        errors.push(
          `${checkpoint.id}: simulation ${checkpoint.simulationId} is not one of ${entry.id}'s simulations`,
        );
      else if (
        !eventKinds(checkpoint.simulationId).has(checkpoint.target?.kind)
      )
        errors.push(
          `${checkpoint.id}: ${checkpoint.simulationId} never emits ${checkpoint.target?.kind}`,
        );
      const optionIds = (checkpoint.tradeoff?.options ?? []).map(
        (option) => option.id,
      );
      unique(optionIds, checkpoint.id);
      if (!optionIds.includes(checkpoint.tradeoff?.recommendedOptionId))
        errors.push(
          `${checkpoint.id}: recommendedOptionId does not match an option`,
        );
    }
  }

  if (existsSync(lessonPath)) {
    const lesson = readFileSync(lessonPath, "utf8");
    const headings = [...lesson.matchAll(/^## (.+)$/gm)].map(
      (match) => match[1],
    );
    let previous = -1;
    for (const heading of requiredHeadings) {
      const index = headings.indexOf(heading);
      if (index < 0)
        errors.push(`${entry.id}: lesson is missing “## ${heading}”`);
      if (index >= 0 && index < previous)
        errors.push(`${entry.id}: lesson heading “${heading}” is out of order`);
      previous = Math.max(previous, index);
    }
  }

  const resources = existsSync(resourcesPath)
    ? JSON.parse(readFileSync(resourcesPath, "utf8"))
    : [];
  validateSchema(
    "contracts/resources.schema.json",
    resources,
    `${entry.id} resources`,
  );
  unique(
    resources.map((resource) => resource.id),
    `${entry.id} resources`,
  );
  const resourceIds = new Set(resources.map((resource) => resource.id));
  for (const sourceId of entry.sourceIds ?? []) {
    if (!resourceIds.has(sourceId))
      errors.push(`${entry.id}: unknown catalog source ${sourceId}`);
  }

  const questions = existsSync(questionsPath)
    ? JSON.parse(readFileSync(questionsPath, "utf8"))
    : [];
  validateSchema(
    "contracts/questions.schema.json",
    questions,
    `${entry.id} questions`,
  );
  for (const question of questions) {
    activityIds.push(question.id);
    questionIds.push(question.id);
    if (question.topicId !== entry.id)
      errors.push(`${question.id}: topicId must be ${entry.id}`);
    const optionIds = (question.options ?? []).map((option) => option.id);
    unique(optionIds, question.id);
    if (
      question.correctOptionId &&
      !optionIds.includes(question.correctOptionId)
    ) {
      errors.push(`${question.id}: correctOptionId does not match an option`);
    }
    for (const sourceId of question.sourceIds ?? []) {
      if (!resourceIds.has(sourceId))
        errors.push(`${question.id}: unknown source ${sourceId}`);
    }
  }
  unique(activityIds, `${entry.id} saved activities`);
  if (activityIds.some((id) => id.length > 100))
    errors.push(
      `${entry.id}: saved activity IDs must be at most 100 characters`,
    );
}

unique(questionIds, "questions");
unique(checkpointIds, "checkpoints");

const learningPaths = readJson("content/learning-paths.json");
validateSchema(
  "contracts/learning-paths.schema.json",
  learningPaths,
  "learning paths",
);
unique(
  learningPaths.map((path) => path.id),
  "learning paths",
);
for (const path of learningPaths) {
  const seen = new Set();
  for (const id of [
    ...(path.steps ?? []).map((step) => step.moduleId),
    ...(path.optionalModuleIds ?? []),
  ]) {
    const entry = entries.get(id);
    if (!entry) errors.push(`${path.id}: unknown path module ${id}`);
    if (seen.has(id)) errors.push(`${path.id}: duplicate path module ${id}`);
    if (
      entry &&
      !entry.prerequisites.every((prerequisite) => seen.has(prerequisite))
    )
      errors.push(`${path.id}: prerequisites must appear before ${id}`);
    seen.add(id);
  }
}

if (errors.length) {
  errors.forEach((error) => process.stderr.write(`${error}\n`));
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Validated ${catalog.length} catalog entry, ${questionIds.length} questions, ${checkpointIds.length} checkpoints, ${workshopIds.length} workshop stages, 2 API examples, prerequisite DAG, capabilities, and content files.\n`,
  );
}
