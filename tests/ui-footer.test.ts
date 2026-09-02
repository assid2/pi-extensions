import { test } from "node:test";
import assert from "node:assert/strict";
import { renderFooterStatus } from "../extensions/usage/ui/footer.ts";
import type { ColorFn } from "../extensions/usage/format.ts";

const noop: ColorFn = (_c, t) => t;

test("footer: quota lanes + reset + agent count", () => {
  const line = renderFooterStatus({
    account: { id: "opencode-go", name: "OpenCode Go", base: "opencode-go", isAlias: false },
    usage: {
      lanes: [
        { label: "5h", percent: 25, resetsAt: "2026-09-02T12:00:00.000Z" },
        { label: "Weekly", percent: 20 },
      ],
    },
    liveAgents: 3,
    fg: noop,
    nowMs: Date.parse("2026-09-02T10:00:00.000Z"),
  });
  assert.ok(line);
  assert.ok(line.includes("OpenCode Go"));
  assert.ok(line.includes("5h"));
  assert.ok(line.includes("25%"));
  assert.ok(line.includes("Weekly"));
  assert.ok(line.includes("20%"));
  assert.ok(line.includes("⧉3"));
});

test("footer: no usage, no agents -> undefined", () => {
  const line = renderFooterStatus({
    account: { id: "vllm", name: "vLLM (local)", base: "vllm", isAlias: false },
    usage: undefined,
    liveAgents: 0,
    fg: noop,
    nowMs: Date.now(),
  });
  assert.equal(line, undefined);
});

test("footer: error usage shows warning line", () => {
  const line = renderFooterStatus({
    account: { id: "ollama-cloud", name: "Ollama Cloud", base: "ollama-cloud", isAlias: false },
    usage: { error: "HTTP 401" },
    liveAgents: 0,
    fg: noop,
    nowMs: Date.now(),
  });
  assert.ok(line?.includes("⚠ HTTP 401"));
});

test("footer: balance + spend tail", () => {
  const line = renderFooterStatus({
    account: { id: "openrouter", name: "OpenRouter", base: "openrouter", isAlias: false },
    usage: { balance: [{ amount: 62.5, unit: "USD", label: "Balance" }], spend: { unit: "USD", monthly: 37.5 } },
    liveAgents: 0,
    fg: noop,
    nowMs: Date.now(),
  });
  assert.ok(line?.includes("Balance"));
  assert.ok(line?.includes("62.5"));
  assert.ok(line?.includes("M"));
  assert.ok(line?.includes("37.5"));
});
