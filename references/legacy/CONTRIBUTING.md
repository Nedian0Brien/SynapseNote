# Contributing to SynapseNote

Bug reports, feature requests, and pull requests are welcome.

- [Open an issue](https://github.com/Nedian0Brien/SynapseNote/issues/new/choose) for a bug or feature request.
- Open a pull request against `main` when a change is ready for review.

## Development setup

A fresh clone builds and tests without environment variables:

```bash
bun install
bun run check
```

Run the editor at `http://localhost:5173`:

```bash
bun run --filter @nedian0brien/synapsenote-app dev
```

Build or install a fast local macOS desktop bundle without invoking release
certificate signing:

```bash
bun run build:desktop:local
bun run install:desktop:local
```

The local bundle is written to
`packages/desktop/dist-desktop-local/mac-arm64/SynapseNote.app`, ad-hoc signed,
verified, and installed at `/Applications/SynapseNote.app`. Release builds keep
using the existing signed `build:dir` or `build:mac` paths.

Use the narrowest verification tier that covers the change:

```bash
# One file (L0)
bun run test:file -- packages/core/src/markdown/implicit-math-promoter.test.ts

# A focused domain (L1)
bun run check:domain -- database

# One package, including its typecheck and tests (L2)
bun run check:package -- app

# Git-diff/package-graph affected checks (local PR equivalent)
bun run check:changed
bun run check:pr

# Local desktop packaging/install iteration (a few seconds)
bun run check:desktop:local

# Completed desktop work, including the desktop package test suite
bun run check:desktop

# Cross-package, PR, or release verification
bun run check:repository
```

Do not run the repository-wide check for every local desktop iteration; it also
executes the server's real-Git and process integration suite.

`bun run check` is kept as a compatibility alias for `check:repository`. A
package or domain command must not be treated as permission to omit the final
repository gate before merge. The server package exposes separate
`test:unit`, `test:database`, `test:filesystem`, `test:git`, `test:process`, and
`test:contract` tasks; Git/process tasks are isolated and can be balanced with
`--shard=INDEX/COUNT` when running the underlying server test runner.

The PR feedback workflow runs the affected package/domain matrix and stores
JUnit results. Nightly runs add deterministic shuffle seeds, leak checking, and
repeated browser suites; use the workflow's `server_shard` input to rerun only
one failed server shard. For local timing evidence, run
`BASELINE_REPEATS=3 bun run measure:test-feedback`; failures remain recorded in
`docs/rfcs/0007-test-feedback-baseline/report.json`.
The SLO evidence commands are `SERVER_SHARD_REPEATS=3 bun run
measure:server-shards` and `PR_GATE_REPEATS=10 bun run measure:pr-gate --
--scenario=app-only|server-only|cross-package`; their reports retain failed
measurements instead of converting them to green. Aggregate retained CI
metrics (including wall-clock, cache, flaky, and retry fields) into a weekly report with
`bun run measure:operations -- --input=./path/to/operations --output=./path/to/weekly-operations.json --require-weeks=4`.
The scheduled workflow aggregates retained artifacts automatically and keeps
the four-week check informational until the history is populated.

Run the documentation site:

```bash
cd docs
bun run dev
```

The repository requires Bun 1.3.13 or newer and Node.js 24 or newer.

## Common commands

```bash
bun run format
bun run lint
bun run typecheck
bun run test
bun run build
bun run check
```

## Pull requests

- Keep changes focused and add tests or a clear manual-verification note.
- Add a changeset with `bun run changeset` for user-visible or programmatic behavior changes.
- Run `bun run check` before requesting review.
- Commit `bun.lock` with dependency changes.
- Run `bun run notices` when third-party notices may change.
- Do not include secrets, customer data, local machine paths, or generated debug artifacts.

By contributing, you agree that your contribution is licensed under the repository's [GNU General Public License v3.0 or later](./LICENSE).
