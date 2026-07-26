import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export const repositoryRoot = resolve(import.meta.dir, '../..');

export interface CommandSpec {
  args: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  label?: string;
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args]
    .map((part) => (part.includes(' ') ? JSON.stringify(part) : part))
    .join(' ');
}

/** Run a command without invoking a shell so paths and test names stay data. */
export function runCommand(command: string, spec: CommandSpec): number {
  const cwd = spec.cwd ?? repositoryRoot;
  const label = spec.label ?? formatCommand(command, spec.args);
  console.log(`\n[test-feedback] ${label}`);

  const result = spawnSync(command, spec.args, {
    cwd,
    env: { ...process.env, ...spec.env },
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`[test-feedback] failed to start ${label}: ${result.error.message}`);
    return 1;
  }

  if (typeof result.status === 'number') {
    return result.status;
  }

  console.error(`[test-feedback] ${label} terminated by ${result.signal ?? 'unknown signal'}`);
  return 1;
}

export function runBun(spec: Omit<CommandSpec, 'cwd'> & { cwd?: string }): number {
  return runCommand(process.execPath, spec);
}

export function runBunScript(args: string[], cwd = repositoryRoot): number {
  return runBun({ args: ['run', ...args], cwd });
}

export function exitWithStatus(status: number): never {
  process.exit(status);
}
