# Deploying the SynapseNote server

Runs the server in remote access mode behind the host's existing nginx, on
`https://synapse.lawdigest.kr`.

## What remote mode changes

Locally, the server treats reachability as authorization: only a process on
your machine can open a loopback socket, so no credential is needed. A public
deployment removes that reasoning, so every surface asks for one instead:

| Surface | Without a credential |
| --- | --- |
| `/api/*` | 401 |
| `/mcp` | 401 |
| `/collab` WebSocket | connection closed |
| Content assets (images, attachments) | 404 |
| `POST /api/auth/session` | reachable — this is how you sign in |
| The React app itself | served — it is where the sign-in form lives |

Two credentials do the work. An **access token** is long-lived, minted from the
CLI, and pasted into an MCP client or the web sign-in form. A **session** is
what the browser gets in exchange: an `HttpOnly` cookie, so page scripts never
hold the durable secret.

## Before the first deploy

The server refuses to start on an incomplete remote configuration and lists
every missing piece at once. Four things must hold:

1. `OK_PUBLIC_ORIGIN` names the origin the browser loads.
2. That origin is `https://`. Tokens and cookies cross the network otherwise,
   and a `Secure` cookie would never be sent back at all.
3. `OK_TRUSTED_PROXY_HOPS` is set explicitly — `1` here, for nginx. This is the
   one that silently breaks security if it is wrong: behind a proxy, every
   request arrives from loopback, so a server that ignored the header would see
   the whole internet as a local client.
4. At least one access token exists.

## Deploy

Everything below runs on the Oracle host. Build there rather than pushing an
image: the runtime installs native addons whose binaries are chosen per
architecture, and the host is `linux/arm64`.

```bash
git clone https://github.com/Nedian0Brien/SynapseNote.git
cd SynapseNote
```

**1. Put the workspace in place.** The container mounts a named volume at
`/workspace`. To start from an existing set of notes, copy them in after the
first `up`, or point the volume at a host directory you already have.

**2. Mint a token.** The store lives at `.ok/local/access.json` inside the
workspace, so mint through the running container — but the server will not
start without a token, so the first one is minted before the server does:

```bash
docker compose -f deploy/compose.yml run --rm --entrypoint sh synapsenote \
  -c 'node /app/dist/cli.mjs init && node /app/dist/cli.mjs access token create bootstrap'
```

The token is printed on stdout, once. Copy it now.

**3. Start the server.** On a host where 8080 is already taken, pick a free
port and use the same number in the nginx upstream.

```bash
export SYNAPSENOTE_HOST_PORT=18081
docker compose -f deploy/compose.yml up -d --build
docker compose -f deploy/compose.yml logs -f synapsenote
```

It publishes on loopback only, so nginx stays the only way in.

**4. Point nginx at it.** Back up whatever serves the hostname today first —
this replaces it.

```bash
sudo cp /etc/nginx/sites-available/synapse.lawdigest.kr \
        /etc/nginx/sites-available/synapse.lawdigest.kr.bak.$(date +%Y%m%d%H%M%S)

# The map the server block depends on. Skip if $connection_upgrade already
# exists on this host — nginx refuses to start on a duplicate map.
sudo cp deploy/nginx/10-connection-upgrade.conf /etc/nginx/conf.d/

sudo cp deploy/nginx/synapse.lawdigest.kr.conf \
        /etc/nginx/sites-available/synapse.lawdigest.kr
sudo ln -sf /etc/nginx/sites-available/synapse.lawdigest.kr \
            /etc/nginx/sites-enabled/synapse.lawdigest.kr
sudo nginx -t && sudo systemctl reload nginx
```

Read the config's comments before installing it: the `proxy_set_header` lines
are load-bearing, and the upstream port has to match `SYNAPSENOTE_HOST_PORT`.

**5. Check it.**

```bash
# The app loads without a credential — the sign-in form lives here.
curl -o /dev/null -w '%{http_code}\n' https://synapse.lawdigest.kr/

# The API does not.
curl -o /dev/null -w '%{http_code}\n' https://synapse.lawdigest.kr/api/config     # 401
curl -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
     https://synapse.lawdigest.kr/api/config                                      # 200
```

Then open `https://synapse.lawdigest.kr` and paste the token into the form.

## Managing tokens

Mint one per client, so a single revocation does not sign out everything else:

```bash
docker compose -f deploy/compose.yml exec synapsenote \
  node /app/dist/cli.mjs access token create iphone
docker compose -f deploy/compose.yml exec synapsenote \
  node /app/dist/cli.mjs access token list
docker compose -f deploy/compose.yml exec synapsenote \
  node /app/dist/cli.mjs access token revoke <id>
```

The running server picks these up without a restart. Revoking a token also
kills every browser session minted from it.

## Backups

Back up the `synapsenote-workspace` volume. It holds the documents, the shadow
git repository behind version history, and the access tokens.

```bash
docker run --rm -v synapsenote-workspace:/w -v "$PWD":/out debian:stable-slim \
  tar czf /out/synapsenote-workspace.tar.gz -C /w .
```

## Things that go wrong

**Every request answers 403 `host-not-allowed`.** nginx is not forwarding the
original `Host`. Check `proxy_set_header Host $host;`.

**Sign-in succeeds and the page comes back signed out.** The cookie was minted
`Secure` and the browser dropped it over plaintext, or minted without `Secure`
and the proxy is not reporting TLS. Check `proxy_set_header X-Forwarded-Proto
$scheme;`.

**The editor loads but never syncs.** The WebSocket upgrade is not reaching the
container. Check the `Upgrade` and `Connection` headers and the `map` block.

**The server refuses to start.** It printed the reason and every missing piece
with it. Read the list rather than changing one variable at a time.

## Not covered here

The agent surface (Claude / Codex chat) does not run in this container: the
image ships neither CLI binary nor any credential for one. Running agents
server-side is a separate milestone.
