# Upstream synchronization through 2026-10-23

Source: [elidickinson/pi-claude-bridge at 6aa276a1498e5376363f5c1f8cf04bfcaee38c93](https://github.com/elidickinson/pi-claude-bridge/tree/6aa276a1498e5376363f5c1f8cf04bfcaee38c93), package version 0.9.3.
Target: DevVig/omp-claude-bridge 0.8.1 (`fd403e4`), with OMP 18.13.2.

## Scope

The runtime is synchronized as a complete snapshot, including upstream changes
after the 0.9.3 release through October 23. This includes tool-id pairing and
parallel results, JSON Schema MCP transport and combinator flattening, images
and carried attachments, mid-turn/queued steering, continuing-run cancellation,
immutable finalized messages, per-session mirrors, stale-query teardown,
synthetic failure notices, reasoning usage, rate-limit response metadata,
prompt capture/inheritance, safer config persistence, lazy log paths,
auto-memory/MCP suppression, and native summarizer coexistence.

The Agent SDK is pinned to 0.3.308, the version used by the imported snapshot;
cc-session-io is updated to 0.4.0. Upstream unit scenarios, recorded fixtures,
live integration scenarios and diagnostics are included with OMP adaptations.
Historical diagnostic Markdown remains attributed to the original Pi runs.

## OMP adaptations

- The extension keeps the `omp.extensions` manifest and OMP package imports.
  Compatibility helpers provide the upstream transcript-replay and formatting
  APIs; native OMP APIs supply schema conversion and compaction definitions.
- OMP exposes ordered `string[]` prompt blocks without Pi's structured
  `systemPromptOptions`. The adapter joins the blocks consistently and captures
  the complete effective prompt as custom instructions. It never rediscovers
  rules or skills. Existing upstream projection/guard behavior remains for
  structured legacy inputs and inherited prompts.
- Native tool schemas are converted with OMP's `toolWireSchema` before the
  upstream MCP server exposes them as JSON Schema.
- OMP developer-role reminders are retained as Claude Code system-reminder
  blocks, including image content, in fresh requests and rebuilt transcripts.
- OMP's `session_switch` replaces Pi's `session_start.reason` handling.
  Starting or closing a child session preserves other sessions' mirrors.
  Provider lookup uses `hasProvider`, and AskClaude uses OMP's renderer/schema APIs.
- OMP summaries use the exported native summarization prompt rather than Pi's
  `cacheRetention: none` marker. They still use isolated, non-persistent SDK queries;
  the extension does not claim ownership of compaction or branch summaries.
- OMP's branch-summary transport may replace the original abort signal and
  assign a fresh request id. Its credential resolver still receives the owning
  session id. A registry-local adapter carries that id through the bridge's
  unused credential/resolver; real credentials and other providers are unchanged.
  This preserves the correct cwd during concurrent summaries.
- Models are populated from OMP's Anthropic catalog. OMP thinking metadata and
  the port's on-demand context-window picker are retained. The automatic 1M
  policy follows the imported upstream measurement table, including newer models.
- Tests run in separate Bun processes because OMP imports Bun-only modules.
  The Pi-specific source-layout inventory and renderer pins are replaced by
  tests of real OMP prompt construction, native summaries and a CLI smoke.

## Migration

1. Upgrade OMP to at least 18.13.2 and use Bun >=1.4.4.
2. AskClaude now requires `askClaude.enabled: true`; it is deprecated upstream.
3. Claude Code auto-memory defaults to off; opt in with `provider.autoMemoryEnabled`.
4. `provider.appendSystemPrompt` and `provider.settingSources` are retired.
   Use OMP's prompt/context/skills controls. Its effective instructions are preserved.
5. `provider.contextWindow` and `-1m` / `-200k` picker ids remain available.
   Automatic Fable 5 routing now follows upstream's 1M measurement; its 200K
   alternate remains selectable. `forceTwoHundredK` overrides all 1M choices.
6. When a default window is unsupported, the unsuffixed entry uses the supported
   window consistently for both picker metadata and the SDK request. An explicitly
   suffixed unsupported window is rejected.

No model's served window was newly measured for this port. Runtime mappings are
inherited from the documented upstream evidence. The tests verify registration
metadata and requested ids, not Anthropic's plan entitlement or served capacity.

## Verification

Run `bun run typecheck`, `bun run test`, and `bun run test:smoke`.
The unit suite exercises native OMP compaction ownership (native, extension,
decline, cancellation and failure), concurrent compaction and tree summaries in
different directories, prompt/skill/rule preservation, native schema conversion,
parent/child lifecycle isolation, and upstream stream/session regressions.
The CLI smoke launches OMP 18.13.2 with controlled SDK output and isolated state.

These automated checks need no Claude credentials and make no paid model requests.

Manual verification on 2026-10-28 also exercised OMP 18.13.2 with the real
Agent SDK 0.3.308 and a first-party Claude Code subscription login:

- A print/JSON request to `claude-haiku-4-5` returned the exact requested marker.
- A two-turn RPC session executed OMP's native `read` through the MCP bridge,
  returned the file's marker, then recalled it in the next turn without another
  tool invocation.

This does not establish all models' entitlements, served context windows,
mobile-client behavior, or every live integration scenario. The remaining
`tests/int-*` scenarios and `diag/` probes require a separately authenticated
environment; their inclusion does not claim they were all rerun.
