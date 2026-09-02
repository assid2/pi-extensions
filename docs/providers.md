# Provider usage endpoints

All adapters send `Authorization: Bearer <account key>` unless noted. Every
endpoint can be overridden with an env var; the extension reads them from the
process environment at fetch time.

| Provider | Default endpoint | Env override |
|---|---|---|
| anthropic | `https://api.anthropic.com/api/oauth/usage` (+ header `anthropic-beta: oauth-2025-04-20`) | `PI_CLAUDE_USAGE_ENDPOINT` |
| openai-codex | `https://chatgpt.com/backend-api/wham/usage` | `PI_CODEX_USAGE_ENDPOINT` |
| openrouter | `https://openrouter.ai/api/v1/credits` + `/key` | `PI_OPENROUTER_CREDITS_ENDPOINT`, `PI_OPENROUTER_KEY_ENDPOINT` |
| deepseek | `https://api.deepseek.com/user/balance` | `PI_DEEPSEEK_BALANCE_ENDPOINT` |
| moonshotai | `https://api.moonshot.ai/v1/users/me/balance` | `PI_MOONSHOT_BALANCE_ENDPOINT` |
| moonshotai-cn | `https://api.moonshot.cn/v1/users/me/balance` | `PI_MOONSHOT_CN_BALANCE_ENDPOINT` |
| baseten | `https://api.baseten.co/v1/billing/usage_summary` (start_date = 1st of month, end_date = now) | `PI_BASETEN_USAGE_ENDPOINT` |
| zai | `https://api.z.ai/api/monitor/usage/quota/limit` | `PI_ZAI_USAGE_ENDPOINT` |
| zai-coding-cn | `https://open.bigmodel.cn/api/monitor/usage/quota/limit` | `PI_ZAI_CODING_CN_USAGE_ENDPOINT` |
| kimi-coding | `https://api.kimi.com/coding/v1/usages` (+ `User-Agent: KimiCLI/1.5`) | `PI_KIMI_USAGE_ENDPOINT` |
| minimax | `https://api.minimax.io/v1/token_plan/remains` (+ legacy `/v1/api/openplatform/coding_plan/remains`) | `PI_MINIMAX_USAGE_ENDPOINT`, `PI_MINIMAX_LEGACY_USAGE_ENDPOINT` |
| minimax-cn | `https://api.minimaxi.com/v1/token_plan/remains` (+ legacy) | `PI_MINIMAX_CN_USAGE_ENDPOINT`, `PI_MINIMAX_CN_LEGACY_USAGE_ENDPOINT` |
| ollama-cloud | `https://ollama.com/api/usage` | `PI_OLLAMA_USAGE_ENDPOINT` |
| opencode-go | `https://opencode.ai/zen/go/v1/usage` | `PI_OPENCODE_GO_USAGE_ENDPOINT` |
| opencode | `https://opencode.ai/zen/v1/usage` | `PI_OPENCODE_USAGE_ENDPOINT` |

## Response shapes

### ollama-cloud (`/api/usage`)

```json
{
  "limits": {
    "session": { "usage": 0.42, "models": [{ "name": "qwen3.5:397b", "request_count": 3 }] },
    "weekly":  { "usage": 0.61, "models": [] }
  },
  "activity": { "cost": "$12.34" }
}
```

`usage` is a 0-1 fraction of the plan's REQUEST cap (5-hour and 7-day
windows). `activity.cost` is the 4-week spend string.

### opencode-go (`/zen/go/v1/usage`)

Documented limits (opencode.ai/docs/go): **5-hour $12, weekly $30, monthly
$60**. The authenticated response shape is not publicly documented; the parser
accepts, in order:

1. a `windows`/`limits`/`usage` array with `{ name, limit?, spent|used|amount,
   percent? }` entries;
2. object windows keyed `five_hour`/`weekly`/`monthly` (or camelCase), each a
   number (spent USD) or `{ spent, limit, percent }`;
3. a single total spend.

Where a percent is absent but a dollar amount and a limit are known, the
percent is computed against the documented limits. If you have a real response
that fails to parse, open an issue with a redacted sample.
