# Implementation Plan: `pi-commandcode-cloud`

- **Status:** Verified for implementation (adversarial verification complete — see §2.1)
- **Date:** 2026-09-19
- **Verification:** C1, C2, C3, C5 confirmed by both lenses; **C4 confirmed by the `disconfirm` lens only** (its `reproduce` lens was skipped — hung agent). See §2.1.
- **Target repo:** `/home/satish/pi-extensions`
- **New extension root:** `/home/satish/pi-extensions/pi-commandcode-cloud`
- **Siblings / templates:**
  - `/home/satish/.pi/agent/npm/node_modules/pi-ollama-cloud` (provider + opt-in footer status template)
  - `/home/satish/pi-extensions/pi-usage` (per-provider usage adapter template)
- **Prior art (read-only evidence, not a dependency):** `pi-commandcode-provider@0.7.1` (`/tmp/recon-cc-provider`), `command-code@1.58.0` CLI bundle, three third-party Command Code bridges, official docs at `commandcode.ai/docs`.

---

## 1. Executive summary and scope

`pi-commandcode-cloud` registers **Command Code** (`commandcode.ai`) as a first-class pi model provider using Command Code's OpenAI- and Anthropic-compatible Provider API, gives the user a working credential path through pi's native `/login` (API-key paste, plus an optional browser loopback login), and surfaces Command Code **usage/quota** in two places:

1. the extension's **own opt-in footer status bar** (default off, toggled by a command), and
2. a **`pi-usage` adapter entry** (`commandcode-cloud` in the `KNOWN` map) so the pi-usage footer/dialog can render the same data.

Both usage surfaces are **gated on Command Code being the active/loaded provider**, using the exact gating model proven in `pi-ollama-cloud`: `ctx.model?.provider === "<our-provider-id>"`, with `session_start` / `model_select` / `agent_end` / `session_shutdown` hooks and a TUI-mode guard.

### In scope for v1

- Provider registration under one provider id with per-model OpenAI/Anthropic routing.
- Live public model catalog (`GET /provider/v1/models`) + native `refreshModels` + a baked-in generated fallback catalog.
- Static per-model metadata (reasoning flag, effort levels, input modalities, max output tokens, pricing) merged onto the live catalog, generated from a checked-in snapshot.
- Credential setup through pi `/login`:
  - automatic API-key login because we set `apiKey: "$COMMAND_CODE_API_KEY"`, and
  - an `oauth` entry offering a browser loopback login (mirrors `cmd login`) plus manual key paste, validated against `GET /alpha/whoami`.
- Read-only credential interop with `~/.commandcode/auth.json` and `COMMAND_CODE_API_KEY`.
- Usage data plane against the `https://api.commandcode.ai/alpha/*` account API (`whoami`, `billing/credits`, `billing/subscriptions`, `usage/summary`), with per-endpoint graceful degradation.
- Footer status bar (opt-in), quota bars + colors, 5-minute refresh with a fast path when a window is nearly exhausted.
- `pi-usage` adapter file + `KNOWN` registry entry (2-line edit) + tests + docs.
- Helper commands: `/commandcode-usage`, `/commandcode-status`, `/commandcode-refresh`, `/commandcode-usage-status`.
- Monorepo wiring: root `package.json` `pi.extensions` entry, README rows, deploy/tag strategy.

### Out of scope for v1 (explicit)

- **Legacy `/alpha/generate` transport fallback for Go-plan accounts.** Command Code's Provider API returns `403 upgrade_required` for the Go plan (the only plan without API access). v1 maps this to a clear actionable error; automatic fallback to `POST /alpha/generate` is deferred (see §10, R1). Provider-plan and other eligible accounts work without it.
- **Web tools** (`web_search`/`web_fetch`). Command Code documents no such endpoint; `cache.ts`/`web-tools.ts` from `pi-ollama-cloud` are deliberately dropped.
- **Token/request accounting from session transcripts.** pi-usage already aggregates tokens from session files; this extension only reports provider-side quota.
- **Writing to `~/.commandcode/auth.json`.** We read it for interop but never mutate the CLI's file.
- **A pi-usage runtime registration hook.** pi-usage has no such API; integration is a source edit in the pi-usage package (see §7).
- **Multi-account aliasing UI inside this extension.** pi-usage already supports aliases; we document the usage.json recipe.

---

## 2. Verified facts table

Legend: **[VERIFIED]** = primary-source evidence read directly; **[CORROBORATED]** = ≥2 independent sources agree; **[ASSUMPTION]** = not confirmed against a live/primary source, must be re-verified during implementation. The five load-bearing claims **C1–C5** were additionally adversarially verified after this plan was written — see the verification log in §2.1.

