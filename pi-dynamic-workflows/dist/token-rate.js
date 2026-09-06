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
/** Rolling window for the token/s rate. Older samples age out so a stall decays to 0. */
const RATE_WINDOW_MS = 10_000;
/** Push a (ts, total) sample into a rolling sample list, collapsing same-instant repeats. */
function pushSample(samples, now, total) {
    const last = samples[samples.length - 1];
    // Collapse repeat renders within the same instant (e.g. width recalcs).
    if (last && last.ts === now && last.total === total)
        return;
    samples.push({ ts: now, total });
    // Drop samples beyond the rolling window, always keeping ≥2 so a rate is computable.
    while (samples.length > 2 && now - samples[0].ts > RATE_WINDOW_MS)
        samples.shift();
}
/** Tokens/second over the oldest→newest span of a sample list; 0 when there are too
 *  few samples or the total plateaued (the stall signal). */
function rateOver(samples) {
    if (!samples || samples.length < 2)
        return 0;
    const oldest = samples[0];
    const newest = samples[samples.length - 1];
    const elapsedMs = newest.ts - oldest.ts;
    if (elapsedMs <= 0)
        return 0;
    const delta = newest.total - oldest.total;
    if (delta <= 0)
        return 0;
    return (delta / elapsedMs) * 1000;
}
/** Per-run (timestamp, cumulative total) samples, keyed by the persisted runId so
 *  the rolling rate survives pause→resume. Cleared when a run ends. */
const tokenSamples = new Map();
/** Per-agent (timestamp, cumulative generated-output) samples, keyed by `${runId}/${agentId}`
 *  so each task row can show its own rolling generation rate. Only running agents are
 *  sampled: a finished agent's output plateaus, its window ages out, and its rate decays
 *  to 0. The run-end sweep in {@link clearTokenSamples} removes them all. */
const agentTokenSamples = new Map();
/** Record a token-total sample for `runId` at time `now` (ms). */
export function sampleTokens(runId, total, now) {
    const samples = tokenSamples.get(runId) ?? [];
    pushSample(samples, now, total);
    tokenSamples.set(runId, samples);
}
/** Record a per-agent token-total sample for agent `agentId` of `runId` at time `now` (ms). */
export function sampleAgentTokens(runId, agentId, total, now) {
    const key = `${runId}/${agentId}`;
    const samples = agentTokenSamples.get(key) ?? [];
    pushSample(samples, now, total);
    agentTokenSamples.set(key, samples);
}
/** Tokens/second over the rolling window; 0 when too few samples or totals plateau. */
export function tokensPerSecond(runId) {
    return rateOver(tokenSamples.get(runId));
}
/** Per-agent tokens/second over the rolling window; 0 for unknown or stalled agents. */
export function agentTokensPerSecond(runId, agentId) {
    return rateOver(agentTokenSamples.get(`${runId}/${agentId}`));
}
/** Forget a run's samples (call when it finishes) so the maps can't grow unbounded. */
export function clearTokenSamples(runId) {
    tokenSamples.delete(runId);
    const prefix = `${runId}/`;
    for (const key of agentTokenSamples.keys()) {
        if (key.startsWith(prefix))
            agentTokenSamples.delete(key);
    }
}
