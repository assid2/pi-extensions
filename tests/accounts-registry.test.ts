import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AccountRegistry,
  buildAccounts,
  registerAliasProviders,
  resolveCredential,
} from "../extensions/usage/accounts/registry.ts";
import type { UsageConfig } from "../extensions/usage/config.ts";

interface FakeProvider {
  id: string;
  name: string;
  baseUrl?: string;
  headers?: Record<string, string | null>;
  getModels(): unknown[];
}

function makeCtx(providers: FakeProvider[], auth: Record<string, { configured: boolean; apiKey?: string; headers?: Record<string, string>; source?: string }>) {
  const registered: Array<{ name: string; config: unknown }> = [];
  return {
    modelRegistry: {
      getProvider: (id: string) => providers.find((p) => p.id === id),
      getProviderDisplayName: (id: string) => providers.find((p) => p.id === id)?.name ?? id,
      getProviderAuthStatus: (id: string) => ({ configured: auth[id]?.configured ?? false, label: auth[id]?.source }),
      getProviderAuth: async (id: string) => {
        const a = auth[id];
        if (!a) return undefined;
        return { auth: { apiKey: a.apiKey, headers: a.headers }, source: a.source };
      },
      registerProvider: (name: string, config: unknown) => {
        registered.push({ name, config });
      },
    },
    registered,
  };
}

const config: UsageConfig = {
  accounts: [
    { provider: "ollama-cloud", name: "work" },
    { provider: "ollama-cloud", name: "personal", alias: "ollama-cloud-personal", env: "OLLAMA_CLOUD_KEY_2" },
    { provider: "opencode-go", name: "go" },
  ],
  adapters: {},
  rollupWindow: "1d",
  pollIntervalMs: 120000,
};

test("buildAccounts: default + alias accounts", () => {
  const ctx = makeCtx([{ id: "ollama-cloud", name: "Ollama Cloud", getModels: () => [] }], {}) as never;
  const warnings: string[] = [];
  const registry = buildAccounts(ctx, config, warnings);
  assert.equal(registry.accounts.length, 3);
  const alias = registry.get("ollama-cloud-personal")!;
  assert.equal(alias.isAlias, true);
  assert.equal(alias.base, "ollama-cloud");
  assert.equal(alias.name, "personal");
  const work = registry.get("ollama-cloud")!;
  assert.equal(work.isAlias, false);
  assert.equal(work.name, "work");
});

test("registerAliasProviders: clones base provider shape for the alias", () => {
  const providers: FakeProvider[] = [
    {
      id: "ollama-cloud",
      name: "Ollama Cloud",
      baseUrl: "https://ollama.com/v1",
      getModels: () => [{ id: "qwen3.5:397b", name: "Qwen3.5 397B", api: "openai-completions", reasoning: false, input: ["text"], cost: {}, contextWindow: 262144, maxTokens: 32768 }],
    },
  ];
  const ctx = makeCtx(providers, {}) as never;
  const warnings: string[] = [];
  const registry = buildAccounts(ctx, config, warnings);
  registerAliasProviders(ctx, registry, config, warnings);

  const calls = (ctx as unknown as { registered: Array<{ name: string; config: Record<string, unknown> }> }).registered;
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.name, "ollama-cloud-personal");
  assert.equal(call.config.name, "Ollama Cloud (personal)");
  assert.equal(call.config.baseUrl, "https://ollama.com/v1");
  assert.equal(call.config.apiKey, "$OLLAMA_CLOUD_KEY_2");
  assert.equal(call.config.authHeader, true);
  assert.ok(Array.isArray(call.config.models));
  assert.equal((call.config.models as unknown[]).length, 1);
});

test("registerAliasProviders: skips when the alias already exists or base is missing", () => {
  const providers: FakeProvider[] = [{ id: "ollama-cloud", name: "Ollama Cloud", getModels: () => [] }];
  const ctx = makeCtx(providers, {}) as never;
  const warnings: string[] = [];
  const registry = buildAccounts(ctx, config, warnings);
  // Pre-register the alias id.
  (ctx as unknown as { modelRegistry: { getProvider: (id: string) => FakeProvider | undefined } }).modelRegistry.getProvider = (id: string) =>
    id === "ollama-cloud-personal" ? { id: "ollama-cloud-personal", name: "existing", getModels: () => [] } : providers.find((p) => p.id === id);
  registerAliasProviders(ctx, registry, config, warnings);
  assert.equal((ctx as unknown as { registered: unknown[] }).registered.length, 0);
  assert.ok(warnings.some((w) => w.includes("already exists")));

  // Missing base provider.
  const ctx2 = makeCtx([], {}) as never;
  const warnings2: string[] = [];
  const registry2 = buildAccounts(ctx2, config, warnings2);
  registerAliasProviders(ctx2, registry2, config, warnings2);
  assert.ok(warnings2.some((w) => w.includes("base provider")));
});

test("resolveCredential: auth.json-first resolution and Bearer fallback", async () => {
  const providers: FakeProvider[] = [{ id: "ollama-cloud", name: "Ollama Cloud", getModels: () => [] }];
  const ctx = makeCtx(providers, {
    "ollama-cloud": { configured: true, apiKey: "oll-key-1", source: "OLLAMA_API_KEY" },
  }) as never;
  const registry = new AccountRegistry([{ id: "ollama-cloud", name: "Ollama Cloud", base: "ollama-cloud", isAlias: false }]);
  const cred = await resolveCredential(ctx, registry.get("ollama-cloud")!);
  assert.equal(cred.configured, true);
  assert.equal(cred.token, "oll-key-1");
  assert.equal(cred.source, "OLLAMA_API_KEY");

  // Unconfigured.
  const ctx2 = makeCtx(providers, {}) as never;
  const cred2 = await resolveCredential(ctx2, registry.get("ollama-cloud")!);
  assert.equal(cred2.configured, false);

  // Bearer header fallback (OAuth-style).
  const ctx3 = makeCtx(providers, {
    "ollama-cloud": { configured: true, headers: { Authorization: "Bearer oauth-tok" }, source: "OAuth" },
  }) as never;
  const cred3 = await resolveCredential(ctx3, registry.get("ollama-cloud")!);
  assert.equal(cred3.token, "oauth-tok");
});

test("accountForProvider: implicit default for unknown providers", () => {
  const registry = new AccountRegistry([]);
  const account = registry.accountForProvider("vllm", "vLLM (local)");
  assert.equal(account.id, "vllm");
  assert.equal(account.name, "vLLM (local)");
  assert.equal(account.isAlias, false);
  assert.equal(registry.get("vllm"), account);
});
