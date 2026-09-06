/**
 * Session file scanner: incremental JSONL parsing over pi's session store.
 *
 * Sessions are append-only JSONL files under <agentDir>/sessions/<cwd>/.
 * A subagent session's header carries `parentSession` (the PARENT's file
 * path), which is the parent->child graph used to attribute per-agent usage.
 *
 * Reads are incremental: per file we track the byte offset parsed so far and
 * only read the appended tail on each refresh (files that shrank — pi
 * rewrites them during migrations — are re-read from scratch). The scanner
 * is pure node:fs and fully testable against a synthetic directory.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { addTokenUsage, emptyTokenUsage, type AgentRole, type TokenUsage } from "../types.ts";

export interface SessionHeader {
  id: string;
  cwd?: string;
  timestamp?: string;
  parentSession?: string;
}

export interface ScannedSession {
  path: string;
  mtimeMs: number;
  size: number;
  header?: SessionHeader;
  /** From session_info entries (e.g. "Explore#d55e6c56", "workflow:<runId> <label>"). */
  name?: string;
  usage: TokenUsage;
  /** Usage split by the provider id recorded on each message (alias or base). */
  byProvider: Array<{ provider: string; usage: TokenUsage }>;
  firstTs?: string;
  lastTs?: string;
}

interface FileState extends ScannedSession {
  offset: number;
  providerMap: Map<string, TokenUsage>;
}

function toTokenUsage(raw: unknown): TokenUsage | null {
  const u = raw as {
    input?: unknown; output?: unknown; cacheRead?: unknown; cacheWrite?: unknown;
    totalTokens?: unknown; cost?: { total?: unknown };
  } | null | undefined;
  if (!u || typeof u !== "object") return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const cost = num(u.cost?.total);
  const input = num(u.input);
  const output = num(u.output);
  const cacheRead = num(u.cacheRead);
  const cacheWrite = num(u.cacheWrite);
  const totalTokens = num(u.totalTokens) || input + output + cacheRead + cacheWrite;
  if (totalTokens === 0 && cost === 0) return null;
  return { input, output, cacheRead, cacheWrite, totalTokens, cost, requests: 1 };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export class SessionScanner {
  private files = new Map<string, FileState>();
  sessionsDir: string;

  constructor(sessionsDir: string) {
    this.sessionsDir = sessionsDir;
  }

  /** Walk the session store and incrementally parse every .jsonl file. */
  refresh(): void {
    let dirs: string[];
    try {
      dirs = fs.readdirSync(this.sessionsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => path.join(this.sessionsDir, d.name));
    } catch {
      return; // sessions dir missing — nothing to scan
    }

    const seen = new Set<string>();
    for (const dir of dirs) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
        const file = path.join(dir, entry.name);
        seen.add(file);
        this.refreshFile(file);
      }
    }
    // Drop files that vanished.
    for (const key of [...this.files.keys()]) {
      if (!seen.has(key)) this.files.delete(key);
    }
  }

  private refreshFile(file: string): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      return;
    }
    let state = this.files.get(file);
    // New file, or shrank (pi rewrites on migration) -> full read.
    if (!state || stat.size < state.offset) {
      state = {
        path: file,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        usage: emptyTokenUsage(),
        byProvider: [],
        providerMap: new Map(),
        offset: 0,
      };
      this.files.set(file, state);
    }
    state.mtimeMs = stat.mtimeMs;
    state.size = stat.size;

    if (stat.size === state.offset) return;

    let chunk: string;
    const fd = fs.openSync(file, "r");
    try {
      const length = stat.size - state.offset;
      const buffer = Buffer.alloc(Math.max(0, length));
      const bytesRead = fs.readSync(fd, buffer, 0, length, state.offset);
      chunk = buffer.toString("utf8", 0, bytesRead);
    } catch {
      chunk = "";
    } finally {
      fs.closeSync(fd);
    }
    if (!chunk) return;

    // Parse complete lines only; leave a partial trailing line for next time.
    const lastNewline = chunk.lastIndexOf("\n");
    const complete = lastNewline === -1 ? "" : chunk.slice(0, lastNewline + 1);
    const consumed = state.offset + Buffer.byteLength(complete, "utf8");

    for (const line of complete.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let entry: unknown;
      try {
        entry = JSON.parse(trimmed);
      } catch {
        continue; // tolerate a torn write at the boundary
      }
      this.applyEntry(state, entry);
    }
    state.offset = consumed;

    // Materialize the byProvider view.
    state.byProvider = [...state.providerMap.entries()]
      .map(([provider, usage]) => ({ provider, usage }))
      .sort((a, b) => b.usage.totalTokens - a.usage.totalTokens);
  }

  private applyEntry(state: FileState, entry: unknown): void {
    const e = asObject(entry);
    if (!e) return;

    if (e.type === "session") {
      state.header = {
        id: String(e.id ?? ""),
        cwd: typeof e.cwd === "string" ? e.cwd : undefined,
        timestamp: typeof e.timestamp === "string" ? e.timestamp : undefined,
        parentSession: typeof e.parentSession === "string" ? e.parentSession : undefined,
      };
      return;
    }

    if (typeof e.timestamp === "string") {
      if (!state.firstTs || e.timestamp < state.firstTs) state.firstTs = e.timestamp;
      if (!state.lastTs || e.timestamp > state.lastTs) state.lastTs = e.timestamp;
    }

    if (e.type === "session_info" && typeof e.name === "string") {
      state.name = e.name;
      return;
    }

    if (e.type === "model_change" && typeof e.provider === "string") {
      state.providerMap.set(e.provider, state.providerMap.get(e.provider) ?? emptyTokenUsage());
      return;
    }

    const usage = toTokenUsage(
      e.type === "message" ? asObject(e.message)?.usage : e.usage,
    );
    if (!usage) return;

    let provider: string | undefined;
    if (e.type === "message") {
      const msg = asObject(e.message);
      if (msg?.role === "assistant" && typeof msg.provider === "string") provider = msg.provider;
      // toolResult / others: attribute to the file's last-seen assistant provider.
      if (!provider) provider = [...state.providerMap.keys()].pop();
      if (msg?.role === "assistant" && provider) {
        state.providerMap.set(provider, state.providerMap.get(provider) ?? emptyTokenUsage());
      }
    } else if (e.type === "compaction" || e.type === "branch_summary") {
      provider = [...state.providerMap.keys()].pop();
    }

    addTokenUsage(state.usage, usage);
    if (provider && state.providerMap.has(provider)) {
      addTokenUsage(state.providerMap.get(provider)!, usage);
    } else {
      // No provider seen yet (usage before any assistant message): keep in totals only.
    }
  }

  list(): ScannedSession[] {
    return [...this.files.values()];
  }

  get(file: string): ScannedSession | undefined {
    return this.files.get(file);
  }

  /** All sessions whose header parentSession equals the given file path. */
  childrenOf(file: string): ScannedSession[] {
    return this.list().filter((s) => s.header?.parentSession === file);
  }

  roleOf(s: ScannedSession): AgentRole {
    if (!s.header?.parentSession) return "main";
    return s.name?.startsWith("workflow:") === true ? "workflow" : "subagent";
  }
}
