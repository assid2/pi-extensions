// extensions/index.ts
import { basename as basename3, join as join3 } from "node:path";
import {
  CONFIG_DIR_NAME,
  estimateTokens,
  getAgentDir,
  SettingsManager
} from "@earendil-works/pi-coding-agent";

// src/completion-notifier.ts
import { spawn as nodeSpawn } from "node:child_process";

// src/text.ts
import { truncateToWidth } from "@earendil-works/pi-tui";
var TERMINAL_SEQUENCE = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b\[[0-?]*[ -/]*[@-~]|\u009b[0-?]*[ -/]*[@-~]|\u001b[@-Z\\-_]/g;
var sanitizeInline = (text) => text.replace(TERMINAL_SEQUENCE, "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
var fitToWidth = (text, width) => truncateToWidth(text, Math.max(0, Math.trunc(width)), "", true);
var errorMessage = (error) => error instanceof Error ? error.message : String(error);
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var isColorEnabled = () => !process.env.NO_COLOR;
var clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
var PLACEHOLDER = "—";

// src/completion-notifier.ts
var PROCESS_TIMEOUT_MS = 5000;
var APPLE_SCRIPT = [
  "on run argv",
  "display notification (item 2 of argv) with title (item 1 of argv)",
  "end run"
];
var WINDOWS_TOAST_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null",
  "[Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null",
  "$template = [Windows.UI.Notifications.ToastTemplateType]::ToastText02",
  "$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent($template)",
  "$texts = $xml.GetElementsByTagName('text')",
  "$texts.Item(0).AppendChild($xml.CreateTextNode($env:PI_ATELIER_NOTIFICATION_TITLE)) > $null",
  "$texts.Item(1).AppendChild($xml.CreateTextNode($env:PI_ATELIER_NOTIFICATION_BODY)) > $null",
  "$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)",
  "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Pi Atelier').Show($toast)"
].join("; ");
function createCompletionNotifier(options) {
  const platform = options.platform ?? process.platform;
  const spawn = options.spawn ?? nodeSpawn;
  let settledNotified = false;
  const inputRequests = new Set;
  const pendingSystemNotifications = new Set;
  const deliver = (kind, notification) => {
    if (!options.isEnabled())
      return;
    let cancel;
    cancel = deliverSystemNotification(platform, spawn, formatTitle(notification), formatBody(kind, notification), () => {
      if (cancel)
        pendingSystemNotifications.delete(cancel);
    });
    if (cancel)
      pendingSystemNotifications.add(cancel);
  };
  const runStarted = () => {
    settledNotified = false;
    inputRequests.clear();
  };
  return {
    runStarted,
    inputRequested(toolCallId, notification) {
      const id = sanitize(toolCallId, 160);
      if (id.length === 0 || inputRequests.has(id))
        return;
      inputRequests.add(id);
      deliver("input-requested", notification);
    },
    turnSettled(notification) {
      if (settledNotified)
        return;
      settledNotified = true;
      deliver("turn-settled", notification);
    },
    reset() {
      runStarted();
      for (const cancel of pendingSystemNotifications)
        cancel();
      pendingSystemNotifications.clear();
    }
  };
}
function formatTitle(notification) {
  const project = sanitize(notification.projectName, 80);
  return project.length > 0 ? `Pi Atelier · ${project}` : "Pi Atelier";
}
function formatBody(kind, notification) {
  const parts = [kind === "input-requested" ? "Input requested" : "Turn settled"];
  const session = sanitize(notification.sessionName ?? "", 100);
  if (session.length > 0)
    parts.push(session);
  if (kind === "turn-settled") {
    const completed = normalizeCount(notification.completedToolCount);
    const failed = normalizeCount(notification.failedToolCount);
    if (completed > 0)
      parts.push(`${completed} done`);
    if (failed > 0)
      parts.push(`${failed} failed`);
  }
  return parts.join(" · ");
}
function deliverSystemNotification(platform, spawn, title, body, onFinished) {
  if (platform === "darwin") {
    return spawnDetached(spawn, "osascript", [...APPLE_SCRIPT.flatMap((line) => ["-e", line]), "--", title, body], {}, onFinished);
  }
  if (platform === "win32") {
    return spawnDetached(spawn, "powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", WINDOWS_TOAST_SCRIPT], {
      env: {
        ...process.env,
        PI_ATELIER_NOTIFICATION_TITLE: title,
        PI_ATELIER_NOTIFICATION_BODY: body
      },
      windowsHide: true
    }, onFinished);
  }
  return;
}
function spawnDetached(spawn, command, args, extra, onFinished) {
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore", ...extra });
    let timer;
    let finished = false;
    const finish = (kill) => {
      if (finished)
        return;
      finished = true;
      if (timer)
        clearTimeout(timer);
      timer = undefined;
      if (kill) {
        try {
          child.kill();
        } catch {}
      }
      onFinished();
    };
    child.once("error", () => finish(false));
    child.once("exit", () => finish(false));
    child.unref();
    timer = setTimeout(() => finish(true), PROCESS_TIMEOUT_MS);
    timer.unref();
    return () => finish(true);
  } catch {
    return;
  }
}
var sanitize = (value, maximumLength) => sanitizeInline(value).slice(0, maximumLength);
var normalizeCount = (value) => value !== undefined && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

// src/config.ts
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// src/display.ts
var PRODUCT_SEGMENT_ORDER = [
  "brand",
  "activity",
  "metrics",
  "performance",
  "context",
  "model",
  "git",
  "statuses",
  "menu"
];
var TEMPLATE_NAMES = ["editorial", "minimal", "classic"];
var DENSITIES = ["comfortable", "compact"];
var REQUIRED_SEGMENT_IDS = new Set(["metrics", "context"]);
var SEGMENT_IDS = new Set(PRODUCT_SEGMENT_ORDER);
var PRESET_NAMES = new Set([...TEMPLATE_NAMES, "custom"]);
var DENSITY_NAMES = new Set(DENSITIES);
var isRequiredSegment = (id) => REQUIRED_SEGMENT_IDS.has(id);
var isSegmentId = (value) => typeof value === "string" && SEGMENT_IDS.has(value);
var isPresetName = (value) => typeof value === "string" && PRESET_NAMES.has(value);
var isDensity = (value) => typeof value === "string" && DENSITY_NAMES.has(value);
var layout = (visible) => {
  const shown = new Set(visible);
  return PRODUCT_SEGMENT_ORDER.map((id) => ({ id, visible: shown.has(id) }));
};
var DISPLAY_TEMPLATES = {
  editorial: {
    density: "comfortable",
    segmentLayout: layout(["activity", "metrics", "context", "model", "git", "statuses", "menu"])
  },
  minimal: {
    density: "compact",
    segmentLayout: layout(["activity", "metrics", "context", "model", "menu"])
  },
  classic: {
    density: "comfortable",
    segmentLayout: layout(["metrics", "context", "model", "git", "statuses"])
  }
};
var cloneLayout = (value) => value.map((entry) => ({ ...entry }));
var legacySegmentsToLayout = (segments) => normalizeSegmentLayout(segments.map((id) => ({ id, visible: true })));
var normalizeSegmentLayout = (entries) => {
  const seen = new Set;
  const result = [];
  for (const entry of entries) {
    if (seen.has(entry.id))
      continue;
    seen.add(entry.id);
    result.push({ id: entry.id, visible: entry.visible });
  }
  for (const id of PRODUCT_SEGMENT_ORDER) {
    if (!seen.has(id))
      result.push({ id, visible: false });
  }
  for (const entry of result) {
    if (isRequiredSegment(entry.id))
      entry.visible = true;
  }
  return result;
};
var toggleSegmentVisibility = (value, id) => value.map((entry) => ({
  ...entry,
  visible: entry.id === id && !isRequiredSegment(id) ? !entry.visible : entry.visible
}));
var reorderSegment = (value, id, direction) => {
  const result = cloneLayout(value);
  const index = result.findIndex((entry) => entry.id === id);
  const target = direction === "earlier" ? index - 1 : index + 1;
  const current = result[index];
  const neighbor = result[target];
  if (index < 0 || !current || !neighbor)
    return result;
  result[index] = neighbor;
  result[target] = current;
  return result;
};
var layoutsEqual = (left, right) => left.length === right.length && left.every((entry, index) => entry.id === right[index]?.id && entry.visible === right[index]?.visible);
var derivePresetIdentity = (display) => TEMPLATE_NAMES.find((name) => {
  const template = DISPLAY_TEMPLATES[name];
  return display.density === template.density && layoutsEqual(display.segmentLayout, template.segmentLayout);
}) ?? "custom";
var applyDisplayTemplate = (name) => {
  const template = DISPLAY_TEMPLATES[name];
  return {
    preset: name,
    density: template.density,
    segmentLayout: cloneLayout(template.segmentLayout)
  };
};

// src/metrics.ts
var isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
var finite = (value) => isFiniteNumber(value) ? value : 0;
var finiteOrNull = (value) => isFiniteNumber(value) ? value : null;
function aggregateMetrics(messages, options) {
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let cost = 0;
  let cacheHitPercent;
  let usageAvailable = false;
  let costAvailable = false;
  for (const { usage } of messages) {
    const messageInput = usage?.input;
    const messageOutput = usage?.output;
    const messageCacheRead = usage?.cacheRead;
    const messageCacheWrite = usage?.cacheWrite;
    if (!isFiniteNumber(messageInput) || !isFiniteNumber(messageOutput) || !isFiniteNumber(messageCacheRead) || !isFiniteNumber(messageCacheWrite))
      continue;
    usageAvailable = true;
    const messageCost = usage?.cost?.total;
    if (isFiniteNumber(messageCost)) {
      costAvailable = true;
      cost += messageCost;
    }
    input += messageInput;
    output += messageOutput;
    cacheRead += messageCacheRead;
    cacheWrite += messageCacheWrite;
    const prompt = messageInput + messageCacheRead + messageCacheWrite;
    cacheHitPercent = prompt > 0 ? messageCacheRead / prompt * 100 : undefined;
  }
  const context = options.context;
  return {
    usageAvailable,
    costAvailable,
    input,
    output,
    cacheRead,
    cacheWrite,
    ...cacheHitPercent === undefined ? {} : { cacheHitPercent },
    cost,
    subscription: options.subscription,
    contextTokens: finiteOrNull(context?.tokens),
    contextWindow: finite(context?.contextWindow),
    contextPercent: finiteOrNull(context?.percent),
    autoCompact: options.autoCompact
  };
}
function formatTokens(count) {
  const safe = Math.max(0, finite(count));
  if (safe < 1000)
    return safe.toString();
  if (safe < 1e4)
    return `${(safe / 1000).toFixed(1)}k`;
  if (safe < 1e6)
    return `${Math.round(safe / 1000)}k`;
  if (safe < 1e7)
    return `${(safe / 1e6).toFixed(1)}M`;
  return `${Math.round(safe / 1e6)}M`;
}

// src/prefill.ts
var SIGNIFICANT_TOKENS = 1024;
var SIGNIFICANT_MS = 300;
var RENDER_THROTTLE_MS = 120;
var OPENAI_COMPLETIONS_API = "openai-completions";
var SIDEBAR_PREFILL_VIEWS = ["percent", "tokens", "eta", "rate"];
function usableRate(ratePerSec) {
  return ratePerSec !== null && Number.isFinite(ratePerSec) && ratePerSec > 0;
}
function formatRate(ratePerSec) {
  return `${formatTokens(Math.round(ratePerSec))} tok/s`;
}
function formatPrefillRows(snapshot, views) {
  const etaText = views.includes("eta") && snapshot.etaSec !== null ? `~${Math.max(1, Math.round(snapshot.etaSec))}s` : undefined;
  const rateText = views.includes("rate") && usableRate(snapshot.ratePerSec) ? formatRate(snapshot.ratePerSec) : undefined;
  const rows = [];
  const seen = new Set;
  for (const view of views) {
    if (seen.has(view))
      continue;
    seen.add(view);
    if (view === "tokens") {
      rows.push({
        label: "Tokens",
        value: `${formatTokens(snapshot.uncachedProcessed)} / ${formatTokens(snapshot.uncachedTotal)}`
      });
    } else if (view === "eta" && etaText !== undefined) {
      rows.push({
        label: "First token",
        value: rateText === undefined ? etaText : `${etaText} · ${rateText}`
      });
    } else if (view === "rate" && rateText !== undefined && etaText === undefined) {
      rows.push({ label: "Speed", value: rateText });
    }
  }
  return rows;
}
function isGenerationStart(data) {
  const choice = data?.choices?.[0];
  if (!choice)
    return false;
  if (choice.finish_reason != null)
    return true;
  const delta = choice.delta;
  if (delta == null)
    return false;
  return typeof delta.content === "string" && delta.content.length > 0 || Array.isArray(delta.content) || Array.isArray(delta.tool_calls) || typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0 || typeof delta.reasoning === "string" && delta.reasoning.length > 0;
}
function readProgress(data) {
  const progress = data?.prompt_progress;
  if (!progress || typeof progress.total !== "number")
    return;
  return progress;
}
function createPrefillTracker(options) {
  const now = options.now ?? Date.now;
  const providers = new Set(options.providers.map((provider) => provider.trim().toLowerCase()).filter(Boolean));
  let snapshot;
  let previousProcessed = 0;
  let previousTimeMs = 0;
  let firstSeenAt = 0;
  let assessed = false;
  let tracking = false;
  const reset = () => {
    snapshot = undefined;
    previousProcessed = 0;
    previousTimeMs = 0;
    firstSeenAt = 0;
    assessed = false;
    tracking = false;
  };
  return {
    noteRequest(model, payload) {
      reset();
      if (typeof model?.provider !== "string")
        return false;
      if (model.api !== OPENAI_COMPLETIONS_API)
        return false;
      const provider = model.provider.trim().toLowerCase();
      if (!providers.has(provider))
        return false;
      if (!isRecord(payload))
        return false;
      if (payload.stream === false)
        return false;
      if (payload.model !== model.id)
        return false;
      return true;
    },
    noteChunk(data) {
      if (isGenerationStart(data)) {
        snapshot = undefined;
        tracking = false;
        return;
      }
      const progress = readProgress(data);
      if (!progress)
        return;
      const total = progress.total;
      const cache = progress.cache ?? 0;
      const processed = progress.processed ?? 0;
      const timeMs = progress.time_ms ?? 0;
      const uncachedTotal = Math.max(0, total - cache);
      const uncachedProcessed = Math.min(uncachedTotal, Math.max(0, processed - cache));
      if (!assessed) {
        assessed = true;
        firstSeenAt = now();
        if (uncachedTotal > SIGNIFICANT_TOKENS)
          tracking = true;
        previousProcessed = cache;
      } else if (!tracking && now() - firstSeenAt > SIGNIFICANT_MS) {
        tracking = true;
      }
      if (!tracking)
        return;
      const deltaProcessed = processed - previousProcessed;
      const deltaMs = timeMs - previousTimeMs;
      const ratePerSec = deltaProcessed > 0 && deltaMs > 0 ? deltaProcessed / (deltaMs / 1000) : null;
      const remaining = Math.max(0, total - processed);
      snapshot = {
        percent: uncachedTotal > 0 ? uncachedProcessed / uncachedTotal : 1,
        processed,
        total,
        uncachedTotal,
        uncachedProcessed,
        ratePerSec,
        etaSec: ratePerSec !== null && ratePerSec > 0 && remaining > 0 ? remaining / ratePerSec : null
      };
      previousProcessed = processed;
      previousTimeMs = timeMs;
      return snapshot;
    },
    getSnapshot: () => snapshot,
    clear: reset
  };
}
function createPrefillThrottle(options) {
  const now = options.now ?? Date.now;
  const minIntervalMs = options.minIntervalMs ?? RENDER_THROTTLE_MS;
  let lastRenderAt = Number.NEGATIVE_INFINITY;
  let cancelPending;
  return {
    note() {
      if (cancelPending)
        return;
      const elapsed = now() - lastRenderAt;
      if (elapsed >= minIntervalMs) {
        lastRenderAt = now();
        options.requestRender();
        return;
      }
      cancelPending = options.schedule(minIntervalMs - elapsed, () => {
        cancelPending = undefined;
        lastRenderAt = now();
        options.requestRender();
      });
    },
    cancel() {
      cancelPending?.();
      cancelPending = undefined;
    }
  };
}

// src/sidebar-panels.ts
var SIDEBAR_PANEL_EVENT_CHANNEL = "pi-atelier:sidebar-panels";
var SIDEBAR_PANEL_PROTOCOL_VERSION = 1;
var SIDEBAR_PANEL_MAX_TITLE_CHARS = 48;
var SIDEBAR_PANEL_MAX_ROWS = 24;
var SIDEBAR_PANEL_MAX_ROW_CHARS = 160;
var SIDEBAR_PANEL_MAX_RAW_TITLE_CODE_UNITS = SIDEBAR_PANEL_MAX_TITLE_CHARS * 8;
var SIDEBAR_PANEL_MAX_RAW_ROW_CODE_UNITS = SIDEBAR_PANEL_MAX_ROW_CHARS * 8;
var SIDEBAR_PANEL_MAX_ID_CHARS = 128;
var SIDEBAR_PANEL_MAX_RAW_REQUEST_ID_CODE_UNITS = 256;
var SIDEBAR_PANEL_MAX_SOURCE_CHARS = 128;
var SIDEBAR_PANEL_MAX_PANELS = 64;
var SIDEBAR_PANEL_MAX_TRACKED_SOURCES = SIDEBAR_PANEL_MAX_PANELS;
var BUILTIN_SIDEBAR_PANEL_IDS = [
  "agent",
  "activity",
  "alerts",
  "todos",
  "context",
  "prefill",
  "workspace",
  "usage",
  "subagents",
  "tools"
];
var DEFAULT_SIDEBAR_PANEL_LAYOUT = BUILTIN_SIDEBAR_PANEL_IDS.map((id) => ({
  id,
  visible: true
}));
var BUILTIN_IDS = new Set(BUILTIN_SIDEBAR_PANEL_IDS);
var BUILTIN_PANEL_ORDER = BUILTIN_SIDEBAR_PANEL_IDS;
var BUILTIN_PANEL_RANKS = new Map(BUILTIN_PANEL_ORDER.map((id, index) => [id, index]));
var NAMESPACED_ID = /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*(?![\s\S])/;
var PANEL_ROLE_VALUES = [
  "primary",
  "accent",
  "muted",
  "dim",
  "ready",
  "working",
  "success",
  "caution",
  "warning",
  "error",
  "input",
  "output",
  "cache",
  "context"
];
var PANEL_ROLES = new Set(PANEL_ROLE_VALUES);
function isSidebarPanelContributionId(value) {
  return typeof value === "string" && value.length <= SIDEBAR_PANEL_MAX_ID_CHARS && NAMESPACED_ID.test(value);
}
function isSidebarPanelId(value) {
  return typeof value === "string" && (BUILTIN_IDS.has(value) || isSidebarPanelContributionId(value));
}
var isBuiltinSidebarPanelId = (value) => typeof value === "string" && BUILTIN_IDS.has(value);
function isSidebarPanelSource(value) {
  return typeof value === "string" && value.length <= SIDEBAR_PANEL_MAX_SOURCE_CHARS && value.trim() !== "";
}
function isSidebarPanelRequestId(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > SIDEBAR_PANEL_MAX_RAW_REQUEST_ID_CODE_UNITS || value.trim() === "")
    return false;
  for (let index = 0;index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit < 32 || codeUnit >= 127 && codeUnit <= 159)
      return false;
    if (codeUnit >= 55296 && codeUnit <= 56319) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 56320 || next > 57343)
        return false;
      index += 1;
    } else if (codeUnit >= 56320 && codeUnit <= 57343) {
      return false;
    }
  }
  return true;
}
function isSidebarPanelRole(value) {
  return typeof value === "string" && PANEL_ROLES.has(value);
}
function normalizeSidebarPanelLayout(entries, warnings = []) {
  const normalized = [];
  const seen = new Set;
  for (const entry of entries) {
    if (!isSidebarPanelId(entry.id)) {
      warnings.push(`Unknown sidebar panel: ${String(entry.id)}`);
      continue;
    }
    if (seen.has(entry.id)) {
      warnings.push(`Ignoring duplicate sidebar panel: ${entry.id}`);
      continue;
    }
    seen.add(entry.id);
    normalized.push({ id: entry.id, visible: entry.visible });
  }
  for (const id of BUILTIN_SIDEBAR_PANEL_IDS) {
    if (seen.has(id))
      continue;
    const rank = BUILTIN_PANEL_RANKS.get(id) ?? 0;
    const before = BUILTIN_PANEL_ORDER[rank - 1];
    const after = BUILTIN_PANEL_ORDER[rank + 1];
    const precedingIndex = before === undefined ? -1 : normalized.findIndex((entry) => entry.id === before);
    const followingIndex = after === undefined ? -1 : normalized.findIndex((entry) => entry.id === after);
    if (precedingIndex >= 0) {
      normalized.splice(precedingIndex + 1, 0, { id, visible: true });
    } else if (followingIndex >= 0) {
      normalized.splice(followingIndex, 0, { id, visible: true });
    } else {
      normalized.push({ id, visible: true });
    }
    seen.add(id);
  }
  if (!normalized.some((entry) => entry.visible)) {
    warnings.push("sidebarPanelLayout must include at least one visible panel; restoring agent");
    const agent = normalized.find((entry) => entry.id === "agent");
    if (agent)
      agent.visible = true;
  }
  return normalized;
}
var isSidebarPanelTextWithinRawLimit = (value, maxCodeUnits) => typeof value === "string" && value.length <= maxCodeUnits;
function sanitizeKeyValues(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > SIDEBAR_PANEL_MAX_ROWS)
    return;
  const rows = [];
  for (const row of value) {
    if (!isRecord(row) || !isSidebarPanelTextWithinRawLimit(row.label, SIDEBAR_PANEL_MAX_RAW_ROW_CODE_UNITS) || !isSidebarPanelTextWithinRawLimit(row.value, SIDEBAR_PANEL_MAX_RAW_ROW_CODE_UNITS))
      return;
    const label = sanitizeInline(row.label);
    const text = sanitizeInline(row.value);
    if (Array.from(label).length > SIDEBAR_PANEL_MAX_ROW_CHARS || Array.from(text).length > SIDEBAR_PANEL_MAX_ROW_CHARS)
      return;
    if (!label && !text)
      continue;
    rows.push({
      label,
      value: text,
      ...typeof row.progress === "number" && Number.isFinite(row.progress) && row.progress >= 0 && row.progress <= 1 ? { progress: row.progress } : {},
      ...isSidebarPanelRole(row.labelRole) ? { labelRole: row.labelRole } : {},
      ...isSidebarPanelRole(row.valueRole) ? { valueRole: row.valueRole } : {}
    });
  }
  return rows.length ? rows : undefined;
}
function sanitizeContribution(value) {
  if (!isRecord(value) || !isSidebarPanelContributionId(value.id) || !isSidebarPanelTextWithinRawLimit(value.title, SIDEBAR_PANEL_MAX_RAW_TITLE_CODE_UNITS) || !Array.isArray(value.rows) || value.rows.length > SIDEBAR_PANEL_MAX_ROWS)
    return;
  const title = sanitizeInline(value.title);
  if (Array.from(title).length > SIDEBAR_PANEL_MAX_TITLE_CHARS)
    return;
  const rows = [];
  for (const row of value.rows) {
    const text = typeof row === "string" ? row : isRecord(row) && typeof row.text === "string" ? row.text : undefined;
    if (!isSidebarPanelTextWithinRawLimit(text, SIDEBAR_PANEL_MAX_RAW_ROW_CODE_UNITS))
      return;
    const cleaned = sanitizeInline(text);
    if (Array.from(cleaned).length > SIDEBAR_PANEL_MAX_ROW_CHARS)
      return;
    rows.push({
      text: cleaned,
      ...isRecord(row) && isSidebarPanelRole(row.role) ? { role: row.role } : {}
    });
  }
  const keyValues = sanitizeKeyValues(value.keyValues);
  return {
    id: value.id,
    title,
    rows,
    ...keyValues ? { keyValues } : {},
    ...isSidebarPanelRole(value.role) ? { role: value.role } : {}
  };
}
function sourceFor(id) {
  return id.slice(0, id.indexOf(":"));
}
function isEvent(value) {
  return isRecord(value) && value.version === SIDEBAR_PANEL_PROTOCOL_VERSION && typeof value.type === "string";
}
var sidebarPanelRevisionAllocators = new WeakMap;
function nextSidebarPanelRevision(events, source) {
  if (!isSidebarPanelSource(source))
    return;
  let revisions = sidebarPanelRevisionAllocators.get(events);
  if (!revisions) {
    revisions = new Map;
    sidebarPanelRevisionAllocators.set(events, revisions);
  }
  const previous = revisions.get(source);
  if (previous === undefined && revisions.size >= SIDEBAR_PANEL_MAX_TRACKED_SOURCES)
    return;
  const next = (previous ?? 0) + 1;
  revisions.set(source, next);
  return next;
}
function sidebarPanelDataEqual(first, second) {
  return first.id === second.id && first.title === second.title && first.role === second.role && first.source === second.source && first.rows.length === second.rows.length && first.rows.every((row, index) => row.text === second.rows[index]?.text && row.role === second.rows[index]?.role) && JSON.stringify(first.keyValues) === JSON.stringify(second.keyValues);
}
function createSidebarPanelRegistry(options = {}) {
  const panels = new Map;
  const revisions = new Map;
  let disposed = false;
  let requestSequence = 0;
  const requestPrefix = options.instanceId ?? "atelier";
  let unsubscribe;
  const changed = () => {
    try {
      options.onChange?.();
    } catch {}
  };
  const canAcceptRevision = (source, revision) => revision > (revisions.get(source) ?? 0);
  const trackRevision = (source, revision) => {
    revisions.set(source, revision);
  };
  const canTrackSource = (source) => revisions.has(source) || revisions.size < SIDEBAR_PANEL_MAX_TRACKED_SOURCES;
  const canRegister = (panel, source) => {
    const owner = panels.get(panel.id)?.source;
    if (owner !== undefined && owner !== source)
      return false;
    return panels.has(panel.id) || panels.size < SIDEBAR_PANEL_MAX_PANELS;
  };
  const applyRegister = (safe, resolvedSource) => {
    const next = { ...safe, source: resolvedSource };
    const previous = panels.get(safe.id);
    if (previous && sidebarPanelDataEqual(previous, next))
      return false;
    panels.set(safe.id, next);
    changed();
    return true;
  };
  const register = (panel, source) => {
    if (disposed)
      return false;
    const safe = sanitizeContribution(panel);
    if (!safe)
      return false;
    const resolvedSource = source ?? sourceFor(safe.id);
    if (!isSidebarPanelSource(resolvedSource) || !canRegister(safe, resolvedSource))
      return false;
    return applyRegister(safe, resolvedSource);
  };
  const canUnregister = (id, source) => panels.get(id)?.source === source;
  const applyUnregister = (id) => {
    const removed = panels.delete(id);
    changed();
    return removed;
  };
  const unregister = (id, source) => {
    if (disposed)
      return false;
    const resolvedSource = source ?? sourceFor(id);
    if (!isSidebarPanelSource(resolvedSource) || !canUnregister(id, resolvedSource))
      return false;
    return applyUnregister(id);
  };
  const handleEvent = (data) => {
    if (disposed || !isEvent(data))
      return;
    if (data.type === "discover")
      return;
    if (!isSidebarPanelSource(data.source) || typeof data.revision !== "number" || !Number.isSafeInteger(data.revision) || data.type === "register" && data.requestId !== undefined && !isSidebarPanelRequestId(data.requestId))
      return;
    const source = data.source;
    const revision = data.revision;
    let panel;
    let id;
    if (data.type === "register") {
      panel = sanitizeContribution(data.panel);
      if (!panel)
        return;
    } else {
      if (data.type !== "unregister" || !isSidebarPanelContributionId(data.id))
        return;
      id = data.id;
    }
    if (!canTrackSource(source) || !canAcceptRevision(source, revision))
      return;
    if (panel) {
      if (!canRegister(panel, source))
        return;
      trackRevision(source, revision);
      applyRegister(panel, source);
    } else if (id !== undefined) {
      if (!canUnregister(id, source))
        return;
      trackRevision(source, revision);
      applyUnregister(id);
    }
  };
  if (options.events) {
    unsubscribe = options.events.on(SIDEBAR_PANEL_EVENT_CHANNEL, handleEvent);
  }
  const requestDiscovery = () => {
    if (disposed || !options.events)
      return;
    requestSequence += 1;
    const requestId = `${requestPrefix}-${requestSequence}`;
    options.events.emit(SIDEBAR_PANEL_EVENT_CHANNEL, {
      version: SIDEBAR_PANEL_PROTOCOL_VERSION,
      type: "discover",
      requestId
    });
  };
  requestDiscovery();
  return {
    register,
    unregister,
    handleEvent,
    requestDiscovery,
    getAvailable: () => [...panels.values()],
    get: (id) => panels.get(id),
    dispose: () => {
      if (disposed)
        return;
      disposed = true;
      unsubscribe?.();
      unsubscribe = undefined;
      panels.clear();
    }
  };
}
function registerSidebarPanel(pi, panel, options = {}) {
  const initial = sanitizeContribution(panel);
  const stableId = initial?.id;
  const requestedSource = options.source ?? (stableId ? sourceFor(stableId) : undefined);
  const source = stableId && requestedSource !== undefined && isSidebarPanelSource(requestedSource) ? requestedSource : undefined;
  let current = source && stableId && initial ? initial : undefined;
  let disposed = false;
  const emitRegister = (requestId) => {
    if (disposed || !source || !current || requestId !== undefined && !isSidebarPanelRequestId(requestId))
      return;
    const revision = nextSidebarPanelRevision(pi.events, source);
    if (revision === undefined)
      return;
    pi.events.emit(SIDEBAR_PANEL_EVENT_CHANNEL, {
      version: SIDEBAR_PANEL_PROTOCOL_VERSION,
      type: "register",
      source,
      revision,
      panel: current,
      ...requestId ? { requestId } : {}
    });
  };
  const unsubscribe = source ? pi.events.on(SIDEBAR_PANEL_EVENT_CHANNEL, (data) => {
    if (!isEvent(data) || data.type !== "discover" || !isSidebarPanelRequestId(data.requestId))
      return;
    emitRegister(data.requestId);
  }) : () => {
    return;
  };
  if (current)
    emitRegister();
  return {
    update(next) {
      if (disposed || !source || !stableId)
        return;
      const safe = sanitizeContribution(next);
      if (!safe)
        return;
      current = { ...safe, id: stableId };
      emitRegister();
    },
    dispose() {
      if (disposed)
        return;
      disposed = true;
      unsubscribe();
      if (!source || !current)
        return;
      const revision = nextSidebarPanelRevision(pi.events, source);
      if (revision === undefined)
        return;
      pi.events.emit(SIDEBAR_PANEL_EVENT_CHANNEL, {
        version: SIDEBAR_PANEL_PROTOCOL_VERSION,
        type: "unregister",
        source,
        revision,
        id: current.id
      });
    }
  };
}

// src/split-pane.ts
import { compositeTuiLine as compositeTuiLine2, HStack, isViewportTUI, matchesKey, sliceByColumn } from "@earendil-works/pi-tui";

