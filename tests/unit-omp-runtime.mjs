import { it } from "node:test";
import assert from "node:assert/strict";
import { type } from "@oh-my-pi/omptype";
import { buildSystemPrompt } from "@oh-my-pi/pi-coding-agent/system-prompt";
import activate, { __test } from "../src/index.js";
import { projectPromptCapture } from "../src/prompt-capture.js";
import { installOmpSessionRouting, ompSessionFromKey } from "../src/omp-session-routing.js";
import { convertPiMessages } from "../src/convert.js";

function extension() {
	const handlers = new Map();
	activate({
		on(name, handler) {
			const list = handlers.get(name) ?? [];
			list.push(handler);
			handlers.set(name, list);
		},
		registerProvider() {}, registerTool() {},
	});
	return (name, event, ctx) => {
		for (const handler of handlers.get(name) ?? []) handler(event, ctx);
	};
}

it("preserves real OMP prompt blocks, loaded rules, skills, append text and turn-time additions", async () => {
	const cwd = process.env.CLAUDE_BRIDGE_TEST_ROOT;
	const { systemPrompt } = await buildSystemPrompt({
		cwd, contextFiles: [{ path: `${cwd}/AGENTS.md`, content: "PROJECT_POLICY_OMP" }],
		skills: [{ name: "bridge-skill", description: "SKILL_POLICY_OMP", filePath: `${cwd}/SKILL.md`, baseDir: cwd }],
		tools: new Map([["read", { readsSkillUris: true }]]), selectedTools: ["read"],
		resolvedAppendSystemPrompt: "APPEND_POLICY_OMP", personality: "none",
	});
	assert.ok(Array.isArray(systemPrompt));
	const emit = extension();
	let blocks = systemPrompt;
	const ctx = {
		cwd, mode: "print", ui: {}, modelRegistry: { hasProvider: () => true },
		sessionManager: { getSessionId: () => "omp-prompt-test" },
		getSystemPrompt: () => [...blocks],
	};
	emit("before_agent_start", { systemPrompt: [...blocks], prompt: "go" }, ctx);
	emit("agent_start", {}, ctx);
	blocks = [...blocks, "EXTENSION_TURN_POLICY_OMP"];
	emit("turn_start", {}, ctx);
	const context = __test.toBridgeContext({ systemPrompt: [...blocks], messages: [], tools: [] });
	const capture = __test.promptCaptures.resolveOrDerive(context.systemPrompt);
	const projected = projectPromptCapture(capture, { skillReadTool: "mcp" });
	assert.equal(projected, blocks.join("\n\n"));
	for (const policy of ["PROJECT_POLICY_OMP", "SKILL_POLICY_OMP", "APPEND_POLICY_OMP", "EXTENSION_TURN_POLICY_OMP"]) {
		assert.ok(projected.includes(policy), `lost ${policy}`);
	}
	emit("session_shutdown", {}, ctx);
});

it("normalizes native OMP tool schemas before exposing them through MCP", () => {
	const schema = type({ value: "string", "count?": "number" });
	const normalized = __test.toBridgeContext({
		systemPrompt: ["first", "second"], messages: [],
		tools: [{ name: "probe", description: "probe", parameters: schema }],
	});
	assert.equal(normalized.systemPrompt, "first\n\nsecond");
	const parameters = normalized.tools[0].parameters;
	assert.equal(parameters.type, "object");
	assert.equal(parameters.properties.value.type, "string");
	assert.deepEqual(parameters.required, ["value"]);
	assert.equal(parameters.properties.count.type, "number");
});

it("respects OMP's explicit xhigh effort instead of escalating it to max", () => {
	const model = { thinking: { mode: "anthropic-adaptive", efforts: ["low", "medium", "high", "xhigh", "max"] } };
	assert.equal(__test.effortForReasoning(model, "xhigh"), "xhigh");
	assert.equal(__test.effortForReasoning(model, "max"), "max");
	assert.equal(__test.effortForReasoning({ ...model, thinkingLevelMap: { xhigh: null } }, "xhigh"), undefined);
});

it("preserves OMP developer reminders and images in fresh prompts and rebuilt history", () => {
	const reminder = { role: "developer", timestamp: 1, content: [
		{ type: "text", text: "DEVELOPER_POLICY_OMP" },
		{ type: "image", data: "aGVsbG8=", mimeType: "image/png" },
	] };
	const normalized = __test.toBridgeContext({ systemPrompt: [], messages: [reminder] });
	assert.equal(normalized.messages[0].role, "user");
	assert.equal(reminder.role, "developer", "the input transcript must not be rewritten");
	assert.ok(normalized.messages[0].content.some((block) => block.text === "DEVELOPER_POLICY_OMP"));
	const { anthropicMessages } = convertPiMessages([reminder], new Map());
	assert.ok(anthropicMessages[0].content.some((block) => block.text === "DEVELOPER_POLICY_OMP"));
	assert.ok(anthropicMessages[0].content.some((block) => block.type === "image" && block.source.data === "aGVsbG8="));
});

it("starting, switching and closing one OMP session preserves other session mirrors", () => {
	const emit = extension();
	let id = "omp-parent";
	const ctx = {
		cwd: process.env.CLAUDE_BRIDGE_TEST_ROOT, mode: "print", ui: {},
		modelRegistry: { hasProvider: () => true }, sessionManager: { getSessionId: () => id },
	};
	try {
		emit("session_start", {}, ctx);
		const parent = { sessionId: "cc-parent", cursor: 2 };
		const sibling = { sessionId: "cc-sibling", cursor: 3 };
		__test.setSharedSession(id, parent);
		__test.setSharedSession("omp-sibling", sibling);
		const child = extension();
		const childCtx = { ...ctx, sessionManager: { getSessionId: () => "omp-child" } };
		child("session_start", {}, childCtx);
		child("session_shutdown", {}, childCtx);
		assert.equal(__test.getSharedSession(id), parent);
		assert.equal(__test.getSharedSession("omp-sibling"), sibling);
		id = "omp-new";
		emit("session_switch", { reason: "new" }, ctx);
		assert.equal(__test.getSharedSession("omp-parent"), null);
		assert.equal(__test.getSharedSession("omp-sibling"), sibling);
		emit("session_shutdown", {}, ctx);
		assert.equal(__test.getSharedSession("omp-sibling"), sibling);
	} finally {
		__test.resetSharedSession();
		delete globalThis[Symbol.for("claude-bridge:activeStreamSimple")];
	}
});

it("OMP summary routing carries session identity without altering other provider credentials", async () => {
	const ordinaryResolver = async () => "ordinary-test-key";
	const calls = [];
	const registry = { resolver(target, options) { calls.push({ target, options, receiver: this }); return ordinaryResolver; } };
	installOmpSessionRouting(registry);
	installOmpSessionRouting(registry);
	assert.equal(registry.resolver("other", { sessionId: "other-session" }), ordinaryResolver);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].receiver, registry);
	const resolver = registry.resolver({ provider: "claude-bridge" }, "bridge-session");
	assert.equal(ompSessionFromKey(resolver), "bridge-session");
	assert.equal(ompSessionFromKey(await resolver()), "bridge-session");
	assert.equal(ompSessionFromKey("ordinary-test-key"), undefined);
	assert.equal(registry.resolver("claude-bridge"), ordinaryResolver);
});
