# Task: OMP Cloud Bridge Compatibility
**Date Started**: 2026-07-19
**Status**: Complete
**Agent Lead**: ⚙️

## Plan
### Objective
Stabilize `omp-claude-bridge` against OMP 17.0.5 and Claude Agent SDK 0.3.215 / Claude Code 2.1.215. Prevent the provider from disappearing after subagent initialization, expose only canonical OMP model entries, delegate context control to `omp-ccwindow`, and leave authentication entirely to the official Agent SDK.

### Approach
- Register the provider on every extension initialization while preserving the first process-global `streamSimple` owner.
- Release that owner only on `session_shutdown`; ordinary session lifecycle events reset session state only.
- Remove bridge-owned context variants, routing, plan metadata, and model aliases.
- Preserve canonical OMP Anthropic model metadata and pass canonical IDs to Agent SDK queries.
- Keep authentication pass-through: no bridge login, token storage, credential inspection, or credential injection.
- Align Claude and OMP dependencies with the approved versions and refresh the live plugin link.

### Tasks
- ✅ Fix provider registration lifecycle and add its regression test.
- ✅ Replace context-window variants with canonical model registration and tests.
- ✅ Remove entitlement/context config and document the authentication boundary.
- ✅ Upgrade Agent SDK, peers, and OMP dependencies.
- ✅ Run install, typecheck, unit, version, plugin, model-surface, authentication, and context-plugin verification.
- ✅ Run focused code review and silent-failure review.

## Implementation Log
### 2026-07-19 - Plan Approved
- **Changes Made**: Recorded the approved compatibility plan for execution.
- **Files Modified**: `documentation/planned/improvements/2026-07-19_omp-cloud-bridge-compatibility.md`
- **Decisions**: OMP owns the native picker; `omp-ccwindow` owns runtime context display/compaction overrides; the official Agent SDK owns authentication.
- **Notes for Next Engineer**: The authoritative detailed plan is `local://omp-cloud-bridge-compatibility-plan.md` for this session.

### 2026-07-19 - Provider Registration Lifecycle Complete
- **Changes Made**: Added a process-global stream owner helper that queues `registerProvider` on every extension initialization and releases ownership only when the owning stream shuts down. Split ordinary session resets from provider stream release.
- **Files Modified**: `src/provider-registration.ts`, `src/index.ts`, `tests/unit-provider-registration.mjs`
- **Decisions**: Later subagent module instances reuse the first stream function but still register, matching OMP 17's source-clearing loader lifecycle.
- **Verification**: Focused provider registration test passed; `bun run typecheck` passed.
- **Notes for Next Engineer**: Non-owner release is a no-op; owner release permits a fresh module instance to acquire the stream key.

### 2026-07-19 - Canonical Models Complete
- **Changes Made**: Removed context variants and Claude Code model rewrites. Canonical OMP catalog entries now retain provider-model metadata while source routing fields are omitted so the bridge's custom stream handler remains authoritative. Canonical IDs pass directly to provider, compaction, and AskClaude queries. Replaced variant tests with canonical model tests.
- **Files Modified**: `src/models.ts`, `src/index.ts`, `src/config.ts`, `claude-bridge.example.json`, `tests/unit-models.mjs`; removed `tests/unit-context-window.mjs`
- **Decisions**: `omp-ccwindow` is the sole user-facing OMP context override. The bridge does not infer API capacity or account entitlements.
- **Verification**: Four focused model tests and `bun run typecheck` passed; removed routing symbols have no remaining callsites.
- **Notes for Next Engineer**: OMP provider-model metadata, including thinking capabilities and cost fields, is preserved; `api`, `provider`, and `baseUrl` are intentionally stripped to prevent bypassing `streamSimple`.

### 2026-07-19 - Authentication Pass-through Complete
- **Changes Made**: Removed every Agent SDK `env` option, entitlement config, and credential-adjacent routing. Rewrote README/package metadata to document SDK-owned authentication, subscription/API billing, and Anthropic's current third-party policy boundary.
- **Files Modified**: `src/index.ts`, `src/config.ts`, `claude-bridge.example.json`, `README.md`, `package.json`
- **Decisions**: The bridge supplies no environment or credential material to `query()`; Claude Code inherits and resolves parent authentication itself.
- **Verification**: Credential-handling grep returned no source/test/example callsites; `bun run typecheck` and the full 12-test pre-upgrade suite passed. Both linked Anthropic policy pages were read and matched the documented claims.
- **Notes for Next Engineer**: Existing local login currently uses subscription quota; `ANTHROPIC_API_KEY` uses API billing; policy is explicitly documented as subject to Anthropic change.

