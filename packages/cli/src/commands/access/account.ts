/**
 * `synapsenote access account` — the one account a remote server signs in.
 *
 * A server holds exactly one. It is the operator's own account, not a user
 * directory: this is a personal workspace served over the internet, and the
 * moment a second account exists the whole model needs sharing, permissions
 * and invitations that nothing here implements.
 *
 * The password is only ever read from the terminal. See `ui/read-password.ts`
 * for why an `--password` flag is not offered.
 *
 * Project-scoped like `access token`: the store lives at
 * `<projectDir>/.ok/local/accounts.json`, next to the tokens.
 */

import { randomBytes } from 'node:crypto';
import {
  type AccountStore,
  accessStorePath,
  accountStorePath,
  getLocalDir,
  hashPassword,
  MIN_PASSWORD_LENGTH,
  openAccessStore,
  openAccountStore,
  validatePassword,
} from '@nedian0brien/synapsenote-server';
import { Command } from 'commander';
import {
  NoTerminalError,
  PasswordPromptCancelled,
  type PasswordReader,
  readNewPassword,
  readPasswordFromTerminal,
} from '../../ui/read-password.ts';

function storeForCwd(): { store: AccountStore; path: string } {
  const path = accountStorePath(getLocalDir(process.cwd()));
  return { store: openAccountStore(path), path };
}

/** ISO timestamp → `2026-09-09 14:03`, or `never`. Mirrors `token.ts`. */
function formatWhen(iso: string | undefined): string {
  if (iso === undefined) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function describePasswordProblem(password: string): string | null {
  const rejection = validatePassword(password);
  if (rejection === null) return null;
  return rejection === 'empty'
    ? 'Password must not be empty.'
    : `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
}

/**
 * Turn a prompt failure into the message that actually helps.
 *
 * `docker compose exec` without a TTY is the way an operator hits this, and
 * "no terminal available" alone does not say to drop the `-T`.
 */
function reportPromptFailure(err: unknown): void {
  if (err instanceof PasswordPromptCancelled) {
    process.stderr.write('Cancelled.\n');
    process.exitCode = 1;
    return;
  }
  if (err instanceof NoTerminalError) {
    process.stderr.write('This command reads the password from the terminal, and there is none.\n');
    process.stderr.write('Run it attached — for a container, `docker compose exec` without -T.\n');
    process.stderr.write('There is no --password flag: an argument would land in the process\n');
    process.stderr.write('list, the shell history and the daemon log.\n');
    process.exitCode = 1;
    return;
  }
  throw err;
}

/** WebAuthn binds credentials to this handle, so it outlives password changes. */
function newWebauthnUserId(): string {
  return randomBytes(32).toString('base64url');
}

export interface AccountCommandDeps {
  /** Test seam. Production reads from the terminal with echo suppressed. */
  readonly readPassword?: PasswordReader;
}

function createAccountCommand(deps: AccountCommandDeps): Command {
  return new Command('create')
    .description('Create the account this server signs in')
    .argument('<username>', 'the name typed at the sign-in screen')
    .action(async (username: string) => {
      const { store, path } = storeForCwd();
      if (store.get() !== undefined) {
        process.stderr.write('An account already exists; this server holds exactly one.\n');
        process.stderr.write('Change its password with: synapsenote access account passwd\n');
        process.exitCode = 1;
        return;
      }
      if (username.trim().length === 0) {
        process.stderr.write('Username must not be empty.\n');
        process.exitCode = 1;
        return;
      }

      const read = deps.readPassword ?? ((label) => readPasswordFromTerminal(label));
      let entered: Awaited<ReturnType<typeof readNewPassword>>;
      try {
        entered = await readNewPassword(read, describePasswordProblem);
      } catch (err) {
        reportPromptFailure(err);
        return;
      }
      if (!entered.ok) {
        process.stderr.write(`${entered.message}\n`);
        process.exitCode = 1;
        return;
      }

      const record = store.create({
        username: username.trim(),
        password: await hashPassword(entered.password),
        webauthnUserId: newWebauthnUserId(),
      });
      process.stderr.write(`✓ Created account "${record.username}"\n`);
      process.stderr.write(`  stored ${path}\n`);
      process.stderr.write('\n  Sign in at the server’s address, then register a passkey in\n');
      process.stderr.write('  Settings so you can skip the password next time.\n');
    });
}

function passwdCommand(deps: AccountCommandDeps): Command {
  return new Command('passwd').description('Change the account password').action(async () => {
    const { store } = storeForCwd();
    const account = store.get();
    if (account === undefined) {
      process.stderr.write('No account on this server.\n');
      process.stderr.write('Create one with: synapsenote access account create <username>\n');
      process.exitCode = 1;
      return;
    }

    const read = deps.readPassword ?? ((label) => readPasswordFromTerminal(label));
    let entered: Awaited<ReturnType<typeof readNewPassword>>;
    try {
      entered = await readNewPassword(read, describePasswordProblem);
    } catch (err) {
      reportPromptFailure(err);
      return;
    }
    if (!entered.ok) {
      process.stderr.write(`${entered.message}\n`);
      process.exitCode = 1;
      return;
    }

    store.setPassword(account.id, await hashPassword(entered.password));
    // A password change is what an operator does when they think someone
    // else has it. Leaving the old browser sessions live would make the
    // change cosmetic.
    const access = openAccessStore(accessStorePath(getLocalDir(process.cwd())));
    const revoked = access.revokeAccountSessions(account.id);
    process.stderr.write(`✓ Password changed for "${account.username}"\n`);
    process.stderr.write(
      revoked === 0
        ? '  No browser sessions were open.\n'
        : `  Signed out ${revoked} browser session${revoked === 1 ? '' : 's'}.\n`,
    );
    if (account.passkeys.length > 0) {
      process.stderr.write(
        `  ${account.passkeys.length} passkey${account.passkeys.length === 1 ? '' : 's'} still work — remove them with the Settings panel if that is not what you want.\n`,
      );
    }
  });
}

function showAccountCommand(): Command {
  return new Command('show').description('Show the account and its passkeys').action(() => {
    const { store, path } = storeForCwd();
    const account = store.get();
    if (account === undefined) {
      process.stderr.write(`No account on this server (${path})\n`);
      process.stderr.write('Create one with: synapsenote access account create <username>\n');
      return;
    }
    process.stdout.write(`username  ${account.username}\n`);
    process.stdout.write(`created   ${formatWhen(account.createdAt)}\n`);
    process.stdout.write(`passkeys  ${account.passkeys.length}\n`);
    if (account.passkeys.length === 0) return;
    const width = Math.max(5, ...account.passkeys.map((p) => p.label.length));
    process.stdout.write(`\n${'LABEL'.padEnd(width)}  ${'ADDED'.padEnd(16)}  LAST USED\n`);
    for (const passkey of account.passkeys) {
      process.stdout.write(
        `${passkey.label.padEnd(width)}  ${formatWhen(passkey.createdAt).padEnd(16)}  ${formatWhen(
          passkey.lastUsedAt,
        )}\n`,
      );
    }
  });
}

export function accountCommand(deps: AccountCommandDeps = {}): Command {
  const cmd = new Command('account');
  cmd.description('The account this project’s server signs in');
  cmd.addCommand(createAccountCommand(deps));
  cmd.addCommand(passwdCommand(deps));
  cmd.addCommand(showAccountCommand());
  return cmd;
}
