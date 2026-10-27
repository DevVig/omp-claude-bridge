# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Fixed
- Claude Code session-limit notices are reported as rate-limit errors without
  emitting them as assistant text, allowing OMP to use its model fallback chain.

## [0.9.0] - 2026-10-27

### Added
- Every Claude model in OMP's bundled Anthropic catalog is registered, instead of
  a hardcoded list: Opus 5.5, Opus 5, Sonnet 5.5, Haiku 5.5, Fable 5.1,
  Mythos 5 / 5.1, Opus 4.5 and Sonnet 4.5 are now available, and future catalog
  models appear without a code change. Dated snapshot aliases stay hidden.
- Opus 5.5 / Opus 5 / Sonnet 5.5 / Haiku 5.5 default to 1M (`[1m]`) with a `-200k` alternate.
  Unmeasured 1M-capable models default to 200K with a `-1m` alternate.
- `max` thinking level, for both the provider and AskClaude's `thinking` parameter.

### Changed
- Thinking levels map onto each model's catalog effort ladder (e.g. `xhigh`
  stays `xhigh` on Opus 5.5), clamping down where a level is unsupported.
- AskClaude `opus` / `sonnet` / `haiku` shortcuts resolve to the newest model in
  that family.
- OMP 18 compatibility: imports go through the host-shimmed `@earendil-works/*`
  packages.

### Fixed
- Unsuffixed picker entries whose preferred window has no runtime (Haiku 4.5
  under `"1m"`, Opus 4.7 under `"200k"`) no longer throw on request; they use
  the model's only window, matching what the picker shows.

## [0.8.1] - 2026-07-07

### Fixed
- Spurious "Claude rate limit warning" toasts at trivial utilization. The Claude
  Agent SDK emits `allowed_warning` rate-limit events even at ~1% of the
  `seven_day` (weekly) limit; these are now surfaced only at ≥80% utilization.
  Hard-limit (`rejected`) notifications and the debug log are unchanged.

## [0.8.0] - 2026-07-07

### Added
- On-demand context-window variants in the `/model` picker: each model is now
  registered once per window it supports (1M and/or 200K) as a distinct,
  clearly-labeled entry (e.g. `Opus 4.8 (1M)` and `Opus 4.8 (200K)`). Switching
  a model's context window is a picker selection instead of a config edit plus
  reload.
- Suffixed model ids (`<model>-1m` / `<model>-200k`) that force a specific
  window regardless of the global default — usable from `modelRoles` and
  AskClaude short names. The unsuffixed id remains the config default, so
  existing `config.yml` roles keep working.

### Changed
- `provider.contextWindow` now sets the **default** window (which window the
  unsuffixed model id maps to) instead of hiding models that don't match it.
  Both windows stay pickable wherever a runtime exists.
- Each variant reports its true `contextWindow`, keeping the status bar and
  auto-compaction accurate for the selected window.

## [0.7.0] - 2026-07-06

First public release of the Oh My Pi port.

### Added
- `provider.contextWindow` setting with three modes:
  - `"auto"` (default) — per-model context policy based on measured SDK behavior.
  - `"1m"` — force the 1M context window; only 1M-capable models are registered.
  - `"200k"` — force the 200K context window; only 200K-capable models are registered.
- Models without a runtime for the selected forced window are hidden from the
  model picker instead of being misreported.
- `thinkingLevelMap` fallback so Sonnet 5 / Sonnet 4.6 expose `xhigh` (mapped to `max`).

### Changed
- Ported from Pi (`@earendil-works/*`) to Oh My Pi (`@oh-my-pi/*`): extension
  manifest (`omp.extensions`), provider registration, message conversion, and
  config directory resolution (`~/.omp/agent/claude-bridge.json`).
- Corrected the `claude-fable-5` context policy: the bare `claude-fable-5`
  runtime serves 200K (verified), while `claude-fable-5[1m]` serves 1M. In
  `"auto"` mode Fable 5 now registers at 200K.

### Credits
- Original `pi-claude-bridge` by [Eli Dickinson](https://github.com/elidickinson).
- Oh My Pi port and context-window controls by [Jonathan Borgwing](https://github.com/DevVig).
