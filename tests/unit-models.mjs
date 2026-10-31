import test from "node:test";
import assert from "node:assert/strict";

import { MODEL_IDS_IN_ORDER, buildModels, resolveModel } from "../src/models.ts";

const catalog = [
	...MODEL_IDS_IN_ORDER.map((id, index) => ({
		id,
		name: `Catalog model ${index}`,
		api: "anthropic-messages",
		provider: "anthropic",
		baseUrl: "https://api.anthropic.com",
		reasoning: index % 2 === 0,
		thinking: { mode: "anthropic-adaptive", efforts: ["low", "high"], effortMap: { low: "low", high: "max" } },
		input: index % 2 === 0 ? ["text", "image"] : ["text"],
		cost: { input: index, output: index + 1, cacheRead: index + 2, cacheWrite: index + 3 },
		premiumMultiplier: index + 0.5,
		contextWindow: 200_000 + index,
		maxTokens: 32_000 + index,
		headers: { "x-catalog-index": String(index) },
		compat: { supportsStore: index % 2 === 0 },
	})).reverse(),
	{ id: "unrelated-model", name: "Not registered" },
];

test("buildModels returns one canonical entry per configured model in picker order", () => {
	const models = buildModels(catalog);

	assert.deepEqual(models.map(({ id }) => id), MODEL_IDS_IN_ORDER);
	assert.equal(new Set(models.map(({ id }) => id)).size, MODEL_IDS_IN_ORDER.length);
});

test("buildModels preserves provider metadata and omits source routing fields", () => {
	const models = buildModels(catalog);
	const expected = MODEL_IDS_IN_ORDER.map((id) => {
		const { api: _api, provider: _provider, baseUrl: _baseUrl, ...metadata } = catalog.find((model) => model.id === id);
		return metadata;
	});

	assert.deepEqual(models, expected);
	assert.ok(models.every((model) => model.api == null && model.provider == null && model.baseUrl == null));
});

test("buildModels omits canonical IDs missing from the catalog", () => {
	const available = catalog.filter(({ id }) => id === MODEL_IDS_IN_ORDER[1] || id === MODEL_IDS_IN_ORDER[5]);

	assert.deepEqual(buildModels(available).map(({ id }) => id), [MODEL_IDS_IN_ORDER[1], MODEL_IDS_IN_ORDER[5]]);
});

test("resolveModel supports exact and ordered partial lookup", () => {
	const models = buildModels(catalog);

	assert.equal(resolveModel(models, MODEL_IDS_IN_ORDER[5])?.id, MODEL_IDS_IN_ORDER[5]);
	assert.equal(resolveModel(models, "OPUS")?.id, MODEL_IDS_IN_ORDER[1]);
	assert.equal(resolveModel(models, "does-not-exist"), undefined);
});
