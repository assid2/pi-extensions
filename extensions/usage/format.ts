/** Presentation helpers. Kept free of Theme imports so tests can drive them
 * with a plain color function. */

export type ColorName = "dim" | "muted" | "accent" | "success" | "warning" | "error";
export type ColorFn = (color: ColorName, text: string) => string;

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function colorForPercent(value: number): "success" | "warning" | "error" {
  if (value >= 90) return "error";
  if (value >= 70) return "warning";
  return "success";
}

/** Render a fixed-width bar: `███░░░` with the filled part colored by threshold. */
export function renderBar(fg: ColorFn, value: number, width = 8): string {
  const percent = clampPercent(value);
  const filled = Math.round((percent / 100) * width);
  return fg(colorForPercent(percent), "█".repeat(filled)) + fg("dim", "░".repeat(width - filled));
}

/** 1234 -> "1.2K", 2_400_000 -> "2.4M", 999 -> "999". */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (abs >= 1_000) return `${trim(n / 1_000)}K`;
  return `${Math.round(n)}`;
}

function trim(v: number): string {
  return (Math.round(v * 10) / 10).toString();
}

/** 0.1234 -> "$0.0012"; 0.123 -> "$0.12"; 12.5 -> "$12.50". */
export function formatCost(amount: number): string {
  if (!Number.isFinite(amount)) return "$0";
  if (amount === 0) return "$0";
  if (Math.abs(amount) < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

/** Human duration for "resets in" and elapsed time. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "now";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0 && hours > 0) return `${days}d ${hours}h`;
  if (days > 0) return `${days}d`;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
}

export function formatResetsIn(isoDate: string, nowMs: number): string {
  const resetTime = new Date(isoDate).getTime();
  if (!Number.isFinite(resetTime)) return "";
  return formatDuration(Math.max(0, resetTime - nowMs) / 1000);
}

/** "Balance · $12.34" / "Topped up · 40 credits". */
export function formatMoney(amount: number, unit: string, label: string): string {
  const value = /^[A-Z]{3}$/.test(unit)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: unit, minimumFractionDigits: 2, maximumFractionDigits: 5 }).format(amount)
    : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(amount)} ${unit}`;
  return `${label} · ${value}`;
}

/** "Spent · today $1.20 · week $8.10 · month $40.02". */
export function formatSpend(unit: string, spend: { daily?: number; weekly?: number; monthly?: number; lifetime?: number }): string {
  const fmt = (v: number) =>
    /^[A-Z]{3}$/.test(unit)
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: unit, minimumFractionDigits: 2, maximumFractionDigits: 5 }).format(v)
      : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v)} ${unit}`;
  const parts = [
    spend.daily !== undefined ? `today ${fmt(spend.daily)}` : undefined,
    spend.weekly !== undefined ? `week ${fmt(spend.weekly)}` : undefined,
    spend.monthly !== undefined ? `month ${fmt(spend.monthly)}` : undefined,
    spend.lifetime !== undefined ? `lifetime ${fmt(spend.lifetime)}` : undefined,
  ].filter((v): v is string => Boolean(v));
  return `Spent · ${parts.join(" · ")}`;
}

/** Compact one-line summary of a token usage block: "2.1M in / 340K out / $1.23". */
export function formatUsageLine(u: { input: number; output: number; cost: number }): string {
  return `${formatTokens(u.input)} in / ${formatTokens(u.output)} out / ${formatCost(u.cost)}`;
}
