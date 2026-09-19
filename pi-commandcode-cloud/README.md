# pi-commandcode-cloud

Command Code ([commandcode.ai](https://commandcode.ai)) as a first-class
[pi](https://pi.dev) model provider.

- **One provider id, both wire formats.** Registers `commandcode-cloud` and
  routes each model to Command Code's OpenAI-compatible
  (`/provider/v1/chat/completions`) or Anthropic-compatible
  (`/provider/v1/messages`) transport based on the live, public model catalog.
- **Native credential path.** `/login commandcode-cloud` offers API-key paste
  and an optional browser loopback login; the key lands in pi's own
  `~/.pi/agent/auth.json`.
- **Quota in two places.** An **opt-in** footer status bar (default off) plus a
  `pi-usage` adapter (`commandcode-cloud`) for the pi-usage footer and `/usage`
  dialog — both gated to the active provider.
- **No runtime dependencies.** Plain ESM TypeScript, loaded directly by pi.

> Command Code's `/alpha/*` account API is **undocumented** and may change.
> Every usage section degrades independently; a failed section is reported as
> unavailable, never as `0`.

## Requirements

- Node.js ≥ 22.19 (pi's own requirement).
- A Command Code account with Provider API access (every plan except Go; see
  [Troubleshooting](#troubleshooting)).
- An API key from **Studio → API keys** (`user_…`). The same key authenticates
  both the Provider API and the account/quota API.

## Install

This package ships inside the
[`pi-extensions`](https://github.com/assid2/pi-extensions) monorepo, so an
install there already loads `pi-commandcode-cloud/index.ts` (declared in the
root `package.json` `pi.extensions` list). To load it directly:

```bash
pi --no-extensions -e /path/to/pi-extensions/pi-commandcode-cloud/index.ts
```

## Sign in

### `/login` (recommended)

```
/login commandcode-cloud
```

pi lists two options:

1. **Sign in with an API key** — paste a `user_…` key. It is stored in pi's
   `auth.json` as `{"commandcode-cloud":{"type":"api_key","key":"…"}}`.
2. **Sign in with an account** — opens the browser at Command Code Studio
   (`https://commandcode.ai/studio/auth/cli?callback=…&state=…`). The extension
   serves a one-shot loopback callback on `127.0.0.1` port 5959–5968, verifies
   the `state`, allows only the Command Code Studio origins, caps the body at
   10 KB, and times out after 120 s (`COMMANDCODE_AUTH_TIMEOUT_MS`). The key is
   validated against `GET /alpha/whoami` before it is stored. You can also pick
   "paste" inside this flow.

Pasted keys are sanitized: bracketed-paste markers (`\x1b[200~` / `\x1b[201~`)
and control characters are stripped, and the literal `$COMMAND_CODE_API_KEY`
placeholder is never treated as a real key.

### Environment

Headless/CI users can export the key instead of running `/login`:

```bash
export COMMAND_CODE_API_KEY=user_…
```

Resolution order (first match wins):

1. pi's credential store for `commandcode-cloud` (`/login`),
2. `COMMAND_CODE_API_KEY`,
3. `COMMANDCODE_API_KEY` (bridge-compatible alias),
4. `CMD_API_KEY` (bridge-compatible alias),
5. read-only `~/.commandcode/auth.json` written by the official `cmd login`
   CLI.

`~/.commandcode/auth.json` is **never modified** by this extension. Users who
already ran `cmd login` need no extra step.

## Commands

| Command | Behavior |
|---|---|
| `/commandcode-usage` | Fetch usage now and print a multi-line report. |
| `/commandcode-usage-status [on\|off]` | Toggle the footer bar for this session (no argument toggles). |
| `/commandcode-status` | Diagnostics: provider id, base URL, credential source, live `/alpha/whoami` check, model count, footer state, last usage result. |
| `/commandcode-refresh` | Force a model-catalog refresh and report the model count. |

`/commandcode-status` is the quickest way to confirm which credential source
was used and whether the key is valid.

## Configuration

Settings are read from JSON files with project-over-global precedence:

- global: `~/.pi/agent/commandcode-cloud.json`
- project: `<cwd>/.pi/commandcode-cloud.json` (takes precedence)

```json
{
  "usageStatus": false,
  "usageRefreshMs": 300000
}
```

| Key | Type | Default | Meaning |
|---|---|---|---|
| `usageStatus` | boolean | `false` | Show the opt-in quota footer while a `commandcode-cloud` model is active. |
| `usageRefreshMs` | number (ms) | `300000` | Footer refresh interval. While any lane is ≥ 85 % and < 100 %, refresh shortens to 60 s, bounded by this value. |

Unknown keys and wrongly-typed values are ignored; malformed JSON is ignored
and defaults apply. Config is read once per extension load — restart pi or
`/reload` after editing. `/new`, `/fork`, `/resume`, and `/reload` reset the
session toggle to the file default.

Environment overrides:

| Variable | Effect |
|---|---|
| `PI_COMMANDCODE_USAGE_STATUS` | `0`/`false`/`no`/`off`/empty ⇒ off; any other value ⇒ on. |
| `PI_COMMANDCODE_USAGE_ENDPOINT` | Override the account-API origin (default `https://api.commandcode.ai`). |
| `COMMANDCODE_MODELS_URL` | Override the public model-catalog URL. |
| `COMMANDCODE_USAGE_TIMEOUT_MS` | Account-API request timeout (default 15 s). |
| `COMMANDCODE_MODELS_TIMEOUT_MS` | Catalog request timeout (default 10 s). |
| `COMMANDCODE_AUTH_TIMEOUT_MS` | Browser-login timeout (default 120 s). |
| `CMD_ZDR` / `COMMANDCODE_ZDR` | Request zero-data-retention (`x-cmd-zdr: 1`). `CMD_ZDR` wins. |

## The quota footer (opt-in)

The footer is **off by default**. Enable it per session with
`/commandcode-usage-status on`, or persistently with `"usageStatus": true` (or
`PI_COMMANDCODE_USAGE_STATUS=1`). It is rendered only in TUI mode and only
while `ctx.model?.provider === "commandcode-cloud"`; switching to another
provider clears it.

```
▕██░░░░░░░░▏ 5h 22%  ▕██████░░░░▏ Weekly 61%  $12.00 left
```

- Bar colors: `success` < 60 %, `warning` ≥ 60 %, `error` ≥ 80 %.
- Missing lanes are omitted, never rendered as `0 %`.

## Models and routing

`GET https://api.commandcode.ai/provider/v1/models` is public (no credential).
The live catalog provides `id`, `name`, `context_length`, and
`supported_endpoints`; static metadata (reasoning, efforts, input modalities,
max output tokens, pricing) is merged from the checked-in
`catalog.metadata.ts`. A baked `GENERATED_MODELS` fallback keeps first launch
working offline.

- A model whose `supported_endpoints` is exactly `["/messages"]` (or, when the
  field is absent, whose id starts with `claude-`) uses `anthropic-messages`
  with a `/v1`-less base URL (`https://api.commandcode.ai/provider`) so pi
  appends `/v1/messages`.
- Everything else uses `openai-completions` against
  `https://api.commandcode.ai/provider/v1`.
- Unknown ids degrade to `{reasoning:false, input:["text"], maxTokens:
  min(context_length, 65536), cost: ZERO}` and still register.
- `maxTokens` is `min(context_length, metadata.maxOutputTokens ?? 65536)`.
- **Model ids may contain `/`** (for example
  `commandcode-cloud/deepseek/deepseek-v4.1-flash`); quote the full id when
  selecting with `--model`, e.g. `/model commandcode-cloud/deepseek/deepseek-v4.1-flash`.

`refreshModels` never returns `[]`: with `allowNetwork:false` it is a pure read
(stored snapshot, else the baked catalog); a fresh list is persisted only on
full success, a partial refresh keeps the last-good list and advances
`checkedAt`, and a rejected `publish()` is logged while the in-memory list is
still returned.

## Usage data

Quota comes from the account API at the **host root** (not `/provider/v1`),
using the same `Bearer` key:

| Purpose | Request |
|---|---|
| Identity + org + org limits | `GET /alpha/whoami?limits=1` |
| Credits + rolling windows | `GET /alpha/billing/credits?orgId=<org>` |
| Plan + billing period | `GET /alpha/billing/subscriptions?orgId=<org>` |
| Period totals | `GET /alpha/usage/summary?orgId=<org>&since=<periodStart>` |

Every call sends `Authorization: Bearer <key>`, `x-command-code-version`,
`x-cli-environment: production`, `User-Agent: pi-commandcode-cloud/0.1.0`, and
`x-cmd-zdr: 1` when ZDR is enabled. `orgId`/`since` are omitted when
unavailable, and each section degrades independently.

Lanes:

| Lane | Source | Notes |
|---|---|---|
| `5h` | `windowLimits.fiveHour` | `used`/`cap` in credit-value USD; `resetAt` is epoch **milliseconds**, omitted when `<= 0`; a `0/0` window is skipped. |
| `Weekly` | `windowLimits.weekly` | same rules. |
| `Monthly` | **derived** | used = `usage.totalCredits ?? usage.totalCost`, remaining = `credits.monthlyCredits`, cap = used + remaining (plan-nominal fallback when active); reset = `subscriptions.data.currentPeriodEnd`. |

Balances are `monthlyCredits` (remaining), `purchasedCredits`, and
`freeCredits`. A 429's `error.rateLimit.reset` is in **seconds** and is
normalized to ms; `windowLimits.resetAt` is already ms. Provider/pay-as-you-go
plans have no rolling windows, so only `Monthly` (or nothing) is shown.

## pi-usage wiring

`pi-usage` ships a specialized adapter registered under the base provider id
`commandcode-cloud`, so once both packages are loaded the same quota appears in
pi-usage's footer and `/usage` dialog with **no configuration**. pi-usage
resolves the credential itself (its own `auth.json`/env lookup), gated to the
active provider.

An explicit account is optional:

```json
{
  "accounts": [
    { "provider": "commandcode-cloud", "name": "Command Code" },
    {
      "provider": "commandcode-cloud",
      "name": "work",
      "alias": "commandcode-cloud-work",
      "env": "COMMAND_CODE_API_KEY_WORK"
    }
  ]
}
```

### `usage.json` generic-adapter stopgap

On a `pi-usage` build that predates the specialized adapter, or if you need to
point at a custom origin without upgrading, add a generic adapter entry. This
**shadows** the built-in specialized adapter (pi-usage prefers
`config.adapters[id]` over its built-in map):

```json
{
  "adapters": {
    "commandcode-cloud": {
      "usageEndpoint": "https://api.commandcode.ai/alpha/billing/credits"
    }
  }
}
```

The generic adapter sends `Authorization: Bearer <key>` and reads a small set
of percentage fields, so it is a fallback only — the extension's own footer
always works with zero pi-usage changes.

## ZDR (zero data retention)

Request ZDR by setting `CMD_ZDR=1` (or `COMMANDCODE_ZDR=1`). The extension
adds `x-cmd-zdr: 1` to both provider and usage requests. If the upstream has no
ZDR-capable provider, Command Code answers `422 cmd_zdr_no_providers`; that
message is surfaced verbatim.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| **401** / "authentication failed — run `/login`" | Missing/expired/invalid key. Run `/login commandcode-cloud`, or check `COMMAND_CODE_API_KEY`. Verify with `/commandcode-status`. |
| **403 `upgrade_required`** | Your Command Code plan has no Provider API access (the Go plan). Upgrade, or use the official `cmd` CLI. The `/alpha/*` quota calls may still work. |
| **429** | A rolling window is exhausted. The message includes the window and reset time (`error.rateLimit.reset` is seconds). Wait for the reset or raise the plan. |
| Usage shows "unavailable" sections | The undocumented `/alpha/*` endpoint changed or a section failed. Other sections still render; retry with `/commandcode-usage`. |
| No footer | It is opt-in: `/commandcode-usage-status on`, or set `usageStatus: true`. It only shows while a `commandcode-cloud` model is active and in TUI mode. |
| Footer shows nothing but `/commandcode-usage` works | You are not on a `commandcode-cloud` model, or pi is running in `json`/`print`/`rpc` mode. |
| Models missing | Run `/commandcode-refresh`; unknown-metadata models still register. Command Code's usage page is authoritative for cost. |

## Security notes

- All error/notify/status text is routed through a redaction helper that strips
  `Bearer` tokens and `user_`/`cc_` keys before display.
- The loopback login server binds `127.0.0.1` only, is one-shot, state-checked
  (a mismatch returns `403`), origin-allowlisted, body-capped, and times out.
- The extension never writes `~/.commandcode/auth.json`.

## Development

```bash
cd pi-commandcode-cloud
npm ci
npm run check        # tsc --noEmit + node --test
npm run lint         # biome check
npm run format       # biome format --write
npm run generate-models     # refresh models.generated.ts from the live catalog
npm run generate-metadata   # regenerate catalog.metadata.ts / pricing.generated.ts
```

Unit tests are network-free: `fetchFn` is injected, and no test ever calls the
real API.
