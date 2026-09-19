/**
 * Thinking/reasoning-effort mapping for Command Code models.
 *
 * Command Code's catalog does not expose per-model effort levels; they come
 * from the static `catalog.metadata.ts` snapshot (the bundled CLI registry /
 * docs pricing table). The global vocabulary is `low | medium | high | xhigh |
 * max` (plus `minimal`, which no current model advertises but pi accepts).
 *
 * Pi's `thinkingLevelMap` maps a pi level to the provider value to send, and
 * `null` hides the level in the picker. `off` is `"none"` for OpenAI-wire
 * models (a `reasoning_effort` value) but `null` for Anthropic-wire models:
 * adaptive thinking has no `"none"` effort, so the level is hidden instead of
 * sending an invalid value.
 */

import type { ThinkingLevelMap } from "@earendil-works/pi-ai";

export type { ThinkingLevelMap };

/** Effort values pi may send for a Command Code model. */
export const EFFORT_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;

/** One supported effort value. */
export type CommandCodeEffort = (typeof EFFORT_LEVELS)[number];

const EFFORT_SET: ReadonlySet<string> = new Set(EFFORT_LEVELS);

/** The wire format a model uses; affects only how `off` is represented. */
export type CommandCodeApi = "anthropic-messages" | "openai-completions";

/**
 * Normalize a raw effort list (from the metadata snapshot) to the supported
 * vocabulary: lowercased, trimmed, de-duplicated, unknown values dropped and
 * order preserved.
 */
export function normalizeEfforts(efforts?: readonly string[]): CommandCodeEffort[] {
  if (!efforts || efforts.length === 0) return [];
  const normalized: CommandCodeEffort[] = [];
  for (const raw of efforts) {
    const effort = raw.trim().toLowerCase();
    if (EFFORT_SET.has(effort) && !normalized.includes(effort as CommandCodeEffort)) {
      normalized.push(effort as CommandCodeEffort);
    }
  }
  return normalized;
}

/**
 * Build pi's `thinkingLevelMap` from a model's reasoning flag, effort list and
 * wire format. Returns `undefined` when the model has no selectable efforts
 * (pi then applies its own defaults), so an unset map never hides a supported
 * level accidentally.
 */
export function buildThinkingLevelMap(
  reasoning: boolean,
  efforts: readonly string[] | undefined,
  api: CommandCodeApi,
): ThinkingLevelMap | undefined {
  if (!reasoning) return undefined;
  const normalized = normalizeEfforts(efforts);
  if (normalized.length === 0) return undefined;

  const map: ThinkingLevelMap = {
    off: api === "anthropic-messages" ? null : "none",
    minimal: null,
    low: null,
    medium: null,
    high: null,
    xhigh: null,
  };
  for (const effort of normalized) {
    map[effort] = effort;
  }
  return map;
}
