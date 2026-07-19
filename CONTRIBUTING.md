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
# Local desktop packaging/install iteration (a few seconds)
bun run check:desktop:local

# Completed desktop work, including the desktop package test suite
bun run check:desktop

# Cross-package, PR, or release verification
bun run check
```

Do not run the repository-wide check for every local desktop iteration; it also
executes the server's real-Git and process integration suite.

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
