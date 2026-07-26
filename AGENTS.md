# SynapseNote Agent Guide

Keep changes compatible with the public repository and standalone clone experience.

## Start here

- Read [README.md](./README.md) for the project overview.
- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before changing dependencies, release behavior, or exported docs.
- Use Bun 1.3.13 or newer and Node.js 24 or newer.

## Commands

```bash
bun install
bun run build
```

`bun run check` is the compatibility alias for the final repository gate. Do
not use it as the default loop for every local edit.

During development:

```bash
# Use the narrowest command that covers the change.
bun run test:file -- <test-path>
bun run check:domain -- <domain>
bun run check:package -- <app|server|core|cli|desktop>
bun run check:changed
bun run check:pr
```

Use the broader format/lint/typecheck commands for focused iterations when
needed. Use `bun run check:repository` (or its compatibility alias
`bun run check`) for cross-package, PR-final, `main`, and release verification—
not for every local edit. `check:pr` is the local affected-package PR plan.
Server test tasks are split into `test:unit`, `test:database`,
`test:filesystem`, `test:git`, `test:process`, and `test:contract`;
process-sensitive tasks can be run with deterministic `--shard=INDEX/COUNT`
arguments.

When adding tests, keep the test boundaries explicit:

- App DOM tests must use the `*.dom.test.tsx` suffix so the unit runner cannot
  execute them accidentally.
- Every new server test file must be registered exactly once in
  `packages/server/scripts/server-test-manifest.ts` under its execution
  category. Verify the manifest with
  `bun run --filter @nedian0brien/synapsenote-server test:manifest`.
- For a database/editor change, prefer `check:domain -- database` or the
  affected package before escalating to the repository gate.

The PR workflow stores JUnit and slow-test artifacts. Scheduled runs add
deterministic shuffle seeds, leak checks, and repeated browser suites, while a
manual `server_shard` input reruns one failed server shard. Use
`BASELINE_REPEATS=3 bun run measure:test-feedback` when refreshing timing
evidence; keep the resulting report free of local paths and debug logs.
For RFC SLO evidence, use `SERVER_SHARD_REPEATS=3 bun run measure:server-shards`
and `PR_GATE_REPEATS=10 bun run measure:pr-gate -- --scenario=<app-only|server-only|cross-package>`.
The workflow dispatch has matching benchmark inputs and uploads the resulting
reports plus operations metrics for retention. Package/repository metrics include
wall-clock duration and Turbo cache evidence. Aggregate four weeks of retained
metrics with `bun run measure:operations -- --input=./path/to/operations
--output=./path/to/weekly-operations.json --require-weeks=4`.
The nightly workflow also downloads retained artifacts and publishes the
weekly report; the four-week guard is informational until four weekly buckets
exist.

These `measure:*` commands are evidence/benchmark commands, not routine
development checks. In the current RFC scope, E-03/F-02/F-05 operational
evidence is explicitly waived; run repeated PR-gate, server-shard, or four-week
operations measurements only when the user explicitly requests new evidence.

Run local apps:

```bash
bun run --filter @nedian0brien/synapsenote-app dev

cd docs
bun run dev
```

## Repository layout

- `packages/app` - web app and editor UI
- `packages/cli` - CLI and package entrypoint
- `packages/core` - shared domain logic
- `packages/desktop` - Electron desktop app
- `packages/plugin` - agent integration package
- `packages/server` - local collaboration server
- `docs` - documentation site

## Public repository rules

- Do not add secrets, private customer context, internal-only specs, local paths, or generated debug artifacts.
- Keep dependency updates paired with `bun.lock`.
- Run `bun run notices` when third-party notices may change.
- Preserve upstream copyright and license notices.

## Changesets

Every behavior-changing pull request includes a `.changeset/<kebab-name>.md` file.

- Use at least `'@nedian0brien/synapsenote': patch` in front matter.
- SynapseNote is pre-1.0: use `minor` only for breaking or unusually large changes and never use `major`.
- Write user-facing release-note copy and avoid internal ticket references.
- Skip changesets for docs-only, test-only, or CI-only changes with no runtime impact.

## Before finishing

Run the smallest relevant check while iterating. For local desktop packaging or
installation workflow changes, run:

```bash
bun run check:desktop:local
```

For completed desktop or editor work, run the affected tests and:

```bash
bun run check:desktop
```

Reserve the repository-wide check for cross-package changes, PR readiness, or
release verification:

```bash
bun run check
```

For UI or editor changes, also run the affected tests from `packages/app`.
