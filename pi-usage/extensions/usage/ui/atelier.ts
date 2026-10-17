/**
 * Atelier sidebar-panel contribution for @assid2/pi-usage.
 *
 * Atelier (`npm:pi-atelier`) is the single custom-footer host. It renders
 * contributed panels from the public `pi-atelier:sidebar-panels` event channel.
 * This module speaks that protocol *without importing Atelier* (which may be
 * absent), so pi-usage never fights another extension for pi's one `setFooter`
 * slot: it contributes data, and whichever host is present renders it. When
 * Atelier is absent the compact `setStatus` line remains the fallback.
 *
 * The panel follows the SELECTED provider+account, exactly like the footer line:
 * the lanes come from the active account's adapter, so switching model/provider
 * switches the panel. There is one stable panel id and no per-account panels or
 * account names in the layout — the host already shows the active model and
 * provider — which keeps this provider-agnostic and independent of how many
 * accounts happen to be configured.
 *
 * Protocol (v1): emit `register` / `unregister` events on the channel; answer
 * `discover` requests by replaying registrations so load order never matters.
 * Panel ids are namespaced (`assid2:usage`); labels/values are plain text (the
 * host sanitizes them) and `progress` is a 0..1 fraction.
 */
import type { Account, ProviderUsage } from "../types.ts";
import { clampPercent, colorForPercent, formatMoney, formatResetsIn } from "../format.ts";

export const ATELIER_PANEL_CHANNEL = "pi-atelier:sidebar-panels";
export const ATELIER_PANEL_PROTOCOL_VERSION = 1 as const;

/**
 * Stable id of the single usage panel. It never changes with the selected
 * account, so a user's enable/hide choice in `/atelier` survives a model switch.
 */
export const USAGE_PANEL_ID = "assid2:usage";
/** Distinct from Atelier's own session-token `USAGE` panel. */
export const USAGE_PANEL_TITLE = "Quota";
/**
 * Atelier rejects a contribution with more than `SIDEBAR_PANEL_MAX_ROWS` (24)
 * rows. Kept local because pi-usage speaks the protocol without importing
 * Atelier; one account is far below it in practice.
 */
export const USAGE_PANEL_MAX_ROWS = 24;

/** Semantic roles Atelier accepts for a contributed row. */
export type PanelRole =
  | "primary"
  | "accent"
  | "muted"
  | "dim"
  | "success"
  | "caution"
  | "warning"
  | "error"
  | "input"
  | "output"
  | "cache"
  | "context";

export interface PanelKeyValue {
  label: string;
  value: string;
  /** Finite 0..1 fraction; the host draws a bar between label and value. */
  progress?: number;
  labelRole?: PanelRole;
  valueRole?: PanelRole;
}

export interface PanelContribution {
  id: string;
  title: string;
  /** Plain-text fallback for hosts that ignore `keyValues`. */
  rows: string[];
  keyValues?: PanelKeyValue[];
  role?: PanelRole;
}

/** The subset of `pi.events` this module needs (keeps it dependency-free). */
export interface PanelEventBus {
  on(channel: string, handler: (data: unknown) => void): () => void;
  emit(channel: string, data: unknown): void;
}

function moneyValue(amount: number, unit: string): string {
  return formatMoney(amount, unit, "").replace(/^\s*·\s*/, "").trim();
}

/**
 * Build the usage panel for ONE account (the selected one), or undefined when it
 * has nothing useful to show: no lanes, balance, spend, notice, warning, error
 * or staleness. `account` is accepted so the title can identify the selection.
 */