| Fact | Value | Source / citation | Confidence |
|---|---|---|---|
| Provider API base URL | `https://api.commandcode.ai/provider/v1` | official docs `/docs/provider` (`/tmp/cc/r_docs-provider.txt`); CLI bundle `Vt.prod` | [VERIFIED] |
| OpenAI chat endpoint | `POST https://api.commandcode.ai/provider/v1/chat/completions`, `Authorization: Bearer <key>` | official docs `/docs/provider`; CLI bundle; bridges | [VERIFIED] |
| OpenAI Responses endpoint | `POST .../provider/v1/responses` | official docs `/docs/provider` | [VERIFIED] |
| Anthropic endpoint | `POST .../provider/v1/messages`, `Authorization: Bearer` or `x-api-key` | official docs `/docs/provider` | [VERIFIED] |
| Model catalog | `GET https://api.commandcode.ai/provider/v1/models` — **public, no auth**, `accept: application/json` | live fetch in recon (`/tmp/cc/live_models.json`, HTTP 200 unauthenticated); CLI bundle; `pi-commandcode-provider` `src/models.ts` | [VERIFIED] |
| Catalog response shape | `{ object: "list", data: [{ id, object, created, owned_by, name, context_length, supported_endpoints }] }`; 71 models at fetch time | live `/tmp/cc/live_models.json`; docs `/docs/provider` | [VERIFIED] |
| Per-model endpoint routing | `supported_endpoints` values exactly `"/messages"`, `"/chat/completions"`, `"/responses"`; live 71-model counts: **55** `["/chat/completions","/responses"]`, **8** `["/chat/completions"]`, and exactly the **8** `claude-*` models `["/messages"]`-only (zero counterexamples) | live unauthenticated catalog (`/tmp/cc/live_models.json`, HTTP 200); docs `/docs/provider`; verify:C1 reproduce + disconfirm | [VERIFIED] |
| Anthropic vs OpenAI split | primary rule: `supported_endpoints == ["/messages"]` ⇒ `anthropic-messages`; fallback `id.startsWith("claude-")` when the field is absent | live public catalog; `pi-commandcode-provider` `src/models.ts` `apiForModelId()`; verify:C1 **both lenses** | [VERIFIED] |
| Anthropic baseUrl convention | strip trailing `/v1` so pi's Anthropic SDK appends `/v1/messages` (base `.../provider` + `/v1/messages`) | `pi-commandcode-provider` `baseUrlForModel()`; pi-ai `dist/api/anthropic-messages.js` (`baseURL: model.baseUrl`); verify:C1 disconfirm + verify:C5 both lenses | [VERIFIED] |
| Catalog lacks pricing/capabilities/max-output/reasoning | endpoint returns only the 7 fields above | live catalog; recon notes | [VERIFIED] |
| Reasoning efforts | per-model sets, global levels `low\|medium\|high\|xhigh\|max` | CLI bundle registry + bundled `models.md`; docs `/docs/reference/cli/models` | [VERIFIED] |
| Env var (primary) | `COMMAND_CODE_API_KEY` (trimmed, non-empty, **takes precedence over auth.json**) | CLI bundle `Io="COMMAND_CODE_API_KEY"` + `getCommandApiKeyFromEnv`; docs `/docs/settings`, `/docs/studio` | [VERIFIED] |
| Env aliases accepted by bridges | `COMMANDCODE_API_KEY`, `CMD_API_KEY` | `yelixir-dev/commandcode-bridge` `src/auth.ts` | [CORROBORATED] |
| CLI credential file | `~/.commandcode/auth.json`, mode `0600`, `{apiKey,userId,userName,keyName,authenticatedAt}` (no refresh token, no expiry) | CLI bundle `storeCommandAuthCredentials`; Khip01 bridge; docs `/docs/reference/cli` | [VERIFIED] |
| Key format / reuse | Studio key `user_…`; **same key** for `/provider/v1` and `/alpha/*`; no separate session token | docs `/docs/provider` ("same key authenticates the CLI and the API"); yelixir `docs/KNOW_HOW.md`; Khip01 | [VERIFIED] |
| Login flow | browser loopback: `https://commandcode.ai/studio/auth/cli?callback=http://localhost:<5959-5968>/callback&state=<base64url>`; Studio POSTs `{apiKey,state,userId,userName,keyName}`; 120 s timeout; state-checked | CLI bundle `buildCommandAuthUrl`/`isCommandAuthCallbackRequest`; bridges | [VERIFIED] |
| Manual login fallback | paste key → validate `GET /alpha/whoami` (401 ⇒ invalid) | CLI bundle `validateCommandApiKey` | [VERIFIED] |
| No device-code/OAuth for Command Code itself | RFC8628 helpers are Copilot-only; PKCE is Anthropic-only | CLI bundle; recon `login-and-bridges` | [VERIFIED] |
| Quota endpoints (host root, **not** under `/provider/v1`) | `GET /alpha/whoami`, `/alpha/billing/credits`, `/alpha/billing/subscriptions`, `/alpha/usage/summary` on `https://api.commandcode.ai` | CLI 1.58.0 consts `lr/cr/dr/ur`; `dsh-commandcode-quota`; yelixir; Khip01 | [VERIFIED] |
| Quota auth headers | `Authorization: Bearer <key>`, `x-command-code-version`, `x-cli-environment: production` | CLI `buildCommandAuthHeaders`; dsh `quota.mjs`; yelixir `headers()` | [CORROBORATED] |
| `credits` response | `{ credits: { monthlyCredits(remaining), purchasedCredits, freeCredits, planId? }, windowLimits: { limited, exceeded, fiveHour:{used,cap,exceeded,resetAt}, weekly:{...} } }` | CLI 1.58.0 `projectUsageView` + `WindowLimitMeter`; Khip01 Dart models; dsh/yelixir fixtures (hand-authored, not captures); verify:C2 **both lenses** | [VERIFIED] |
| `subscriptions` response | `{ success, data: { planId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd } }` | CLI 1.58.0 `fetchUsageData` reads `subscription.data.currentPeriodEnd`; dsh fixtures; verify:C2 **both lenses** | [VERIFIED] |
| `usage/summary` response | `{ totalCount, totalCost, totalCredits, successRate, periodBasis, … }`; `totalCredits` is a real observed field (dsh/Khip01 parsers) but the official CLI 1.58.0 derives spend from `totalCost` — read `totalCredits ?? totalCost` | CLI bundle `projectUsageView`; dsh `quota.mjs`; Khip01 `api_client.dart`; verify:C2 disconfirm (correction) | [VERIFIED] |
| `whoami` response | `{ success, user:{id,name,userName,email?}, org: null\|{id,login,…}, orgLimits? }`; `?limits=1` returns orgLimits | CLI `fetchUsageWhoami`; dsh | [CORROBORATED] |
| Monthly bucket is **derived**, not a `windowLimits` key | `windowLimits` exposes only `fiveHour` and `weekly`; monthly used = `usage.totalCredits ?? usage.totalCost`; remaining = `credits.monthlyCredits`; cap = used + remaining (fallback: plan nominal when the subscription is active); reset = `subscription.data.currentPeriodEnd` | CLI `projectUsageView` (renders only `windowLimits.fiveHour`/`.weekly`); CLI `fetchUsageData`; dsh `quota.mjs`; verify:C2 **both lenses** | [VERIFIED] |
| Plan → nominal monthly credits | `individual-go:10, individual-goat:70, individual-pro:30, individual-pro-v1:80, individual-provider:15, individual-max:150, individual-ultra:300, teams-pro:40` | CLI bundle map `rr`; dsh; docs `/docs/resources/pricing-limits` | [VERIFIED] |
| `resetAt` unit (windowLimits) | epoch **milliseconds**; `0` = idle/not-started ⇒ treat as absent | CLI `WindowLimitMeter` compares to `Date.now()`; Khip01 `fromMillisecondsSinceEpoch`; dsh drops `reset<=0` | [CORROBORATED] |
| `reset` unit (429 error body) | **seconds** (`error.rateLimit.reset`) | CLI `extractResetAtMs` (`1e3*e.reset`) | [VERIFIED] |
| Bucket semantics | `used`/`cap` are **credit-value USD**; percent = used/cap; `credits.monthlyCredits` is **remaining**; `usage.totalCredits` is **used** | dsh README + parsers; docs `/docs/resources/usage-limits` | [VERIFIED] |
| `windowLimits.exceeded` | **string** naming the exceeded window; each bucket's `.exceeded` is a **boolean**; `windowLimits.limited` boolean | dsh fixtures; yelixir parser | [VERIFIED] |
| Plan windows | Go $3/$6, GOAT $14/$35, Pro $16/$40, Max 10× $45/$90, Max 20× $90/$180, Team Pro $12/$24; **Provider plan has no rolling windows** | docs `/docs/resources/usage-limits`, `/docs/resources/pricing-limits` | [VERIFIED] |
| 403 plan gate | `403 upgrade_required` on `/provider/v1` for the Go plan | docs `/docs/provider` error table; yelixir bridge observation | [CORROBORATED] |
| ZDR | header `x-cmd-zdr: 1` (env `CMD_ZDR=1`) | docs `/docs/provider`; `pi-commandcode-provider` | [VERIFIED] |
| pi `/login` auto API-key | extension provider with `apiKey:"$ENV"` gets a synthesized secret-prompt API-key login; stored `auth.json` `{providerId:{type:"api_key",key}}` | `@earendil-works/pi-coding-agent` `dist/core/provider-composer.js:194-207`; `docs/providers.md` | [VERIFIED] |
| pi custom OAuth | `ProviderConfig.oauth = {name, login(callbacks), refreshToken, getApiKey}`; `callbacks.onAuth({url})`, `onPrompt`, `onManualCodeInput`; pi opens the browser and stores `{type:"oauth",refresh,access,expires}` | `dist/core/extensions/types.d.ts:1113-1123`; `docs/custom-provider.md:286-381`; `dist/core/provider-composer.js:146-160` | [VERIFIED] |
| Per-model api/baseUrl override | `ProviderModelConfig` supports `api?`, `baseUrl?` per model | `dist/core/extensions/types.d.ts:1125-1152` | [VERIFIED] |
| `refreshModels` contract | called twice (`allowNetwork:false` then `true`); must never return `[]`; `context.publish({persist:{models,checkedAt}})` | `dist/core/extensions/types.d.ts:1106-1110`; pi-ai `dist/models.d.ts:12-28`; `pi-ollama-cloud/models.ts` | [VERIFIED] |
| Footer status gating template | `isOllamaCloud(ctx) => ctx.model?.provider === "ollama-cloud"`; `ctx.mode !== "tui"` guard; 5-min timer + throttled `agent_end`; `session_shutdown` clears | `pi-ollama-cloud/index.ts` | [VERIFIED] |
| pi-usage adapter registry | hardcoded `KNOWN: Record<string, UsageAdapter>` in `extensions/usage/adapters/index.ts`; resolved by **base** provider id; `config.adapters[id]` (generic) shadows `KNOWN` | pi-usage `adapters/index.ts:26-48` | [VERIFIED] |
| pi-usage active-provider gating | already implemented in `extensions/usage/index.ts` (`updateActiveAccount` → `runPoll` → `updateStatus`); footer is TUI-only; `/usage` dialog fetches **all** configured accounts | pi-usage `extensions/usage/index.ts:82-183`, `ui/dialog.ts:80` | [VERIFIED] |
| pi-usage implicit account | `accountForProvider(providerId)` creates an implicit account for the active provider, so no `usage.json` entry is required for the footer | pi-usage `accounts/registry.ts:46-58` | [VERIFIED] |
| Command Code CLI provider id | `"command-code"` (label "Command Code", shortLabel "cmd") | CLI bundle `EA` map; recon | [VERIFIED] |
| Existing third-party pi extension id | `pi-commandcode-provider@0.7.1` registers id `"commandcode"` | `/tmp/recon-cc-provider/src/runtime.ts:153,196` | [VERIFIED] |
| `pi-commandcode-provider` has **no** footer bar and **no** pi-usage adapter | grep found no `setStatus`/`footer`/`pi-usage` anywhere | recon `existing-provider` | [VERIFIED] |
| Provider plan gating ambiguity | docs say all plans except Go get API access; one bridge observed Go/GOAT/Pro 403 | docs `/docs/provider` vs yelixir README | [ASSUMPTION — resolve with a live key] |
| `whoami` success envelope | top-level `{success,user,org}` on success; CLI reads `.user`/`.org` directly | CLI `fetchUsageWhoami`; dsh fixture | [ASSUMPTION — verify with a real key whether wrapped] |
| Studio API-keys page URL | likely `https://commandcode.ai/<login>/settings/api-keys` (CLI builds `/settings/usage` and `/settings/billing`) | docs `/docs/studio` (path not stated); CLI URL helpers | [ASSUMPTION] |
| `belowThreshold`/`creditThreshold` still live | present in dsh/Khip01, absent from CLI 1.58.0 bundle | dsh fixtures; Khip01; CLI grep count 0 | [ASSUMPTION] |
| Provider API accepts streaming/tools/reasoning | docs describe SSE + usage chunks; no live probe of tool-calling/reasoning yet | docs `/docs/provider` | [ASSUMPTION — probe during implementation] |

### 2.1 Verification log (adversarial, primary sources)

Five load-bearing claims were adversarially verified after this plan was written. Each was checked by two independent lenses: `reproduce` (confirm from primary sources) and `disconfirm` (actively try to falsify). Raw verdicts: `/tmp/cc-verdicts.json`.

| Claim | Subject | reproduce | disconfirm | Net status |
|---|---|---|---|---|
| C1 | Provider API surface: public `GET /provider/v1/models`, `/chat/completions`, Claude-only `/messages`, per-model `api`/`baseUrl` routing | confirmed (0.95) | confirmed (0.95) | **CONFIRMED — both lenses.** Live unauthenticated `curl` returned HTTP 200, `{object:"list",data:[…71…]}`; 55/8/8 `supported_endpoints` split; `/chat/completions` and `/messages` return 401 without a key (routes exist); `POST /provider/v1/nope` returns a not-registered-route error. |
| C2 | Account/quota API at host root `https://api.commandcode.ai/alpha/*` with the same Bearer key; `windowLimits.fiveHour|weekly.{used,cap,resetAt(ms)}`, `credits.monthlyCredits` (remaining), `usage/summary` totals, `subscriptions.data.currentPeriodEnd`; Monthly derived | confirmed (0.95) | confirmed (0.82) | **CONFIRMED — both lenses**, with one wording correction folded in: the official CLI 1.58.0 sources spend from `summary.totalCost`, while `totalCredits` is a real observed field in the dsh/Khip01 parsers — read `totalCredits ?? totalCost`. Bundle constants `lr/cr/dr/ur` and `WindowLimitMeter` (`resetAt` compared to `Date.now()`, i.e. epoch ms) are primary; the literal `"provider/v1"` does not occur in the CLI bundle. |
| C3 | pi-native login: `apiKey:"$COMMAND_CODE_API_KEY"` synthesizes an API-key `/login`; `ProviderConfig.oauth` gives a browser/`onAuth` login | confirmed (0.90) | confirmed (0.97) | **CONFIRMED — both lenses.** End-to-end repro against installed pi stored `{type:"api_key",key}` and `{type:"oauth",refresh,access,expires}` in a temp `auth.json`; no extension-side writes. Refinement: the synthesized API-key login is suppressed only for OAuth-*only* providers, so with `apiKey` set both methods coexist; `oauth` also requires a `baseUrl` (the plan sets one). |
| C4 | One pi-usage adapter file + one `KNOWN` entry suffices; `updateActiveAccount`/`runPoll`/`updateStatus` already gate on `ctx.model?.provider` | **SKIPPED** — the reproduce lens hung and the run was stopped | confirmed (0.85) | **CONFIRMED — SINGLE LENS ONLY (`disconfirm`).** Behavioral repro in `/tmp/ccverify` showed the footer rendering only for `commandcode-cloud` and clearing on `model_select` to another provider, with zero fetch calls when the `KNOWN` entry was removed. The `reproduce` lens is unverified; treat C4 as single-lens confirmed and re-run the missing lens (or a live `/usage` smoke) before relying on it. Secondary notes folded into §7.4: the `/usage` dialog is not active-provider-gated, and a user `usage.json` `adapters["commandcode-cloud"]` entry shadows the specialized adapter. |
| C5 | One provider id can host both wire formats via per-model `api`/`baseUrl`; `refreshModels` never returns `[]` and returns a mutable copy on the restore phase | confirmed (0.86) | confirmed (0.90) | **CONFIRMED — both lenses**, with two wording corrections folded in: "persist only on full success" is this provider's chosen policy, not a pi contract requirement (`publish` doc: "Persistence policy remains provider-owned"); and the mutable-copy requirement is only literal for the readonly `stored` branch — the baked `GENERATED_MODELS` array is already mutable and safely returned by reference. |

