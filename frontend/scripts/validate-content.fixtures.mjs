import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workshopPath = "content/case-studies/url-shortener/workshop.json";

function rejectChange(change, expected) {
  const fixture = mkdtempSync(join(tmpdir(), "hld-content-"));
  try {
    for (const directory of ["content", "contracts"])
      cpSync(join(root, directory), join(fixture, directory), {
        recursive: true,
      });
    mkdirSync(join(fixture, "frontend/scripts"), { recursive: true });
    cpSync(
      join(root, "frontend/scripts/validate-content.mjs"),
      join(fixture, "frontend/scripts/validate-content.mjs"),
    );
    symlinkSync(
      join(root, "frontend/node_modules"),
      join(fixture, "frontend/node_modules"),
      "dir",
    );
    const catalog = JSON.parse(
      readFileSync(join(fixture, "content/catalog.json"), "utf8"),
    );
    const workshop = JSON.parse(
      readFileSync(join(fixture, workshopPath), "utf8"),
    );
    change(catalog, workshop);
    writeFileSync(
      join(fixture, "content/catalog.json"),
      JSON.stringify(catalog),
    );
    writeFileSync(join(fixture, workshopPath), JSON.stringify(workshop));
    const result = spawnSync(
      process.execPath,
      [join(fixture, "frontend/scripts/validate-content.mjs")],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, expected);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

test("reject publication before the full design journey exists", () => {
  rejectChange((catalog) => {
    catalog.find((entry) => entry.id === "url-shortener").status = "published";
  }, /published workshop missing stage data/);
});

test("reject mismatched content version", () => {
  rejectChange((_, workshop) => {
    workshop.contentVersion = "2.0.0";
  }, /workshop identity\/version differs/);
});

test("reject unresolved primary source references", () => {
  rejectChange((_, workshop) => {
    workshop.stages[0].sourceIds.push("missing-source");
  }, /unknown source missing-source/);
});

test("reject an unavailable experiment instead of advertising a dead link", () => {
  rejectChange((_, workshop) => {
    workshop.stages[0].experimentLinks[0].topicId = "url-shortener";
  }, /unavailable experiment url-shortener/);
});

test("reject duplicate stage IDs", () => {
  rejectChange((_, workshop) => {
    workshop.stages.push(structuredClone(workshop.stages[0]));
  }, /stages: duplicate requirements/);
});

test("reject derived answer IDs outside storage bounds", () => {
  rejectChange((_, workshop) => {
    workshop.stages[0].rubric[0].id = "a".repeat(100);
  }, /saved activity identity exceeds local answer bounds/);
});

test("reject unsupported workshop fields", () => {
  rejectChange((_, workshop) => {
    workshop.stages[0].simulated = true;
  }, /additional properties/);
});

test("reject cross-case resource paths", () => {
  rejectChange((catalog) => {
    catalog.find((entry) => entry.id === "url-shortener").workshopPath =
      "case-studies/another-case/workshop.json";
  }, /workshopPath must belong to this case study/);
});

test("reject an unresolved source in a later API stage", () => {
  rejectChange((_, workshop) => {
    workshop.stages
      .find((stage) => stage.id === "api")
      .sourceIds.push("missing-api-source");
  }, /unknown source missing-api-source/);
});

test("reject estimates linked to a draft case instead of a working estimator", () => {
  rejectChange((_, workshop) => {
    workshop.stages.find(
      (stage) => stage.id === "estimates",
    ).experimentLinks[0].topicId = "url-shortener";
  }, /unavailable experiment url-shortener/);
});
