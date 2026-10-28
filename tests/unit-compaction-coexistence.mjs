import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { initializeExtensions } from "@oh-my-pi/pi-coding-agent/modes/runtime-init";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import { it } from "node:test";
import assert from "node:assert/strict";
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } from "@oh-my-pi/pi-coding-agent/extensibility/legacy-pi-coding-agent-shim";
import activate, { __test } from "../src/index.js";
import { activateWithMockPi } from "./lib/mock-pi.mjs";

it("bridge leaves compaction and branch-summary ownership to Pi and other extensions", () => {
	const handlers = activateWithMockPi();
	try {
		const ctx = { sessionManager: { getSessionId: () => "coexistence" } };
		for (const name of ["session_before_compact", "session_before_tree"]) {
			assert.equal(handlers.get(name)({ signal: new AbortController().signal }, ctx), undefined);
		}
	}
	finally { handlers.get("session_shutdown")({}, { sessionManager: { getSessionId: () => "coexistence" } }); }
});

// Real Pi session, extension runner, native summarizer and bridge provider. Only
// Claude Code query is replaced; no network, credentials or paid subprocesses.
for (const owner of ["extension", "native", "declining-extension", "cancel", "error"]) {
	it(`compaction owner: ${owner}`, { timeout: 10000 }, async () => {
		const calls = [];
		let closed = 0;
		__test.setQuery(({ prompt, options }) => {
			calls.push({ prompt, options });
			return {
				async *[Symbol.asyncIterator]() {
					yield owner === "error"
						? { type: "result", subtype: "error_during_execution", errors: ["controlled summary failure"] }
						: { type: "result", subtype: "success", result: "Controlled native summary" };
				},
				close() { closed++; },
				async interrupt() {},
			};
		});
		const manager = SessionManager.inMemory(process.env.CLAUDE_BRIDGE_TEST_ROOT);
		for (let i = 0; i < 4; i++) {
			manager.appendMessage({ role: "user", content: `turn ${i} ` + "context ".repeat(200), timestamp: i * 2 });
			manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "answer ".repeat(200) }], api: "claude-bridge", provider: "claude-bridge", model: "claude-sonnet-4-6", stopReason: "stop", usage: { input: 2000, output: 200, cacheRead: 0, cacheWrite: 0, totalTokens: 2200, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, timestamp: i * 2 + 1 });
		}
		const settings = Settings.isolated({ "compaction.enabled": false, "compaction.reserveTokens": 1000, "compaction.keepRecentTokens": 50, "compaction.methodOrder": ["soft"], "retry.enabled": false });
		const observed = [];
		const loader = new DefaultResourceLoader({
			cwd: process.env.CLAUDE_BRIDGE_TEST_ROOT, agentDir: process.env.PI_CODING_AGENT_DIR,
			settingsManager: settings, noExtensions: true, noSkills: true,
			noPromptTemplates: true, noThemes: true, noContextFiles: true,
			extensionFactories: [activate, (pi) => {
				if (owner !== "native" && owner !== "error") pi.on("session_before_compact", (event) => {
					if (owner === "cancel") return { cancel: true };
					if (owner === "declining-extension") return undefined;
					return { compaction: { summary: "Extension-owned summary", firstKeptEntryId: event.preparation.firstKeptEntryId, tokensBefore: event.preparation.tokensBefore, details: { owner: "extension" } } };
				});
				pi.on("session_compact", (event) => observed.push(event));
			}],
		});
		let session;
		try {
			await loader.reload();
			assert.deepEqual(loader.getExtensions().errors, []);
			({ session } = await createAgentSession({ cwd: process.env.CLAUDE_BRIDGE_TEST_ROOT, agentDir: process.env.PI_CODING_AGENT_DIR, resourceLoader: loader, sessionManager: manager, settingsManager: settings, noTools: "all", model: buildModel({ id: "claude-sonnet-4-6", name: "Controlled bridge", api: "claude-bridge", provider: "claude-bridge", baseUrl: "claude-bridge", reasoning: false, input: ["text"], contextWindow: 200000, maxTokens: 8192, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }) }));
			await initializeExtensions(session, { reportSendError: (_action, error) => { throw error; }, reportRuntimeError: error => { throw new Error(error.error); } });
			if (owner === "cancel" || owner === "error") {
				await assert.rejects(session.compact(), owner === "cancel" ? /cancelled/ : /controlled summary failure/);
				assert.equal(manager.getBranch().filter(e => e.type === "compaction").length, 0);
				assert.equal(observed.length, 0);
			} else {
				const result = await session.compact();
				assert.match(result.summary, owner === "extension" ? /Extension-owned summary/ : /Controlled native summary/);
				assert.equal(observed.length, 1);
				assert.equal(observed[0].fromExtension, owner === "extension");
				assert.equal(manager.getBranch().find(e => e.type === "compaction").summary, result.summary);
			}
			if (owner === "extension" || owner === "cancel") assert.equal(calls.length, 0);
			else {
				if (owner === "error") assert.equal(calls.length, 2, "OMP starts history and turn-prefix summaries in parallel");
				else assert.equal(calls.length, 3, "OMP produces history, turn-prefix and short summaries");
				for (const { options } of calls) {
					assert.equal(options.persistSession, false);
					assert.deepEqual(options.tools, []);
					assert.equal(typeof options.systemPrompt, "string");
					assert.match(options.systemPrompt, /summarization/);
				}
				assert.equal(closed, calls.length);
			}
		} finally {
			if (session) await session.extensionRunner.emit({ type: "session_shutdown" });
			session?.dispose();
			__test.setQuery(null);
		}
	});
}
