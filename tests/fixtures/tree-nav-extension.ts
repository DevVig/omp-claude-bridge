// Test extension: drives session-tree navigation with summarization, which is
// otherwise only reachable through the interactive UI.
//
// `ctx.navigateTree(id, { summarize: true })` is what makes pi summarize the
// abandoned branch through pi's native summarizer.
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent/extensibility/legacy-pi-coding-agent-shim";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("rewind-summarize", {
		description: "Rewind to the first user entry, summarizing the branch left behind",
		handler: async (_args, ctx) => {
			const entries = ctx.sessionManager.getBranch();
			const target = entries.find((e: any) => e.type === "message" && e.message?.role === "user");
			if (!target) throw new Error("rewind-summarize: no user entry to rewind to");
			const result = await ctx.navigateTree((target as any).id, { summarize: true });
			ctx.ui?.notify?.(`rewind-summarize: cancelled=${result.cancelled}`, "info");
		},
	});
}
