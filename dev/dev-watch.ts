/**
 * dev-watch — automatic rebuild + hot reload for the pi-extensions dev checkout.
 *
 * Installed globally by dev/setup-dev.sh:
 *   ~/.pi/agent/extensions/pi-extensions-dev-watch.ts -> <repo>/dev/dev-watch.ts
 *
 * What it does
 *   - watches the live checkout that ~/.pi/agent/settings.json points at
 *   - a change under a vendored source tree or its patches/ directory runs that
 *     package's updater (apply patches, typecheck, compile, bundle), so the
 *     committed artifact is always current
 *   - then hot-reloads pi through the /dev-reload command, so the running session
 *     immediately uses the new extension code (no manual /reload)
 *   - a failed build is reported and the current, working code stays loaded
 *   - on session start it builds once if an artifact is older than its inputs
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
const COMMANDCODE = path.join(ROOT, "pi-commandcode-cloud");

/** One vendored package: source tree, patches, build script and generated output. */
interface BuildTarget {
	name: string;
	vendor: string;
	/** Directories under the vendor root whose changes need a rebuild. */
	sources: string[];
	patchDir: string;
	built: string;
	/** The file whose mtime tells us whether the artifact is current. */
	entry: string;
	script: string;
}

const BUILDS: readonly BuildTarget[] = [
	{
		name: "opensec-pi-subagents",
		vendor: path.join(ROOT, "vendor", "opensec-pi-subagents"),
		sources: ["src"],
		patchDir: path.join(ROOT, "patches", "opensec-pi-subagents"),
		built: path.join(ROOT, "opensec-pi-subagents"),
		entry: path.join(ROOT, "opensec-pi-subagents", "dist-bun", "index.js"),
		script: path.join(ROOT, "scripts", "opensec-subagents", "update.sh"),
	},
	{
		name: "pi-atelier",
		vendor: path.join(ROOT, "vendor", "pi-atelier"),
		sources: ["src", "extensions"],
		patchDir: path.join(ROOT, "patches", "pi-atelier"),
		built: path.join(ROOT, "pi-atelier"),
		entry: path.join(ROOT, "pi-atelier", "dist", "index.js"),
		script: path.join(ROOT, "scripts", "pi-atelier", "update.sh"),
	},
];

const DEBOUNCE_MS = 800;
const BUILD_TIMEOUT_MS = 900_000;
const SWALLOW_DIST_MS = 1_500;
const RELOAD_COOLDOWN_MS = 2_000;

const ENABLED = process.env.PI_EXTENSIONS_DEV_WATCH !== "0";
const QUIET = process.env.PI_EXTENSIONS_DEV_QUIET === "1";

type WatchTarget = {
	dir: string;
	recursive: boolean;
	/** Present for a build input; absent means reload only (TypeScript/skills). */
	build?: BuildTarget;
	/** Directory whose own writes are swallowed while a build runs. */
	built?: string;
	match?: RegExp;
	/** Non-recursive vendor root: only these names trigger a rebuild. */
	buildOnly?: boolean;
};

function buildTargets(target: BuildTarget): WatchTarget[] {
	return [
		...target.sources.map((source) => ({
			dir: path.join(target.vendor, source),
			recursive: true,
			build: target,
			built: target.built,
		})),
		{ dir: target.patchDir, recursive: false, match: /\.patch$/, build: target },
		{ dir: target.built, recursive: true, build: target, built: target.built },
		{ dir: target.vendor, recursive: false, buildOnly: true, build: target },
	];
}

/** Directories whose changes matter. Non-recursive entries only report their own children. */
const WATCH_TARGETS: readonly WatchTarget[] = [
	// Loaded straight from TypeScript: edit -> hot reload, no build step.
	{ dir: path.join(ROOT, "pi-usage", "extensions"), recursive: true },
	{ dir: COMMANDCODE, recursive: false, match: /\.(ts|json)$/ },
	// Vendored packages: source + patches -> rebuild, generated output -> reload.
	...BUILDS.flatMap(buildTargets),
	// Skills reload without a build step.
	{ dir: path.join(ROOT, "skills"), recursive: true },
	{ dir: path.join(ROOT, "deploy", "skills"), recursive: true },
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

function isStale(target: BuildTarget): boolean {
	const inputs = Math.max(
		...target.sources.map((source) => newestMtimeMs(path.join(target.vendor, source))),
		newestMtimeMs(target.patchDir),
	);
	const built = mtimeOf(target.entry);
	return built === 0 || inputs > built;
}

export default function devWatch(pi: ExtensionAPI) {
	let watchers: fs.FSWatcher[] = [];
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let building = false;
	/** A change is pending (build or reload). */
	let dirty = false;
	/** The pending change needs these builds (empty = reload only). */
	let dirtyBuilds = new Set<BuildTarget>();
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

	/** Apply patches and rebuild one vendored package. */
	async function rebuild(target: BuildTarget): Promise<boolean> {
		try {
			const result = await pi.exec("bash", [target.script], {
				cwd: ROOT,
				timeout: BUILD_TIMEOUT_MS,
			});
			const ok = result.code === 0;
			if (!ok) report(`dev-watch: ${target.name} build FAILED — keeping the previously built code`, result.stderr || result.stdout);
			return ok;
		} catch (error) {
			report(`dev-watch: ${target.name} build FAILED — keeping the previously built code`, String(error));
			return false;
		} finally {
			// The updater replaces the built dir; ignore those watcher events so they don't loop.
			swallowDistUntil = Date.now() + SWALLOW_DIST_MS;
		}
	}

	async function rebuildAll(targets: BuildTarget[]): Promise<boolean> {
		let ok = true;
		for (const target of targets) {
			if (!(await rebuild(target))) ok = false;
		}
		return ok;
	}

	async function cycle() {
		if (building || !dirty) return;
		building = true;
		const targets = [...dirtyBuilds];
		dirty = false;
		dirtyBuilds = new Set();
		let ok = true;
		try {
			if (targets.length > 0) ok = await rebuildAll(targets);
		} finally {
			building = false;
		}
		if (ok) requestReload(targets.length > 0 ? "rebuilt — reloading pi" : "change detected — reloading pi");
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
		} else if (target.built && isInside(name ? path.join(target.dir, name) : target.dir, target.built)) {
			// Build-output writes while updating are swallowed; a manual build still reloads.
			if (Date.now() < swallowDistUntil) return;
		}
		dirty = true;
		if (target.build !== undefined) dirtyBuilds.add(target.build);
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
			const targets = [...dirtyBuilds];
			dirtyBuilds = new Set();
			dirty = false;
			if (targets.length > 0 && !(await rebuildAll(targets))) return;
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
		const stale = ENABLED ? BUILDS.filter(isStale) : [];
		if (stale.length > 0) {
			for (const target of stale) dirtyBuilds.add(target);
			dirty = true;
			notify(`dev-watch: rebuild needed for ${stale.map((t) => t.name).join(", ")}`, "warning");
			void cycle();
		}
	});

	pi.on("session_shutdown", async () => {
		stopWatching();
	});
}
