/**
 * Shared, network-free test helpers for pi-commandcode-cloud.
 *
 * - {@link loadFixture} reads a JSON fixture from `tests/fixtures/`.
 * - {@link fakeTheme} is a minimal `Theme` replacement that records every color
 *   it is asked to render (used to pin the 60/80 color thresholds).
 * - {@link routedFetch} is an injected `fetch` for the account-API and catalog
 *   tests: it routes by URL substring, records the requests, and can simulate a
 *   hung request that only settles on abort (for timeout tests).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Theme } from "@earendil-works/pi-coding-agent";

export const FIXTURES_DIR = join(import.meta.dirname, "fixtures");

/** Read and parse a JSON fixture by file name (e.g. `"whoami.json"`). */
export function loadFixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8")) as T;
}

/** A minimal `Theme` stand-in that records the color of every `fg` call. */
export interface FakeTheme {
  colors: string[];
  fg(color: string, text: string): string;
}

/** Create a recording fake theme. */
export function fakeTheme(): FakeTheme {
  const colors: string[] = [];
  return {
    colors,
    fg(color: string, text: string): string {
      colors.push(color);
      return text;
    },
  };
}

/** Narrow a {@link FakeTheme} to the `Theme` type expected by the formatters. */
export function asTheme(theme: FakeTheme): Theme {
  return theme as unknown as Theme;
}

/** One recorded request from {@link routedFetch}. */
export interface LoggedRequest {
  url: string;
  method: string;
  /** Header names lower-cased. */
  headers: Record<string, string>;
}

/** A fake response body (or a hung request) for one route. */
export interface FakeRoute {
  status?: number;
  body?: unknown;
  /** Raw response text; wins over {@link body} when set. */
  text?: string;
  /** When true, the promise never resolves until the request's signal aborts. */
  hang?: boolean;
}

/** An injected fetch plus the requests it observed. */
export interface FakeFetch {
  fetchFn: typeof fetch;
  requests: LoggedRequest[];
}

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

/**
 * Build an injected `fetch` that routes requests by URL substring and records
 * every request (URL, method, lower-cased headers). Unrouted URLs answer 404.
 */
export function routedFetch(routes: Array<[needle: string, route: FakeRoute]>): FakeFetch {
  const requests: LoggedRequest[] = [];
  const fetchFn = (async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers: Record<string, string> = {};
    const rawHeaders = init?.headers as Record<string, string> | undefined;
    for (const [key, value] of Object.entries(rawHeaders ?? {})) headers[key.toLowerCase()] = value;
    requests.push({ url, method: init?.method ?? "GET", headers });

    const route = routes.find(([needle]) => url.includes(needle))?.[1] ?? {
      status: 404,
      body: { error: "unrouted" },
    };

    if (route.hang) {
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(abortError());
          return;
        }
        signal?.addEventListener("abort", () => reject(abortError()), { once: true });
      });
    }

    const status = route.status ?? 200;
    const text = route.text ?? JSON.stringify(route.body ?? null);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
    } as Response;
  }) as typeof fetch;

  return { fetchFn, requests };
}

/** A `fetch` stub that answers the same body/status for every request. */
export function simpleFetch(body: unknown, status = 200): FakeFetch {
  return routedFetch([["", { status, body }]]);
}
