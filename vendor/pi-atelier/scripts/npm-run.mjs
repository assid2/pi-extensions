import { spawnSync } from "node:child_process";

/**
 * Decide how to launch npm from a child process.
 *
 * On Windows `npm` is a `.cmd` shim. Node refuses to spawn those directly (EINVAL,
 * since the CVE-2024-27980 fix) and a bare `npm` lookup fails with ENOENT, so a
 * shell has to be involved there. Elsewhere spawning directly is preferred because
 * `shell: true` neither escapes nor quotes arguments, which Node warns about. Under
 * `npm run` the running npm exposes its own entry point, so reuse it and skip the
 * shell entirely on every platform.
 */
function resolveNpm() {
	if (process.env.npm_execpath) {
		return { command: process.execPath, prefix: [process.env.npm_execpath], shell: false };
	}
	return { command: "npm", prefix: [], shell: process.platform === "win32" };
}

/**
 * Run npm and return its stdout, throwing when npm cannot be launched or fails.
 */
export function npm(args, options = {}) {
	const { command, prefix, shell } = resolveNpm();
	// The Windows fallback receives only flags and filesystem paths; quote each
	// argument so spaces and shell operators in those paths remain literal.
	const argv = shell ? args.map((arg) => `"${arg}"`) : [...prefix, ...args];
	const result = spawnSync(command, argv, {
		cwd: options.cwd,
		encoding: "utf8",
		shell,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		// npm 12 reports failures as a JSON document on stdout; older versions use stderr.
		const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
		throw new Error(`npm ${args.join(" ")} failed (${result.signal ?? result.status})\n${output}`);
	}
	return result.stdout;
}

/**
 * Run `npm pack --json` and return the single pack report it prints.
 *
 * npm 12 changed this output from an array of reports to an object keyed by package
 * name, so both shapes are accepted.
 */
export function npmPackReport(args, options = {}) {
	const parsed = JSON.parse(npm(["pack", "--json", ...args], options));
	return Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
}
