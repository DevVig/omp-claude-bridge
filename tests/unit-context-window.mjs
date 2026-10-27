import test from "node:test";
import assert from "node:assert/strict";

import { buildModels, buildVariantModels, claudeCodeEffort, claudeCodeModelId, parseVariantId, resolveModel } from "../src/models.ts";

// Minimal stand-ins for pi-ai model entries (buildVariantModels reads id, name,
// contextWindow and spreads the rest through to each variant).
const MODELS = [
	{ id: "claude-fable-5", name: "Fable 5", contextWindow: 1_000_000 },
	{ id: "claude-opus-4-8", name: "Opus 4.8", contextWindow: 200_000 },
	{ id: "claude-opus-4-7", name: "Opus 4.7", contextWindow: 1_000_000 },
	{ id: "claude-opus-4-6", name: "Opus 4.6", contextWindow: 200_000 },
	{ id: "claude-sonnet-5", name: "Sonnet 5", contextWindow: 200_000 },
	{ id: "claude-sonnet-4-6", name: "Sonnet 4.6", contextWindow: 200_000 },
	{ id: "claude-haiku-4-5", name: "Haiku 4.5", contextWindow: 200_000 },
];

const settings = (contextWindow, extra = {}) => ({ plan: "pro", longContextExtraUsage: false, contextWindow, ...extra });
const variants = (contextWindow, extra) => buildVariantModels(MODELS, settings(contextWindow, extra));
const byId = (contextWindow, extra) => Object.fromEntries(variants(contextWindow, extra).map((m) => [m.id, m]));

test("auto (Pro): each model expands to its available windows with correct ids, windows, and labels", () => {
	const m = byId("auto");
	// Opus 4.8: default 1M unsuffixed + 200K alternate.
	assert.equal(m["claude-opus-4-8"].contextWindow, 1_000_000);
	assert.equal(m["claude-opus-4-8"].name, "Opus 4.8 (1M)");
	assert.equal(m["claude-opus-4-8-200k"].contextWindow, 200_000);
	assert.equal(m["claude-opus-4-8-200k"].name, "Opus 4.8 (200K)");
	// Opus 4.7: 1M only, no 200K variant.
	assert.equal(m["claude-opus-4-7"].contextWindow, 1_000_000);
	assert.ok(!m["claude-opus-4-7-200k"], "opus-4-7 has no 200K runtime");
	// Opus 4.6 (Pro): default 200K unsuffixed + 1M alternate.
	assert.equal(m["claude-opus-4-6"].contextWindow, 200_000);
	assert.equal(m["claude-opus-4-6-1m"].contextWindow, 1_000_000);
	// Fable 5: default 200K + 1M alternate.
	assert.equal(m["claude-fable-5"].contextWindow, 200_000);
	assert.equal(m["claude-fable-5-1m"].contextWindow, 1_000_000);
	// Sonnet 5: default 1M + 200K alternate.
	assert.equal(m["claude-sonnet-5"].contextWindow, 1_000_000);
	assert.equal(m["claude-sonnet-5-200k"].contextWindow, 200_000);
	// Sonnet 4.6: default 200K + 1M alternate.
	assert.equal(m["claude-sonnet-4-6"].contextWindow, 200_000);
	assert.equal(m["claude-sonnet-4-6-1m"].contextWindow, 1_000_000);
	// Haiku 4.5: 200K only, no 1M variant.
	assert.equal(m["claude-haiku-4-5"].contextWindow, 200_000);
	assert.ok(!m["claude-haiku-4-5-1m"], "haiku has no 1M runtime");
});

test("auto (Pro): 12 entries, and no base model emits two entries for the same window", () => {
	const list = variants("auto");
	assert.equal(list.length, 12);
	for (const base of MODELS.map((mm) => mm.id)) {
		const windows = list.filter((v) => v.id === base || v.id.startsWith(`${base}-`)).map((v) => v.contextWindow);
		assert.equal(new Set(windows).size, windows.length, `${base} has duplicate windows`);
	}
});

test("the default variant is listed before its suffixed alternate", () => {
	const ids = variants("auto").map((m) => m.id);
	assert.ok(ids.indexOf("claude-opus-4-8") < ids.indexOf("claude-opus-4-8-200k"));
	assert.ok(ids.indexOf("claude-sonnet-5") < ids.indexOf("claude-sonnet-5-200k"));
	assert.ok(ids.indexOf("claude-fable-5") < ids.indexOf("claude-fable-5-1m"));
});

test("auto (Max): Opus 4.6 default flips to 1M and 200K becomes the suffixed alternate", () => {
	const m = byId("auto", { plan: "max" });
	assert.equal(m["claude-opus-4-6"].contextWindow, 1_000_000);
	assert.equal(m["claude-opus-4-6-200k"].contextWindow, 200_000);
	assert.ok(!m["claude-opus-4-6-1m"], "1M is the default (unsuffixed) under Max");
});

