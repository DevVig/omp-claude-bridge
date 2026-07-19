import type { ProviderModelConfig } from "@oh-my-pi/pi-coding-agent";

// Canonical selection + display order for the model picker.
// `resolveModel` returns the first partial match, so `opus` resolves to the first-listed opus entry.
// Extracted from index.ts so tests can import without activating the extension.

export const MODEL_IDS_IN_ORDER = ["claude-fable-5", "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-5", "claude-sonnet-4-6", "claude-haiku-4-5"];

// Select the canonical OMP catalog entries in a stable picker order. Copy only
// provider-model metadata: source routing fields such as `api`, `provider`, and
// `baseUrl` must not override the bridge's custom stream handler.
export function buildModels<T extends ProviderModelConfig>(ompModels: T[]): ProviderModelConfig[] {
	const modelsById = new Map(ompModels.map((model) => [model.id, model]));
	return MODEL_IDS_IN_ORDER.flatMap((id) => {
		const model = modelsById.get(id);
		if (!model) return [];
		return [{
			id: model.id,
			name: model.name,
			reasoning: model.reasoning,
			...(model.thinking ? { thinking: model.thinking } : {}),
			input: model.input,
			cost: model.cost,
			...(model.premiumMultiplier != null ? { premiumMultiplier: model.premiumMultiplier } : {}),
			contextWindow: model.contextWindow,
			maxTokens: model.maxTokens,
			...(model.headers ? { headers: model.headers } : {}),
			...(model.compat ? { compat: model.compat } : {}),
		}];
	});
}

export function resolveModel<T extends { id: string }>(models: T[], input: string): T | undefined {
	const lower = input.toLowerCase();
	return models.find((m) => m.id === lower || m.id.includes(lower));
}