// src/image-compositor.ts
import { compositeTuiLine, visibleWidth } from "@earendil-works/pi-tui";
var RESET = "\x1B[0m\x1B]8;;\x07";
var KITTY_IMAGE = "\x1B_G";
var ITERM_IMAGE = "\x1B]1337;File=";
var IMAGE_COMMAND = /(?:\u001b_G[\s\S]*?\u001b\\)+|(?:\u001b\[\d+A)?\u001b\]1337;File=[^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
var IMAGE_COMPOSITOR = Symbol("pi-atelier.image-compositor");
function findOwnMethod(start, name) {
  for (let target = start;target; target = Object.getPrototypeOf(target)) {
    const value = Object.getOwnPropertyDescriptor(target, name)?.value;
    if (typeof value === "function")
      return value;
  }
  return;
}
var asRenderer = (tui) => tui;
var isImageLine = (line) => line.includes(KITTY_IMAGE) || line.includes(ITERM_IMAGE);
var hasModal = (renderer) => renderer.overlayStack.some((entry) => !entry.options?.nonCapturing && renderer.isOverlayVisible(entry));
function separateImages(lines) {
  const images = [];
  const text = lines.map((line, row) => {
    if (!isImageLine(line))
      return line;
    let result = "";
    let offset = 0;
    for (const match of line.matchAll(IMAGE_COMMAND)) {
      result += line.slice(offset, match.index);
      const sequence = match[0];
      const iterm = sequence.includes(ITERM_IMAGE);
      const up = iterm ? Number(/^\u001b\[(\d+)A/.exec(sequence)?.[1] ?? 0) : 0;
      const rows = iterm ? up + 1 : Number(/(?:^|,)r=(\d+)(?:,|;)/.exec(sequence)?.[1] ?? 1);
      images.push({
        row,
        column: visibleWidth(result),
        top: row - up,
        bottom: row - up + rows,
        sequence,
        iterm
      });
      offset = match.index + sequence.length;
    }
    return result + line.slice(offset);
  });
  return { text, images };
}
function hasCapturingOverlay(tui) {
  const renderer = asRenderer(tui);
  if (!Array.isArray(renderer.overlayStack) || typeof renderer.isOverlayVisible !== "function")
    return true;
  return hasModal(renderer);
}
function acquireImageCompositor(tui, getSidebar) {
  const renderer = asRenderer(tui);
  if (typeof renderer.compositeOverlays !== "function" || typeof renderer.isOverlayVisible !== "function" || !Array.isArray(renderer.overlayStack)) {
    return () => {
      return;
    };
  }
  let adapter = renderer[IMAGE_COMPOSITOR];
  if (!adapter) {
    const base = findOwnMethod(renderer, "compositeOverlays");
    if (!base)
      return () => {
        return;
      };
    const clients = new Set;
    let concreteRenderer = renderer;
    let rendered = false;
    const composite = function(lines, width, height) {
      concreteRenderer = this;
      rendered = true;
      if (clients.size === 0 || !lines.some(isImageLine))
        return base.call(this, lines, width, height);
      const { text, images } = separateImages(lines);
      if (images.length === 0)
        return base.call(this, lines, width, height);
      for (const client2 of clients) {
        const sidebar = client2.getSidebar?.(width);
        if (!sidebar)
          continue;
        for (const { row } of images) {
          text[row] = compositeTuiLine(text[row] ?? "", sidebar.lines[row] ?? "", sidebar.column, sidebar.width, width);
        }
      }
      const result = base.call(this, text, width, height);
      const modalVisible = hasModal(this);
      const viewportTop = Math.max(0, result.length - height);
      for (const image of images) {
        if (modalVisible && image.bottom > viewportTop && image.top < result.length) {
          if (image.iterm) {
            for (let row = Math.max(0, image.top);row < Math.min(result.length, image.bottom); row++) {
              result[row] += RESET;
            }
          }
          continue;
        }
        const line = result[image.row] ?? "";
        const endColumn = Math.min(width, visibleWidth(line) + 1);
        result[image.row] = `${line}${RESET}\x1B[${image.column + 1}G${image.sequence}\x1B[${endColumn}G`;
      }
      return result;
    };
    renderer.compositeOverlays = composite;
    adapter = {
      clients,
      restore() {
        if (concreteRenderer[IMAGE_COMPOSITOR] !== adapter)
          return;
        if (!rendered || concreteRenderer.compositeOverlays === composite) {
          concreteRenderer.compositeOverlays = base;
        }
        concreteRenderer[IMAGE_COMPOSITOR] = undefined;
      }
    };
    renderer[IMAGE_COMPOSITOR] = adapter;
  }
  const client = { getSidebar };
  adapter.clients.add(client);
  let released = false;
  return () => {
    if (released)
      return;
    released = true;
    adapter.clients.delete(client);
    if (adapter.clients.size > 0)
      return;
    adapter.restore();
  };
}
function createImageCompositorBinding(tui, getSidebar) {
  let current;
  let release;
  let disposed = false;
  const sync = () => {
    if (disposed)
      return;
    const renderer = asRenderer(tui);
    if (current && renderer[IMAGE_COMPOSITOR] === current)
      return;
    release?.();
    release = acquireImageCompositor(tui, getSidebar);
    current = renderer[IMAGE_COMPOSITOR];
  };
  sync();
  return {
    sync,
    dispose() {
      if (disposed)
        return;
      disposed = true;
      release?.();
      release = undefined;
      current = undefined;
    }
  };
}

// src/split-pane.ts
var ENABLE_MOUSE = "\x1B[?1002h\x1B[?1006h";
var DISABLE_MOUSE = "\x1B[?1006l\x1B[?1002l";
var SGR_MOUSE = /^\u001b\[<(\d+);(\d+);(\d+)([Mm])$/;
var MOUSE_BUTTON_MASK = 3;
var MOUSE_MOTION_BIT = 32;
var MOUSE_WHEEL_BIT = 64;
var PI_084_REGULAR_RENDER_ADAPTER = Symbol("pi-atelier.regular-render-adapter");
var PI_084_FULLSCREEN_LAYOUT_ADAPTER = Symbol("pi-atelier.fullscreen-layout-adapter");
var PI_084_FULLSCREEN_OVERLAY_ADAPTER = Symbol("pi-atelier.fullscreen-overlay-adapter");
var PI_084_FULLSCREEN_SELECTION_ADAPTER = Symbol("pi-atelier.fullscreen-selection-adapter");
function parseSgrMouseEvent(data) {
  const match = SGR_MOUSE.exec(data);
  if (!match)
    return;
  const button = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  if (![button, x, y].every(Number.isFinite) || x < 1 || y < 1)
    return;
  return { button, x, y, release: match[4] === "m", motion: (button & MOUSE_MOTION_BIT) !== 0 };
}
var DEFAULT_SIDEBAR_WIDTH = 44;
var MIN_SIDEBAR_WIDTH = 28;
var MAX_SIDEBAR_WIDTH = 72;
var MIN_MAIN_WIDTH = 64;
var AUTO_MAIN_WIDTH = 80;
var AUTO_REOPEN_MARGIN = 8;
var EMPTY_SIDEBAR_COMPONENT = {
  render: () => [],
  invalidate() {}
};
var sidebarLimit = (terminalWidth) => Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, terminalWidth - MIN_MAIN_WIDTH));
function createSplitPaneController(options = {}) {
  const initialWidth = options.initialWidth ?? DEFAULT_SIDEBAR_WIDTH;
  let sidebarWidth = Number.isInteger(initialWidth) ? clamp(initialWidth, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH) : DEFAULT_SIDEBAR_WIDTH;
  let tui;
  let enabled = false;
  let mode = "manual";
  let autoExpanded;
  let lastPresentation = "off";
  let visibilityNotificationPending = false;
  let disposed = false;
  let resizing = false;
  let resizeStartWidth = sidebarWidth;
  let dragging = false;
  let unsubscribeInput;
  let resizeMouseTerminal;
  let fullscreenSidebarComponent;
  let fullscreenSidebarHidden = false;
  let imageCompositor;
  const adapterOwner = {};
  const findPrototypeRender = (nextTui) => {
    const prototype = Object.getPrototypeOf(nextTui);
    if (prototype?.constructor?.name !== "TuiMainScreen")
      return;
    return findOwnMethod(prototype, "render");
  };
  const findPrototypeOverlayMethods = (nextTui) => {
    const prototype = Object.getPrototypeOf(nextTui);
    const showOverlay = findOwnMethod(prototype, "showOverlay");
    const hideOverlay = findOwnMethod(prototype, "hideOverlay");
    return showOverlay && hideOverlay ? { showOverlay, hideOverlay } : undefined;
  };
  const clearFullscreenSidebar = () => {
    fullscreenSidebarComponent = undefined;
    fullscreenSidebarHidden = false;
  };
  const fullscreenSidebarWidth = (terminalWidth) => fullscreenSidebarComponent && !fullscreenSidebarHidden ? effectiveSidebarWidth(terminalWidth) : 0;
  const isPiFullscreenRenderer = () => tui?.mode === "fullscreen" && isViewportTUI(tui);
  const syncRegularRenderAdapter = () => {
    if (!tui || tui.mode !== "regular")
      return;
    const adaptedTui = tui;
    if (adaptedTui[PI_084_REGULAR_RENDER_ADAPTER])
      return;
    const baseRender = findPrototypeRender(tui);
    if (!baseRender)
      return;
    adaptedTui[PI_084_REGULAR_RENDER_ADAPTER] = { owner: adapterOwner, baseRender };
    adaptedTui.render = (width) => {
      reconcileResizeWidth(width);
      const sidebar = effectiveSidebarWidth(width);
      return Reflect.apply(baseRender, tui, [sidebar > 0 ? width - sidebar : width]);
    };
  };
  const restoreRegularRenderAdapter = () => {
    if (!tui)
      return;
    const adaptedTui = tui;
    const currentState = adaptedTui[PI_084_REGULAR_RENDER_ADAPTER];
    if (currentState?.owner !== adapterOwner)
      return;
    adaptedTui.render = currentState.baseRender;
    adaptedTui[PI_084_REGULAR_RENDER_ADAPTER] = undefined;
  };
  const createFullscreenSplitRoot = (originalRoot) => new HStack([
    { component: originalRoot, basis: 0, grow: 1, shrink: 1, minSize: MIN_MAIN_WIDTH },
    {
      component: fullscreenSidebarComponent ?? EMPTY_SIDEBAR_COMPONENT,
      basis: sidebarWidth,
      grow: 0,
      shrink: 1,
      minSize: MIN_SIDEBAR_WIDTH,
      maxSize: MAX_SIDEBAR_WIDTH,
      visible: ({ width }) => observeWidth(width) && !fullscreenSidebarHidden
    }
  ]);
  const syncFullscreenLayoutAdapter = () => {
    if (!isPiFullscreenRenderer() || !tui)
      return;
    const adaptedTui = tui;
    const currentState = adaptedTui[PI_084_FULLSCREEN_LAYOUT_ADAPTER];
    if (currentState && currentState.owner !== adapterOwner)
      return;
    const currentRoot = adaptedTui.layoutRoot;
    if (currentState?.owner === adapterOwner && currentRoot === currentState.splitRoot) {
      if (currentState.sidebarWidth === sidebarWidth && currentState.sidebarComponent === fullscreenSidebarComponent) {
        return;
      }
      const splitRoot2 = createFullscreenSplitRoot(currentState.originalRoot);
      adaptedTui.setLayoutRoot(splitRoot2);
      currentState.splitRoot = splitRoot2;
      currentState.sidebarWidth = sidebarWidth;
      currentState.sidebarComponent = fullscreenSidebarComponent;
      return;
    }
    if (!currentRoot)
      return;
    const splitRoot = createFullscreenSplitRoot(currentRoot);
    adaptedTui.setLayoutRoot(splitRoot);
    adaptedTui[PI_084_FULLSCREEN_LAYOUT_ADAPTER] = {
      owner: adapterOwner,
      originalRoot: currentRoot,
      splitRoot,
      sidebarWidth,
      sidebarComponent: fullscreenSidebarComponent
    };
  };
  const restoreFullscreenLayoutAdapter = () => {
    if (!tui)
      return;
    const adaptedTui = tui;
    const currentState = adaptedTui[PI_084_FULLSCREEN_LAYOUT_ADAPTER];
    if (currentState?.owner !== adapterOwner)
      return;
    if (adaptedTui.layoutRoot === currentState.splitRoot) {
      adaptedTui.setLayoutRoot(currentState.originalRoot);
    }
    adaptedTui[PI_084_FULLSCREEN_LAYOUT_ADAPTER] = undefined;
  };
  const syncFullscreenSelectionAdapter = () => {
    if (!isPiFullscreenRenderer() || !tui)
      return;
    const adaptedTui = tui;
    if (adaptedTui[PI_084_FULLSCREEN_SELECTION_ADAPTER])
      return;
    const prototype = Object.getPrototypeOf(tui);
    const baseSelectionColumns = findOwnMethod(prototype, "getSelectionColumns");
    if (!baseSelectionColumns)
      return;
    const baseApplySelection = findOwnMethod(prototype, "applySelection");
    adaptedTui[PI_084_FULLSCREEN_SELECTION_ADAPTER] = {
      owner: adapterOwner,
      baseSelectionColumns,
      ...baseApplySelection ? { baseApplySelection } : {}
    };
    adaptedTui.getSelectionColumns = function(line, row, selection, minColumn, maxColumn) {
      const columns = baseSelectionColumns.call(this, line, row, selection, minColumn, maxColumn);
      if (selection.start.scrollView || this.hasOverlay())
        return columns;
      const width = this.terminal.columns;
      const sidebar = fullscreenSidebarWidth(width);
      if (sidebar <= 0)
        return columns;
      const mainWidth = width - sidebar;
      return { start: Math.min(columns.start, mainWidth), end: Math.min(columns.end, mainWidth) };
    };
    if (!baseApplySelection)
      return;
    adaptedTui.applySelection = function(screen, layout2) {
      const selected = baseApplySelection.call(this, screen, layout2);
      const width = this.terminal.columns;
      const sidebar = fullscreenSidebarWidth(width);
      if (sidebar <= 0 || this.hasOverlay())
        return selected;
      const mainWidth = width - sidebar;
      return selected.map((line, row) => {
        const original = screen[row];
        if (original === undefined || line === original)
          return line;
        return compositeTuiLine2(original, sliceByColumn(line, 0, mainWidth, true), 0, mainWidth, width);
      });
    };
  };
  const restoreFullscreenSelectionAdapter = () => {
    if (!tui)
      return;
    const adaptedTui = tui;
    const state = adaptedTui[PI_084_FULLSCREEN_SELECTION_ADAPTER];
    if (state?.owner !== adapterOwner)
      return;
    adaptedTui.getSelectionColumns = state.baseSelectionColumns;
    if (state.baseApplySelection)
      adaptedTui.applySelection = state.baseApplySelection;
    adaptedTui[PI_084_FULLSCREEN_SELECTION_ADAPTER] = undefined;
  };
  const syncFullscreenOverlayAdapter = () => {
    if (!isPiFullscreenRenderer() || !tui)
      return;
    const adaptedTui = tui;
    if (adaptedTui[PI_084_FULLSCREEN_OVERLAY_ADAPTER])
      return;
    const baseMethods = findPrototypeOverlayMethods(tui);
    if (!baseMethods)
      return;
    const { showOverlay: baseShowOverlay, hideOverlay: baseHideOverlay } = baseMethods;
    adaptedTui[PI_084_FULLSCREEN_OVERLAY_ADAPTER] = {
      owner: adapterOwner,
      baseShowOverlay,
      baseHideOverlay
    };
    adaptedTui.showOverlay = (component, overlayOptions) => {
      const state = adaptedTui[PI_084_FULLSCREEN_OVERLAY_ADAPTER];
      const base = state?.owner === adapterOwner ? state.baseShowOverlay : baseShowOverlay;
      if (enabled && overlayOptions === overlayLayout && isPiFullscreenRenderer()) {
        fullscreenSidebarComponent = component;
        fullscreenSidebarHidden = false;
        syncFullscreenLayoutAdapter();
        const handle = Reflect.apply(base, tui, [
          component,
          { ...overlayOptions, visible: () => false }
        ]);
        return {
          hide() {
            try {
              handle.hide();
            } finally {
              if (fullscreenSidebarComponent === component) {
                enabled = false;
                fullscreenSidebarComponent = undefined;
                syncFullscreenLayoutAdapter();
                tui?.requestRender();
              }
            }
          },
          setHidden(hidden) {
            handle.setHidden(hidden);
            if (fullscreenSidebarComponent === component) {
              fullscreenSidebarHidden = hidden;
              tui?.requestRender();
            }
          },
          isHidden: () => handle.isHidden(),
          focus: () => handle.focus(),
          unfocus: (options2) => handle.unfocus(options2),
          isFocused: () => handle.isFocused()
        };
      }
      return Reflect.apply(base, tui, [component, overlayOptions]);
    };
    adaptedTui.hideOverlay = () => {
      const state = adaptedTui[PI_084_FULLSCREEN_OVERLAY_ADAPTER];
      const base = state?.owner === adapterOwner ? state.baseHideOverlay : baseHideOverlay;
      const hadVisibleOverlay = tui?.hasOverlay() ?? false;
      Reflect.apply(base, tui, []);
      if (!hadVisibleOverlay && fullscreenSidebarComponent) {
        enabled = false;
        clearFullscreenSidebar();
        syncFullscreenLayoutAdapter();
        tui?.requestRender();
      }
    };
  };
  const restoreFullscreenOverlayAdapter = () => {
    if (!tui)
      return;
    const adaptedTui = tui;
    const currentState = adaptedTui[PI_084_FULLSCREEN_OVERLAY_ADAPTER];
    if (currentState?.owner !== adapterOwner)
      return;
    adaptedTui.showOverlay = currentState.baseShowOverlay;
    adaptedTui.hideOverlay = currentState.baseHideOverlay;
    adaptedTui[PI_084_FULLSCREEN_OVERLAY_ADAPTER] = undefined;
  };
  const prioritizeFullscreenResizeInput = (handler) => {
    if (!isPiFullscreenRenderer())
      return;
    const listeners = tui.inputListeners;
    if (!(listeners instanceof Set) || !listeners.delete(handler))
      return;
    const existingListeners = [...listeners];
    listeners.clear();
    listeners.add(handler);
    for (const listener of existingListeners)
      listeners.add(listener);
  };
  const safely = (action) => {
    try {
      action();
    } catch {}
  };
  const resolveLayout = (terminalWidth) => {
    const reportedWidth = tui?.terminal.columns ?? terminalWidth;
    const validWidth = Number.isFinite(terminalWidth) && terminalWidth > 0 && Number.isFinite(reportedWidth) && reportedWidth > 0;
    if (enabled && mode === "auto" && validWidth) {
      const threshold = AUTO_MAIN_WIDTH + sidebarWidth;
      autoExpanded = terminalWidth >= threshold + (autoExpanded === false ? AUTO_REOPEN_MARGIN : 0);
    }
    const presentation = !enabled ? "off" : !validWidth || terminalWidth < MIN_MAIN_WIDTH + MIN_SIDEBAR_WIDTH ? "too-narrow" : mode === "auto" && !autoExpanded ? "auto-collapsed" : "shown";
    const effectiveWidth = presentation === "shown" ? clamp(sidebarWidth, MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, terminalWidth - MIN_MAIN_WIDTH)) : 0;
    if (presentation !== lastPresentation) {
      lastPresentation = presentation;
      if (!visibilityNotificationPending) {
        visibilityNotificationPending = true;
        queueMicrotask(() => {
          visibilityNotificationPending = false;
          if (!disposed)
            safely(() => options.onVisibilityChange?.());
        });
      }
    }
    return { presentation, sidebarWidth: effectiveWidth, mainWidth: terminalWidth - effectiveWidth };
  };
  const observeWidth = (terminalWidth) => {
    reconcileResizeWidth(terminalWidth);
    syncOverlayWidth(terminalWidth);
    return visibleAt(terminalWidth);
  };
  const visibleAt = (terminalWidth) => resolveLayout(terminalWidth).presentation === "shown";
  const effectiveSidebarWidth = (terminalWidth) => resolveLayout(terminalWidth).sidebarWidth;
  const overlayLayout = {
    anchor: "top-right",
    width: sidebarWidth,
    maxHeight: "100%",
    margin: 0,
    nonCapturing: true,
    visible: observeWidth
  };
  const syncOverlayWidth = (terminalWidth = tui?.terminal.columns) => {
    const effectiveWidth = terminalWidth === undefined ? 0 : effectiveSidebarWidth(terminalWidth);
    overlayLayout.width = effectiveWidth > 0 ? effectiveWidth : sidebarWidth;
  };
  const requestRender = () => {
    imageCompositor?.sync();
    syncRegularRenderAdapter();
    syncFullscreenLayoutAdapter();
    syncFullscreenOverlayAdapter();
    syncFullscreenSelectionAdapter();
    tui?.requestRender();
  };
  const stopResize = (restore) => {
    if (!resizing && !resizeMouseTerminal && !unsubscribeInput)
      return;
    if (restore) {
      sidebarWidth = resizeStartWidth;
    }
    resizing = false;
    syncOverlayWidth();
    syncFullscreenLayoutAdapter();
    const mouseTerminal = resizeMouseTerminal;
    const unsubscribe = unsubscribeInput;
    dragging = false;
    resizeMouseTerminal = undefined;
    unsubscribeInput = undefined;
    if (mouseTerminal)
      safely(() => mouseTerminal.write(DISABLE_MOUSE));
    if (unsubscribe)
      safely(unsubscribe);
    safely(() => options.onResizeChange?.(false));
    if (!restore && sidebarWidth !== resizeStartWidth)
      safely(() => options.onResizeCommit?.(sidebarWidth));
    safely(requestRender);
  };
  const reconcileResizeWidth = (terminalWidth) => {
    if (!resizing)
      return;
    if (!visibleAt(terminalWidth)) {
      stopResize(true);
      return;
    }
  };
  const attach = (nextTui) => {
    if (disposed)
      throw new Error("Cannot attach a disposed split pane");
    if (tui === nextTui)
      return;
    if (tui)
      throw new Error("Split pane is already attached to another TUI");
    tui = nextTui;
    imageCompositor = createImageCompositorBinding(nextTui, (width) => {
      const sidebar = isPiFullscreenRenderer() ? fullscreenSidebarWidth(width) : 0;
      if (sidebar === 0 || !fullscreenSidebarComponent)
        return;
      return { column: width - sidebar, width: sidebar, lines: fullscreenSidebarComponent.render(sidebar) };
    });
    reconcileResizeWidth(nextTui.terminal.columns);
    syncOverlayWidth(nextTui.terminal.columns);
    requestRender();
  };
  const setSidebarWidth = (width) => {
    const next = clamp(Number.isFinite(width) ? Math.trunc(width) : sidebarWidth, MIN_SIDEBAR_WIDTH, resizing && tui ? sidebarLimit(tui.terminal.columns) : MAX_SIDEBAR_WIDTH);
    if (next === sidebarWidth)
      return;
    sidebarWidth = next;
    syncOverlayWidth();
    requestRender();
  };
  const RESIZE_KEYS = [
    ["shift+left", 4],
    ["shift+right", -4],
    ["left", 1],
    ["right", -1]
  ];
  const handleResizeInput = (data) => {
    const mouse = parseSgrMouseEvent(data);
    if (mouse) {
      if (mouse.release) {
        if (dragging)
          stopResize(false);
      } else if (!mouse.motion && (mouse.button & MOUSE_BUTTON_MASK) === 0 && (mouse.button & MOUSE_WHEEL_BIT) === 0) {
        const dividerX = resolveLayout(tui?.terminal.columns ?? 0).mainWidth + 1;
        if (Math.abs(mouse.x - dividerX) <= 1)
          dragging = true;
      } else if (mouse.motion && dragging && tui) {
        const proposed = tui.terminal.columns - mouse.x + 1;
        setSidebarWidth(proposed);
      }
      return { consume: true };
    }
    const step = RESIZE_KEYS.find(([key]) => matchesKey(data, key))?.[1];
    if (step !== undefined) {
      setSidebarWidth(effectiveSidebarWidth(tui?.terminal.columns ?? 0) + step);
      return { consume: true };
    }
    if (matchesKey(data, "enter")) {
      stopResize(false);
      return { consume: true };
    }
    if (matchesKey(data, "escape")) {
      stopResize(true);
      return { consume: true };
    }
    return;
  };
  return {
    attach,
    show() {
      if (disposed || enabled)
        return;
      autoExpanded = undefined;
      enabled = true;
      syncOverlayWidth();
      requestRender();
    },
    hide() {
      stopResize(true);
      if (!enabled)
        return;
      enabled = false;
      clearFullscreenSidebar();
      syncFullscreenLayoutAdapter();
      requestRender();
    },
    setMode(nextMode) {
      if (disposed)
        return;
      stopResize(true);
      mode = nextMode;
      autoExpanded = undefined;
      syncOverlayWidth();
      requestRender();
    },
    getStatus: () => ({
      mode,
      enabled,
      presentation: resolveLayout(tui?.terminal.columns ?? 0).presentation
    }),
    setSidebarWidth,
    getSidebarWidth: () => sidebarWidth,
    beginResize() {
      if (mode === "auto") {
        options.onWarning?.("Switch to Manual mode with /atelier sidebar manual before resizing");
        return false;
      }
      if (resizing)
        return true;
      if (!tui || !enabled) {
        options.onWarning?.("Atelier sidebar is not ready to resize");
        return false;
      }
      if (!visibleAt(tui.terminal.columns)) {
        options.onWarning?.("Terminal is too narrow to resize the Atelier sidebar");
        return false;
      }
      if (!options.subscribeInput) {
        options.onWarning?.("Terminal input is unavailable for sidebar resizing");
        return false;
      }
      resizeStartWidth = sidebarWidth;
      resizing = true;
      syncOverlayWidth();
      syncFullscreenLayoutAdapter();
      dragging = false;
      try {
        unsubscribeInput = options.subscribeInput(handleResizeInput);
        prioritizeFullscreenResizeInput(handleResizeInput);
        resizeMouseTerminal = isPiFullscreenRenderer() ? undefined : tui.terminal;
        resizeMouseTerminal?.write(ENABLE_MOUSE);
        options.onResizeChange?.(true);
        requestRender();
        return true;
      } catch (error) {
        stopResize(true);
        safely(() => options.onError?.(error));
        return false;
      }
    },
    cancelResize: () => stopResize(true),
    isResizing: () => resizing,
    isEnabled: () => enabled,
    overlayOptions: () => overlayLayout,
    requestRender,
    dispose() {
      if (disposed)
        return;
      stopResize(true);
      disposed = true;
      enabled = false;
      clearFullscreenSidebar();
      restoreRegularRenderAdapter();
      restoreFullscreenOverlayAdapter();
      restoreFullscreenSelectionAdapter();
      restoreFullscreenLayoutAdapter();
      imageCompositor?.dispose();
      imageCompositor = undefined;
      tui?.requestRender();
      tui = undefined;
    }
  };
}

