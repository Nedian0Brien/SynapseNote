/**
 * `synapsenote access token` — mint, list, and revoke the credentials a remote
 * server admits.
 *
 * These are project-scoped: the store lives at `<projectDir>/.ok/local/
 * access.json`, so a token issued here works only against the server serving
 * this project. `cli.ts` has already anchored the process to the project root
 * by the time an action runs, which is why every subcommand reads
 * `process.cwd()` rather than walking for a root of its own.
 *
 * Deliberately separate from the `auth` group, which manages GitHub
 * credentials. Same word, unrelated secrets.
 */

import {
  type AccessStore,
  accessStorePath,
  getLocalDir,
  openAccessStore,
} from '@nedian0brien/synapsenote-server';
import { Command } from 'commander';

function storeForCwd(): { store: AccessStore; path: string } {
  const path = accessStorePath(getLocalDir(process.cwd()));
  return { store: openAccessStore(path), path };
}

/** ISO timestamp → `2026-09-09 14:03`, or `never` for an absent value. */
function formatWhen(iso: string | undefined): string {
  if (iso === undefined) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function createTokenCommand(): Command {
  return new Command('create')
    .description('Mint an access token for this project')
    .argument('<name>', 'label for the token, e.g. chatgpt or iphone')
    .action((name: string) => {
      const { store, path } = storeForCwd();
      const { record, secret } = store.createToken(name);
      // The secret goes to stdout alone so `TOKEN=$(synapsenote access token
      // create ci)` captures exactly the credential; everything a human needs
      // to read goes to stderr.
      process.stderr.write(`✓ Created access token "${record.name}"\n`);
      process.stderr.write(`  id     ${record.id}\n`);
      process.stderr.write(`  stored ${path}\n`);
      process.stderr.write('\n  This is the only time the token is shown. Copy it now.\n\n');
      process.stdout.write(`${secret}\n`);
    });
}

function listTokensCommand(): Command {
  return new Command('list').description('List this project’s access tokens').action(() => {
    const { store, path } = storeForCwd();
    const tokens = store.listTokens();
    if (tokens.length === 0) {
      process.stderr.write(`No access tokens for this project (${path})\n`);
      process.stderr.write('Mint one with: synapsenote access token create <name>\n');
      return;
    }
    const nameWidth = Math.max(4, ...tokens.map((t) => t.name.length));
    process.stdout.write(
      `${'NAME'.padEnd(nameWidth)}  ${'ID'.padEnd(36)}  ${'CREATED'.padEnd(16)}  LAST USED\n`,
    );
    for (const token of tokens) {
      process.stdout.write(
        `${token.name.padEnd(nameWidth)}  ${token.id.padEnd(36)}  ${formatWhen(
          token.createdAt,
        ).padEnd(16)}  ${formatWhen(token.lastUsedAt)}\n`,
      );
    }
  });
}

function revokeTokenCommand(): Command {
  return new Command('revoke')
    .description('Revoke an access token and every session minted from it')
    .argument('<id>', 'token id from `synapsenote access token list`')
    .action((id: string) => {
      const { store } = storeForCwd();
      if (!store.revokeToken(id)) {
        process.stderr.write(`No access token with id ${id}\n`);
        process.stderr.write('List the live ones with: synapsenote access token list\n');
        process.exitCode = 1;
        return;
      }
      process.stderr.write(`✓ Revoked ${id}\n`);
      process.stderr.write('  Sessions minted from it stop working immediately.\n');
    });
}

export function tokenCommand(): Command {
  const cmd = new Command('token');
  cmd.description('Manage access tokens for this project’s server');
  cmd.addCommand(createTokenCommand());
  cmd.addCommand(listTokensCommand());
  cmd.addCommand(revokeTokenCommand());
  return cmd;
}