export function buildUsagePanel(
  account: Account,
  usage: ProviderUsage | undefined,
  nowMs: number,
): PanelContribution | undefined {
  if (!usage) return undefined;
  const rows: string[] = [];
  const keyValues: PanelKeyValue[] = [];

  for (const lane of usage.lanes ?? []) {
    const pct = clampPercent(lane.percent);
    const reset = lane.resetsAt ? ` ⟳ ${formatResetsIn(lane.resetsAt, nowMs)}` : "";
    keyValues.push({
      label: lane.label,
      value: `${pct}%${reset}`,
      progress: pct / 100,
      labelRole: "muted",
      valueRole: colorForPercent(pct),
    });
    rows.push(`${lane.label} ${pct}%${reset}`);
  }

  for (const balance of usage.balance ?? []) {
    const value = moneyValue(balance.amount, balance.unit);
    keyValues.push({ label: balance.label, value, labelRole: "muted", valueRole: "accent" });
    rows.push(`${balance.label} ${value}`);
  }

  if (usage.spend?.monthly !== undefined) {
    const value = moneyValue(usage.spend.monthly, usage.spend.unit);
    keyValues.push({ label: "Monthly spend", value, labelRole: "muted", valueRole: "accent" });
    rows.push(`Monthly spend ${value}`);
  }

  if (usage.error) {
    const text = usage.error.slice(0, 120);
    keyValues.push({ label: "Error", value: text, labelRole: "muted", valueRole: "error" });
    rows.push(`Error: ${text}`);
  } else if (usage.warning) {
    const text = usage.warning.slice(0, 120);
    keyValues.push({ label: "Warning", value: text, labelRole: "muted", valueRole: "warning" });
    rows.push(`Warning: ${text}`);
  } else if (usage.notice) {
    const text = usage.notice.slice(0, 120);
    keyValues.push({ label: "Notice", value: text, labelRole: "muted", valueRole: "dim" });
    rows.push(text);
  }

  if (usage.stale) {
    keyValues.push({ label: "Data", value: "stale", labelRole: "muted", valueRole: "caution" });
    rows.push("stale");
  }

  if (rows.length === 0) return undefined;
  // The active account's id is the selected provider, so the title reads as
  // "which provider is this quota for?" without hard-coding any names.
  const title = (account.name || account.id).slice(0, 48);
  return {
    id: USAGE_PANEL_ID,
    title: title || USAGE_PANEL_TITLE,
    rows: rows.slice(0, USAGE_PANEL_MAX_ROWS),
    keyValues: keyValues.slice(0, USAGE_PANEL_MAX_ROWS),
    role: "accent",
  };
}

/**
 * Publisher for the Atelier panel protocol. Owns one stable panel id, replays on
 * discovery, and unregisters on session teardown.
 */
export class AtelierPanels {
  private readonly panels = new Map<string, PanelContribution>();
  private readonly unsubscribe: () => void;
  private readonly bus: PanelEventBus;
  private readonly source: string;
  private revision = 0;

  constructor(bus: PanelEventBus, source: string) {
    this.bus = bus;
    this.source = source;
    this.unsubscribe = bus.on(ATELIER_PANEL_CHANNEL, (data) => {
      const event = data as { type?: unknown; requestId?: unknown } | null;
      if (!event || event.type !== "discover" || typeof event.requestId !== "string") return;
      this.replay(event.requestId);
    });
  }

  ids(): string[] {
    return [...this.panels.keys()];
  }

  upsert(panel: PanelContribution): void {
    this.panels.set(panel.id, panel);
    this.emit({
      version: ATELIER_PANEL_PROTOCOL_VERSION,
      type: "register",
      source: this.source,
      revision: ++this.revision,
      panel,
    });
  }

  remove(id: string): void {
    if (!this.panels.delete(id)) return;
    this.emit({
      version: ATELIER_PANEL_PROTOCOL_VERSION,
      type: "unregister",
      source: this.source,
      revision: ++this.revision,
      id,
    });
  }

  /** Unregister every panel but keep listening (used on session shutdown). */
  clear(): void {
    for (const id of [...this.panels.keys()]) this.remove(id);
  }

  dispose(): void {
    this.unsubscribe();
    this.clear();
  }

  private replay(requestId: string): void {
    for (const panel of this.panels.values()) {
      this.emit({
        version: ATELIER_PANEL_PROTOCOL_VERSION,
        type: "register",
        source: this.source,
        revision: ++this.revision,
        panel,
        requestId,
      });
    }
  }

  private emit(data: unknown): void {
    this.bus.emit(ATELIER_PANEL_CHANNEL, data);
  }
}