// src/config.ts
var MAX_CURRENCY_DECIMALS = 6;
var DEFAULT_CONFIG = {
  ...applyDisplayTemplate("editorial"),
  nerdFont: true,
  shortcut: "f6",
  toggleShortcut: "",
  contextWarning: 70,
  contextDanger: 90,
  currencyDecimals: 3,
  showSidebarToolNames: false,
  showSidebarOnStartup: true,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  sidebarPanelLayout: cloneLayout(DEFAULT_SIDEBAR_PANEL_LAYOUT),
  completionNotifications: true,
  showFooter: true,
  prefillEnabled: true,
  prefillViews: SIDEBAR_PREFILL_VIEWS,
  prefillProviders: ["llama.cpp"]
};
var isOrnament = (value) => value === "none" || value === "restrained";
var USER_ONLY_KEYS = new Set([
  "showSidebarOnStartup",
  "sidebarWidth",
  "completionNotifications",
  "nerdFont",
  "showFooter"
]);
var isEnoent = (error) => error?.code === "ENOENT";
var PREFILL_VIEWS = SIDEBAR_PREFILL_VIEWS;
var invalidEnum = (name, value) => typeof value === "string" ? `Unknown ${name}: ${value}` : `${name} must be a string`;
function parseSidebarLayout(value, warnings) {
  if (!Array.isArray(value)) {
    warnings.push("sidebarPanelLayout must be an array");
    return;
  }
  const entries = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string") {
      warnings.push("Ignoring malformed sidebarPanelLayout entry");
      continue;
    }
    if (typeof item.visible !== "boolean") {
      warnings.push(`sidebar panel visibility for ${item.id} must be boolean; using hidden`);
    }
    entries.push({ id: item.id, visible: item.visible === true });
  }
  return normalizeSidebarPanelLayout(entries, warnings);
}
function resolveSidebarLayout(layers) {
  const warnings = [];
  const user = layers.user;
  if (user && "sidebarPanelLayout" in user) {
    const parsed = parseSidebarLayout(user.sidebarPanelLayout, warnings);
    return { layout: parsed ?? cloneLayout(DEFAULT_CONFIG.sidebarPanelLayout), warnings };
  }
  const layout2 = cloneLayout(DEFAULT_CONFIG.sidebarPanelLayout);
  for (const [key, id] of [
    ["showSidebarAgent", "agent"],
    ["showSidebarTodos", "todos"]
  ]) {
    const visible = user?.[key];
    const entry = layout2.find((item) => item.id === id);
    if (typeof visible === "boolean" && entry)
      entry.visible = visible;
  }
  return { layout: layout2, warnings };
}
function parsePersistedLayout(value, warnings) {
  if (!Array.isArray(value)) {
    warnings.push("segmentLayout must be an array");
    return;
  }
  const seen = new Set;
  const entries = [];
  for (const item of value) {
    if (!isRecord(item) || !isSegmentId(item.id)) {
      warnings.push(isRecord(item) && "id" in item ? `Unknown segmentLayout segment: ${String(item.id)}` : "Ignoring malformed segmentLayout entry");
      continue;
    }
    if (seen.has(item.id)) {
      warnings.push(`Ignoring duplicate segmentLayout segment: ${item.id}`);
      continue;
    }
    seen.add(item.id);
    if (typeof item.visible !== "boolean") {
      warnings.push(`segmentLayout visibility for ${item.id} must be boolean; using hidden`);
    }
    entries.push({ id: item.id, visible: item.visible === true });
  }
  return normalizeSegmentLayout(entries);
}
function parseLegacySegments(value, warnings) {
  if (!Array.isArray(value)) {
    warnings.push("segments must be an array");
    return;
  }
  const valid = new Set;
  for (const item of value) {
    if (!isSegmentId(item))
      warnings.push(`Unknown segment: ${String(item)}`);
    else if (valid.has(item))
      warnings.push(`Ignoring duplicate segment: ${item}`);
    else
      valid.add(item);
  }
  return legacySegmentsToLayout([...valid]);
}
function resolveDisplayLayers(layers) {
  let display = {
    preset: DEFAULT_CONFIG.preset,
    density: DEFAULT_CONFIG.density,
    segmentLayout: cloneLayout(DEFAULT_CONFIG.segmentLayout)
  };
  const provenance = {
    preset: "product",
    density: "product",
    order: "product",
    visibility: Object.fromEntries(PRODUCT_SEGMENT_ORDER.map((id) => [id, "product"]))
  };
  const compatibility = {
    preset: "editorial",
    ornament: "none",
    brandListed: true,
    statusesListed: true,
    showStatuses: true
  };
  const warnings = [];
  const setVisibility = (id, visible) => {
    const entry = display.segmentLayout.find((item) => item.id === id);
    if (entry)
      entry.visible = visible;
  };
  for (const [source, input] of [
    ["user", layers.user],
    ["project", layers.project],
    ["session", layers.session]
  ]) {
    if (!input)
      continue;
    const markAllVisibility = () => {
      for (const id of PRODUCT_SEGMENT_ORDER)
        provenance.visibility[id] = source;
    };
    const applyLayout = (layout3) => {
      display.segmentLayout = layout3;
      provenance.order = source;
      markAllVisibility();
      compatibility.brandListed = layout3.find((entry) => entry.id === "brand")?.visible ?? false;
      compatibility.statusesListed = layout3.find((entry) => entry.id === "statuses")?.visible ?? false;
    };
    let changedTemplateField = false;
    let suppliedPreset = false;
    if ("preset" in input) {
      if (isPresetName(input.preset)) {
        compatibility.preset = input.preset;
        display.preset = input.preset;
        provenance.preset = source;
        suppliedPreset = true;
        if (input.preset !== "custom") {
          display = applyDisplayTemplate(input.preset);
          provenance.density = source;
          provenance.order = source;
          markAllVisibility();
          changedTemplateField = true;
        }
      } else
        warnings.push(invalidEnum("preset", input.preset));
    }
    if ("density" in input) {
      if (isDensity(input.density)) {
        display.density = input.density;
        provenance.density = source;
        changedTemplateField = true;
      } else
        warnings.push(invalidEnum("density", input.density));
    }
    const layout2 = "segmentLayout" in input ? parsePersistedLayout(input.segmentLayout, warnings) : undefined;
    if (layout2) {
      applyLayout(layout2);
      changedTemplateField = true;
    } else {
      let legacySegmentsApplied = false;
      if ("segments" in input) {
        const legacy = parseLegacySegments(input.segments, warnings);
        if (legacy) {
          applyLayout(legacy);
          changedTemplateField = true;
          legacySegmentsApplied = true;
        }
      }
      let brandChanged = suppliedPreset || legacySegmentsApplied;
      if ("ornament" in input) {
        if (isOrnament(input.ornament)) {
          compatibility.ornament = input.ornament;
          brandChanged = true;
        } else
          warnings.push(invalidEnum("ornament", input.ornament));
      }
      if (brandChanged) {
        setVisibility("brand", compatibility.brandListed && compatibility.preset !== "editorial" && compatibility.ornament === "restrained");
        provenance.visibility.brand = source;
        changedTemplateField = true;
      }
      let statusesChanged = legacySegmentsApplied;
      if ("showExtensionStatuses" in input) {
        if (typeof input.showExtensionStatuses === "boolean") {
          compatibility.showStatuses = input.showExtensionStatuses;
          statusesChanged = true;
        } else
          warnings.push("showExtensionStatuses must be boolean");
      }
      if (statusesChanged) {
        setVisibility("statuses", compatibility.statusesListed && compatibility.showStatuses);
        provenance.visibility.statuses = source;
        changedTemplateField = true;
      }
    }
    const identity = derivePresetIdentity(display);
    if (identity !== display.preset) {
      display.preset = identity;
      if (changedTemplateField)
        provenance.preset = source;
    }
  }
  return { display, provenance, warnings };
}
function applyNonDisplay(input, config, warnings, userLayer) {
  if (!isRecord(input)) {
    if (input !== undefined)
      warnings.push("Configuration must be a JSON object");
    return;
  }
  if (typeof input.shortcut === "string") {
    const shortcut = input.shortcut.trim();
    if (shortcut) {
      config.shortcut = shortcut.toLowerCase() === "alt+a" ? DEFAULT_CONFIG.shortcut : shortcut;
    } else
      warnings.push("Shortcut cannot be empty");
  } else if ("shortcut" in input)
    warnings.push("shortcut must be a string");
  if (typeof input.toggleShortcut === "string")
    config.toggleShortcut = input.toggleShortcut.trim();
  else if ("toggleShortcut" in input)
    warnings.push("toggleShortcut must be a string");
  applyContextThresholds(input, config, warnings);
  if (typeof input.currencyDecimals === "number") {
    if (Number.isInteger(input.currencyDecimals) && input.currencyDecimals >= 0 && input.currencyDecimals <= MAX_CURRENCY_DECIMALS)
      config.currencyDecimals = input.currencyDecimals;
    else
      warnings.push(`currencyDecimals must be an integer from 0 through ${MAX_CURRENCY_DECIMALS}`);
  }
  if ("sidebarWidth" in input) {
    const width = input.sidebarWidth;
    if (typeof width !== "number" || !Number.isInteger(width))
      warnings.push("sidebarWidth must be an integer");
    else {
      const next = clamp(width, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
      if (next !== width)
        warnings.push(`sidebarWidth must be from ${MIN_SIDEBAR_WIDTH} through ${MAX_SIDEBAR_WIDTH}; using ${next}`);
      if (userLayer)
        config.sidebarWidth = next;
    }
  }
  for (const key of [
    "showSidebarToolNames",
    "showSidebarOnStartup",
    "completionNotifications",
    "nerdFont",
    "showFooter"
  ]) {
    const value = input[key];
    if (typeof value === "boolean") {
      if (userLayer || !USER_ONLY_KEYS.has(key))
        config[key] = value;
    } else if (key in input)
      warnings.push(`${key} must be boolean`);
  }
  for (const key of ["showSidebarAgent", "showSidebarTodos"]) {
    if (key in input && typeof input[key] !== "boolean")
      warnings.push(`${key} must be boolean`);
  }
  applyPrefill(input, config, warnings, userLayer);
}
function applyPrefill(input, config, warnings, userLayer) {
  if (typeof input.prefillEnabled === "boolean")
    config.prefillEnabled = input.prefillEnabled;
  else if ("prefillEnabled" in input)
    warnings.push("prefillEnabled must be boolean");
  if ("prefillViews" in input) {
    if (!Array.isArray(input.prefillViews)) {
      warnings.push("prefillViews must be an array");
    } else {
      const views = [];
      for (const view of input.prefillViews) {
        if (typeof view === "string" && PREFILL_VIEWS.includes(view))
          views.push(view);
        else
          warnings.push(invalidEnum("prefillViews", view));
      }
      config.prefillViews = views;
    }
  }
  if ("prefillProviders" in input) {
    if (!Array.isArray(input.prefillProviders)) {
      warnings.push("prefillProviders must be an array");
    } else if (userLayer) {
      config.prefillProviders = input.prefillProviders.filter((provider) => typeof provider === "string" && provider.trim().length > 0);
    }
  }
}
function applyContextThresholds(input, config, warnings) {
  const hasWarning = "contextWarning" in input;
  const hasDanger = "contextDanger" in input;
  if (!hasWarning && !hasDanger)
    return;
  if (hasWarning && typeof input.contextWarning !== "number" || hasDanger && typeof input.contextDanger !== "number") {
    warnings.push("context thresholds must be numbers");
    return;
  }
  const warning = typeof input.contextWarning === "number" ? input.contextWarning : config.contextWarning;
  const danger = typeof input.contextDanger === "number" ? input.contextDanger : config.contextDanger;
  if (warning >= 0 && warning < danger && danger <= 100) {
    config.contextWarning = warning;
    config.contextDanger = danger;
  } else
    warnings.push("Invalid context threshold ordering; expected 0 <= warning < danger <= 100");
}
function resolveConfig(input) {
  const config = {
    ...DEFAULT_CONFIG,
    segmentLayout: cloneLayout(DEFAULT_CONFIG.segmentLayout),
    sidebarPanelLayout: cloneLayout(DEFAULT_CONFIG.sidebarPanelLayout)
  };
  const warnings = [];
  const displayLayers = {};
  for (const source of ["user", "project", "session"]) {
    const layer = input[source];
    applyNonDisplay(layer, config, warnings, source === "user");
    if (isRecord(layer))
      displayLayers[source] = layer;
  }
  const resolved = resolveDisplayLayers(displayLayers);
  const sidebar = resolveSidebarLayout(displayLayers);
  Object.assign(config, resolved.display, { sidebarPanelLayout: sidebar.layout });
  return {
    config,
    warnings: [...new Set([...warnings, ...resolved.warnings, ...sidebar.warnings])],
    displayLayers,
    displayProvenance: resolved.provenance
  };
}
async function readJson(path) {
  try {
    return { value: JSON.parse(await readFile(path, "utf8")) };
  } catch (error) {
    if (isEnoent(error))
      return {};
    return { warning: `Cannot load ${path}: ${errorMessage(error)}` };
  }
}
async function loadConfig(options) {
  const user = await readJson(options.userPath);
  const project = options.projectTrusted ? await readJson(options.projectPath) : {};
  const resolved = resolveConfig({ user: user.value, project: project.value, session: options.session });
  const fileWarnings = [user.warning, project.warning].filter((item) => item !== undefined);
  return { ...resolved, warnings: [...fileWarnings, ...resolved.warnings] };
}
var saveQueues = new Map;
function saveUserConfigPatch(path, patch) {
  const saved = (saveQueues.get(path) ?? Promise.resolve()).then(() => applyUserConfigPatch(path, patch));
  const settled = saved.catch(() => {
    return;
  });
  saveQueues.set(path, settled);
  settled.then(() => {
    if (saveQueues.get(path) === settled)
      saveQueues.delete(path);
  });
  return saved;
}
async function applyUserConfigPatch(path, patch) {
  let current = {};
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (!isRecord(parsed))
      throw new Error("User configuration must be a JSON object");
    current = parsed;
  } catch (error) {
    if (!isEnoent(error))
      throw error;
  }
  await writeJsonAtomic(path, { ...current, ...patch });
}
async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}
`, { encoding: "utf8", mode: 384 });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {
      return;
    });
  }
}

// src/editor.ts
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, truncateToWidth as truncateToWidth2, visibleWidth as visibleWidth2 } from "@earendil-works/pi-tui";
var EDITOR_FRAME_CHROME = 4;
var EDITOR_FRAME_MIN_WIDTH = 6;
var EDITOR_STATUS_MIN_WIDTH = 12;
var RULE_PATTERN = /^─+(?: [↑↓] \d+ more ─*)?\.{0,3}$/;
function isEditorRuleText(plain) {
  return plain.length > 0 && RULE_PATTERN.test(plain);
}
function expandRule(line, width) {
  const plain = stripTerminalSequences(line);
  const body = isEditorRuleText(plain) ? plain : "─".repeat(visibleWidth2(plain));
  if (visibleWidth2(body) >= width)
    return fitToWidth(body, width);
  return `${body}${"─".repeat(width - visibleWidth2(body))}`;
}
function findBottomRuleIndex(lines, innerWidth) {
  for (let index = lines.length - 1;index >= 1; index -= 1) {
    const line = lines[index];
    if (!line)
      continue;
    const plain = stripTerminalSequences(line);
    if (visibleWidth2(plain) === innerWidth && isEditorRuleText(plain))
      return index;
  }
  return Math.max(0, lines.length - 1);
}
function framedRule(innerRule, outerBodyWidth, leftCap, rightCap, borderColor) {
  return borderColor(`${leftCap}${expandRule(innerRule, outerBodyWidth)}${rightCap}`);
}
function framedRow(line, innerWidth, borderColor) {
  return `${borderColor("│")} ${fitToWidth(line, innerWidth)} ${borderColor("│")}`;
}
function fitsStatusLine(status, width) {
  return stripTerminalSequences(status).trim().length > 0 && visibleWidth2(status) <= width;
}
function framedStatusRule(innerRule, outerBodyWidth, borderColor, renderStatusLine) {
  const normalRule = () => framedRule(innerRule, outerBodyWidth, "╭", "╮", borderColor);
  if (!renderStatusLine)
    return normalRule();
  const scrollIndicator = stripTerminalSequences(innerRule).match(/↑ \d+ more/)?.[0];
  const scrollSuffix = scrollIndicator ? ` ${scrollIndicator} ─` : "";
  const statusWidth = outerBodyWidth - 4 - visibleWidth2(scrollSuffix);
  if (statusWidth < EDITOR_STATUS_MIN_WIDTH)
    return normalRule();
  const status = renderStatusLine(statusWidth);
  if (!fitsStatusLine(status, statusWidth))
    return normalRule();
  const remainingRule = "─".repeat(statusWidth - visibleWidth2(status) + 1);
  return `${borderColor("╭─ ")}${status}${borderColor(` ${remainingRule}${scrollSuffix}╮`)}`;
}
function frameEditorLines(inner, width, borderColor, renderStatusLine) {
  const safeWidth = Math.max(0, Math.trunc(width));
  const [topRule, ...rest] = inner;
  if (safeWidth < EDITOR_FRAME_MIN_WIDTH || topRule === undefined) {
    return inner.map((line) => truncateToWidth2(line, safeWidth, ""));
  }
  const innerWidth = safeWidth - EDITOR_FRAME_CHROME;
  const outerBodyWidth = safeWidth - 2;
  const bottom = findBottomRuleIndex(inner, innerWidth);
  const body = rest.filter((_, index) => index + 1 !== bottom);
  return [
    framedStatusRule(topRule, outerBodyWidth, borderColor, renderStatusLine),
    ...body.map((line) => framedRow(line, innerWidth, borderColor)),
    framedRule(inner[bottom] ?? topRule, outerBodyWidth, "╰", "╯", borderColor)
  ].map((line) => truncateToWidth2(line, safeWidth, ""));
}

class AtelierEditor extends CustomEditor {
  renderStatusLine;
  statusLineVisible = false;
  render(width) {
    this.statusLineVisible = false;
    const safeWidth = Math.max(0, Math.trunc(width));
    if (safeWidth < EDITOR_FRAME_MIN_WIDTH)
      return super.render(safeWidth);
    const renderStatusLine = this.renderStatusLine;
    return frameEditorLines(super.render(safeWidth - EDITOR_FRAME_CHROME), safeWidth, this.borderColor, renderStatusLine ? (availableWidth) => {
      const status = renderStatusLine(availableWidth);
      this.statusLineVisible = fitsStatusLine(status, availableWidth);
      return status;
    } : undefined);
  }
}

// src/footer.ts
import { truncateToWidth as truncateToWidth4, visibleWidth as visibleWidth4 } from "@earendil-works/pi-tui";

// src/palette.ts
var GREEN = [74, 222, 128];
var GOLD = [234, 200, 110];
var PALETTE_RGB = {
  accent: [177, 140, 255],
  primary: [212, 212, 212],
  muted: [128, 128, 128],
  dim: [102, 102, 102],
  ready: [110, 168, 254],
  working: [255, 159, 67],
  input: [110, 168, 254],
  output: [177, 140, 255],
  cache: [125, 211, 252],
  cost: [255, 159, 67],
  context: [110, 168, 254],
  menu: [177, 140, 255],
  success: GREEN,
  caution: GOLD,
  warning: [255, 159, 67],
  error: [255, 93, 115],
  chartPink: [244, 114, 182],
  chartGreen: GREEN,
  chartGold: GOLD
};
var UNNAMED_THEME = {
  accent: "accent",
  primary: "text",
  muted: "muted",
  dim: "dim",
  ready: "thinkingLow",
  working: "mdHeading",
  input: "thinkingLow",
  output: "thinkingHigh",
  cache: "syntaxType",
  cost: "mdHeading",
  context: "thinkingLow",
  menu: "thinkingHigh",
  success: "success",
  caution: "warning",
  warning: "warning",
  error: "error",
  chartPink: "syntaxString",
  chartGreen: "success",
  chartGold: "syntaxFunction"
};
var NO_COLOR_ROLES = new Set(["accent", "muted", "dim", "warning", "error"]);
var TINT_BASE = [92, 96, 102];
function tintRgb(role, strength = 0.4) {
  const mix = (index) => Math.round(TINT_BASE[index] + (PALETTE_RGB[role][index] - TINT_BASE[index]) * strength);
  return [mix(0), mix(1), mix(2)];
}
function paintRgb([red, green, blue], text) {
  return `\x1B[38;2;${red};${green};${blue}m${text}\x1B[39m`;
}
function createPalette(theme, colorEnabled) {
  const tinted = colorEnabled && Boolean(theme.name);
  return {
    colorEnabled,
    tinted,
    paint(role, text) {
      if (!colorEnabled)
        return theme.fg(NO_COLOR_ROLES.has(role) ? role : "text", text);
      if (!theme.name)
        return theme.fg(UNNAMED_THEME[role], text);
      return paintRgb(PALETTE_RGB[role], text);
    },
    paintTint(role, text, strength) {
      if (!tinted)
        return theme.fg("dim", text);
      return paintRgb(tintRgb(role, strength), text);
    }
  };
}

// src/run-activity.ts
import nodePath2 from "node:path";
import { truncateToWidth as truncateToWidth3, visibleWidth as visibleWidth3 } from "@earendil-works/pi-tui";

// src/display-path.ts
import { homedir } from "node:os";
import nodePath from "node:path";
function toDisplayPath(value, separator = nodePath.sep) {
  return value.replaceAll(separator, "/");
}
function displayPathWithin(base, target) {
  const relativePath = nodePath.relative(base, target);
  if (relativePath === "")
    return ".";
  if (nodePath.isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${nodePath.sep}`)) {
    return;
  }
  return toDisplayPath(relativePath);
}
function displayHomePath(path) {
  const home = homedir();
  const withinHome = home ? displayPathWithin(nodePath.resolve(home), nodePath.resolve(path)) : undefined;
  if (withinHome === undefined)
    return toDisplayPath(path);
  return withinHome === "." ? "~" : `~/${withinHome}`;
}

