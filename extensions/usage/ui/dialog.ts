/**
 * /usage dialog: a custom TUI component with three sections:
 *   1. This session — the agent tree (main + subagents, per-agent usage)
 *   2. Accounts — per-account quota lanes / balance / spend
 *   3. Totals — time-window rollup per account × provider × role
 * Interaction model (search, viewport, keys) ported from @hk_net/pi-usage-bars.
 */
import { Container, Input, Spacer, Text, type Focusable, type TUI } from "@earendil-works/pi-tui";
import { DynamicBorder, type KeybindingsManager, type Theme } from "@earendil-works/pi-coding-agent";
import {
  clampPercent,
  colorForPercent,
  formatCost,
  formatDuration,
  formatMoney,
  formatResetsIn,
  formatSpend,
  formatTokens,
  formatUsageLine,
  renderBar,
  type ColorFn,
} from "../format.ts";
import type { Account, AgentUsage, ProviderUsage, RollupRow } from "../types.ts";

export interface AccountView {
  account: Account;
  usage?: ProviderUsage;
  configured: boolean;
}

export interface UsageView {
  generatedAt: number;
  activeProvider: string | null;
  agents: AgentUsage[];
  accounts: AccountView[];
  rollup: RollupRow[];
  rollupWindow: string;
}

interface Item {
  section: string;
  title: string;
  filter: string;
  detail: string[];
  indent: number;
}

function fgOf(theme: Theme): ColorFn {
  return (color, text) => theme.fg(color, text);
}

function buildItems(view: UsageView, fg: ColorFn, nowMs: number): Item[] {
  const items: Item[] = [];

  // Section 1: agents.
  for (const agent of view.agents) {
    const indent = agent.depth;
    const name = agent.name ?? (agent.depth === 0 ? "main" : "agent");
    const status = agent.status === "live" ? fg("success", "● live") : agent.status === "failed" ? fg("error", "✗ failed") : fg("dim", "done");
    const detail: string[] = [];
    const providerLine = agent.byProvider
      .map((p) => `${p.provider} ${formatUsageLine(p.usage)}`)
      .join(" · ");
    const elapsed = agent.lastTs
      ? ` · ${formatDuration(Math.max(0, nowMs - Date.parse(agent.lastTs)) / 1000)} ago`
      : "";
    detail.push(`${providerLine || "no usage recorded"}${elapsed}`);
    items.push({
      section: "This session",
      title: `${"  ".repeat(indent)}${name} ${status}`,
      filter: `${name} ${agent.byProvider.map((p) => p.provider).join(" ")}`,
      detail,
      indent,
    });
  }

  // Section 2: accounts.
  for (const av of view.accounts) {
    const { account, usage, configured } = av;
    const active = view.activeProvider === account.id ? fg("success", " ✓") : "";
    const title = `${account.name}${active}${configured ? "" : fg("dim", "  (run /login)")}`;
    const detail: string[] = [];
    if (!configured) {
      detail.push(fg("dim", "no credential configured — run /login and select this account"));
    } else if (usage?.error) {
      detail.push(fg("error", usage.error));
    } else if (usage) {
      for (const lane of usage.lanes ?? []) {
        const pct = clampPercent(lane.percent);
        const reset = lane.resetsAt ? fg("dim", `  resets in ${formatResetsIn(lane.resetsAt, nowMs)}`) : "";
        detail.push(
          fg("muted", `${lane.label.padEnd(8)}`) + renderBar(fg, pct, 16) + " " +
            fg(colorForPercent(pct), `${pct}%`.padStart(4)) + reset,
        );
      }
      for (const balance of usage.balance ?? []) {
        detail.push(fg("muted", formatMoney(balance.amount, balance.unit, balance.label)));
      }
      if (usage.spend) detail.push(fg("muted", formatSpend(usage.spend.unit, usage.spend)));
      if (usage.notice) detail.push(fg("muted", usage.notice));
      if (usage.stale) detail.push(fg("warning", "stale (rate limited; showing last known)"));
      if (usage.warning) detail.push(fg("warning", `⚠ ${usage.warning}`));
    } else {
      detail.push(fg("dim", "no usage data"));
    }
    items.push({
      section: "Accounts",
      title,
      filter: `${account.name} ${account.id} ${account.base}`,
      detail,
      indent: 0,
    });
  }

  // Section 3: rollup.
  for (const row of view.rollup) {
    const detail = [
      `${formatTokens(row.usage.input)} in / ${formatTokens(row.usage.output)} out / ` +
        `${formatTokens(row.usage.cacheRead)} cache / ${formatCost(row.usage.cost)} · ${row.usage.requests} req · ${row.sessions} session${row.sessions === 1 ? "" : "s"}`,
    ];
    items.push({
      section: `Totals (${view.rollupWindow})`,
      title: `${row.account} · ${row.provider} · ${row.role}`,
      filter: `${row.account} ${row.provider} ${row.role}`,
      detail,
      indent: 0,
    });
  }

  return items;
}

