import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "omp-bridge-cli-"));
const trace = join(root, "query.json");
const env = {
	...process.env, PI_CODING_AGENT_DIR: join(root, "agent"),
	CLAUDE_CONFIG_DIR: join(root, "claude"), CLAUDE_BRIDGE_SMOKE_TRACE: trace,
	XDG_CACHE_HOME: join(root, "cache"), XDG_STATE_HOME: join(root, "state"),
	XDG_DATA_HOME: join(root, "data"),
};
delete env.OMP_PROFILE;
delete env.PI_PROFILE;
try {
	const run = spawnSync(process.env.OMP_BIN ?? resolve(repo, "node_modules/.bin/omp"), [
		"--no-session", "--no-extensions", "-e", resolve(repo, "tests/fixtures/controlled-sdk-extension.ts"),
		"--no-tools", "--no-lsp", "--no-skills", "--no-rules", "--no-context-files", "--no-title",
		"--model", "claude-bridge/claude-haiku-4-5", "--mode", "json",
		"--append-system-prompt", "OMP_SMOKE_POLICY", "-p", "Return the controlled response.",
	], { cwd: root, env, encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
	assert.equal(run.status, 0, `${run.error ?? ""}\n${run.stderr}\n${run.stdout}`);
	assert.match(run.stdout, /CONTROLLED_OMP_REPLY/);
	const query = JSON.parse(readFileSync(trace, "utf8"));
	assert.equal(query.cwd, root);
	assert.deepEqual(query.tools, []);
	assert.equal(query.policyForwarded, true);
	assert.equal(query.model, "claude-haiku-4-5");
	console.log("OMP CLI smoke passed: extension load, provider selection, policy forwarding and response delivery (controlled SDK; no network).");
} finally {
	rmSync(root, { recursive: true, force: true });
}
