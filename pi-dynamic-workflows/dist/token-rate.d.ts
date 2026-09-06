/**
 * Shared rolling token/s sampler for the workflow surfaces.
 *
 * Both the live task panel (task-panel.ts) and the /workflows navigator
 * (workflow-ui.ts) feed and read the SAME maps here, so the rate you see is
 * consistent no matter which window is open. Samples are keyed by runId (run
 * aggregate) and `${runId}/${agentId}` (per agent), and each surface feeds on
 * its own redraw tick while a run is active — a stalled agent stops being fed,
 * its window ages out, and the rate decays to 0.
 */
/** Record a token-total sample for `runId` at time `now` (ms). */
export declare function sampleTokens(runId: string, total: number, now: number): void;
/** Record a per-agent token-total sample for agent `agentId` of `runId` at time `now` (ms). */
export declare function sampleAgentTokens(runId: string, agentId: number, total: number, now: number): void;
/** Tokens/second over the rolling window; 0 when too few samples or totals plateau. */
export declare function tokensPerSecond(runId: string): number;
/** Per-agent tokens/second over the rolling window; 0 for unknown or stalled agents. */
export declare function agentTokensPerSecond(runId: string, agentId: number): number;
/** Forget a run's samples (call when it finishes) so the maps can't grow unbounded. */
export declare function clearTokenSamples(runId: string): void;
