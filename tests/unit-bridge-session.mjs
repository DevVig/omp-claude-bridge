import test from "node:test";
import assert from "node:assert/strict";

import { bridgeSession, bridgeSessions } from "../src/bridge-session.ts";

test("each provider sessionId owns its Claude Code session", () => {
	const mainStates = new Map();
	const childStates = new Map();
	const main = bridgeSession("main", mainStates);
	const side = bridgeSession("main:side:1", mainStates);
	const child = bridgeSession("child", childStates);

	assert.equal(bridgeSession("main", mainStates), main);
	assert.notEqual(side, main);
	assert.notEqual(child, main);
	assert.deepEqual([...mainStates.keys()], ["claude-bridge:main", "claude-bridge:main:side:1"]);
	assert.deepEqual([...childStates.keys()], ["claude-bridge:child"]);

	main.state = { sessionId: "cc-main", cursor: 6, cwd: "/repo" };
	child.state = { sessionId: "cc-child", cursor: 2, cwd: "/repo" };
	assert.equal(side.state, null);
	assert.equal(bridgeSession("main", mainStates).state.cursor, 6);

	for (const session of [main, side, child]) session.close();
	assert.equal(bridgeSessions.size, 0);
});

test("AskClaude finds the provider's session by sessionId", () => {
	const states = new Map();
	const provider = bridgeSession("main", states);
	assert.equal(bridgeSession("main"), provider);
	provider.close();
});

test("closing a session forgets its state", () => {
	const states = new Map();
	const session = bridgeSession("closed", states);
	session.state = { sessionId: "cc", cursor: 0, cwd: "/repo" };
	session.close();
	assert.equal(session.state, null);
	assert.notEqual(bridgeSession("closed", states), session);
	bridgeSession("closed").close();
});

test("requests without a sessionId share nothing", () => {
	const states = new Map();
	assert.notEqual(bridgeSession(undefined, states), bridgeSession(undefined, states));
	assert.equal(states.size, 0);
});
