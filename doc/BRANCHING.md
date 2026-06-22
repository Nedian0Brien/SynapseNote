# SynapseNote Web branch strategy

This worktree is no longer connected to the upstream SynapseNote Web repository as a Git remote.

## Branches

- `main`: imported upstream baseline. Do not deploy from this branch.
- `synapsenote-branding`: active SynapseNote integration branch. Product, design, and compatibility work happens here.
- `release/synapse`: deployment branch for `synapse.lawdigest.kr`. Move this branch only after verification passes.

## Remote policy

Do not use `origin` for the upstream vendor repository.

When a SynapseNote-owned repository is ready, connect it as `origin`:

```bash
git remote add origin <synapsenote-repo-url>
git push -u origin synapsenote-branding
git push -u origin release/synapse
```

If upstream vendor needs to be referenced later, add it as read-only `upstream`:

```bash
git remote add upstream https://github.com/SynapseNote-IO/SynapseNote-Web.git
git remote set-url --push upstream DISABLED
```

## Deployment rule

Deploy only from `release/synapse`.

Before moving `release/synapse`, run:

```bash
pnpm run type-check
pnpm run build
```

Then move the branch explicitly:

```bash
git branch -f release/synapse synapsenote-branding
```

The Docker image currently keeps the existing image name for compose compatibility:

```bash
docker build -f docker/Dockerfile -t synapsenote/synapsenote-web:local .
```

## Current state

As of this document, `release/synapse` points to the latest verified SynapseNote branding/design commit.
