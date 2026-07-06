import test from "node:test";
import assert from "node:assert/strict";

import { applyLongContext, claudeCodeModelId } from "../src/models.ts";

// Minimal stand-ins for pi-ai model entries (only the fields applyLongContext reads).
const MODELS = [
	{ id: "claude-fable-5", name: "Fable 5", contextWindow: 1_000_000 },
	{ id: "claude-opus-4-8", name: "Opus 4.8", contextWindow: 200_000 },
	{ id: "claude-opus-4-7", name: "Opus 4.7", contextWindow: 1_000_000 },
	{ id: "claude-opus-4-6", name: "Opus 4.6", contextWindow: 200_000 },
	{ id: "claude-sonnet-5", name: "Sonnet 5", contextWindow: 200_000 },
	{ id: "claude-sonnet-4-6", name: "Sonnet 4.6", contextWindow: 200_000 },
	{ id: "claude-haiku-4-5", name: "Haiku 4.5", contextWindow: 200_000 },
];

const settings = (contextWindow) => ({ plan: "pro", longContextExtraUsage: false, contextWindow });
const registered = (contextWindow) => applyLongContext(MODELS, settings(contextWindow));
const byId = (contextWindow) => Object.fromEntries(registered(contextWindow).map((m) => [m.id, m]));

test("auto: Fable 5 registers at 200K, Sonnet 5 at 1M, Haiku at 200K, Opus 4.7 present", () => {
	const models = byId("auto");
	assert.equal(models["claude-fable-5"].contextWindow, 200_000);
	assert.equal(models["claude-sonnet-5"].contextWindow, 1_000_000);
	assert.equal(models["claude-haiku-4-5"].contextWindow, 200_000);
	assert.ok(models["claude-opus-4-7"], "opus-4-7 should be available in auto");
});

test("200k mode: Opus 4.7 is hidden and every registered model is 200K", () => {
	const models = registered("200k");
	assert.ok(!models.some((m) => m.id === "claude-opus-4-7"), "opus-4-7 has no 200K runtime");
	for (const m of models) assert.equal(m.contextWindow, 200_000, `${m.id} should be 200K`);
});

test("1m mode: Haiku 4.5 is hidden and every registered model is 1M", () => {
	const models = registered("1m");
	assert.ok(!models.some((m) => m.id === "claude-haiku-4-5"), "haiku-4-5 has no 1M runtime");
	for (const m of models) assert.equal(m.contextWindow, 1_000_000, `${m.id} should be 1M`);
});

test("cliModelId: bare id in auto/200k, [1m] suffix when forcing 1M", () => {
	assert.equal(claudeCodeModelId({ id: "claude-fable-5" }, settings("auto")), "claude-fable-5");
	assert.equal(claudeCodeModelId({ id: "claude-fable-5" }, settings("200k")), "claude-fable-5");
	assert.equal(claudeCodeModelId({ id: "claude-fable-5" }, settings("1m")), "claude-fable-5[1m]");
	assert.equal(claudeCodeModelId({ id: "claude-opus-4-8" }, settings("200k")), "claude-opus-4-8");
	assert.equal(claudeCodeModelId({ id: "claude-opus-4-8" }, settings("auto")), "claude-opus-4-8[1m]");
});

test("requesting a hidden model directly throws", () => {
	assert.throws(() => claudeCodeModelId({ id: "claude-haiku-4-5" }, settings("1m")));
	assert.throws(() => claudeCodeModelId({ id: "claude-opus-4-7" }, settings("200k")));
});
