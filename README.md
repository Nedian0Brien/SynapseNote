# SynapseNote

SynapseNote is a local-first Markdown and MDX workspace with a WYSIWYG editor, graph navigation, GitHub sync, and side-by-side AI collaboration through Claude, Codex, OpenCode, Pi, and other agent harnesses.

The hosted SynapseNote service is available at [synapse.lawdigest.kr](https://synapse.lawdigest.kr), and this repository contains the web editor, CLI, collaboration server, and macOS desktop app.

![SynapseNote editor with an AI agent drafting a launch recap](assets/hero.webp)

## Features

- WYSIWYG Markdown and MDX editing
- macOS desktop app and local web UI
- File navigation, search, tabs, backlinks, and graph view
- Side-by-side AI chat and editing
- MCP, skills, and agentic search for knowledge bases
- Git and GitHub based sync and sharing
- Embeddable HTML and rich document components

## Develop locally

SynapseNote requires Bun 1.3.13 or newer and Node.js 24 or newer.

```bash
git clone https://github.com/Nedian0Brien/SynapseNote.git
cd SynapseNote
bun install
bun run check
```

For the shortest useful feedback loop, use the narrowest command that covers
your change:

```bash
# One unit or DOM test file
bun run test:file -- packages/core/src/markdown/implicit-math-promoter.test.ts

# A fixed feature contract, affected package, or final repository gate
bun run check:domain -- database
bun run check:package -- app
bun run check:changed
bun run check:repository
```

`bun run check` remains an alias for the final repository gate. Use
`check:changed` or a domain manifest during local iteration; the PR workflow
uses the same affected package graph and keeps the repository-wide gate for
root configuration changes, `main`, and final approval.

The feedback workflow preserves machine-readable JUnit results and slow-test
reports. Scheduled runs repeat server unit tests with deterministic seeds and
run the browser smoke tiers; a manual workflow dispatch can select only a
failed server shard. To refresh the local cold/warm timing report, use
`BASELINE_REPEATS=3 bun run measure:test-feedback`.

For the RFC performance evidence, use `SERVER_SHARD_REPEATS=3 bun run
measure:server-shards` and run `PR_GATE_REPEATS=10 bun run measure:pr-gate --
--scenario=app-only|server-only|cross-package`. The workflow dispatch exposes
the same server-shard and PR-gate benchmarks and stores operations metrics with
the JUnit artifact. Package/repository jobs also record wall-clock duration and
Turbo summary cache evidence; artifacts are retained for 30 days. To produce a weekly report from retained metrics artifacts,
place the JSON files under one directory and run
`bun run measure:operations -- --input=./path/to/operations --output=./path/to/weekly-operations.json --require-weeks=4`.
Nightly also downloads retained feedback artifacts and publishes an operations
report; the four-week check remains informational until four weekly buckets
exist.

Run the web editor:

```bash
bun run --filter @nedian0brien/synapsenote-app dev
```

Build the CLI and use the new command name:

```bash
bun run --filter @nedian0brien/synapsenote build
node packages/cli/dist/cli.mjs init
```

The packaged CLI exposes `synapsenote`. The legacy `ok` command and `.ok` project metadata remain supported so existing workspaces continue to open without migration.

## Repository layout

- `packages/app` - web app and editor UI
- `packages/cli` - CLI and package entrypoint
- `packages/core` - shared domain logic
- `packages/desktop` - Electron desktop app
- `packages/plugin` - agent integration package
- `packages/server` - local collaboration server
- `docs` - documentation site

## Contributions

Issues and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) before making changes.

## License and upstream

SynapseNote is licensed under the [GNU General Public License v3.0 or later](./LICENSE). It is derived from the OpenKnowledge project; upstream copyright and third-party attribution are preserved in the repository history and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
