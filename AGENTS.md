# SynapseNote Agent Guide

Keep changes compatible with the public repository and standalone clone experience.

## Start here

- Read [README.md](./README.md) for the project overview.
- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before changing dependencies, release behavior, or exported docs.
- Use Bun 1.3.13 or newer and Node.js 24 or newer.

## Default work lifecycle

Use this lifecycle for every implementation task unless the user explicitly asks
for a different workflow.

### 1. Isolate the work

- Before editing files, create a dedicated `codex/<task-name>` branch and linked
  Git worktree from the intended base commit.
- Make all task changes, dependency installs, generated files, checks, and app
  launches inside that worktree.
- Do not implement directly on `main`, reuse the primary worktree, or mix the
  task with an existing dirty worktree.
- Preserve unrelated user changes. Never move, discard, or absorb them into the
  task branch.

### 2. Verify, commit, and push

- Run the smallest relevant checks while iterating and all checks required by
  the affected area before presenting the work as ready.
- Commit only the intended task changes with a focused commit message.
- Push the task branch to `origin` before reporting the implementation as ready
  for user review.
- Progress updates may describe status or blockers, but do not claim completion
  before the commit and push succeed. If either is blocked, report the exact
  blocker and leave the worktree intact.

### 3. Launch for user verification

- After pushing, launch the relevant runnable surface from the task worktree and
  keep it available for the user to inspect. Use the web editor by default, the
  desktop app for desktop-specific work, and the docs site for docs UI changes.
- In the review handoff, provide the branch name, commit, checks run, how to
  access the running app, and a concise list of the exact behaviors or screens
  the user should verify.
- If the task has no applicable runnable surface, say so explicitly and point
  the user to the exact files or output that should be reviewed.
- Keep the task branch and worktree until the user explicitly confirms that the
  work is finished.

### 4. Merge and clean up after approval

- Treat only the user's explicit confirmation that the work is finished as
  approval to merge and clean up.
- Merge the task branch into `main` using the repository's normal merge method,
  then push `main` to `origin`.
- Verify that the merge and push succeeded before cleanup.
- Stop any task-specific development process, remove the linked worktree, and
  delete the task branch locally and from `origin`.
- Do not discard unrelated or uncommitted changes to complete a merge or
  cleanup. If repository state prevents a safe operation, report the blocker
  and keep the branch and worktree recoverable.

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
