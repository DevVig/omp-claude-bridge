<div align="center">

<img src="assets/banner.svg" alt="omp-claude-bridge — Run Claude Code natively inside Oh My Pi" width="100%" />

<h1>omp-claude-bridge</h1>

<p><strong>Run Claude Code as a first-class model provider inside <a href="https://omp.sh">Oh My Pi</a> — with native OMP model selection and an AskClaude delegation tool.</strong></p>

<p>
<a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
<img alt="Oh My Pi extension" src="https://img.shields.io/badge/Oh%20My%20Pi-extension-6E56CF">
<img alt="Claude Agent SDK" src="https://img.shields.io/badge/Claude%20Code-Agent%20SDK-D97757">
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
<a href="https://github.com/DevVig/omp-claude-bridge/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/DevVig/omp-claude-bridge/actions/workflows/ci.yml/badge.svg"></a>
<img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg">
</p>

</div>

---

`omp-claude-bridge` lets you drive **Claude Code** — Opus, Sonnet, Haiku, and Fable — from inside Oh My Pi, with every tool call flowing through OMP's native TUI. It also exposes an **AskClaude** tool so any other provider can delegate a task or a second opinion to Claude Code.

Authentication is delegated unchanged to the official [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk). The bridge provides no login flow and does not read, store, validate, log, or inject Claude credentials.

<div align="center">
<a href="assets/claude-bridge1.png"><img src="assets/claude-bridge1.png" width="49%"></a>&nbsp;
<a href="assets/claude-bridge2.png"><img src="assets/claude-bridge2.png" width="49%"></a>
</div>

## Table of contents

