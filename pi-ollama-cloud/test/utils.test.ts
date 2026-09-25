import type { ExtensionContext, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCloudApiKey, httpError, isOllamaProviderId } from "../utils.ts";

// --- Helpers ---

/**
 * Build a fake ExtensionContext whose modelRegistry.getApiKeyForProvider
 * returns the given key.
 */
function fakeCtx(storedKey: string | undefined): Pick<ExtensionContext, "modelRegistry"> {
  return {
    modelRegistry: {
      getApiKeyForProvider: async (_provider: string) => storedKey,
    } as unknown as ModelRegistry,
  };
}

/**
 * Build a fake ExtensionContext with a per-provider key map and an active model.
 */
function fakeProviderCtx(
  keys: Record<string, string | undefined>,
  activeProvider: string | undefined,
): Pick<ExtensionContext, "modelRegistry"> & { model?: ExtensionContext["model"] } {
  return {
    modelRegistry: {
      getApiKeyForProvider: async (provider: string) => keys[provider],
    } as unknown as ModelRegistry,
    model: activeProvider ? ({ provider: activeProvider } as unknown as ExtensionContext["model"]) : undefined,
  };
}

// ============================================================================
// isOllamaProviderId
// ============================================================================

describe("isOllamaProviderId", () => {
  it("matches every ollama-* id", () => {
    expect(isOllamaProviderId("ollama-cloud")).toBe(true);
    expect(isOllamaProviderId("ollama-assid2")).toBe(true);
    expect(isOllamaProviderId("ollama-work")).toBe(true);
  });

  it("rejects non-ollama, bare, and missing ids", () => {
    expect(isOllamaProviderId("vllm")).toBe(false);
    expect(isOllamaProviderId("ollama")).toBe(false);
    expect(isOllamaProviderId("ollama_cloud")).toBe(false);
    expect(isOllamaProviderId("Ollama-cloud")).toBe(false);
    expect(isOllamaProviderId("")).toBe(false);
    expect(isOllamaProviderId(undefined)).toBe(false);
  });
});

// ============================================================================
// getCloudApiKey
// ============================================================================

describe("getCloudApiKey", () => {
  const originalEnv = process.env.OLLAMA_API_KEY;

  beforeEach(() => {
    delete process.env.OLLAMA_API_KEY;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.OLLAMA_API_KEY;
    else process.env.OLLAMA_API_KEY = originalEnv;
  });

  it("returns the stored key when getApiKeyForProvider resolves one", async () => {
    const apiKey = await getCloudApiKey(fakeCtx("stored-key"));
    expect(apiKey).toBe("stored-key");
  });

  it("falls back to OLLAMA_API_KEY env var when no stored key is resolved (#24 regression)", async () => {
    process.env.OLLAMA_API_KEY = "env-key";
    const apiKey = await getCloudApiKey(fakeCtx(undefined));
    expect(apiKey).toBe("env-key");
  });

  it("returns undefined when neither a stored key nor the env var is set", async () => {
    const apiKey = await getCloudApiKey(fakeCtx(undefined));
    expect(apiKey).toBeUndefined();
  });

  it("prefers the stored key over the OLLAMA_API_KEY env var", async () => {
    process.env.OLLAMA_API_KEY = "env-key";
    const apiKey = await getCloudApiKey(fakeCtx("stored-key"));
    expect(apiKey).toBe("stored-key");
  });

  // --- ollama-* namespace: the active member's key wins, never a different account ---

  it("resolves the active ollama-* member's own key", async () => {
    const ctx = fakeProviderCtx({ "ollama-assid2": "assid2-key", "ollama-cloud": "primary-key" }, "ollama-assid2");
    expect(await getCloudApiKey(ctx)).toBe("assid2-key");
  });

  it("does not fall back to the primary key or OLLAMA_API_KEY when the active member has no key", async () => {
    process.env.OLLAMA_API_KEY = "env-key";
    const ctx = fakeProviderCtx({ "ollama-cloud": "primary-key" }, "ollama-assid2");
    expect(await getCloudApiKey(ctx)).toBeUndefined();
  });

  it("keeps the #24 env fallback for the canonical ollama-cloud provider", async () => {
    process.env.OLLAMA_API_KEY = "env-key";
    const ctx = fakeProviderCtx({}, "ollama-cloud");
    expect(await getCloudApiKey(ctx)).toBe("env-key");
  });

  it("uses the primary (with env fallback) when a non-ollama provider is active", async () => {
    process.env.OLLAMA_API_KEY = "env-key";
    const ctx = fakeProviderCtx({}, "anthropic");
    expect(await getCloudApiKey(ctx)).toBe("env-key");
  });
});

// ============================================================================
// httpError
// ============================================================================

describe("httpError", () => {
  it("throws an auth error on 401", () => {
    expect(() => httpError("usage", 401)).toThrow(/authentication error/);
  });

  it("throws an auth error on 403", () => {
    expect(() => httpError("usage", 403)).toThrow(/authentication error/);
  });

  it("throws a rate-limit error on 429", () => {
    expect(() => httpError("usage", 429)).toThrow(/rate limited/);
  });

  it("throws a server error on 5xx", () => {
    expect(() => httpError("usage", 500)).toThrow(/server error/);
  });

  it("throws an unexpected-response error on other statuses", () => {
    expect(() => httpError("usage", 400)).toThrow(/unexpected response/);
  });

  it("includes the operation name in the message", () => {
    expect(() => httpError("search", 500)).toThrow(/search failed/);
  });

  it("includes the server error body when present", () => {
    expect(() => httpError("usage", 400, "bad request")).toThrow(/bad request/);
  });
});
