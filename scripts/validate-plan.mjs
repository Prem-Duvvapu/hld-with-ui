import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const errors = [];
const read = (relative) => readFileSync(join(root, relative), 'utf8');

function markdownFiles(directory) {
  if (!existsSync(join(root, directory))) return [];
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(relative);
    return entry.name.endsWith('.md') ? [relative] : [];
  });
}

function headingAnchors(markdown) {
  const anchors = new Set();
  const duplicates = new Map();
  for (const match of markdown.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const heading = match[1]
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_~]/g, '')
      .replace(/[^\p{L}\p{N}_ -]/gu, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
    const suffix = duplicates.get(heading) ?? 0;
    anchors.add(suffix ? heading + '-' + suffix : heading);
    duplicates.set(heading, suffix + 1);
  }
  return anchors;
}

const docs = ['README.md', 'AGENTS.md', ...markdownFiles('docs'), ...markdownFiles('content')];
let localLinkCount = 0;
for (const source of docs) {
  for (const link of read(source).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const url = link[1];
    if (/^(https?:|mailto:)/.test(url)) continue;
    localLinkCount++;
    const [target, anchor] = url.split('#', 2);
    const destination = target ? resolve(root, dirname(source), target) : join(root, source);
    if (!existsSync(destination)) {
      errors.push(source + ': missing link target ' + url);
      continue;
    }
    if (anchor && !headingAnchors(readFileSync(destination, 'utf8')).has(anchor)) {
      errors.push(source + ': missing heading anchor ' + url);
    }
  }
}

const tick = String.fromCharCode(96);
const dependencyPattern = new RegExp(tick + '([^' + tick + ']+)' + tick, 'g');
const topics = new Map();
// Section 7 of the curriculum lists case studies; earlier sections list concepts.
const curriculumKind = new Map();
let section = 'topic';
for (const line of read('docs/CURRICULUM.md').split('\n')) {
  if (/^## /.test(line)) section = /case-study/i.test(line) ? 'case-study' : 'topic';
  const columns = line.split('|').map((column) => column.trim());
  if (columns.length < 6 || !columns[1]?.startsWith(tick) || !/^R[1-4]$/.test(columns.at(-2))) continue;
  const id = columns[1].slice(1, -1);
  if (topics.has(id)) errors.push('Duplicate curriculum ID: ' + id);
  topics.set(id, [...columns[2].matchAll(dependencyPattern)].map((match) => match[1]));
  curriculumKind.set(id, section);
}
if (topics.size === 0) errors.push('Curriculum has no entries');
for (const [id, dependencies] of topics) {
  for (const dependency of dependencies) {
    if (!topics.has(dependency)) errors.push(id + ': unknown prerequisite ' + dependency);
  }
}
const visited = new Set();
const active = new Set();
function visit(id) {
  if (active.has(id)) {
    errors.push('Prerequisite cycle at ' + id);
    return;
  }
  if (visited.has(id)) return;
  active.add(id);
  for (const dependency of topics.get(id) ?? []) {
    if (topics.has(dependency)) visit(dependency);
  }
  active.delete(id);
  visited.add(id);
}
for (const id of topics.keys()) visit(id);

// The catalog publishes curriculum modules; the two must agree on identity and kind.
const catalogPath = 'content/catalog.json';
let catalogCount = 0;
if (existsSync(join(root, catalogPath))) {
  const catalog = JSON.parse(read(catalogPath));
  catalogCount = catalog.length;
  for (const entry of catalog) {
    if (!topics.has(entry.id)) {
      errors.push(catalogPath + ': ' + entry.id + ' is not a curriculum ID');
      continue;
    }
    if (curriculumKind.get(entry.id) !== entry.kind) {
      errors.push(catalogPath + ': ' + entry.id + ' is a ' + entry.kind +
        ' in the catalog but a ' + curriculumKind.get(entry.id) + ' in the curriculum');
    }
    for (const prerequisite of entry.prerequisites ?? []) {
      if (!topics.get(entry.id).includes(prerequisite)) {
        errors.push(catalogPath + ': ' + entry.id + ' requires ' + prerequisite +
          ', which its curriculum row does not list');
      }
    }
  }
}

const frontendExists = existsSync(join(root, 'frontend/package.json'));
const backendExists = existsSync(join(root, 'backend/pom.xml'));
if (frontendExists !== backendExists) errors.push('Frontend and backend must be bootstrapped together');
const planningLabel = read('README.md').includes('Status: planning foundation.');
if (frontendExists && planningLabel) errors.push('README still claims planning-only status after bootstrap');
if (!frontendExists && !planningLabel) errors.push('README must describe the current planning-only status');

if (errors.length) {
  for (const error of errors) process.stderr.write(error + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write('Validated ' + docs.length + ' docs, ' + localLinkCount +
    ' local links, ' + topics.size + ' curriculum IDs, and ' + catalogCount + ' catalog identities.\n');
}
