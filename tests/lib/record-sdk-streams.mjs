#!/usr/bin/env node
// Records real Claude Code SDK message streams as replay fixtures.
//
//   node --import tsx tests/lib/record-sdk-streams.mjs [scenario ...]
//
// Costs API calls, so it is not part of `npm test`. Re-run it when the SDK is
// bumped, then read the diff: a changed fixture is the SDK changing shape under
// us, which is the whole reason these are recorded rather than written by hand.
//
// Prompts are deliberately trivial and the tool calls read a scratch file this
// script creates, so no fixture carries repo or conversation content. The SDK's
// own envelope still does: `system/init` reports the absolute cwd and the user's
// entire personal slash-command and agent list, and every message carries live
// uuids. scrub() below strips that, keeping only the fields consumeQuery reads.
// Never commit a fixture that has not been through it.

import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRpcHarness } from "./rpc-harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..", "fixtures", "sdk-streams");
const WORKDIR = join(HERE, "..", ".record-workdir");

// One file each, with contents this script owns, so a recorded tool_result is
// fully determined by what we wrote here.
const FILES = {
	"one.txt": "ONE\n",
	"two.txt": "TWO\n",
	"three.txt": "THREE\n",
};

const SCENARIOS = {
	// Plain text turn: no tools, no thinking. The baseline shape.
	text: "Reply with exactly the word ALPHA and nothing else.",
	// One tool call, then a text answer — the two-request tool boundary.
	"single-tool": "Read the file one.txt and reply with exactly its contents, nothing else.",
	// The shape that broke rebuilds: several tool_use blocks in one assistant
	// message and several tool_result blocks in one user message.
	"parallel-tools": "Read one.txt, two.txt and three.txt in a single parallel batch, then reply with the three contents separated by commas.",
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// Only the fields consumeQuery actually reads survive from system/init. Everything
// else there is local configuration — slash_commands, agents, output style, the
// real cwd — and describes this machine rather than the SDK's contract.
const SYSTEM_INIT_KEEP = new Set(["type", "subtype", "session_id", "uuid", "model", "permissionMode", "mcp_servers", "tools"]);

function scrub(message, ids) {
	const fake = (id) => {
		if (!ids.has(id)) ids.set(id, `00000000-0000-4000-8000-${String(ids.size + 1).padStart(12, "0")}`);
		return ids.get(id);
	};
	const walk = (value) => {
		// The home prefix, not just WORKDIR: the model narrates absolute paths inside
		// thinking deltas, and a delta boundary can cut the path in half.
		if (typeof value === "string") return value.replace(UUID, fake).replaceAll(WORKDIR, "/workdir").replaceAll(homedir(), "/home/user");
		if (Array.isArray(value)) return value.map(walk);
		if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
		return value;
	};
	const kept = message.type === "system" && message.subtype === "init"
		? Object.fromEntries(Object.entries(message).filter(([k]) => SYSTEM_INIT_KEEP.has(k)))
		: message;
	return walk(kept);
}

const wanted = process.argv.slice(2);
const chosen = wanted.length ? wanted : Object.keys(SCENARIOS);

mkdirSync(FIXTURES, { recursive: true });
rmSync(WORKDIR, { recursive: true, force: true });
mkdirSync(WORKDIR, { recursive: true });
for (const [name, body] of Object.entries(FILES)) writeFileSync(join(WORKDIR, name), body);

for (const name of chosen) {
	const prompt = SCENARIOS[name];
	if (!prompt) throw new Error(`unknown scenario "${name}"; known: ${Object.keys(SCENARIOS).join(", ")}`);

	const target = join(FIXTURES, `${name}.jsonl`);
	const raw = join(WORKDIR, `${name}.raw.jsonl`);
	rmSync(raw, { force: true });
	writeFileSync(raw, "");

	const harness = createRpcHarness({
		name: `record-${name}`,
		args: ["--model", "claude-bridge/claude-haiku-4-5"],
		cwd: WORKDIR,
		env: { CLAUDE_BRIDGE_RECORD_STREAM: raw },
		defaultTimeout: 120_000,
	});
	await harness.startAndWait();
	try {
		const text = await harness.promptAndWait(prompt, 180_000);
		const ids = new Map();
		const messages = readFileSync(raw, "utf8").split("\n").filter(Boolean)
			.map((line) => scrub(JSON.parse(line), ids));
		const body = messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
		// A delta can split the home path so no string replacement sees it whole.
		// Refuse to write rather than commit a fixture carrying the username.
		const user = homedir().split("/").filter(Boolean).pop();
		if (user && body.includes(user)) throw new Error(`${name}: "${user}" survived scrubbing — inspect ${raw} and re-run`);
		writeFileSync(target, body);
		console.log(`${name}: ${messages.length} messages recorded — ${text.trim().slice(0, 60)}`);
	} finally {
		await harness.stop();
	}
}

rmSync(WORKDIR, { recursive: true, force: true });
if (!chosen.every((n) => existsSync(join(FIXTURES, `${n}.jsonl`)))) throw new Error("a fixture was not written");