// src/run-activity.ts
var MAX_SUMMARY_COLUMNS = 26;
var MAX_RECENT_TOOLS = 3;
var MIN_GENERATION_WINDOW_MS = 500;
var EMPTY_RUN_ACTIVITY = Object.freeze({
  phase: "idle",
  activeTools: Object.freeze([]),
  recentTools: Object.freeze([]),
  completedCount: 0,
  failedCount: 0
});
function responsePerformanceValues(performance) {
  const ttftMs = performance?.ttftMs;
  const tokensPerSecond = performance?.tokensPerSecond;
  return {
    ttft: ttftMs !== undefined && Number.isFinite(ttftMs) ? { text: formatTtft(ttftMs), available: true } : { text: PLACEHOLDER, available: false },
    tps: tokensPerSecond !== undefined && Number.isFinite(tokensPerSecond) ? {
      text: `${performance?.estimated ? "~" : ""}${Math.max(0, tokensPerSecond).toFixed(1)}`,
      available: true
    } : { text: PLACEHOLDER, available: false }
  };
}
function formatTtft(ttftMs) {
  const safe = Math.max(0, ttftMs);
  return safe < 1000 ? `${Math.round(safe)}ms` : `${(safe / 1000).toFixed(1)}s`;
}
function formatDuration(durationMs) {
  const totalSeconds = Number.isFinite(durationMs) ? Math.floor(Math.max(0, durationMs) / 1000) : 0;
  if (totalSeconds < 1)
    return "<1s";
  if (totalSeconds < 60)
    return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60)
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes.toString().padStart(2, "0")}m`;
}
function summarizeTool(toolName, args, cwd) {
  if (!isRecord(args))
    return "";
  switch (toolName) {
    case "bash":
      return truncateSummary(sanitizeInline(getString(args, "command")));
    case "read":
    case "edit":
    case "write":
    case "ls":
      return truncateSummary(shortenPath(getString(args, "path"), cwd));
    case "grep":
    case "find":
      return summarizePatternTool(args, cwd);
    default:
      return "";
  }
}
var initialState = () => ({
  phase: "idle",
  turnNumber: undefined,
  startedAt: undefined,
  durationMs: undefined,
  response: undefined,
  performance: undefined,
  activeTools: new Map,
  recentTools: [],
  completedCount: 0,
  failedCount: 0
});
var isInitial = (state) => state.phase === "idle" && state.turnNumber === undefined && state.startedAt === undefined && state.response === undefined && state.performance === undefined && state.activeTools.size === 0 && state.recentTools.length === 0 && state.completedCount === 0 && state.failedCount === 0;
function createRunActivityTracker(options) {
  let state = initialState();
  const notify = () => options.onChange?.();
  return {
    startRun() {
      state = { ...initialState(), phase: "running", startedAt: Date.now() };
      notify();
    },
    startTurn(turnIndex) {
      const turnNumber = Math.max(0, Math.trunc(turnIndex)) + 1;
      if (state.turnNumber === turnNumber && state.phase === "running")
        return;
      state.phase = "running";
      state.turnNumber = turnNumber;
      state.durationMs = undefined;
      notify();
    },
    startResponse() {
      state.response = { requestedAt: Date.now() };
      state.performance = undefined;
      notify();
    },
    resetResponse() {
      state.response = undefined;
      state.performance = undefined;
      notify();
    },
    updateResponseEstimate(estimatedOutputTokens) {
      const response = state.response;
      if (!response || !Number.isFinite(estimatedOutputTokens) || estimatedOutputTokens <= 0)
        return;
      const observedAt = Date.now();
      response.latestTokens = estimatedOutputTokens;
      if (response.firstTokenAt === undefined) {
        response.firstTokenAt = observedAt;
        response.firstTokens = estimatedOutputTokens;
        state.performance = { ttftMs: Math.max(0, observedAt - response.requestedAt) };
        notify();
        return;
      }
      const generationMs = observedAt - response.firstTokenAt;
      const generatedTokens = estimatedOutputTokens - (response.firstTokens ?? 0);
      if (generationMs < MIN_GENERATION_WINDOW_MS || generatedTokens <= 0 || !state.performance)
        return;
      state.performance = {
        ttftMs: state.performance.ttftMs,
        tokensPerSecond: generatedTokens / (generationMs / 1000),
        estimated: true
      };
      notify();
    },
    finishResponse(outputTokens) {
      const response = state.response;
      state.response = undefined;
      if (response?.firstTokenAt === undefined || !state.performance)
        return;
      if (!Number.isFinite(outputTokens) || outputTokens <= 0)
        return;
      const ttftMs = state.performance.ttftMs;
      const generationMs = Date.now() - response.firstTokenAt;
      const latestTokens = response.latestTokens ?? 0;
      const generatedShare = latestTokens > 0 ? (latestTokens - (response.firstTokens ?? 0)) / latestTokens : 0;
      const generatedTokens = outputTokens * generatedShare;
      state.performance = generatedTokens > 0 && generationMs >= MIN_GENERATION_WINDOW_MS ? { ttftMs, tokensPerSecond: generatedTokens / (generationMs / 1000) } : { ttftMs };
      notify();
    },
    startTool(event) {
      const id = sanitizeInline(event.toolCallId);
      if (id.length === 0)
        return;
      state.phase = "running";
      state.durationMs = undefined;
      state.activeTools.set(id, {
        id,
        name: truncateSummary(sanitizeInline(event.toolName)),
        summary: summarizeTool(event.toolName, event.args, options.cwd),
        status: "running",
        startedAt: Date.now()
      });
      notify();
    },
    finishTool(event) {
      const id = sanitizeInline(event.toolCallId);
      const active = state.activeTools.get(id);
      if (!active)
        return;
      state.activeTools.delete(id);
      const status = event.isError ? "failed" : "done";
      if (status === "failed")
        state.failedCount += 1;
      else
        state.completedCount += 1;
      const completed = {
        ...active,
        status,
        durationMs: Math.max(0, Date.now() - active.startedAt)
      };
      state.recentTools = [completed, ...state.recentTools].slice(0, MAX_RECENT_TOOLS);
      notify();
    },
    settle() {
      if (state.phase !== "running" && state.activeTools.size === 0)
        return;
      const settledAt = Date.now();
      const interrupted = Array.from(state.activeTools.values(), (tool) => ({
        ...tool,
        status: "failed",
        durationMs: Math.max(0, settledAt - tool.startedAt)
      }));
      state.activeTools = new Map;
      state.failedCount += interrupted.length;
      state.recentTools = [...interrupted.reverse(), ...state.recentTools].slice(0, MAX_RECENT_TOOLS);
      state.phase = "settled";
      state.durationMs = Math.max(0, settledAt - (state.startedAt ?? settledAt));
      notify();
    },
    reset() {
      if (isInitial(state))
        return;
      state = initialState();
      notify();
    },
    isRunning: () => state.phase === "running",
    getSnapshot() {
      return {
        phase: state.phase,
        ...state.turnNumber === undefined ? {} : { turnNumber: state.turnNumber },
        ...state.startedAt === undefined ? {} : { startedAt: state.startedAt },
        ...state.durationMs === undefined ? {} : { durationMs: state.durationMs },
        ...state.performance === undefined ? {} : { performance: state.performance },
        activeTools: [...state.activeTools.values()],
        recentTools: [...state.recentTools],
        completedCount: state.completedCount,
        failedCount: state.failedCount
      };
    }
  };
}
function getString(record, key) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}
function summarizePatternTool(args, cwd) {
  const pattern = sanitizeInline(getString(args, "pattern"));
  if (pattern.length === 0)
    return "";
  const targetPath = shortenPath(getString(args, "path"), cwd);
  const combined = `${pattern} in ${targetPath}`;
  if (targetPath.length > 0 && visibleWidth3(combined) <= MAX_SUMMARY_COLUMNS)
    return combined;
  return truncateSummary(pattern);
}
function shortenPath(pathValue, cwd) {
  const safePath = sanitizeInline(pathValue);
  if (safePath.length === 0)
    return "";
  const normalizedCwd = nodePath2.resolve(sanitizeInline(cwd));
  const normalizedPath = nodePath2.resolve(normalizedCwd, safePath);
  return displayPathWithin(normalizedCwd, normalizedPath) ?? displayHomePath(normalizedPath);
}
function truncateSummary(value) {
  return sanitizeInline(truncateToWidth3(value, MAX_SUMMARY_COLUMNS, "…"));
}

// src/footer.ts
var WORKING_DOT_FRAMES = ["...", "..", "."];
var WORKING_ANIMATION_INTERVAL_MS = 400;
var FOOTER_ICONS = {
  brand: "",
  model: "",
  thinking: "",
  git: "",
  workspace: "",
  input: "",
  output: "",
  cache: "",
  performance: "",
  speed: "",
  context: "",
  autoCompact: "",
  menu: "",
  separator: ""
};
var PLAIN_SYMBOLS = {
  brand: "",
  model: "",
  thinking: "think",
  git: "git",
  workspace: "",
  input: "in",
  output: "out",
  cache: "cache",
  performance: "TTFT",
  speed: "TPS",
  context: "ctx",
  autoCompact: "auto",
  menu: "",
  separator: "|"
};
var ITEM_META = {
  brand: { zone: "left", group: "brand", dropRank: 0, header: true },
  status: { zone: "left", group: "status", dropRank: 0, header: true },
  activity: { zone: "left", group: "activity", dropRank: Number.POSITIVE_INFINITY, header: true },
  model: { zone: "left", group: "model", dropRank: 60, header: true },
  thinking: { zone: "left", group: "model", dropRank: 10, header: true },
  workspace: { zone: "left", group: "workspace", dropRank: 50, header: true },
  git: { zone: "left", group: "workspace", dropRank: 55, header: true },
  input: { zone: "right", group: "usage", dropRank: 40, header: false },
  output: { zone: "right", group: "usage", dropRank: 40, header: false },
  cache: { zone: "right", group: "usage", dropRank: 50, header: false },
  cost: { zone: "right", group: "usage", dropRank: 20, header: false },
  performance: { zone: "right", group: "performance", dropRank: 45, header: false },
  context: { zone: "right", group: "context", dropRank: Number.POSITIVE_INFINITY, header: true },
  menu: { zone: "right", group: "menu", dropRank: 0, header: false }
};
var isRequired = (item) => ITEM_META[item.id].dropRank === Number.POSITIVE_INFINITY;
function paintValue(value, role, palette) {
  return palette.paint(value.available ? role : "dim", value.text);
}
function metric(label, value, palette, role) {
  return `${palette.paint("muted", label)} ${paintValue(value, role, palette)}`;
}
function availableValue(available, value) {
  return available ? { text: formatTokens(value), available: true } : { text: PLACEHOLDER, available: false };
}
function percentValue(value, decimals) {
  return value !== null && value !== undefined ? { text: `${value.toFixed(decimals)}%`, available: true } : { text: PLACEHOLDER, available: false };
}
function costValue(metrics, decimals) {
  if (!metrics.costAvailable)
    return { text: `$${PLACEHOLDER}`, available: false };
  return { text: `$${metrics.cost.toFixed(decimals)}`, available: true };
}
function contextRole(percent, config, fallback) {
  if (percent === null)
    return fallback;
  if (percent >= config.contextDanger)
    return "error";
  if (percent >= config.contextWarning)
    return "warning";
  return "context";
}
function activityText(state, palette, theme, workingDots, compact, nerdFont) {
  const fallback = state.activity.toUpperCase();
  const label = state.activity === "working" && !compact ? state.workingLabel ?? fallback : fallback;
  const dots = state.activity === "working" && !compact ? workingDots.padEnd(WORKING_DOT_FRAMES[0].length, " ") : "";
  const marker = state.activity === "error" ? "× " : nerdFont ? "● " : "";
  return palette.paint(state.activity, theme.bold(`${marker}${sanitizeInline(label)}${dots}`));
}
var item = (id, full, compact = full) => ({ id, full, compact });
function iconFor(palette) {
  return (symbol, text, role = "muted") => symbol ? `${palette.paint(role, symbol)} ${text}` : text;
}
var SEGMENT_ITEMS = {
  brand: ({ palette, symbols }) => [
    item("brand", iconFor(palette)(symbols.brand, palette.paint("muted", "ATELIER"), "accent"))
  ],
  activity: ({ state, palette, theme, workingDots, config }) => [
    item("activity", activityText(state, palette, theme, workingDots, false, config.nerdFont), activityText(state, palette, theme, workingDots, true, config.nerdFont))
  ],
  model: ({ state, palette, theme, symbols }) => {
    const icon = iconFor(palette);
    const items = [];
    const model = state.modelId ? sanitizeInline(state.modelId) : "";
    if (model) {
      const paint = (text) => icon(symbols.model, palette.paint("accent", theme.bold(text)), "accent");
      items.push(item("model", paint(model), paint(truncateToWidth4(model, 24, "…"))));
    }
    const thinking = state.thinkingLevel ? sanitizeInline(state.thinkingLevel) : "";
    if (thinking) {
      const role = thinking === "off" ? "dim" : "accent";
      items.push(item("thinking", icon(symbols.thinking, palette.paint(role, thinking), role)));
    }
    return items;
  },
  git: ({ state, palette, symbols }) => {
    const icon = iconFor(palette);
    const items = [];
    const workspace = state.workspaceLabel ? sanitizeInline(state.workspaceLabel) : "";
    if (workspace) {
      const paint = (text) => icon(symbols.workspace, palette.paint("cache", text), "cache");
      items.push(item("workspace", paint(workspace), paint(truncateToWidth4(workspace, 18, "…"))));
    }
    const branch = state.branch ? sanitizeInline(state.branch) : "";
    if (branch) {
      const dirty = state.dirty ? palette.paint("warning", "*") : "";
      const paint = (text) => icon(symbols.git, `${palette.paint("input", text)}${dirty}`, "input");
      items.push(item("git", paint(branch), paint(truncateToWidth4(branch, 18, "…"))));
    }
    return items;
  },
  statuses: ({ state, palette }) => {
    const statuses = state.extensionStatuses.map(sanitizeInline).filter(Boolean).join(" ");
    return statuses ? [item("status", palette.paint("muted", statuses))] : [];
  },
  metrics: ({ state: { metrics }, config, palette, symbols }) => {
    const icon = iconFor(palette);
    const input = availableValue(metrics.usageAvailable, metrics.input);
    const output = availableValue(metrics.usageAvailable, metrics.output);
    const cache = percentValue(metrics.cacheHitPercent, 0);
    const cacheDetail = [
      metric("read", availableValue(metrics.usageAvailable, metrics.cacheRead), palette, "cache"),
      metrics.cacheWrite > 0 ? metric("write", availableValue(metrics.usageAvailable, metrics.cacheWrite), palette, "cache") : "",
      metric("hit", percentValue(metrics.cacheHitPercent, 1), palette, "cache")
    ].filter(Boolean).join(" ");
    const cost = `${paintValue(costValue(metrics, config.currencyDecimals), "cost", palette)}${metrics.subscription ? palette.paint("muted", " (sub)") : ""}`;
    return [
      item("input", icon(symbols.input, paintValue(input, "input", palette), input.available ? "input" : "dim"), icon(symbols.input, paintValue(input, "input", palette))),
      item("output", icon(symbols.output, paintValue(output, "output", palette), output.available ? "output" : "dim"), icon(symbols.output, paintValue(output, "output", palette))),
      item("cache", icon(symbols.cache, config.preset === "classic" ? cacheDetail : paintValue(cache, "cache", palette), cache.available ? "cache" : "dim"), icon(symbols.cache, paintValue(cache, "cache", palette))),
      item("cost", cost)
    ];
  },
  performance: ({ state, config, palette, symbols }) => {
    const icon = iconFor(palette);
    const values = responsePerformanceValues(state.performance);
    const speedUnit = values.tps.available && config.nerdFont ? palette.paint("muted", "/s") : "";
    return [
      item("performance", [
        icon(symbols.performance, paintValue(values.ttft, "output", palette)),
        icon(symbols.speed, paintValue(values.tps, "output", palette) + speedUnit)
      ].join("  "))
    ];
  },
  context: ({ state: { metrics }, config, palette, symbols }) => {
    const role = contextRole(metrics.contextPercent, config, "context");
    const compact = iconFor(palette)(symbols.context, paintValue(percentValue(metrics.contextPercent, 1), role, palette), role);
    const window = metrics.contextWindow > 0 ? palette.paint("muted", ` / ${formatTokens(metrics.contextWindow)}`) : "";
    const autoCompact = metrics.autoCompact ? ` ${palette.paint("muted", symbols.autoCompact)}` : "";
    return [item("context", `${compact}${window}${autoCompact}`, compact)];
  },
  menu: ({ config, palette, symbols }) => {
    const defaultLabel = DEFAULT_CONFIG.shortcut.toUpperCase();
    const configured = sanitizeInline(config.shortcut).toLowerCase();
    const shortcut = configured && configured !== DEFAULT_CONFIG.shortcut ? `${defaultLabel} / ${configured.toUpperCase()}` : defaultLabel;
    const rendered = palette.paint("menu", shortcut);
    return [item("menu", iconFor(palette)(symbols.menu, rendered, "menu"), rendered)];
  }
};
function buildItems(context) {
  const compactDensity = context.config.density === "compact";
  return context.config.segmentLayout.filter((entry) => entry.visible).flatMap((entry) => SEGMENT_ITEMS[entry.id](context)).map((footerItem) => compactDensity ? { ...footerItem, full: footerItem.compact } : footerItem);
}
function renderZone(items, compactIds, palette, separator) {
  return items.map((placed, index) => {
    const text = compactIds.has(placed.id) ? placed.compact : placed.full;
    const previous = items[index - 1];
    if (!previous)
      return text;
    const group = ITEM_META[placed.id].group;
    if (ITEM_META[previous.id].group !== group)
      return `${palette.paint("dim", ` ${separator} `)}${text}`;
    return `${group === "model" || group === "workspace" ? palette.paint("dim", " · ") : "  "}${text}`;
  }).join("");
}
function compose(items, width, palette, separator, flow) {
  const active = [...items];
  const compactIds = new Set;
  const zone = (side) => renderZone(active.filter((placed) => placed.zone === side), compactIds, palette, separator);
  const flowGap = visibleWidth4(` ${separator} `);
  const measured = () => {
    const leftText2 = zone("left");
    const rightText2 = zone("right");
    return visibleWidth4(leftText2) + visibleWidth4(rightText2) + (leftText2 && rightText2 ? flow ? flowGap : 2 : 0);
  };
  const drop = (candidates) => {
    for (const candidate of candidates) {
      if (measured() <= width)
        return;
      const index = active.indexOf(candidate);
      if (index >= 0)
        active.splice(index, 1);
    }
  };
  const droppable = active.filter((placed) => !isRequired(placed)).sort((a, b) => ITEM_META[a.id].dropRank - ITEM_META[b.id].dropRank);
  drop(droppable.filter((placed) => ITEM_META[placed.id].dropRank === 0));
  if (measured() > width)
    compactIds.add("context");
  if (measured() > width) {
    for (const placed of active) {
      if (placed.id !== "activity" && placed.full !== placed.compact)
        compactIds.add(placed.id);
    }
  }
  drop(droppable);
  for (const placed of active.filter(isRequired)) {
    if (measured() <= width)
      break;
    if (placed.full !== placed.compact)
      compactIds.add(placed.id);
  }
  if (flow && measured() > width)
    return "";
  const leftText = zone("left");
  const rightText = zone("right");
  if (flow) {
    return truncateToWidth4([leftText, rightText].filter(Boolean).join(palette.paint("dim", ` ${separator} `)), width, "");
  }
  const gap = width - visibleWidth4(leftText) - visibleWidth4(rightText);
  if (leftText && rightText && gap >= 2)
    return `${leftText}${" ".repeat(gap)}${rightText}`;
  return truncateToWidth4([leftText, rightText].filter(Boolean).join("  "), width, "");
}
function renderFooter(state, config, theme, width, { colorEnabled = true, workingDots = WORKING_DOT_FRAMES[0], surface = "all" }) {
  if (width <= 0)
    return { line: "", workingActivity: undefined };
  const palette = createPalette(theme, colorEnabled);
  const symbols = config.nerdFont ? FOOTER_ICONS : PLAIN_SYMBOLS;
  const items = buildItems({ state, config, theme, palette, symbols, workingDots });
  const workingActivity = state.activity === "working" && config.density !== "compact" ? items.find((footerItem) => footerItem.id === "activity")?.full : undefined;
  let placed;
  if (surface === "telemetry") {
    const { metrics } = state;
    const available = {
      input: metrics.usageAvailable,
      output: metrics.usageAvailable,
      cache: metrics.cacheHitPercent !== undefined || config.preset === "classic" && metrics.usageAvailable,
      cost: metrics.costAvailable,
      performance: responsePerformanceValues(state.performance).ttft.available
    };
    placed = items.filter((footerItem) => !ITEM_META[footerItem.id].header && available[footerItem.id] !== false).map((footerItem) => ({
      ...footerItem,
      zone: footerItem.id === "performance" || footerItem.id === "menu" ? "right" : "left"
    }));
  } else {
    placed = items.filter((footerItem) => surface === "all" || ITEM_META[footerItem.id].header).map((footerItem) => ({ ...footerItem, zone: ITEM_META[footerItem.id].zone }));
  }
  const line = compose(placed, width, palette, symbols.separator, surface === "header");
  if (surface === "telemetry" && placed.length > 0 && placed.every((footerItem) => footerItem.zone === "right")) {
    return { line: `${" ".repeat(Math.max(0, width - visibleWidth4(line)))}${line}`, workingActivity };
  }
  return { line: truncateToWidth4(line, width, ""), workingActivity };
}
function renderFooterLine(state, config, theme, width, options = {}) {
  return renderFooter(state, config, theme, width, options).line;
}
function createFooterComponent(options) {
  let disposed = false;
  let frameIndex = 0;
  let animationTimer;
  const unsubscribe = options.onBranchChange(options.requestRender);
  const stopAnimation = () => {
    if (animationTimer) {
      clearInterval(animationTimer);
      animationTimer = undefined;
    }
    frameIndex = 0;
  };
  const syncAnimation = (visible) => {
    if (disposed || !visible) {
      stopAnimation();
      return;
    }
    if (animationTimer)
      return;
    animationTimer = setInterval(() => {
      if (disposed)
        return;
      frameIndex = (frameIndex + 1) % WORKING_DOT_FRAMES.length;
      options.requestRender();
    }, WORKING_ANIMATION_INTERVAL_MS);
  };
  const renderSurface = (width, surface) => {
    const { line, workingActivity } = renderFooter(options.getState(), options.getConfig(), options.theme, width, {
      colorEnabled: options.colorEnabled ?? true,
      workingDots: WORKING_DOT_FRAMES[frameIndex] ?? WORKING_DOT_FRAMES[0],
      surface
    });
    if (surface !== "telemetry")
      syncAnimation(workingActivity !== undefined && line.includes(workingActivity));
    return line;
  };
  return {
    render(width) {
      return [renderSurface(width, "all")];
    },
    renderHeader(width) {
      return renderSurface(width, "header");
    },
    renderTelemetry(width) {
      const line = renderSurface(Math.max(0, width - 4), "telemetry");
      return line ? [`  ${line}  `] : [];
    },
    invalidate() {},
    dispose() {
      if (disposed)
        return;
      disposed = true;
      stopAnimation();
      unsubscribe();
    }
  };
}

// src/menu.ts
import {
  getSettingsListTheme
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  SelectList,
  SettingsList,
  Text,
  truncateToWidth as truncateToWidth6
} from "@earendil-works/pi-tui";

// src/overlay-lifecycle.ts
var isLifetimeActive = (lifetime) => lifetime?.isActive() ?? true;
var INERT_COMPONENT = { render: () => [], invalidate() {}, handleInput() {} };
function createLifecycleOverlayComponent(lifetime, component, retire) {
  let inert = false;
  let activeComponent = component;
  let unregisterLifetime;
  const isActive = () => {
    if (inert)
      return false;
    try {
      return isLifetimeActive(lifetime);
    } catch {
      return false;
    }
  };
  const releaseSafely = () => {
    if (inert)
      return false;
    inert = true;
    activeComponent = undefined;
    const unregister = unregisterLifetime;
    unregisterLifetime = undefined;
    try {
      unregister?.();
    } catch {}
    return true;
  };
  const retireSafely = () => {
    if (!releaseSafely())
      return;
    try {
      retire();
    } catch {}
  };
  if (lifetime) {
    try {
      unregisterLifetime = lifetime.register(retireSafely);
    } catch {
      retireSafely();
    }
  }
  return {
    retire: retireSafely,
    release: () => {
      releaseSafely();
    },
    render(width) {
      if (!isActive()) {
        retireSafely();
        return [];
      }
      return activeComponent?.render(width) ?? [];
    },
    invalidate() {
      if (!isActive()) {
        retireSafely();
        return;
      }
      activeComponent?.invalidate();
    },
    handleInput(data) {
      if (!isActive()) {
        retireSafely();
        return;
      }
      activeComponent?.handleInput(data);
    }
  };
}
async function openLifecycleOverlay(ctx, create, lifetime, overlayOptions = {
  anchor: "center",
  width: "70%",
  minWidth: 32,
  maxHeight: "80%",
  margin: 1
}) {
  const isActive = () => isLifetimeActive(lifetime);
  if (!isActive())
    return;
  let resolve;
  const settlement = new Promise((done) => {
    resolve = done;
  });
  let binding;
  try {
    const hostPromise = ctx.ui.custom((tui, theme, _keys, done) => {
      let completed = false;
      const finish = (value) => {
        if (completed)
          return;
        completed = true;
        binding?.release();
        resolve(value);
        try {
          done(value);
        } catch {}
      };
      if (!isActive()) {
        finish();
        return INERT_COMPONENT;
      }
      binding = createLifecycleOverlayComponent(lifetime, create(tui, theme, finish), () => finish());
      if (completed)
        binding.release();
      return binding;
    }, { overlay: true, overlayOptions });
    const result = await Promise.race([hostPromise, settlement]);
    return isActive() ? result : undefined;
  } finally {
    if (lifetime)
      binding?.release();
  }
}

// src/settings-workspace.ts
import { matchesKey as matchesKey2, truncateToWidth as truncateToWidth5, visibleWidth as visibleWidth5 } from "@earendil-works/pi-tui";
var OVERLAY_MAX_HEIGHT_PERCENT = 95;
var DISPLAY_SETTINGS_OVERLAY_MAX_HEIGHT = `${OVERLAY_MAX_HEIGHT_PERCENT}%`;
var DISPLAY_SETTINGS_OVERLAY_MARGIN = 1;
function getDisplaySettingsViewportHeight(terminalRows) {
  const rows = Math.max(0, Math.floor(terminalRows));
  const availableHeight = Math.max(1, rows - DISPLAY_SETTINGS_OVERLAY_MARGIN * 2);
  const maxHeight = Math.floor(rows * OVERLAY_MAX_HEIGHT_PERCENT / 100);
  return Math.max(1, Math.min(maxHeight, availableHeight));
}
var ACTION_KEYS = { save: "S", revert: "R", undo: "U", "sidebar-default": "D" };
var TITLE = "DISPLAY SETTINGS";
var KEY_HINTS = "↑/↓ Select · Enter Change · S Save · Esc Close";
var sameRow = (left, right) => left.kind === right.kind && ("id" in left ? left.id : undefined) === ("id" in right ? right.id : undefined);
var cloneDisplay = (value) => ({
  ...value,
  segmentLayout: cloneLayout(value.segmentLayout)
});
var cloneOverride = (value) => value === undefined ? undefined : structuredClone(value);
var representativeState = {
  activity: "working",
  workingLabel: "CRAFTING",
  modelId: "artisan-1",
  provider: "atelier",
  thinkingLevel: "high",
  branch: "feat/settings",
  dirty: true,
  workspacePulse: {
    status: "changed",
    data: {
      root: "/project",
      relativeCwd: "",
      branch: "feat/settings",
      snapshot: {
        trackedFiles: 2,
        untrackedFiles: 1,
        linesAdded: 24,
        linesRemoved: 3,
        binaryFiles: 0,
        submodules: 0,
        conflicts: 0
      }
    }
  },
  metrics: {
    usageAvailable: true,
    costAvailable: true,
    input: 12400,
    output: 3200,
    cacheRead: 8100,
    cacheWrite: 400,
    cacheHitPercent: 72.4,
    cost: 0.142,
    subscription: false,
    contextTokens: 32000,
    contextWindow: 128000,
    contextPercent: 25,
    autoCompact: true
  },
  performance: { ttftMs: 680, tokensPerSecond: 54 },
  extensionStatuses: ["SYNC"]
};
var blankLines = (count) => Array.from({ length: Math.max(0, count) }, () => ({ line: "" }));
function panel(title, lines, width, theme, accent = false) {
  const withFocus = (line, focused) => focused === undefined ? { line } : { line, focused };
  if (width < 4)
    return lines.map(({ line, focused }) => withFocus(fitToWidth(line, width), focused));
  const inner = width - 2;
  const edge = (text) => theme.fg(accent ? "borderAccent" : "muted", text);
  const heading = ` ${title} `;
  const rule = Math.max(0, inner - visibleWidth5(heading));
  return [
    {
      line: `${edge("┌")}${theme.bold(theme.fg(accent ? "accent" : "muted", heading))}${edge("─".repeat(rule))}${edge("┐")}`
    },
    ...lines.map(({ line, focused }) => withFocus(`${edge("│")}${fitToWidth(line, inner)}${edge("│")}`, focused)),
    { line: `${edge("└")}${edge("─".repeat(inner))}${edge("┘")}` }
  ];
}
function virtualize(central, rows, scrollOffset, width) {
  const more = (direction) => ({ line: fitToWidth(`${direction} more`, width) });
  const focused = Math.max(0, central.findIndex(({ focused: focused2 }) => focused2));
  if (central.length <= rows)
    return { lines: [...central], scrollOffset: 0 };
  if (rows === 0)
    return { lines: [], scrollOffset: 0 };
  if (rows === 1) {
    const offset2 = Math.min(focused, central.length - 1);
    return { lines: [central[offset2] ?? { line: "" }], scrollOffset: offset2 };
  }
  if (rows === 2) {
    return focused <= 0 ? { lines: [central[0] ?? { line: "" }, more("↓")], scrollOffset: 0 } : { lines: [more("↑"), central[focused] ?? { line: "" }], scrollOffset: focused };
  }
  const topCapacity = rows - 1;
  const bottomOffset = central.length - topCapacity;
  const middleCapacity = rows - 2;
  let offset;
  if (focused < topCapacity)
    offset = 0;
  else if (focused >= bottomOffset)
    offset = bottomOffset;
  else {
    const maxMiddleOffset = central.length - middleCapacity - 1;
    offset = Math.max(1, Math.min(scrollOffset, maxMiddleOffset));
    if (focused < offset)
      offset = focused;
    else if (focused >= offset + middleCapacity)
      offset = focused - middleCapacity + 1;
    offset = Math.max(1, Math.min(offset, maxMiddleOffset));
  }
  const atTop = offset === 0;
  const atBottom = offset === bottomOffset;
  const body = central.slice(offset, offset + rows - (atTop ? 0 : 1) - (atBottom ? 0 : 1));
  return {
    lines: [...atTop ? [] : [more("↑")], ...body, ...atBottom ? [] : [more("↓")]],
    scrollOffset: offset
  };
}
function createSettingsWorkspace(options) {
  let display = cloneDisplay(options.getDisplaySettings());
  let focus = 0;
  let undo;
  let sidebarDraft = cloneLayout(options.getRenderConfig().sidebarPanelLayout);
  let sidebarDirty = false;
  let feedback = "";
  let saving = false;
  let scrollOffset = 0;
  const rows = () => [
    { kind: "preset" },
    { kind: "density" },
    ...display.segmentLayout.map((entry) => ({ kind: "segment", id: entry.id })),
    { kind: "action", id: "save" },
    { kind: "action", id: "revert" },
    { kind: "action", id: "undo" },
    ...sidebarDraft.map((entry) => ({ kind: "sidebarPanel", id: entry.id })),
    { kind: "action", id: "sidebar-default" }
  ];
  const rowIndex = (target, allRows = rows()) => allRows.findIndex((row) => sameRow(row, target));
  const absorbNewSidebarPanels = () => {
    const configuredIds = new Set(sidebarDraft.map((entry) => entry.id));
    const added = options.getSidebarPanelSettings().filter((setting) => !configuredIds.has(setting.id));
    if (added.length === 0)
      return;
    const focusedRow = rows()[focus];
    sidebarDraft.push(...added.map((setting) => ({ id: setting.id, visible: false })));
    if (focusedRow)
      focus = Math.max(0, rowIndex(focusedRow));
  };
  const request = (live = false) => {
    options.requestWorkspaceRender();
    if (live)
      options.requestLiveRender();
  };
  const tell = (message, kind = "info") => {
    feedback = message;
    options.report?.(message, kind);
  };
  const warn = (message) => {
    tell(message, "warning");
    request();
  };
  const refresh = () => {
    display = cloneDisplay(options.getDisplaySettings());
  };
  const commitMutation = (next, message) => {
    undo = { kind: "display", value: cloneOverride(options.getSessionDisplayOverride()) };
    const complete = cloneDisplay(next);
    complete.preset = derivePresetIdentity(complete);
    options.replaceSessionDisplayOverride(complete);
    display = complete;
    tell(message);
    request(true);
  };
  const changeSidebar = (next, message) => {
    undo = { kind: "sidebar", value: cloneLayout(sidebarDraft) };
    sidebarDraft = next;
    sidebarDirty = true;
    tell(message);
    request();
  };
  const revert = () => {
    undo = { kind: "display", value: cloneOverride(options.getSessionDisplayOverride()) };
    options.clearSessionDisplayOverride();
    refresh();
    tell("Reverted to Effective lower-layer settings");
    request(true);
  };
  const undoOnce = () => {
    const previous = undo;
    if (!previous) {
      warn("Nothing to undo");
      return;
    }
    undo = undefined;
    if (previous.kind === "sidebar") {
      sidebarDraft = previous.value;
      sidebarDirty = true;
      tell("Undid the last Sidebar change");
      request();
    } else {
      options.replaceSessionDisplayOverride(previous.value);
      refresh();
      tell("Undid the last Display change");
      request(true);
    }
  };
  const restoreSidebarDefault = () => changeSidebar(cloneLayout(DEFAULT_SIDEBAR_PANEL_LAYOUT), "Restored product Sidebar default");
  const save = async () => {
    if (saving)
      return;
    if (sidebarDirty && !sidebarDraft.some((entry) => entry.visible)) {
      warn("At least one Sidebar panel must remain visible");
      return;
    }
    saving = true;
    request();
    const patch = {
      ...cloneDisplay(display),
      ...sidebarDirty ? { sidebarPanelLayout: cloneLayout(sidebarDraft) } : {}
    };
    try {
      await options.persistUserDisplayPatch(patch);
      options.applySavedUserDisplayPatch(patch);
      refresh();
      if (sidebarDirty) {
        sidebarDirty = false;
        if (undo?.kind === "sidebar")
          undo = undefined;
      }
      tell("Saved as User default");
    } catch (error) {
      tell(`Save failed: ${errorMessage(error)}`, "error");
    } finally {
      saving = false;
      request(true);
    }
  };
  const runAction = (id) => {
    if (id === "save")
      save();
    else if (id === "revert")
      revert();
    else if (id === "undo")
      undoOnce();
    else
      restoreSidebarDefault();
  };
  const activate = () => {
    const row = rows()[focus];
    if (!row)
      return;
    switch (row.kind) {
      case "preset": {
        const current = TEMPLATE_NAMES.findIndex((name) => name === display.preset);
        const next = TEMPLATE_NAMES[(current + 1) % TEMPLATE_NAMES.length] ?? "editorial";
        commitMutation(applyDisplayTemplate(next), `Applied ${next} preset`);
        return;
      }
      case "density":
        commitMutation({ ...cloneDisplay(display), density: display.density === "compact" ? "comfortable" : "compact" }, "Changed density");
        return;
      case "segment":
        if (isRequiredSegment(row.id)) {
          warn(`${row.id} is required; use Shift+Up/Down to reorder`);
          return;
        }
        commitMutation({ ...cloneDisplay(display), segmentLayout: toggleSegmentVisibility(display.segmentLayout, row.id) }, `Toggled ${row.id}`);
        return;
      case "sidebarPanel": {
        const index = sidebarDraft.findIndex((item2) => item2.id === row.id);
        const entry = sidebarDraft[index];
        if (!entry)
          return;
        const next = cloneLayout(sidebarDraft);
        next[index] = { ...entry, visible: !entry.visible };
        changeSidebar(next, `${row.id} ${entry.visible ? "hidden" : "shown"}`);
        return;
      }
      case "action":
        runAction(row.id);
    }
  };
  const move = (direction) => {
    const row = rows()[focus];
    if (!row || row.kind !== "segment" && row.kind !== "sidebarPanel") {
      warn("Select a Segment or Sidebar panel to reorder");
      return;
    }
    const layout2 = row.kind === "segment" ? display.segmentLayout : sidebarDraft;
    const index = layout2.findIndex((entry) => entry.id === row.id);
    const target = direction === "earlier" ? index - 1 : index + 1;
    if (target < 0 || target >= layout2.length) {
      warn(`${row.id} is already at the ${direction === "earlier" ? "start" : "end"}`);
      return;
    }
    if (row.kind === "sidebarPanel") {
      const next = cloneLayout(sidebarDraft);
      const [moved] = next.splice(index, 1);
      if (moved)
        next.splice(target, 0, moved);
      changeSidebar(next, `Moved ${row.id} ${direction}`);
    } else {
      commitMutation({ ...cloneDisplay(display), segmentLayout: reorderSegment(display.segmentLayout, row.id, direction) }, `Moved ${row.id} ${direction}`);
    }
    focus = rowIndex(row);
  };
  const actionForKey = (data) => Object.keys(ACTION_KEYS).find((id) => ACTION_KEYS[id] === data.toUpperCase());
  const buildContent = (outerInner) => {
    const { theme } = options;
    const provenance = options.getDisplayProvenance();
    const allRows = rows();
    const rowLine = (row, text) => {
      const focused = focus === rowIndex(row, allRows);
      return { line: `${focused ? theme.fg("accent", "›") : " "} ${text}`, focused };
    };
    const actionLine = (id, label, hint = ACTION_KEYS[id]) => rowLine({ kind: "action", id }, `${label.padEnd(16)}${hint}`);
    const sessionChanged = options.getSessionDisplayOverride() !== undefined;
    const displayLines = [
      rowLine({ kind: "preset" }, `Preset       ${display.preset.padEnd(13)} ${provenance.preset}`),
      rowLine({ kind: "density" }, `Density      ${display.density.padEnd(13)} ${provenance.density}`),
      { line: "" },
      actionLine("save", "Save default", saving ? "saving…" : ACTION_KEYS.save),
      actionLine("revert", "Revert session"),
      actionLine("undo", "Undo", undo ? ACTION_KEYS.undo : "—")
    ];
    const segmentLines = [
      { line: theme.fg("muted", `  ● shown   ○ hidden   ◆ required   order ${provenance.order}`) },
      { line: "" },
      ...display.segmentLayout.map((entry, index) => {
        const required = isRequiredSegment(entry.id);
        const state = required ? "◆" : entry.visible ? "●" : "○";
        return rowLine({ kind: "segment", id: entry.id }, `${String(index + 1).padStart(2)}  ${state} ${entry.id.padEnd(12)}${required ? "  required" : ""}`);
      })
    ];
    const sidebarSettings = new Map(options.getSidebarPanelSettings().map((entry) => [entry.id, entry]));
    const sidebarLines = [
      { line: theme.fg("muted", `  ● shown   ○ hidden   ${sidebarDirty ? "draft · " : ""}saved order`) },
      { line: "" },
      ...sidebarDraft.map((entry, index) => {
        const setting = sidebarSettings.get(entry.id);
        const suffix = setting?.available === false ? "  unavailable" : "";
        return rowLine({ kind: "sidebarPanel", id: entry.id }, `${String(index + 1).padStart(2)}  ${entry.visible ? "●" : "○"} ${setting?.title || entry.id}${suffix}`);
      }),
      { line: "" },
      actionLine("sidebar-default", "Restore default")
    ];
    const previewLine = renderFooterLine(representativeState, { ...options.getRenderConfig(), ...cloneDisplay(display) }, theme, Math.max(1, outerInner - 6), { colorEnabled: options.colorEnabled ?? true });
    const preview = [
      ...panel("Preview", [{ line: `  ${previewLine}` }], outerInner, theme, true),
      { line: "" },
      ...panel("Sidebar Preview", sidebarDraft.filter((entry) => entry.visible).map((entry) => ({ line: `  ${entry.id}` })), outerInner, theme)
    ];
    let editing;
    if (outerInner >= 72) {
      const leftWidth = Math.max(28, Math.floor((outerInner - 2) * 0.4));
      const rightWidth = outerInner - leftWidth - 2;
      const height = Math.max(displayLines.length, segmentLines.length);
      const left = panel("Display", [...displayLines, ...blankLines(height - displayLines.length)], leftWidth, theme);
      const right = panel("Segment Editor", [...segmentLines, ...blankLines(height - segmentLines.length)], rightWidth, theme);
      editing = [
        ...left.map((leftLine, index) => ({
          line: `${leftLine.line}  ${right[index]?.line ?? fitToWidth("", rightWidth)}`,
          focused: Boolean(leftLine.focused || right[index]?.focused)
        })),
        { line: "" },
        ...panel("Sidebar Editor", sidebarLines, outerInner, theme)
      ];
    } else {
      editing = [
        ...panel("Display", displayLines, outerInner, theme),
        { line: "" },
        ...panel("Segment Editor", segmentLines, outerInner, theme),
        { line: "" },
        ...panel("Sidebar Editor", sidebarLines, outerInner, theme)
      ];
    }
    const selected = allRows[focus];
    let guidance = KEY_HINTS;
    if (selected?.kind === "segment") {
      const required = isRequiredSegment(selected.id);
      const visibility = required ? "required" : display.segmentLayout.find((entry) => entry.id === selected.id)?.visible ? "shown" : "hidden";
      guidance = `${selected.id} · ${visibility} · source:${provenance.visibility[selected.id]} · order:${provenance.order} · ${required ? "Shift+↑/↓ Reorder" : "Enter Toggle · Shift+↑/↓ Reorder"}`;
    } else if (selected?.kind === "preset" || selected?.kind === "density") {
      guidance = `${selected.kind} · source:${provenance[selected.kind]} · Enter Change · U Undo`;
    } else if (selected?.kind === "sidebarPanel") {
      const entry = sidebarDraft.find((item2) => item2.id === selected.id);
      const available = sidebarSettings.get(selected.id)?.available !== false;
      guidance = `${selected.id} · ${entry?.visible ? "shown" : "hidden"} · ${available ? "available" : "unavailable"} · Enter Toggle · Shift+↑/↓ Reorder`;
    } else if (selected?.kind === "action") {
      guidance = `${selected.id} · Enter or ${ACTION_KEYS[selected.id]}`;
    }
    const status = saving ? "saving…" : sessionChanged || sidebarDirty ? "session changed" : "effective";
    const content = [
      {
        line: fitToWidth(`${theme.bold(TITLE)}  ${theme.fg(sessionChanged ? "warning" : "success", status)}`, outerInner)
      },
      { line: fitToWidth(theme.fg("muted", KEY_HINTS), outerInner) },
      { line: "" },
      ...preview,
      { line: "" },
      ...editing,
      { line: "" },
      ...feedback ? [{ line: fitToWidth(feedback, outerInner) }] : [],
      { line: fitToWidth(guidance, outerInner) }
    ];
    return { content, sessionChanged };
  };
  return {
    invalidate() {},
    handleInput(data) {
      absorbNewSidebarPanels();
      const action = actionForKey(data);
      if (matchesKey2(data, "up")) {
        focus = Math.max(0, focus - 1);
        request();
      } else if (matchesKey2(data, "down")) {
        focus = Math.min(rows().length - 1, focus + 1);
        request();
      } else if (matchesKey2(data, "shift+up"))
        move("earlier");
      else if (matchesKey2(data, "shift+down"))
        move("later");
      else if (matchesKey2(data, "enter") || data === " ")
        activate();
      else if (matchesKey2(data, "escape"))
        options.close();
      else if (action)
        runAction(action);
    },
    render(width) {
      if (width <= 0)
        return [];
      absorbNewSidebarPanels();
      const outerInner = Math.max(0, width - 2);
      const { content } = buildContent(outerInner);
      const border = (text) => options.theme.fg("borderAccent", text);
      const frame = (lines) => [
        border(`╭${"─".repeat(outerInner)}╮`),
        ...lines.map(({ line }) => `${border("│")}${fitToWidth(line, outerInner)}${border("│")}`),
        border(`╰${"─".repeat(outerInner)}╯`)
      ].map((line) => truncateToWidth5(line, width, ""));
      const viewportHeight = options.getViewportHeight?.();
      if (viewportHeight === undefined)
        return frame(content);
      const height = Math.max(0, Math.floor(viewportHeight));
      if (height === 0)
        return [];
      if (height === 1)
        return [fitToWidth(options.theme.bold(TITLE), width)];
      const fixedTop = content.slice(0, 2);
      const fixedBottom = content.slice(-1);
      const interiorRows = height - 2;
      if (interiorRows < fixedTop.length + fixedBottom.length) {
        return frame([...fixedTop, ...fixedBottom].slice(0, interiorRows));
      }
      const central = content.slice(2, -1);
      while (central.at(-1)?.line === "")
        central.pop();
      const centralRows = interiorRows - fixedTop.length - fixedBottom.length;
      const virtualized = virtualize(central, centralRows, scrollOffset, outerInner);
      scrollOffset = virtualized.scrollOffset;
      const centralLines = [...virtualized.lines, ...blankLines(centralRows - virtualized.lines.length)];
      return frame([...fixedTop, ...centralLines, ...fixedBottom].slice(0, interiorRows));
    }
  };
}

// src/menu.ts
function sidebarStatusLabel(status) {
  const label = status.mode === "auto" ? "Auto" : "Manual";
  if (!status.enabled)
    return `${label} · hidden`;
  return status.presentation === "auto-collapsed" || status.presentation === "too-narrow" ? `${label} · hidden: narrow terminal` : label;
}
var THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
function renderMenuFrame(theme, lines, width) {
  const border = (text) => theme.bold(theme.fg("borderAccent", text));
  if (width <= 1)
    return [truncateToWidth6(border("━"), Math.max(0, width), "")];
  const innerWidth = width - 2;
  return [
    border(`┏${"━".repeat(innerWidth)}┓`),
    ...lines.map((line) => `${border("┃")}${fitToWidth(line, innerWidth)}${border("┃")}`),
    border(`┗${"━".repeat(innerWidth)}┛`)
  ];
}
function createMenuActions(pi, ctx, runtime, userConfigPath, savePatch = saveUserConfigPatch, options = {}) {
  const isActive = () => isLifetimeActive(options.lifetime);
  const notify = (message, kind) => {
    if (isActive())
      ctx.ui.notify(message, kind);
  };
  const reportFailure = (what, error, restored) => notify(`Could not change ${what}: ${errorMessage(error)}${restored ? "" : `; the previous ${what} could not be restored`}`, "error");
  const attempt = (restore) => {
    try {
      restore();
      return true;
    } catch {
      return false;
    }
  };
  const persistPreference = async (patch, messages, rollback, apply = () => {
    return;
  }) => {
    if (!isActive())
      return;
    const previous = runtime.getConfig();
    runtime.setConfig({ ...previous, ...patch });
    apply();
    try {
      await savePatch(userConfigPath, patch);
      notify(messages.saved, "info");
    } catch (error) {
      if (!isActive())
        return;
      if (rollback) {
        runtime.setConfig(previous);
        apply();
      }
      notify(`${messages.failed}: ${errorMessage(error)}`, "warning");
    }
  };
  return {
    async selectModel(model) {
      if (!isActive())
        return;
      const previous = ctx.model;
      try {
        if (!await pi.setModel(model)) {
          notify(`Model ${model.provider}/${model.id} has no available authentication`, "error");
          return;
        }
        if (isActive())
          runtime.refreshUsage();
      } catch (error) {
        if (!isActive())
          return;
        let restored = true;
        if (previous) {
          try {
            restored = await pi.setModel(previous);
          } catch {
            restored = false;
          }
        }
        reportFailure("model", error, restored);
      }
    },
    setThinkingLevel(level) {
      if (!isActive())
        return;
      const previous = pi.getThinkingLevel();
      try {
        pi.setThinkingLevel(level);
        if (isActive())
          runtime.refreshUsage();
      } catch (error) {
        if (isActive())
          reportFailure("thinking level", error, attempt(() => pi.setThinkingLevel(previous)));
      }
    },
    setTools(names) {
      if (!isActive())
        return;
      const previous = pi.getActiveTools();
      try {
        const known = new Set(pi.getAllTools().map((tool) => tool.name));
        pi.setActiveTools(names.filter((name) => known.has(name)));
      } catch (error) {
        if (isActive())
          reportFailure("tools", error, attempt(() => pi.setActiveTools(previous)));
      }
    },
    setShowSidebarOnStartup: (enabled) => persistPreference({ showSidebarOnStartup: enabled }, {
      saved: `Sidebar will start ${enabled ? "shown" : "hidden"}`,
      failed: "Sidebar startup preference could not be saved"
    }, true),
    setCompletionNotifications: (enabled) => persistPreference({ completionNotifications: enabled }, {
      saved: `Completion notifications ${enabled ? "enabled" : "disabled"}`,
      failed: "Completion notifications changed for this session but could not be saved"
    }, false),
    setPrefillEnabled: (enabled) => persistPreference({ prefillEnabled: enabled }, {
      saved: `Prefill progress ${enabled ? "enabled" : "disabled"}`,
      failed: "Prefill progress changed for this session but could not be saved"
    }, false),
    setNerdFont: (enabled) => persistPreference({ nerdFont: enabled }, {
      saved: `Font mode: ${enabled ? "Nerd Font" : "Plain text"}`,
      failed: "Font mode changed for this session but could not be saved"
    }, false),
    setShowFooter: (enabled) => persistPreference({ showFooter: enabled }, {
      saved: `Atelier footer ${enabled ? "enabled" : "disabled; Pi's footer restored"}`,
      failed: "Atelier footer changed for this session but could not be saved"
    }, false, () => options.syncFooter?.())
  };
}
async function showSelection(ctx, title, items, lifetime) {
  return openLifecycleOverlay(ctx, (tui, theme, finish) => {
    const container = new Container;
    container.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));
    const list = new SelectList(items, Math.min(items.length, 12), {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text)
    });
    list.onSelect = (item2) => finish(item2.value);
    list.onCancel = () => finish();
    container.addChild(list);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc back"), 1, 0));
    return {
      render: (width) => renderMenuFrame(theme, container.render(Math.max(1, width - 2)), width),
      invalidate: () => container.invalidate(),
      handleInput: (data) => {
        list.handleInput(data);
        tui.requestRender();
      }
    };
  }, lifetime);
}
async function showToolSettings(ctx, pi, setTools, lifetime) {
  await openLifecycleOverlay(ctx, (tui, _theme, finish) => {
    const tools = pi.getAllTools();
    const enabled = new Set(pi.getActiveTools());
    const items = tools.map((tool) => ({
      id: tool.name,
      label: tool.name,
      currentValue: enabled.has(tool.name) ? "enabled" : "disabled",
      values: ["enabled", "disabled"]
    }));
    const list = new SettingsList(items, Math.min(items.length + 2, 16), getSettingsListTheme(), (id, value) => {
      if (!isLifetimeActive(lifetime))
        return;
      if (value === "enabled")
        enabled.add(id);
      else
        enabled.delete(id);
      if (enabled.size === 0) {
        enabled.add(id);
        ctx.ui.notify("At least one tool must remain active", "warning");
      }
      setTools([...enabled]);
    }, finish, { enableSearch: true });
    return {
      render: (width) => list.render(width),
      invalidate: () => list.invalidate(),
      handleInput: (data) => {
        list.handleInput(data);
        tui.requestRender();
      }
    };
  }, lifetime);
}
async function openDisplaySettingsWorkspace(ctx, runtime, getSidebarPanelSettings, userConfigPath, requestAllRenders = () => {
  return;
}, savePatch = saveUserConfigPatch, { lifetime } = {}) {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("Pi Atelier Display settings require TUI mode", "warning");
    return;
  }
  const isActive = () => isLifetimeActive(lifetime);
  const ensureActive = () => {
    if (!isActive())
      throw new Error("Pi Atelier is not active in this session");
  };
  await openLifecycleOverlay(ctx, (tui, theme, finish) => createSettingsWorkspace({
    getDisplaySettings: () => runtime.getDisplaySettings(),
    getSidebarPanelSettings,
    getDisplayProvenance: () => runtime.getDisplayProvenance(),
    getSessionDisplayOverride: () => runtime.getSessionDisplayOverride(),
    replaceSessionDisplayOverride: (value) => {
      if (isActive())
        runtime.replaceSessionDisplayOverride(value);
    },
    clearSessionDisplayOverride: () => {
      if (isActive())
        runtime.clearSessionDisplayOverride();
    },
    persistUserDisplayPatch: async (patch) => {
      ensureActive();
      await savePatch(userConfigPath, patch);
      ensureActive();
    },
    applySavedUserDisplayPatch: (patch) => {
      if (isActive())
        runtime.applySavedUserDisplayPatch(patch);
    },
    getRenderConfig: () => runtime.getConfig(),
    getViewportHeight: () => getDisplaySettingsViewportHeight(tui.terminal.rows),
    theme,
    colorEnabled: isColorEnabled(),
    requestWorkspaceRender: () => {
      if (isActive())
        tui.requestRender();
    },
    requestLiveRender: () => {
      if (isActive())
        requestAllRenders();
    },
    close: finish,
    report: (message, kind) => {
      if (kind === "error" && isActive())
        ctx.ui.notify(message, "error");
    }
  }), lifetime, {
    anchor: "center",
    width: "90%",
    minWidth: 36,
    maxHeight: DISPLAY_SETTINGS_OVERLAY_MAX_HEIGHT,
    margin: DISPLAY_SETTINGS_OVERLAY_MARGIN
  });
}
var onOff = (value) => value ? "On" : "Off";
async function openAtelierControlCenter(pi, ctx, runtime, userConfigPath, sidebar, requestAllRenders = () => {
  return;
}, savePatch = saveUserConfigPatch, options = {}) {
  const { lifetime, openUsage } = options;
  if (ctx.mode !== "tui") {
    ctx.ui.notify("Pi Atelier Control Center requires TUI mode", "warning");
    return;
  }
  const isActive = () => isLifetimeActive(lifetime);
  const actions = createMenuActions(pi, ctx, runtime, userConfigPath, savePatch, options);
  const choose = async (title, items) => {
    if (!isActive())
      return;
    const choice = await showSelection(ctx, title, items, lifetime);
    return isActive() ? choice : undefined;
  };
  const settingsMenu = async () => {
    for (;; ) {
      const config = runtime.getConfig();
      const choice = await choose("Settings", [
        {
          value: "display",
          label: `Display: ${runtime.getDisplaySettings().preset}`,
          description: "Session overrides, preview, Undo, Revert, and Save"
        },
        {
          value: "font-mode",
          label: `Font mode: ${config.nerdFont ? "Nerd Font" : "Plain text"}`,
          description: "Global user preference; plain text needs no Nerd Font"
        },
        {
          value: "footer",
          label: `Atelier footer: ${onOff(config.showFooter)}`,
          description: "Global user preference; Off keeps Pi's footer and composer"
        },
        {
          value: "sidebar-startup",
          label: `Sidebar on startup: ${config.showSidebarOnStartup ? "On" : "Off"}`,
          description: "Global user preference"
        },
        {
          value: "notifications",
          label: `Completion notifications: ${onOff(config.completionNotifications)}`,
          description: "User preference"
        },
        {
          value: "prefill",
          label: `Prefill progress: ${onOff(config.prefillEnabled)}`,
          description: "Show how far a local model has read the prompt (user preference)"
        },
        {
          value: "sidebar-tools",
          label: `Sidebar tool list: ${sidebar.isToolListExpanded() ? "Expanded" : "Collapsed"}`,
          description: "User preference"
        },
        { value: "back", label: "Back" }
      ]);
      switch (choice) {
        case "display":
          await openDisplaySettingsWorkspace(ctx, runtime, sidebar.getSidebarPanelSettings, userConfigPath, requestAllRenders, savePatch, options);
          break;
        case "font-mode":
          await actions.setNerdFont(!runtime.getConfig().nerdFont);
          break;
        case "footer":
          await actions.setShowFooter(!runtime.getConfig().showFooter);
          break;
        case "sidebar-startup":
          await actions.setShowSidebarOnStartup(!runtime.getConfig().showSidebarOnStartup);
          break;
        case "notifications":
          await actions.setCompletionNotifications(!runtime.getConfig().completionNotifications);
          break;
        case "prefill":
          await actions.setPrefillEnabled(!runtime.getConfig().prefillEnabled);
          break;
        case "sidebar-tools":
          await sidebar.toggleToolList();
          break;
        default:
          return;
      }
    }
  };
  const modelMenu = async () => {
    const selected = await choose("Model controls", [
      { value: "model", label: "Choose model" },
      { value: "thinking", label: "Thinking level" },
      { value: "back", label: "Back" }
    ]);
    if (selected === "model") {
      const models = new Map(ctx.modelRegistry.getAvailable().map((model2) => [`${model2.provider}/${model2.id}`, model2]));
      const choice = await choose("Choose model", [...models.keys()].map((label) => ({ value: label, label })));
      const model = choice === undefined ? undefined : models.get(choice);
      if (model)
        await actions.selectModel(model);
    } else if (selected === "thinking") {
      const level = await choose("Thinking level", THINKING_LEVELS.map((value) => ({ value, label: value })));
      const thinkingLevel = THINKING_LEVELS.find((value) => value === level);
      if (thinkingLevel)
        actions.setThinkingLevel(thinkingLevel);
    }
  };
  const sidebarMenu = async () => {
    const mode = await choose("Sidebar mode", [
      { value: "auto", label: "Auto", description: "Show when there is comfortable reading space" },
      {
        value: "manual",
        label: "Manual",
        description: "Adjust width manually; hide only when too narrow to fit"
      },
      {
        value: "toggle",
        label: sidebar.getStatus().enabled ? "Hide sidebar" : "Show sidebar",
        description: "Keep the current mode"
      },
      { value: "back", label: "Back" }
    ]);
    if (mode === "auto" || mode === "manual")
      sidebar.setMode(mode);
    else if (mode === "toggle")
      sidebar.toggle();
  };
  const controlsMenu = async () => {
    for (;; ) {
      const choice = await choose("Controls", [
        {
          value: "sidebar",
          label: `Sidebar: ${sidebarStatusLabel(sidebar.getStatus())}`,
          description: "Choose Auto or Manual; show or hide independently"
        },
        {
          value: "model",
          label: `Model / thinking: ${ctx.model?.id ?? "none"} / ${pi.getThinkingLevel()}`,
          description: "Session control"
        },
        {
          value: "tools",
          label: `Active tools: ${pi.getActiveTools().length}`,
          description: "Session control"
        },
        { value: "back", label: "Back" }
      ]);
      switch (choice) {
        case "sidebar":
          await sidebarMenu();
          break;
        case "model":
          await modelMenu();
          break;
        case "tools":
          await showToolSettings(ctx, pi, actions.setTools, lifetime);
          break;
        default:
          return;
      }
    }
  };
  for (;; ) {
    const category = await choose("◆ Atelier Control Center", [
      { value: "settings", label: "Settings", description: "Persisted defaults and Display workspace" },
      {
        value: "controls",
        label: "Controls",
        description: `Session controls · Sidebar: ${sidebarStatusLabel(sidebar.getStatus())}`
      },
      ...openUsage ? [{ value: "usage", label: "Subagent usage", description: "Cost curves and individual reply costs" }] : [],
      { value: "close", label: "Close" }
    ]);
    if (category === "usage")
      await openUsage?.();
    else if (category === "settings")
      await settingsMenu();
    else if (category === "controls")
      await controlsMenu();
    else
      return;
    if (!isActive())
      return;
  }
}

// src/sidebar.ts
import { basename as basename2 } from "node:path";
import { truncateToWidth as truncateToWidth8, visibleWidth as visibleWidth7 } from "@earendil-works/pi-tui";

// src/state.ts
import { isDeepStrictEqual } from "node:util";

// src/activity.ts
var WORKING_PHRASES = [
  "KNEADING",
  "PERCOLATING",
  "MARINATING",
  "CARAMELIZING",
  "JULIENNING",
  "FLAMBÉING",
  "CHOREOGRAPHING",
  "MOONWALKING",
  "JITTERBUGGING",
  "SOCK-HOPPING",
  "BOOGIEING",
  "SHIMMYING",
  "EBBING",
  "UNDULATING",
  "PROPAGATING",
  "PHOTOSYNTHESIZING",
  "GERMINATING",
  "POLLINATING",
  "PONDERING",
  "RUMINATING",
  "COGITATING",
  "CEREBRATING",
  "DELIBERATING",
  "MUSING",
  "FROLICKING",
  "LOLLYGAGGING",
  "DILLY-DALLYING",
  "BOONDOGGLING",
  "SHENANIGANING",
  "RAZZLE-DAZZLING",
  "CLAUDING",
  "GITIFYING",
  "RETICULATING",
  "HYPERSPACING",
  "QUANTUMIZING",
  "COMBOBULATING"
];
function selectWorkingPhrase(randomValue) {
  const bounded = Number.isFinite(randomValue) ? Math.min(1, Math.max(0, randomValue)) : 0;
  const index = Math.min(WORKING_PHRASES.length - 1, Math.floor(bounded * WORKING_PHRASES.length));
  return WORKING_PHRASES[index] ?? WORKING_PHRASES[0];
}

// src/subagent-usage.ts
import { opendir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname as dirname2, isAbsolute, join as join2, resolve } from "node:path";

// src/bounded-file.ts
import { constants } from "node:fs";
import { open } from "node:fs/promises";
async function readBoundedFile(path, maxBytes, signal) {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxBytes)
      throw new Error(`Unreadable file: ${path}`);
    const buffer = Buffer.alloc(stat.size);
    let length = 0;
    while (length < buffer.length && !signal?.aborted) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (bytesRead === 0)
        break;
      length += bytesRead;
    }
    return buffer.subarray(0, length);
  } finally {
    await file.close();
  }
}

// src/subagent-cost-history.ts
import { join } from "node:path";
var MAX_EVENTS_BYTES = 2 * 1024 * 1024;
var MAX_TOTAL_BYTES = 8 * 1024 * 1024;
var MAX_POINTS = 2048;
var object = (value) => isRecord(value) ? value : undefined;
var numeric = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
async function readSubagentCostHistory(sources, signal) {
  const series = [];
  let unavailable = 0;
  let remainingBytes = MAX_TOTAL_BYTES;
  for (const source of sources) {
    if (signal?.aborted)
      break;
    const runs = new Map;
    try {
      const buffer = await readBoundedFile(join(source.directory, "events.jsonl"), Math.min(MAX_EVENTS_BYTES, remainingBytes), signal);
      remainingBytes -= buffer.length;
      if (signal?.aborted)
        break;
      const text = buffer.toString("utf8");
      const lines = text.slice(0, text.lastIndexOf(`
