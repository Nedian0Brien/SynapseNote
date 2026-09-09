/**
 * Build the `access` command group — credentials for reaching this project's
 * server from somewhere other than this machine.
 *
 * Distinct from the `auth` group, which manages GitHub credentials. Putting
 * server tokens under a group described as "GitHub authentication management"
 * would file two unrelated secrets in the same drawer.
 */

import { Command } from 'commander';
import { clientCommand } from './client.ts';
import { tokenCommand } from './token.ts';

export function accessCommand(): Command {
  const cmd = new Command('access');
  cmd.description('Remote access credentials for this project’s server');
  cmd.addCommand(tokenCommand());
  cmd.addCommand(clientCommand());
  return cmd;
}
