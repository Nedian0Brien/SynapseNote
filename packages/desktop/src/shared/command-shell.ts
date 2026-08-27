import { existsSync } from 'node:fs';
import { win32 } from 'node:path';

/** Generated agent commands and dropped paths use POSIX quoting on every OS. */
export function resolveCommandShell(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  // Structured chat historically uses zsh on macOS. The user's interactive
  // shell (which may be fish) is resolved separately by the PTY host.
  if (platform !== 'win32') return '/bin/zsh';
  const roots = [
    env.ProgramW6432,
    env.ProgramFiles,
    env.LOCALAPPDATA ? win32.join(env.LOCALAPPDATA, 'Programs') : undefined,
  ].filter((root): root is string => Boolean(root));
  const candidates = roots.map((root) => win32.join(root, 'Git', 'bin', 'bash.exe'));
  for (const segment of (env.PATH ?? env.Path ?? '').split(';')) {
    if (/[/\\]Git[/\\](?:cmd|bin)$/i.test(segment)) {
      candidates.push(win32.resolve(segment, '..', 'bin', 'bash.exe'));
    }
  }
  const shell = candidates.find((candidate) => existsSync(candidate));
  if (!shell)
    throw new Error(
      'Git for Windows is required for SynapseNote terminals and agents. Install Git and restart SynapseNote.',
    );
  return shell.replaceAll('\\', '/');
}
