/**
 * Shared constants for pi-commandcode-cloud.
 *
 * Every value here is fixed by the implementation plan
 * (`docs/plans/pi-commandcode-cloud.md`, §2/§3/§6/§9). No endpoint or field is
 * invented here: the Provider API lives under `PROVIDER_API_BASE`, the account
 * (quota) API lives at the host root, and the env names mirror the Command Code
 * CLI plus the bridge-compatible aliases.
 */

// --- Provider identity (§3.7) ---

/**
 * pi provider id. Deliberately not `commandcode` (used by the third-party
 * `pi-commandcode-provider` extension) and not `command-code` (the CLI's own
 * identity) to avoid registering the same id twice.
 */
export const PROVIDER_ID = "commandcode-cloud";

/** Human-readable provider label shown by pi. */
export const PROVIDER_NAME = "Command Code";

// --- Wire endpoints (§3.1) ---

/** API origin used by every endpoint (Provider API *and* the `/alpha/*` account API). */
export const API_BASE = "https://api.commandcode.ai";

/** OpenAI-compatible base; pi appends `/chat/completions`. */
export const PROVIDER_API_BASE = `${API_BASE}/provider/v1`;

/**
 * Anthropic base. The trailing `/v1` is intentionally absent so pi's
 * Anthropic SDK appends `/v1/messages` (giving `.../provider/v1/messages`).
 */
export const ANTHROPIC_BASE = `${API_BASE}/provider`;

// --- Account / quota endpoint paths (§6.1), host root, NOT under /provider/v1 ---

export const WHOAMI_PATH = "/alpha/whoami";
export const CREDITS_PATH = "/alpha/billing/credits";
export const SUBSCRIPTIONS_PATH = "/alpha/billing/subscriptions";
export const USAGE_SUMMARY_PATH = "/alpha/usage/summary";

// --- Environment variable names ---

/** Primary API-key env var (takes precedence over `~/.commandcode/auth.json`). */
export const ENV_API_KEY = "COMMAND_CODE_API_KEY";

/** Bridge-compatible API-key aliases, tried in order after {@link ENV_API_KEY}. */
export const ENV_API_KEY_ALIASES = ["COMMANDCODE_API_KEY", "CMD_API_KEY"] as const;

/** Override for the public model-catalog URL. */
export const ENV_MODELS_URL = "COMMANDCODE_MODELS_URL";

/** Override for the account-API origin (defaults to {@link API_BASE}). */
export const ENV_USAGE_ENDPOINT = "PI_COMMANDCODE_USAGE_ENDPOINT";

/** Per-request timeout (ms) for the account API. */
export const ENV_USAGE_TIMEOUT_MS = "COMMANDCODE_USAGE_TIMEOUT_MS";

/** Per-request timeout (ms) for the model catalog. */
export const ENV_MODELS_TIMEOUT_MS = "COMMANDCODE_MODELS_TIMEOUT_MS";

/** Footer status-bar opt-in override (`0/false/no/off/""` => false). */
export const ENV_USAGE_STATUS = "PI_COMMANDCODE_USAGE_STATUS";

/** ZDR opt-in env var (highest precedence). */
export const ENV_ZDR = "CMD_ZDR";

/** ZDR opt-in alias (used when {@link ENV_ZDR} is unset/empty). */
export const ENV_ZDR_ALIAS = "COMMANDCODE_ZDR";

/** Loopback login timeout (ms) env var. */
export const ENV_AUTH_TIMEOUT_MS = "COMMANDCODE_AUTH_TIMEOUT_MS";

/**
 * ZDR precedence: first env name that is set (non-empty) wins.
 * `CMD_ZDR` takes precedence over `COMMANDCODE_ZDR`.
 */
export const ZDR_ENV_PRECEDENCE = [ENV_ZDR, ENV_ZDR_ALIAS] as const;

/**
 * The literal `apiKey` placeholder written into `registerProvider`. Values
 * equal to this string must never be treated as a real credential (pi may
 * surface the unresolved placeholder at runtime).
 */
export const PLACEHOLDER_API_KEY = `$${ENV_API_KEY}`;

/** Prefix of Command Code Studio API keys (`user_…`). */
export const API_KEY_PREFIX = "user_";

// --- Timeouts and refresh cadence (ms) ---

export const MODELS_TIMEOUT_MS = 10_000;
export const USAGE_TIMEOUT_MS = 15_000;
export const USAGE_REFRESH_MS = 300_000;
export const USAGE_FAST_REFRESH_MS = 60_000;
export const REFRESH_COOLDOWN_MS = 4 * 60 * 60 * 1000;
export const AUTH_TIMEOUT_MS = 120_000;

// --- Loopback login (auth-server) ---

/** Inclusive loopback port range tried in order. */
export const AUTH_PORT_START = 5959;
export const AUTH_PORT_END = 5968;

/** Maximum accepted callback body size (bytes). */
export const AUTH_BODY_LIMIT_BYTES = 10 * 1024;

/** Command Code Studio origins allowed to POST the login callback. */
export const AUTH_ALLOWED_ORIGINS = [
  "https://commandcode.ai",
  "https://staging.commandcode.ai",
  "http://localhost:3000",
] as const;

/** Callback path served by the one-shot loopback server. */
export const AUTH_CALLBACK_PATH = "/callback";

/** Studio CLI login page (state is appended by the caller). */
export const AUTH_LOGIN_URL = "https://commandcode.ai/studio/auth/cli";

// --- Model assembly ---

/** Fallback max output tokens when static metadata has none. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 65_536;

// --- Attribution ---

/** Command Code CLI version reported via `x-command-code-version`. */
export const COMMAND_CODE_CLI_VERSION = "1.58.0";

/** CLI environment reported via `x-cli-environment`. */
export const CLI_ENVIRONMENT = "production";

/** User-Agent built by the usage/adapter layers. */
export const USER_AGENT = `pi-commandcode-cloud/0.1.0`;
