/**
 * Build the current session's agent tree: the main session plus every
 * (transitively) linked subagent session, with per-agent usage.
 */
import type { AgentUsage, AgentStatus, TokenUsage } from "../types.ts";
import { emptyTokenUsage } from "../types.ts";
import type { AgentEventTracker } from "./events.ts";
import type { ScannedSession, SessionScanner } from "./scanner.ts";

const STALE_AFTER_MS = 10 * 60 * 1000;

function statusOf(file: ScannedSession, tracker: AgentEventTracker, nowMs: number): AgentStatus {
  // A bus event about this session file wins.
  for (const live of tracker.list()) {
    if (live.key === file.header?.id || live.key === file.path) {
      return live.status;
    }
  }
  if (file.size === 0) return "unknown";
  const age = nowMs - file.mtimeMs;
  if (age < STALE_AFTER_MS) return "live";
  return "done";
}

function toAgentUsage(file: ScannedSession, depth: number, status: AgentStatus): AgentUsage {
  return {
    sessionId: file.header?.id ?? "",
    sessionFile: file.path,
    name: file.name,
    cwd: file.header?.cwd,
    parentSession: file.header?.parentSession,
    depth,
    status,
    usage: file.usage,
    byProvider: file.byProvider.map((p) => ({ provider: p.provider, usage: p.usage })),
    firstTs: file.firstTs,
    lastTs: file.lastTs,
  };
}

/**
 * Root is the current session file; children are resolved through the
 * parentSession graph (BFS, so nested subagents appear indented).
 * The main session may be missing from the scanner snapshot (e.g. a brand
 * new in-memory session) — in that case it is represented with zero usage.
 */
export function buildSessionTree(
  scanner: SessionScanner,
  rootFile: string | undefined,
  tracker: AgentEventTracker,
  nowMs: number,
): AgentUsage[] {
  const out: AgentUsage[] = [];

  const root = rootFile ? scanner.get(rootFile) : undefined;
  const rootUsage: AgentUsage = root
    ? toAgentUsage(root, 0, statusOf(root, tracker, nowMs))
    : {
        sessionId: "",
        sessionFile: rootFile ?? "",
        depth: 0,
        status: "live",
        usage: emptyTokenUsage(),
        byProvider: [],
      };
  out.push(rootUsage);

  // BFS over child links.
  let frontier: Array<{ file: string; depth: number }> = root
    ? scanner.childrenOf(root.path).map((c) => ({ file: c.path, depth: 1 }))
    : [];
  const visited = new Set<string>([root?.path ?? rootFile ?? ""]);
  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const { file, depth } of frontier) {
      if (visited.has(file)) continue;
      visited.add(file);
      const s = scanner.get(file);
      if (!s) continue;
      out.push(toAgentUsage(s, depth, statusOf(s, tracker, nowMs)));
      if (depth < 4) {
        for (const child of scanner.childrenOf(file)) next.push({ file: child.path, depth: depth + 1 });
      }
    }
    frontier = next;
  }

  return out;
}

/** Total usage of a set of agents (main + children). */
export function totalUsage(agents: AgentUsage[]): TokenUsage {
  const total = emptyTokenUsage();
  for (const a of agents) {
    total.input += a.usage.input;
    total.output += a.usage.output;
    total.cacheRead += a.usage.cacheRead;
    total.cacheWrite += a.usage.cacheWrite;
    total.totalTokens += a.usage.totalTokens;
    total.cost += a.usage.cost;
    total.requests += a.usage.requests;
  }
  return total;
}
