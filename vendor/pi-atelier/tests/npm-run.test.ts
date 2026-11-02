import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it.each([false, true])(
	"packs and installs through paths with spaces and shell characters (direct invocation: %s)",
	(direct) => {
		const root = mkdtempSync(join(tmpdir(), "npm check (space) & path "));
		const source = join(root, "source");
		const destination = join(root, "packed files");
		const consumer = join(root, "consumer");

		try {
			for (const directory of [source, destination, consumer]) mkdirSync(directory);
			writeFileSync(
				join(source, "package.json"),
				JSON.stringify({ name: "npm-run-fixture", version: "1.0.0" }),
			);
			writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true }));
			execFileSync(
				process.execPath,
				[
					"--input-type=module",
					"--eval",
					`
						import { join } from "node:path";
						if (${direct}) delete process.env.npm_execpath;
						const [helper, source, destination, consumer] = process.argv.slice(1);
						const { npm, npmPackReport } = await import(helper);
						const report = npmPackReport(["--offline", "--pack-destination", destination], { cwd: source });
						npm(["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund",
							join(destination, report.filename)], { cwd: consumer });
					`,
					new URL("../scripts/npm-run.mjs", import.meta.url).href,
					source,
					destination,
					consumer,
				],
				{ encoding: "utf8", timeout: 25_000 },
			);
			const installed = JSON.parse(
				readFileSync(join(consumer, "node_modules/npm-run-fixture/package.json"), "utf8"),
			);
			expect(installed).toMatchObject({ name: "npm-run-fixture", version: "1.0.0" });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	},
	30_000,
);
