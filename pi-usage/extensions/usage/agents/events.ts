/**
 * Live agent tracking from the pi event bus.
 *
 * pi-subagents (in-process) emits `subagents:*` events; pi-dynamic-workflows
 * emits `pi-dynamic-workflows:lifecycle`. Both run in the SAME process as the
 * main session, so a `pi.events` subscription in this extension sees them.
 * Payloads are handled defensively — versions drift, and an unknown shape
 * must never break the usage extension.
 */
import { addTokenUsage, emptyTokenUsage, type AgentStatus, type TokenUsage } from "../types.ts";

export interface LiveAgent {
  /** Stable key: agentId (subagents) or sessionId (workflows). */
  key: string;
  name?: string;
  status: AgentStatus;
  usage: TokenUsage;
  startedAt?: number;
  finishedAt?: number;
  kind: "subagent" | "workflow";
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Extract a TokenUsage from the varied payloads: {usage:{...}}, {tokens:{...}}. */
function usageFrom(data: Record<string, unknown>): TokenUsage | null {
  const u = asObject(data.usage) ?? asObject(data.tokens);
  if (!u) return null;
  const usage = emptyTokenUsage();
  usage.input = num(u.input);
  usage.output = num(u.output);
  usage.cacheRead = num(u.cacheRead);
  usage.cacheWrite = num(u.cacheWrite);
  usage.totalTokens = num(u.totalTokens) || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
  const cost = asObject(u.cost);
  usage.cost = cost ? num(cost.total) : num(u.cost);
  usage.requests = 1;
  if (usage.totalTokens === 0 && usage.cost === 0) return null;
  return usage;
}

export class AgentEventTracker {
  private agents = new Map<string, LiveAgent>();
  private readonly maxEntries = 512;

  /** Handle one bus event; returns true when the view changed. */
  handle(event: string, data: unknown, nowMs: number): boolean {
    const d = asObject(data);
    if (!d) return false;

    if (event.startsWith("subagents:")) {
      const id = typeof d.agentId === "string" ? d.agentId : typeof d.id === "string" ? d.id : undefined;
      if (!id) return false;
      const kind = "subagent" as const;
      const agent = this.agents.get(id) ?? this.spawn(id, kind, nowMs);
      const name = typeof d.name === "string" ? d.name : typeof d.label === "string" ? d.label : undefined;
      if (name) agent.name = name;
      if (event === "subagents:completed") agent.status = "done";
      else if (event === "subagents:failed") agent.status = "failed";
      else if (event === "subagents:started" || event === "subagents:created" || event === "subagents:ready") agent.status = "live";
      else if (event === "subagents:scheduled") agent.status = agent.status === "unknown" ? "live" : agent.status;
      const usage = usageFrom(d);
      if (usage) addTokenUsage(agent.usage, usage);
      if (event === "subagents:completed" || event === "subagents:failed") agent.finishedAt = nowMs;
      return true;
    }

    if (event === "pi-dynamic-workflows:lifecycle") {
      const key = typeof d.sessionId === "string" ? d.sessionId : typeof d.runId === "string" ? `wf:${d.runId}` : undefined;
      if (!key) return false;
      const agent = this.agents.get(key) ?? this.spawn(key, "workflow", nowMs);
      if (typeof d.name === "string") agent.name = d.name;
      const status = d.status;
      if (status === "completed" || status === "stopped" || status === "done") agent.status = "done";
      else if (status === "failed" || status === "error") agent.status = "failed";
      else if (status === "running" || status === "started" || status === "paused") agent.status = "live";
      const usage = usageFrom(d);
      if (usage) addTokenUsage(agent.usage, usage);
      return true;
    }

    return false;
  }

  private spawn(key: string, kind: "subagent" | "workflow", nowMs: number): LiveAgent {
    if (this.agents.size >= this.maxEntries) {
      // Evict the oldest finished agent to bound memory in long sessions.
      const victim = [...this.agents.values()]
        .filter((a) => a.finishedAt !== undefined)
        .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0))[0];
      if (victim) this.agents.delete(victim.key);
      else this.agents.clear();
    }
    const agent: LiveAgent = { key, kind, status: "live", usage: emptyTokenUsage(), startedAt: nowMs };
    this.agents.set(key, agent);
    return agent;
  }

  list(): LiveAgent[] {
    return [...this.agents.values()];
  }

  /** Count of currently-live agents (for the footer indicator). */
  liveCount(): number {
    return this.list().filter((a) => a.status === "live").length;
  }

  get(key: string): LiveAgent | undefined {
    return this.agents.get(key);
  }
}
