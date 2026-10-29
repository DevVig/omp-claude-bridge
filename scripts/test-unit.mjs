// Each upstream suite owns module-global bridge state. Isolate suites in Bun
// processes while exercising the same runtime that loads OMP extensions.
import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";

const requested = process.argv.slice(2);
const files = requested.length ? requested : readdirSync("tests")
	.filter((name) => name.startsWith("unit-") && name.endsWith(".mjs"))
	.sort().map((name) => `./tests/${name}`);
let next = 0;
let failed = 0;
let passed = 0;
let testsPassed = 0;
await Promise.all(Array.from({ length: Math.min(3, files.length) }, async () => {
	while (next < files.length) {
		const file = files[next++];
		await new Promise((resolve) => {
			const child = spawn(process.execPath, ["test", "--preload", "./tests/lib/setup.mjs", file], {
				stdio: ["ignore", "pipe", "pipe"],
			});
			let output = "";
			child.stdout.on("data", (chunk) => { output += chunk; });
			child.stderr.on("data", (chunk) => { output += chunk; });
			child.on("error", (error) => { output += error.stack; });
			child.on("close", (code) => {
				testsPassed += Number(output.match(/^\s*(\d+) pass\s*$/m)?.[1] ?? 0);
				if (code === 0) { passed++; console.log(`PASS ${file}`); }
				else { failed++; console.error(`FAIL ${file}\n${output}`); }
				resolve();
			});
		});
	}
}));
console.log(`${passed} suites passed; ${failed} suites failed; ${testsPassed} tests passed.`);
if (failed || files.length === 0) process.exitCode = 1;