- [Features](#features)
- [Install](#install)
- [Quickstart](#quickstart)
- [Authentication and billing](#authentication-and-billing)
- [Context handling](#context-handling)
- [Models](#models)
- [AskClaude tool](#askclaude-tool)
- [Configuration reference](#configuration-reference)
- [How it works](#how-it-works)
- [Debugging](#debugging)
- [Development](#development)
- [Credits](#credits)
- [License](#license)

## Features

- **Claude Code as a provider** — pick Opus / Sonnet / Haiku / Fable from `/model`; tool calls render in OMP's TUI like any native provider.
- **AskClaude delegation tool** — from any other provider, hand a task or question to Claude Code (read-only, no-tools, or full read/write/bash), optionally in an isolated session.
- **Canonical OMP models** — one native picker entry per supported model, with OMP's catalog metadata preserved unchanged.
- **Session resume & persistence** — conversations survive across turns and reconnects.
- **Skills + AGENTS.md forwarding** — your OMP skills and context files are passed into Claude Code's system prompt.
- **Thinking support** — effort levels map through to Claude Code, including `xhigh` on Sonnet models.
- **MCP tool bridging** with strict-config isolation by default.

## Install

```bash
omp plugin install git:github.com/DevVig/omp-claude-bridge
```

<details>
<summary>Other install methods</summary>

```bash
# From the full HTTPS URL
omp plugin install https://github.com/DevVig/omp-claude-bridge

# From a local checkout (great for hacking on it)
git clone https://github.com/DevVig/omp-claude-bridge.git
omp plugin install ./omp-claude-bridge
```

</details>

Requires Oh My Pi (`omp`) and either an existing local Claude Code login or `ANTHROPIC_API_KEY` in the parent environment.

## Quickstart

1. Install the plugin (above).
2. In OMP, run `/model` and choose a `claude-bridge/*` model — for example `claude-bridge/claude-sonnet-5`.
3. Work as usual. Tool calls run through OMP's TUI; Claude Code handles the model turn.

To delegate from another provider instead, just ask: *"Ask Claude to review this plan and poke holes in it."*

## Authentication and billing

The bridge calls the official Claude Agent SDK's `query()` without an `env` override, credential material, auth callback, or login command. Claude Code inherits the parent environment, remains the sole credential resolver, and applies its own authentication precedence. The bridge sets only non-credential runtime controls that suppress nonessential traffic, native Claude Code autocompaction, and Claude.ai cloud MCP auto-discovery.

- An existing local Claude Code login currently draws from the user's Claude subscription quota.
- `ANTHROPIC_API_KEY` uses Anthropic API billing.

The bridge has no login flow and does not handle credentials. Anthropic's [June 15 support update](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) currently says third-party Agent SDK usage draws from subscription limits. The [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk) also says third-party developers may not offer Claude.ai login or rate limits without prior approval. This repository does not claim explicit Anthropic approval; policy and billing behavior are subject to Anthropic change.


## Context handling

The bridge registers exactly one canonical OMP catalog entry per supported model and passes that model ID unchanged to Claude Code. It does not create context-window aliases, rewrite model IDs, or advertise account-entitlement variants.

Use [`omp-ccwindow`](https://github.com/DevVig/omp-ccwindow) when you want to lower OMP's active context value for status display and compaction timing. That plugin changes OMP's local model clone; it does not change the Claude API model's native context capacity.

## Models

The bridge exposes these canonical picker entries:

- `claude-bridge/claude-fable-5`
- `claude-bridge/claude-opus-4-8`
- `claude-bridge/claude-opus-4-7`
- `claude-bridge/claude-opus-4-6`
- `claude-bridge/claude-sonnet-5`
- `claude-bridge/claude-sonnet-4-6`
- `claude-bridge/claude-haiku-4-5`

Bash commands issued by Claude Code get a 120-second default timeout (matching Claude Code's default), since OMP's bash has no timeout by default.

## AskClaude tool

Available whenever the active provider is **not** claude-bridge. Your current model can hand work to Claude Code and wait for the result:

- "Ask Claude to plan a fix."
- "If you get stuck, ask Claude for help."
- "Ask Claude to review the plan in @foo.md, implement it, then ask an `isolated=true` Claude to review the implementation."
- "Ask Claude to poke holes in this theory."
- "Find all the places in the codebase that handle auth."

You can also bake it into a skill or AGENTS.md, e.g. *"Always call AskClaude to review complicated feature implementations before considering the task complete."*

### Parameters

| Parameter | Values | Description |
| --------- | ------ | ----------- |
| `prompt` | string | The question or task for Claude Code. |
| `mode` | `read` (default), `none`, `full` | `read` = read files + web; `full` = read/write/bash. Lock `full` out with `allowFullMode: false`. |
| `model` | `opus` (default), `sonnet`, `haiku`, or a full id | Which Claude model handles the delegation. |
| `thinking` | `off`, `minimal`, `low`, `medium`, `high`, `xhigh` | Effort level. |
| `isolated` | boolean (default `false`) | When `true`, Claude gets a clean session with no conversation history. |

## Configuration reference

Config is read from `~/.omp/agent/claude-bridge.json` (global) and the project OMP config directory `.omp/claude-bridge.json` (project; merged over global). A starter file lives at [`claude-bridge.example.json`](claude-bridge.example.json).

```json
{
  "askClaude": {
    "enabled": true,
    "allowFullMode": true,
    "defaultIsolated": false
  },
  "provider": {
    "strictMcpConfig": true
  }
}
```

**`askClaude`**

| Key | Default | Description |
| --- | ------- | ----------- |
| `enabled` | `true` | Register the AskClaude tool. |
| `name` | `"AskClaude"` | Override the tool's OMP-side name. |
| `label` | `"Ask Claude Code"` | Override the TUI label. |
| `description` | — | Override the tool description shown to the model. |
| `defaultMode` | `"read"` | `"read"`, `"none"`, or `"full"`. |
| `defaultIsolated` | `false` | Start each call in a fresh session. |
| `allowFullMode` | `true` | Allow `mode: "full"`; set `false` to lock it out. |
| `appendSkills` | `true` | Forward OMP's skills block into the system prompt. |

**`provider`**

| Key | Default | Description |
| --- | ------- | ----------- |
| `appendSystemPrompt` | `true` | Append OMP's AGENTS.md and skills. |
| `settingSources` | — | Claude Code filesystem settings to load; only applied when `appendSystemPrompt: false`. |
| `strictMcpConfig` | `true` | Ignore filesystem MCP configuration outside the bridge's OMP tool server; Claude.ai cloud MCP auto-discovery is also disabled. |
| `pathToClaudeCodeExecutable` | — | Path to the `claude` binary, if the bundled one can't run on your OS/filesystem. |

## How it works

OMP's built-in tools are bridged to Claude Code and back, so from your side it behaves like any other OMP provider. On every extension initialization, the bridge registers the canonical OMP Anthropic catalog entries while retaining the parent session's process-global stream function. Agent SDK queries receive the selected canonical model ID and resolve authentication entirely inside Claude Code.

## Debugging

Set `CLAUDE_BRIDGE_DEBUG=1` for detailed logs:

- **Bridge log** — `~/.omp/agent/claude-bridge.log`: every provider call, session-sync decision, tool-result delivery, and Claude Code stderr. Override the path with `CLAUDE_BRIDGE_DEBUG_PATH`.
- **Per-query CLI logs** — `~/.omp/agent/cc-cli-logs/<timestamp>-<tag>-<seq>.log`: the Claude Code subprocess's own debug stream, one file per query. Tags are `provider`, `continuation`, or `askclaude`.

When filing a session-resume bug (e.g. "No conversation found"), the `syncResult:` lines from the bridge log plus the matching `cc-cli-logs/` file are the most useful attachments.

## Development

```bash
git clone https://github.com/DevVig/omp-claude-bridge.git
cd omp-claude-bridge
bun install

bun run typecheck   # tsc --noEmit
bun run test        # node --test unit suite
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow. CI runs typecheck and tests on every push and PR.

## Credits

- Original **[pi-claude-bridge](https://github.com/elidickinson/pi-claude-bridge)** by **[Eli Dickinson](https://github.com/elidickinson)** — the streaming provider, MCP/tool bridging, session resume, and AskClaude tool this project builds on.
- Initial inspiration from [claude-agent-sdk-pi](https://github.com/prateekmedia/claude-agent-sdk-pi) by Prateek Sunal.
- **Oh My Pi port and maintenance** by **[Jonathan Borgwing](https://github.com/DevVig)**.

See [NOTICE](NOTICE) for full attribution.


## License

[MIT](LICENSE) © 2026 Eli Dickinson (original) and Jonathan Borgwing (Oh My Pi port).
