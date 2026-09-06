/**
 * Background-run UX, mirroring Claude Code:
 *  - A live task panel below the input lists in-progress runs while you keep working.
 *    It is informational; run /workflows to open the full navigator.
 *  - When a background run finishes, its result is delivered back into the
 *    conversation so the paused task continues with the outcome.
 */
import { join } from "node:path";
import { AgentSession, ExtensionRunner, } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { aggregateAgentUsage, fmtCost, fmtTokenSegment, shorten, statusIcon, sumAgentOutput, tokenFigures, } from "./display.js";
import { agentTokensPerSecond, clearTokenSamples, sampleAgentTokens, sampleTokens, tokensPerSecond, } from "./token-rate.js";
// Re-export the shared sampler so existing callers/tests importing from task-panel keep working.
export { agentTokensPerSecond, clearTokenSamples, sampleAgentTokens, sampleTokens, tokensPerSecond, } from "./token-rate.js";
import { shortModel } from "./workflow-ui.js";
// `tokenUsage` is included so the detailed panel's live token/s counter refreshes
// as tokens accrue (not only on agent start/end). It is harmless in compact mode —
// it redraws identical content.
const RUN_EVENTS = [
    "agentStart",
    "agentModel",
    "agentEnd",
    "phase",
    "log",
    "tokenUsage",
    "complete",
    "error",
    "stopped",
    "paused",
    "resumed",
];
/** Events after which a run is gone and its token-rate samples can be dropped. */
const RUN_END_EVENTS = ["complete", "error", "stopped"];
/** Default cap on the JSON-dump fallback in a delivered result summary. Overridable
 *  via the `deliveredResultMaxChars` setting in ~/.pi/workflows/settings.json. */