test("200k config: unsuffixed prefers 200K, 1M stays available as -1m, Opus 4.7 falls back to 1M", () => {
	const m = byId("200k");
	assert.equal(m["claude-opus-4-8"].contextWindow, 200_000);
	assert.equal(m["claude-opus-4-8-1m"].contextWindow, 1_000_000);
	assert.ok(!m["claude-opus-4-8-200k"], "200K is the default here, so no suffixed duplicate");
	// Opus 4.7 has no 200K runtime, so its only window (1M) becomes the unsuffixed default.
	assert.equal(m["claude-opus-4-7"].contextWindow, 1_000_000);
	assert.ok(!m["claude-opus-4-7-1m"]);
	assert.equal(m["claude-haiku-4-5"].contextWindow, 200_000);
});

test("1m config: unsuffixed prefers 1M, 200K stays available as -200k, Haiku falls back to 200K", () => {
	const m = byId("1m");
	assert.equal(m["claude-opus-4-8"].contextWindow, 1_000_000);
	assert.equal(m["claude-opus-4-8-200k"].contextWindow, 200_000);
	assert.ok(!m["claude-opus-4-8-1m"], "1M is the default here, so no suffixed duplicate");
	// Haiku has no 1M runtime, so 200K stays the unsuffixed default.
	assert.equal(m["claude-haiku-4-5"].contextWindow, 200_000);
	assert.ok(!m["claude-haiku-4-5-200k"]);
	assert.equal(m["claude-opus-4-7"].contextWindow, 1_000_000);
});

test("parseVariantId splits window suffixes and leaves base ids intact", () => {
	assert.deepEqual(parseVariantId("claude-opus-4-8"), { baseId: "claude-opus-4-8" });
	assert.deepEqual(parseVariantId("claude-opus-4-8-200k"), { baseId: "claude-opus-4-8", forced: "200k" });
	assert.deepEqual(parseVariantId("claude-fable-5-1m"), { baseId: "claude-fable-5", forced: "1m" });
});

test("claudeCodeModelId: unsuffixed id follows the config default", () => {
	assert.equal(claudeCodeModelId({ id: "claude-fable-5" }, settings("auto")), "claude-fable-5");
	assert.equal(claudeCodeModelId({ id: "claude-fable-5" }, settings("1m")), "claude-fable-5[1m]");
	assert.equal(claudeCodeModelId({ id: "claude-opus-4-8" }, settings("auto")), "claude-opus-4-8[1m]");
	assert.equal(claudeCodeModelId({ id: "claude-opus-4-8" }, settings("200k")), "claude-opus-4-8");
});

test("claudeCodeModelId: a suffixed id forces its window regardless of config", () => {
	assert.equal(claudeCodeModelId({ id: "claude-opus-4-8-200k" }, settings("auto")), "claude-opus-4-8");
	assert.equal(claudeCodeModelId({ id: "claude-opus-4-8-200k" }, settings("1m")), "claude-opus-4-8");
	assert.equal(claudeCodeModelId({ id: "claude-fable-5-1m" }, settings("200k")), "claude-fable-5[1m]");
	assert.equal(claudeCodeModelId({ id: "claude-opus-4-6-1m" }, settings("auto")), "claude-opus-4-6[1m]");
});

test("claudeCodeModelId throws when a model has no runtime for the requested window", () => {
	assert.throws(() => claudeCodeModelId({ id: "claude-haiku-4-5-1m" }, settings("auto")));
	assert.throws(() => claudeCodeModelId({ id: "claude-opus-4-7-200k" }, settings("auto")));
});

test("claudeCodeModelId: unsuffixed id falls back to the sole window, matching the picker entry", () => {
	assert.equal(claudeCodeModelId({ id: "claude-haiku-4-5" }, settings("1m")), "claude-haiku-4-5");
	assert.equal(claudeCodeModelId({ id: "claude-opus-4-7" }, settings("200k")), "claude-opus-4-7");
});

