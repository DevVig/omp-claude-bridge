// Real OMP loader/agent loop; only the Claude Code subprocess is controlled.
import { writeFileSync } from "node:fs";
import activate, { __test } from "../../src/index.ts";

__test.setQuery((({ options }) => {
	writeFileSync(process.env.CLAUDE_BRIDGE_SMOKE_TRACE!, JSON.stringify({
		cwd: options.cwd,
		tools: options.tools,
		policyForwarded: options.systemPrompt?.append?.includes("OMP_SMOKE_POLICY"),
		model: options.extraArgs?.model ?? options.model,
	}));
	return {
		async *[Symbol.asyncIterator]() {
			yield { type: "assistant", message: { id: "controlled-omp", content: [{ type: "text", text: "CONTROLLED_OMP_REPLY" }] } };
			yield { type: "result", subtype: "success", result: "CONTROLLED_OMP_REPLY" };
		},
		close() {}, async interrupt() {},
	};
}) as any);

export default activate;
