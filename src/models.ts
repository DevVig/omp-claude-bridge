// Model selection + display-order policy for the model picker. The picker is
// driven by the host's anthropic catalog: models appear (and disappear) with it,
// so new Claude releases show up without a code change. Extracted from index.ts
// so tests can import without activating the extension.
// `resolveModel` resolves family shortcuts (opus/sonnet/haiku) to the newest
// matching id regardless of sort order; sort order only drives picker display.

const TWO_HUNDRED_K_CONTEXT = 200_000;
const ONE_M_CONTEXT = 1_000_000;

// The catalog ships dated snapshot ids (claude-opus-4-5-20251101, ...) alongside
// the bare ids. They are never exposed - and must not steal partial-match
// shortcuts like "opus-4-5" from the bare id.
function isDatedAlias(id: string): boolean {
	return /-20\d{6}$/.test(id);
}

// Family tiers for display order: flagship families first; unknown families
// sink below all known ones.
const FAMILY_ORDER = ["fable", "mythos", "opus", "sonnet", "haiku"];

// Version rank of a claude id, e.g. claude-opus-4-7 -> ["opus", 4, 7]. Shared by
// the display sort and resolveModel's newest-first partial tiebreak.
function versionRank(id: string): { family: string; tuple: [number, number] } {
	const [, family, major, minor] = id.split("-");
	return { family, tuple: [Number(major) || 0, Number(minor) || 0] };
}

function compareModelIds(a: string, b: string): number {
	const fa = FAMILY_ORDER.indexOf(versionRank(a).family);
	const fb = FAMILY_ORDER.indexOf(versionRank(b).family);
	const ta = fa === -1 ? FAMILY_ORDER.length : fa;
	const tb = fb === -1 ? FAMILY_ORDER.length : fb;
	if (ta !== tb) return ta - tb;
	const ra = versionRank(a).tuple;
	const rb = versionRank(b).tuple;
	if (ra[0] !== rb[0]) return rb[0] - ra[0];
	if (ra[1] !== rb[1]) return rb[1] - ra[1];
	return a.localeCompare(b);
}

// Workaround for models whose catalog entry over-advertises xhigh. Sonnet 5 and
// Sonnet 4.6 top out at "max" with no real xhigh (verified via Claude Code's
// supportedModels API), so xhigh->max matches opus-4-6.
const DEFAULT_THINKING_LEVEL_MAPS: Record<string, Record<string, string>> = {
	"claude-sonnet-5": { xhigh: "max" },
	"claude-sonnet-4-6": { xhigh: "max" },
};

// Project the catalog's anthropic entries down to the fields OMP's registerProvider
// expects, newest generation first. Context-dependent display labels are applied
// after plan/long-context config is known.
export function buildModels<T extends { id: string; [key: string]: any }>(piAiModels: T[]) {
	return piAiModels
		.filter((m) => typeof m.id === "string" && m.id.startsWith("claude-") && !isDatedAlias(m.id))
		.sort((a, b) => compareModelIds(a.id, b.id))
		// Forward thinking + thinkingLevelMap: OMP derives the selectable effort
		// ladder from `thinking.efforts`, and per-model overrides (e.g. opus-4-7
		// mapping xhigh->xhigh instead of xhigh->max) feed the effort lookup.
		.map(({ id, name, reasoning, input, contextWindow, maxTokens, thinking, thinkingLevelMap }) => ({
			id,
			name,
			reasoning, input, contextWindow, maxTokens, thinking,
			thinkingLevelMap: thinkingLevelMap ?? DEFAULT_THINKING_LEVEL_MAPS[id],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		}));
}

// Effort levels Claude Code accepts, lowest to highest.
const CLAUDE_CODE_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ClaudeCodeEffort = (typeof CLAUDE_CODE_EFFORTS)[number];

// Map an OMP thinking level onto a Claude Code effort for this model. An explicit
// thinkingLevelMap entry wins; otherwise use the level itself when the model's
// catalog ladder supports it, else the highest supported effort below it.
// Without a ladder, fall back to the legacy table (xhigh->max).
export function claudeCodeEffort(
	model: { thinkingLevelMap?: Record<string, string> | null; thinking?: { efforts?: readonly string[] } | null },
	level: string,
): ClaudeCodeEffort | undefined {
	if (level === "off" || level === "inherit") return undefined;
	const mapped = model.thinkingLevelMap?.[level];
	if (mapped != null) return mapped as ClaudeCodeEffort;
	const wanted = level === "minimal" ? "low" : level;
	const rank = CLAUDE_CODE_EFFORTS.indexOf(wanted as ClaudeCodeEffort);
	if (rank === -1) return undefined;
	const efforts = model.thinking?.efforts;
	if (!efforts?.length) return wanted === "xhigh" ? "max" : wanted as ClaudeCodeEffort;
	for (let i = rank; i >= 0; i--) {
		if (efforts.includes(CLAUDE_CODE_EFFORTS[i])) return CLAUDE_CODE_EFFORTS[i];
	}
	return "low";
}