`) + 1).split(`
`);
      let corrupt = false;
      for (const [index, step] of source.steps.entries()) {
        const startedAt = step.startedAt ?? source.startedAt;
        if (numeric(startedAt))
          runs.set(index, {
            id: `${source.runId}:${index}`,
            runId: source.runId,
            stepIndex: index,
            agent: step.agent,
            startedAt,
            points: [{ at: startedAt, cost: 0 }],
            partial: false
          });
      }
      const seen = new Set;
      for (const line of lines) {
        if (!line)
          continue;
        let event;
        try {
          event = object(JSON.parse(line));
        } catch {
          corrupt = true;
          continue;
        }
        const index = event?.subagentStepIndex;
        if (event?.type !== "message_end" || event.subagentSource !== "child" || event.subagentRunId !== source.runId || typeof index !== "number")
          continue;
        const step = source.steps[index];
        const message = object(event.message);
        if (!step || event.subagentAgent !== step.agent || message?.role !== "assistant")
          continue;
        const at = event.observedAt;
        const cost = object(object(message.usage)?.cost)?.total;
        const run = runs.get(index);
        if (!run)
          continue;
        if (!numeric(at) || !numeric(cost) || at < run.startedAt) {
          run.partial = true;
          continue;
        }
        const key = JSON.stringify([index, at, message.timestamp, cost]);
        if (seen.has(key))
          continue;
        seen.add(key);
        const previous = run.points[run.points.length - 1] ?? { at: run.startedAt, cost: 0 };
        if (at < previous.at || run.points.length >= MAX_POINTS) {
          run.partial = true;
          continue;
        }
        const total = previous.cost + cost;
        if (!Number.isFinite(total)) {
          run.partial = true;
          continue;
        }
        run.points.push({ at, cost: total });
      }
      for (const run of runs.values()) {
        run.partial ||= corrupt;
        series.push(run);
      }
    } catch {
      unavailable++;
    }
  }
  const unique = new Map;
  for (const run of series) {
    const previous = unique.get(run.id);
    if (!previous || (run.points.at(-1)?.at ?? 0) > (previous.points.at(-1)?.at ?? 0))
      unique.set(run.id, run);
  }
  return {
    series: [...unique.values()].sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id)),
    unavailable
  };
}

// src/subagent-usage.ts
var SUBAGENT_METADATA_ENTRY = "pi-atelier:subagent-metadata";
var MAX_FILES = 1000;
var MAX_DIRECTORY_ENTRIES = 20000;
var MAX_BYTES = 2 * 1024 * 1024;
var MAX_PATH_LENGTH = 4096;
var RUN_ID = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,160}$/;
var SUBAGENT_TOOLS = new Set(["subagent", "bg_wait"]);
var TERMINAL_STATES = new Set([
  "complete",
  "completed",
  "failed",
  "aborted",
  "stopped",
  "cancelled",
  "interrupted",
  "paused"
]);
var emptySubagentUsage = () => ({
  runs: [],
  unavailable: 0,
  pending: 0,
  limited: false,
  costHistory: [],
  historyUnavailable: 0
});
var record = (value) => isRecord(value) ? value : undefined;
var nonNegative = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
var isRunId = (value) => typeof value === "string" && RUN_ID.test(value);
var isBoundedAbsolutePath = (value) => typeof value === "string" && value.length <= MAX_PATH_LENGTH && isAbsolute(value);
var isMetadataPath = (value) => isBoundedAbsolutePath(value) && value.endsWith("_meta.json");
function subagentMetadataReferences(value) {
  const runIds = new Set;
  const paths = new Set;
  const asyncDirs = new Set;
  let remaining = 1e4;
  const visit = (value2, depth) => {
    if (depth > 8 || --remaining < 0)
      return;
    if (Array.isArray(value2)) {
      for (const item3 of value2.slice(0, MAX_FILES))
        visit(item3, depth + 1);
      return;
    }
    const item2 = record(value2);
    if (!item2)
      return;
    for (const key of ["runId", "asyncId", "childRunId"]) {
      const id = item2[key];
      if (isRunId(id))
        runIds.add(id);
    }
    if (isBoundedAbsolutePath(item2.asyncDir))
      asyncDirs.add(item2.asyncDir);
    const path = record(item2.artifactPaths)?.metadataPath;
    if (isMetadataPath(path))
      paths.add(path);
    for (const key of ["results", "completions", "workflowChildren", "children", "result", "details"])
      visit(item2[key], depth + 1);
  };
  visit(value, 0);
  return { runIds: [...runIds], paths: [...paths], asyncDirs: [...asyncDirs] };
}
function sessionSubagentReferences(entries) {
  const runIds = new Set;
  const paths = new Set;
  const asyncDirs = new Set;
  for (const raw of entries) {
    const entry = record(raw);
    const message = record(entry?.message);
    let refs;
    if (entry?.type === "custom" && entry.customType === SUBAGENT_METADATA_ENTRY) {
      const data = record(entry.data);
      const list = (value) => Array.isArray(value) ? value : [];
      refs = {
        asyncDirs: list(data?.asyncDirs).filter(isBoundedAbsolutePath),
        runIds: list(data?.runIds).filter(isRunId),
        paths: list(data?.paths).filter(isMetadataPath)
      };
    } else if (entry?.type === "message" && message?.role === "toolResult" && SUBAGENT_TOOLS.has(message.toolName) || entry?.type === "custom_message" && entry.customType === "subagent-slash-result") {
      refs = subagentMetadataReferences(entry.type === "message" ? message?.details : entry.details);
    }
    for (const id of refs?.runIds ?? [])
      runIds.add(id);
    for (const path of refs?.paths ?? [])
      paths.add(path);
    for (const dir of refs?.asyncDirs ?? [])
      asyncDirs.add(dir);
  }
  return { runIds: [...runIds], paths: [...paths], asyncDirs: [...asyncDirs] };
}
function tempArtifactsDirectory() {
  const override = process.env.PI_SUBAGENTS_TEMP_ROOT?.trim();
  if (override)
    return join2(resolve(override), "artifacts");
  if (process.getuid)
    return join2(tmpdir(), `pi-subagents-uid-${process.getuid()}`, "artifacts");
  const user = process.env.USERNAME || process.env.USER || process.env.LOGNAME;
  if (!user)
    return;
  const safe = user.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
  return join2(tmpdir(), `pi-subagents-user-${safe}`, "artifacts");
}
function matchesSubagentSession(owner, session) {
  return typeof owner === "string" && owner.length > 0 && (owner === session.sessionFile || owner === session.sessionId);
}
function isSubagentUsageEventForSession(data, entries, session) {
  const event = record(data);
  if (!event)
    return false;
  if (event.sessionId !== undefined)
    return matchesSubagentSession(event.sessionId, session);
  return typeof event.runId === "string" && sessionSubagentReferences(entries).runIds.includes(event.runId);
}
async function readArtifactJson(path) {
  return record(JSON.parse((await readBoundedFile(path, MAX_BYTES)).toString("utf8")));
}
async function expandAsyncStatuses(refs, session, signal) {
  const expansion = {
    runIds: new Set(refs.runIds),
    paths: [...refs.paths],
    workflowRoots: new Set,
    pendingRuns: new Set,
    historySources: []
  };
  const asyncDirs = new Set(refs.asyncDirs.slice(0, MAX_FILES));
  const enqueue = (asyncDir, rootId, id) => {
    if (id !== rootId && asyncDirs.size < MAX_FILES)
      asyncDirs.add(join2(dirname2(asyncDir), id));
  };
  for (const asyncDir of asyncDirs) {
    if (signal?.aborted)
      return;
    let status;
    try {
      status = await readArtifactJson(join2(asyncDir, "status.json"));
    } catch {
      continue;
    }
    const runId = status?.runId;
    if (!status || typeof runId !== "string" || !expansion.runIds.has(runId))
      continue;
    if (!matchesSubagentSession(status.sessionId, session))
      continue;
    const steps = (Array.isArray(status.steps) ? status.steps : []).slice(0, MAX_FILES);
    const childRefs = subagentMetadataReferences({
      results: steps,
      workflowChildren: status.workflowChildren
    });
    for (const id of childRefs.runIds)
      expansion.runIds.add(id);
    expansion.paths.push(...childRefs.paths);
    if (typeof status.state === "string" && !TERMINAL_STATES.has(status.state)) {
      expansion.pendingRuns.add(runId);
      for (const step of steps.map(record)) {
        if (typeof step?.runId === "string" && !TERMINAL_STATES.has(step.status))
          expansion.pendingRuns.add(step.runId);
      }
    }
    if (status.mode !== "workflow") {
      expansion.historySources.push({
        runId,
        directory: asyncDir,
        startedAt: nonNegative(status.startedAt),
        steps: steps.map((raw) => {
          const step = record(raw);
          return {
            agent: typeof step?.agent === "string" ? step.agent : "",
            startedAt: nonNegative(step?.startedAt)
          };
        })
      });
      continue;
    }
    expansion.workflowRoots.add(runId);
    for (const childId of childRefs.runIds)
      enqueue(asyncDir, runId, childId);
    try {
      const receipt = await readArtifactJson(join2(asyncDir, "workflow-receipt.json"));
      if (receipt?.workflowRunId !== runId)
        continue;
      for (const entry of Object.values(record(receipt.entries) ?? {}).slice(0, MAX_FILES).map(record)) {
        const continuation = record(entry?.continuation)?.runIds;
        for (const id of [entry?.latestRunId, ...Array.isArray(continuation) ? continuation : []]) {
          if (!isRunId(id))
            continue;
          expansion.runIds.add(id);
          enqueue(asyncDir, runId, id);
        }
      }
    } catch {}
  }
  return expansion;
}
async function findMetadataCandidates(expansion, options) {
  const paths = expansion.paths.slice(0, MAX_FILES);
  const candidates = new Set(paths);
  const directories = new Set(paths.map(dirname2));
  if (options.sessionFile)
    directories.add(join2(dirname2(options.sessionFile), "subagent-artifacts"));
  directories.add(join2(options.cwd, ".pi", "subagents", "artifacts"));
  const temp = tempArtifactsDirectory();
  if (temp)
    directories.add(temp);
  let limited = expansion.paths.length > MAX_FILES;
  let inspected = 0;
  for (const directory of directories) {
    if (options.signal?.aborted)
      return;
    try {
      for await (const entry of await opendir(directory)) {
        if (options.signal?.aborted)
          return;
        if (++inspected > MAX_DIRECTORY_ENTRIES || candidates.size >= MAX_FILES) {
          limited = true;
          break;
        }
        if (entry.isFile() && isReferencedMetadataName(entry.name, expansion.runIds))
          candidates.add(join2(directory, entry.name));
      }
    } catch {}
    if (limited)
      break;
  }
  return { candidates, limited };
}
function isReferencedMetadataName(name, runIds) {
  if (!name.endsWith("_meta.json"))
    return false;
  const separator = name.indexOf("_");
  for (let index = separator;index >= 0; index = name.indexOf("_", index + 1)) {
    if (runIds.has(name.slice(0, index)))
      return true;
  }
  return false;
}
function parseMetadataRun(path, data, runIds) {
  if (typeof data?.runId !== "string" || !runIds.has(data.runId))
    return;
  if (typeof data.agent !== "string" || data.agent.length === 0 || data.agent.length > 512)
    return "invalid";
  const name = basename(path);
  const expected = `${data.runId}_${data.agent.replace(/[^\w.-]/g, "_")}`;
  if (!name.startsWith(expected) || !/^(_\d+)?_meta\.json$/.test(name.slice(expected.length)))
    return;
  const usage = record(data.usage);
  if ([usage?.input, usage?.output, usage?.cacheRead, usage?.cacheWrite].some((value) => nonNegative(value) === undefined))
    return "invalid";
  const cost = nonNegative(usage?.cost);
  return {
    id: `${data.runId}/${name}`,
    runId: data.runId,
    agent: data.agent,
    metadataPath: path,
    cost: cost ?? 0,
    priced: cost !== undefined
  };
}
var COST_TOLERANCE = 0.00000001;
async function readSubagentUsage(options) {
  const snapshot = emptySubagentUsage();
  const refs = sessionSubagentReferences(options.entries);
  if (refs.runIds.length === 0)
    return snapshot;
  const expansion = await expandAsyncStatuses(refs, options, options.signal);
  if (!expansion)
    return snapshot;
  snapshot.pending = expansion.pendingRuns.size;
  const found = await findMetadataCandidates(expansion, options);
  if (!found)
    return snapshot;
  snapshot.limited = found.limited;
  const foundRuns = new Set;
  const runs = new Map;
  const seenPaths = new Set;
  for (const candidate of found.candidates) {
    if (options.signal?.aborted)
      return snapshot;
    try {
      const path = await realpath(candidate);
      if (seenPaths.has(path) || !isReferencedMetadataName(basename(path), expansion.runIds))
        continue;
      seenPaths.add(path);
      const data = await readArtifactJson(path);
      const run = parseMetadataRun(path, data, expansion.runIds);
      if (run === undefined)
        continue;
      if (run === "invalid") {
        snapshot.unavailable++;
        continue;
      }
      const timestamp = nonNegative(data?.timestamp) ?? 0;
      const existing = runs.get(run.id);
      if (!existing || timestamp > existing.timestamp)
        runs.set(run.id, { run, timestamp });
      foundRuns.add(run.runId);
    } catch {
      snapshot.unavailable++;
    }
  }
  snapshot.runs = [...runs.values()].map(({ run }) => run);
  const history = await readSubagentCostHistory(expansion.historySources, options.signal);
  let historyUnavailable = history.unavailable;
  snapshot.costHistory = history.series.filter((series) => {
    const matches = snapshot.runs.filter((run) => run.runId === series.runId && run.agent === series.agent);
    const saved = matches.length === 1 ? matches[0] : matches.find((run) => run.metadataPath.endsWith(`_${series.stepIndex}_meta.json`));
    const consistent = !saved?.priced || Math.abs(saved.cost - (series.points.at(-1)?.cost ?? 0)) <= COST_TOLERANCE;
    if (!consistent)
      historyUnavailable++;
    return consistent;
  });
  snapshot.historyUnavailable = historyUnavailable;
  snapshot.unavailable += [...expansion.runIds].filter((id) => !foundRuns.has(id) && !expansion.workflowRoots.has(id) && !expansion.pendingRuns.has(id)).length;
  return snapshot;
}

// src/workspace-pulse.ts
import { existsSync } from "node:fs";
import nodePath3 from "node:path";
var GIT_TIMEOUT_MS = 2000;
var EMPTY_TREE_HASH = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
var SKIPPED_EXEC_RESULT = { stdout: "", stderr: "", code: 1, killed: true };
function waitForInspection(running, signal) {
  if (signal.aborted)
    return Promise.resolve();
  return new Promise((resolve2, reject) => {
    const aborted = () => resolve2();
    signal.addEventListener("abort", aborted, { once: true });
    running.then(() => {
      signal.removeEventListener("abort", aborted);
      resolve2();
    }, (error) => {
      signal.removeEventListener("abort", aborted);
      reject(error);
    });
  });
}
function createWorkspacePulseRefresh(options) {
  const delayMs = options.delayMs ?? 250;
  let disposed = false;
  let enabled = true;
  let lifetime = new AbortController;
  let requestedVersion = 0;
  let completedVersion = 0;
  let timer;
  let inFlight;
  const isActive = (current) => !disposed && enabled && lifetime === current && !current.signal.aborted;
  const clearTimer = () => {
    if (timer)
      clearTimeout(timer);
    timer = undefined;
  };
  const runInspection = () => {
    const version = requestedVersion;
    const current = lifetime;
    const running = (async () => {
      let inspection;
      try {
        inspection = await options.inspect(current.signal);
      } catch {
        inspection = { kind: "unavailable" };
      }
      if (!isActive(current))
        return;
      completedVersion = Math.max(completedVersion, version);
      options.publish(inspection);
    })();
    inFlight = running;
    const clear = () => {
      if (inFlight === running)
        inFlight = undefined;
    };
    running.then(clear, clear);
    return running;
  };
  const runScheduled = async (version, current) => {
    if (!isActive(current) || version !== requestedVersion)
      return;
    while (inFlight && isActive(current))
      await waitForInspection(inFlight, current.signal);
    if (!isActive(current) || version !== requestedVersion || completedVersion >= version)
      return;
    await runInspection();
  };
  return {
    request() {
      if (!isActive(lifetime))
        return;
      const version = ++requestedVersion;
      const current = lifetime;
      clearTimer();
      timer = setTimeout(() => {
        timer = undefined;
        runScheduled(version, current);
      }, delayMs);
      timer.unref();
    },
    async flush() {
      const current = lifetime;
      if (!isActive(current))
        return;
      const targetVersion = ++requestedVersion;
      clearTimer();
      while (isActive(current) && completedVersion < targetVersion) {
        await waitForInspection(inFlight ?? runInspection(), current.signal);
      }
    },
    setEnabled(next) {
      if (disposed || enabled === next)
        return;
      enabled = next;
      requestedVersion += 1;
      clearTimer();
      if (enabled)
        lifetime = new AbortController;
      else
        lifetime.abort();
    },
    dispose() {
      if (disposed)
        return;
      disposed = true;
      requestedVersion += 1;
      clearTimer();
      lifetime.abort();
    }
  };
}
function hasGitMarker(cwd) {
  let current = nodePath3.resolve(cwd);
  while (true) {
    if (existsSync(nodePath3.join(current, ".git")))
      return true;
    const parent = nodePath3.dirname(current);
    if (parent === current)
      return false;
    current = parent;
  }
}
function discoveryOutput(output) {
  const separator = output.indexOf(`
`);
  if (separator < 0)
    return { inside: false };
  const inside = output.slice(0, separator).replace(/\r$/, "") === "true";
  let root = output.slice(separator + 1);
  if (root.endsWith(`
`))
    root = root.slice(0, -1);
  if (root.endsWith("\r"))
    root = root.slice(0, -1);
  return { inside, ...root ? { root } : {} };
}
function parseStatus(output) {
  const parsed = {
    valid: false,
    unborn: false,
    trackedFiles: 0,
    untrackedFiles: 0,
    conflicts: 0,
    submodulePaths: new Set
  };
  let sawBranchOid = false;
  let sawBranchHead = false;
  const records = output.split("\x00");
  for (let index = 0;index < records.length; index += 1) {
    const record2 = records[index] ?? "";
    if (record2.startsWith("# branch.oid ")) {
      sawBranchOid = true;
      parsed.unborn = record2 === "# branch.oid (initial)";
      continue;
    }
    if (record2.startsWith("# branch.head ")) {
      sawBranchHead = true;
      const branch = record2.slice("# branch.head ".length).trim();
      if (branch)
        parsed.branch = branch === "(detached)" ? "detached" : branch;
      continue;
    }
    if (record2.startsWith("? ")) {
      parsed.untrackedFiles += 1;
      continue;
    }
    const kind = record2[0];
    if (kind !== "1" && kind !== "2" && kind !== "u" || record2[1] !== " ")
      continue;
    parsed.trackedFiles += 1;
    if (kind === "u")
      parsed.conflicts += 1;
    const fields = record2.split(" ");
    const submodule = fields[2] ?? "";
    const pathIndex = kind === "u" ? 10 : kind === "2" ? 9 : 8;
    const path = fields.slice(pathIndex).join(" ");
    if (submodule.startsWith("S") && path)
      parsed.submodulePaths.add(path);
    if (kind === "2")
      index += 1;
  }
  parsed.valid = sawBranchOid && sawBranchHead;
  return parsed;
}
function parseNumstat(output, submodulePaths) {
  let linesAdded = 0;
  let linesRemoved = 0;
  let binaryFiles = 0;
  const records = output.split("\x00");
  for (let index = 0;index < records.length; index += 1) {
    const record2 = records[index] ?? "";
    if (!record2)
      continue;
    const firstTab = record2.indexOf("\t");
    const secondTab = firstTab < 0 ? -1 : record2.indexOf("\t", firstTab + 1);
    if (firstTab < 0 || secondTab < 0)
      continue;
    const added = record2.slice(0, firstTab);
    const removed = record2.slice(firstTab + 1, secondTab);
    let path = record2.slice(secondTab + 1);
    if (!path) {
      index += 2;
      path = records[index] ?? "";
    }
    if (submodulePaths.has(path))
      continue;
    if (added === "-" && removed === "-") {
      binaryFiles += 1;
      continue;
    }
    linesAdded += Number.parseInt(added, 10) || 0;
    linesRemoved += Number.parseInt(removed, 10) || 0;
  }
  return { linesAdded, linesRemoved, binaryFiles };
}
async function inspectWorkspace(options) {
  const discovery = await options.exec("git", ["rev-parse", "--is-inside-work-tree", "--show-toplevel"], {
    cwd: options.cwd,
    timeout: GIT_TIMEOUT_MS
  });
  if (discovery.code !== 0 || discovery.killed) {
    const explicitNotRepo = /not a git repository/i.test(`${discovery.stderr}
