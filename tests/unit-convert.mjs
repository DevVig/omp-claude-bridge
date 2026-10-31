import test from "node:test";
import assert from "node:assert/strict";

import { convertPiMessages, isPromptRole } from "../src/convert.ts";

test("isPromptRole: user and developer are user turns; others are not", () => {
	assert.equal(isPromptRole("user"), true);
	assert.equal(isPromptRole("developer"), true);
	assert.equal(isPromptRole("assistant"), false);
	assert.equal(isPromptRole("toolResult"), false);
});

test("convertPiMessages: developer messages become user turns; empty ones are dropped", () => {
	const { anthropicMessages } = convertPiMessages([
		{ role: "user", content: "hi", timestamp: 0 },
		{ role: "assistant", content: [{ type: "text", text: "hello" }], timestamp: 0 },
		{ role: "developer", content: "<system-reminder>call yield</system-reminder>", timestamp: 0 },
		{ role: "developer", content: [{ type: "text", text: "array form" }], timestamp: 0 },
		{ role: "developer", content: "   ", timestamp: 0 },
		{ role: "developer", content: [], timestamp: 0 },
	]);
	assert.deepEqual(anthropicMessages.map((m) => m.role), ["user", "assistant", "user", "user"]);
	assert.equal(anthropicMessages[2].content, "<system-reminder>call yield</system-reminder>");
	assert.deepEqual(anthropicMessages[3].content, [{ type: "text", text: "array form" }]);
});
