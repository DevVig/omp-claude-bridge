# Contributing to omp-claude-bridge

Thanks for your interest in improving **omp-claude-bridge**. Contributions of all
sizes are welcome — bug reports, docs fixes, and features alike.

## Getting set up

```bash
git clone https://github.com/DevVig/omp-claude-bridge.git
cd omp-claude-bridge
bun install        # or: npm install
```

Requirements:
- Node.js >= 20
- [Bun](https://bun.sh) (recommended) or npm
- [Oh My Pi](https://omp.sh/) 19.2.1 or newer in the 19.x series for end-to-end testing

## Developing against a live Oh My Pi

Point Oh My Pi at your working copy so changes load on the next run:

```bash
omp plugin link ./omp-claude-bridge  # Run from the parent directory.
```

Enable debug logging while iterating:

```bash
CLAUDE_BRIDGE_DEBUG=1 omp models claude-bridge
# logs -> ~/.omp/agent/claude-bridge.log
```

## Checks before opening a PR

```bash
bun run typecheck   # tsc --noEmit
bun run test        # node --test unit suite
```

Please make sure both pass. CI runs the same two checks on every pull request.

## Coding guidelines

- TypeScript, ESM, tabs for indentation (match the surrounding files).
- Keep model routing changes in `src/models.ts`. It has **no runtime imports**,
  so it stays unit-testable in isolation — add a case to
  `tests/unit-context-window.mjs` when you touch context routing.
- Context-window behavior is derived from **measured** Claude Agent SDK output,
  not advertised metadata. If you change a model mapping, note how you verified
  the served window (the `result: served contextWindow=...` debug line).

## Reporting bugs

Open an issue using the bug template. A `~/.omp/agent/claude-bridge.log` excerpt
(run with `CLAUDE_BRIDGE_DEBUG=1`) makes bugs far easier to reproduce.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