### 2026-07-19 - Dependency Alignment Complete
- **Changes Made**: Upgraded Claude Agent SDK to 0.3.215, its direct peers to Anthropic SDK 0.112.3, MCP SDK 1.29.0, and Zod 4.4.3; aligned all OMP development packages and peer minimums to 17.0.5; refreshed `bun.lock`.
- **Files Modified**: `package.json`, `bun.lock`
- **Decisions**: Kept OMP's legacy pi-ai shim imports because OMP 17.0.5 exports and supports them. Left the inactive upstream Pi bridge snapshot untouched.
- **Verification**: `bun install`, `bun run typecheck`, and all 12 unit tests passed. `npm list` resolved all four direct SDK packages without peer errors. Claude Code and Agent SDK both report 2.1.215 parity.
- **Notes for Next Engineer**: The 0.3.142 deprecated v2 session API removal does not affect this repository; it uses `query()`.

### 2026-07-19 - Compatibility Verification Complete
- **Changes Made**: Refreshed only the live OMP bridge link and exercised provider registration, model discovery, local-login authentication, debug logging, and `omp-ccwindow` compatibility.
- **Files Modified**: OMP plugin lock metadata under `~/.omp/plugins`; no `omp-ccwindow` or inactive Pi bridge files changed.
- **Decisions**: Source catalog routing fields are not provider metadata. Preserving Anthropic's `api`, `provider`, or `baseUrl` bypassed `streamSimple` and produced an OMP-side invalid-bearer response; projecting only `ProviderModelConfig` fields fixed the root cause.
- **Verification**: OMP lists one enabled bridge and one enabled `omp-ccwindow`, doctor reports both healthy, the refreshed lock records bridge 0.8.1, and the model surface has seven canonical entries with intact catalog limits and no aliases or labels. With `ANTHROPIC_API_KEY` unset, a debug-enabled Haiku request returned `BRIDGE_AUTH_OK`; bridge/CLI diagnostics contained no credential strings. `omp-ccwindow` typecheck and six tests passed, its source only clones `contextWindow` and calls `setModel`, and the combined bridge model count remains seven.
- **Notes for Next Engineer**: Authentication remained inside Claude Code; the bridge query path emitted `provider: fresh query` and completed normally under the existing local login.

### 2026-07-19 - Review Complete
- **Changes Made**: Ran CodeRabbit, focused lifecycle/model review, code simplification review, and silent-failure review. Restored non-credential Claude Code controls through inherited `process.env` so OMP remains the sole compaction owner and cloud MCP auto-discovery stays disabled without supplying `query()` an env object.
- **Files Modified**: `src/index.ts`, `README.md`, `documentation/active/2026-07-19_omp-cloud-bridge-compatibility.md`
- **Decisions**: Accepted the focused review's autocompaction/cloud-MCP finding and fixed it at extension initialization. Rejected the silent-review suggestion to throw on missing catalog IDs because the approved contract explicitly requires missing IDs to be omitted and tests defend that behavior.
- **Verification**: Initial CodeRabbit review reported zero findings. Focused review found one high-confidence control regression; its targeted re-review returned `Resolved; no findings`. The code simplifier made no changes. The named silent-failure agent could not start because the subagent harness had no selected model, so the same review was completed against the full diff with the slow reviewer; it produced only the contract-conflicting missing-ID suggestion. After the accepted fix, `bun run typecheck`, all 12 unit tests, and a headless local-login smoke returning `BRIDGE_REVIEW_OK` passed. A second CodeRabbit run was attempted but rate-limited for 38 minutes.
- **Notes for Next Engineer**: `query()` intentionally has no `env` field. The extension sets only `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `DISABLE_AUTO_COMPACT`, and `ENABLE_CLAUDEAI_MCP_SERVERS` before any query; authentication variables are neither read nor rewritten.
