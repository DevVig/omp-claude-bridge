import type { Context as OmpContext, Model as OmpModel, Api, Message } from "@oh-my-pi/pi-ai";

/** The bridge uses text after normalizing OMP's ordered system-prompt blocks. */
export type Context = Omit<OmpContext, "systemPrompt"> & {
	systemPrompt?: string;
};

/** Also accepted by the upstream transcript-replay tests and legacy callers. */
export interface SystemMessage {
	role: string;
	content?: unknown;
	sections?: Record<string, string | null>;
	toolsAdded?: any[];
	toolsRemoved?: Array<{ name: string }>;
	timestamp?: number;
}

export type Model<T extends Api = Api> = OmpModel<T> & {
	thinkingLevelMap?: Record<string, string | number | null>;
};

export function systemPromptText(prompt: string | readonly string[] | undefined): string | undefined {
	return Array.isArray(prompt) ? prompt.join("\n\n") : prompt as string | undefined;
}

/** Claude Code's transcript has no developer role; keep OMP's reminders visible. */
export function normalizeOmpMessages(messages: Message[]): Message[] {
	if (!messages.some((message) => message.role === "developer")) return messages;
	return messages.map((message) => {
		if (message.role !== "developer") return message;
		const content = typeof message.content === "string"
			? [{ type: "text" as const, text: message.content }] : message.content;
		return {
			...message, role: "user" as const,
			content: [{ type: "text" as const, text: '<system-reminder source="omp">\n' },
				...content, { type: "text" as const, text: "\n</system-reminder>" }],
		};
	});
}
