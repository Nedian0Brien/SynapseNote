# SynapseNote Agent Guide

Keep changes compatible with the public repository and standalone clone experience.

## Start here

- Read [README.md](./README.md) for the project overview.
- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before changing dependencies, release behavior, or exported docs.
- Use Bun 1.3.13 or newer and Node.js 24 or newer.

## Commands

```bash
bun install
bun run check
bun run build
```

During development:

```bash
bun run format
bun run lint
bun run typecheck
bun run test
```

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

Run the smallest relevant check while iterating, then run:

```bash
bun run check
```

For UI or editor changes, also run the affected tests from `packages/app`.
