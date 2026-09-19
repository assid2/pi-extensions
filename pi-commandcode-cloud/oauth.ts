/**
 * Command Code login for pi's `/login` flow.
 *
 * Exposes `commandCodeOAuth`, the `ProviderConfig["oauth"]` object attached to
 * the `commandcode-cloud` provider registration. Two credential paths are
 * offered (plan §3.5, §5):
 *
 * 1. **Browser loopback** — start the one-shot server from `./auth-server.ts`,
 *    send the user to Studio (`https://commandcode.ai/studio/auth/cli`), and
 *    accept exactly one state-checked `POST /callback`.
 * 2. **API-key paste** — prompt for a Studio key, sanitize it, and validate it
 *    against `GET /alpha/whoami`.
 *
 * Both paths end with the same long-lived credential shape
 * `{ refresh: key, access: key, expires: Date.now() + 10y }`: Command Code keys
 * are static, so there is no refresh exchange. pi itself persists the credential
 * to `auth.json`; this module never writes it (it only *reads* the CLI's
 * `~/.commandcode/auth.json`, re-exported below via `readInteropAuthJson`).
 */

import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import type { ProviderConfig } from "@earendil-works/pi-coding-agent";
import {
  type AuthServer,
  type AuthServerOptions,
  isAuthCallbackError,
  isAuthTimeoutError,
  startAuthServer,
} from "./auth-server.ts";
import { API_BASE, PLACEHOLDER_API_KEY, USER_AGENT, WHOAMI_PATH } from "./constants.ts";
import {
  attributionHeaders,
  type InteropAuth,
  interopAuthPath,
  readInteropAuthJson,
  redactCommandCodeErrorText,
  sanitizeApiKey,
} from "./utils.ts";

// --- Public types ---

/**
 * The exact OAuth config shape accepted by `pi.registerProvider`. `pi-coding-agent`
 * does not re-export this interface from its package root, so it is derived from
 * the public `ProviderConfig` type (see `dist/core/extensions/types.d.ts`).
 */
export type ExtensionOAuthConfig = NonNullable<ProviderConfig["oauth"]>;

/** Non-secret identity returned by `/alpha/whoami`. */
export interface CommandCodeWhoamiUser {
  id?: string;
  name?: string;
  userName?: string;
  email?: string;
}

/** Org returned by `/alpha/whoami` (`null` for personal accounts). */
export interface CommandCodeWhoamiOrg {
  id?: string;
  login?: string;
}

/** Result of {@link validateCommandCodeKey}. Never throws. */
export interface CommandCodeKeyValidation {
  valid: boolean;
  /** HTTP status; `0` means the request never completed. */
  status: number;
  user?: CommandCodeWhoamiUser;
  org?: CommandCodeWhoamiOrg | null;
  /** Redacted failure reason, safe to show/log. */
  error?: string;
}

/** Injectable knobs for {@link loginCommandCode} (network-free tests). */
export interface CommandCodeLoginOptions {
  fetchFn?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  startPort?: number;
  endPort?: number;
  timeoutMs?: number;
  maxAttempts?: number;
}

/** `expires` horizon: Command Code API keys do not expire. */
export const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;

/** Default per-attempt validation timeout for `/alpha/whoami`. */
export const VALIDATE_TIMEOUT_MS = 10_000;

/** How many paste attempts before login gives up. */
export const MAX_LOGIN_ATTEMPTS = 3;

export type { InteropAuth };
// Re-exported so consumers (e.g. `getCommandCodeApiKey` in the runtime) can read
// the CLI interop credential through this module.
export { interopAuthPath, readInteropAuthJson };

// --- Credentials ---

/** Wrap a static API key in pi's OAuth credential shape (refresh === access). */
export function credentialsFromApiKey(apiKey: string): OAuthCredentials {
  return { refresh: apiKey, access: apiKey, expires: Date.now() + TEN_YEARS_MS };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "AuthAbortError");
}

function notify(callbacks: OAuthLoginCallbacks, message: string): void {
  callbacks.onProgress?.(redactCommandCodeErrorText(message));
}

function errorText(error: unknown): string {
  return redactCommandCodeErrorText(error instanceof Error ? error.message : String(error));
}

// --- Key validation ---

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseWhoami(data: unknown): Pick<CommandCodeKeyValidation, "user" | "org"> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const record = data as Record<string, unknown>;
  const userRaw = record.user;
  const orgRaw = record.org;
  const user =
    userRaw && typeof userRaw === "object" && !Array.isArray(userRaw)
      ? {
          id: pickString((userRaw as Record<string, unknown>).id),
          name: pickString((userRaw as Record<string, unknown>).name),
          userName: pickString((userRaw as Record<string, unknown>).userName),
          email: pickString((userRaw as Record<string, unknown>).email),
        }
      : undefined;
  const org =
    orgRaw === null
      ? null
      : orgRaw && typeof orgRaw === "object" && !Array.isArray(orgRaw)
        ? {
            id: pickString((orgRaw as Record<string, unknown>).id),
            login: pickString((orgRaw as Record<string, unknown>).login),
          }
        : undefined;
  return { user, org };
}

function extractApiMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const record = data as Record<string, unknown>;
  const inner = record.error;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    const message = pickString((inner as Record<string, unknown>).message);
    if (message) return message;
  }
  return pickString(inner) ?? pickString(record.message);
}

/**
 * Validate a Command Code API key with `GET https://api.commandcode.ai/alpha/whoami`.
 *
 * - `2xx` ⇒ `{ valid: true, user, org }`
 * - `401` ⇒ `{ valid: false, status: 401 }` (invalid key)
 * - transport failure ⇒ `{ valid: false, status: 0, error }`
 *
 * Never throws and never emits an unredacted key. `fetchFn` is injected in tests;
 * the real API is never called from unit tests.
 */
export async function validateCommandCodeKey(
  key: string,
  fetchFn?: typeof fetch,
  timeoutMs: number = VALIDATE_TIMEOUT_MS,
): Promise<CommandCodeKeyValidation> {
  const apiKey = sanitizeApiKey(key);
  if (!apiKey || apiKey === PLACEHOLDER_API_KEY) {
    return { valid: false, status: 0, error: "No Command Code API key provided" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (fetchFn ?? fetch)(`${API_BASE}${WHOAMI_PATH}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...attributionHeaders(),
      },
      signal: controller.signal,
    });

    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    const { user, org } = parseWhoami(data);

    if (response.ok) {
      // A 200 with `success:false` is still a rejection.
      if (data && typeof data === "object" && (data as Record<string, unknown>).success === false) {
        return {
          valid: false,
          status: response.status,
          user,
          org,
          error: redactCommandCodeErrorText(extractApiMessage(data) ?? "Command Code rejected the API key"),
        };
      }
      return { valid: true, status: response.status, user, org };
    }

    const message =
      response.status === 401
        ? "Invalid Command Code API key"
        : (extractApiMessage(data) ?? `Command Code validation failed (status ${response.status})`);
    return { valid: false, status: response.status, user, org, error: redactCommandCodeErrorText(message) };
  } catch (error) {
    const message = isAbortError(error)
      ? "Timed out while validating the Command Code API key"
      : `Could not reach Command Code to validate the API key (${errorText(error)})`;
    return { valid: false, status: 0, error: message };
  } finally {
    clearTimeout(timer);
  }
}

// --- Prompts ---

async function promptForSecret(callbacks: OAuthLoginCallbacks, message: string): Promise<string> {
  if (typeof callbacks.onPrompt === "function") {
    return callbacks.onPrompt({ message, placeholder: "user_…" });
  }
  if (typeof callbacks.onManualCodeInput === "function") {
    return callbacks.onManualCodeInput();
  }
  throw new Error(
    "This pi build cannot prompt for a Command Code API key. Set COMMAND_CODE_API_KEY and run /login again.",
  );
}

type LoginChoice = { flow: "browser" } | { flow: "paste"; apiKey?: string };

async function chooseFlow(callbacks: OAuthLoginCallbacks): Promise<LoginChoice> {
  if (typeof callbacks.onSelect === "function") {
    const selected = await callbacks.onSelect({
      message: "How do you want to sign in to Command Code?",
      options: [
        {
          id: "browser",
          label: "Sign in with browser",
        },
        {
          id: "paste",
          label: "Paste an API key",
        },
      ],
    });
    if (selected === "browser" || selected === "paste") return { flow: selected };
    throw new Error("Command Code login cancelled");
  }

  // Older/partial pi builds: fall back to a text prompt.
  const answer = await promptForSecret(
    callbacks,
    "Command Code login: press Enter to open the browser, or paste your API key directly",
  );
  const normalized = answer.trim().toLowerCase();
  if (normalized === "key" || normalized === "k" || normalized === "paste" || normalized === "api") {
    return { flow: "paste" };
  }
  if (normalized === "" || normalized === "browser" || normalized === "b" || normalized === "1") {
    return { flow: "browser" };
  }
  // Anything else that sanitizes to a usable key is treated as the key itself.
  const directKey = sanitizeApiKey(answer);
  return directKey ? { flow: "paste", apiKey: directKey } : { flow: "browser" };
}

// --- Login flows ---

async function pasteLogin(
  callbacks: OAuthLoginCallbacks,
  options: CommandCodeLoginOptions,
  initialKey?: string,
): Promise<OAuthCredentials> {
  const maxAttempts = options.maxAttempts && options.maxAttempts > 0 ? options.maxAttempts : MAX_LOGIN_ATTEMPTS;
  let pending = initialKey;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const raw = pending ?? (await promptForSecret(callbacks, "Paste your Command Code API key"));
    pending = undefined;

    const key = sanitizeApiKey(raw);
    if (!key || key === PLACEHOLDER_API_KEY) {
      notify(callbacks, "No usable Command Code API key was found. Try again, or cancel and run /login later.");
      continue;
    }

    const result = await validateCommandCodeKey(key, options.fetchFn);
    if (result.valid) {
      const who = result.user?.userName ?? result.user?.name;
      notify(callbacks, who ? `Signed in to Command Code as ${who}.` : "Signed in to Command Code.");
      return credentialsFromApiKey(key);
    }

    if (result.status === 401) {
      notify(callbacks, "That API key was rejected by Command Code. Check the key and try again.");
    } else {
      notify(callbacks, `Could not validate the key: ${result.error ?? "unknown error"}.`);
    }
  }

  throw new Error(`Command Code login failed: no valid API key provided after ${maxAttempts} attempts.`);
}

async function browserLogin(
  callbacks: OAuthLoginCallbacks,
  options: CommandCodeLoginOptions,
): Promise<OAuthCredentials> {
  let authServer: AuthServer;
  try {
    const serverOptions: AuthServerOptions = {
      startPort: options.startPort,
      endPort: options.endPort,
      timeoutMs: options.timeoutMs,
      env: options.env,
      signal: options.signal ?? callbacks.signal,
    };
    authServer = await startAuthServer(serverOptions);
  } catch (error) {
    notify(
      callbacks,
      `Could not start the local browser-login server (${errorText(error)}). Falling back to API-key paste.`,
    );
    return pasteLogin(callbacks, options);
  }

  try {
    callbacks.onAuth({
      url: authServer.loginUrl,
      instructions: "Finish signing in to Command Code in your browser, then return to pi.",
    });

    const callback = await authServer.waitForCallback;
    const key = sanitizeApiKey(callback.apiKey);
    if (!key) {
      notify(callbacks, "The browser returned an unusable API key. Falling back to API-key paste.");
      return pasteLogin(callbacks, options);
    }

    const result = await validateCommandCodeKey(key, options.fetchFn);
    if (result.valid) {
      const who = result.user?.userName ?? result.user?.name;
      notify(callbacks, who ? `Signed in to Command Code as ${who}.` : "Signed in to Command Code.");
      return credentialsFromApiKey(key);
    }

    notify(
      callbacks,
      `The key returned by the browser was rejected (${result.error ?? `status ${result.status}`}). Falling back to paste.`,
    );
    return pasteLogin(callbacks, options);
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("Command Code login cancelled");
    }
    if (isAuthTimeoutError(error) || isAuthCallbackError(error)) {
      notify(callbacks, `${errorText(error)}. Falling back to API-key paste.`);
      return pasteLogin(callbacks, options);
    }
    throw error instanceof Error ? new Error(errorText(error)) : error;
  } finally {
    authServer.close();
  }
}

/**
 * Run the full Command Code login flow (browser or paste). Exported separately
 * from {@link commandCodeOAuth} so tests can inject `fetchFn` and skip the
 * network.
 */
export async function loginCommandCode(
  callbacks: OAuthLoginCallbacks,
  options: CommandCodeLoginOptions = {},
): Promise<OAuthCredentials> {
  const choice = await chooseFlow(callbacks);
  if (choice.flow === "browser") return browserLogin(callbacks, options);
  return pasteLogin(callbacks, options, choice.apiKey);
}

// --- ExtensionOAuthConfig surface ---

/**
 * Command Code API keys are long-lived and static, so refreshing re-wraps the
 * same key with a fresh far-future expiry (no exchange).
 */
export async function refreshToken(credentials: OAuthCredentials, _signal?: AbortSignal): Promise<OAuthCredentials> {
  const key = sanitizeApiKey(credentials.access) ?? sanitizeApiKey(credentials.refresh);
  if (!key) {
    throw new Error("Command Code credentials are missing an API key. Run /login again.");
  }
  return credentialsFromApiKey(key);
}

/** The provider API key used for requests (`access`, falling back to `refresh`). */
export function getApiKey(credentials: OAuthCredentials): string {
  return credentials.access ?? credentials.refresh;
}

/** `ProviderConfig.oauth` for the `commandcode-cloud` registration. */
export const commandCodeOAuth: ExtensionOAuthConfig = {
  name: "Command Code",
  isSubscription: false,
  usesCallbackServer: true,
  login: (callbacks) => loginCommandCode(callbacks),
  refreshToken: (credentials, signal) => refreshToken(credentials, signal),
  getApiKey: (credentials) => getApiKey(credentials),
};
