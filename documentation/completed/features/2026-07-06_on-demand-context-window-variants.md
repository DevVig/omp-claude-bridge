# Task: On-demand context-window model variants (Option A)
**Date Started**: 2026-07-06
**Status**: Complete
**Agent Lead**: 🏗️/⚙️

## Plan

### Objective
Let the user choose a Claude model's context window **on demand** from OMP's native `/model` picker, by registering each model at every window it supports (1M and/or 200K) as a distinct, clearly-labeled entry. Switching window = pick the other entry. Keep `provider.contextWindow` from config as the **default** (it decides which window the plain, unsuffixed model id maps to). No new UI, no runtime command.

### Current behavior (why there's nothing to select today)
- Context window is a single **global** choice in `~/.omp/agent/claude-bridge.json` (`provider.contextWindow: auto|1m|200k`), read **once at load**; changing it needs a `/reload`. Not per-model, not on-demand.
- OMP models carry a fixed `contextWindow`; there is no native per-model window knob (unlike thinking level's `setThinkingLevel`). Varying the window therefore requires registering variant models.
- `src/models.ts` today: `applyLongContext` filters to **one** variant per model from the global mode; `claudeCodeModelId(model, settings)` maps a pi model id → Claude Code cli id using the global settings; `resolveForcedOneMRuntimeModel` / `resolveForcedTwoHundredKRuntimeModel` already hold each model's 1M/200K cli id (or `null` when unavailable).

### Approach — variant scheme (per model, in MODEL_IDS_IN_ORDER)
- **Available windows** = union of { 1M if `resolveForcedOneMRuntimeModel` ≠ null, 200K if `resolveForcedTwoHundredKRuntimeModel` ≠ null }. Independent of config, so both are pickable wherever a runtime exists.
- **Default window** = the window `resolveClaudeCodeRuntimeModel(id, settings)` returns for the current config (auto respects `plan`/`longContextExtraUsage`; `1m`/`200k` force), falling back to the model's only available window when the preferred one has no runtime.
- **Unsuffixed id** (e.g. `claude-opus-4-8`) = the default-window variant → preserves existing ids, roles, and the user's `config.yml`.
- **Each other available window** gets a suffixed id: `${baseId}-1m` / `${baseId}-200k`.
- **Display name** = `${baseName} (1M)` / `${baseName} (200K)` on every entry, for unambiguous labeling.
- **`contextWindow`** on each entry = its true window (keeps status bar + auto-compaction accurate).

Resulting picker (config = `auto`, Pro plan):

| Label | Picker id | CC cli id | Window |
| --- | --- | --- | --- |
| Opus 4.8 (1M) | `claude-opus-4-8` | `claude-opus-4-8[1m]` | 1M (default) |
| Opus 4.8 (200K) | `claude-opus-4-8-200k` | `claude-opus-4-8` | 200K |
| Opus 4.7 (1M) | `claude-opus-4-7` | `claude-opus-4-7` | 1M (only) |
| Opus 4.6 (200K) | `claude-opus-4-6` | `claude-opus-4-6` | 200K (default) |
| Opus 4.6 (1M) | `claude-opus-4-6-1m` | `claude-opus-4-6[1m]` | 1M |
| Fable 5 (200K) | `claude-fable-5` | `claude-fable-5` | 200K (default) |
| Fable 5 (1M) | `claude-fable-5-1m` | `claude-fable-5[1m]` | 1M |
| Sonnet 5 (1M) | `claude-sonnet-5` | `claude-sonnet-5[1m]` | 1M (default) |
| Sonnet 5 (200K) | `claude-sonnet-5-200k` | `claude-sonnet-5` | 200K |
| Sonnet 4.6 (200K) | `claude-sonnet-4-6` | `claude-sonnet-4-6` | 200K (default) |
| Sonnet 4.6 (1M) | `claude-sonnet-4-6-1m` | `claude-sonnet-4-6[1m]` | 1M |
| Haiku 4.5 (200K) | `claude-haiku-4-5` | `claude-haiku-4-5` | 200K (only) |

Unsuffixed ids all keep their current default-per-config behavior, so `modelRoles.default: claude-bridge/claude-opus-4-8` still resolves and still gets 1M.

### Code changes
1. **`src/models.ts`**
   - Add `parseVariantId(id)` → `{ baseId, forced?: "1m" | "200k" }` (suffix-aware; base ids never collide with `-1m`/`-200k`).
   - Update `claudeCodeModelId(model, settings)`: if the id is suffixed, return the forced runtime's cli id (ignore global mode); else keep the existing default-per-config path.
   - Add `buildVariantModels(models, settings)` that expands each model into its window variants (default-first ordering, labels, `contextWindow`). Replace `applyLongContext`; remove it (no back-compat shim).
2. **`src/index.ts`**
   - Line ~1634: register `buildVariantModels(MODELS, longContextSettings)` instead of `applyLongContext(...)`.
   - The three `claudeCodeModelId` call sites (≈366 compact, ≈1251 streaming, ≈1463 AskClaude) stay unchanged — variant parsing is internal.
3. **`tests/unit-*.mjs`** — expansion (ids/windows/cli ids/labels), default selection per config (auto/1m/200k × plan/extraUsage), fallbacks (opus-4-7 under `200k`, haiku under `1m`), no duplicate windows, `claudeCodeModelId` round-trips for suffixed + unsuffixed ids.
4. **`README.md`** — update "Context window controls" + "Models": variants in the picker, config sets the default, keep the per-model table; note the entitlement caveat.

### Tasks
- [ ] models.ts: `parseVariantId` + variant-aware `claudeCodeModelId`
- [ ] models.ts: `buildVariantModels` (default-first, labels, contextWindow); remove `applyLongContext`
- [ ] index.ts: swap registration to `buildVariantModels`
- [ ] Unit tests: expansion + id mapping + config defaults + fallbacks
- [ ] README updates
- [ ] `bun run typecheck` + `bun run test` green; manual `/model` check in OMP after `/reload`

### Risks / notes
- The default window has no suffixed alias (it's the unsuffixed id); a role hardcoded to that suffix breaks only when config flips that window to default. Common case (`auto`) is stable. Documented.
- Entitlement: forced-1M variants may be **served** at 200K by the subscription (issue #18); `logServedContextWindow` already surfaces the gap. The picker offers the request; runtime may differ.
- Picker grows 7 → ~12 entries; grouped default-first, acceptable.
- `resolveModel` partial-match (AskClaude short names) unchanged: `"opus"` → first opus = default variant. Bonus: AskClaude can target `-200k` / `-1m` explicitly.
- Single `registerProvider` retained → subagent re-registration guard unaffected.
- User `config.yml` (`modelRoles.default`, `enabledModels: claude-bridge/*`) keeps working: unsuffixed id preserved, wildcard enables all variants.

### Out of scope (MVP)
- `/ctx` runtime command (Option B).
- Removing the config knob (kept as default, per decision).
- Per-window cost/thinking differences (none exist today).

## Implementation Log

### 2026-07-06 — Implemented (Option A), all checks green
- **`src/models.ts`**: added exported `parseVariantId(id)` splitting `-1m`/`-200k` suffixes; made `claudeCodeModelId` variant-aware (suffixed id → forced runtime, ignores config; unsuffixed → config default). Replaced `applyLongContext` with `buildVariantModels` + a `variantName` helper — labels each entry `(1M)`/`(200K)`, sets the true `contextWindow`, orders default-first, offers both windows wherever a runtime exists, and makes the unsuffixed id the config default (falling back to the sole available window).
- **`src/index.ts`**: import + registration now call `buildVariantModels(MODELS, longContextSettings)`. The three `claudeCodeModelId` call sites (compact ~366, streaming ~1251, AskClaude ~1463) unchanged — parsing is internal. `applyLongContext` fully removed (grep-confirmed no remaining refs).
- **`tests/unit-context-window.mjs`**: rewritten for variants — 10 tests covering auto/Pro expansion (12 entries; ids/windows/labels), default-first ordering, auto/Max default flip (Opus 4.6), `200k` & `1m` config defaults + fallbacks (Opus 4.7, Haiku), the no-duplicate-window invariant, `parseVariantId`, and `claudeCodeModelId` round-trips (unsuffixed follows config, suffixed forces window, throws for impossible combos).
- **`README.md`**: "Context window controls" + "Models" rewritten — variants in `/model`, `provider.contextWindow` now sets the *default* (no longer hides models), added "Windows offered per model" table + entitlement caveat, updated the picker-id table.
- **Verification**: `bun run typecheck` clean; `bun run test` → 10/10 pass.
- **Deployment**: the plugin is symlinked into OMP (`~/.omp/plugins/node_modules/omp-claude-bridge` → this repo), so the change goes live after a `/reload` in the OMP TUI.

### Notes / follow-ups
- Not done (out of scope, no explicit ask): version bump + CHANGELOG entry (still `0.7.0`). Adding variants changes the registered model set, so consider `0.8.0` before publishing.
- Manual `/model` visual check must be done in the running OMP after `/reload` (can't drive the TUI from here).
