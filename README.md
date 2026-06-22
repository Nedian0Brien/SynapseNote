# SynapseNote Web

SynapseNote Web is the self-hosted web client for SynapseNote.

It includes SynapseNote branding, graph-oriented note features, and a self-hosted deployment target at `synapse.lawdigest.kr`.

## Development

```bash
pnpm install
pnpm run dev
```

## Verification

```bash
pnpm run type-check
pnpm run build
```

## Deployment

The production web image is built from this worktree and served through the self-hosted compose stack.

Use `release/synapse` as the deployment branch. See [doc/BRANCHING.md](doc/BRANCHING.md) for branch and remote policy.

```bash
docker build -f docker/Dockerfile -t synapsenote/appflowy-web:local .
cd ../appflowy-cloud
docker compose up -d --no-deps --force-recreate appflowy_web
```

## License

This project is distributed under AGPLv3. See `LICENSE.md`.