${discovery.stdout}`);
    return !discovery.killed && (explicitNotRepo || discovery.code === 128 && !hasGitMarker(options.cwd)) ? { kind: "not-repo" } : { kind: "unavailable" };
  }
  const discovered = discoveryOutput(discovery.stdout);
  const root = discovered.root;
  if (!discovered.inside || !root)
    return { kind: "unavailable" };
  const status = await options.exec("git", ["-C", root, "status", "--porcelain=v2", "-z", "--branch", "--untracked-files=all"], { timeout: GIT_TIMEOUT_MS });
  if (status.code !== 0 || status.killed || options.signal?.aborted)
    return { kind: "unavailable" };
  const parsedStatus = parseStatus(status.stdout);
  if (!parsedStatus.valid)
    return { kind: "unavailable" };
  let numstat = { linesAdded: 0, linesRemoved: 0, binaryFiles: 0 };
  if (parsedStatus.trackedFiles > 0) {
    const head = await options.exec("git", ["-C", root, "rev-parse", "--verify", "HEAD^{tree}"], {
      timeout: GIT_TIMEOUT_MS
    });
    if (head.killed)
      return { kind: "unavailable" };
    const baseline = head.code === 0 ? head.stdout.trim() : parsedStatus.unborn ? EMPTY_TREE_HASH : "";
    if (!baseline)
      return { kind: "unavailable" };
    const diff = await options.exec("git", ["-C", root, "diff", "--numstat", "-z", "--find-renames", baseline, "--"], { timeout: GIT_TIMEOUT_MS });
    if (diff.code !== 0 || diff.killed)
      return { kind: "unavailable" };
    numstat = parseNumstat(diff.stdout, parsedStatus.submodulePaths);
  }
  return {
    kind: "available",
    root,
    relativeCwd: toDisplayPath(nodePath3.relative(root, options.cwd)),
    ...parsedStatus.branch ? { branch: parsedStatus.branch } : {},
    snapshot: {
      trackedFiles: parsedStatus.trackedFiles,
      untrackedFiles: parsedStatus.untrackedFiles,
      conflicts: parsedStatus.conflicts,
      submodules: parsedStatus.submodulePaths.size,
      ...numstat
    }
  };
}
async function inspectWorkspacePulse(options) {
  try {
    return await inspectWorkspace({
      ...options,
      exec: (command, args, execOptions) => options.signal?.aborted ? Promise.resolve(SKIPPED_EXEC_RESULT) : options.exec(command, args, {
        ...execOptions,
        ...options.signal ? { signal: options.signal } : {}
      })
    });
  } catch {
    return { kind: "unavailable" };
  }
}

// src/state.ts
var SESSION_DISPLAY_OVERRIDE_KEYS = ["preset", "density", "segmentLayout"];
function createInertAtelierState(autoCompact, workspacePulse = { status: "unavailable" }) {
  return {
    activity: "ready",
    dirty: false,
    workspacePulse,
    metrics: aggregateMetrics([], { subscription: false, autoCompact }),
    extensionStatuses: []
  };
}
function withSessionLayer(layers, session) {
  const { session: _previous, ...lower } = layers;
  return Object.keys(session).length > 0 ? { ...lower, session } : lower;
}

class AtelierRuntime {
  #pi;
  #ctx;
  #autoCompact;
  #random;
  #requestRender;
  #workspacePulseRefresh;
  #config;
  #displayLayers;
  #displayProvenance;
  #disposed = false;
  #enabled;
  #lastWorkspaceData;
  #state;
  #subagentRefresh;
  #subagentRefreshTimer;
  #subagentDirty = false;
  #subagentEntries = [];
  #subagentAbort = new AbortController;
  #subagentUnsubscribe;
  constructor(dependencies) {
    this.#pi = dependencies.pi;
    this.#ctx = dependencies.ctx;
    this.#config = dependencies.config;
    this.#displayLayers = dependencies.displayLayers;
    this.#displayProvenance = dependencies.displayProvenance;
    this.#autoCompact = dependencies.autoCompact;
    this.#enabled = dependencies.enabled ?? true;
    this.#random = dependencies.random ?? Math.random;
    this.#requestRender = dependencies.requestRender;
    const inspectWorkspace2 = async (signal) => {
      if (!this.#isLiveAndTrusted())
        return { kind: "unavailable" };
      return dependencies.inspectWorkspace ? dependencies.inspectWorkspace(signal) : inspectWorkspacePulse({
        exec: async (command, args, options) => this.#isLiveAndTrusted() ? this.#pi.exec(command, args, options) : SKIPPED_EXEC_RESULT,
        cwd: this.#ctx.cwd,
        signal
      });
    };
    this.#workspacePulseRefresh = createWorkspacePulseRefresh({
      inspect: inspectWorkspace2,
      publish: (inspection) => this.#applyWorkspacePulseInspection(inspection)
    });
    this.#workspacePulseRefresh.setEnabled(this.#enabled);
    this.#state = createInertAtelierState(this.#autoCompact, this.#ctx.isProjectTrusted() ? { status: "inspecting" } : { status: "unavailable" });
    this.refreshUsage();
    const unsubscribe = ["subagent:async-complete", "subagent:async-started", "subagent:child-status"].map((channel) => this.#pi.events.on(channel, (data) => {
      if (!this.#isLiveAndTrusted())
        return;
      if (!isSubagentUsageEventForSession(data, this.#ctx.sessionManager.getEntries(), this.#subagentSessionIdentity()))
        return;
      if (data.sessionId === undefined)
        this.#scheduleSubagentRefresh();
      else
        this.observeSubagentMetadata(data);
    }));
    this.#subagentUnsubscribe = () => {
      for (const off of unsubscribe)
        off();
    };
  }
  observeSubagentMetadata(data) {
    if (!this.#isLiveAndTrusted())
      return;
    const refs = subagentMetadataReferences(data);
    if (!refs.runIds.length)
      return;
    const entries = this.#ctx.sessionManager.getEntries();
    const serialized = JSON.stringify(refs);
    if (!entries.some((entry) => entry.type === "custom" && entry.customType === SUBAGENT_METADATA_ENTRY && JSON.stringify(entry.data) === serialized)) {
      try {
        this.#pi.appendEntry(SUBAGENT_METADATA_ENTRY, refs);
      } catch {
        return;
      }
    }
    this.#scheduleSubagentRefresh();
  }
  #scheduleSubagentRefresh(delay = 100) {
    if (!this.#subagentRefreshTimer) {
      this.#subagentRefreshTimer = setTimeout(() => {
        this.#subagentRefreshTimer = undefined;
        this.refreshSubagentUsage();
      }, delay);
      this.#subagentRefreshTimer.unref();
    }
  }
  setEnabled(enabled) {
    if (this.#disposed || this.#enabled === enabled)
      return;
    this.#enabled = enabled;
    this.#workspacePulseRefresh.setEnabled(enabled);
    if (!enabled) {
      this.#subagentAbort.abort();
      clearTimeout(this.#subagentRefreshTimer);
      this.#subagentRefreshTimer = undefined;
      return;
    }
    this.#subagentAbort = new AbortController;
    this.#state = {
      ...this.#state,
      workspacePulse: !this.#ctx.isProjectTrusted() ? { status: "unavailable" } : this.#lastWorkspaceData ? { status: "stale", data: this.#lastWorkspaceData } : { status: "inspecting" }
    };
    this.refreshUsage();
    this.flushWorkspacePulseRefresh();
  }
  getState() {
    return this.#state;
  }
  getConfig() {
    return this.#config;
  }
  getDisplaySettings() {
    const { preset, density, segmentLayout } = this.#config;
    return { preset, density, segmentLayout };
  }
  getDisplayProvenance() {
    return this.#displayProvenance;
  }
  getSessionDisplayOverride() {
    const session = this.#displayLayers.session;
    if (!session)
      return;
    const keys = SESSION_DISPLAY_OVERRIDE_KEYS.filter((key) => (key in session));
    if (keys.length === 0)
      return;
    return structuredClone(Object.fromEntries(keys.map((key) => [key, session[key]])));
  }
  replaceSessionDisplayOverride(override) {
    const session = { ...this.#displayLayers.session };
    for (const key of SESSION_DISPLAY_OVERRIDE_KEYS)
      delete session[key];
    if (override)
      Object.assign(session, structuredClone(override));
    this.#displayLayers = withSessionLayer(this.#displayLayers, session);
    this.#resolveDisplay();
  }
  clearSessionDisplayOverride() {
    this.replaceSessionDisplayOverride(undefined);
  }
  applySavedUserDisplayPatch(patch) {
    this.#displayLayers = {
      ...this.#displayLayers,
      user: { ...this.#displayLayers.user, ...structuredClone(patch) }
    };
    if (patch.sidebarPanelLayout) {
      this.#config = { ...this.#config, sidebarPanelLayout: cloneLayout(patch.sidebarPanelLayout) };
    }
    const target = resolveDisplayLayers(this.#displayLayers).display;
    let session = { ...this.#displayLayers.session };
    for (const key of SESSION_DISPLAY_OVERRIDE_KEYS) {
      if (!(key in session))
        continue;
      const { [key]: _removed, ...candidate } = session;
      const resolved = resolveDisplayLayers(withSessionLayer(this.#displayLayers, candidate)).display;
      if (isDeepStrictEqual(resolved, target))
        session = candidate;
    }
    this.#displayLayers = withSessionLayer(this.#displayLayers, session);
    this.#resolveDisplay();
  }
  #resolveDisplay() {
    const resolved = resolveDisplayLayers(this.#displayLayers);
    this.#displayProvenance = resolved.provenance;
    this.#config = { ...this.#config, ...resolved.display };
    this.#invalidate();
  }
  setConfig(config) {
    this.#config = config;
    this.#invalidate();
  }
  setActivity(activity) {
    if (this.#state.activity === activity)
      return;
    this.#state = activity === "working" ? { ...this.#state, activity, workingLabel: selectWorkingPhrase(this.#random()) } : { ...this.#state, activity };
    this.#invalidate();
  }
  refreshUsage() {
    if (this.#disposed || !this.#enabled)
      return;
    const messages = [];
    const entries = this.#ctx.sessionManager.getEntries();
    for (const entry of entries) {
      if (entry.type === "message" && entry.message.role === "assistant") {
        messages.push(entry.message);
      }
    }
    const model = this.#ctx.model;
    const context = this.#ctx.getContextUsage();
    const subscription = model ? this.#ctx.modelRegistry.isUsingOAuth(model) : false;
    const { modelId: _modelId, provider: _provider, ...stateWithoutModel } = this.#state;
    this.#state = {
      ...stateWithoutModel,
      ...model ? { modelId: model.id, provider: model.provider } : {},
      thinkingLevel: this.#pi.getThinkingLevel(),
      metrics: aggregateMetrics(messages, {
        subscription,
        autoCompact: this.#autoCompact,
        ...context ? { context } : {}
      })
    };
    this.#invalidate();
    this.refreshSubagentUsage(entries);
  }
  #subagentSessionIdentity() {
    const sessionFile = this.#ctx.sessionManager.getSessionFile();
    const sessionId = this.#ctx.sessionManager.getSessionId();
    return { ...sessionFile ? { sessionFile } : {}, ...sessionId ? { sessionId } : {} };
  }
  async refreshSubagentUsage(entries) {
    if (!this.#isLiveAndTrusted())
      return;
    clearTimeout(this.#subagentRefreshTimer);
    this.#subagentRefreshTimer = undefined;
    this.#subagentEntries = entries ?? this.#ctx.sessionManager.getEntries();
    this.#subagentDirty = true;
    if (this.#subagentRefresh)
      return this.#subagentRefresh;
    this.#subagentRefresh = (async () => {
      while (this.#subagentDirty && this.#isLiveAndTrusted()) {
        this.#subagentDirty = false;
        const signal = this.#subagentAbort.signal;
        const session = this.#subagentSessionIdentity();
        try {
          const subagentUsage = await readSubagentUsage({
            entries: this.#subagentEntries,
            cwd: this.#ctx.cwd,
            ...session,
            signal
          });
          if (!signal.aborted && this.#isLiveAndTrusted())
            this.#replaceState({ ...this.#state, subagentUsage });
        } catch {
          if (!signal.aborted && this.#isLiveAndTrusted())
            this.#replaceState({
              ...this.#state,
              subagentUsage: { ...emptySubagentUsage(), unavailable: 1 }
            });
        }
      }
    })().finally(() => {
      this.#subagentRefresh = undefined;
      if (this.#isLiveAndTrusted() && this.#state.subagentUsage?.pending)
        this.#scheduleSubagentRefresh(1500);
    });
    return this.#subagentRefresh;
  }
  #isLiveAndTrusted() {
    return !this.#disposed && this.#enabled && this.#ctx.isProjectTrusted();
  }
  scheduleWorkspacePulseRefresh() {
    if (this.#isLiveAndTrusted())
      this.#workspacePulseRefresh.request();
  }
  async flushWorkspacePulseRefresh() {
    if (this.#isLiveAndTrusted())
      await this.#workspacePulseRefresh.flush();
  }
  #applyWorkspacePulseInspection(inspection) {
    if (this.#disposed || !this.#enabled)
      return;
    if (inspection.kind === "available") {
      const { kind: _kind, ...data } = inspection;
      this.#lastWorkspaceData = data;
      const { snapshot } = data;
      const dirty = snapshot.trackedFiles > 0;
      const pulseChanged = dirty || snapshot.untrackedFiles > 0;
      const status = snapshot.conflicts > 0 ? "conflict" : pulseChanged ? "changed" : "clean";
      const { branch: _branch, ...withoutBranch } = this.#state;
      this.#replaceState({
        ...withoutBranch,
        ...data.branch ? { branch: data.branch } : {},
        dirty,
        workspacePulse: { status, data }
      });
      return;
    }
    if (inspection.kind === "not-repo") {
      this.#lastWorkspaceData = undefined;
      const { branch: _branch, ...withoutBranch } = this.#state;
      this.#replaceState({
        ...withoutBranch,
        dirty: false,
        workspacePulse: { status: "not-repo" }
      });
      return;
    }
    this.#replaceState({
      ...this.#state,
      workspacePulse: this.#lastWorkspaceData ? { status: "stale", data: this.#lastWorkspaceData } : { status: "unavailable" }
    });
  }
  dispose() {
    this.#disposed = true;
    this.#subagentAbort.abort();
    clearTimeout(this.#subagentRefreshTimer);
    this.#subagentRefreshTimer = undefined;
    this.#subagentUnsubscribe?.();
    this.#workspacePulseRefresh.dispose();
    this.#lastWorkspaceData = undefined;
    this.#state = createInertAtelierState(this.#autoCompact);
  }
  #replaceState(next) {
    if (isDeepStrictEqual(this.#state, next))
      return;
    this.#state = next;
    this.#invalidate();
  }
  #invalidate() {
    if (!this.#disposed && this.#enabled)
      this.#requestRender();
  }
}

// src/subagent-cost-chart.ts
import { truncateToWidth as truncateToWidth7, visibleWidth as visibleWidth6 } from "@earendil-works/pi-tui";

// src/subagent-cost-image.ts
import { crc32, deflateSync } from "node:zlib";
import { allocateImageId, getCapabilities, getCellDimensions, Image } from "@earendil-works/pi-tui";
function interpolateCostCurve(points) {
  const slopes = points.slice(1).map((point, index) => {
    const before = points[index];
    return before && point.x > before.x ? (point.y - before.y) / (point.x - before.x) : 0;
  });
  const tangents = points.map((_, index) => {
    if (index === 0)
      return slopes[0] ?? 0;
    if (index === points.length - 1)
      return slopes.at(-1) ?? 0;
    const left = slopes[index - 1] ?? 0, right = slopes[index] ?? 0;
    return left * right > 0 ? 2 * left * right / (left + right) : 0;
  });
  const result = [];
  for (let index = 1;index < points.length; index++) {
    const before = points[index - 1], after = points[index];
    if (!before || !after)
      continue;
    const span = after.x - before.x;
    const steps = Math.max(1, Math.ceil(Math.max(span, Math.abs(after.y - before.y)) * 2));
    for (let step = 0;step <= steps; step++) {
      const t = step / steps, t2 = t * t, t3 = t2 * t;
      const y = (2 * t3 - 3 * t2 + 1) * before.y + (t3 - 2 * t2 + t) * span * (tangents[index - 1] ?? 0) + (-2 * t3 + 3 * t2) * after.y + (t3 - t2) * span * (tangents[index] ?? 0);
      result.push({
        x: before.x + t * span,
        y: Math.max(Math.min(before.y, after.y), Math.min(Math.max(before.y, after.y), y))
      });
    }
  }
  return result;
}
function chunk(name, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(name), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}
function drawCostPlot(curves, width, height, scale) {
  const pixels = Buffer.alloc(width * height * 4);
  const blend = (x, y, color, alpha) => {
    if (x < 0 || y < 0 || x >= width || y >= height || alpha <= 0)
      return;
    const offset = (y * width + x) * 4, oldAlpha = (pixels[offset + 3] ?? 0) / 255;
    const nextAlpha = alpha + oldAlpha * (1 - alpha);
    for (let channel = 0;channel < 3; channel++)
      pixels[offset + channel] = Math.round(((color[channel] ?? 0) * alpha + (pixels[offset + channel] ?? 0) * oldAlpha * (1 - alpha)) / nextAlpha);
    pixels[offset + 3] = Math.round(nextAlpha * 255);
  };
  let coverage;
  let touched = [];
  const line = (a, b, color, radius, opacity) => {
    const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    for (let y = Math.max(0, Math.floor(Math.min(a.y, b.y) - radius - 1));y < Math.min(height, Math.ceil(Math.max(a.y, b.y) + radius + 1)); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(a.x, b.x) - radius - 1));x < Math.min(width, Math.ceil(Math.max(a.x, b.x) + radius + 1)); x++) {
        const t = length ? Math.max(0, Math.min(1, ((x + 0.5 - a.x) * dx + (y + 0.5 - a.y) * dy) / length)) : 0;
        const distance = Math.hypot(x + 0.5 - a.x - t * dx, y + 0.5 - a.y - t * dy);
        const alpha = Math.min(1, Math.max(0, radius + 0.5 - distance)) * opacity;
        if (coverage) {
          const offset = y * width + x;
          if (alpha > 0 && !coverage[offset])
            touched.push(offset);
          coverage[offset] = Math.max(coverage[offset] ?? 0, alpha);
        } else
          blend(x, y, color, alpha);
      }
    }
  };
  const pad = 10 * scale, left = pad, right = width - pad, top = pad, bottom = height - pad;
  const axis = [126, 135, 145];
  line({ x: left, y: bottom }, { x: right, y: bottom }, axis, 0.55 * scale, 0.5);
  line({ x: left, y: bottom }, { x: left, y: top }, axis, 0.55 * scale, 0.5);
  const curveCoverage = new Float32Array(width * height);
  for (const item2 of [...curves].sort((a, b) => a.opacity - b.opacity)) {
    coverage = curveCoverage;
    touched = [];
    const observations = item2.points.map(({ u, v }) => ({
      x: left + u * (right - left),
      y: bottom - v * (bottom - top)
    }));
    const smooth = interpolateCostCurve(observations);
    for (let index = 1;index < smooth.length; index++) {
      const before = smooth[index - 1], after = smooth[index];
      if (before && after)
        line(before, after, item2.color, 1.05 * scale, item2.opacity);
    }
    const stride = Math.max(1, Math.ceil((observations.length - 1) / 7));
    for (let index = 1;index < observations.length; index++) {
      if (index % stride !== 0 && index !== observations.length - 1)
        continue;
      const point = observations[index];
      if (point)
        line(point, point, item2.color, 3 * scale, item2.opacity);
    }
    for (const offset of touched) {
      blend(offset % width, Math.floor(offset / width), item2.color, coverage[offset] ?? 0);
      coverage[offset] = 0;
    }
    coverage = undefined;
    const activePoint = item2.selectedPoint === undefined ? undefined : observations[item2.selectedPoint];
    if (activePoint) {
      line(activePoint, activePoint, [245, 245, 245], 4.5 * scale, 1);
      line(activePoint, activePoint, item2.color, 2.5 * scale, 1);
    }
  }
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0;y < height; y++)
    pixels.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines, { level: 3 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}
var cache = new WeakMap;
function renderCostImage(owner, curves, columns, rows) {
  if (getCapabilities().images !== "kitty")
    return;
  const cell = getCellDimensions();
  const scale = Math.min(2, 1400 / (columns * cell.widthPx), 800 / (rows * cell.heightPx));
  const width = Math.max(40, Math.round(columns * cell.widthPx * scale));
  const height = Math.max(40, Math.round(rows * cell.heightPx * scale));
  const signature = JSON.stringify([
    columns,
    rows,
    width,
    height,
    curves.map((item2) => [item2.id, item2.points, item2.color, item2.opacity, item2.selectedPoint])
  ]);
  const previous = cache.get(owner);
  if (previous?.signature === signature)
    return previous.lines;
  const imageId = previous?.imageId ?? allocateImageId();
  const png = drawCostPlot(curves, width, height, scale);
  const image = new Image(png.toString("base64"), "image/png", { fallbackColor: (text) => text }, { maxWidthCells: columns, maxHeightCells: rows, imageId }, { widthPx: width, heightPx: height });
  const lines = image.render(columns + 2);
  cache.set(owner, { imageId, signature, lines });
  return lines;
}

// src/subagent-cost-chart.ts
var COLORS = ["input", "chartPink", "cache", "chartGreen", "cost", "output"];
function additionalColor(index) {
  const hue = ((index - COLORS.length) * 137.508 + 52) % 360;
  const saturation = 0.72;
  const lightness = index % 2 ? 0.76 : 0.6;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(hue / 60 % 2 - 1));
  const channels = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  const byte = (channel) => Math.round((channel + lightness - chroma / 2) * 255);
  return [byte(channels[0]), byte(channels[1]), byte(channels[2])];
}
function seriesRgb(index) {
  const role = COLORS[index];
  return role ? PALETTE_RGB[role] : additionalColor(index);
}
var costLegendColumns = (width) => width >= 72 ? 3 : width >= 36 ? 2 : 1;
var UP = 1;
var RIGHT = 2;
var DOWN = 4;
var LEFT = 8;
var ROUNDED_GLYPHS = [" ", "│", "─", "╰", "│", "│", "╭", "├", "─", "╯", "─", "┴", "╮", "┤", "┬", "┼"];
var BIT_COUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
function glyph(mask, unicode) {
  if (unicode)
    return ROUNDED_GLYPHS[mask] ?? "─";
  if (mask === (LEFT | RIGHT) || mask === LEFT || mask === RIGHT)
    return "-";
  return mask === UP || mask === DOWN || mask === (UP | DOWN) ? "|" : "+";
}
function subagentCostChart(usage, width, decimals, unicode, palette, options = {}) {
  if (width < 24)
    return [];
  const all = usage.costHistory;
  const selected = all.map((series, index) => ({ series, index })).filter(({ series }) => series.points.length > 1);
  const incomplete = Boolean(usage.unavailable || usage.limited || usage.historyUnavailable);
  if (!selected.length) {
    if (incomplete)
      return [palette.paint("warning", "Cost history unavailable · partial")];
    return usage.pending || usage.runs.length ? [palette.paint("dim", usage.pending ? "Cost curves · awaiting usage" : "Cost history unavailable")] : [];
  }
  const maximum = Math.max(...selected.flatMap(({ series }) => series.points.map((point) => point.cost)));
  const duration = Math.max(...selected.map(({ series }) => (series.points.at(-1)?.at ?? series.startedAt) - series.startedAt), 1);
  const label = `$${maximum.toFixed(decimals)}`;
  const columns = Math.floor(width) - label.length - 2;
  if (columns < 10)
    return [];
  const height = clamp(options.height ?? (width >= 60 ? 10 : 5), 3, 24);
  const curves = selected.map(({ series, index }) => ({
    series,
    index,
    points: series.points.map((point) => ({
      u: (point.at - series.startedAt) / duration,
      v: maximum > 0 ? point.cost / maximum : 0
    }))
  }));
  const paintSeries = (index, text) => index < COLORS.length || !palette.colorEnabled ? palette.paint(COLORS[index % COLORS.length] ?? "output", text) : paintRgb(additionalColor(index), text);
  const isDimmed = (id) => options.focusedSeries !== undefined && options.focusedSeries !== id;
  const paintFocused = (index, id, text) => isDimmed(id) ? palette.paint("dim", text) : paintSeries(index, text);
  const axisLabel = (y) => (y === 0 ? label : y === height - 1 ? "$0" : "").padStart(label.length);
  const partial = selected.some(({ series }) => series.partial) || incomplete;
  const rows = [
    palette.paint("muted", `Cost per agent · ${selected.length} curves${partial ? " · partial" : ""}`)
  ];
  if (options.suspendPlot) {
    for (let y = 0;y < height; y++) {
      rows.push(y === Math.floor(height / 2) ? palette.paint("dim", truncateToWidth7("Close dialog to view graph", width, "…")) : "");
    }
    rows.push("");
  } else {
    const image = options.imageOwner ? renderCostImage(options.imageOwner, curves.map(({ series, index, points }) => ({
      id: series.id,
      points,
      selectedPoint: series.id === options.focusedSeries ? options.focusedPoint : undefined,
      color: seriesRgb(index),
      opacity: isDimmed(series.id) ? 0.18 : 0.95
    })), columns, height) : undefined;
    if (image) {
      for (let y = 0;y < height; y++)
        rows.push(palette.paint("dim", `${axisLabel(y)}  `) + (image[y] ?? ""));
    } else {
      rows.push(...textPlot(curves, columns, height, options).map((line, y) => {
        const painted = line.map((cell) => {
          if (!cell)
            return " ";
          if (cell.marker)
            return paintSeries(cell.index, unicode ? "●" : "o");
          const curve = curves[cell.owner];
          return curve ? paintFocused(curve.index, curve.series.id, glyph(cell.bits, unicode)) : " ";
        }).join("");
        return palette.paint("dim", `${axisLabel(y)} ${unicode ? "│" : "|"}`) + painted;
      }));
    }
    const end = `${(duration / 1000).toFixed(duration < 1e4 ? 1 : 0)}s`;
    rows.push(palette.paint("dim", `${" ".repeat(label.length + 2)}0s${" ".repeat(Math.max(1, columns - end.length - 2))}${end}`));
  }
  const legendColumns = costLegendColumns(width);
  const pageSize = legendColumns * Math.max(1, Math.floor(options.legendRows ?? 5));
  const page = clamp(Math.floor(options.legendPage ?? 0), 0, Math.ceil(selected.length / pageSize) - 1);
  const start = page * pageSize;
  const cellWidth = Math.floor((width - (legendColumns - 1) * 2) / legendColumns);
  const legend = selected.slice(start, start + pageSize).map(({ series, index }) => {
    const name = truncateToWidth7(sanitizeInline(`#${index + 1} ${series.agent}`), Math.max(1, cellWidth - 2), "…");
    const text = `${unicode ? "━" : "-"} ${name}`;
    return paintFocused(index, series.id, text) + " ".repeat(Math.max(0, cellWidth - visibleWidth6(text)));
  });
  for (let index = 0;index < legend.length; index += legendColumns)
    rows.push(legend.slice(index, index + legendColumns).join("  "));
  if (selected.length > pageSize)
    rows.push(palette.paint("dim", `Legend ${start + 1}–${Math.min(start + pageSize, selected.length)}/${selected.length}`));
  if (all.length > selected.length)
    rows.push(palette.paint("dim", `${all.length - selected.length} awaiting cost history`));
  return rows;
}
function textPlot(curves, columns, height, options) {
  const toCell = ({ u, v }) => ({
    x: u * (columns - 1),
    y: height - 1 - v * (height - 1)
  });
  const layers = curves.map(({ points }) => {
    const layer = Array.from({ length: height }, () => Array(columns).fill(0));
    const mark = (x, y, direction) => {
      const row = layer[y];
      if (row)
        row[x] = (row[x] ?? 0) | direction;
    };
    let previous;
    for (const point of interpolateCostCurve(points.map(toCell))) {
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      if (!previous) {
        previous = { x, y };
        continue;
      }
      while (previous.x < x) {
        mark(previous.x, previous.y, RIGHT);
        previous.x++;
        mark(previous.x, previous.y, LEFT);
      }
      while (previous.y !== y) {
        const upward = y < previous.y;
        mark(previous.x, previous.y, upward ? UP : DOWN);
        previous.y += upward ? -1 : 1;
        mark(previous.x, previous.y, upward ? DOWN : UP);
      }
    }
    return layer;
  });
  const focused = curves.find(({ series }) => series.id === options.focusedSeries);
  const focusedPoint = options.focusedPoint === undefined ? undefined : focused?.points[options.focusedPoint];
  const marker = focusedPoint && focused ? toCell(focusedPoint) : undefined;
  return Array.from({ length: height }, (_, y) => Array.from({ length: columns }, (_2, x) => {
    if (marker && focused && Math.round(marker.x) === x && Math.round(marker.y) === y)
      return { marker: true, index: focused.index };
    let cell;
    let weight = 0;
    for (const [owner, layer] of layers.entries()) {
      const bits = layer[y]?.[x] ?? 0;
      const count = BIT_COUNT[bits] ?? 0;
      const priority = count + (count && curves[owner]?.series.id === options.focusedSeries ? 10 : 0);
      if (count && priority >= weight) {
        cell = { marker: false, owner, bits };
        weight = priority;
      }
    }
    return cell;
  }));
}

