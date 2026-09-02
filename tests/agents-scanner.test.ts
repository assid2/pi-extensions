import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SessionScanner } from "../extensions/usage/agents/scanner.ts";
import { computeRollup } from "../extensions/usage/agents/rollup.ts";
import { buildSessionTree } from "../extensions/usage/agents/tree.ts";
import { AgentEventTracker } from "../extensions/usage/agents/events.ts";
import { AccountRegistry } from "../extensions/usage/accounts/registry.ts";

function makeDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pi-usage-scan-"));
}

function writeSession(dir: string, name: string, lines: unknown[]): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return file;
}

const usage = (input: number, output: number, cost = 0) => ({
  input,
  output,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: input + output,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: cost },
});

test("scanner: parses headers, usage, parent links, and incremental tails", () => {
  const root = makeDir();
  const proj = path.join(root, "--proj--");
  const other = path.join(root, "--other--");
  fs.mkdirSync(proj);
  fs.mkdirSync(other);

  const mainFile = writeSession(proj, "main.jsonl", [
    { type: "session", version: 3, id: "main-id", timestamp: "2026-09-01T10:00:00.000Z", cwd: "/proj" },
    { type: "session_info", id: "a1", parentId: null, timestamp: "2026-09-01T10:00:01.000Z", name: "main-session" },
    { type: "message", id: "a2", parentId: "a1", timestamp: "2026-09-01T10:00:02.000Z", message: { role: "user", content: "hi" } },
    { type: "message", id: "a3", parentId: "a2", timestamp: "2026-09-01T10:00:03.000Z", message: { role: "assistant", provider: "vllm", model: "qwen3.8-27b", usage: usage(100, 50, 0.01), stopReason: "stop" } },
    { type: "message", id: "a4", parentId: "a3", timestamp: "2026-09-01T10:00:04.000Z", message: { role: "toolResult", toolName: "bash", usage: usage(10, 5), isError: false } },
    { type: "compaction", id: "a5", parentId: "a4", timestamp: "2026-09-01T10:00:05.000Z", summary: "s", usage: usage(20, 10) },
  ]);

  const childFile = writeSession(proj, "child.jsonl", [
    { type: "session", version: 3, id: "child-id", timestamp: "2026-09-01T10:01:00.000Z", cwd: "/proj", parentSession: mainFile },
    { type: "session_info", id: "b1", parentId: null, timestamp: "2026-09-01T10:01:01.000Z", name: "Explore#abc123" },
    { type: "message", id: "b2", parentId: "b1", timestamp: "2026-09-01T10:01:02.000Z", message: { role: "assistant", provider: "ollama-cloud", model: "qwen3.5:397b", usage: usage(500, 200, 0.05), stopReason: "stop" } },
  ]);

  const grandchildFile = writeSession(proj, "grandchild.jsonl", [
    { type: "session", version: 3, id: "gc-id", timestamp: "2026-09-01T10:02:00.000Z", cwd: "/proj", parentSession: childFile },
    { type: "session_info", id: "c1", parentId: null, timestamp: "2026-09-01T10:02:01.000Z", name: "workflow:wf_1 review:bugs" },
    { type: "message", id: "c2", parentId: "c1", timestamp: "2026-09-01T10:02:02.000Z", message: { role: "assistant", provider: "opencode-go", model: "qwen3.7-max", usage: usage(1000, 300, 0.1), stopReason: "stop" } },
  ]);

  writeSession(other, "unrelated.jsonl", [
    { type: "session", version: 3, id: "u-id", timestamp: "2026-09-01T09:00:00.000Z", cwd: "/other" },
    { type: "message", id: "d1", parentId: null, timestamp: "2026-09-01T09:00:01.000Z", message: { role: "assistant", provider: "anthropic", model: "claude-sonnet-4-5", usage: usage(50, 25), stopReason: "stop" } },
  ]);

  const scanner = new SessionScanner(root);
  scanner.refresh();

  assert.equal(scanner.list().length, 4);

  const main = scanner.get(mainFile)!;
  assert.equal(main.header?.id, "main-id");
  assert.equal(main.name, "main-session");
  assert.equal(main.usage.input, 130); // 100 + 10 (toolResult) + 20 (compaction)
  assert.equal(main.usage.output, 65);
  assert.equal(main.usage.requests, 3);
  assert.equal(main.usage.cost, 0.01);
  assert.equal(main.byProvider.length, 1);
  assert.equal(main.byProvider[0]?.provider, "vllm");

  const child = scanner.get(childFile)!;
  assert.equal(child.header?.parentSession, mainFile);
  assert.equal(child.name, "Explore#abc123");
  assert.equal(child.usage.input, 500);
  assert.equal(child.byProvider[0]?.provider, "ollama-cloud");

  const gc = scanner.get(grandchildFile)!;
  assert.equal(gc.byProvider[0]?.provider, "opencode-go");

  // Parent links.
  assert.deepEqual(scanner.childrenOf(mainFile).map((s) => s.path), [childFile]);
  assert.deepEqual(scanner.childrenOf(childFile).map((s) => s.path), [grandchildFile]);

  // Roles.
  assert.equal(scanner.roleOf(main), "main");
  assert.equal(scanner.roleOf(child), "subagent");
  assert.equal(scanner.roleOf(gc), "workflow");

  // Incremental tail: append to main, refresh, totals grow.
  fs.appendFileSync(mainFile, JSON.stringify({
    type: "message", id: "a6", parentId: "a5", timestamp: "2026-09-01T10:00:06.000Z",
    message: { role: "assistant", provider: "vllm", model: "qwen3.8-27b", usage: usage(7, 3), stopReason: "stop" },
  }) + "\n");
  scanner.refresh();
  assert.equal(scanner.get(mainFile)!.usage.input, 137);
  assert.equal(scanner.get(mainFile)!.usage.requests, 4);

  // Tree: main + child + grandchild, depths 0/1/2.
  const tracker = new AgentEventTracker();
  const tree = buildSessionTree(scanner, mainFile, tracker, Date.now());
  assert.equal(tree.length, 3);
  assert.equal(tree[0]?.depth, 0);
  assert.equal(tree[1]?.depth, 1);
  assert.equal(tree[2]?.depth, 2);

  // Rollup: all windows, attributed per account.
  const registry = new AccountRegistry([
    { id: "vllm", name: "vLLM (local)", base: "vllm", isAlias: false },
    { id: "ollama-cloud", name: "Ollama Cloud", base: "ollama-cloud", isAlias: false },
    { id: "opencode-go", name: "OpenCode Go", base: "opencode-go", isAlias: false },
    { id: "anthropic", name: "Claude", base: "anthropic", isAlias: false },
  ]);
  const rollup = computeRollup(scanner, registry, "all", Date.now());
  const byKey = new Map(rollup.map((r) => [`${r.account}|${r.role}`, r]));
  assert.equal(byKey.get("vllm|main")?.usage.input, 137);
  assert.equal(byKey.get("ollama-cloud|subagent")?.usage.input, 500);
  assert.equal(byKey.get("opencode-go|workflow")?.usage.input, 1000);
  assert.equal(byKey.get("anthropic|main")?.usage.input, 50);
  assert.equal(rollup.length, 4);
});

