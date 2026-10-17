import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AtelierPanels,
  buildUsagePanel,
  USAGE_PANEL_ID,
  USAGE_PANEL_MAX_ROWS,
  type PanelEventBus,
} from "../extensions/usage/ui/atelier.ts";

const NOW = Date.parse("2026-09-02T10:00:00.000Z");
const account = { id: "ollama-assid2", name: "Ollama Cloud (assid2)", base: "ollama-cloud", isAlias: true };

test("atelier panel: the selected account's lanes become keyValues with progress and roles", () => {
  const panel = buildUsagePanel(
    account,
    {
      lanes: [
        { label: "5h", percent: 43, resetsAt: "2026-09-02T12:00:00.000Z" },
        { label: "Weekly", percent: 92 },
      ],
    },
    NOW,
  );
  assert.ok(panel);
  assert.equal(panel.id, USAGE_PANEL_ID);
  // Title identifies the selection; the same stable id is reused for every account.
  assert.equal(panel.title, "Ollama Cloud (assid2)");

  const kv = panel.keyValues ?? [];
  const lane = kv.find((row) => row.label === "5h");
  assert.ok(lane);
  assert.equal(lane.value, "43% ⟳ 2h");
  assert.equal(lane.progress, 0.43);
  assert.equal(lane.valueRole, "success");
  assert.equal(kv.find((row) => row.label === "Weekly")?.valueRole, "error");
  assert.ok((panel.rows ?? []).some((row) => row.includes("43%")));
});

test("atelier panel: balance and spend render as key/value rows", () => {
  const panel = buildUsagePanel(
    account,
    { balance: [{ label: "Monthly credits remaining", amount: 12.5, unit: "usd" }], spend: { unit: "usd", monthly: 3.25 } },
    NOW,
  );
  assert.ok(panel);
  const kv = panel.keyValues ?? [];
  assert.ok(kv.some((row) => row.label === "Monthly credits remaining" && row.value.includes("12.5")));
  const monthly = kv.find((row) => row.label === "Monthly spend");
  assert.ok(monthly && monthly.value.includes("3.25"));
});

test("atelier panel: error surfaces with the error role", () => {
  const panel = buildUsagePanel(account, { error: "quota endpoint exploded" }, NOW);
  assert.ok(panel);
  assert.ok(panel.keyValues?.some((row) => row.valueRole === "error" && row.value.includes("exploded")));
});

test("atelier panel: no usage or no detail yields no panel", () => {
  assert.equal(buildUsagePanel(account, undefined, NOW), undefined);
  assert.equal(buildUsagePanel(account, {}, NOW), undefined);
});

test("atelier panel: stays within the host row cap", () => {
  const lanes = Array.from({ length: 40 }, (_, index) => ({ label: `L${index}`, percent: index }));
  const panel = buildUsagePanel(account, { lanes }, NOW);
  assert.ok(panel);
  assert.ok((panel.rows ?? []).length <= USAGE_PANEL_MAX_ROWS);
  assert.ok((panel.keyValues ?? []).length <= USAGE_PANEL_MAX_ROWS);
});

test("atelier publisher: register, discover replay, unregister", () => {
  const handlers = new Set<(data: unknown) => void>();
  const emitted: Array<Record<string, unknown>> = [];
  const bus: PanelEventBus = {
    on: (_channel, handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    emit: (_channel, data) => {
      emitted.push(data as Record<string, unknown>);
    },
  };
  const publisher = new AtelierPanels(bus, "@assid2/pi-usage");

  publisher.upsert({ id: USAGE_PANEL_ID, title: "Quota", rows: ["a"] });
  assert.equal(emitted.at(-1)?.type, "register");
  assert.equal(emitted.at(-1)?.source, "@assid2/pi-usage");
  const firstRevision = emitted.at(-1)?.revision as number;

  const before = emitted.length;
  for (const handler of handlers) handler({ version: 1, type: "discover", requestId: "r1" });
  const replayed = emitted.slice(before);
  assert.ok(replayed.length >= 1);
  assert.ok(replayed.every((event) => event.type === "register" && event.requestId === "r1"));
  assert.ok((replayed[0].revision as number) > firstRevision);

  publisher.remove(USAGE_PANEL_ID);
  assert.equal(emitted.at(-1)?.type, "unregister");
  assert.equal(emitted.at(-1)?.id, USAGE_PANEL_ID);
});
