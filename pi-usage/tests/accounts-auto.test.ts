import { test } from "node:test";
import assert from "node:assert/strict";
import { AccountRegistry } from "../extensions/usage/accounts/registry.ts";
import { addSpecializedAccounts } from "../extensions/usage/accounts/auto.ts";
import { DEFAULT_CONFIG } from "../extensions/usage/config.ts";

test("auto accounts: specialized providers are tracked, generic ones are not", () => {
  const registry = new AccountRegistry([]);
  const added = addSpecializedAccounts(
    registry,
    ["ollama-cloud", "ollama-assid2", "commandcode-cloud", "vllm", "qwen-token-plan", "opencode-go"],
    DEFAULT_CONFIG,
    (id) => `Name ${id}`,
  );
  assert.deepEqual(
    [...added].sort(),
    ["commandcode-cloud", "ollama-assid2", "ollama-cloud", "opencode-go"].sort(),
  );
  assert.equal(registry.get("ollama-assid2")?.name, "Name ollama-assid2");
  assert.equal(registry.get("vllm"), undefined);
  assert.equal(registry.get("qwen-token-plan"), undefined);
});

test("auto accounts: existing accounts are neither replaced nor duplicated", () => {
  const registry = new AccountRegistry([
    { id: "ollama-cloud", name: "existing", base: "ollama-cloud", isAlias: false },
  ]);
  const added = addSpecializedAccounts(registry, ["ollama-cloud"], DEFAULT_CONFIG, (id) => id);
  assert.deepEqual(added, []);
  assert.equal(registry.get("ollama-cloud")?.name, "existing");
  assert.equal(registry.accounts.length, 1);
});

test("auto accounts: an explicit usage.json adapter attaches a generic provider", () => {
  const registry = new AccountRegistry([]);
  const config = { ...DEFAULT_CONFIG, adapters: { vllm: { usageEndpoint: "http://localhost/usage" } } };
  const added = addSpecializedAccounts(registry, ["vllm"], config, (id) => id);
  assert.deepEqual(added, ["vllm"]);
});
