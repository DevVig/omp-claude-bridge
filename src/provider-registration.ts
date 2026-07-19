import type { ExtensionAPI, ProviderConfig } from "@oh-my-pi/pi-coding-agent";

const ACTIVE_STREAM_SIMPLE_KEY = Symbol.for("claude-bridge:activeStreamSimple");

type StreamSimple = NonNullable<ProviderConfig["streamSimple"]>;
type ProviderRegistrar = Pick<ExtensionAPI, "registerProvider">;

export function registerClaudeProvider(
	pi: ProviderRegistrar,
	models: NonNullable<ProviderConfig["models"]>,
	candidateStream: StreamSimple,
): void {
	const globalState = globalThis as Record<symbol, StreamSimple | undefined>;
	const activeStream = globalState[ACTIVE_STREAM_SIMPLE_KEY] ?? candidateStream;
	globalState[ACTIVE_STREAM_SIMPLE_KEY] = activeStream;

	pi.registerProvider("claude-bridge", {
		baseUrl: "claude-bridge",
		apiKey: "not-used",
		api: "claude-bridge",
		models,
		streamSimple: activeStream,
	});
}

export function releaseClaudeProviderStream(candidateStream: StreamSimple): void {
	const globalState = globalThis as Record<symbol, StreamSimple | undefined>;
	if (globalState[ACTIVE_STREAM_SIMPLE_KEY] === candidateStream) {
		delete globalState[ACTIVE_STREAM_SIMPLE_KEY];
	}
}
