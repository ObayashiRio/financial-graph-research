import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { neighborhood, normalizeDataset, validateDataset } from "../src/data.js";

const datasetPath = new URL("../public/data/demo-graphs.json", import.meta.url);
const dataset = JSON.parse(await readFile(datasetPath, "utf8"));

test("demo dataset satisfies the public schema", () => {
  assert.deepEqual(validateDataset(dataset), []);
  assert.equal(dataset.nodes.length, 24);
  assert.equal(dataset.families.length, 4);
});

test("normalization adds stable edge ids and search text", () => {
  const normalized = normalizeDataset(dataset);
  assert.match(normalized.nodes[0].searchText, /d001/);
  assert.equal(normalized.families[0].edges[0].id, "policy_holdings-1");
});

test("one-hop neighborhood includes both incoming and outgoing neighbors", () => {
  const normalized = normalizeDataset(dataset);
  const edges = normalized.families.find((family) => family.key === "policy_holdings").edges;
  const visible = neighborhood(edges, "D001", 1);
  assert.ok(visible.has("D001"));
  assert.ok(visible.has("D004"));
  assert.ok(visible.has("D016"));
  assert.ok(!visible.has("D012"));
});

test("validator rejects unknown endpoints and invalid weights", () => {
  const broken = structuredClone(dataset);
  broken.families[0].edges[0].target = "MISSING";
  broken.families[0].edges[1].weight = 2;
  const errors = validateDataset(broken);
  assert.ok(errors.some((error) => error.includes("unknown target")));
  assert.ok(errors.some((error) => error.includes("between 0 and 1")));
});