**Net result:** of the five critical claims, **four are confirmed by both lenses** (C1, C2, C3, C5) and **C4 is confirmed by a single lens only** (its `reproduce` lens was skipped). No claim was refuted; the only changes are the precision corrections noted here and folded into §3.1, §6.3, §7.4 and §11.4. All other sections rest on `[VERIFIED]` primary-source rows in §2.

---

## 3. Architecture

### 3.1 Provider registration and the OpenAI/Anthropic split

One provider id: **`commandcode-cloud`** (see §3.7 for the naming decision). Register a top-level OpenAI-compatible provider and override per model:

```ts
pi.registerProvider("commandcode-cloud", {
  name: "Command Code",
  baseUrl: "https://api.commandcode.ai/provider/v1",
  apiKey: "$COMMAND_CODE_API_KEY",     // makes pi synthesize the API-key /login
  api: "openai-completions",           // default for non-Claude models
  headers: attributionHeaders(),       // x-command-code-version, x-cli-environment, optional x-cmd-zdr
  models: GENERATED_MODELS,
  refreshModels: refreshCommandCodeCatalog,
  oauth: commandCodeOAuth,             // optional browser + paste login (same provider id)
});
```

Routing rule: a model is Anthropic-wire iff `supported_endpoints` is exactly/only `["/messages"]` (live **public** catalog), falling back to `id.startsWith("claude-")` when the field is missing. In the live 71-model catalog **55** models list `["/chat/completions","/responses"]`, **8** list only `["/chat/completions"]`, and exactly the **8** `claude-*` models list `["/messages"]` (zero counterexamples — verify:C1 both lenses). The catalog `GET https://api.commandcode.ai/provider/v1/models` is public: it requires only `accept: application/json`, no credential:

```ts
const anthropic = endpoints.length === 1 && endpoints[0] === "/messages";
return {
  id, name, input, reasoning, thinkingLevelMap, cost, contextWindow, maxTokens, compat,
  api: anthropic ? "anthropic-messages" : "openai-completions",
  baseUrl: anthropic
    ? "https://api.commandcode.ai/provider"      // pi appends /v1/messages
    : "https://api.commandcode.ai/provider/v1",  // pi appends /chat/completions
};
```

Rationale: `pi-commandcode-provider` needed a *custom api key plus a custom transport router* because it also implemented the legacy `/alpha/generate` fallback. Since `/alpha/generate` is out of v1 scope, pi's native `openai-completions` and `anthropic-messages` streams are sufficient, which avoids the custom-`streamSimple` complexity entirely. `refreshModels` rehydrates each persisted model with its own `api`/`baseUrl` so the split survives persistence.

We do **not** register an `openai-responses` variant in v1: every model that supports `/responses` also supports `/chat/completions`, so `/chat/completions` is the safe common denominator. (Revisit if a model appears that is `/responses`-only — none in the live 71.)

