#!/usr/bin/env bun
// OMP-native counterpart of upstream's rpiv/pi-subagents regression: keep a
// parent provider query parked while a codebase-locator child uses the bridge.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRpcHarness } from "./lib/rpc-harness.mjs";

const root = mkdtempSync(join(tmpdir(), "omp-bridge-subagent-"));
const project = join(root, "project");
mkdirSync(join(project, ".omp", "agents"), { recursive: true });
mkdirSync(join(project, "src"));
writeFileSync(join(project, "src", "locator.ts"), "export const OMP_LOCATOR_SENTINEL = 'omp-locator';\n");
writeFileSync(join(project, ".omp", "agents", "codebase-locator.md"), `---
name: codebase-locator
description: Find matching files without changing them.
model: claude-bridge/claude-haiku-4-5
tools: [read, grep, glob]
---
Locate the requested symbol. Return matching file paths and line numbers. Do not modify files.
`);
const marker = "OMP-PARENT-SAW-LOCATOR";
const harness = createRpcHarness({
	name: "omp-native-codebase-locator", cwd: project,
	args: ["--model", "claude-bridge/claude-haiku-4-5", "--no-title"],
	env: { PI_CODING_AGENT_DIR: join(root, "agent") }, defaultTimeout: 240000,
});
try {
	await harness.startAndWait();
	const collector = harness.collectText();
	await harness.send({
		type: "prompt",
		message: `Delegate exactly once with OMP's task tool to the codebase-locator agent. Its task is to find OMP_LOCATOR_SENTINEL and report the matching path and line number. Wait for the result. Then reply exactly ${marker}.`,
	}, 240000);
	await harness.waitForMatch(
		message => message.type === "tool_execution_start" && JSON.stringify(message).includes("task"),
		"native OMP task invocation", 240000,
	);
	await harness.waitForEvent("agent_end", 240000);
	assert.match(collector.stop(), new RegExp(marker));
	const debug = readFileSync(harness.DEBUG_LOG, "utf8");
	assert.match(debug, /reentrant fresh query/, "no concurrent child bridge query was observed");
	assert.doesNotMatch(debug, /MCP handlers still waiting after delivering 0 results|tool handler\(s\) still waiting|currentPiStream overwritten/);
	console.log("PASS: native OMP child and parent bridge queries completed.");
} finally {
	await harness.stop();
	rmSync(root, { recursive: true, force: true });
}
