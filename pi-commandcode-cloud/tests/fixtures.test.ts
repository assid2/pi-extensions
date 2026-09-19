/**
 * Fixture provenance tests (plan §8 hardening: "mark synthetic vs captured and
 * include raw status/body provenance").
 *
 * Asserts that every JSON fixture is described by `provenance.json`, that each
 * entry records its kind (captured/synthetic), HTTP method/status and source,
 * and that the fixture directory contains no undocumented payloads.
 */

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import { FIXTURES_DIR, loadFixture } from "./helpers.ts";

interface ProvenanceEntry {
  file: string;
  kind: "captured" | "synthetic";
  method: string;
  url: string;
  status: number;
  source: string;
  redactions?: string;
}

interface Provenance {
  fixtures: ProvenanceEntry[];
}

const EXPECTED = [
  "models.json",
  "whoami.json",
  "credits.json",
  "subscriptions.json",
  "summary.json",
  "unauthorized.json",
  "credits-provider-plan.json",
];

test("provenance.json documents every required fixture with kind/method/status/source", () => {
  const provenance = loadFixture<Provenance>("provenance.json");
  const byFile = new Map(provenance.fixtures.map((entry) => [entry.file, entry]));

  for (const file of EXPECTED) {
    const entry = byFile.get(file);
    assert.ok(entry, `provenance missing ${file}`);
    assert.ok(entry?.kind === "captured" || entry?.kind === "synthetic", `${file} kind`);
    assert.match(entry?.method ?? "", /^GET$/);
    assert.match(entry?.url ?? "", /^https:\/\/api\.commandcode\.ai\//);
    assert.ok(typeof entry?.status === "number" && entry.status >= 200, `${file} status`);
    assert.ok((entry?.source ?? "").length > 0, `${file} source`);
  }

  // The captured/synthetic split is explicit, not accidental.
  assert.equal(byFile.get("models.json")?.kind, "captured");
  assert.equal(byFile.get("whoami.json")?.kind, "synthetic");
  assert.equal(byFile.get("unauthorized.json")?.status, 401);
});

test("the fixtures directory contains no undocumented JSON payloads", () => {
  const provenance = loadFixture<Provenance>("provenance.json");
  const documented = new Set(provenance.fixtures.map((entry) => entry.file));
  documented.add("provenance.json"); // the manifest itself

  const jsonFiles = readdirSync(FIXTURES_DIR).filter((name) => name.endsWith(".json"));
  const undocumented = jsonFiles.filter((name) => !documented.has(name));
  assert.deepEqual(undocumented, [], `undocumented fixtures: ${undocumented.join(", ")}`);
  assert.equal(jsonFiles.length, EXPECTED.length + 1);
});

test("fixtures contain no real API key", () => {
  const raw = EXPECTED.map((file) => JSON.stringify(loadFixture(file))).join("\n");
  // Only the redacted/synthetic sentinels may appear; no `user_` key material.
  assert.ok(!/user_(?!Redacted)[A-Za-z0-9_-]{6,}/.test(raw), "a real-looking user_ key leaked into a fixture");
  assert.ok(!/Bearer\s+[A-Za-z0-9._~+/=-]+/.test(raw), "a Bearer token leaked into a fixture");
});

test("models.json is a valid captured catalog envelope with slash ids", () => {
  const models = loadFixture<{ object: string; data: Array<{ id: string; supported_endpoints?: string[] }> }>(
    "models.json",
  );
  assert.equal(models.object, "list");
  assert.ok(models.data.length > 0);
  assert.ok(models.data.some((model) => model.id.includes("/")));
  assert.ok(models.data.some((model) => model.supported_endpoints?.join(",") === "/messages"));
});
