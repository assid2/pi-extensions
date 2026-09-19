/**
 * Model catalog + routing tests (plan §8 `models.test.ts`).
 *
 * Pins: the OpenAI/Anthropic split (`claude` → `anthropic-messages` + a
 * `/v1`-less base URL), catalog envelope accept/reject, static metadata merge
 * for known and unknown (slash-containing) ids, and the `maxTokens` clamp.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { ZERO_COST } from "../catalog.metadata.ts";
import { ANTHROPIC_BASE, DEFAULT_MAX_OUTPUT_TOKENS, PROVIDER_API_BASE } from "../constants.ts";
import {
  apiForModel,
  assembleModelDetails,
  assembleModels,
  baseUrlForModel,
  buildCompat,
  commandCodeModelsUrl,
  isAnthropicEndpoints,
  parseCommandCodeCatalog,
  parseCommandCodeCatalogDetailed,
} from "../models.ts";
import { loadFixture } from "./helpers.ts";

function partialModel(overrides: Record<string, unknown>): ProviderModelConfig {
  return overrides as unknown as ProviderModelConfig;
}

// --- Routing split ---

test("anthropic split: exactly [/messages] routes to anthropic-messages + /v1-less base", () => {
  assert.equal(isAnthropicEndpoints(["/messages"]), true);
  assert.equal(isAnthropicEndpoints(["/messages", "/chat/completions"]), false);
  assert.equal(isAnthropicEndpoints([]), false);
  assert.equal(isAnthropicEndpoints(undefined), false);

  assert.equal(apiForModel("claude-sonnet-5", ["/messages"]), "anthropic-messages");
  assert.equal(baseUrlForModel("claude-sonnet-5", ["/messages"]), ANTHROPIC_BASE);
  assert.equal(ANTHROPIC_BASE, "https://api.commandcode.ai/provider");
  assert.ok(!ANTHROPIC_BASE.endsWith("/v1"), "Anthropic base must not end in /v1 (pi appends /v1/messages)");
});

test("openai split: any other endpoint list routes to openai-completions", () => {
  const slashId = "deepseek/deepseek-v4.1-flash";
  assert.equal(apiForModel(slashId, ["/chat/completions", "/responses"]), "openai-completions");
  assert.equal(baseUrlForModel(slashId, ["/chat/completions", "/responses"]), PROVIDER_API_BASE);
  assert.equal(baseUrlForModel(slashId, ["/chat/completions"]), PROVIDER_API_BASE);
  assert.equal(apiForModel("some-model", ["/messages", "/responses"]), "openai-completions");
});

test("claude- prefix fallback applies only when supported_endpoints is absent/empty", () => {
  assert.equal(apiForModel("claude-legacy-model"), "anthropic-messages");
  assert.equal(apiForModel("claude-legacy-model", []), "anthropic-messages");
  assert.equal(apiForModel("claude-sonnet-5", ["/chat/completions"]), "openai-completions");
  assert.equal(apiForModel("deepseek/deepseek-v4.1-flash"), "openai-completions");
});

// --- Catalog parsing ---

test("parseCommandCodeCatalog: accepts the captured {object:list,data} envelope incl. slash ids", () => {
  const models = parseCommandCodeCatalog(loadFixture("models.json"));
  assert.equal(models.length, 8);

  const slashIds = models.filter((model) => model.id.includes("/")).map((model) => model.id);
  assert.deepEqual(slashIds.sort(), [
    "MiniMaxAI/MiniMax-M2.5",
    "Qwen/Qwen3.8-27B",
    "deepseek/deepseek-v4.1-flash",
    "xai/grok-4.6",
    "zai-org/GLM-5.3",
  ]);

  const claude = models.find((model) => model.id === "claude-sonnet-5");
  assert.ok(claude);
  assert.deepEqual(claude.supported_endpoints, ["/messages"]);
  assert.equal(claude.context_length, 1_000_000);
  assert.equal(claude.name, "Claude Sonnet 5");
});

test("parseCommandCodeCatalog: rejects non-list, empty, non-object and id-less payloads", () => {
  assert.throws(() => parseCommandCodeCatalog({ object: "model", data: [{ id: "x" }] }), /expected "list"/);
  assert.throws(() => parseCommandCodeCatalog({ object: "list", data: [] }), /empty data list/);
  assert.throws(() => parseCommandCodeCatalog({ object: "list", data: "nope" }), /empty data list/);
  assert.throws(() => parseCommandCodeCatalog([]), /malformed response/);
  assert.throws(() => parseCommandCodeCatalog(null), /malformed response/);
  assert.throws(
    () => parseCommandCodeCatalog({ object: "list", data: [{ id: "  " }, 42, null] }),
    /no entries with a valid id/,
  );
});

test("parseCommandCodeCatalogDetailed: counts unusable entries and keeps valid slash ids", () => {
  const { models, skipped } = parseCommandCodeCatalogDetailed({
    object: "list",
    data: [{ id: "vendor/some-model" }, { id: "" }, null, "x", { id: "   " }, { name: "no-id" }],
  });
  assert.equal(models.length, 1);
  assert.equal(models[0]?.id, "vendor/some-model");
  assert.equal(skipped, 5);
});

// --- Metadata merge ---

test("assembleModels: merges static metadata for a known slash-containing id", () => {
  const [qwen] = assembleModels([
    {
      id: "Qwen/Qwen3.8-27B",
      name: "Qwen 3.8 27B",
      context_length: 262_144,
      supported_endpoints: ["/chat/completions", "/responses"],
    },
  ]);
  assert.ok(qwen);
  assert.equal(qwen.id, "Qwen/Qwen3.8-27B");
  assert.equal(qwen.reasoning, true);
  assert.deepEqual(qwen.input, ["text", "image"]);
  assert.equal(qwen.cost.input, 0.4);
  assert.equal(qwen.cost.output, 3);
  assert.equal(qwen.contextWindow, 262_144);
  assert.equal(qwen.maxTokens, DEFAULT_MAX_OUTPUT_TOKENS);
  // thinkingLevelMap is built from the metadata effort list (low/medium/xhigh).
  assert.equal(qwen.thinkingLevelMap?.low, "low");
  assert.equal(qwen.thinkingLevelMap?.medium, "medium");
  assert.equal(qwen.thinkingLevelMap?.xhigh, "xhigh");
  assert.equal(qwen.thinkingLevelMap?.minimal, null);
});

test("assembleModels: unknown ids degrade to text-only, zero-cost, clamped maxTokens", () => {
  const [model] = assembleModels([
    { id: "vendor/unknown-model-9000", context_length: 12_345, supported_endpoints: ["/chat/completions"] },
  ]);
  assert.ok(model);
  assert.equal(model.id, "vendor/unknown-model-9000");
  assert.equal(model.name, "vendor/unknown-model-9000");
  assert.equal(model.reasoning, false);
  assert.deepEqual(model.input, ["text"]);
  assert.deepEqual(model.cost, ZERO_COST);
  assert.equal(model.contextWindow, 12_345);
  assert.equal(model.maxTokens, 12_345);
  assert.equal(model.thinkingLevelMap, undefined);
});

test("assembleModels: maxTokens is min(context_length, metadata.maxOutputTokens ?? 65536)", () => {
  const [big] = assembleModels([
    { id: "claude-sonnet-5", context_length: 1_000_000, supported_endpoints: ["/messages"] },
  ]);
  assert.equal(big?.maxTokens, DEFAULT_MAX_OUTPUT_TOKENS);

  const [small] = assembleModels([
    { id: "claude-sonnet-5", context_length: 8_000, supported_endpoints: ["/messages"] },
  ]);
  assert.equal(small?.maxTokens, 8_000);

  const [missingContext] = assembleModels([{ id: "vendor/unknown-model-9000" }]);
  assert.equal(missingContext?.contextWindow, DEFAULT_MAX_OUTPUT_TOKENS);
  assert.equal(missingContext?.maxTokens, DEFAULT_MAX_OUTPUT_TOKENS);

  const [nameFallsBack] = assembleModels([{ id: "vendor/unknown-model-9000", name: "  " }]);
  assert.equal(nameFallsBack?.name, "vendor/unknown-model-9000");
});

test("assembleModels: claude models carry the anthropic api/baseUrl and adaptive thinking", () => {
  const [claude] = assembleModels([
    { id: "claude-sonnet-5", context_length: 1_000_000, supported_endpoints: ["/messages"] },
  ]);
  assert.ok(claude);
  assert.equal(claude.api, "anthropic-messages");
  assert.equal(claude.baseUrl, ANTHROPIC_BASE);
  assert.equal((claude.compat as unknown as Record<string, unknown> | undefined)?.forceAdaptiveThinking, true);

  const [openai] = assembleModels([
    { id: "deepseek/deepseek-v4.1-flash", context_length: 1_000_000, supported_endpoints: ["/chat/completions"] },
  ]);
  assert.equal(openai?.api, "openai-completions");
  assert.equal(openai?.baseUrl, PROVIDER_API_BASE);
});

test("assembleModelDetails: reports entries skipped for a blank id", () => {
  const { models, failed } = assembleModelDetails([{ id: "ok/model" }, { id: "   " }]);
  assert.equal(models.length, 1);
  assert.equal(failed, 1);
});

// --- compat ---

test("buildCompat: every load-bearing flag is explicit and routing objects stay undefined", () => {
  const meta = { reasoning: true, efforts: ["high"], input: ["text"] as const, maxOutputTokens: 1, cost: ZERO_COST };
  const compat = buildCompat({ ...meta, input: [...meta.input] }, "openai-completions") as unknown as Record<
    string,
    unknown
  >;
  assert.ok(compat);
  assert.equal(compat.supportsStore, false);
  assert.equal(compat.supportsDeveloperRole, false);
  assert.equal(compat.maxTokensField, "max_tokens");
  assert.equal(compat.supportsReasoningEffort, true);
  assert.equal(compat.thinkingFormat, "openai");
  assert.equal(compat.requiresThinkingAsText, false);
  assert.equal(compat.supportsStrictMode, false);
  assert.equal(compat.supportsUsageInStreaming, true);
  assert.equal(compat.openRouterRouting, undefined);
  assert.equal(compat.vercelGatewayRouting, undefined);

  const nonReasoning = buildCompat({
    reasoning: false,
    input: ["text"],
    maxOutputTokens: 1,
    cost: ZERO_COST,
  }) as unknown as Record<string, unknown>;
  assert.equal(nonReasoning.supportsReasoningEffort, false);
});

// --- URL ---

test("commandCodeModelsUrl: defaults to /provider/v1/models and honors the env override", () => {
  assert.equal(commandCodeModelsUrl({}), `${PROVIDER_API_BASE}/models`);
  assert.equal(
    commandCodeModelsUrl({ COMMANDCODE_MODELS_URL: " https://example.test/models " }),
    "https://example.test/models",
  );
});

// Keep the type surface honest: a fully assembled model satisfies ProviderModelConfig.
test("assembleModels: output is a ProviderModelConfig[]", () => {
  const models: ProviderModelConfig[] = assembleModels(parseCommandCodeCatalog(loadFixture("models.json")));
  assert.equal(models.length, 8);
  for (const model of models) {
    assert.equal(typeof model.id, "string");
    assert.equal(typeof model.contextWindow, "number");
    assert.equal(typeof model.maxTokens, "number");
  }
  // partialModel helper exists so rehydrate/refresh tests can build minimal inputs.
  assert.equal(typeof partialModel({ id: "x" }).id, "string");
});
