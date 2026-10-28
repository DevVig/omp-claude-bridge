/**
 * Unit-suite preload: isolate agent, Claude and XDG state without changing HOME.
 *
 * Must run before test files import src modules — src/log-paths.ts resolves
 * paths lazily now, but keep the preload so tests never touch real agent state
 * even when they forget to swap env themselves.
 *
 * Wiring this as `bun test --preload ./tests/lib/setup.mjs` runs it first
 * in every test child process. tests/unit-debug-path.mjs asserts it took effect.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

delete process.env.OMP_PROFILE;
delete process.env.PI_PROFILE;
const root = mkdtempSync(join(tmpdir(), "claude-bridge-test-log-"));
process.env.CLAUDE_BRIDGE_TEST_ROOT = root;
for (const kind of ["CONFIG", "DATA", "CACHE", "STATE"]) {
	process.env[`XDG_${kind}_HOME`] = join(root, kind.toLowerCase());
}
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
process.env.PI_CODING_AGENT_SESSION_DIR = join(root, "sessions");
process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
process.env.CLAUDE_BRIDGE_DEBUG_PATH = join(root, "claude-bridge.log");
delete process.env.CLAUDE_BRIDGE_RECORD_STREAM;
process.on("exit", () => rmSync(root, { recursive: true, force: true }));
