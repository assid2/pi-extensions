/**
 * dev-watch — automatic rebuild + hot reload for the pi-extensions dev checkout.
 *
 * Installed globally by dev/setup-dev.sh:
 *   ~/.pi/agent/extensions/pi-extensions-dev-watch.ts -> <repo>/dev/dev-watch.ts
 *
 * What it does
 *   - watches the live checkout that ~/.pi/agent/settings.json points at
 *   - a change under pi-dynamic-workflows/src (or its package.json/tsconfig) runs
 *     `npm run build` (tsc) so the committed dist/ is always current
 *   - then hot-reloads pi through the /dev-reload command, so the running session
 *     immediately uses the new extension code (no manual /reload)
 *   - a failed build is reported and the current, working code stays loaded
 *   - on session start it builds once if dist/ is older than src/ (offline edits)
 *
 * Env
 *   PI_EXTENSIONS_DEV_ROOT    repo root to watch (default: resolved from this file)
 *   PI_EXTENSIONS_DEV_WATCH   set to 0 to disable the watchers
 *   PI_EXTENSIONS_DEV_QUIET   set to 1 to suppress success notifications
 *
 * Commands
 *   /dev-reload               rebuild if needed, then reload pi
 *   /dev-watch on|off|status  toggle the file watchers for this session
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Resolve the repo root from this file (through the setup-dev.sh symlink), so the
 *  extension is portable across machines/clones without a hardcoded path. */
function defaultRoot(): string {
	try {
		return path.resolve(path.dirname(fs.realpathSync(fileURLToPath(import.meta.url))), "..");
	} catch {
		return process.cwd();
	}
}

const ROOT = process.env.PI_EXTENSIONS_DEV_ROOT ?? defaultRoot();
const WORKFLOWS = path.join(ROOT, "pi-dynamic-workflows");
const WORKFLOWS_SRC = path.join(WORKFLOWS, "src");
const WORKFLOWS_DIST = path.join(WORKFLOWS, "dist");
const DIST_ENTRY = path.join(WORKFLOWS_DIST, "pi-extension.js");
const COMMANDCODE = path.join(ROOT, "pi-commandcode-cloud");

const DEBOUNCE_MS = 800;
const BUILD_TIMEOUT_MS = 180_000;
const SWALLOW_DIST_MS = 1_500;
const RELOAD_COOLDOWN_MS = 2_000;

const ENABLED = process.env.PI_EXTENSIONS_DEV_WATCH !== "0";
const QUIET = process.env.PI_EXTENSIONS_DEV_QUIET === "1";

/** Directories whose changes matter. Non-recursive entries only report their own children. */
const WATCH_TARGETS: ReadonlyArray<{ dir: string; recursive: boolean; buildOnly?: boolean; match?: RegExp }> = [
	{ dir: path.join(ROOT, "pi-usage", "extensions"), recursive: true },
	// pi-commandcode-cloud is loaded straight from TypeScript: any root-level
	// source edit hot-reloads without a build step.
	{ dir: COMMANDCODE, recursive: false, match: /\.(ts|json)$/ },
	{ dir: WORKFLOWS_SRC, recursive: true },
	{ dir: path.join(WORKFLOWS, "skills"), recursive: true },
	{ dir: WORKFLOWS_DIST, recursive: true },
	{ dir: path.join(ROOT, "deploy", "skills"), recursive: true },
	// package.json / tsconfig*.json live at the package root and trigger a build
	{ dir: WORKFLOWS, recursive: false, buildOnly: true },
];

const BUILD_TRIGGER_NAME = /^(package\.json|tsconfig[^/\\]*\.json)$/;

function isInsideDist(target: string): boolean {
	const rel = path.relative(WORKFLOWS_DIST, target);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function newestMtimeMs(dir: string): number {
	let newest = 0;
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return 0;
	}
	for (const entry of entries) {
		if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) newest = Math.max(newest, newestMtimeMs(full));
		else {
			try {
				newest = Math.max(newest, fs.statSync(full).mtimeMs);
			} catch {
				/* raced with a delete */
			}
		}
	}
	return newest;
}

function isDistStale(): boolean {
	try {
		return newestMtimeMs(WORKFLOWS_SRC) > fs.statSync(DIST_ENTRY).mtimeMs;
	} catch {
		return true;
	}
}