// Shaped like the host catalog's anthropic entries (incl. a dated alias).
const CATALOG = [
	{ id: "claude-haiku-4-5", name: "Claude Haiku 4.5", contextWindow: 200_000, thinking: { efforts: ["minimal", "low", "medium", "high", "xhigh"] } },
	{ id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", contextWindow: 200_000 },
	{ id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", contextWindow: 1_000_000, thinking: { efforts: ["low", "medium", "high", "xhigh", "max"] } },
	{ id: "claude-opus-5", name: "Claude Opus 5", contextWindow: 1_000_000, thinking: { efforts: ["low", "medium", "high", "xhigh", "max"] } },
	{ id: "claude-opus-5-5", name: "Claude Opus 5.5", contextWindow: 1_000_000, thinking: { efforts: ["low", "medium", "high", "xhigh", "max"] } },
	{ id: "claude-haiku-5-5", name: "Claude Haiku 5.5", contextWindow: 1_000_000, thinking: { efforts: ["low", "medium", "high", "xhigh", "max"] } },
	{ id: "claude-fable-5-1", name: "Claude Fable 5.1", contextWindow: 1_000_000 },
	{ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", contextWindow: 1_000_000, thinking: { efforts: ["low", "medium", "high"] } },
];

test("buildModels: every catalog model is kept, dated aliases dropped, newest first per family", () => {
	const ids = buildModels(CATALOG).map((m) => m.id);
	assert.deepEqual(ids, [
		"claude-fable-5-1",
		"claude-opus-5-5", "claude-opus-5",
		"claude-sonnet-5-5", "claude-sonnet-4-6",
		"claude-haiku-5-5", "claude-haiku-4-5",
	]);
	assert.deepEqual(buildModels(CATALOG).find((m) => m.id === "claude-opus-5-5").thinking, CATALOG[4].thinking);
});

test("5.5 models: Opus/Sonnet 5.5 default to 1M with a 200K alternate", () => {
	const m = Object.fromEntries(buildVariantModels(buildModels(CATALOG), settings("auto")).map((v) => [v.id, v]));
	assert.equal(m["claude-opus-5-5"].contextWindow, 1_000_000);
	assert.equal(m["claude-opus-5-5"].name, "Claude Opus 5.5 (1M)");
	assert.equal(m["claude-opus-5-5-200k"].contextWindow, 200_000);
	assert.equal(m["claude-sonnet-5-5"].contextWindow, 1_000_000);
	assert.equal(m["claude-sonnet-5-5-200k"].contextWindow, 200_000);
	assert.equal(claudeCodeModelId(m["claude-opus-5-5"], settings("auto")), "claude-opus-5-5[1m]");
	assert.equal(claudeCodeModelId(m["claude-opus-5-5-200k"], settings("auto")), "claude-opus-5-5");
	assert.equal(claudeCodeModelId(m["claude-sonnet-5-5"], settings("auto")), "claude-sonnet-5-5[1m]");
});

test("Haiku 5.5 defaults to 1M; Fable 5.1 defaults to 200K with a -1m alternate", () => {
	const m = Object.fromEntries(buildVariantModels(buildModels(CATALOG), settings("auto")).map((v) => [v.id, v]));
	assert.equal(m["claude-haiku-5-5"].contextWindow, 1_000_000);
	assert.equal(m["claude-haiku-5-5-200k"].contextWindow, 200_000);
	assert.equal(claudeCodeModelId(m["claude-haiku-5-5"], settings("auto")), "claude-haiku-5-5[1m]");
	assert.equal(m["claude-fable-5-1"].contextWindow, 200_000);
	assert.equal(claudeCodeModelId(m["claude-fable-5-1-1m"], settings("auto")), "claude-fable-5-1[1m]");
});

test("unmeasured 1M catalog models default to 200K and offer 1M as -1m", () => {
	const unknown = [{ id: "claude-opus-6", name: "Claude Opus 6", contextWindow: 1_000_000 }];
	const m = Object.fromEntries(buildVariantModels(buildModels(unknown), settings("auto")).map((v) => [v.id, v]));
	assert.equal(m["claude-opus-6"].contextWindow, 200_000);
	assert.equal(claudeCodeModelId(m["claude-opus-6"], settings("auto")), "claude-opus-6");
	assert.equal(claudeCodeModelId(m["claude-opus-6-1m"], settings("auto")), "claude-opus-6[1m]");
});

test("resolveModel: family shortcuts pick the newest model; exact ids win", () => {
	const models = buildModels(CATALOG);
	assert.equal(resolveModel(models, "opus").id, "claude-opus-5-5");
	assert.equal(resolveModel(models, "sonnet").id, "claude-sonnet-5-5");
	assert.equal(resolveModel(models, "haiku").id, "claude-haiku-5-5");
	assert.equal(resolveModel(models, "claude-opus-5").id, "claude-opus-5");
});

test("claudeCodeEffort: clamps to the model's effort ladder and supports max", () => {
	const [opus55] = buildModels(CATALOG).filter((m) => m.id === "claude-opus-5-5");
	const sonnet46 = buildModels(CATALOG).find((m) => m.id === "claude-sonnet-4-6");
	const haiku45 = buildModels(CATALOG).find((m) => m.id === "claude-haiku-4-5");
	assert.equal(claudeCodeEffort(opus55, "xhigh"), "xhigh");
	assert.equal(claudeCodeEffort(opus55, "max"), "max");
	assert.equal(claudeCodeEffort(opus55, "minimal"), "low");
	assert.equal(claudeCodeEffort(opus55, "off"), undefined);
	// thinkingLevelMap override (sonnet-4-6 has no real xhigh).
	assert.equal(claudeCodeEffort(sonnet46, "xhigh"), "max");
	assert.equal(claudeCodeEffort(haiku45, "max"), "xhigh");
	// No ladder: legacy table.
	assert.equal(claudeCodeEffort({}, "xhigh"), "max");
	assert.equal(claudeCodeEffort({}, "high"), "high");
});
