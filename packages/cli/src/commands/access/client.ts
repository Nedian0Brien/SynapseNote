/**
 * `synapsenote access client` — see and cut off the applications connected
 * through OAuth.
 *
 * An access token is something the operator hands out deliberately; an OAuth
 * client is something that asked and was approved, possibly months ago. Being
 * able to answer "what is connected to my workspace right now" without reading
 * a JSON file is the difference between a credential store and a filing
 * cabinet.
 *
 * Project-scoped like the token commands: `cli.ts` has already anchored the
 * process to the project root by the time an action runs.
 */

import {
  getLocalDir,
  type OAuthClientRecord,
  type OAuthStore,
  oauthStorePath,
  openOAuthStore,
} from '@nedian0brien/synapsenote-server';
import { Command } from 'commander';

function storeForCwd(): { store: OAuthStore; path: string } {
  const path = oauthStorePath(getLocalDir(process.cwd()));
  return { store: openOAuthStore(path), path };
}

function formatWhen(iso: string | undefined): string {
  if (iso === undefined) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Live access tokens per client — what "connected" actually means. */
function liveTokenCount(store: OAuthStore, client: OAuthClientRecord): number {
  const now = Date.now();
  return store
    .listTokens()
    .filter(
      (t) => t.clientId === client.clientId && t.kind === 'access' && Date.parse(t.expiresAt) > now,
    ).length;
}

function listClientsCommand(): Command {
  return new Command('list').description('List applications connected through OAuth').action(() => {
    const { store, path } = storeForCwd();
    const clients = store.listClients();
    if (clients.length === 0) {
      process.stderr.write(`No OAuth clients have been approved for this project (${path})\n`);
      return;
    }
    const nameWidth = Math.max(4, ...clients.map((c) => (c.clientName ?? '').length));
    process.stdout.write(
      `${'NAME'.padEnd(nameWidth)}  ${'VIA'.padEnd(4)}  ${'APPROVED'.padEnd(16)}  ${'LIVE'.padEnd(4)}  CLIENT ID\n`,
    );
    for (const client of clients) {
      process.stdout.write(
        `${(client.clientName ?? '').padEnd(nameWidth)}  ${client.source.padEnd(4)}  ${formatWhen(
          client.registeredAt,
        ).padEnd(16)}  ${String(liveTokenCount(store, client)).padEnd(4)}  ${client.clientId}\n`,
      );
    }
  });
}

function revokeClientCommand(): Command {
  return new Command('revoke')
    .description('Cut off an OAuth client and every token it holds')
    .argument('<client-id>', 'client id from `synapsenote access client list`')
    .action((clientId: string) => {
      const { store } = storeForCwd();
      if (store.getClient(clientId) === undefined) {
        process.stderr.write(`No OAuth client with id ${clientId}\n`);
        process.stderr.write('List the connected ones with: synapsenote access client list\n');
        process.exitCode = 1;
        return;
      }
      const dropped = store.revokeClientTokens(clientId);
      store.removeClient(clientId);
      process.stderr.write(`✓ Revoked ${clientId}\n`);
      process.stderr.write(
        `  ${dropped} token${dropped === 1 ? '' : 's'} dropped. The client must be approved again to reconnect.\n`,
      );
    });
}

export function clientCommand(): Command {
  const cmd = new Command('client');
  cmd.description('Manage the applications connected through OAuth');
  cmd.addCommand(listClientsCommand());
  cmd.addCommand(revokeClientCommand());
  return cmd;
}
