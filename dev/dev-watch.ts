/**
 * dev-watch — automatic rebuild + hot reload for the pi-extensions dev checkout.
 *
 * Installed globally by dev/setup-dev.sh:
 *   ~/.pi/agent/extensions/pi-extensions-dev-watch.ts -> <repo>/dev/dev-watch.ts
 *
 * What it does
 *   - watches the live checkout that ~/.pi/agent/settings.json points at
 *   - a change under vendor/opensec-pi-subagents/src or the TPS patch runs
 *     scripts/opensec-subagents/update.sh: apply patch, typecheck, compile and
 *     bundle, so the committed opensec-pi-subagents/ artifact is always current
 *   - then hot-reloads pi through the /dev-reload command, so the running session
 *     immediately uses the new extension code (no manual /reload)
 *   - a failed build is reported and the current, working code stays loaded
 *   - on session start it builds once if the artifact is older than its inputs
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
const VENDOR = path.join(ROOT, "vendor", "opensec-pi-subagents");
const VENDOR_SRC = path.join(VENDOR, "src");
const PATCH_DIR = path.join(ROOT, "patches", "opensec-pi-subagents");
const PATCH_FILE = path.join(PATCH_DIR, "0001-tps.patch");
const BUILT = path.join(ROOT, "opensec-pi-subagents");
const DIST_ENTRY = path.join(BUILT, "dist-bun", "index.js");
const UPDATE_SCRIPT = path.join(ROOT, "scripts", "opensec-subagents", "update.sh");
const COMMANDCODE = path.join(ROOT, "pi-commandcode-cloud");

const DEBOUNCE_MS = 800;
const BUILD_TIMEOUT_MS = 600_000;
const SWALLOW_DIST_MS = 1_500;
const RELOAD_COOLDOWN_MS = 2_000;

const ENABLED = process.env.PI_EXTENSIONS_DEV_WATCH !== "0";
const QUIET = process.env.PI_EXTENSIONS_DEV_QUIET === "1";

type WatchTarget = {
	dir: string;
	recursive: boolean;
	/** true (default) = run update.sh; false = reload only (TypeScript/skills). */
	build?: boolean;
	match?: RegExp;
	/** non-recursive package root: only these names trigger a rebuild. */
	buildOnly?: boolean;
};

/** Directories whose changes matter. Non-recursive entries only report their own children. */
const WATCH_TARGETS: ReadonlyArray<WatchTarget> = [
	// Loaded straight from TypeScript: edit -> hot reload, no build step.
	{ dir: path.join(ROOT, "pi-usage", "extensions"), recursive: true, build: false },
	{ dir: COMMANDCODE, recursive: false, build: false, match: /\.(ts|json)$/ },
	// The TPS patch inputs: vendored source + the patch itself.
	{ dir: VENDOR_SRC, recursive: true },
	{ dir: PATCH_DIR, recursive: false, match: /^0001-tps\.patch$/ },
	// Build output: a build rewrites it, so swallow those events (see onChange).
	{ dir: BUILT, recursive: true },
	// package.json / tsconfig*.json live at the vendor root and trigger a build.
	{ dir: VENDOR, recursive: false, buildOnly: true },
	// Skills reload without a build step.
	{ dir: path.join(ROOT, "skills"), recursive: true, build: false },
	{ dir: path.join(ROOT, "deploy", "skills"), recursive: true, build: false },
];

const BUILD_TRIGGER_NAME = /^(package\.json|tsconfig[^/\\]*\.json)$/;

function isInside(target: string, dir: string): boolean {
	const rel = path.relative(dir, target);
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

function mtimeOf(file: string): number {
	try {
		return fs.statSync(file).mtimeMs;
	} catch {
		return 0;
	}
}

function isDistStale(): boolean {
	const inputs = Math.max(newestMtimeMs(VENDOR_SRC), mtimeOf(PATCH_FILE));
	const built = mtimeOf(DIST_ENTRY);
	return built === 0 || inputs > built;
}

export default function devWatch(pi: ExtensionAPI) {
	let watchers: fs.FSWatcher[] = [];
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let building = false;
	/** A change is pending (build or reload). */
	let dirty = false;
	/** The pending change needs a rebuild (not a reload-only skill edit). */
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

	/** Apply the patch and rebuild the committed artifact. */
	async function rebuild(): Promise<boolean> {
		try {
			const result = await pi.exec("bash", [UPDATE_SCRIPT], {
				cwd: ROOT,
				timeout: BUILD_TIMEOUT_MS,
			});
			const ok = result.code === 0;
			if (!ok) report("dev-watch: build FAILED — keeping the previously built code", result.stderr || result.stdout);
			return ok;
		} catch (error) {
			report("dev-watch: build FAILED — keeping the previously built code", String(error));
			return false;
		} finally {
			// update.sh replaces the built dir; ignore those watcher events so they don't loop.
			swallowDistUntil = Date.now() + SWALLOW_DIST_MS;
		}
	}

	async function cycle() {
		if (building || !dirty) return;
		building = true;
		const needBuild = dirtySource;
		dirty = false;
		dirtySource = false;
		let ok = true;
		try {
			if (needBuild) ok = await rebuild();
		} finally {
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

	function onChange(target: WatchTarget, filename: string | Buffer | null) {
		const name = filename ? filename.toString() : "";
		if (!target.recursive) {
			if (target.buildOnly) {
				if (!BUILD_TRIGGER_NAME.test(name)) return;
			} else if (target.match && !target.match.test(name)) {
				return;
			}
		} else if (isInside(name ? path.join(target.dir, name) : target.dir, BUILT)) {
			// Build-output writes while updating are swallowed; a manual build still reloads.
			if (Date.now() < swallowDistUntil) return;
		}
		dirty = true;
		if (target.build !== false) dirtySource = true;
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
				dirty = false;
				if (!(await rebuild())) return;
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
			dirty = true;
			dirtySource = true;
			notify("dev-watch: opensec-pi-subagents artifact is older than its inputs — rebuilding", "warning");
			void cycle();
		}
	});

	pi.on("session_shutdown", async () => {
		stopWatching();
	});
}
