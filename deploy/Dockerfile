# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
#
# The skipped check fires on `GIT_CONFIG_KEY_0`, matching on the word `KEY`.
# The value is `safe.directory`; there is no secret in this file.
#
# SynapseNote server image.
#
# One container, one port: the server answers `/api/*`, `/mcp`, and `/collab`,
# and serves the built React app from the same origin via
# `--react-shell-dist-dir`. That single origin is what the remote access policy
# is built around — `OK_PUBLIC_ORIGIN` names it, the Host allowlist matches it,
# and the session cookie is scoped to it. Splitting the app onto a second
# origin would mean CORS with credentials for no gain.
#
# Two stages because the toolchains differ: the repo builds under Bun, and the
# CLI ships a `#!/usr/bin/env node` entry, so the runtime is Node.
#
# Target platform is linux/arm64 (Oracle Ampere A1). Nothing here is
# arch-specific, but the runtime installs native addons whose prebuilt binaries
# are chosen at install time, so build for the architecture that will run it:
# build on the server, or `docker buildx build --platform linux/arm64`.

########################  build  ########################
FROM oven/bun:1.3.13 AS build

WORKDIR /src

# The whole repo: this is a workspace build and the CLI bundle pulls source
# from core, server, and app.
COPY . .

RUN bun install --frozen-lockfile

# Only what the CLI entry needs. The docs site is not part of the server image.
RUN bun run --filter @nedian0brien/synapsenote-core build \
 && bun run --filter @nedian0brien/synapsenote-server build \
 && bun run --filter @nedian0brien/synapsenote-app build

# The CLI's own build steps, enumerated rather than run through its `build`
# script, so `build:native` can be left out.
#
# `build:native` copies the compiled `@nedian0brien/synapsenote-native-config`
# addon into the bundle. That addon is a Rust napi module — building it here
# would pull a full Rust toolchain into the image — and its job is writing
# format-preserving MCP config into local editor files (`.mcp.json`, Codex
# TOML). A server container wires up no local editors, and the loader treats a
# missing addon as the normal no-prebuilt-binary case with a documented
# fallback, so leaving it out costs the server nothing.
#
# Keep this list in step with `packages/cli/package.json`'s `build:assets` if a
# step is added there.
WORKDIR /src/packages/cli
RUN bun run build:cli \
 && bun run build:app \
 && bun run build:skill-asset \
 && bun run build:notices \
 && bun run build:license \
 && bun run build:schema
WORKDIR /src

########################  runtime  ########################
FROM node:24-bookworm-slim AS runtime

# `git` is not optional. The server snapshots every write into a shadow
# repository and shells out for it, so an image without git boots and then
# fails on the first edit.
#
# `tini` gives the container a real init, so `docker stop` reaches the server
# as SIGTERM and its shutdown path runs instead of being killed at the timeout.
RUN apt-get update \
 && apt-get install --no-install-recommends -y git ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install only the CLI package's declared runtime dependencies. The tsdown
# bundle inlines what it can; what stays external is the native addons and
# `simple-git`, which is what this install provides — with prebuilt binaries
# for this image's architecture.
#
# `--ignore-scripts`: the package's own postinstall installs a user skill into
# a home directory, which a server container has no use for. It is written to
# swallow its own failures, so skipping it changes nothing that matters. The
# native dependencies here ship prebuilt platform packages and need no build
# step of their own.
# The CLI's own manifest cannot be handed to npm as-is: its devDependencies
# point at workspace packages with bun's `workspace:*` protocol, which npm
# rejects outright — before `--omit=dev` gets a chance to skip them. So derive
# a runtime-only manifest carrying just the dependencies that actually ship.
COPY --from=build /src/packages/cli/package.json ./package.source.json
RUN node -e "const fs=require('fs'); \
      const p=JSON.parse(fs.readFileSync('./package.source.json','utf8')); \
      fs.writeFileSync('./package.json', JSON.stringify({ \
        name:p.name, version:p.version, private:true, type:p.type, \
        dependencies:p.dependencies, \
        optionalDependencies:p.optionalDependencies }, null, 2)); \
      fs.unlinkSync('./package.source.json');" \
 && npm install --omit=dev --ignore-scripts --no-audit --no-fund \
 && npm cache clean --force

# The bundled CLI, its assets, and the built React app — the CLI's own
# `build:app` step places the app at `dist/public`.
COPY --from=build /src/packages/cli/dist ./dist

# The workspace. Mount a volume here: it holds both the documents and `.ok/`,
# and `.ok/local/access.json` is where the access tokens live.
RUN mkdir -p /workspace && chown -R node:node /workspace /app
USER node

# git settings come through the environment rather than `git config --global`.
# A global config would land in /home/node/.gitconfig, and the runtime mounts a
# tmpfs there so the CLI's file logger has a writable HOME — which would shadow
# the file and leave git with neither an identity nor a safe.directory entry.
#
# safe.directory: git refuses to operate in a directory owned by another user,
# which is what a host bind mount looks like from inside the container.
#
# The identity is what unattributed shadow-repo commits are authored as; edits
# made through the app carry their own author.
ENV GIT_CONFIG_COUNT=1 \
    GIT_CONFIG_KEY_0=safe.directory \
    GIT_CONFIG_VALUE_0=/workspace \
    GIT_AUTHOR_NAME=SynapseNote \
    GIT_AUTHOR_EMAIL=synapsenote@localhost \
    GIT_COMMITTER_NAME=SynapseNote \
    GIT_COMMITTER_EMAIL=synapsenote@localhost

# Remote access is the point of this image, so the mode is baked in. The other
# two have no value that is right for every deployment and no safe default —
# the server refuses to start without them. See deploy/compose.yml.
ENV OK_ACCESS_MODE=remote
ENV PORT=8080
EXPOSE 8080

# `ok start` operates on the current directory, so the workspace is the cwd.
WORKDIR /workspace

ENTRYPOINT ["/usr/bin/tini", "--"]

# `--react-shell-dist-dir` makes this process serve the React app itself, so no
# `ok ui` sibling is spawned and the container stays single-process.
# `--host 0.0.0.0` binds inside the container's own network namespace; compose
# publishes the port on host loopback only, so the reverse proxy stays the only
# way in.
CMD ["sh", "-c", "exec node /app/dist/cli.mjs start --host 0.0.0.0 --port ${PORT} --react-shell-dist-dir /app/dist/public"]