// User-selectable context-window policy (see provider.contextWindow in config).
//   "auto"  - per-model default policy (measured SDK behavior).
//   "1m"    - prefer 1M: request [1m] where the model supports it.
//   "200k"  - prefer 200K: request bare model ids.
export type ContextWindowMode = "auto" | "1m" | "200k";

export type LongContextSettings = {
	plan: "pro" | "max";
	longContextExtraUsage: boolean;
	contextWindow: ContextWindowMode;
};

export type ClaudeCodeRuntimeModel = {
	cliModelId: string;
	contextWindow: number;
};

// A model as seen by the runtime resolvers. contextWindow is the catalog window
// and only decides 1M capability for models without a measured row below.
type RuntimeModelInput = { id: string; contextWindow?: number | null };

// Measured Claude Agent SDK subscription/OAuth behavior. The `[1m]` suffix is the
// reliable way to request 1M; bare ids serve 200K, except bare Opus 4.7 which
// serves 1M and has no 200K runtime. Do not infer the default from the catalog's
// advertised contextWindow: an unentitled `[1m]` id is rejected outright (400/429),
// which is worse than serving 200K, so only measured-good ids default to 1M.
const ONE_M_ONLY_BARE = new Set(["claude-opus-4-7"]);

// 1M-capable per measurement, even where an older catalog advertises 200K.
const MEASURED_ONE_M_CAPABLE = new Set([
	"claude-fable-5-1",
	"claude-fable-5",
	"claude-opus-5-5",
	"claude-opus-5",
	"claude-opus-4-8",
	"claude-opus-4-7",
	"claude-opus-4-6",
	"claude-sonnet-5-5",
	"claude-sonnet-5",
	"claude-sonnet-4-6",
	"claude-haiku-5-5",
]);

// 200K-only per measurement, even if a catalog advertises more.
const MEASURED_TWO_HUNDRED_K_ONLY = new Set(["claude-haiku-4-5"]);

// "auto" defaults to 1M for these: [1m] measured to serve 1M on every plan.
const AUTO_ONE_M = new Set([
	"claude-opus-5-5",
	"claude-opus-5",
	"claude-opus-4-8",
	"claude-opus-4-7",
	"claude-sonnet-5-5",
	"claude-sonnet-5",
	"claude-haiku-5-5",
]);

// "auto" defaults to 1M only when the plan allows it.
const PLAN_GATED_ONE_M: Record<string, (settings: LongContextSettings) => boolean> = {
	// [1m] measured 1M on Max plan / extra usage; 429 on Pro without it.
	"claude-opus-4-6": (settings) => settings.plan === "max" || settings.longContextExtraUsage,
	// [1m] measured 1M with extra usage only.
	"claude-sonnet-4-6": (settings) => settings.longContextExtraUsage,
};

function supportsOneM(model: RuntimeModelInput): boolean {
	if (MEASURED_TWO_HUNDRED_K_ONLY.has(model.id)) return false;
	return MEASURED_ONE_M_CAPABLE.has(model.id) || (model.contextWindow ?? 0) >= ONE_M_CONTEXT;
}

// Returns null when a model has no runtime for the requested window.
export function resolveClaudeCodeRuntimeModel(model: RuntimeModelInput, settings: LongContextSettings): ClaudeCodeRuntimeModel | null {
	switch (settings.contextWindow) {
		case "1m":
			return resolveForcedOneMRuntimeModel(model);
		case "200k":
			return resolveForcedTwoHundredKRuntimeModel(model);
		case "auto":
			return resolveAutoRuntimeModel(model, settings);
	}
}

function resolveAutoRuntimeModel(model: RuntimeModelInput, settings: LongContextSettings): ClaudeCodeRuntimeModel | null {
	const planGate = PLAN_GATED_ONE_M[model.id];
	const preferOneM = ONE_M_ONLY_BARE.has(model.id) || AUTO_ONE_M.has(model.id) || (planGate != null && planGate(settings));
	return preferOneM
		? resolveForcedOneMRuntimeModel(model)
		// Unmeasured models default to bare id at 200K, the safe default.
		: resolveForcedTwoHundredKRuntimeModel(model);
}

function resolveForcedOneMRuntimeModel(model: RuntimeModelInput): ClaudeCodeRuntimeModel | null {
	if (!supportsOneM(model)) return null;
	const cliModelId = ONE_M_ONLY_BARE.has(model.id) ? model.id : `${model.id}[1m]`;
	return { cliModelId, contextWindow: ONE_M_CONTEXT };
}

function resolveForcedTwoHundredKRuntimeModel(model: RuntimeModelInput): ClaudeCodeRuntimeModel | null {
	if (ONE_M_ONLY_BARE.has(model.id)) return null;
	return { cliModelId: model.id, contextWindow: TWO_HUNDRED_K_CONTEXT };
}

