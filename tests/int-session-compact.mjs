#!/usr/bin/env node
// Verifies the bridge rebuilds CC's session JSONL after a pi-side /compact.
//
// Bug it guards against: syncSharedSession's REUSE check uses
// `priorMessages.slice(sharedSession.cursor)`. After /compact, pi shrinks
// its messages array — slice(N) on a shorter array returns []. Without an
// explicit signal, REUSE wins and CC keeps `--resume`ing the pre-compact
// session, which then thrashes its own autocompact (issue #8).
//
// Fix: subscribe to pi's `session_compact` event and set
// sharedSession.needsRebuild = true so the next syncSharedSession call
// takes the REBUILD path.

console.log("=== int-session-compact.mjs ===");

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRpcHarness } from "./lib/rpc-harness.mjs";

const TIMEOUT = 180_000;
const BRIDGE_MODEL = "claude-bridge/claude-haiku-4-5";

const testAgentDir = mkdtempSync(join(tmpdir(), "session-compact-agent-"));
writeFileSync(join(testAgentDir, "settings.json"), JSON.stringify({
	compaction: { keepRecentTokens: 50 },
}));

const harness = createRpcHarness({
	name: "session-compact",
	args: ["--model", BRIDGE_MODEL],
	env: { PI_CODING_AGENT_DIR: testAgentDir },
	defaultTimeout: TIMEOUT,
});

const { startAndWait, stop, send, promptAndWait, DEBUG_LOG, RPC_LOG } = harness;

await startAndWait();

try {
	// A few substantive turns so pi has something to compact.
	console.log("Turn 1: seed history...");
	await promptAndWait("Pick a number between 1 and 100 and remember it. Reply with just the number. Do not use the memory system.");
	console.log("Turn 2: more history...");
	await promptAndWait("Now pick a color. Reply with just the color. Do not use the memory system.");
	console.log("Turn 3: more history...");
	await promptAndWait("Now pick a fruit. Reply with just the fruit. Do not use the memory system.");

	console.log("Triggering /compact...");
	await send({ type: "compact" });

	console.log("Turn 4: prompt after compact (should force REBUILD)...");
	await promptAndWait("Are you still there? Reply with just 'yes'.");

	// Split the log at the `session_compact:` marker. Reads BEFORE the
	// marker (including the summarization call pi made via our provider,
	// which legitimately uses the pre-compact session) don't matter — we
	// care about the first syncResult AFTER the event fires, which is
	// Turn 4's user prompt.
	const fullLog = readFileSync(DEBUG_LOG, "utf8");
	const compactIdx = fullLog.indexOf("session_compact:");
	if (compactIdx === -1) {
		throw new Error("no `session_compact:` debug marker — handler not subscribed?");
	}
	const preEventLog = fullLog.slice(0, compactIdx);
	const postEventLog = fullLog.slice(compactIdx);

	const preCompactSessionIds = [...preEventLog.matchAll(/syncResult: path=(?:reuse|rebuild) sessionId=([a-f0-9-]+)/g)]
		.map((m) => m[1]);
	const preCompactSessionId = preCompactSessionIds.at(-1);
	if (!preCompactSessionId) {
		throw new Error("no pre-compact shared sessionId found in debug log");
	}
	console.log(`  Pre-compact sessionId: ${preCompactSessionId}`);

	// Capture both the path and the rebuild flavor (preserved | rotated-post-abort | first).
	const syncResults = [...postEventLog.matchAll(/syncResult: path=(reuse|rebuild|clean-start)(?: sessionId=([a-f0-9-]+) priors=\d+ (\S+))?/g)]
		.map((m) => ({ path: m[1], sessionId: m[2], flavor: m[3] }));
	console.log(`  Post-event syncResults: ${JSON.stringify(syncResults)}`);

	if (syncResults.length === 0) {
		throw new Error("no syncResult markers after session_compact event (Turn 4 didn't reach the provider?)");
	}

	const first = syncResults[0];

	// First syncResult after the event must NOT reuse — pi's history has
	// shrunk and CC's session JSONL is now stale.
	if (first.path === "clean-start") {
		throw new Error(
			"first syncResult after session_compact was clean-start. The compact summarization " +
			"call landed after the event marker, so this test cannot verify Turn 4's rebuild.");
	}
	if (first.path === "reuse") {
		throw new Error(
			"bridge took REUSE path after session_compact — CC will resume the pre-compact session. " +
			"Expected REBUILD (or clean-start) so CC sees the post-compact history. " +
			"Symptom: triggers Claude Code's autocompact-thrashing (issue #8) on long sessions.");
	}

	// Compact has no concurrent CC writer, so the rebuild should preserve
	// the sessionId and wipe the JSONL in place (preserveId branch). If we
	// see "rotated-post-abort" here, the needsRebuild → preserveId logic
	// got re-conflated and we're leaking orphan JSONLs into ~/.claude/projects/
	// on every compact.
	if (first.path === "rebuild" && first.flavor !== "preserved") {
		throw new Error(
			`post-compact rebuild used flavor=${first.flavor}, expected "preserved". ` +
			`Compact has no concurrent CC writer — it should rebuild in place (deleteSession + ` +
			`createSession with the same UUID), not rotate. Rotating leaks orphan JSONL files.`);
	}
	if (first.path === "rebuild" && first.sessionId !== preCompactSessionId) {
		throw new Error(
			`post-compact rebuild preserved sessionId=${first.sessionId}, but expected the original ` +
			`pre-compact sessionId=${preCompactSessionId}. This means the compact summarization ` +
			`session replaced sharedSession before the session_compact handler ran, orphaning the ` +
			`main pre-compact JSONL.`);
	}

	console.log("PASS");
} catch (e) {
	process.exitCode = 1;
	console.log(`FAIL: ${e.message}\n${e.stack}`);
	console.log(`  RPC log:    ${RPC_LOG}`);
	console.log(`  Debug log:  ${DEBUG_LOG}`);
} finally {
	await stop();
	rmSync(testAgentDir, { recursive: true, force: true });
}
