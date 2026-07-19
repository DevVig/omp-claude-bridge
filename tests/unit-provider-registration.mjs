import test from "node:test";
import assert from "node:assert/strict";

import { registerClaudeProvider, releaseClaudeProviderStream } from "../src/provider-registration.ts";

test("every initialization queues registration while the first stream remains active", () => {
	const registrations = [];
	const pi = {
		registerProvider(name, config) {
			registrations.push({ name, config });
		},
	};
	const models = [];
	const first = () => {};
	const second = () => {};
	const third = () => {};

	registerClaudeProvider(pi, models, first);
	registerClaudeProvider(pi, models, second);

	assert.equal(registrations.length, 2);
	assert.deepEqual(registrations.map(({ name }) => name), ["claude-bridge", "claude-bridge"]);
	assert.equal(registrations[0].config.streamSimple, first);
	assert.equal(registrations[1].config.streamSimple, first);
	assert.equal(registrations[0].config.models, models);
	assert.equal(registrations[1].config.models, models);

	releaseClaudeProviderStream(second);
	registerClaudeProvider(pi, models, third);
	assert.equal(registrations[2].config.streamSimple, first);

	releaseClaudeProviderStream(first);
	registerClaudeProvider(pi, models, third);
	assert.equal(registrations[3].config.streamSimple, third);

	releaseClaudeProviderStream(third);
});