export class UsageDialog extends Container implements Focusable {
  private readonly searchInput: Input;
  private readonly listContainer: Container;
  private readonly hintText: Text;
  private readonly tui: TUI;
  private readonly theme: Theme;
  private readonly keybindings: KeybindingsManager;
  private readonly onCancel: () => void;
  private readonly refresh: () => Promise<UsageView>;
  private view: UsageView;
  private items: Item[] = [];
  private filtered: Item[] = [];
  private selectedIndex = 0;
  private viewportStart = 0;
  private loading = true;
  private hint: "loading" | "ready" | "error" = "loading";
  private disposed = false;
  private _focused = false;

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
    this.searchInput.focused = value;
  }

  constructor(
    tui: TUI,
    theme: Theme,
    keybindings: KeybindingsManager,
    initial: UsageView,
    refresh: () => Promise<UsageView>,
    onCancel: () => void,
  ) {
    super();
    this.tui = tui;
    this.theme = theme;
    this.keybindings = keybindings;
    this.view = initial;
    this.refresh = refresh;
    this.onCancel = onCancel;

    this.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
    this.addChild(new Spacer(1));
    this.hintText = new Text("", 0, 0);
    this.addChild(this.hintText);
    this.addChild(new Spacer(1));
    this.searchInput = new Input();
    this.addChild(this.searchInput);
    this.addChild(new Spacer(1));
    this.listContainer = new Container();
    this.addChild(this.listContainer);
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));

    this.updateHint();
    this.updateList();
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const view = await this.refresh();
      if (this.disposed) return;
      this.view = view;
      this.loading = false;
      this.hint = "ready";
      this.buildItems();
    } catch {
      if (this.disposed) return;
      this.loading = false;
      this.hint = "error";
    }
    this.updateHint();
    this.updateList();
    this.tui.requestRender();
  }

  private updateHint(): void {
    const fg = fgOf(this.theme);
    if (this.hint === "loading") {
      this.hintText.setText(fg("dim", "Fetching quota, balance, spend, and agent usage…"));
    } else if (this.hint === "error") {
      this.hintText.setText(fg("error", "Failed to fetch usage data"));
    } else {
      this.hintText.setText(
        fg("muted", "Only showing configured usage providers. ") +
          fg("dim", "✓ = active provider · type to filter · ↑↓ navigate · esc close"),
      );
    }
  }

  private buildItems(): void {
    this.items = buildItems(this.view, fgOf(this.theme), Date.now());
    this.filtered = this.items;
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filtered.length - 1));
    this.ensureSelectedVisible();
  }

  private filterItems(query: string): void {
    const normalized = query.trim().toLowerCase();
    this.filtered = normalized
      ? this.items.filter((item) => item.filter.toLowerCase().includes(normalized))
      : this.items;
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filtered.length - 1));
    this.viewportStart = 0;
    this.ensureSelectedVisible();
  }

  private viewportSize(): number {
    return Math.max(1, Math.min(10, this.tui.terminal.rows - 16));
  }

  private ensureSelectedVisible(): void {
    const size = this.viewportSize();
    if (this.selectedIndex < this.viewportStart) this.viewportStart = this.selectedIndex;
    if (this.selectedIndex >= this.viewportStart + size) {
      this.viewportStart = this.selectedIndex - size + 1;
    }
    this.viewportStart = Math.max(0, Math.min(this.viewportStart, Math.max(0, this.filtered.length - size)));
  }

  private moveSelection(delta: number): void {
    if (this.filtered.length === 0) return;
    this.selectedIndex = Math.max(0, Math.min(this.filtered.length - 1, this.selectedIndex + delta));
    this.ensureSelectedVisible();
    this.refreshList();
  }

  private renderItem(item: Item, selected: boolean): void {
    const theme = this.theme;
    const fg = fgOf(theme);
    const pointer = selected ? fg("accent", "→ ") : "  ";
    const title = selected ? fg("accent", theme.bold(item.title)) : item.title;
    this.listContainer.addChild(new Text(`${pointer}${title}`, 0, 0));
    if (!selected) return;
    for (const line of item.detail) {
      this.listContainer.addChild(new Text("    " + line, 0, 0));
    }
    this.listContainer.addChild(new Spacer(1));
  }

  private updateList(): void {
    this.listContainer.clear();
    if (this.loading) {
      this.listContainer.addChild(new Text(fgOf(this.theme)("muted", "  Loading…"), 0, 0));
      return;
    }
    if (this.filtered.length === 0) {
      this.listContainer.addChild(new Text(fgOf(this.theme)("muted", "  No matching entries"), 0, 0));
      return;
    }
    this.ensureSelectedVisible();
    const size = this.viewportSize();
    const end = Math.min(this.filtered.length, this.viewportStart + size);
    if (this.viewportStart > 0) {
      this.listContainer.addChild(new Text(fgOf(this.theme)("dim", `  ↑ ${this.viewportStart} more`), 0, 0));
    }
    for (let index = this.viewportStart; index < end; index += 1) {
      this.renderItem(this.filtered[index]!, index === this.selectedIndex);
    }
    if (end < this.filtered.length) {
      this.listContainer.addChild(new Text(
        fgOf(this.theme)("dim", `  ↓ ${this.filtered.length - end} more`),
        0,
        0,
      ));
    }
  }

  private refreshList(): void {
    this.updateList();
    this.tui.requestRender();
  }

  handleInput(keyData: string): void {
    if (this.keybindings.matches(keyData, "tui.select.up")) {
      if (this.filtered.length > 0) {
        this.selectedIndex = this.selectedIndex === 0 ? this.filtered.length - 1 : this.selectedIndex - 1;
        this.ensureSelectedVisible();
        this.refreshList();
      }
      return;
    }
    if (this.keybindings.matches(keyData, "tui.select.down")) {
      if (this.filtered.length > 0) {
        this.selectedIndex = this.selectedIndex === this.filtered.length - 1 ? 0 : this.selectedIndex + 1;
        this.ensureSelectedVisible();
        this.refreshList();
      }
      return;
    }
    if (this.keybindings.matches(keyData, "tui.select.pageUp")) {
      this.moveSelection(-this.viewportSize());
      return;
    }
    if (this.keybindings.matches(keyData, "tui.select.pageDown")) {
      this.moveSelection(this.viewportSize());
      return;
    }
    if (
      this.keybindings.matches(keyData, "tui.select.cancel") ||
      this.keybindings.matches(keyData, "tui.select.confirm")
    ) {
      this.onCancel();
      return;
    }

    this.searchInput.handleInput(keyData);
    this.filterItems(this.searchInput.getValue());
    this.refreshList();
  }

  override invalidate(): void {
    super.invalidate();
    this.updateHint();
    this.updateList();
  }

  dispose(): void {
    this.disposed = true;
  }
}
