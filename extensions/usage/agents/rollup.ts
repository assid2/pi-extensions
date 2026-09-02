/**
 * Time-window rollup: aggregate ALL sessions (any project) per
 * account × provider × role for a window. This is the "how much did each
 * account cost me this week" view.
 */
import { addTokenUsage, emptyTokenUsage, type AgentRole, type RollupRow, type TokenUsage } from "../types.ts";
import type { AccountRegistry } from "../accounts/registry.ts";
import type { ScannedSession, SessionScanner } from "./scanner.ts";

export type WindowKey = "1d" | "7d" | "30d" | "all";

export function windowStartMs(window: WindowKey, nowMs: number): number | null {
  switch (window) {
    case "1d":
      return nowMs - 24 * 3600 * 1000;
    case "7d":
      return nowMs - 7 * 24 * 3600 * 1000;
    case "30d":
      return nowMs - 30 * 24 * 3600 * 1000;
    case "all":
      return null;
  }
}

function inWindow(s: ScannedSession, startMs: number | null, nowMs: number): boolean {
  if (startMs === null) return true;
  // Cheap mtime prefilter, refined by the last entry timestamp when present.
  if (s.mtimeMs < startMs) return false;
  if (s.lastTs) {
    const last = Date.parse(s.lastTs);
    if (Number.isFinite(last) && last < startMs) return false;
  }
  return nowMs - s.mtimeMs < 0 ? false : true; // files never from the future
}

interface RowKey {
  account: string;
  provider: string;
  role: AgentRole;
}

/**
 * @param registry accounts used to attribute provider ids (alias-aware)
 * @param displayNames optional provider-id -> display name for accounts
 * created implicitly during the rollup
 */
export function computeRollup(
  scanner: SessionScanner,
  registry: AccountRegistry,
  window: WindowKey,
  nowMs: number,
  displayNames: (providerId: string) => string = (id) => id,
): RollupRow[] {
  const start = windowStartMs(window, nowMs);
  const rows = new Map<string, { row: RollupRow; usage: TokenUsage }>();

  for (const session of scanner.list()) {
    if (!inWindow(session, start, nowMs)) continue;
    if (session.usage.totalTokens === 0 && session.usage.cost === 0) continue;

    const role = scanner.roleOf(session);
    const sources =
      session.byProvider.length > 0
        ? session.byProvider
        : [{ provider: "unknown", usage: session.usage }];

    for (const { provider, usage } of sources) {
      const account = registry.accountForProvider(provider, displayNames(provider));
      const key = `${account.id}|${provider}|${role}`;
      let entry = rows.get(key);
      if (!entry) {
        entry = {
          row: { account: account.id, provider, role, usage: emptyTokenUsage(), sessions: 0 },
          usage: emptyTokenUsage(),
        };
        rows.set(key, entry);
      }
      addTokenUsage(entry.usage, usage);
      entry.row.sessions += 1;
    }
  }

  const out: RollupRow[] = [...rows.values()].map((e) => {
    e.row.usage = e.usage;
    return e.row;
  });
  out.sort((a, b) => b.usage.totalTokens - a.usage.totalTokens);
  return out;
}