// src/sidebar.ts
function workspacePulseData(pulse) {
  return "data" in pulse ? pulse.data : undefined;
}
function buildSidebarSnapshot(input) {
  const pulseData = workspacePulseData(input.state.workspacePulse);
  const projectName = basename2(pulseData?.root ?? input.cwd) || pulseData?.root || input.cwd;
  return {
    ...input.state,
    projectName,
    cwd: input.cwd,
    ...input.sessionName ? { sessionName: input.sessionName } : {},
    persisted: Boolean(input.sessionFile),
    branchEntryCount: input.branchEntryCount,
    activeToolCount: input.activeToolCount,
    availableToolCount: input.availableToolCount,
    activeToolNames: [...new Set((input.activeToolNames ?? []).map(sanitizeInline).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en")),
    runActivity: input.runActivity ?? EMPTY_RUN_ACTIVITY,
    todos: input.todos ?? [],
    sidebarPanels: input.sidebarPanels ?? [],
    ...input.prefill ? { prefill: input.prefill } : {}
  };
}
var COMPACT_SIDEBAR_MAX_WIDTH = 39;
var LABEL_COLUMN_WIDTH = 12;
var SIDEBAR_ANIMATION_INTERVAL_MS = 1000;
function valueRow(value, palette, role) {
  const text = value === undefined ? "" : sanitizeInline(value);
  return text ? palette.paint(role, text) : palette.paint("dim", PLACEHOLDER);
}
function renderDock(rows, width, height, palette, resizing) {
  const contentWidth = Math.max(0, width - 2);
  const edge = resizing ? `${palette.paint("warning", "│")} ` : "  ";
  return Array.from({ length: height }, (_, index) => truncateToWidth8(`${edge}${fitToWidth(rows[index] ?? "", contentWidth)}`, width, ""));
}
function panelRows(title, rows, width, palette, theme, role, jewel) {
  const safeWidth = Math.max(4, width);
  const innerWidth = safeWidth - 4;
  const crownPrefix = `╭─ ${jewel} `;
  const crownFill = "─".repeat(Math.max(0, safeWidth - visibleWidth7(crownPrefix) - visibleWidth7(title) - 2));
  const top = `${palette.paint(role, crownPrefix)}${theme.bold(palette.paint(role, title))} ${palette.paint(role, `${crownFill}╮`)}`;
  const edge = palette.paintTint(role, "│");
  const body = rows.map((row) => `${edge} ${fitToWidth(row, innerWidth)} ${edge}`);
  return [top, ...body, palette.paintTint(role, `╰${"─".repeat(safeWidth - 2)}╯`), ""];
}
function labeledRow(label, value, width, palette, role = "primary", labelRole = "muted", progress) {
  const left = truncateToWidth8(label, Math.min(LABEL_COLUMN_WIDTH, Math.max(0, width - 8)), "…");
  const right = truncateToWidth8(value, Math.max(0, width - visibleWidth7(left) - 1), "…");
  const meterWidth = width - visibleWidth7(left) - visibleWidth7(right) - 2;
  if (progress !== undefined && meterWidth >= 4) {
    return `${palette.paint(labelRole, left)} ${progressMeter(progress * 100, meterWidth, palette, role)} ${palette.paint(role, right)}`;
  }
  return truncateToWidth8(`${palette.paint(labelRole, left)}${" ".repeat(Math.max(1, width - visibleWidth7(left) - visibleWidth7(right)))}${palette.paint(role, right)}`, width, "");
}
function agentRows(snapshot, width, palette, theme) {
  const working = snapshot.activity === "working";
  const failed = snapshot.activity === "error";
  const label = working ? "Working" : failed ? "Error" : "Ready";
  const phrase = working && snapshot.workingLabel ? ` · ${sanitizeInline(snapshot.workingLabel)}` : "";
  const knownModel = Boolean(snapshot.modelId || snapshot.provider);
  return [
    theme.bold(palette.paint(snapshot.activity, `${working ? "◆" : failed ? "×" : "●"} ${label}${phrase}`)),
    theme.bold(valueRow(snapshot.modelId, palette, "primary")),
    valueRow(snapshot.provider, palette, "muted"),
    labeledRow("Thinking", snapshot.thinkingLevel ? sanitizeInline(snapshot.thinkingLevel) || PLACEHOLDER : PLACEHOLDER, width, palette, snapshot.thinkingLevel ? "primary" : "dim"),
    labeledRow("Billing", knownModel ? snapshot.metrics.subscription ? "Subscription" : "Metered" : PLACEHOLDER, width, palette, knownModel && snapshot.metrics.subscription ? "ready" : "muted")
  ];
}
var BRANCH_ICON = "";
var PULSE_STATUS_LABEL = {
  clean: "Clean",
  stale: "Stale",
  conflict: "Conflicts",
  changed: "Modified"
};
function workspacePulseRows(pulse, width, palette) {
  switch (pulse.status) {
    case "inspecting":
      return { core: [palette.paint("muted", "inspecting…")], details: [] };
    case "not-repo":
      return { core: [palette.paint("dim", "not a Git repository")], details: [] };
    case "unavailable":
      return { core: [palette.paint("warning", "Git unavailable")], details: [] };
  }
  const git = pulse.data.snapshot;
  const clean = pulse.status === "clean";
  const statusRole = pulse.status === "conflict" ? "error" : clean ? "muted" : "warning";
  const core = [labeledRow("Git", PULSE_STATUS_LABEL[pulse.status], width, palette, statusRole)];
  if (!clean) {
    const files = `${formatTokens(git.trackedFiles)} ${git.trackedFiles === 1 ? "file" : "files"}`;
    const added = `+${formatTokens(git.linesAdded)}`;
    const removed = `−${formatTokens(git.linesRemoved)}`;
    const lines = `${palette.paint("chartGreen", added)}  ${palette.paint("error", removed)}`;
    if (visibleWidth7(`Changed ${files}  ${added}  ${removed}`) <= width)
      core.push(labeledRow("Changed", `${files}  ${lines}`, width, palette));
    else
      core.push(labeledRow("Changed", files, width, palette), labeledRow("Lines", lines, width, palette));
  }
  if (git.conflicts > 0)
    core.push(labeledRow("Conflicts", formatTokens(git.conflicts), width, palette, "error"));
  const details = [
    ["Untracked", git.untrackedFiles],
    ["Binary", git.binaryFiles],
    ["Submodules", git.submodules]
  ].filter(([, count]) => count > 0).map(([label, count]) => labeledRow(label, formatTokens(count), width, palette));
  return { core, details };
}
function sidebarContextRole(percent, config) {
  const role = contextRole(percent, config, "dim");
  return role === "context" ? "cache" : role;
}
function contextRows(snapshot, config, width, palette, theme) {
  const { metrics } = snapshot;
  if (metrics.contextTokens === null || metrics.contextPercent === null) {
    return [palette.paint("dim", "Context unavailable")];
  }
  const role = sidebarContextRole(metrics.contextPercent, config);
  const percent = Math.max(0, metrics.contextPercent);
  const percentText = `${percent.toFixed(1)}%`;
  const percentWidth = Math.max(6, visibleWidth7(percentText));
  const meterWidth = Math.max(0, width - percentWidth - 2);
  const meter = progressMeter(percent, meterWidth, palette, role);
  const percentage = theme.bold(palette.paint(role, percentText.padStart(percentWidth)));
  const usage = `${formatTokens(metrics.contextTokens)} / ${metrics.contextWindow > 0 ? formatTokens(metrics.contextWindow) : PLACEHOLDER}`;
  return [
    meterWidth > 0 ? `${meter}  ${percentage}` : percentage,
    labeledRow("Tokens", usage, width, palette, "muted")
  ];
}
function progressMeter(percent, meterWidth, palette, role) {
  const units = Math.min(meterWidth * 8, Math.max(percent > 0 ? 1 : 0, Math.round(percent * meterWidth * 8 / 100)));
  const full = Math.floor(units / 8);
  const fraction = units % 8;
  const fill = "█".repeat(full) + (fraction ? "▏▎▍▌▋▊▉"[fraction - 1] : "");
  return `${palette.paint(role, fill)}${palette.paint("dim", "░".repeat(meterWidth - full - (fraction ? 1 : 0)))}`;
}
function prefillRows(snapshot, config, width, palette, theme) {
  const prefill = snapshot.prefill;
  if (!prefill)
    return [];
  const percentText = config.prefillViews.includes("percent") ? `${Math.round(prefill.percent * 100)}%` : "";
  const percentWidth = percentText ? visibleWidth7(percentText) : 0;
  const meterWidth = Math.max(0, width - percentWidth - (percentText ? 2 : 0));
  const meter = progressMeter(prefill.percent * 100, meterWidth, palette, "working");
  const percentage = theme.bold(palette.paint("working", percentText));
  return [
    percentText && meterWidth > 0 ? `${meter}  ${percentage}` : percentText || meter,
    ...formatPrefillRows(prefill, config.prefillViews).map((row) => labeledRow(row.label, row.value, width, palette, "primary", "muted"))
  ];
}
function formatUsageTokens(count) {
  if (count < 1000)
    return Math.trunc(count).toString();
  if (count < 1e6)
    return `${(count / 1000).toFixed(1)}k`;
  if (count < 1e9)
    return `${(count / 1e6).toFixed(1)}M`;
  return `${(count / 1e9).toFixed(1)}B`;
}
function usageRows(snapshot, config, width, palette) {
  const { metrics } = snapshot;
  const rows = [];
  if (metrics.usageAvailable) {
    const hit = metrics.cacheHitPercent === undefined ? undefined : `${metrics.cacheHitPercent.toFixed(1)}%`;
    rows.push(labeledRow("Input", formatUsageTokens(metrics.input), width, palette, "input"), labeledRow("Output", formatUsageTokens(metrics.output), width, palette, "output"), labeledRow("Cache read", formatUsageTokens(metrics.cacheRead), width, palette, "cache"), labeledRow("Cache hit", hit ?? PLACEHOLDER, width, palette, hit ? "primary" : "dim"));
  }
  if (metrics.costAvailable) {
    rows.push(labeledRow("Cost", `$${Math.max(0, metrics.cost).toFixed(config.currencyDecimals)}`, width, palette));
  }
  return rows;
}
function subagentRows(snapshot, config, width, palette, chartGraphics) {
  const usage = snapshot.subagentUsage;
  if (!usage || !usage.runs.length && !usage.unavailable && !usage.pending && !usage.limited)
    return [];
  return [
    ...subagentCostChart(usage, width, config.currencyDecimals, config.nerdFont, palette, chartGraphics),
    ...usage.pending ? [palette.paint("dim", "Running · curves update on reply")] : [],
    ...usage.unavailable || usage.limited ? [palette.paint("warning", "Partial · metadata unavailable")] : [],
    palette.paint("dim", "/atelier usage · expand graph")
  ];
}
function activeToolNameRows(snapshot, contentWidth, palette) {
  const names = snapshot.activeToolNames.map((name) => palette.paint("primary", name));
  let leftColumnWidth = 0;
  let rightColumnWidth = 0;
  for (const [index, name] of names.entries()) {
    if (index % 2 === 0)
      leftColumnWidth = Math.max(leftColumnWidth, visibleWidth7(name));
    else
      rightColumnWidth = Math.max(rightColumnWidth, visibleWidth7(name));
  }
  const columnGap = "  ";
  if (leftColumnWidth + visibleWidth7(columnGap) + rightColumnWidth > contentWidth)
    return names;
  const rows = [];
  for (let index = 0;index < names.length; index += 2) {
    const left = names[index] ?? "";
    const right = names[index + 1];
    rows.push(right === undefined ? left : `${fitToWidth(left, leftColumnWidth)}${columnGap}${right}`);
  }
  return rows;
}
var TODO_CHECK = {
  completed: { role: "ready", glyph: "✓" },
  in_progress: { role: "warning", glyph: "◐" },
  pending: { role: "dim", glyph: "○" }
};
function todosRows(snapshot, palette) {
  const todos = snapshot.todos;
  if (todos.length === 0)
    return [];
  const done = todos.filter((todo) => todo.status === "completed").length;
  const visible = snapshot.runActivity.phase === "running" ? todos.filter((todo) => todo.status === "in_progress") : todos;
  return [
    palette.paint("muted", `${done}/${todos.length}`),
    ...visible.map((todo) => {
      const check = TODO_CHECK[todo.status];
      const textRole = todo.status === "completed" ? "dim" : "primary";
      return `${palette.paint(check.role, check.glyph)} ${palette.paint("accent", `#${todo.id}`)} ${palette.paint(textRole, sanitizeInline(todo.text))}`;
    })
  ];
}
var ERROR_STATUS = /\b(error|failed?|failure|offline|unavailable)\b/i;
var WARNING_STATUS = /\b(warn(?:ing)?|blocked|degraded)\b/i;
function statusAlerts(snapshot) {
  return snapshot.extensionStatuses.map(sanitizeInline).flatMap((text) => {
    if (ERROR_STATUS.test(text))
      return [{ role: "error", text }];
    if (WARNING_STATUS.test(text))
      return [{ role: "warning", text }];
    return [];
  });
}
var TOOL_STATUS = {
  running: { role: "working", glyph: "◐" },
  done: { role: "ready", glyph: "✓" },
  failed: { role: "error", glyph: "✗" }
};
var MIN_TOOL_SUMMARY_COLUMNS = 6;
function toolNameWidth(tools, contentWidth) {
  const widest = Math.max(4, ...tools.map((tool) => visibleWidth7(tool.name || "tool")));
  return Math.min(widest, 10, Math.max(0, contentWidth));
}
function toolActivityRow(tool, contentWidth, nameWidth, palette, now, extraLive = 0) {
  const status = TOOL_STATUS[tool.status];
  const live = tool.status === "running";
  const elapsed = tool.durationMs ?? now - tool.startedAt;
  const duration = tool.status !== "done" || elapsed >= 1000 ? formatDuration(elapsed) : "";
  const trailing = live && extraLive > 0 ? `${duration} · +${extraLive}` : duration;
  const trailingWidth = trailing ? visibleWidth7(trailing) + 1 : 0;
  const available = Math.max(0, contentWidth - trailingWidth - 2);
  let fittedNameWidth = Math.min(nameWidth, Math.max(Math.min(4, available), available - MIN_TOOL_SUMMARY_COLUMNS - 1));
  let summaryWidth = available - fittedNameWidth - 1;
  if (summaryWidth < 3) {
    fittedNameWidth = Math.min(nameWidth, available);
    summaryWidth = 0;
  }
  const name = palette.paint("dim", sanitizeInline(truncateToWidth8(tool.name || "tool", fittedNameWidth, "…")));
  const summary = tool.summary ? palette.paint(tool.status === "done" ? "muted" : "primary", sanitizeInline(truncateToWidth8(tool.summary, summaryWidth, "…"))) : palette.paint("dim", PLACEHOLDER);
  const row = [
    palette.paint(status.role, status.glyph),
    fittedNameWidth > 0 ? fitToWidth(name, fittedNameWidth) : "",
    summaryWidth > 0 ? fitToWidth(summary, summaryWidth) : "",
    trailing ? palette.paint(tool.status === "done" ? "dim" : status.role, trailing) : ""
  ].filter(Boolean).join(" ");
  return truncateToWidth8(row, contentWidth, "");
}
function runPhaseRole(activity, failed = false) {
  if (activity.phase === "running")
    return "working";
  return failed || activity.failedCount > 0 ? "error" : "chartGreen";
}
function runSummaryRow(activity, width, palette, now) {
  const role = runPhaseRole(activity);
  const settled = activity.phase === "settled";
  const label = settled ? "Last run" : activity.turnNumber === undefined ? "Run" : `Turn ${activity.turnNumber}`;
  const duration = formatDuration(settled ? activity.durationMs ?? now - (activity.startedAt ?? now) : now - (activity.startedAt ?? now));
  return labeledRow(label, duration, width, palette, role, role);
}
function toolCountRow(activity, width, palette) {
  const { completedCount, failedCount } = activity;
  const value = failedCount > 0 ? `${completedCount} done · ${failedCount} failed` : `${completedCount} done`;
  return labeledRow("Tools", value, width, palette, failedCount > 0 ? "error" : "muted");
}
function responsePerformanceRows(activity, width, palette) {
  const { ttft, tps } = responsePerformanceValues(activity.performance);
  return [
    labeledRow("First token", ttft.text, width, palette, ttft.available ? "output" : "dim"),
    labeledRow(width < 25 ? "Speed" : "Output speed", tps.available ? `${tps.text} tok/s` : tps.text, width, palette, tps.available ? "output" : "dim")
  ];
}
var DROP_RANK = {
  toolName: 0,
  session: 4,
  location: 5,
  pulseDetails: 6,
  toolsStatus: 10,
  subagents: 18,
  usage: 20,
  contributed: 25,
  workspace: 30,
  olderRecentTool: 50,
  aggregate: 60,
  latestRecentTool: 70,
  activeTool: 75,
  alerts: 80,
  todos: 90,
  prefill: 100,
  required: Number.POSITIVE_INFINITY
};
function activityGroups(snapshot, contentWidth, palette, now, panel2) {
  const activity = snapshot.runActivity;
  const liveTurn = activity.phase === "running";
  const activeIds = new Set(activity.activeTools.map((tool) => tool.id));
  const sortedActive = activity.activeTools.map((tool, index) => ({ index, tool })).sort((left, right) => left.tool.startedAt - right.tool.startedAt || left.index - right.index).map(({ tool }) => tool);
  const visibleActive = liveTurn ? sortedActive.slice(-1) : sortedActive;
  const extraLive = sortedActive.length - visibleActive.length;
  const recent = liveTurn ? [] : activity.recentTools.filter((tool) => !activeIds.has(tool.id)).slice(0, 3);
  const nameWidth = toolNameWidth([...visibleActive, ...recent], contentWidth);
  const toolCount = activity.completedCount + activity.failedCount;
  const aggregate = liveTurn || toolCount === 0 ? [] : [toolCountRow(activity, contentWidth, palette)];
  const summarizes = toolCount > recent.length ? undefined : recent.map((tool) => `activityRecent:${tool.id}`);
  return [
    {
      name: "activityCore",
      panel: panel2,
      rows: [
        ...activity.phase === "idle" ? [] : [runSummaryRow(activity, contentWidth, palette, now)],
        ...responsePerformanceRows(activity, contentWidth, palette)
      ],
      dropRank: DROP_RANK.required
    },
    ...visibleActive.map((tool, index) => ({
      name: `activityActive:${tool.id}`,
      panel: panel2,
      rows: [toolActivityRow(tool, contentWidth, nameWidth, palette, now, extraLive)],
      dropRank: DROP_RANK.activeTool + (visibleActive.length - index) / 100
    })),
    ...recent.map((tool, index) => ({
      name: `activityRecent:${tool.id}`,
      panel: panel2,
      rows: [toolActivityRow(tool, contentWidth, nameWidth, palette, now)],
      dropRank: index === 0 ? DROP_RANK.latestRecentTool : DROP_RANK.olderRecentTool + (recent.length - index - 1)
    })),
    {
      name: "activityAggregate",
      panel: panel2,
      rows: aggregate,
      dropRank: DROP_RANK.aggregate,
      ...summarizes ? { summarizes } : {}
    }
  ];
}
function measureGroups(groups) {
  let height = 0;
  let previous;
  for (const group of groups) {
    height += group.rows.length;
    if (group.panel && group.panel.id !== previous?.panel?.id)
      height += 3;
    previous = group;
  }
  return height;
}
function withoutRedundantSummaries(groups) {
  const names = new Set(groups.map((group) => group.name));
  return groups.filter((group) => !group.summarizes || group.summarizes.some((name) => !names.has(name)));
}
function composeGroups(groups, height) {
  let candidate = groups.filter((group) => group.rows.length > 0);
  while (measureGroups(withoutRedundantSummaries(candidate)) > height) {
    let drop;
    for (const group of withoutRedundantSummaries(candidate)) {
      if (group.dropRank < (drop?.dropRank ?? DROP_RANK.required))
        drop = group;
    }
    if (drop) {
      const name = drop.name;
      candidate = candidate.filter((group) => group.name !== name);
      continue;
    }
    const compact = [
      { name: "agent", minimum: 2 },
      { name: "activityCore", minimum: 1 },
      { name: "context", minimum: 1 }
    ].find(({ name, minimum }) => candidate.some((group) => group.name === name && group.rows.length > minimum));
    if (!compact)
      break;
    candidate = candidate.map((group) => group.name === compact.name ? { ...group, rows: group.rows.slice(0, -1) } : group);
  }
  return withoutRedundantSummaries(candidate);
}
function renderGroups(groups, width, palette, theme) {
  const rendered = [];
  let index = 0;
  while (index < groups.length) {
    const group = groups[index];
    if (!group?.panel) {
      rendered.push(...group?.rows ?? []);
      index += 1;
      continue;
    }
    const panel2 = group.panel;
    const rows = [];
    while (groups[index]?.panel?.id === panel2.id) {
      rows.push(...groups[index]?.rows ?? []);
      index += 1;
    }
    rendered.push(...panelRows(panel2.title, rows, width, palette, theme, panel2.role, panel2.jewel ?? "✦"));
  }
  return rendered;
}
function renderSidebarLines(snapshot, config, theme, width, height, { colorEnabled = true, now = Date.now(), resizing = false, chartGraphics = {} } = {}) {
  const palette = createPalette(theme, colorEnabled);
  const safeWidth = Math.max(0, Math.trunc(width));
  const safeHeight = Math.max(0, Math.trunc(height));
  if (safeWidth <= 0 || safeHeight <= 0)
    return [];
  const contentWidth = safeWidth - 2;
  const panelWidth = Math.max(0, contentWidth - 4);
  const alerts = statusAlerts(snapshot);
  const builtinPanels = {
    agent: () => [
      {
        name: "agent",
        panel: {
          id: "agent",
          title: "AGENT",
          role: snapshot.activity,
          jewel: snapshot.activity === "working" && Math.floor(now / SIDEBAR_ANIMATION_INTERVAL_MS) % 2 === 1 ? "✧" : "✦"
        },
        rows: agentRows(snapshot, panelWidth, palette, theme),
        dropRank: DROP_RANK.required
      }
    ],
    activity: () => activityGroups(snapshot, panelWidth, palette, now, {
      id: "activity",
      title: "ACTIVITY",
      role: runPhaseRole(snapshot.runActivity, snapshot.activity === "error")
    }),
    alerts: () => [
      {
        name: "alerts",
        panel: {
          id: "alerts",
          title: "ALERTS",
          role: alerts.some((alert) => alert.role === "error") ? "error" : "warning"
        },
        rows: alerts.map(({ role, text }) => palette.paint(role, `${role === "error" ? "✕" : "▲"} ${text}`)),
        dropRank: DROP_RANK.alerts
      }
    ],
    todos: () => [
      {
        name: "todos",
        panel: { id: "todos", title: "TODOS", role: "accent" },
        rows: todosRows(snapshot, palette),
        dropRank: DROP_RANK.todos
      }
    ],
    context: () => [
      {
        name: "context",
        panel: {
          id: "context",
          title: "CONTEXT",
          role: sidebarContextRole(snapshot.metrics.contextPercent, config)
        },
        rows: contextRows(snapshot, config, panelWidth, palette, theme),
        dropRank: DROP_RANK.required
      }
    ],
    prefill: () => {
      const rows = prefillRows(snapshot, config, panelWidth, palette, theme);
      if (rows.length === 0)
        return [];
      return [
        {
          name: "prefill",
          panel: { id: "prefill", title: "PREFILL", role: "working" },
          rows,
          dropRank: DROP_RANK.prefill
        }
      ];
    },
    workspace: () => {
      const panel2 = { id: "workspace", title: "WORKSPACE", role: "accent" };
      const pulseData = workspacePulseData(snapshot.workspacePulse);
      const pulse = workspacePulseRows(snapshot.workspacePulse, panelWidth, palette);
      const location = pulseData ? pulseData.relativeCwd ? [palette.paint("muted", `./${sanitizeInline(pulseData.relativeCwd)}`)] : [] : [
        palette.paint("muted", sanitizeInline(snapshot.cwd) ? displayHomePath(sanitizeInline(snapshot.cwd)) : PLACEHOLDER)
      ];
      const sessionName = snapshot.sessionName ? sanitizeInline(snapshot.sessionName) || PLACEHOLDER : "";
      return [
        {
          name: "workspaceCore",
          panel: panel2,
          rows: [
            theme.bold(valueRow(snapshot.projectName, palette, "primary")),
            ...snapshot.branch ? [
              palette.paint("accent", `${config.nerdFont ? BRANCH_ICON : "⎇"} ${sanitizeInline(snapshot.branch) || PLACEHOLDER}`)
            ] : []
          ],
          dropRank: DROP_RANK.workspace
        },
        { name: "workspaceLocation", panel: panel2, rows: location, dropRank: DROP_RANK.location },
        { name: "workspaceCore", panel: panel2, rows: pulse.core, dropRank: DROP_RANK.workspace },
        { name: "workspaceDetails", panel: panel2, rows: pulse.details, dropRank: DROP_RANK.pulseDetails },
        {
          name: "workspaceSession",
          panel: panel2,
          rows: [
            ...sessionName ? [labeledRow("Session", sessionName, panelWidth, palette)] : [],
            labeledRow("History", `${snapshot.branchEntryCount} entries`, panelWidth, palette),
            labeledRow("Storage", snapshot.persisted ? "Saved" : "Temporary", panelWidth, palette, "muted")
          ],
          dropRank: DROP_RANK.session
        }
      ];
    },
    usage: () => [
      {
        name: "usage",
        panel: { id: "usage", title: "USAGE", role: "chartGold" },
        rows: usageRows(snapshot, config, panelWidth, palette),
        dropRank: DROP_RANK.usage
      }
    ],
    subagents: () => [
      {
        name: "subagentCostChart",
        panel: { id: "subagents", title: "SUBAGENTS", role: "output" },
        rows: subagentRows(snapshot, config, panelWidth, palette, chartGraphics),
        dropRank: DROP_RANK.subagents
      }
    ],
    tools: () => {
      const panel2 = { id: "tools", title: "TOOLS", role: "chartPink" };
      const showToolNames = config.showSidebarToolNames && safeWidth > COMPACT_SIDEBAR_MAX_WIDTH;
      const nameRows = showToolNames ? activeToolNameRows(snapshot, panelWidth, palette) : [];
      return [
        {
          name: "toolsStatus",
          panel: panel2,
          rows: [
            labeledRow("Enabled", `${snapshot.activeToolCount} / ${snapshot.availableToolCount}`, panelWidth, palette)
          ],
          dropRank: DROP_RANK.toolsStatus
        },
        ...nameRows.map((row, index) => ({
          name: `activeToolNames:${index}`,
          panel: panel2,
          rows: [row],
          dropRank: DROP_RANK.toolName + (nameRows.length - index) / 100
        }))
      ];
    }
  };
  const contributed = new Map(snapshot.sidebarPanels.map((panel2) => [panel2.id, panel2]));
  const ordered = resizing ? [
    {
      name: "resize",
      rows: [palette.paint("warning", "RESIZE · drag divider"), ""],
      dropRank: DROP_RANK.required
    }
  ] : [];
  let availableVisible = false;
  for (const entry of config.sidebarPanelLayout) {
    if (!entry.visible)
      continue;
    if (isBuiltinSidebarPanelId(entry.id)) {
      availableVisible = true;
      ordered.push(...builtinPanels[entry.id]());
      continue;
    }
    const panel2 = contributed.get(entry.id);
    if (!panel2)
      continue;
    availableVisible = true;
    const rows = panel2.keyValues?.length ? panel2.keyValues.map((row) => labeledRow(row.label, row.value, panelWidth, palette, row.valueRole ?? panel2.role ?? "primary", row.labelRole ?? "muted", row.progress)) : panel2.rows.filter((row) => row.text).map((row) => palette.paint(row.role ?? panel2.role ?? "primary", row.text));
    ordered.push({
      name: `contributed:${panel2.id}`,
      panel: { id: panel2.id, title: (panel2.title || panel2.id).toUpperCase(), role: panel2.role ?? "accent" },
      rows: rows.length > 0 ? rows : [palette.paint("dim", "No data")],
      dropRank: DROP_RANK.contributed
    });
  }
  if (!availableVisible) {
    ordered.push({
      name: "empty",
      panel: { id: "__empty__", title: "SIDEBAR", role: "muted" },
      rows: ["No available panels", "Open /atelier Settings"],
      dropRank: DROP_RANK.required
    });
  }
  return renderDock(renderGroups(composeGroups(ordered, safeHeight), contentWidth, palette, theme), safeWidth, safeHeight, palette, resizing);
}
function renderSidebarError(error, width, height, resizing) {
  let detail = "Unknown error";
  try {
    detail = sanitizeInline(errorMessage(error)) || detail;
  } catch {}
  const safeWidth = Math.max(0, Math.trunc(width));
  const safeHeight = Math.max(0, Math.trunc(height));
  if (safeWidth <= 0 || safeHeight <= 0)
    return [];
  const plain = {
    colorEnabled: false,
    tinted: false,
    paint: (_role, text) => text,
    paintTint: (_role, text) => text
  };
  return renderDock(["Sidebar unavailable", detail], safeWidth, safeHeight, plain, resizing);
}
function createSidebarComponent(options) {
  const imageOwner = {};
  return {
    render(width) {
      const height = options.getHeight();
      let resizing = false;
      try {
        resizing = options.isResizing?.() ?? false;
        return renderSidebarLines(options.getSnapshot(), options.getConfig(), options.theme, width, height, {
          colorEnabled: options.colorEnabled ?? true,
          resizing,
          chartGraphics: {
            imageOwner: options.canRenderImages ? imageOwner : undefined,
            suspendPlot: options.canRenderImages?.() === false
          }
        });
      } catch (error) {
        return renderSidebarError(error, width, height, resizing);
      }
    },
    invalidate() {}
  };
}
function createRetirableSidebarBinding(options) {
  let readSnapshot = options.getSnapshot;
  let readConfig = options.getConfig;
  let snapshot = buildSidebarSnapshot({
    state: createInertAtelierState(null),
    cwd: options.ctx.cwd,
    branchEntryCount: 0,
    activeToolCount: 0,
    availableToolCount: 0
  });
  let config = structuredClone(DEFAULT_CONFIG);
  return {
    getSnapshot: () => readSnapshot ? readSnapshot() : snapshot,
    getConfig: () => readConfig ? readConfig() : config,
    detach: () => {
      if (readSnapshot) {
        try {
          snapshot = structuredClone(readSnapshot());
        } catch {}
      }
      if (readConfig) {
        try {
          config = structuredClone(readConfig());
        } catch {}
      }
      readSnapshot = undefined;
      readConfig = undefined;
    }
  };
}
function createSidebarController(options) {
  const binding = createRetirableSidebarBinding(options);
  let enabled = false;
  let disposed = false;
  let generation = 0;
  let closeOverlay;
  let restoreStoppedCursor;
  let requestOverlayRender;
  let overlayHandle;
  let animationTimer;
  const reportError = (error) => {
    try {
      options.onError?.(error);
    } catch {}
  };
  const safely = (action) => {
    try {
      action();
      return true;
    } catch (error) {
      reportError(error);
      return false;
    }
  };
  const split = createSplitPaneController({
    ...options.initialWidth === undefined ? {} : { initialWidth: options.initialWidth },
    subscribeInput: (handler) => options.ctx.ui.onTerminalInput(handler),
    onVisibilityChange: () => syncAnimation(),
    onResizeChange: () => {
      safely(() => requestOverlayRender?.());
    },
    ...options.onResizeCommit ? { onResizeCommit: options.onResizeCommit } : {},
    ...options.onWarning ? { onWarning: options.onWarning } : {},
    ...options.onError ? { onError: options.onError } : {}
  });
  const stopAnimation = () => {
    if (!animationTimer)
      return;
    clearInterval(animationTimer);
    animationTimer = undefined;
  };
  const syncAnimation = () => {
    if (!enabled || split.getStatus().presentation !== "shown" || !options.shouldAnimate?.() || !requestOverlayRender) {
      stopAnimation();
      return;
    }
    if (animationTimer)
      return;
    animationTimer = setInterval(() => {
      safely(() => requestOverlayRender?.());
    }, SIDEBAR_ANIMATION_INTERVAL_MS);
    animationTimer.unref();
  };
  const clearOverlayCallbacks = () => {
    closeOverlay = undefined;
    restoreStoppedCursor = undefined;
    requestOverlayRender = undefined;
    overlayHandle = undefined;
  };
  const abandonShow = () => {
    enabled = false;
    stopAnimation();
    clearOverlayCallbacks();
    safely(split.hide);
  };
  const hide = () => {
    if (!enabled && !closeOverlay && !overlayHandle && !split.isEnabled())
      return;
    enabled = false;
    generation += 1;
    stopAnimation();
    safely(split.cancelResize);
    const close = closeOverlay;
    const handle = overlayHandle;
    const restoreCursor = restoreStoppedCursor;
    clearOverlayCallbacks();
    if (close)
      safely(close);
    else if (handle)
      safely(() => handle.hide());
    safely(split.hide);
    if (restoreCursor)
      safely(restoreCursor);
  };
  const show = () => {
    if (disposed || enabled)
      return;
    if (options.ctx.mode !== "tui") {
      reportError(new Error("Pi Atelier sidebar requires TUI mode"));
      return;
    }
    enabled = true;
    const currentGeneration = ++generation;
    if (!safely(split.show)) {
      abandonShow();
      return;
    }
    try {
      const pending = options.ctx.ui.custom((tui, theme, _keybindings, done) => {
        let closed = false;
        const close = () => {
          if (closed)
            return;
          closed = true;
          done(undefined);
        };
        if (!safely(() => split.attach(tui))) {
          generation += 1;
          abandonShow();
          safely(close);
        } else if (!enabled || generation !== currentGeneration) {
          close();
        } else {
          closeOverlay = close;
          restoreStoppedCursor = () => {
            if (tui.stopped)
              tui.terminal.showCursor();
          };
          requestOverlayRender = () => tui.requestRender();
          syncAnimation();
        }
        return createSidebarComponent({
          getSnapshot: binding.getSnapshot,
          getConfig: binding.getConfig,
          getHeight: () => tui.terminal.rows,
          isResizing: split.isResizing,
          canRenderImages: () => !hasCapturingOverlay(tui),
          theme,
          ...options.colorEnabled === undefined ? {} : { colorEnabled: options.colorEnabled }
        });
      }, {
        overlay: true,
        overlayOptions: () => split.overlayOptions(),
        onHandle: (handle) => {
          if (enabled && generation === currentGeneration) {
            overlayHandle = handle;
            syncAnimation();
          } else {
            safely(() => handle.hide());
          }
        }
      });
      pending.catch((error) => {
        reportError(error);
      }).finally(() => {
        if (generation === currentGeneration)
          abandonShow();
      });
    } catch (error) {
      if (generation === currentGeneration)
        abandonShow();
      reportError(error);
    }
  };
  return {
    show: () => show(),
    hide,
    setMode(mode) {
      safely(() => split.setMode(mode));
      syncAnimation();
    },
    getStatus: split.getStatus,
    toggle() {
      if (enabled)
        hide();
      else
        show();
    },
    isVisible() {
      return enabled && split.getStatus().presentation === "shown";
    },
    beginResize: split.beginResize,
    isResizing: split.isResizing,
    requestRender() {
      if (!safely(split.requestRender))
        safely(() => requestOverlayRender?.());
      syncAnimation();
    },
    dispose() {
      if (disposed)
        return;
      disposed = true;
      hide();
      binding.detach();
      safely(split.dispose);
    }
  };
}

// src/subagent-usage-view.ts
import { matchesKey as matchesKey3, truncateToWidth as truncateToWidth9, visibleWidth as visibleWidth8 } from "@earendil-works/pi-tui";
var POINT_COST_DECIMALS = 6;
async function openSubagentUsage(ctx, snapshot, decimals, lifetime) {
  await openLifecycleOverlay(ctx, (tui, theme, finish) => {
    let focused = -1;
    let pointIndex = -1;
    let legendPage = 0;
    let legendPageSize = 1;
    const imageOwner = {};
    const series = snapshot.costHistory.filter((run) => run.points.length > 1);
    return {
      render(width) {
        const outerWidth = Math.max(1, Math.floor(width));
        const height = Math.max(1, Math.floor(tui.terminal.rows * 0.8) - 2);
        if (outerWidth < 28 || height < 6)
          return [truncateToWidth9("Resize to view usage", outerWidth)];
        const contentWidth = outerWidth - 4;
        const border = (text) => theme.fg("borderAccent", text);
        const framed = (text) => `${border("│")} ${fitToWidth(truncateToWidth9(text, contentWidth, "…"), contentWidth)} ${border("│")}`;
        const pageSize = Math.max(1, height - 5);
        const legendColumns = costLegendColumns(contentWidth);
        const awaitingRows = snapshot.costHistory.length > series.length ? 1 : 0;
        const legendRows = Math.max(1, Math.min(5, Math.floor((pageSize - awaitingRows - 5) / 2)));
        legendPageSize = legendColumns * legendRows;
        const pageCount = Math.max(1, Math.ceil(series.length / legendPageSize));
        legendPage = focused >= 0 ? Math.floor(focused / legendPageSize) : Math.min(legendPage, pageCount - 1);
        const visibleLegendRows = Math.ceil(Math.min(series.length, legendPageSize) / legendColumns);
        const plotHeight = pageSize - visibleLegendRows - awaitingRows - (pageCount > 1 ? 1 : 0) - 4;
        const activeSeries = series[focused];
        const lastPoint = (activeSeries?.points.length ?? 0) - 1;
        const activePointIndex = activeSeries ? clamp(pointIndex < 0 ? lastPoint : pointIndex, 1, lastPoint) : undefined;
        const point = activePointIndex === undefined ? undefined : activeSeries?.points[activePointIndex];
        const chart = plotHeight < 3 ? [theme.fg("dim", "Enlarge terminal to view the graph")] : subagentCostChart(snapshot, contentWidth, decimals, true, createPalette(theme, isColorEnabled()), {
          height: plotHeight,
          focusedSeries: activeSeries?.id,
          focusedPoint: activePointIndex,
          imageOwner,
          legendRows,
          legendPage
        });
        const seriesNumber = activeSeries ? snapshot.costHistory.findIndex((run) => run.id === activeSeries.id) + 1 : 0;
        const readout = point && activeSeries && activePointIndex !== undefined ? [
          theme.fg("accent", `#${seriesNumber} · Point ${activePointIndex}/${activeSeries.points.length - 1} · ${((point.at - activeSeries.startedAt) / 1000).toFixed(1)}s`),
          theme.fg("text", `${contentWidth >= 40 ? "Total " : ""}$${point.cost.toFixed(POINT_COST_DECIMALS)} · +$${(point.cost - (activeSeries.points[activePointIndex - 1]?.cost ?? 0)).toFixed(POINT_COST_DECIMALS)}`)
        ] : ["", theme.fg("dim", "Elapsed seconds · select an agent to inspect points")];
        const lines = chart.length ? [...chart, ...readout] : [theme.fg("dim", "No subagent cost history yet.")];
        const title = truncateToWidth9(" SUBAGENT COST ", outerWidth - 4, "");
        const body = lines.slice(0, pageSize);
        while (body.length < pageSize)
          body.push("");
        return [
          border("╭─") + theme.fg("accent", theme.bold(title)) + border(`${"─".repeat(outerWidth - visibleWidth8(title) - 3)}╮`),
          framed(""),
          ...body.map(framed),
          framed(""),
          framed(theme.fg("dim", "←→ agent · [ ] point · ↑↓ legend · A all · Esc")),
          border(`╰${"─".repeat(outerWidth - 2)}╯`)
        ];
      },
      invalidate() {},
      handleInput(data) {
        if (matchesKey3(data, "escape") || matchesKey3(data, "enter")) {
          finish();
          return;
        }
        if (series.length && (matchesKey3(data, "left") || matchesKey3(data, "right"))) {
          pointIndex = -1;
          focused = focused < 0 ? matchesKey3(data, "left") ? series.length - 1 : 0 : (focused + (matchesKey3(data, "left") ? -1 : 1) + series.length) % series.length;
        }
        if (series.length && (data === "[" || data === "]")) {
          if (focused < 0) {
            focused = 0;
            pointIndex = -1;
          }
          const last = (series[focused]?.points.length ?? 2) - 1;
          pointIndex = clamp((pointIndex < 0 ? last : pointIndex) + (data === "[" ? -1 : 1), 1, last);
        }
        if (data === "a" || data === "A")
          focused = -1;
        if (matchesKey3(data, "up") || matchesKey3(data, "pageUp")) {
          focused = -1;
          legendPage = Math.max(0, legendPage - 1);
        }
        if (matchesKey3(data, "down") || matchesKey3(data, "pageDown")) {
          focused = -1;
          legendPage = Math.min(Math.max(0, Math.ceil(series.length / legendPageSize) - 1), legendPage + 1);
        }
        tui.requestRender();
      }
    };
  }, lifetime);
}

// src/todos.ts
var TODO_STATUSES = new Set(["pending", "in_progress", "completed"]);
var isTodoStatus = (value) => TODO_STATUSES.has(value);
var isClassicTodo = (item2) => isRecord(item2) && typeof item2.id === "number" && typeof item2.text === "string" && typeof item2.done === "boolean";
var isTodoTask = (item2) => isRecord(item2) && typeof item2.id === "number" && typeof item2.subject === "string" && typeof item2.status === "string";
function todosFromDetails(details) {
  if (!isRecord(details))
    return;
  const { todos, tasks } = details;
  if (Array.isArray(todos) && todos.every(isClassicTodo)) {
    return todos.map((item2) => ({
      id: item2.id,
      text: item2.text,
      status: item2.done ? "completed" : "pending"
    }));
  }
  if (Array.isArray(tasks) && tasks.every(isTodoTask)) {
    return tasks.flatMap((item2) => isTodoStatus(item2.status) ? [{ id: item2.id, text: item2.subject, status: item2.status }] : []);
  }
  return;
}
function reconstructTodos(ctx) {
  let todos = [];
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message")
      continue;
    const message = entry.message;
    if (message.role !== "toolResult" || message.toolName !== "todo" || message.isError)
      continue;
    todos = todosFromDetails(message.details) ?? todos;
  }
  return todos;
}

// extensions/index.ts
function registerProviderStreamHandler(pi, handler) {
  const capable = pi;
  const unsubscribe = capable.on("provider_stream_event", handler);
  return typeof unsubscribe === "function" ? unsubscribe : () => {
    return;
  };
}
var NOT_ACTIVE = "Pi Atelier is not active in this session";
var RESIZE_SHORTCUT = "ctrl+shift+r";
var keyIdentity = (key) => {
  const parts = key.toLowerCase().split("+");
  const last = parts.pop() ?? "";
  return [...parts.sort(), last].join("+");
};
var userConfigPath = () => join3(getAgentDir(), "pi-atelier.json");
function attempt(action) {
  try {
    action();
  } catch {}
}
function resetHostUi(ctx) {
  attempt(() => ctx?.ui.setFooter(undefined));
  attempt(() => ctx?.ui.setEditorComponent(undefined));
}
function atelierExtension(pi, dependencies = {}) {
  const loadAtelierConfig = dependencies.loadConfig ?? loadConfig;
  const saveConfigPatch = dependencies.saveConfigPatch ?? saveUserConfigPatch;
  const noopRender = () => {
    return;
  };
  let activeSession;
  let enabled = true;
  let prefillStreamOff;
  let customShortcutsRegistered = false;
  let lifecycleToken = { id: 0 };
  let initializingSessionManager;
  function startLifecycleGeneration(sessionManagerClaim) {
    lifecycleToken = { id: lifecycleToken.id + 1 };
    initializingSessionManager = sessionManagerClaim;
    return lifecycleToken;
  }
  const requestAllRenders = (targetSession) => {
    if (!enabled || activeSession !== targetSession)
      return;
    targetSession.requestFooterRender();
    targetSession.sidebar.requestRender();
  };
  const lifecycleGuardedSavePatch = (targetSession) => async (path, patch) => {
    if (activeSession !== targetSession)
      throw new Error(NOT_ACTIVE);
    await saveConfigPatch(path, patch);
    if (activeSession !== targetSession)
      throw new Error(NOT_ACTIVE);
  };
  function createOverlayLifetime(token, cancellations) {
    return {
      isActive: () => activeSession?.token === token,
      register(cancel) {
        if (activeSession?.token !== token) {
          attempt(cancel);
          return () => {
            return;
          };
        }
        cancellations.add(cancel);
        return () => cancellations.delete(cancel);
      }
    };
  }
  function updateExtensionStatuses(targetSession, next) {
    if (activeSession !== targetSession)
      return;
    const current = targetSession.extensionStatuses;
    if (next.length === current.length && next.every((status, index) => status === current[index]))
      return;
    targetSession.extensionStatuses = [...next];
    targetSession.sidebar.requestRender();
  }
  function getSidebarSnapshot(targetSession) {
    if (!enabled || activeSession !== targetSession) {
      return buildSidebarSnapshot({
        state: targetSession.retiredState,
        cwd: targetSession.retiredCwd,
        branchEntryCount: 0,
        activeToolCount: 0,
        availableToolCount: 0
      });
    }
    const { ctx, panelRegistry, prefill, runActivity, runtime } = targetSession;
    const sessionName = ctx.sessionManager.getSessionName();
    const sessionFile = ctx.sessionManager.getSessionFile();
    const activeTools = pi.getActiveTools();
    const prefillProgress = prefill.getSnapshot();
    return buildSidebarSnapshot({
      state: { ...runtime.getState(), extensionStatuses: targetSession.extensionStatuses },
      cwd: ctx.cwd,
      ...sessionName ? { sessionName } : {},
      ...sessionFile ? { sessionFile } : {},
      branchEntryCount: ctx.sessionManager.getBranch().length,
      activeToolCount: activeTools.length,
      availableToolCount: pi.getAllTools().length,
      activeToolNames: activeTools,
      runActivity: runActivity.getSnapshot(),
      todos: targetSession.todos,
      sidebarPanels: panelRegistry.getAvailable(),
      ...prefillProgress ? { prefill: prefillProgress } : {}
    });
  }
  function contextUsesSessionManager(ctx, sessionManager) {
    if (!ctx)
      return false;
    try {
      return ctx.sessionManager === sessionManager;
    } catch {
      return false;
    }
  }
  function getActiveSession(ctx) {
    const current = activeSession;
    return current && contextUsesSessionManager(ctx, current.sessionManager) ? current : undefined;
  }
  function requireActiveSession(ctx) {
    const current = getActiveSession(ctx);
    if (!current)
      ctx.ui.notify(NOT_ACTIVE, "warning");
    return current;
  }
  function clearFooter(session, restoreHostUi) {
    session.footerGeneration += 1;
    const footerDisposer = session.footerDisposer;
    session.footerDisposer = undefined;
    const installed = session.footerInstalled;
    session.footerInstalled = false;
    if (restoreHostUi && installed)
      resetHostUi(session.ctx);
    if (footerDisposer)
      attempt(footerDisposer);
  }
  function disposeSession(session, options = {}) {
    session.todos = [];
    session.extensionStatuses = [];
    session.askUserBlocked = false;
    session.inputRequestSequence = 0;
    session.requestFooterRender = noopRender;
    clearFooter(session, options.clearFooter === true);
    for (const cancel of Array.from(session.overlayCancellations))
      attempt(cancel);
    session.overlayCancellations.clear();
    attempt(() => session.sidebar.dispose());
    attempt(() => session.panelRegistry.dispose());
    attempt(() => session.runtime.dispose());
    attempt(() => session.runActivity.reset());
    attempt(() => session.completionNotifier.reset());
    const unsubscribe = session.unsubscribeAskUserBlocked;
    session.unsubscribeAskUserBlocked = undefined;
    if (unsubscribe)
      attempt(unsubscribe);
  }
  function teardownActiveSession(ctx) {
    const retiredSession = activeSession;
    activeSession = undefined;
    if (retiredSession)
      disposeSession(retiredSession, { clearFooter: true });
    else
      resetHostUi(ctx);
  }
  async function setSidebarToolNames(ctx, visible, targetSession) {
    const { runtime } = targetSession;
    const next = visible ?? !runtime.getConfig().showSidebarToolNames;
    if (runtime.getConfig().showSidebarToolNames !== next) {
      runtime.setConfig({ ...runtime.getConfig(), showSidebarToolNames: next });
    }
    try {
      await lifecycleGuardedSavePatch(targetSession)(userConfigPath(), { showSidebarToolNames: next });
      if (activeSession !== targetSession)
        return;
      ctx.ui.notify(`Sidebar tool list ${next ? "expanded" : "collapsed"}`, "info");
    } catch (error) {
      if (activeSession !== targetSession)
        return;
      ctx.ui.notify(`Sidebar tool list changed for this session but could not be saved: ${errorMessage(error)}`, "warning");
    }
  }
  async function saveSidebarWidth(ctx, width, targetSession) {
    targetSession.runtime.setConfig({ ...targetSession.runtime.getConfig(), sidebarWidth: width });
    try {
      await lifecycleGuardedSavePatch(targetSession)(userConfigPath(), { sidebarWidth: width });
      if (activeSession !== targetSession)
        return;
      ctx.ui.notify(`Sidebar width saved: ${width} columns`, "info");
    } catch (error) {
      if (activeSession !== targetSession)
        return;
      ctx.ui.notify(`Sidebar width could not be saved: ${errorMessage(error)}`, "warning");
    }
  }
  function completionNotification(session) {
    const sessionName = session.ctx.sessionManager.getSessionName();
    const { completedCount, failedCount } = session.runActivity.getSnapshot();
    return {
      projectName: basename3(session.ctx.cwd),
      ...sessionName ? { sessionName } : {},
      completedToolCount: completedCount,
      failedToolCount: failedCount
    };
  }
  function getSidebarPanelSettings(targetSession) {
    const configured = targetSession.runtime.getConfig().sidebarPanelLayout;
    const available = new Map(targetSession.panelRegistry.getAvailable().map((panel2) => [panel2.id, panel2]));
    const configuredIds = new Set(configured.map((entry) => entry.id));
    return [
      ...configured.map((entry) => {
        const contributed = available.get(entry.id);
        return {
          id: entry.id,
          title: contributed?.title ?? entry.id,
          available: isBuiltinSidebarPanelId(entry.id) || contributed !== undefined,
          visible: entry.visible
        };
      }),
      ...[...available.values()].filter((panel2) => !configuredIds.has(panel2.id)).map((panel2) => ({ id: panel2.id, title: panel2.title, available: true, visible: false }))
    ];
  }
  function syncFooter(targetSession) {
    if (!enabled || activeSession !== targetSession)
      return;
    const wanted = targetSession.runtime.getConfig().showFooter;
    if (wanted === targetSession.footerInstalled)
      return;
    if (wanted)
      installFooter(targetSession);
    else
      clearFooter(targetSession, true);
  }
  async function openUsage(ctx, expected) {
    const current = getActiveSession(ctx);
    if (ctx.mode !== "tui" || !current || !enabled || expected && current !== expected) {
      ctx.ui.notify("Enable Pi Atelier in a TUI session to view usage", "info");
      return;
    }
    if (!ctx.isProjectTrusted()) {
      ctx.ui.notify("Subagent metadata requires a trusted project", "info");
      return;
    }
    await current.runtime.refreshSubagentUsage();
    if (activeSession !== current || !enabled || !ctx.isProjectTrusted())
      return;
    await openSubagentUsage(ctx, current.runtime.getState().subagentUsage ?? emptySubagentUsage(), current.runtime.getConfig().currencyDecimals, current.overlayLifetime);
  }
  async function openMenu(ctx) {
    const current = requireActiveSession(ctx);
    if (!current)
      return;
    const { runtime, sidebar } = current;
    const isCurrent = () => activeSession === current;
    await openAtelierControlCenter(pi, ctx, runtime, userConfigPath(), {
      getStatus: () => sidebar.getStatus(),
      setMode: (mode) => {
        if (enabled && isCurrent())
          sidebar.setMode(mode);
      },
      toggle: () => {
        if (enabled && isCurrent())
          sidebar.toggle();
      },
      isToolListExpanded: () => isCurrent() && runtime.getConfig().showSidebarToolNames,
      toggleToolList: async () => {
        if (isCurrent())
          await setSidebarToolNames(ctx, undefined, current);
      },
      getSidebarPanelSettings: () => isCurrent() ? getSidebarPanelSettings(current) : []
    }, () => requestAllRenders(current), lifecycleGuardedSavePatch(current), {
      lifetime: current.overlayLifetime,
      openUsage: () => openUsage(ctx, current),
      syncFooter: () => syncFooter(current)
    });
  }
  async function openDisplay(ctx) {
    if (ctx.mode !== "tui") {
      ctx.ui.notify("Pi Atelier Display settings require TUI mode", "warning");
      return;
    }
    const current = requireActiveSession(ctx);
    if (!current)
      return;
    await openDisplaySettingsWorkspace(ctx, current.runtime, () => getSidebarPanelSettings(current), userConfigPath(), () => requestAllRenders(current), lifecycleGuardedSavePatch(current), { lifetime: current.overlayLifetime });
  }
  function installFooter(targetSession) {
    const { ctx, token, retiredState, retiredConfig } = targetSession;
    const generation = ++targetSession.footerGeneration;
    targetSession.footerInstalled = true;
    let editor;
    let footer;
    let headerRendered = false;
    let editorInstalled = false;
    const detachEditor = () => {
      if (editor)
        editor.renderStatusLine = undefined;
      editor = undefined;
      editorInstalled = false;
    };
    const getCurrentSession = () => {
      const current = activeSession;
      return enabled && current?.token === token && current.footerGeneration === generation ? current : undefined;
    };
    ctx.ui.setFooter((tui, theme, footerData) => {
      const footerRequestRender = () => {
        if (getCurrentSession())
          tui.requestRender();
      };
      const current = getCurrentSession();
      if (current)
        current.requestFooterRender = footerRequestRender;
      const component = createFooterComponent({
        getState: () => {
          const currentSession = getCurrentSession();
          if (!currentSession)
            return retiredState;
          const branch = footerData.getGitBranch();
          updateExtensionStatuses(currentSession, Array.from(footerData.getExtensionStatuses().values()));
          const performance = currentSession.runActivity.getSnapshot().performance;
          return {
            ...currentSession.runtime.getState(),
            workspaceLabel: basename3(currentSession.ctx.cwd),
            ...branch ? { branch } : {},
            ...performance ? { performance } : {},
            extensionStatuses: currentSession.extensionStatuses
          };
        },
        getConfig: () => getCurrentSession()?.runtime.getConfig() ?? retiredConfig,
        colorEnabled: isColorEnabled(),
        requestRender: footerRequestRender,
        onBranchChange: (callback) => footerData.onBranchChange(() => {
          const currentSession = getCurrentSession();
          if (!currentSession)
            return;
          currentSession.runtime.flushWorkspacePulseRefresh();
          callback();
        }),
        theme
      });
      footer = component;
      const imageCompositor = createImageCompositorBinding(tui);
      const mounted = {
        ...component,
        render(width) {
          imageCompositor.sync();
          const promptVisible = editorInstalled && headerRendered && editor?.statusLineVisible;
          headerRendered = false;
          return promptVisible ? component.renderTelemetry(width) : component.render(width);
        },
        dispose() {
          try {
            detachEditor();
            component.dispose();
          } finally {
            imageCompositor.dispose();
          }
        }
      };
      const session = getCurrentSession();
      if (session)
        session.footerDisposer = mounted.dispose;
      else
        mounted.dispose();
      return mounted;
    });
    try {
      ctx.ui.setEditorComponent((tui, theme, keybindings) => {
        const next = new AtelierEditor(tui, theme, keybindings);
        next.renderStatusLine = (width) => {
          const line = getCurrentSession() && tui.terminal.rows >= 12 ? footer?.renderHeader(width) ?? "" : "";
          headerRendered = Boolean(line);
          return line;
        };
        editor = next;
        return next;
      });
      editorInstalled = true;
    } catch {
      detachEditor();
      attempt(() => ctx.ui.setEditorComponent(undefined));
    }
  }
  const usage = (ctx, syntax) => ctx.ui.notify(`Usage: /atelier ${syntax}`, "warning");
  const isOnOff = (value) => value === undefined || value === "on" || value === "off";
  const commands = new Map(Object.entries({
    usage: async (ctx, args) => {
      if (args.length > 0)
        usage(ctx, "usage");
      else
        await openUsage(ctx);
    },
    display: async (ctx, args) => {
      if (args.length > 0)
        usage(ctx, "display");
      else
        await openDisplay(ctx);
    },
    sidebar: async (ctx, [sidebarAction, ...extra]) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("Pi Atelier sidebar requires TUI mode", "warning");
        return;
      }
      const current = requireActiveSession(ctx);
      if (!current)
        return;
      if (!enabled && sidebarAction !== "off") {
        ctx.ui.notify("Enable Pi Atelier with /atelier enable before showing its sidebar", "info");
        return;
      }
      if (sidebarAction === "tools") {
        const [toolAction, ...toolExtra] = extra;
        if (toolExtra.length > 0 || !isOnOff(toolAction))
          usage(ctx, "sidebar tools [on|off]");
        else
          await setSidebarToolNames(ctx, toolAction === undefined ? undefined : toolAction === "on", current);
        return;
      }
      if (extra.length > 0 || !isOnOff(sidebarAction) && sidebarAction !== "auto" && sidebarAction !== "manual") {
        usage(ctx, "sidebar [auto|manual|on|off]");
        return;
      }
      if (sidebarAction === "auto" || sidebarAction === "manual")
        current.sidebar.setMode(sidebarAction);
      else if (sidebarAction === "on")
        current.sidebar.show();
      else if (sidebarAction === "off")
        current.sidebar.hide();
      else
        current.sidebar.toggle();
      ctx.ui.notify(`Sidebar: ${sidebarStatusLabel(current.sidebar.getStatus())}`, "info");
    },
    disable: (ctx) => {
      const current = requireActiveSession(ctx);
      if (!current)
        return;
      enabled = false;
      current.runtime.setEnabled(false);
      current.runActivity.resetResponse();
      current.completionNotifier.reset();
      current.todos = [];
      current.sidebar.hide();
      updateExtensionStatuses(current, []);
      clearFooter(current, true);
      ctx.ui.notify("Pi Atelier disabled", "info");
    },
    enable: (ctx) => {
      const current = requireActiveSession(ctx);
      if (!current)
        return;
      if (!enabled) {
        enabled = true;
        current.todos = reconstructTodos(current.ctx);
        current.runtime.setEnabled(true);
        syncFooter(current);
      }
      ctx.ui.notify("Pi Atelier enabled", "info");
    }
  }));
  pi.registerCommand("atelier", {
    description: "Open or control the Pi Atelier status menu",
    handler: async (args, ctx) => {
      const [action, ...rest] = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const command = action === undefined ? undefined : commands.get(action);
      if (command)
        await command(ctx, rest);
      else
        await openMenu(ctx);
    }
  });
  pi.registerShortcut(DEFAULT_CONFIG.shortcut, {
    description: "Open Pi Atelier",
    handler: async (shortcutContext) => openMenu(shortcutContext)
  });
  pi.registerShortcut(RESIZE_SHORTCUT, {
    description: "Resize Pi Atelier sidebar",
    handler: (shortcutContext) => {
      const current = getActiveSession(shortcutContext);
      if (!current?.sidebar.getStatus().enabled) {
        shortcutContext.ui.notify("Show the Pi Atelier sidebar before resizing it", "warning");
        return;
      }
      current.sidebar.beginResize();
    }
  });
  function registerCustomShortcuts(ctx, config) {
    if (customShortcutsRegistered)
      return;
    customShortcutsRegistered = true;
    const { shortcut, toggleShortcut } = config;
    if (shortcut.toLowerCase() !== DEFAULT_CONFIG.shortcut) {
      try {
        pi.registerShortcut(shortcut, {
          description: "Open Pi Atelier",
          handler: async (shortcutContext) => openMenu(shortcutContext)
        });
      } catch {
        ctx.ui.notify(`Cannot register Atelier shortcut "${shortcut}"; ${DEFAULT_CONFIG.shortcut} remains available`, "warning");
      }
    }
    if (!toggleShortcut)
      return;
    const reservedKeys = [DEFAULT_CONFIG.shortcut, shortcut, RESIZE_SHORTCUT].map(keyIdentity);
    if (reservedKeys.includes(keyIdentity(toggleShortcut))) {
      ctx.ui.notify(`toggleShortcut "${toggleShortcut}" is already an Atelier shortcut`, "warning");
      return;
    }
    try {
      pi.registerShortcut(toggleShortcut, {
        description: "Toggle Pi Atelier sidebar",
        handler: async (shortcutContext) => commands.get("sidebar")?.(shortcutContext, [])
      });
    } catch {
      ctx.ui.notify(`Cannot register Atelier toggleShortcut "${toggleShortcut}"`, "warning");
    }
  }
  function createSession(ctx, token, config, loaded, cleanup) {
    const isPublished = () => activeSession?.token === token;
    const requestRenders = () => {
      const current = activeSession;
      if (current?.token === token)
        requestAllRenders(current);
    };
    const runActivity = createRunActivityTracker({ cwd: ctx.cwd, onChange: requestRenders });
    cleanup.push(() => runActivity.reset());
    const prefill = createPrefillTracker({ providers: config.prefillProviders });
    const prefillThrottle = createPrefillThrottle({
      requestRender: () => {
        const current = activeSession;
        if (current?.token === token)
          current.sidebar.requestRender();
      },
      schedule: (delayMs, run) => {
        const timer = setTimeout(run, delayMs);
        return () => clearTimeout(timer);
      }
    });
    cleanup.push(() => prefillThrottle.cancel());
    cleanup.push(() => stopListeningForPrefillChunks());
    let autoCompact = null;
    try {
      autoCompact = SettingsManager.create(ctx.isProjectTrusted() ? ctx.cwd : getAgentDir()).getCompactionSettings().enabled;
    } catch {
      ctx.ui.notify("Could not read Pi compaction settings; compaction mode is unavailable", "warning");
    }
    const runtime = new AtelierRuntime({
      pi,
      ctx,
      config,
      displayLayers: loaded.displayLayers,
      displayProvenance: loaded.displayProvenance,
      autoCompact,
      enabled,
      requestRender: requestRenders
    });
    cleanup.push(() => runtime.dispose());
    const panelRegistry = createSidebarPanelRegistry({
      events: pi.events,
      instanceId: `atelier-${token.id}`,
      onChange: requestRenders
    });
    cleanup.push(() => panelRegistry.dispose());
    const completionNotifier = createCompletionNotifier({
      isEnabled: () => enabled && isPublished() && runtime.getConfig().completionNotifications,
      ...dependencies.notificationPlatform === undefined ? {} : { platform: dependencies.notificationPlatform },
      ...dependencies.spawnNotificationProcess === undefined ? {} : { spawn: dependencies.spawnNotificationProcess }
    });
    cleanup.push(() => completionNotifier.reset());
    const sidebar = createSidebarController({
      ctx,
      getSnapshot: () => {
        const current = activeSession;
        if (!current || current.token !== token)
          throw new Error("Pi Atelier session is not published");
        return getSidebarSnapshot(current);
      },
      getConfig: () => isPublished() ? runtime.getConfig() : config,
      colorEnabled: isColorEnabled(),
      shouldAnimate: () => enabled && isPublished() && runActivity.isRunning(),
      initialWidth: config.sidebarWidth,
      onResizeCommit: (width) => {
        const current = activeSession;
        if (current?.token === token)
          saveSidebarWidth(ctx, width, current);
      },
      onWarning: (message) => ctx.ui.notify(message, "warning"),
      onError: (error) => ctx.ui.notify(`Pi Atelier sidebar failed: ${errorMessage(error)}`, "error")
    });
    cleanup.push(() => sidebar.dispose());
    const overlayCancellations = new Set;
    return {
      ctx,
      sessionManager: ctx.sessionManager,
      token,
      runtime,
      sidebar,
      panelRegistry,
      runActivity,
      prefill,
      prefillThrottle,
      completionNotifier,
      retiredState: createInertAtelierState(autoCompact),
      retiredConfig: structuredClone(config),
      retiredCwd: ctx.cwd,
      overlayCancellations,
      overlayLifetime: createOverlayLifetime(token, overlayCancellations),
      footerDisposer: undefined,
      footerGeneration: 0,
      footerInstalled: false,
      unsubscribeAskUserBlocked: undefined,
      askUserBlocked: false,
      inputRequestSequence: 0,
      todos: enabled ? reconstructTodos(ctx) : [],
      providerFailed: false,
      requestFooterRender: noopRender,
      extensionStatuses: []
    };
  }
  function subscribeAskUserBlocked(session) {
    return pi.events.on("rpiv:ask-user:blocked", (data) => {
      const current = activeSession;
      if (current?.token !== session.token || !isRecord(data) || !("active" in data))
        return;
      if (data.active === false) {
        current.askUserBlocked = false;
        return;
      }
      if (data.active !== true || current.askUserBlocked)
        return;
      current.askUserBlocked = true;
      current.inputRequestSequence += 1;
      if (!enabled || !current.runtime.getConfig().completionNotifications)
        return;
      current.completionNotifier.inputRequested(`blocked-${current.inputRequestSequence}`, completionNotification(current));
    });
  }
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") {
      startLifecycleGeneration(undefined);
      if (activeSession)
        teardownActiveSession();
      return;
    }
    const token = startLifecycleGeneration(ctx.sessionManager);
    const isFresh = () => token === lifecycleToken;
    const candidateCleanup = [];
    let published;
    try {
      const loaded = await loadAtelierConfig({
        userPath: userConfigPath(),
        projectPath: join3(ctx.cwd, CONFIG_DIR_NAME, "pi-atelier.json"),
        projectTrusted: ctx.isProjectTrusted()
      });
      if (!isFresh())
        return;
      for (const warning of loaded.warnings)
        ctx.ui.notify(warning, "warning");
      const session = createSession(ctx, token, loaded.config, loaded, candidateCleanup);
      candidateCleanup.length = 0;
      candidateCleanup.push(() => disposeSession(session));
      session.unsubscribeAskUserBlocked = subscribeAskUserBlocked(session);
      const previousSession = activeSession;
      activeSession = session;
      published = session;
      if (previousSession)
        disposeSession(previousSession, { clearFooter: true });
      registerCustomShortcuts(ctx, loaded.config);
      session.sidebar.setMode("manual");
      if (enabled) {
        syncFooter(session);
        if (loaded.config.showSidebarOnStartup)
          session.sidebar.show();
      }
      session.runtime.flushWorkspacePulseRefresh();
    } catch (error) {
      if (!published) {
        for (const cleanup of candidateCleanup.reverse())
          attempt(cleanup);
      } else if (activeSession === published) {
        teardownActiveSession(ctx);
      } else
        return;
      if (isFresh())
        ctx.ui.notify(`Pi Atelier could not start: ${errorMessage(error)}`, "error");
    } finally {
      if (lifecycleToken === token)
        initializingSessionManager = undefined;
    }
  });
  pi.on("session_tree", (_event, ctx) => {
    const current = getActiveSession(ctx);
    if (!enabled || !current)
      return;
    current.todos = reconstructTodos(ctx);
    current.runtime.refreshSubagentUsage();
    requestAllRenders(current);
  });
  pi.on("agent_start", (_event, ctx) => {
    const current = getActiveSession(ctx);
    if (!current)
      return;
    current.runActivity.startRun();
    current.completionNotifier.runStarted();
    current.providerFailed = false;
    current.runtime.setActivity("working");
  });
  pi.on("turn_start", (event, ctx) => {
    const current = getActiveSession(ctx);
    if (!current)
      return;
    current.runActivity.startTurn(event.turnIndex);
    current.completionNotifier.runStarted();
    current.runtime.scheduleWorkspacePulseRefresh();
  });
  function listenForPrefillChunks() {
    if (prefillStreamOff)
      return;
    prefillStreamOff = registerProviderStreamHandler(pi, (event, ctx) => {
      const current = getActiveSession(ctx);
      if (!enabled || !current || event.api !== OPENAI_COMPLETIONS_API)
        return;
      const wasShowing = current.prefill.getSnapshot() !== undefined;
      if (current.prefill.noteChunk(event.data)) {
        current.prefillThrottle.note();
        return;
      }
      if (wasShowing) {
        current.prefillThrottle.cancel();
        current.sidebar.requestRender();
      }
    });
  }
  function stopListeningForPrefillChunks() {
    prefillStreamOff?.();
    prefillStreamOff = undefined;
  }
  pi.on("before_provider_request", (event, ctx) => {
    const current = getActiveSession(ctx);
    if (!enabled || !current)
      return;
    current.runActivity.startResponse();
    const config = current.runtime.getConfig();
    if (!config.prefillEnabled || config.prefillProviders.length === 0) {
      stopListeningForPrefillChunks();
      return;
    }
    if (!current.prefill.noteRequest(ctx.model, event.payload)) {
      stopListeningForPrefillChunks();
      return;
    }
    listenForPrefillChunks();
    return { ...event.payload, return_progress: true };
  });
  pi.on("message_update", (event, ctx) => {
    const current = getActiveSession(ctx);
    if (!enabled || !current)
      return;
    const estimatedOutputTokens = estimateTokens(event.message);
    if (estimatedOutputTokens > 0)
      current.runActivity.updateResponseEstimate(estimatedOutputTokens);
  });
  pi.on("message_end", (event, ctx) => {
    if (event.message.role === "custom" && event.message.customType === "subagent-slash-result") {
      getActiveSession(ctx)?.runtime.observeSubagentMetadata(event.message.details);
    }
    if (event.message.role !== "assistant")
      return;
    getActiveSession(ctx)?.runActivity.finishResponse(event.message.usage.output);
  });
  pi.on("tool_execution_start", (event, ctx) => {
    getActiveSession(ctx)?.runActivity.startTool(enabled ? event : { ...event, args: undefined });
  });
  pi.on("tool_execution_end", (event, ctx) => {
    const current = getActiveSession(ctx);
    if (!current)
      return;
    current.runActivity.finishTool(event);
    current.runtime.scheduleWorkspacePulseRefresh();
  });
  pi.on("tool_result", (event, ctx) => {
    if (!enabled || event.toolName !== "todo")
      return;
    const current = getActiveSession(ctx);
    if (!current || event.isError)
      return;
    const todos = todosFromDetails(event.details);
    if (!todos)
      return;
    current.todos = todos;
    current.sidebar.requestRender();
  });
  pi.on("agent_settled", (_event, ctx) => {
    const current = getActiveSession(ctx);
    if (!current || !ctx.isIdle())
      return;
    current.runActivity.settle();
    current.prefill.clear();
    current.prefillThrottle.cancel();
    current.runtime.setActivity(current.providerFailed ? "error" : "ready");
    if (!enabled)
      return;
    current.sidebar.requestRender();
    if (current.runtime.getConfig().completionNotifications) {
      current.completionNotifier.turnSettled(completionNotification(current));
    }
  });
  pi.on("turn_end", async (event, ctx) => {
    const current = getActiveSession(ctx);
    if (!current)
      return;
    current.providerFailed = event.message?.role === "assistant" && event.message.stopReason === "error" && !ctx.signal?.aborted;
    current.runtime.refreshUsage();
    await current.runtime.flushWorkspacePulseRefresh();
  });
  const refreshUsage = (_event, ctx) => getActiveSession(ctx)?.runtime.refreshUsage();
  pi.on("model_select", refreshUsage);
  pi.on("thinking_level_select", refreshUsage);
  pi.on("session_compact", refreshUsage);
  pi.on("session_info_changed", refreshUsage);
  pi.on("session_shutdown", (_event, ctx) => {
    const current = getActiveSession(ctx);
    const initializing = initializingSessionManager;
    const cancelsInitialization = initializing !== undefined && contextUsesSessionManager(ctx, initializing);
    if (initializing && !cancelsInitialization) {
      if (current)
        teardownActiveSession();
      return;
    }
    if (!current && activeSession !== undefined && !cancelsInitialization)
      return;
    startLifecycleGeneration(undefined);
    if (current)
      teardownActiveSession();
  });
}
export {
  registerSidebarPanel,
  isSidebarPanelTextWithinRawLimit,
  isSidebarPanelSource,
  isSidebarPanelRole,
  isSidebarPanelRequestId,
  isSidebarPanelId,
  isSidebarPanelContributionId,
  atelierExtension as default,
  SIDEBAR_PANEL_PROTOCOL_VERSION,
  SIDEBAR_PANEL_MAX_TRACKED_SOURCES,
  SIDEBAR_PANEL_MAX_TITLE_CHARS,
  SIDEBAR_PANEL_MAX_SOURCE_CHARS,
  SIDEBAR_PANEL_MAX_ROW_CHARS,
  SIDEBAR_PANEL_MAX_ROWS,
  SIDEBAR_PANEL_MAX_RAW_TITLE_CODE_UNITS,
  SIDEBAR_PANEL_MAX_RAW_ROW_CODE_UNITS,
  SIDEBAR_PANEL_MAX_RAW_REQUEST_ID_CODE_UNITS,
  SIDEBAR_PANEL_MAX_PANELS,
  SIDEBAR_PANEL_MAX_ID_CHARS,
  SIDEBAR_PANEL_EVENT_CHANNEL,
  BUILTIN_SIDEBAR_PANEL_IDS
};