test("scanner: tolerates a torn trailing line", () => {
  const root = makeDir();
  const proj = path.join(root, "--proj--");
  fs.mkdirSync(proj);
  const file = writeSession(proj, "s.jsonl", [
    { type: "session", version: 3, id: "s-id", timestamp: "2026-09-01T10:00:00.000Z", cwd: "/proj" },
    { type: "message", id: "e1", parentId: null, timestamp: "2026-09-01T10:00:01.000Z", message: { role: "assistant", provider: "vllm", model: "m", usage: usage(10, 5), stopReason: "stop" } },
  ]);
  // Append a partial line (no trailing newline).
  fs.appendFileSync(file, '{"type":"message","id":"e2","parentId":"e1","timestamp":"2026-09-01T10:00:02.000Z","message":{"role":"assistant","provider":"vllm","model":"m","usage":{"input":9');
  const scanner = new SessionScanner(root);
  scanner.refresh();
  assert.equal(scanner.get(file)!.usage.input, 10); // partial line ignored
  // Complete the line; it is picked up.
  fs.appendFileSync(file, ',"output":4,"cacheRead":0,"cacheWrite":0,"totalTokens":13,"cost":{"total":0},"stopReason":"stop"}}}' + "\n");
  scanner.refresh();
  assert.equal(scanner.get(file)!.usage.input, 19);
  assert.equal(scanner.get(file)!.usage.requests, 2);
});