// The window the unsuffixed id maps to: the configured preference, or the sole
// available window when the preferred one has no runtime (e.g. Haiku 4.5 under
// "1m", Opus 4.7 under "200k").
function resolveDefaultRuntimeModel(model: RuntimeModelInput, settings: LongContextSettings): ClaudeCodeRuntimeModel | null {
	return resolveClaudeCodeRuntimeModel(model, settings)
		?? resolveForcedOneMRuntimeModel(model)
		?? resolveForcedTwoHundredKRuntimeModel(model);
}

// Split a registered picker id into its base model id and the forced window it
// encodes. Variant ids carry a "-1m"/"-200k" suffix (see buildVariantModels); the
// unsuffixed id maps to the config default. Base ids never end in those suffixes,
// so the split is unambiguous.
export function parseVariantId(id: string): { baseId: string; forced?: "1m" | "200k" } {
	if (id.endsWith("-1m")) return { baseId: id.slice(0, -3), forced: "1m" };
	if (id.endsWith("-200k")) return { baseId: id.slice(0, -5), forced: "200k" };
	return { baseId: id };
}

// model.contextWindow is the catalog window for base entries, or the variant's
// window for registered entries; either way it resolves the same runtime.
export function claudeCodeModelId(model: RuntimeModelInput, settings: LongContextSettings): string {
	const { baseId, forced } = parseVariantId(model.id);
	const base = { id: baseId, contextWindow: model.contextWindow };
	const runtimeModel = forced === "1m"
		? resolveForcedOneMRuntimeModel(base)
		: forced === "200k"
			? resolveForcedTwoHundredKRuntimeModel(base)
			: resolveDefaultRuntimeModel(base, settings);
	if (runtimeModel == null) {
		const requested = forced ?? settings.contextWindow;
		throw new Error(`claude-bridge: model ${model.id} has no Claude Code runtime (contextWindow=${requested})`);
	}
	return runtimeModel.cliModelId;
}

export function resolveModel<T extends { id: string }>(models: T[], input: string): T | undefined {
	const lower = input.toLowerCase();
	// Exact first, then the newest partial match, so "opus" means the newest Opus
	// and a longer id (claude-fable-5-1) cannot shadow an exact one (claude-fable-5).
	return models.find((m) => m.id === lower)
		?? newestPartialMatch(models.filter((m) => m.id.includes(lower)));
}

function newestPartialMatch<T extends { id: string }>(candidates: T[]): T | undefined {
	if (candidates.length === 0) return undefined;
	return candidates.reduce((best, m) => {
		const [vm, vbest] = [versionRank(m.id).tuple, versionRank(best.id).tuple];
		const newer = vm[0] !== vbest[0] ? vm[0] > vbest[0] : vm[1] > vbest[1];
		return newer ? m : best;
	});
}

function variantName(baseName: string, contextWindow: number): string {
	const label = contextWindow === ONE_M_CONTEXT ? "1M" : "200K";
	// Strip any window hint pi-ai already baked into the name so we don't double it.
	const base = baseName.replace(/\s*(?:\((?:1M|200K)\)|\b1M\b)\s*$/i, "").trimEnd();
	return `${base} (${label})`;
}

// Expand each model into one registered entry per context window it supports, so
// the user picks the window on demand from OMP's model picker. The unsuffixed id
// (e.g. claude-opus-4-8) maps to the config default window; every other available
// window gets a "-1m"/"-200k" suffixed id. Each entry's contextWindow must match
// the window the bridge actually requests (see claudeCodeModelId), or OMP's status
// bar and auto-compaction threshold will misreport. Both windows stay pickable
// regardless of provider.contextWindow, which only picks the default.
export function buildVariantModels<T extends { id: string; name: string; contextWindow?: number | null }>(
	models: T[],
	settings: LongContextSettings,
): T[] {
	const result: T[] = [];
	for (const m of models) {
		const available: Array<{ kind: "1m" | "200k"; contextWindow: number }> = [];
		if (resolveForcedOneMRuntimeModel(m) != null) available.push({ kind: "1m", contextWindow: ONE_M_CONTEXT });
		if (resolveForcedTwoHundredKRuntimeModel(m) != null) available.push({ kind: "200k", contextWindow: TWO_HUNDRED_K_CONTEXT });
		if (available.length === 0) continue;

		// The config default decides which window is unsuffixed.
		const defaultRuntime = resolveDefaultRuntimeModel(m, settings);
		const defaultKind: "1m" | "200k" = defaultRuntime?.contextWindow === ONE_M_CONTEXT ? "1m" : "200k";

		const ordered = [
			...available.filter((a) => a.kind === defaultKind),
			...available.filter((a) => a.kind !== defaultKind),
		];
		for (const { kind, contextWindow } of ordered) {
			const id = kind === defaultKind ? m.id : `${m.id}-${kind}`;
			result.push({ ...m, id, contextWindow, name: variantName(m.name, contextWindow) });
		}
	}
	return result;
}
