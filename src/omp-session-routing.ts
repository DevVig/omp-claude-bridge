import type { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";

const PREFIX = "not-used:claude-bridge-session:";
const INSTALLED = Symbol.for("claude-bridge:ompResolverRouting");
const SESSION = Symbol.for("claude-bridge:ompResolverSession");

/**
 * OMP's branch summarizer supplies its session id to registry.resolver(), but
 * omits it from stream options; oneshot retries also replace the hook's signal.
 * The bridge has no API credential: Claude Code authenticates independently.
 * Carry that otherwise-lost id in our unused key, leaving every other
 * provider's resolver and credential rotation untouched.
 */
export function installOmpSessionRouting(registry: ModelRegistry): void {
	if (!registry || typeof registry.resolver !== "function" || registry[INSTALLED]) return;
	const original = registry.resolver;
	registry.resolver = function (target: any, options?: any): any {
		const provider = typeof target === "string" ? target : target.provider;
		const sessionId = typeof options === "string" ? options : options?.sessionId;
		if (provider === "claude-bridge" && typeof sessionId === "string") {
			return Object.assign(async () => `${PREFIX}${sessionId}`, { [SESSION]: sessionId });
		}
		return original.call(this, target, options);
	};
	Object.defineProperty(registry, INSTALLED, { value: true });
}

export function ompSessionFromKey(key: unknown): string | undefined {
	if (typeof key === "function") return key[SESSION];
	return typeof key === "string" && key.startsWith(PREFIX) ? key.slice(PREFIX.length) || undefined : undefined;
}