Error mapping (`httpError`-style, reused from pi-ollama-cloud's `utils.ts`):
| Status | Meaning | Message |
|---|---|---|
| 401 | bad/missing key | "Command Code authentication failed — run /login" |
| 403 `upgrade_required` | plan has no Provider API access | "Your Command Code plan does not include Provider API access (Go plan). Upgrade or use the Command Code CLI." |
| 422 `cmd_zdr_no_providers` | ZDR requested, no ZDR upstream | surface the provider message verbatim |
| 429 | rate limited (rolling window) | include the window name and reset from `error.rateLimit` (seconds → ms) |
| 5xx | upstream failure | pass through the provider's message |

### 3.2 Model catalog: live fetch, static metadata merge, baked fallback

Three layers, mirroring `pi-ollama-cloud/models.ts`:

1. **Live catalog** — `GET https://api.commandcode.ai/provider/v1/models` (public, **no credential**: only `accept: application/json`; confirmed HTTP 200 unauthenticated — verify:C1 both lenses). Validate `{object:"list", data:[{id, name, context_length, supported_endpoints}]}` (71 entries live); throw on a non-`list` object or an empty list. Env overrides: `COMMANDCODE_MODELS_URL`, `COMMANDCODE_MODELS_TIMEOUT_MS` (default 10 000 ms).
2. **Static metadata** — `catalog.metadata.ts`, a checked-in snapshot keyed by model id: `{ reasoning: boolean, efforts?: string[], input: ("text"|"image")[], maxOutputTokens: number, cost: ModelCost }`. Sourced from the official CLI bundle model/cost registries + `commandcode.ai/docs/resources/pricing-limits` (generated by `scripts/generate-metadata.ts`, reviewed by hand). Unknown ids degrade to `{reasoning:false, input:["text"], maxOutputTokens: min(context_length, 65536), cost: ZERO}`.
3. **Baked catalog** — `models.generated.ts` (`GENERATED_MODELS: ProviderModelConfig[]`), produced by `scripts/generate-models.ts` = fetch live catalog + merge `catalog.metadata.ts`. Committed so first launch works offline.

`refreshModels(context: RefreshModelsContext)`:
```
fallback = context.stored?.models.length ? [...context.stored.models] : GENERATED_MODELS
if (!context.allowNetwork || context.signal.aborted) return fallback
if (!context.force && stored.checkedAt fresh within REFRESH_COOLDOWN_MS (4h)) return fallback
raw = await fetchCommandCodeModels(context.signal)          // public, no credential needed
models = assembleModels(raw)                                 // merge static metadata
if (models.length === 0) return fallback                     // NEVER persist/return []
persisted = models.map(rehydrate(provider/api/baseUrl))
await context.publish({ persist: { models: persisted, checkedAt: Date.now() } })  // best-effort
return persisted
```
Note: unlike `pi-ollama-cloud`, the catalog is public, so refresh does not depend on a credential. We still honor `allowNetwork` (restore phase must be a pure read).

Thinking/reasoning mapping (`thinking-levels.ts`, adapted): `thinkingLevelMap = {off:"none"/null, minimal, low, medium, high, xhigh, max}` derived from `MODEL_EFFORTS`; OpenAI-compatible models get `compat.supportsReasoningEffort = efforts !== undefined`; Anthropic models set `compat.forceAdaptiveThinking` when `reasoning`. All `compat` booleans explicit; routing objects (`openRouterRouting`, `vercelGatewayRouting`) left `undefined`, never `{}` (pi-ai truthiness-checks them).

`compat` for `openai-completions`: `{ supportsStore: false, supportsDeveloperRole: false, maxTokensField: "max_tokens", supportsReasoningEffort: <per model>, thinkingFormat: "openai", requiresThinkingAsText: false, supportsStrictMode: false, supportsUsageInStreaming: true }` — final values validated by a live smoke request.

### 3.3 Usage data plane (`usage.ts`)

Self-contained module, structurally identical to `pi-ollama-cloud/usage.ts` (fetch → validate shape → format), but the payload/derivation is Command Code's.

- **Base origin:** `https://api.commandcode.ai` (the `/alpha/*` endpoints are at host root, **not** under `/provider/v1`).
- **Request order:** `whoami` (`?limits=1`) → derive `orgId` → `credits?orgId=` and `subscriptions?orgId=` in parallel → `summary?orgId=&since=<currentPeriodStart>` (the `since` call is best-effort).
- **Per-endpoint degradation:** each request is `safeRequest`; a failing section is reported as unavailable, never zeroed, and never blanks the whole line (dsh pattern).
- **Headers:** `Authorization: Bearer <key>`, `x-command-code-version: <COMMAND_CODE_CLI_VERSION>`, `x-cli-environment: production`, `User-Agent: pi-commandcode-cloud/<version>`, plus `x-cmd-zdr: 1` when `CMD_ZDR`/`COMMANDCODE_ZDR` is set.
- **Timeout:** 15 s overall (per-request `fetchJsonWithTimeout`, 10 s default; override `COMMANDCODE_USAGE_TIMEOUT_MS`).

Bucket mapping (see §6 for the exact contract).

### 3.4 Config loading (`config.ts`)

Copy `pi-ollama-cloud/config.ts`, drop `webTools`, rename the file:

- Global: `~/.pi/agent/commandcode-cloud.json`
- Project: `<cwd>/.pi/commandcode-cloud.json`
- Precedence: `DEFAULT_CONFIG < global < project < env`
- Schema: `{ usageStatus: boolean }` (default **false**, opt-in) and `{ usageRefreshMs: number }` (default 300 000). `sanitizeConfig` keeps only type-matching keys; malformed/non-object JSON is ignored; parse errors `console.error` but never throw.
- Env override for the footer: `PI_COMMANDCODE_USAGE_STATUS` (`0/false/no/off/""` ⇒ false, any other non-empty ⇒ true). Mirror `resolveWebToolsEnv`.
- Loaded once per factory invocation; `/new`/`/fork`/`/resume`/`/reload` reset runtime toggles to the file default.

### 3.5 Login UX

Two credential paths, both ending in pi's own `auth.json` under `commandcode-cloud`:

1. **API-key paste (baseline, zero extra code).** `apiKey: "$COMMAND_CODE_API_KEY"` makes pi offer "Sign in with an API key" in `/login` and store `{type:"api_key", key}`. This alone satisfies "credential setup via pi /login".
2. **Browser loopback login (opt-in richness, via `ProviderConfig.oauth`).** `oauth.login(callbacks)`:
   - `callbacks.onSelect` → choose `browser` or `paste`.
   - Browser: start a one-shot `node:http` server on `127.0.0.1` ports 5959–5968, generate a 32-byte base64url `state`, call `callbacks.onAuth({url: "https://commandcode.ai/studio/auth/cli?callback=…&state=…"})` (pi auto-opens the browser), accept exactly one valid `POST /callback` with `{apiKey, state, userId, userName, keyName}` (reject state mismatch with 403, allow only Command Code studio origins), 120 s timeout.
   - Paste: `callbacks.onPrompt({message:"Paste your Command Code API key"})` (or `onManualCodeInput`).
   - Validate with `GET https://api.commandcode.ai/alpha/whoami` (`Authorization: Bearer`) — 401 ⇒ invalid, retry/abort.
   - Return `{refresh: key, access: key, expires: Date.now() + 10y}` (Command Code keys are long-lived static; no refresh exchange). `refreshToken` returns the credentials unchanged; `getApiKey(credentials) => credentials.access`.
   - pi persists `{type:"oauth", refresh, access, expires}` and opens the browser itself; we do not write `auth.json` ourselves.

Runtime key resolution (`getCommandCodeApiKey(ctx)`):
```
ctx.modelRegistry.getApiKeyForProvider("commandcode-cloud")
?? process.env.COMMAND_CODE_API_KEY
?? process.env.COMMANDCODE_API_KEY   // bridge-compat alias
?? process.env.CMD_API_KEY           // bridge-compat alias
?? readInteropAuthJson()             // ~/.commandcode/auth.json → .apiKey   (read-only)
```
`getCommandCodeApiKey` prefers the pi registry so `/login` is authoritative; the CLI file is only a fallback for users who already ran `cmd login`.

Added commands:
| Command | Behavior |
|---|---|
| `/commandcode-usage` | Fetch + `ctx.ui.notify(formatUsage(data), "info")` (manual, always allowed). |
| `/commandcode-usage-status [on\|off]` | Toggle the footer bar; persists nothing (session-scoped), mirrors `/ollama-usage-status`. |
| `/commandcode-status` | Diagnostics: provider id, baseUrl, key source, credential configured?, model count, transport (`provider/v1`), last usage fetch result. |
| `/commandcode-refresh` | Force `refreshModels` (`context.force = true`) and report model count. |

### 3.6 Footer status bar (opt-in, gated)

Copy `pi-ollama-cloud/index.ts`'s structure exactly:
```
const USAGE_STATUS_KEY = "commandcode-usage"
const USAGE_REFRESH_MS = config.usageRefreshMs (default 300000)
const USAGE_FAST_REFRESH_MS = 60000
let usageTimer, usageActive, lastRefreshAt = 0
isCommandCode(ctx) => ctx.model?.provider === "commandcode-cloud"
startUsageStatus(ctx): guard usageActive; guard ctx.mode !== "tui"; refresh immediately; setInterval
refreshUsageStatus(ctx): key? clear : set lastRefreshAt=now BEFORE fetch; success → setStatus(key, formatUsageStatusColored(theme,data)); catch → clear
stopUsageStatus(ctx): clearInterval + setStatus(undefined)
pi.on("session_start")  → if usageStatusEnabled && isCommandCode(ctx) start; else stop
pi.on("model_select")   → start if enabled && isCommandCode else stop
pi.on("agent_end")      → if active && isCommandCode && now-lastRefreshAt >= interval → refresh
pi.on("session_shutdown") → stop
```
Fast-path: when any lane percent is ≥ 85 and < 100, schedule the next refresh at `USAGE_FAST_REFRESH_MS` instead of `USAGE_REFRESH_MS` (dsh's hot-poll behavior, bounded).

Gating semantics (same as pi-ollama-cloud, satisfying the requirement): the status entry is **only** ever set while `ctx.model?.provider === "commandcode-cloud"`; on any other model `model_select` clears it. In non-TUI modes (`json`/`print`/`rpc`) nothing is shown.

### 3.7 Naming decision: provider id `commandcode-cloud`

- `pi-ollama-cloud` (package `pi-ollama-cloud`) registers id `ollama-cloud`, so the sibling convention maps `pi-commandcode-cloud` → **`commandcode-cloud`**.
- It avoids colliding with `pi-commandcode-provider@0.7.1`, which already registers **`commandcode`**; two extensions registering the same id is exactly the collision the prior art had to work around with a `session_start` rebind hack.
- The CLI's own id is `command-code`; that is the CLI's identity, not pi's provider id. Where interop matters we read `COMMAND_CODE_API_KEY` and `~/.commandcode/auth.json`, so CLI parity is preserved at the credential layer.
- The id string is a single constant, `PROVIDER_ID`, used by `registerProvider`, the `isCommandCode` gate, the pi-usage `KNOWN` key, `/login <id>`, and the `auth.json` key. Changing it later is a one-line refactor plus the pi-usage `KNOWN` key — documented in §10.

---

## 4. File and module layout

All new files under `/home/satish/pi-extensions/pi-commandcode-cloud/` (plus two edits inside `pi-usage/`, one root `package.json` edit, and README edits).

| File | Purpose |
|---|---|
| `index.ts` | Extension entrypoint (default export factory): `registerProvider`, commands, opt-in footer bar, event hooks. |
| `config.ts` | `CommandCodeCloudConfig` loader (`usageStatus`, `usageRefreshMs`), global/project/env precedence, `sanitizeConfig`, `resolveUsageStatusToggle`. |
| `usage.ts` | Usage data plane: `fetchCommandCodeUsage`, shape validators, `formatUsage`, `formatUsageStatusColored`, `quotaBar`, `colorSegment`, lane/balance derivation. |
| `usage-types.ts` | `CommandCodeUsage` domain types + plan→nominal-credit map + window/credit parsers (pure, unit-testable). |
| `models.ts` | Catalog fetch (`fetchCommandCodeModels`), `assembleModels`, `apiForModel`, `baseUrlForModel`, `refreshCommandCodeCatalog`, `buildCompat`, rehydrate. |
| `catalog.metadata.ts` | Checked-in static per-model metadata (reasoning, efforts, input modalities, maxOutputTokens, cost, pricing-verified date). |
| `models.generated.ts` | Baked fallback `GENERATED_MODELS` (generated; do not hand-edit). |
| `pricing.generated.ts` | `MODEL_COSTS: Record<string, ModelCost>` + `PRICING_LAST_VERIFIED` (generated from `catalog.metadata.ts`). |
| `thinking-levels.ts` | `ThinkingLevelMap` resolution + effort metadata per model. |
| `oauth.ts` | `commandCodeOAuth: ExtensionOAuthConfig` (browser/paste login), `validateCommandCodeKey`, `readInteropAuthJson`. |
| `auth-server.ts` | One-shot loopback HTTP server (ports 5959–5968), state generation/check, CORS allowlist, 120 s timeout, 10 KB body cap. |
| `utils.ts` | `fetchJsonWithTimeout`, `httpError`, `getCommandCodeApiKey`, `envInt`, `concurrentMap`, `attributionHeaders`. |
| `constants.ts` | `PROVIDER_ID`, `API_BASE`, `PROVIDER_API_BASE`, env var names, timeouts, `COMMAND_CODE_CLI_VERSION`. |
| `package.json` | `name: "@assid2/pi-commandcode-cloud"`, `pi.extensions: ["./index.ts"]`, peer deps (optional, `"*"`), scripts (`check`, `test`, `generate-models`, `generate-metadata`). |
| `tsconfig.json` | `erasableSyntaxOnly`, `allowImportingTsExtensions`, Node ≥22.19, no emit (mirrors pi-usage). |
| `README.md` | Setup (get key, `/login`, env), commands, config, footer, pi-usage wiring, troubleshooting (403/plan, 401). |
| `CHANGELOG.md` | Keep-a-changelog; `0.1.0` first release. |
| `scripts/generate-models.ts` | Fetch live catalog + merge metadata → `models.generated.ts` (format via biome). |
| `scripts/generate-metadata.ts` | Emit `catalog.metadata.ts` / `pricing.generated.ts` from the checked-in CLI-snapshot source table. |
| `tests/*.test.ts` | Node 22 native type-stripping tests (`node --test "tests/*.test.ts"`), network-free (injected `fetchFn`). |

`pi-usage/` edits:
| File | Change |
|---|---|
| `pi-usage/extensions/usage/adapters/commandcode-cloud.ts` | **New.** `commandCodeCloudAdapter: UsageAdapter`, `parseCommandCodeUsage(payloads)`. |
| `pi-usage/extensions/usage/adapters/index.ts` | Import + one `KNOWN` entry `"commandcode-cloud": commandCodeCloudAdapter`. |
| `pi-usage/tests/adapters-commandcode-cloud.test.ts` | **New.** Fixture-driven parser + adapter tests. |
| `pi-usage/docs/providers.md` | Endpoint table row + response-shape section. |
| `pi-usage/README.md` | Provider table row + changelog note. |
| `pi-usage/CHANGELOG.md` | New entry. |

Monorepo edits:
| File | Change |
|---|---|
| `/home/satish/pi-extensions/package.json` | Add `"pi-commandcode-cloud/index.ts"` to `pi.extensions`. |
| `/home/satish/pi-extensions/README.md` | Contents-table row + provider/feature mention. |
| `/home/satish/pi-extensions/deployment.json` | Version bump only when tagging a release (see §9). |

---

## 5. Login design

### 5.1 How the user gets a key
1. Sign in at `https://commandcode.ai` → Studio → API keys page → "Generate API key". The key is `user_…` and works for **both** the Provider API and the `/alpha/*` account API.
2. Alternative: run the official `cmd login` CLI, which writes `~/.commandcode/auth.json`. Our extension reads that file (read-only) as a fallback, so existing CLI users need no extra step.
3. CI/headless: `export COMMAND_CODE_API_KEY=…`.

### 5.2 How it is stored in pi `auth.json`
- API-key path: `~/.pi/agent/auth.json` → `{"commandcode-cloud": {"type": "api_key", "key": "user_…"}}` (pi writes it; mode 0600).
- OAuth path: `{"commandcode-cloud": {"type": "oauth", "refresh": "user_…", "access": "user_…", "expires": <now+10y>}}`. Command Code has no real refresh exchange, so `refresh === access === key` (this is a deliberate, documented deviation matching `pi-commandcode-provider`'s approach).
- We never write `~/.commandcode/auth.json`. `userId`/`userName`/`keyName` are **not** persisted in pi auth (the shape cannot hold them); if we want them for display we cache them in `~/.pi/agent/commandcode-cloud.json` as an explicitly non-secret `account` block, or simply show them from the live `whoami` call used by `/commandcode-status`.

### 5.3 What `/login` does
With `apiKey: "$COMMAND_CODE_API_KEY"` and `oauth` both set, pi's `/login` lists `commandcode-cloud` with **two** options:
- "Sign in with an API key" → secret prompt → stores the API key (synthesized automatically by pi).
- "Sign in with an account" → runs `oauth.login(callbacks)`: browser loopback flow (pi opens the URL) or manual paste; we validate against `/alpha/whoami`; pi stores the OAuth-shaped credential.

### 5.4 What the extension's commands do
- `/commandcode-status`: reports whether a credential is configured (`ctx.modelRegistry.getProviderAuthStatus(PROVIDER_ID)`), which source it came from, and validates the key live via `/alpha/whoami` when one exists.
- `/commandcode-refresh`: force a catalog refresh.
- No command writes pi's auth store. (Command handlers cannot drive pi's interactive `LoginDialog`; the supported path is the built-in `/login`.)

### 5.5 How the pi-usage adapter reads the same credential
`pi-usage` resolves credentials itself through `ctx.modelRegistry.getProviderAuth(account.id)` (auth.json first, then env) — it never reads our config. Because the pi-usage account id and base id are both `commandcode-cloud` (the provider id we registered), the adapter receives exactly the pi-stored key, with **no** extra wiring. For users who only have `COMMAND_CODE_API_KEY` in the environment (no pi `/login`), pi-usage's env/credential resolution still finds it if the provider is registered; otherwise they can add a `usage.json` account with `"env": "COMMAND_CODE_API_KEY"`.

---

## 6. Usage design

### 6.1 Endpoints
Host root `https://api.commandcode.ai` (**not** `/provider/v1`):

| Purpose | Request |
|---|---|
| Identity + org + org limits | `GET /alpha/whoami?limits=1` |
| Credits + rolling windows | `GET /alpha/billing/credits?orgId=<orgId>` |
| Plan + billing period | `GET /alpha/billing/subscriptions?orgId=<orgId>` |
| Period totals | `GET /alpha/usage/summary?orgId=<orgId>&since=<currentPeriodStart>` |

Headers on every call: `Authorization: Bearer <key>`, `x-command-code-version: <COMMAND_CODE_CLI_VERSION>`, `x-cli-environment: production`, `User-Agent: pi-commandcode-cloud/<version>`, `Accept: application/json`, plus `x-cmd-zdr: 1` when ZDR is requested. If `whoami.org` is `null`, omit the `orgId` query param.

Env overrides: `PI_COMMANDCODE_USAGE_ENDPOINT` (base origin), `COMMANDCODE_USAGE_TIMEOUT_MS`.

### 6.2 Request/response contract
```jsonc
// GET /alpha/whoami?limits=1
{ "success": true,
  "user": { "id": "u_…", "name": "…", "userName": "…", "email": "…" },
  "org": null | { "id": "org_…", "login": "…" },
  "orgLimits": [ { "scope": "model", "model": "…", "spent": 1.2, "limit": 5, "exceeded": false, "resetInterval": "…", "resetAt": 0 } ] }

// GET /alpha/billing/credits?orgId=org_…
{ "credits": { "monthlyCredits": 12.0, "purchasedCredits": 3.0, "freeCredits": 1.0, "planId": "individual-provider" },
  "windowLimits": {
    "limited": false, "exceeded": null,
    "fiveHour": { "used": 2.25, "cap": 3, "exceeded": false, "resetAt": 1786091731770 },
    "weekly":   { "used": 6.24, "cap": 6, "exceeded": true,  "resetAt": 1786603898869 } } }

// GET /alpha/billing/subscriptions?orgId=org_…
{ "success": true, "data": { "planId": "individual-provider", "status": "active",
  "currentPeriodStart": "2026-09-01T00:00:00.000Z", "currentPeriodEnd": "2026-10-01T00:00:00.000Z",
  "cancelAtPeriodEnd": false } }

// GET /alpha/usage/summary?orgId=org_…&since=2026-09-01T00:00:00.000Z
{ "totalCount": 17641, "totalCost": 67.68, "totalCredits": 67.68, "successRate": 100,
  "periodBasis": "billing-period", "totalTokensIn": 0, "totalTokensOut": 0 }

// 401 envelope
{ "success": false, "error": { "code": "UNAUTHORIZED", "status": 401, "message": "Invalid 'Authorization' header or token." } }
```

All parsers are tolerant: numbers may be finite `number`; missing sections are `undefined`, never `0`. An absent/failed section is reported as unavailable.

### 6.3 Bucket mapping (5h / weekly / monthly)

| Lane | Source | Percent | `resetsAt` |
|---|---|---|---|
| `5h` | `windowLimits.fiveHour` | `clamp(used/cap*100, 0, 100)`; `cap<=0` ⇒ lane omitted | `resetAt` epoch ms → ISO; `resetAt<=0` ⇒ omitted |
| `Weekly` | `windowLimits.weekly` | same | same |
| `Monthly` | **derived, not a `windowLimits` key.** `used = usage.totalCredits ?? usage.totalCost` (the official CLI 1.58.0 sources spend from `totalCost`; `totalCredits` is the observed field in the dsh/Khip01 parsers — read `totalCredits` first, fall back to `totalCost`); `remaining = credits.monthlyCredits`; `cap = used + remaining` (fallback: plan nominal from `planId` when `status === "active"`) | `clamp(used/cap*100)`; `cap<=0` ⇒ lane omitted | `subscription.data.currentPeriodEnd` (ISO string) |

**Derived-monthly caveat.** `windowLimits` contains **only** `fiveHour` and `weekly` — the official CLI's `WindowLimitMeter` reads exactly those two and `"monthly"` is not a `windowLimits` key (verify:C2 both lenses). The Monthly lane is therefore synthesized from three different endpoints (`usage/summary` for used, `billing/credits` for remaining, `billing/subscriptions` for reset). Consequences: (a) if `usage/summary` fails, Monthly must be reported **unavailable**, never 0 %; (b) `cap` is an estimate (`used + remaining`) and can drift from the plan's nominal cap; (c) if both `totalCredits` and `totalCost` are missing, fall back to the plan-nominal cap with a clearly-labelled percentage; (d) Provider / pay-as-you-go plans have no rolling windows at all, so Monthly may be the only lane (or absent).

**pi-usage lane keys.** The adapter exposes lanes with these exact keys/labels: `5h` (rolling five-hour window from `windowLimits.fiveHour`), `Weekly` (rolling weekly window from `windowLimits.weekly`), and `Monthly` (the derived billing-period bucket). All three are optional and are omitted when their source is absent — a missing lane is never rendered as `0 %`. Percent is `clamp(used / cap * 100, 0, 100)`; `used` and `cap` are credit-value USD.

- Provider-plan / pay-as-you-go accounts have **no rolling windows** ⇒ lanes may be only `Monthly` (or absent), and the UI must not treat missing windows as 0%.
- Balance entries (pi-usage `MoneyAmount`, and the extension's own formatting):
  - `{ amount: credits.monthlyCredits, unit: "usd", label: "Monthly credits remaining" }`
  - `{ amount: credits.purchasedCredits, unit: "usd", label: "Purchased credits" }`
  - `{ amount: credits.freeCredits, unit: "usd", label: "Free credits" }`
- Spend: `{ unit: "usd", monthly: usage.totalCredits ?? usage.totalCost }`.
- Notice when any bucket `exceeded` or `windowLimits.exceeded` is set: `"weekly limit reached — resets in 2h 41m"` (or the appropriate window).
- `whoami.orgLimits[]` rendered as a secondary notice only (team plans).

### 6.4 Formatting
- `quotaBar(pct)`: 10-cell bar `▕████░░░░░░▏`.
- `colorSegment(theme, label, pct)`: `error` ≥ 80, `warning` ≥ 60, else `success`.
- `formatUsageStatusColored(theme, data)`: joins present segments with a single space, e.g. `▕██░░░░░░░░▏ 5h 22%  ▕██████░░░░▏ Weekly 61%  $12.00 left`.
- `formatUsage(data)`: multi-line plain text for `/commandcode-usage` and `/commandcode-status`, explicitly printing "unavailable" for failed sections.
- Month/`resetsAt` countdown reuses a small `formatResetsIn(nowMs, iso)` helper (`2h 41m`, `4d 3h`).

### 6.5 Refresh cadence, throttling, error handling
- Footer refresh: every `usageRefreshMs` (default **300 000 ms**), immediately on activation, plus a throttled refresh on `agent_end` (same interval gate). Fast path at **60 000 ms** while any lane is `≥ 85%` and `< 100%`.
- `/commandcode-usage` always fetches on demand (manual, no throttle).
- pi-usage adapter is subject to pi-usage's own 2-minute cache and 429 backoff.
- Error handling:
  - No key ⇒ footer cleared silently; `/commandcode-usage` notifies "run /login".
  - 401 ⇒ "authentication failed — run /login"; do not retry on a timer until the next interval.
  - 404 on **all four** endpoints ⇒ "your Command Code plan does not expose the account API (Go plan?)", not a network error (dsh classification).
  - Partial failure ⇒ render the sections that succeeded, mark the others unavailable.
  - Network/timeout ⇒ clear the footer, keep the last value only if pi-usage's `stale` path applies (extension shows nothing rather than a stale lie).
- Opt-in flag: `usageStatus` (default false), file config + `PI_COMMANDCODE_USAGE_STATUS` env + `/commandcode-usage-status` runtime toggle.

---

## 7. pi-usage integration

### 7.1 Adapter file
`pi-usage/extensions/usage/adapters/commandcode-cloud.ts`:

```ts
import { requestJson } from "./http.ts";
import type { AdapterAttempt, AdapterContext, UsageAdapter } from "./types.ts";
import type { MoneyAmount, ProviderUsage, UsageLane } from "../types.ts";

const ORIGIN = "https://api.commandcode.ai";
const ENV_ORIGIN = "PI_COMMANDCODE_USAGE_ENDPOINT";

export function parseCommandCodeUsage(input: {
  whoami?: unknown; credits?: unknown; subscription?: unknown; summary?: unknown;
}): ProviderUsage | null { /* pure parser, tolerant, returns null when nothing parseable */ }

export const commandCodeCloudAdapter: UsageAdapter = {
  id: "commandcode-cloud",
  async fetch(token, ctx: AdapterContext): Promise<AdapterAttempt> {
    const origin = (ctx.env?.[ENV_ORIGIN] ?? "").trim() || ORIGIN;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "x-command-code-version": COMMAND_CODE_CLI_VERSION,
      "x-cli-environment": "production",
      ...ctx.headers,                       // preserve credential headers
      ...(zdr() ? { "x-cmd-zdr": "1" } : {}),
    };
    const whoami = await requestJson(`${origin}/alpha/whoami?limits=1`, { headers }, { fetchFn: ctx.fetchFn, signal: ctx.signal });
    if (!whoami.ok && whoami.status === 401) return { usage: { error: "HTTP 401" }, status: 401 };
    const orgId = pickOrgId(whoami.data);
    const q = orgId ? `?orgId=${encodeURIComponent(orgId)}` : "";
    const [credits, subscription] = await Promise.all([
      requestJson(`${origin}/alpha/billing/credits${q}`, { headers }, { fetchFn: ctx.fetchFn, signal: ctx.signal }),
      requestJson(`${origin}/alpha/billing/subscriptions${q}`, { headers }, { fetchFn: ctx.fetchFn, signal: ctx.signal }),
    ]);
    const since = pickCurrentPeriodStart(subscription.data);
    const summary = await requestJson(`${origin}/alpha/usage/summary${q}${since ? `${q ? "&" : "?"}since=${encodeURIComponent(since)}` : ""}`, { headers }, { fetchFn: ctx.fetchFn, signal: ctx.signal });
    const usage = parseCommandCodeUsage({ whoami: whoami.data, credits: credits.data, subscription: subscription.data, summary: summary.data });
    if (!usage) return { usage: { error: credits.error || "unrecognized response shape" }, status: credits.status ?? undefined };
    return { usage, status: credits.status ?? undefined };
  },
};
```
Constraints honored: adapters must **never throw** (return `{usage:{error}}` + `status`); every network call goes through `requestJson` (so `fetchFn` injection works in tests); a 429 `status` triggers pi-usage's backoff.

### 7.2 Registry entry
`pi-usage/extensions/usage/adapters/index.ts`:
```ts
import { commandCodeCloudAdapter } from "./commandcode-cloud.ts";
// ...
const KNOWN: Record<string, UsageAdapter> = {
  // existing entries…
  "commandcode-cloud": commandCodeCloudAdapter,
};
```
Key must equal the **base** provider id registered by the extension. Gotcha: a user `usage.json` `"adapters": {"commandcode-cloud": {"usageEndpoint": …}}` shadows this specialized adapter — document that.

### 7.3 Account config
No `usage.json` entry is required: pi-usage's `accountForProvider()` implicitly creates an account for the active provider. Document the optional explicit/alias forms:
```json
{ "accounts": [
  { "provider": "commandcode-cloud", "name": "Command Code" },
  { "provider": "commandcode-cloud", "name": "work", "alias": "commandcode-cloud-work", "env": "COMMAND_CODE_API_KEY_WORK" }
] }
```

### 7.4 Active-provider gating
**No pi-usage gating edits are needed.** Gating already lives in `pi-usage/extensions/usage/index.ts` (`updateActiveAccount` ← `ctx.model?.provider`, `runPoll` fetches only the active account, `updateStatus` renders only that account, TUI-only). Adding the adapter + `KNOWN` entry means Command Code usage appears in the pi-usage footer **only when a `commandcode-cloud` model is active**. This is exactly the required behavior and matches the extension's own gate. (The `/usage` dialog deliberately lists all configured accounts and marks the active one with ✓ — documented, not a bug; note it is *not* active-provider-gated, and once an implicit `commandcode-cloud` account has been active in a session it persists in the registry.) **Verification note:** this claim was confirmed by the `disconfirm` lens only (behavioral repro in `/tmp/ccverify`); the `reproduce` lens was skipped (hung agent) — see §2.1. Re-run the missing lens or a live `/usage` smoke as part of gates G2/G3.

### 7.5 Docs
Add to `pi-usage/docs/providers.md`: table row `| commandcode-cloud | https://api.commandcode.ai/alpha/* | PI_COMMANDCODE_USAGE_ENDPOINT |` + a response-shape section with the fixtures. Update `README.md` provider table and `CHANGELOG.md`.

---

## 8. Testing strategy

Toolchain: Node ≥ 22.19 native TS type-stripping, explicit `.ts` import specifiers, `erasableSyntaxOnly` (no enums/namespaces/parameter properties), network-free tests with injected `fetchFn`. Commands: `npm run check` (`tsc`/`tsgo --noEmit` + `node --test "tests/*.test.ts"`), plus biome format/lint.

### Unit tests (extension, `pi-commandcode-cloud/tests/`)
| Test | What it pins |
|---|---|
| `models.test.ts` | `apiForModel`/`baseUrlForModel` split (claude → anthropic + stripped `/v1`); catalog parse accepts `object:"list"` + `supported_endpoints`; rejects non-list/empty; metadata merge for known + unknown ids; maxTokens clamp. |
| `refresh.test.ts` | `refreshModels` returns stored → generated fallback; never `[]`; honors `allowNetwork:false`; persists only on success; rehydrates `provider`/`api`/`baseUrl`. |
| `usage-parse.test.ts` | Bucket mapping from recorded fixtures: 5h/weekly/monthly derivation, `resetAt<=0` omitted, `used`+`remaining` → cap, plan-nominal fallback, exceeded string vs boolean, missing sections (Provider plan, no windows), 401 envelope. |
| `usage-fetch.test.ts` | Request order/URLs/headers (`orgId`, `since`), per-endpoint degradation, timeout, ZDR header. |
| `auth.test.ts` | `readInteropAuthJson` accepts `{apiKey}`, aliases; env precedence; `getCommandCodeApiKey` prefers registry; placeholder values (`$COMMAND_CODE_API_KEY`) are never treated as a real key. |
| `oauth.test.ts` | Login URL construction (state, callback, port range, allowlist), callback state mismatch ⇒ 403/no credential, 120 s timeout, manual paste validation (200/401). |
| `config.test.ts` | Precedence global < project < env; `sanitizeConfig` drops unknown/wrong-typed keys; malformed JSON ignored; `usageStatus` default false; `resolveUsageStatusToggle`. |
| `gating.test.ts` | `isCommandCode` true only for the provider id; toggle resolution; `startUsageStatus` early-returns when `mode!=="tui"`. |
| `format.test.ts` | `quotaBar` length/edges 0/100/clamped; color thresholds 60/80; `formatUsageStatusColored` joins only present lanes; countdown formatting. |

### Recorded fixtures (`tests/fixtures/`)
- `models.json` — a trimmed live `/provider/v1/models` response (public, no key needed).
- `whoami.json`, `credits.json`, `subscriptions.json`, `summary.json` — the dsh/yelixir live-shaped payloads (already documented in recon), redacted.
- `unauthorized.json` — the `{success:false,error:{code:"UNAUTHORIZED",...}}` 401 envelope.
- `credits-provider-plan.json` — no `windowLimits`.

### pi-usage tests (`pi-usage/tests/adapters-commandcode-cloud.test.ts`)
Mirror `adapters-ollama-cloud.test.ts`: `fakeFetch` per URL, assert lane labels/percentages/resetsAt ISO, balance amounts, spend.monthly, error passthrough + `status` on 401, multi-request sequence, and `parseCommandCodeUsage` null on garbage. Also assert the adapter appears in `resolveAdapter("commandcode-cloud", emptyConfig)`.

### Typecheck / lint
- `pi-commandcode-cloud`: `npm run check` (typecheck + tests) and biome (`check`, `format`).
- `pi-usage`: `npm run check`.
- Root: no change to root scripts; verify `pi.extensions` entry parses.

### Live smoke commands (manual, not CI)
```bash
# load only this extension against a throwaway agent dir
PI_CODING_AGENT_DIR=/tmp/cc-smoke pi --no-extensions --no-skills --no-context-files \
  -e /home/satish/pi-extensions/pi-commandcode-cloud/index.ts

# verify provider registration + catalog (public, no key)
PI_CODING_AGENT_DIR=/tmp/cc-smoke pi --no-extensions \
  -e ./index.ts -p "/commandcode-status"

# with a real key in env
COMMAND_CODE_API_KEY=user_… PI_CODING_AGENT_DIR=/tmp/cc-smoke pi --no-extensions \
  -e ./index.ts -p "/commandcode-usage"

# real completion through the registered provider (non-stream + stream, one OpenAI model, one Claude model)
COMMAND_CODE_API_KEY=user_… pi --no-extensions -e ./index.ts \
  --model commandcode-cloud/deepseek-v4.1-flash -p "say hi"
COMMAND_CODE_API_KEY=user_… pi --no-extensions -e ./index.ts \
  --model commandcode-cloud/claude-sonnet-5 -p "say hi"
```
`PI_OFFLINE=1` and `PI_CODING_AGENT_DIR` isolate auth.json/models-store during smoke runs. The live smoke is the only place the remaining [ASSUMPTION] rows in §2 (plan gating, `whoami` envelope, streaming/tools/reasoning) can be settled; results are recorded in the PR description and folded back into the fixtures. (`resetAt` units are no longer an assumption: verify:C2 confirms epoch ms in `windowLimits` and seconds only in the 429 `error.rateLimit.reset`.)

---

## 9. Monorepo / deploy integration

### 9.1 Package manifest
`pi-commandcode-cloud/package.json`:
```json
{
  "name": "@assid2/pi-commandcode-cloud",
  "version": "0.1.0",
  "type": "module",
  "keywords": ["pi-package", "pi", "extension", "provider", "commandcode", "usage"],
  "engines": { "node": ">=22.19.0" },
  "peerDependencies": {
    "@earendil-works/pi-ai": "*",
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*"
  },
  "peerDependenciesMeta": {
    "@earendil-works/pi-ai": { "optional": true },
    "@earendil-works/pi-coding-agent": { "optional": true },
    "@earendil-works/pi-tui": { "optional": true }
  },
  "pi": { "extensions": ["./index.ts"] },
  "files": ["index.ts", "*.ts", "README.md", "CHANGELOG.md", "LICENSE"],
  "scripts": {
    "typecheck": "tsgo --noEmit",
    "test": "node --test \"tests/*.test.ts\"",
    "check": "npm run typecheck && npm test",
    "generate-models": "tsx scripts/generate-models.ts",
    "generate-metadata": "tsx scripts/generate-metadata.ts"
  }
}
```
No runtime dependencies (matching `pi-commandcode-provider`, which has zero). Peer deps optional `"*"` so pi supplies them.

### 9.2 Root `package.json` `"pi"` entry
```json
"pi": {
  "extensions": [
    "pi-usage/extensions/usage/index.ts",
    "pi-dynamic-workflows/dist/pi-extension.js",
    "pi-commandcode-cloud/index.ts"     // NEW
  ],
  "skills": [ /* unchanged */ ]
}
```
This is how the in-repo subpackage ships: the repo's own package is installed (`deployment.json` first entry, self-pinned), and pi loads every declared extension. No separate install step.

### 9.3 `deployment.json`
`deployment.json` lists packages, not in-repo file paths. Because `pi-commandcode-cloud` ships inside the self-pinned repo, **no new deployment.json entry is required**. Only the `version` field changes on release. (Optional future: publish `@assid2/pi-commandcode-cloud` to npm and add an unpinned `npm:` entry for independent versioning — not v1.)

### 9.4 README
- Contents table: add `| pi-commandcode-cloud/ | @assid2/pi-commandcode-cloud — Command Code model provider (OpenAI/Anthropic-compatible) with /login, opt-in usage footer, and a pi-usage adapter |`.
- Provider/feature section: mention `/login commandcode-cloud`, `usageStatus` opt-in, helper commands, and the pi-usage adapter id.

### 9.5 apply.sh implications
None. `apply.sh` converges only through `pi install/remove/update` and only touches the `packages` key; the new extension is delivered by the repo self-pin, so `apply.sh` needs no modification. Existing installs at `v1.1.0` must update the repo pin to receive it (documented release flow below).

### 9.6 Version / tag strategy
Follow the repo's documented flow (README "Bringing a machine up to the current deployment" / release section):
1. Land all changes on `main`; commit `pi-commandcode-cloud/`, the two pi-usage edits, root `package.json`, README, docs.
2. In the release commit, bump `deployment.json` `version` (e.g. `v1.1.0` → `v1.2.0`) and the self-pin ref to match.
3. `git tag v1.2.0 && git push origin main v1.2.0`.
4. Third-party entries stay unpinned.
Extension's own `version` starts at `0.1.0` and is independent of the stack tag.

---

## 10. Open questions and resolution plan

| # | Question / risk | How it will be resolved | Fallback if unresolvable |
|---|---|---|---|
| R1 | **Plan gating:** does a given account get Provider API access, and does Go really 403? | Live smoke (`-p "say hi"` on an OpenAI model) with the target key; record status/body. | Keep native streams; map 403 to a clear message. If the account is Go-plan-only, add a documented "use `cmd` CLI or upgrade" path and schedule `/alpha/generate` fallback as v0.2 (separate transport module — isolated so it doesn't perturb v1). |
| R2 | `/alpha/*` is **undocumented** and may change without notice. | Encapsulate all endpoint knowledge in `usage-types.ts` + the pi-usage adapter parser; per-endpoint degradation everywhere; snapshot fixtures. | Ship a `usage.json` generic-adapter recommendation / session-usage-only fallback (pi-usage's `fallbackAdapter` still shows agent tokens). |
| R3 | `resetAt` unit (ms vs s) and `resetAt: 0` semantics. | **RESOLVED by verify:C2 (both lenses):** `windowLimits.*.resetAt` is epoch **milliseconds** (CLI `WindowLimitMeter` compares/subtracts against `Date.now()`); the 429 body's `error.rateLimit.reset` is **seconds** (`extractResetAtMs` multiplies by `1e3`); `resetAt <= 0` means idle/not-started and is omitted. Pin with a unit test; no live key required. | Normalize defensively: values `< 10^11` treated as seconds; `<=0` omitted; document. |
| R4 | `whoami` envelope (`{success,user,org}` vs top-level). | Live `/commandcode-status` with a real key. | Parser accepts both wrapped and unwrapped shapes (already planned). |
| R5 | Provider id naming (`commandcode-cloud` vs `command-code` vs `commandcode`). | Architecture decision in §3.7; verify no collision at runtime by checking `ctx.modelRegistry.getRegisteredProviderIds()`. | One-constant rename + one `KNOWN` key; the pi-usage adapter id and `usage.json` docs are the only other touch points. |
| R6 | Reasoning/tool-calling/streaming compat flags are guessed. | Live completion with a reasoning model + a tool call; compare with `pi-commandcode-provider`'s proven `compat` block. | Start from `pi-commandcode-provider`'s verified `compat` values (it shipped against this API), then relax flags only with evidence. |
| R7 | Live catalog has no pricing/max-output/effort metadata; model set drifts (71 live vs 75 docs). | `catalog.metadata.ts` regenerated from the official CLI registry snapshot + docs pricing table; unknown ids degrade to text-only/zero-cost. | Unknown models still register and work; README states Command Code's usage page is authoritative for cost. |
| R8 | `pi-usage` has no runtime adapter-registration API. | Accept a source-level edit to the pi-usage package (this plan does exactly that). | Document the `usage.json` generic-adapter snippet as a no-code stopgap; the extension's own footer still works with zero pi-usage changes. |
| R9 | Browser login callback security/UX (loopback + state). | Mirror the CLI exactly: `127.0.0.1` only, one-shot, state-checked, origin allowlist, 120 s timeout, 10 KB cap; validate key with `/alpha/whoami` before returning. | API-key paste path always available; browser flow is additive. |
| R10 | `belowThreshold`/`creditThreshold`, `orgLimits` shape. | Treat as optional-only; `orgLimits` rendered as a notice when present. | Ignore entirely. |
| R11 | Usage polling etiquette on an undocumented API. | Base 5 min; 60 s fast path only when a lane ≥ 85 %; pi-usage's own 2-min cache + 429 backoff. | Raise base interval via `usageRefreshMs` config. |

---

## 11. Orchestrator implementation workflow

Designed to be launched directly with the pi dynamic-workflows `agent()` / `parallel()` / `pipeline()` primitives. Agents are named by role; each has an **exclusive file ownership boundary** (no two writers touch the same file).

### 11.0 Agent roster and ownership

| Agent | Owns (exclusive write) | Depends on |
|---|---|---|
| `cc-scaffold` | `pi-commandcode-cloud/package.json`, `tsconfig.json`, `constants.ts`, `utils.ts`, `.gitignore` | — |
| `cc-models` | `models.ts`, `catalog.metadata.ts`, `models.generated.ts`, `pricing.generated.ts`, `thinking-levels.ts`, `scripts/generate-*.ts` | `cc-scaffold` (constants/utils) |
| `cc-usage` | `usage.ts`, `usage-types.ts` | `cc-scaffold` |
| `cc-login` | `oauth.ts`, `auth-server.ts` | `cc-scaffold` |
| `cc-runtime` | `index.ts`, `config.ts` | `cc-models`, `cc-usage`, `cc-login` (interfaces frozen at B1) |
| `usage-adapter` | `pi-usage/extensions/usage/adapters/commandcode-cloud.ts`, `pi-usage/extensions/usage/adapters/index.ts`, `pi-usage/tests/adapters-commandcode-cloud.test.ts`, `pi-usage/docs/providers.md`, `pi-usage/README.md`, `pi-usage/CHANGELOG.md` | `cc-usage` (shared parse contract) |
| `cc-tests` | `pi-commandcode-cloud/tests/**`, `pi-commandcode-cloud/tests/fixtures/**` | interfaces frozen at B1 |
| `monorepo-docs` | root `package.json`, root `README.md`, `deployment.json`, `pi-commandcode-cloud/README.md`, `CHANGELOG.md` | — |
| `cc-verify` | none (read-only; writes a report to the shared store) | all |

`cc-verify` is a separate verifier per gate; it never edits code.

### 11.1 Phases, fan-out, barriers

```
PHASE 0 — recon lock-in (1 agent, short)
  agent('cc-scaffold'): create dirs, constants (PROVIDER_ID, API_BASE, env names, timeouts),
  utils (fetchJsonWithTimeout, httpError, getCommandCodeApiKey, envInt, attributionHeaders),
  package.json + tsconfig. Run `node --test` on an empty test glob to prove the runner works.
  BARRIER B0: constants/utils/package.json exist and typecheck.

PHASE 1 — parallel core modules (fan-out = 4)
  parallel(
    agent('cc-models'),    // catalog + metadata + thinking-levels + generators
    agent('cc-usage'),     // usage data plane + pure parsers
    agent('cc-login'),     // oauth + loopback server
    agent('usage-adapter') // pi-usage adapter + KNOWN edit + its tests + docs
  )
  Barrier B1 (interface freeze): each agent writes its module's PUBLIC EXPORT SIGNATURES into
  the shared store key `cc.interfaces`. No further signature changes without a verifier note.
  GATE G1: `tsgo --noEmit` in pi-commandcode-cloud AND `npm run check` in pi-usage.

PHASE 2 — runtime wiring (1 agent, after B1)
  agent('cc-runtime'): index.ts (registerProvider, commands, footer gating, event hooks) + config.ts,
  against the frozen interfaces.

PHASE 3 — parallel tests + docs (fan-out = 2) — starts at B1, overlaps Phase 2
  parallel(
    agent('cc-tests'),      // unit tests + recorded fixtures for all modules incl. runtime gating
    agent('monorepo-docs')  // root package.json pi.extensions, root README, extension README/CHANGELOG
  )
  GATE G2: full `npm run check` (extension + pi-usage) green, biome clean.

PHASE 4 — verification (fan-out = 3 verifiers, read-only)
  parallel(
    agent('cc-verify', role=adversarial-review),   // try to falsify §11.4 critical claims against
                                                   // source + fixtures; look for false success claims
    agent('cc-verify', role=code-review),          // contract conformance: gating, never-throw adapters,
                                                   // refreshModels-never-[], error mapping, no stray writes
    agent('cc-verify', role=live-smoke, optional), // if a real COMMAND_CODE_API_KEY exists in env:
                                                   // run the §8 live smoke commands and record raw output;
                                                   // otherwise record SKIPPED with reason (never fake it)
  )
  GATE G3 (final acceptance): all verifiers report PASS or explicitly-scoped non-blocking findings.

PHASE 5 — integration handoff (1 agent, optional)
  agent('monorepo-docs'): apply gate-G3 fixes limited to owned files; produce the release commit
  message and the tag steps from §9.6. No push without human approval.
```

### 11.2 Dependencies and barriers (explicit)
- `B0 → Phase 1`: nothing may be written before constants exist.
- `Phase 1 → B1`: `cc-models`/`cc-usage`/`cc-login`/`usage-adapter` are independent by file; the only shared contract is `constants.ts`/`utils.ts` (owned by `cc-scaffold`, frozen at B0) plus the **usage parse contract** which `cc-usage` publishes to the store at B1 and `usage-adapter` consumes. `usage-adapter` may start immediately using the `usage-types.ts` shapes defined in this plan; it re-reads them at B1.
- `B1 → Phase 2`: `cc-runtime` needs the model assembly function, the usage formatter, and the oauth config type.
- `Phase 2 ∥ Phase 3`: tests are written against frozen interfaces, so they run in parallel with wiring; `cc-tests` owns `tests/**` exclusively (including the gating tests) so it never conflicts with `cc-runtime`.
- `G2 → Phase 4`: no verification before the full test suite is green.
- `G3 → Phase 5`: only docs/release assembly after verification.

### 11.3 Verification gates (must be evidence-backed)
| Gate | Command / check | Pass criterion |
|---|---|---|
| G1 | `cd pi-commandcode-cloud && npx tsgo --noEmit` ; `cd pi-usage && npm run typecheck` | zero errors |
| G2 | `cd pi-commandcode-cloud && npm run check` ; `cd pi-usage && npm test` ; `npx biome check .` | all tests pass; no lint errors |
| G3a | static grep assertions | no `setStatus` outside `isCommandCode` gate; adapter has no `throw`; `refreshModels` has no `return []`; no writes to `~/.commandcode/auth.json`; `KNOWN` has the entry |
| G3b | fixture assertions | 5h/weekly/monthly percentages and ISO `resetsAt` match recorded fixtures; Provider-plan fixture yields Monthly-only; 401 fixture yields error + status 401 |
| G3c | live smoke (conditional) | both an OpenAI-wire and a Claude-wire model complete a request; `/commandcode-usage` prints real numbers; recorded raw output in the report — `SKIPPED` allowed only with an explicit reason |
| G3d | deploy dry-run | `deploy/apply.sh --dry-run` still parses `deployment.json`; root `package.json` `pi.extensions` includes the new entrypoint |
| G3e | C4 single-lens re-check | re-run the skipped `reproduce` lens for C4 (pi-usage gating) **or** perform a live `/usage` smoke; record raw output | footer renders only for an active `commandcode-cloud` model and clears on provider switch; if this cannot be shown, C4 remains *single-lens confirmed* and the limitation is stated in the release notes |

### 11.4 Load-bearing claims to verify before/while implementing (critical claims)

1. **C1 — Provider API surface & routing.** `GET https://api.commandcode.ai/provider/v1/models` is public (no auth; `accept: application/json` only) and returns `{object:"list",data:[{id,name,context_length,supported_endpoints}]}` with 71 entries (55 `["/chat/completions","/responses"]`, 8 `["/chat/completions"]`, exactly 8 `claude-*` `["/messages"]`-only); chat goes to `POST /provider/v1/chat/completions` and Claude models only to `POST /provider/v1/messages`.
   *Basis:* live unauthenticated fetch in recon (`/tmp/cc/live_models.json`, HTTP 200), official docs `/docs/provider`, CLI bundle endpoint constants, and verify:C1 **both lenses** (confirmed). *Falsify by:* `curl` the models endpoint and issue one request per wire.
2. **C2 — Account/quota API.** The four `GET /alpha/{whoami,billing/credits,billing/subscriptions,usage/summary}` endpoints live at the **host root** on `https://api.commandcode.ai`, use the **same Bearer key** as `/provider/v1`, and expose `windowLimits.fiveHour|weekly.{used,cap,resetAt(ms)}` + `credits.monthlyCredits` (remaining) + `usage/summary` totals + `subscriptions.data.currentPeriodEnd`. Monthly is **derived, not a `windowLimits` key**; read used as `usage.totalCredits ?? usage.totalCost` (the official CLI uses `totalCost`; `totalCredits` is the observed field in the bridges).
   *Basis:* official CLI 1.58.0 bundle constants (`lr`/`cr`/`dr`/`ur`) and `WindowLimitMeter`, `dsh-commandcode-quota`, `yelixir` + `Khip01` bridges, and verify:C2 **both lenses** (confirmed; corrections folded in). *Falsify by:* one live authed call; confirm units and envelope.
3. **C3 — pi login integration.** Setting `apiKey:"$COMMAND_CODE_API_KEY"` makes pi synthesize an API-key `/login` that stores `{providerId:{type:"api_key",key}}`; adding `ProviderConfig.oauth` gives pi a browser/`onAuth` login path persisted as `{type:"oauth",refresh,access,expires}`.
   *Basis:* `pi-coding-agent` `dist/core/provider-composer.js:194-207`, `dist/core/extensions/types.d.ts:1113-1123`, `docs/providers.md`, `docs/custom-provider.md`. *Falsify by:* `/login commandcode-cloud` against an isolated `PI_CODING_AGENT_DIR` and inspect `auth.json`.
4. **C4 — pi-usage integration is a 2-line source edit and its gating already satisfies the requirement.** `resolveAdapter` keys on the **base** provider id via the hardcoded `KNOWN` map; `updateActiveAccount`/`runPoll`/`updateStatus` already render only the active provider's account in the footer. **Verification status: confirmed by the `disconfirm` lens only — the `reproduce` lens was skipped (hung agent, run stopped). Treat as single-lens confirmed; re-run the missing lens or a live `/usage` smoke before relying on it (see §2.1).**
   *Basis:* pi-usage `extensions/usage/adapters/index.ts:26-48`, `extensions/usage/index.ts:82-183`, `accounts/registry.ts:46-58`, and verify:C4 `disconfirm` (behavioral repro: footer renders only for `commandcode-cloud`, clears on provider switch, zero fetches without the `KNOWN` entry). *Falsify by:* add the adapter, run `npm test`, and switch active provider while watching the footer key `@assid2/pi-usage`.
5. **C5 — Per-model api/baseUrl override + refreshModels contract.** A single provider id can route Claude models to `anthropic-messages` (baseUrl without trailing `/v1`) while others use `openai-completions`, and `refreshModels` must never return `[]` and must return a mutable copy of the **readonly `stored`** branch (the baked `GENERATED_MODELS` array is already mutable and may be returned by reference). "Persist only on full success" is this provider's chosen policy, not a pi contract requirement (`publish` doc: "Persistence policy remains provider-owned").
   *Basis:* `pi-coding-agent` `dist/core/extensions/types.d.ts:1106-1160`, pi-ai `dist/models.d.ts:12-28`, `pi-ollama-cloud/models.ts`, `pi-commandcode-provider` `apiForModelId`/`baseUrlForModel`, and verify:C5 **both lenses** (confirmed; wording corrections folded in). *Falsify by:* unit test on `assembleModels` + one live request per wire after a `/model` switch.

### 11.5 Acceptance criteria (definition of done)
1. `pi --no-extensions -e pi-commandcode-cloud/index.ts` registers `commandcode-cloud` and lists live models; unknown-metadata models still register.
2. `/login commandcode-cloud` works via both API-key paste and (where the browser is available) the browser loopback flow; the credential lands in `auth.json` under `commandcode-cloud`.
3. A real completion succeeds for one OpenAI-wire model and one Claude-wire model (or a documented, evidence-backed reason it cannot be tested).
4. The extension footer appears **only** when a `commandcode-cloud` model is active, shows 5h/weekly/monthly quota bars with correct colors, and disappears when switching to another provider; it is opt-in (default off) with a working toggle.
5. `pi-usage` shows the same data via `commandcode-cloud` adapter, gated to the active provider, with green tests; `/usage` dialog lists and ✓-marks it.
6. `npm run check` passes in both packages; `biome check` clean; `deploy/apply.sh --dry-run` succeeds.
7. All [ASSUMPTION] rows in §2 are either confirmed with recorded evidence or explicitly re-scoped with a documented fallback. The C4 `reproduce` lens skipped in §2.1 is re-run (or a live `/usage` smoke substitutes) before that claim is treated as fully verified.
8. No file outside the §4 ownership list is modified.

---

## Appendix A — Evidence index (primary sources)
- `/home/satish/.pi/agent/npm/node_modules/pi-ollama-cloud/{index,config,usage,utils,models}.ts` — provider + footer template.
- `/home/satish/pi-extensions/pi-usage/extensions/usage/{index.ts,adapters/*,accounts/registry.ts,config.ts,types.ts}` — adapter contract + gating + registry.
- `/home/satish/.local/share/pi-node/node-v22.23.2-linux-x64/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/{extensions/types.d.ts,provider-composer.js,model-registry.d.ts}` and `docs/{providers.md,custom-provider.md,packages.md,extensions.md}` — platform contracts.
- Recon artifacts: `/tmp/recon-cc-provider/**`, `/tmp/recon-quota/**`, `/tmp/cc/**` (live models JSON, docs text, CLI bundle), referenced in the workflow recon JSON.

## Appendix B — Deliberate deviations from templates
- No custom `streamSimple`/transport router (v1): we lose the Go-plan `/alpha/generate` fallback but gain simplicity; documented and scheduled.
- No `cache.ts`/`web-tools.ts` (no Command Code web endpoints).
- No `resolveWebToolsEnv`; config key `webTools` dropped.
- `usage.md` data model is USD-credit-window based, not request-fraction based, so lane derivation and balance entries differ from `pi-ollama-cloud`.
- Extension config file renamed `commandcode-cloud.json`; status key `commandcode-usage`.