export default function devWatch(pi: ExtensionAPI) {
	let watchers: fs.FSWatcher[] = [];
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let building = false;
	let dirtySource = false;
	let swallowDistUntil = 0;
	let lastReloadAt = 0;
	let watching = false;
	let sessionCtx: ExtensionContext | undefined;

	const notify = (message: string, type: "info" | "warning" | "error" = "info") => {
		if (type === "info" && QUIET) return;
		try {
			sessionCtx?.ui.notify(message, type);
		} catch {
			/* no UI (print/rpc modes) */
		}
	};

	const report = (prefix: string, text: string) => {
		const trimmed = text.trim();
		const tail = trimmed.length > 700 ? `…\n${trimmed.slice(-700)}` : trimmed;
		notify(`${prefix}\n${tail}`, "error");
	};

	function commandAvailable(name: string): boolean {
		try {
			return pi.getCommands().some((command) => command.name === name);
		} catch {
			return false;
		}
	}

	/** Ask pi to run the /dev-reload command (the only context that may call ctx.reload()). */
	function requestReload(reason: string) {
		if (Date.now() - lastReloadAt < RELOAD_COOLDOWN_MS) return;
		if (!commandAvailable("dev-reload")) {
			notify(`dev-watch: ${reason} — run /reload to apply`, "warning");
			return;
		}
		lastReloadAt = Date.now();
		notify(`dev-watch: ${reason}`, "info");
		pi.sendUserMessage("/dev-reload", {
			expandPromptTemplates: true,
			...(sessionCtx && !sessionCtx.isIdle() ? { deliverAs: "followUp" as const } : {}),
		});
	}

	async function cycle() {
		if (building) return;
		building = true;
		const needBuild = dirtySource;
		dirtySource = false;
		let ok = true;
		try {
			if (needBuild) {
				const result = await pi.exec("npm", ["run", "build", "--silent"], {
					cwd: WORKFLOWS,
					timeout: BUILD_TIMEOUT_MS,
				});
				ok = result.code === 0;
				if (!ok) report("dev-watch: build FAILED — keeping the previously built code", result.stderr || result.stdout);
			}
		} catch (error) {
			ok = false;
			report("dev-watch: build FAILED — keeping the previously built code", String(error));
		} finally {
			// tsc just rewrote dist/; ignore those watcher events so they don't loop.
			swallowDistUntil = Date.now() + SWALLOW_DIST_MS;
			building = false;
		}
		if (ok) requestReload(needBuild ? "rebuilt — reloading pi" : "change detected — reloading pi");
	}

	function schedule() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			debounceTimer = undefined;
			void cycle();
		}, DEBOUNCE_MS);
	}

	function onChange(
		target: { dir: string; recursive: boolean; buildOnly?: boolean; match?: RegExp },
		filename: string | Buffer | null,
	) {
		const name = filename ? filename.toString() : "";
		if (!target.recursive) {
			// The workflows package root only reacts to files that require a rebuild;
			// other non-recursive targets (pi-commandcode-cloud) reload on source edits.
			if (target.buildOnly) {
				if (!BUILD_TRIGGER_NAME.test(name)) return;
			} else if (target.match && !target.match.test(name)) {
				return;
			}
			dirtySource = true;
		} else if (isInsideDist(name ? path.join(target.dir, name) : target.dir)) {
			// dist/ writes during a build are swallowed; a manual build still reloads
			if (Date.now() < swallowDistUntil) return;
		} else {
			dirtySource = true;
		}
		schedule();
	}

	function stopWatching() {
		for (const watcher of watchers) {
			try {
				watcher.close();
			} catch {
				/* already gone */
			}
		}
		watchers = [];
		watching = false;
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = undefined;
		}
	}

	function startWatching(ctx: ExtensionContext) {
		sessionCtx = ctx;
		if (!ENABLED || watching) return;
		let started = 0;
		for (const target of WATCH_TARGETS) {
			try {
				const watcher = fs.watch(target.dir, { recursive: target.recursive, persistent: false }, (_event, filename) =>
					onChange(target, filename),
				);
				watcher.on("error", () => {});
				watchers.push(watcher);
				started += 1;
			} catch {
				// directory does not exist yet — /dev-watch on retries after it appears
			}
		}
		watching = started > 0;
	}

	// /dev-reload — the command entrypoint that may call ctx.reload().
	pi.registerCommand("dev-reload", {
		description: "dev-watch: rebuild if needed, then hot-reload pi",
		handler: async (_args, ctx) => {
			sessionCtx = ctx;
			if (dirtySource) {
				dirtySource = false;
				const result = await pi.exec("npm", ["run", "build", "--silent"], {
					cwd: WORKFLOWS,
					timeout: BUILD_TIMEOUT_MS,
				});
				if (result.code !== 0) {
					report("dev-reload: build FAILED — not reloading", result.stderr || result.stdout);
					return;
				}
			}
			await ctx.reload();
			return;
		},
	});

	pi.registerCommand("dev-watch", {
		description: "dev-watch: on | off | status",
		handler: async (args, ctx) => {
			const action = (args || "status").trim().toLowerCase();
			if (action === "on") {
				sessionCtx = ctx;
				startWatching(ctx);
				ctx.ui.notify(watching ? "dev-watch: watching" : "dev-watch: no watchable directories found", watching ? "info" : "warning");
			} else if (action === "off") {
				stopWatching();
				ctx.ui.notify("dev-watch: stopped", "info");
			} else {
				ctx.ui.notify(
					`dev-watch: ${watching ? "watching" : "off"} ${ENABLED ? "" : "(disabled by PI_EXTENSIONS_DEV_WATCH=0)"} — root: ${ROOT}`,
					"info",
				);
			}
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		sessionCtx = ctx;
		startWatching(ctx);
		if (ENABLED && isDistStale()) {
			dirtySource = true;
			notify("dev-watch: dist/ is older than src/ — rebuilding", "warning");
			void cycle();
		}
	});

	pi.on("session_shutdown", async () => {
		stopWatching();
	});
}
