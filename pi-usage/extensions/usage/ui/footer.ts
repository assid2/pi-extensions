/**
 * Footer status line: one compact line for the ACTIVE account (the account
 * behind the current model) plus a live-subagent indicator. Deliberately does
 * not duplicate what pi's core footer already shows (session tokens/cost).
 */
import { clampPercent, colorForPercent, formatMoney, formatResetsIn, renderBar, type ColorFn } from "../format.ts";
import type { Account, ProviderUsage } from "../types.ts";

export interface FooterInput {
  account: Account;
  usage?: ProviderUsage;
  liveAgents: number;
  fg: ColorFn;
  nowMs: number;
}

export function renderFooterStatus(input: FooterInput): string | undefined {
  const { account, usage, liveAgents, fg, nowMs } = input;
  const label = account.name.slice(0, 12);
  const agentTail = liveAgents > 0 ? fg("dim", ` · ⧉${liveAgents}`) : "";

  if (!usage) {
    return liveAgents > 0 ? fg("dim", `${label} · ⧉${liveAgents}`) : undefined;
  }
  if (usage.error) {
    return fg("warning", `${label} ⚠ ${usage.error.slice(0, 40)}`) + agentTail;
  }

  const parts: string[] = [];
  for (const lane of usage.lanes ?? []) {
    const pct = clampPercent(lane.percent);
    const reset = lane.resetsAt ? ` ⟳ ${formatResetsIn(lane.resetsAt, nowMs)}` : "";
    parts.push(
      fg("muted", `${lane.label} `) +
        renderBar(fg, pct) +
        " " +
        fg(colorForPercent(pct), `${pct}%`) +
        (reset ? fg("dim", reset) : ""),
    );
  }
  if (usage.balance && usage.balance.length > 0) {
    const b = usage.balance[0];
    parts.push(fg("muted", `${b.label} ${formatMoney(b.amount, b.unit, "")}`.trim()));
  }
  if (usage.spend?.monthly !== undefined) {
    parts.push(fg("muted", `M ${formatMoney(usage.spend.monthly, usage.spend.unit, "")}`.trim()));
  }
  if (usage.stale) parts.push(fg("warning", "stale"));
  if (usage.warning) parts.push(fg("warning", "⚠"));

  if (parts.length === 0) {
    return liveAgents > 0 ? fg("dim", `${label} · ⧉${liveAgents}`) : undefined;
  }
  return fg("dim", `${label} `) + parts.join(" ") + agentTail;
}
