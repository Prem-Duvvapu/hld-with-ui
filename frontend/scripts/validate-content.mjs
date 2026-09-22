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

const knownSimulationIds = new Set(
  [
    openapi.components?.schemas?.SimulationDescriptor?.properties?.id?.const,
  ].filter(Boolean),
);
const knownEstimatorIds = new Set(
  [
    openapi.components?.schemas?.CapacityEstimatorDescriptor?.properties?.id
      ?.const,
  ].filter(Boolean),
);
const questionIds = [];

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

for (const entry of catalog.filter((item) => item.status !== "planned")) {
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
}

unique(questionIds, "questions");

if (errors.length) {
  errors.forEach((error) => process.stderr.write(`${error}\n`));
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Validated ${catalog.length} catalog entry, ${questionIds.length} questions, 2 API examples, prerequisite DAG, capabilities, and content files.\n`,
  );
}
