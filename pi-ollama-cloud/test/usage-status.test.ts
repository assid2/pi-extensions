import { describe, expect, it } from "vitest";
import { isOllamaCloud, resolveUsageStatusToggle } from "../index.ts";

describe("isOllamaCloud", () => {
  const ctx = (provider?: string) => ({ model: provider ? { provider } : undefined }) as never;

  it("accepts every ollama-* provider so the status bar follows the active member", () => {
    expect(isOllamaCloud(ctx("ollama-cloud"))).toBe(true);
    expect(isOllamaCloud(ctx("ollama-assid2"))).toBe(true);
    expect(isOllamaCloud(ctx("ollama-work"))).toBe(true);
  });

  it("rejects other providers and a missing model", () => {
    expect(isOllamaCloud(ctx("anthropic"))).toBe(false);
    expect(isOllamaCloud(ctx())).toBe(false);
  });
});

describe("resolveUsageStatusToggle", () => {
  it("enables on 'on' and 'enable'", () => {
    expect(resolveUsageStatusToggle("on", false)).toEqual({ enabled: true });
    expect(resolveUsageStatusToggle("enable", false)).toEqual({ enabled: true });
  });

  it("disables on 'off' and 'disable'", () => {
    expect(resolveUsageStatusToggle("off", true)).toEqual({ enabled: false });
    expect(resolveUsageStatusToggle("disable", true)).toEqual({ enabled: false });
  });

  it("toggles with no argument", () => {
    expect(resolveUsageStatusToggle("", true)).toEqual({ enabled: false });
    expect(resolveUsageStatusToggle("", false)).toEqual({ enabled: true });
  });

  it("is case-insensitive and trims surrounding whitespace", () => {
    expect(resolveUsageStatusToggle("  ON  ", false)).toEqual({ enabled: true });
  });

  it("returns an error for unknown arguments, keeping the current state", () => {
    const result = resolveUsageStatusToggle("bogus", true);
    expect(result.enabled).toBe(true);
    expect(result.error).toContain("Unknown argument");
  });
});