const DEFAULT_DELIVERED_MAX_CHARS = 400;
/** Human-readable byte size for the dropped-tail hint: 512 B, 3.2 KB, 1.4 MB. */
function formatBytes(n) {
    if (n < 1024)
        return `${n} B`;
    if (n < 1024 * 1024)
        return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
/**
 * Pick a clean human-readable summary from a workflow result, in order of
 * preference: a `verdict`/`report`/`summary`/`synthesis` string field, a bare
 * string result, else a JSON dump capped at `maxChars`. When the dump is truncated the
 * dropped size is reported (the full result is still reachable via the pointer
 * that {@link deliverText} appends).
 */
function summarizeResult(result, maxChars = DEFAULT_DELIVERED_MAX_CHARS) {
    if (typeof result === "string")
        return result;
    if (result == null)
        return "null";
    if (typeof result === "object") {
        const obj = result;
        // `synthesis` is what the built-in multi-perspective workflow returns.
        for (const key of ["verdict", "report", "summary", "synthesis"]) {
            const val = obj[key];
            if (typeof val === "string" && val.trim())
                return val;
        }
    }
    const json = JSON.stringify(result, null, 2);
    if (json.length <= maxChars)
        return json;
    // Slice once (the kept head); derive the dropped size by byte-length subtraction
    // so we don't also allocate the (potentially large) truncated tail to measure it.
    const kept = json.slice(0, maxChars);
    const droppedBytes = Buffer.byteLength(json, "utf8") - Buffer.byteLength(kept, "utf8");
    return `${kept}\n…(truncated ${formatBytes(droppedBytes)})`;
}
function fitLine(line, width) {
    if (typeof width !== "number" || !Number.isFinite(width))
        return line;
    const maxWidth = Math.max(0, Math.floor(width));
    if (visibleWidth(line) <= maxWidth)
        return line;
    return truncateToWidth(line, maxWidth);
}
export function deliverText(run, opts = {}) {
    const summary = summarizeResult(run.result?.result, opts.maxChars);
    const tu = run.result?.tokenUsage;
    const cost = tu?.cost ? ` · ${fmtCost(tu.cost)}` : "";
    const segment = fmtTokenSegment(tokenFigures(tu), fmtTokensShort);
    const tokens = `${segment ? ` · ${segment}` : ""}${cost}`;
    const agents = run.result?.agentCount ?? run.snapshot.agentCount;
    const duration = run.result?.durationMs ? ` · ${(run.result.durationMs / 1000).toFixed(1)}s` : "";
    const lines = [
        `✓ Background workflow "${run.snapshot.name}" finished (${agents} agents${tokens}${duration}).`,
        "",
        summary,
    ];
    // Always point at the full persisted result so the tail is never lost — even when
    // the summary above is a complete verdict/summary field or an untruncated dump.
    if (opts.resultPath)
        lines.push("", `↳ Full result: ${opts.resultPath}`);
    return lines.join("\n");
}
/** Absolute path to a run's persisted result JSON. Undefined if the persistence
 *  layer can't be resolved — delivery must never throw in the complete handler. */
function persistedResultPath(manager, runId) {
    try {
        return join(manager.getPersistence().getRunsDir(), `${runId}.json`);
    }
    catch {
        return undefined;
    }
}
/** Delivered JSON-dump truncation threshold from settings (already normalized),
 *  defaulting to 400 when unset or unreadable. */
function deliveredMaxChars(opts) {
    try {
        return opts.loadSettings?.().deliveredResultMaxChars ?? DEFAULT_DELIVERED_MAX_CHARS;
    }
    catch {
        return DEFAULT_DELIVERED_MAX_CHARS;
    }
}
/** Process-wide: one live endpoint per pi session id. */
const sessionEndpoints = new Map();
/**
 * Session-stable thenable sends (host AgentSession.sendCustomMessage). Keyed
 * by host sessionId only — workflow children (in-memory, noExtensions, or
 * named `workflow:…`) must never enter this map (#109).
 */
const boundSessionSends = new Map();
/** runId → token of the deliver-and-ack that owns the lock, so bind flush does not double-send. Ownership prevents a stale finally from releasing a newer send's lock. */
const inFlightDeliveries = new Map();
let inFlightSeq = 0;
/**
 * Custom type for the session bind probe (see probeHostSessionSend). Sent
 * through pi.sendMessage ONLY so the sendCustomMessage capture patch can
 * identify the live host session. Capture-only: the patched sendCustomMessage
 * swallows probe messages — nothing is appended, persisted, or turned.
 */
export const DELIVERY_PROBE_CUSTOM_TYPE = "workflow-delivery-probe";
/**
 * Session ids probed successfully. Marked only after a probe that captured a
 * send; a failed or missed probe stays unmarked and is retried on the next
 * bind.
 */
const probedSessionIds = new Set();
/**
 * Quiet hosts (omp never sends custom messages itself) never trip the
 * AgentSession.prototype patch, so no thenable send is ever captured. One
 * capture-only probe through pi.sendMessage forces it: the host's void wrapper
 * calls the live session's sendCustomMessage synchronously, the prototype patch
 * captures the receiver (never forwarding the probe), and boundSessionSends is
 * populated by the time this returns.
 *
 * Retry-correct: the session is marked probed only when the probe actually
 * captured a send. A host whose pi.sendMessage throws (e.g. "Extension runtime
 * not initialized" during early startup) stays unmarked, so the next
 * bindSessionDelivery probes again instead of being permanently silent.
 */
function probeHostSessionSend(pi, sessionId) {
    if (probedSessionIds.has(sessionId))
        return;
    try {
        pi.sendMessage({ customType: DELIVERY_PROBE_CUSTOM_TYPE, content: "", display: false }, { triggerTurn: false });
    }
    catch (err) {
        // Probe is best-effort; bind stays fail-closed without a captured send.
        // Not marked probed — the next bindSessionDelivery retries.
        console.warn(`[workflow-delivery] delivery probe failed on session ${sessionId}:`, err);
        return;
    }
    if (boundSessionSends.has(sessionId))
        probedSessionIds.add(sessionId);
}
let agentSessionPatched = false;
let bindCoreObserved = false;
function hostSessionIdToSteal(session, probe) {
    const sm = session.sessionManager;
    if (!sm)
        return undefined;
    if (session._resourceLoader?.noExtensions === true)
        return undefined;
    try {
        const name = sm.getSessionName?.();
        if (typeof name === "string" && name.startsWith("workflow:"))
            return undefined;
    }
    catch {
        // getSessionName unavailable — keep evaluating
    }
    if (typeof session.sendCustomMessage !== "function")
        return undefined;
    const sid = sm.getSessionId?.();
    // PROBE EXCEPTION: the probe bypasses ONLY this persistence gate; the
    // sessionManager presence, noExtensions, and workflow:-name gates above
    // still apply. Justification: unnamed in-memory workflow children are
    // excluded by noExtensions/isPersisted at the bindCore hook (probe=false),
    // and a probe is only ever sent through the pi.sendMessage of the session
    // running this extension — it cannot reach a foreign or child session. omp
    // print-mode hosts report isSessionOnDisk()===false at session_start
    // (persisted lazily after bind), so the gate must not reject a probe-bearing
    // send (#109).
    if (!probe) {
        try {
            if (typeof sm.isPersisted === "function") {
                if (!sm.isPersisted())
                    return undefined;
            }
            else if (typeof sm.isSessionOnDisk === "function") {
                if (!sm.isSessionOnDisk())
                    return undefined;
            }
            else if (sm.persist !== true) {
                return undefined;
            }
        }
        catch {
            return undefined;
        }
    }
    return sid;
}
function captureHostSessionSend(session, probe) {
    const sid = hostSessionIdToSteal(session, probe);
    if (!sid)
        return;
    boundSessionSends.set(sid, (message, options) => session.sendCustomMessage?.(message, options));
}
/**
 * Capture a Promise-returning send from the *host* AgentSession. bindCore's
 * `actions.sendMessage` is fire-and-forget (void + swallowed reject) and must
 * not be treated as an ACK channel. Child sessions never enter the map.
 */
function patchAgentSessionCapture() {
    if (agentSessionPatched)
        return;
    agentSessionPatched = true;
    try {
        const proto = AgentSession.prototype;
        const original = proto.sendCustomMessage;
        if (typeof original !== "function") {
            // AgentSession shape changed — bind stays fail-closed without steal.
            return;
        }
        // PRIMARY capture hook: `_bindExtensionCore` runs at session construction,
        // before any extension code, so a stock pi host is captured without ever
        // probing. The omp fork bundle does not expose the symbol — guard with
        // typeof so the patch stays a no-op there and the probe fallback handles
        // capture. Full original gates apply (persistence gate included,
        // probe=false).
        if (typeof proto._bindExtensionCore === "function") {
            const bindCore = proto._bindExtensionCore;
            proto._bindExtensionCore = function patchedBindExtensionCore(...args) {
                try {
                    captureHostSessionSend(this, false);
                }
                catch {
                    // never break session construction
                }
                return bindCore.apply(this, args);
            };
        }
        // Invoke the original with the runtime's live session as receiver. A
        // `.bind(proto)` forward would freeze the receiver to the prototype, and a
        // bound function's receiver cannot be overridden by `.call(this, …)` — the
        // original would run with `this.agent` undefined and every non-trigger
        // send would reject, silently losing the delivery. Patch predates session
        // construction: this here is the session that later calls sendCustomMessage.
        proto.sendCustomMessage = function patchedSendCustomMessage(message, options) {
            const isProbe = message?.customType === DELIVERY_PROBE_CUSTOM_TYPE;
            try {
                captureHostSessionSend(this, isProbe);
            }
            catch {
                // never break the host send
            }
            // Capture-only probe: the probe exists only to trip this capture patch.
            // Never append to agent.state.messages, never write a session entry,
            // never inject an LLM user turn — swallow it entirely.
            if (isProbe)
                return Promise.resolve();
            return original.call(this, message, options);
        };
    }
    catch {
        // AgentSession unavailable or shape changed — bind stays fail-closed without steal
    }
}
/** Keep ExtensionRunner observed so module load order cannot skip the patch arm. */
function patchBindCoreObserve() {
    if (bindCoreObserved)
        return;
    bindCoreObserved = true;
    try {
        const proto = ExtensionRunner.prototype;
        const original = proto.bindCore;
        if (typeof original !== "function")
            return;
        // No capture of void actions.sendMessage — that path is not an ACK.
        proto.bindCore = function patchedBindCore(...args) {
            return original.apply(this, args);
        };
    }
    catch {
        // ignore
    }
}
patchAgentSessionCapture();
patchBindCoreObserve();
export const WORKFLOW_LIFECYCLE_EVENT = "pi-dynamic-workflows:lifecycle";
function deliveryManager(manager) {
    return manager;
}
function resolveDeliverySessionId(run, manager) {
    // Originating run wins; manager binding is legacy fallback only when the run
    // predates per-run sessionId. Never invent a session.
    return run.sessionId ?? manager.getSessionId?.();
}
function markRunPending(run, marker) {
    run.pendingDelivery = marker;
}
function clearRunPending(manager, runId, run) {
    if (run?.pendingDelivery) {
        run.pendingDelivery = undefined;
    }
    // Also clear on disk for runs already written / evicted from memory. Best-effort:
    // a missing persistence layer (unit tests) is fine — memory clear is enough.
    try {
        const persistence = manager.getPersistence?.();
        if (!persistence)
            return;
        const state = persistence.load(runId);
        if (!state?.pendingDelivery)
            return;
        const { pendingDelivery: _drop, ...rest } = state;
        persistence.save(rest);
        // If the live run still exists, keep it aligned without a full persistRace.
        const live = run ?? manager.getRun(runId);
        if (live)
            live.pendingDelivery = undefined;
    }
    catch {
        // ignore persistence errors — conversation delivery already succeeded
    }
}
function persistRunPendingBestEffort(manager, run) {
    try {
        // Prefer merging into an existing on-disk record so we don't clobber the
        // manager's richer write that follows the complete/error emit. When no
        // record exists yet (complete fires before manager.persistRun), seed a
        // minimal marker-bearing record; the subsequent manager write overwrites.
        const persistence = manager.getPersistence?.();
        if (!persistence)
            return;
        const existing = persistence.load(run.runId);
        if (existing) {
            persistence.save({ ...existing, pendingDelivery: run.pendingDelivery, sessionId: run.sessionId });
            return;
        }
        if (run.pendingDelivery) {
            persistence.save({
                runId: run.runId,
                workflowName: run.snapshot.name,
                script: run.script ?? "",
                sessionId: run.sessionId,
                status: run.status,
                phases: run.snapshot.phases ?? [],
                agents: [],
                logs: run.snapshot.logs ?? [],
                result: run.result?.result,
                tokenUsage: run.result?.tokenUsage ?? run.snapshot.tokenUsage,
                durationMs: run.result?.durationMs,
                startedAt: run.startedAt?.toISOString?.() ?? new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                pendingDelivery: run.pendingDelivery,
            });
        }
    }
    catch {
        // best-effort
    }
}
function contentForPending(manager, runId, marker, loadSettings, run, persisted) {
    if (marker.kind === "text")
        return marker.text;
    // complete — recompute from live run or disk so we never store the body twice
    if (run) {
        return deliverText(run, {
            resultPath: persistedResultPath(manager, runId),
            maxChars: deliveredMaxChars({ loadSettings }),
        });
    }
    if (persisted) {
        return deliverText({
            snapshot: { name: persisted.workflowName, agentCount: persisted.agents?.length ?? 0 },
            result: {
                result: persisted.result,
                tokenUsage: persisted.tokenUsage,
                agentCount: persisted.agents?.length ?? 0,
                durationMs: persisted.durationMs,
            },
        }, {
            resultPath: persistedResultPath(manager, runId),
            maxChars: deliveredMaxChars({ loadSettings }),
        });
    }
    return undefined;
}
/**
 * Attempt session-routed delivery. Resolves true only after a thenable
 * host sendCustomMessage / stableSend settles on a live endpoint. Void /
 * fire-and-forget sends and durable appends are NOT success (append writes
 * history without triggerTurn). Does not clear pending markers.
 */
function tryDeliverEndpoint(endpoint, content) {
    if (endpoint.suspended)
        return Promise.resolve(false);
    if (endpoint.sessionId && sessionEndpoints.get(endpoint.sessionId) !== endpoint) {
        // Stale endpoint object after rebind/drop.
        return Promise.resolve(false);
    }
    // Only a thenable session-stable send (host sendCustomMessage) may ACK.
    if (typeof endpoint.send === "function") {
        try {
            const ret = endpoint.send({ customType: "workflow-result", content, display: true }, { triggerTurn: true, deliverAs: "followUp" });
            if (ret != null && typeof ret.then === "function") {
                const startedGeneration = endpoint.generation;
                const sessionId = endpoint.sessionId;
                return Promise.resolve(ret).then(() => {
                    const current = sessionEndpoints.get(sessionId);
                    // Succeeded under this or a newer live endpoint for the same session.
                    return !!current && !current.suspended;
                }, (err) => {
                    const msg = err instanceof Error ? err.message : String(err);
                    console.warn(`[workflow-delivery] async send failed; left pending on disk: ${msg}`);
                    const current = sessionEndpoints.get(sessionId);
                    // If a newer generation already bound, caller may re-flush; signal failure.
                    if (current && current.generation !== startedGeneration && !current.suspended) {
                        // Return false so disk marker stays; flush path retries.
                    }
                    return false;
                });
            }
            // Non-thenable send (void fire-and-forget) — do not trust as ACK.
            console.warn(`[workflow-delivery] send for session ${endpoint.sessionId} did not return a thenable; ` +
                "not treating as delivered (fail closed).");
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[workflow-delivery] send failed; left pending on disk: ${msg}`);
            return Promise.resolve(false);
        }
    }
    return Promise.resolve(false);
}
function deliverAndAck(manager, runId, sessionId, content, run) {
    if (inFlightDeliveries.has(runId))
        return;
    const endpoint = sessionEndpoints.get(sessionId);
    if (!endpoint || endpoint.suspended || endpoint.sessionId !== sessionId)
        return;
    // Fail-closed (no send): keep the run pending on disk with NO lock, so a
    // synchronous re-bind + flush (e.g. probe retry on the next session_start)
    // is not locked out by a microtask that has not run yet.
    if (typeof endpoint.send !== "function")
        return;
    // Ownership token: a stale finally (from a superseded send) must never
    // release the lock held by a newer delivery — that would let a third
    // caller double-deliver the same result mid-flight.
    const lockToken = ++inFlightSeq;
    inFlightDeliveries.set(runId, lockToken);
    const startedGeneration = endpoint.generation;
    const release = () => {
        if (inFlightDeliveries.get(runId) === lockToken)
            inFlightDeliveries.delete(runId);
    };
    void tryDeliverEndpoint(endpoint, content)
        .then((ok) => {
        if (ok) {
            clearRunPending(manager, runId, run ?? manager.getRun?.(runId));
            return;
        }
        // Release the in-flight lock before a generation-change retry so flush
        // can actually pick this run back up. If the retry re-arms the lock with
        // a new token before this handler's release runs, the release is a no-op.
        release();
        const current = sessionEndpoints.get(sessionId);
        if (current && !current.suspended && current.generation !== startedGeneration && current.manager) {
            flushSessionDiskPending(current.manager, sessionId, current);
        }
    })
        .finally(release);
}
function routeBackgroundDelivery(manager, run, marker, content) {
    // 1. Mark pending first (fail closed / crash safe).
    markRunPending(run, marker);
    persistRunPendingBestEffort(manager, run);
    const sessionId = resolveDeliverySessionId(run, manager);
    if (!sessionId) {
        console.warn(`[workflow-delivery] run ${run.runId} has no sessionId; leaving pending on disk (fail closed).`);
        return;
    }
    // 2. Deliver only via the originating session's endpoint; clear after ACK.
    deliverAndAck(manager, run.runId, sessionId, content, run);
}
/**
 * Register or refresh the delivery endpoint for a pi session. Requires a
 * session-stable thenable send (stolen host AgentSession.sendCustomMessage, or
 * test DI). Never falls back to shared pi.sendMessage. A durable
 * appendCustomMessageEntry is not an ACK (no triggerTurn).
 *
 * Call from session_start AFTER Pi bindCore. Unsuspends and flushes disk pending
 * for this sessionId only.
 */
export function bindSessionDelivery(sessionId, pi, opts = {}) {
    if (!sessionId)
        return;
    patchAgentSessionCapture();
    patchBindCoreObserve();
    // Optional identity check — refuse to bind when sessionManager disagrees.
    try {
        const liveId = opts.sessionManager?.getSessionId?.();
        if (liveId && liveId !== sessionId) {
            console.warn(`[workflow-delivery] refusing bind: sessionManager id ${liveId} !== endpoint ${sessionId}`);
            return;
        }
    }
    catch {
        // getSessionId unavailable — continue
    }
    let stolen = opts.stableSend ?? boundSessionSends.get(sessionId);
    if (!stolen) {
        // Quiet hosts never call sendCustomMessage themselves, so the prototype
        // patch never captured. One invisible no-turn probe forces the host's void
        // send wrapper through AgentSession.sendCustomMessage, populating the
        // steal map synchronously.
        probeHostSessionSend(pi, sessionId);
        stolen = boundSessionSends.get(sessionId);
    }
    if (!stolen) {
        console.warn(`[workflow-delivery] no session-stable thenable send for session ${sessionId}; ` +
            "endpoint registered fail-closed (completions stay on disk until a host send is captured).");
    }
    const prev = sessionEndpoints.get(sessionId);
    const endpoint = {
        sessionId,
        send: stolen,
        loadSettings: opts.loadSettings ?? prev?.loadSettings,
        suspended: false,
        generation: (prev?.generation ?? 0) + 1,
        manager: opts.manager ?? prev?.manager,
    };
    sessionEndpoints.set(sessionId, endpoint);
    if (endpoint.manager)
        flushSessionDiskPending(endpoint.manager, sessionId, endpoint);
}
/**
 * Suspend delivery for a session. Completions only mark disk pending until
 * {@link bindSessionDelivery} / {@link resumeSessionDelivery} runs again.
 */
export function suspendSessionDelivery(sessionId) {
    if (!sessionId)
        return;
    const endpoint = sessionEndpoints.get(sessionId);
    if (endpoint)
        endpoint.suspended = true;
}
/**
 * Drop endpoint + stolen send for a session that will not come back (quit /
 * discard, or the *old* id after a successful replacement bind). Releases the
 * AgentSession closure retained by the steal map (#109).
 */
export function dropSessionDelivery(sessionId) {
    if (!sessionId)
        return;
    sessionEndpoints.delete(sessionId);
    boundSessionSends.delete(sessionId);
    // A dropped session may be rebound fresh (e.g. replaced id): forget probe
    // bookkeeping so the next bindSessionDelivery probes again.
    probedSessionIds.delete(sessionId);
}
/**
 * Unsuspend and flush one session's pending deliveries (disk). Prefer
 * {@link bindSessionDelivery} on session_start (also refreshes send).
 */
export function resumeSessionDelivery(sessionId, manager) {
    if (!sessionId)
        return;
    const endpoint = sessionEndpoints.get(sessionId);
    if (!endpoint)
        return;
    endpoint.suspended = false;
    if (manager)
        endpoint.manager = manager;
    if (endpoint.manager)
        flushSessionDiskPending(endpoint.manager, sessionId, endpoint);
}
function flushSessionDiskPending(manager, sessionId, endpoint) {
    if (endpoint.suspended)
        return;
    const tryOne = (runId, marker, run, persisted) => {
        if (inFlightDeliveries.has(runId))
            return;
        const content = contentForPending(manager, runId, marker, endpoint.loadSettings, run, persisted);
        if (content === undefined)
            return;
        deliverAndAck(manager, runId, sessionId, content, run);
    };
    // Live in-memory runs for this session. Null sessionId is claimable only for
    // THIS manager's live runs (pre-bind completions) — never from a foreign manager.
    try {
        for (const run of manager.listLiveRuns?.() ?? []) {
            if (!run.pendingDelivery)
                continue;
            if (run.sessionId != null && run.sessionId !== sessionId)
                continue;
            if (run.sessionId == null)
                run.sessionId = sessionId;
            tryOne(run.runId, run.pendingDelivery, run);
        }
    }
    catch {
        // listLiveRuns may be absent on stubs
    }
    // Disk runs (including terminal runs already evicted from memory). Require an
    // exact sessionId match — do not claim null-sessionId disk rows (same-cwd dual
    // manager race). Handoff re-homes previous-session pendings via adopt first.
    try {
        const persistence = manager.getPersistence?.();
        if (!persistence)
            return;
        for (const state of persistence.list()) {
            if (!state.pendingDelivery)
                continue;
            if (state.sessionId !== sessionId)
                continue;
            // Skip if the live copy still carries the marker — the loop above owns it.
            const live = manager.getRun?.(state.runId);
            if (live?.pendingDelivery)
                continue;
            tryOne(state.runId, state.pendingDelivery, live, state);
        }
    }
    catch {
        // best-effort
    }
}
/**
 * Stop live sends for the manager's currently bound session. In-flight
 * completions only leave disk pending until the next bind/resume.
 *
 * Call from session_shutdown BEFORE handoff or discard so a completion that
 * races the teardown cannot deliver into the outgoing session (#143).
 */
export function suspendResultDelivery(manager) {
    suspendSessionDelivery(manager.getSessionId?.());
}
/**
 * Unsuspend and flush queued deliveries for the manager's bound session.
 * Must run only after Pi has finished bindCore (i.e. from session_start).
 * Prefer {@link bindSessionDelivery} which also captures a fresh stable send.
 */
export function resumeResultDelivery(manager) {
    resumeSessionDelivery(manager.getSessionId?.(), manager);
}
/**
 * When a background run finishes (or fails), deliver its result back into the
 * *originating* conversation AND continue the turn so the assistant can act on
 * it — without blocking the user meanwhile:
 *
 *  - Delivery is routed by `run.sessionId` through the process-wide endpoint
 *    registry (never "latest pi wins").
 *  - `triggerTurn: true` starts a fresh turn when the agent is idle.
 *  - `deliverAs: "followUp"` queues behind an in-flight turn — never interrupts.
 *  - Durable pending marker clears only after verified delivery ACK.
 *
 * Set up once per manager; idempotent via an internal guard. Across session
 * replacement the manager (and these listeners) survive via the handoff path;
 * each new generation calls {@link bindSessionDelivery} on session_start.
 */
export function installResultDelivery(pi, manager, opts = {}) {
    const m = deliveryManager(manager);
    m.__deliveryLoadSettings = opts.loadSettings;
    patchAgentSessionCapture();
    patchBindCoreObserve();
    m.__lifecycleEventEmitter = (data) => pi.events?.emit(WORKFLOW_LIFECYCLE_EVENT, data);
    if (!m.__lifecycleEventInstalled) {
        m.__lifecycleEventInstalled = true;
        const emitLifecycle = (status) => ({ runId }) => {
            const run = manager.getRun(runId);
            const persisted = run ? undefined : manager.getPersistence().load(runId);
            const lifecycle = run?.background
                ? { name: run.snapshot.name, sessionId: resolveDeliverySessionId(run, manager) }
                : persisted
                    ? { name: persisted.workflowName, sessionId: persisted.sessionId }
                    : undefined;
            if (!lifecycle)
                return;
            m.__lifecycleEventEmitter?.({
                status,
                runId,
                name: lifecycle.name,
                ...(lifecycle.sessionId ? { sessionId: lifecycle.sessionId } : {}),
            });
        };
        manager.on("started", emitLifecycle("started"));
        manager.on("resumed", emitLifecycle("resumed"));
        manager.on("paused", emitLifecycle("paused"));
        manager.on("complete", emitLifecycle("completed"));
        manager.on("error", emitLifecycle("failed"));
        manager.on("stopped", emitLifecycle("stopped"));
    }
    if (m.__deliveryInstalled) {
        // Listeners survive session replacement. Refresh loadSettings / manager
        // pointers only — do NOT mutate send, generation, or suspended here.
        // Factory runs before bindCore; session_start calls bindSessionDelivery.
        const sid = manager.getSessionId?.();
        if (sid) {
            const endpoint = sessionEndpoints.get(sid);
            if (endpoint) {
                endpoint.loadSettings = opts.loadSettings ?? endpoint.loadSettings;
                endpoint.manager = manager;
            }
        }
        return;
    }
    m.__deliveryInstalled = true;
    manager.on("complete", ({ runId }) => {
        const run = manager.getRun(runId);
        // Only background/resumed runs are delivered: a foreground (sync) run already
        // returns its result inline as the tool result, so re-delivering would dup it.
        if (!run?.background)
            return;
        const sessionId = resolveDeliverySessionId(run, manager);
        const endpoint = sessionId ? sessionEndpoints.get(sessionId) : undefined;
        const content = deliverText(run, {
            resultPath: persistedResultPath(manager, runId),
            maxChars: deliveredMaxChars({
                loadSettings: endpoint?.loadSettings ?? m.__deliveryLoadSettings,
            }),
        });
        routeBackgroundDelivery(manager, run, { kind: "complete" }, content);
    });
    manager.on("error", ({ runId, error }) => {
        const run = manager.getRun(runId);
        if (!run?.background)
            return;
        const text = `✗ Background workflow ${runId} failed: ${error?.message ?? "unknown error"}`;
        routeBackgroundDelivery(manager, run, { kind: "text", text }, text);
    });
    // A provider usage/quota limit checkpoints the run as paused (not failed): tell the
    // user it is resumable once their budget refills, rather than letting it look dead.
    // Manual pause() also emits "paused" but with no reason — guard so only the
    // usage-limit case delivers a message.
    manager.on("paused", ({ runId, reason, error, resetHint, }) => {
        if (reason !== "usage_limit")
            return;
        const run = manager.getRun(runId);
        if (!run?.background)
            return;
        const when = resetHint ? ` (${resetHint})` : "";
        const cause = error?.message ?? "provider usage limit reached";
        const text = `⏸ Background workflow ${runId} paused: ${cause}${when}. ` +
            `Completed steps are saved — run /workflows resume ${runId} once your usage limit resets.`;
        routeBackgroundDelivery(manager, run, { kind: "text", text }, text);
    });
}
/** @internal test helper — reset process-wide delivery registries between cases. */
export function _resetDeliveryRegistriesForTests() {
    sessionEndpoints.clear();
    boundSessionSends.clear();
    inFlightDeliveries.clear();
    probedSessionIds.clear();
}
/** @internal test helper — register a thenable session-stable send (steal map). */
export function _registerBoundSessionSendForTests(sessionId, send) {
    boundSessionSends.set(sessionId, send);
}
/** @internal test helper — register a host-shaped session (steal-map host filter). */
export function _registerHostSessionForTests(session) {
    captureHostSessionSend(session);
}
/** @internal test helper — inspect which session ids currently hold a stolen send. */
export function _getStealMapForTests() {
    return boundSessionSends;
}
/** @internal test helper — inspect whether a session is marked successfully probed. */
export function _isProbedForTests(sessionId) {
    return probedSessionIds.has(sessionId);
}
/** @internal test helper — inspect endpoint suspended flag. */
export function _getSessionDeliveryEndpointForTests(sessionId) {
    const ep = sessionEndpoints.get(sessionId);
    if (!ep)
        return undefined;
    return {
        suspended: ep.suspended,
        generation: ep.generation,
        hasSend: typeof ep.send === "function",
        // Append is never an ACK; kept on the inspect shape so existing tests compile.
        hasAppend: false,
    };
}
export function renderPanel(manager, theme, width) {
    const all = manager.listRuns();
    const active = all.filter((r) => r.status === "running" || r.status === "paused");
    if (!active.length)
        return [];
    const rows = active.map((r) => {
        const live = manager.getRun(r.runId);
        const agents = live?.snapshot.agents ?? r.agents;
        const done = agents.filter((a) => a.status === "done").length;
        const icon = r.status === "paused" ? "⏸" : "◆";
        const phase = live?.snapshot.currentPhase ? ` · ${live.snapshot.currentPhase}` : "";
        return `  ${icon} ${r.workflowName}  ${done}/${agents.length} agents${phase}`;
    });
    // Finished runs leave this live panel but are kept in the navigator. Tell the
    // user so a completed run doesn't look like it vanished.
    const finished = all.filter((r) => r.status !== "running" && r.status !== "paused").length;
    const hint = theme.fg("dim", finished > 0
        ? `  /workflows — open navigator (${finished} finished kept in history)`
        : "  /workflows — open navigator");
    return [theme.bold(`Workflows running (${active.length}):`), ...rows, hint].map((line) => fitLine(line, width));
}
// ─── Detailed mode: live token rate ────────────────────────────────────────────
// The rolling token/s sampler lives in token-rate.ts (shared with the /workflows
// navigator); task-panel feeds it on its 2s detailed-mode tick below.
/** Compact token count for the space-constrained panel: 980, 12.4K, 1.3M. */
function fmtTokensShort(n) {
    if (!Number.isFinite(n) || n <= 0)
        return "";
    if (n < 1000)
        return `${Math.round(n)}`;
    if (n < 1_000_000)
        return `${(n / 1000).toFixed(1)}K`;
    return `${(n / 1_000_000).toFixed(1)}M`;
}
/** Normalize the configured per-phase agent cap to a sane integer (default 8). */
export function clampMaxAgents(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 1)
        return 8;
    return Math.min(1000, Math.floor(value));
}
/** Per-phase + per-agent body for one run in detailed mode (mirrors renderWorkflowLines). */
function renderRunBody(snap, agents, maxAgents, theme, runId) {
    const dim = (t) => theme.fg("dim", t);
    const lines = [];
    // Group agents by phase, declared order first then discovery order (as the navigator does).
    const order = snap.phases.length ? [...snap.phases] : [];
    const byPhase = new Map();
    for (const a of agents) {
        const key = a.phase ?? "(no phase)";
        if (!byPhase.has(key))
            byPhase.set(key, []);
        byPhase.get(key)?.push(a);
        if (!order.includes(key))
            order.push(key);
    }
    for (const title of order) {
        const phaseAgents = byPhase.get(title) ?? [];
        if (!phaseAgents.length)
            continue;
        const done = phaseAgents.filter((a) => a.status === "done").length;
        const running = phaseAgents.filter((a) => a.status === "running").length;
        const errors = phaseAgents.filter((a) => a.status === "error").length;
        const skipped = phaseAgents.filter((a) => a.status === "skipped").length;
        const complete = done + errors + skipped === phaseAgents.length;
        const marker = running > 0 || (!complete && snap.currentPhase === title) ? "▶" : complete ? "✓" : " ";
        const phaseMeta = [
            `${done}/${phaseAgents.length} agents`,
            running ? `${running} running` : "",
            errors ? `${errors} errors` : "",
            fmtTokenSegment(aggregateAgentUsage(phaseAgents), fmtTokensShort),
        ]
            .filter(Boolean)
            .join(" · ");
        lines.push(theme.fg("accent", `  ${marker} ${title}`) + dim(`  ${phaseMeta}`));
        const visible = phaseAgents.slice(-maxAgents);
        for (const a of visible) {
            const segment = fmtTokenSegment(tokenFigures(a.tokenUsage, a.tokens), fmtTokensShort);
            const tok = segment ? dim(` ${segment}`) : "";
            const rate = a.status === "running" ? agentTokensPerSecond(runId, a.id) : 0;
            const tps = rate > 0 ? dim(` · ${Math.round(rate)} tok/s`) : "";
            const mdl = shortModel(a.model);
            const model = mdl ? dim(` · ${mdl}`) : "";
            lines.push(`    [${a.id}] ${statusIcon(a.status)} ${shorten(a.label, 40)}${tok}${tps}${model}`);
        }
        if (phaseAgents.length > visible.length) {
            lines.push(dim(`    … ${phaseAgents.length - visible.length} earlier agents`));
        }
    }
    return lines;
}
/**
 * Detailed variant of {@link renderPanel}: per-run header with aggregate tokens,
 * cost, and a live generation rate (output tokens/s), followed by per-phase progress
 * and per-agent rows (capped at `maxAgents` per phase). `now` is injected for testability.
 */
export function renderPanelDetailed(manager, theme, width, maxAgents, now) {
    const all = manager.listRuns();
    const active = all.filter((r) => r.status === "running" || r.status === "paused");
    if (!active.length)
        return [];
    const dim = (t) => theme.fg("dim", t);
    const out = [theme.bold(`Workflows running (${active.length}):`)];
    for (const r of active) {
        const live = manager.getRun(r.runId);
        const snap = live?.snapshot;
        const agents = (snap?.agents ?? r.agents);
        const done = agents.filter((a) => a.status === "done").length;
        const icon = r.status === "paused" ? "⏸" : "◆";
        const usage = snap?.tokenUsage ?? r.tokenUsage;
        // The displayed token cell stays the billed breakdown (fresh + cacheRead), but
        // the RATE samples cumulative output only: input and cacheRead jump in one step
        // at each API-call boundary (prompt send + cached re-reads), which made the old
        // billed-token rate spike to implausible values. Output grows while a model
        // generates, so a flat/zero rate now indicates a real stall. Paused runs do not
        // accrue output, so their rate is suppressed.
        const runUsage = aggregateAgentUsage(agents);
        sampleTokens(r.runId, sumAgentOutput(agents), now);
        if (r.status === "running") {
            for (const a of agents) {
                if (a.status === "running") {
                    sampleAgentTokens(r.runId, a.id, a.tokenUsage?.output ?? 0, now);
                }
            }
        }
        const rate = r.status === "running" ? tokensPerSecond(r.runId) : 0;
        const meta = [
            `${done}/${agents.length} agents`,
            snap?.currentPhase || "",
            fmtTokenSegment(runUsage, fmtTokensShort),
            // (cost is only known once the run finalizes its usage.)
            usage?.cost ? fmtCost(usage.cost) : "",
            rate > 0 ? `${Math.round(rate)} tok/s` : "",
        ]
            .filter(Boolean)
            .join(" · ");
        out.push(`  ${icon} ${theme.bold(r.workflowName)}  ${dim(meta)}`);
        if (snap)
            out.push(...renderRunBody(snap, agents, maxAgents, theme, r.runId));
    }
    const finished = all.filter((r) => r.status !== "running" && r.status !== "paused").length;
    out.push(dim(finished > 0
        ? `  /workflows — open navigator (${finished} finished kept in history)`
        : "  /workflows — open navigator"));
    return out.map((line) => fitLine(line, width));
}
/**
 * Install the live "workflows running" panel below the editor. Re-rendered on
 * every manager event. Informational only — the user opens the navigator with
 * /workflows. (`_pi` is kept for signature stability.)
 */
export function installTaskPanel(_pi, manager, ui, opts = {}) {
    // Live-read settings with a ~1s TTL: a render-path disk read every frame would
    // be wasteful, but re-reading at most once a second still makes
    // /workflows-progress take effect "immediately" (no restart).
    let cached = {};
    let cachedAt = Number.NEGATIVE_INFINITY;
    const settings = () => {
        if (!opts.loadSettings)
            return cached;
        const now = Date.now();
        if (now - cachedAt > 1000) {
            try {
                cached = opts.loadSettings() ?? {};
            }
            catch {
                cached = {};
            }
            cachedAt = now;
        }
        return cached;
    };
    const hasActiveRun = () => manager.listRuns().some((r) => r.status === "running" || r.status === "paused");
    ui.setWidget("workflow-tasks", (tui, theme) => {
        const onEvent = () => tui.requestRender();
        for (const ev of RUN_EVENTS)
            manager.on(ev, onEvent);
        const onRunEnd = ({ runId }) => clearTokenSamples(runId);
        for (const ev of RUN_END_EVENTS)
            manager.on(ev, onRunEnd);
        // In detailed mode, force a redraw every 2s while a run is active so the
        // token/s rate keeps updating between sparse token events — and decays to 0
        // when an agent stalls. Gated + unref'd so it costs nothing when idle.
        const timer = setInterval(() => {
            if (settings().progressPanelMode === "detailed" && hasActiveRun())
                tui.requestRender();
        }, 2000);
        timer.unref?.();
        // Purely informational: it lists running runs and re-renders on events. To
        // open the navigator, the user runs /workflows (the panel takes no input).
        const comp = {
            render: (width) => {
                const s = settings();
                if (s.progressPanelMode === "detailed") {
                    return renderPanelDetailed(manager, theme, width, clampMaxAgents(s.progressPanelMaxAgents), Date.now());
                }
                return renderPanel(manager, theme, width);
            },
            invalidate: () => { },
            dispose: () => {
                clearInterval(timer);
                for (const ev of RUN_EVENTS)
                    manager.off(ev, onEvent);
                for (const ev of RUN_END_EVENTS)
                    manager.off(ev, onRunEnd);
            },
        };
        return comp;
    }, { placement: "belowEditor" });
}
