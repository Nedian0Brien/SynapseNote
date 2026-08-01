/** OS adapters for the cached terminal capability probes. */
import { spawn } from 'node:child_process';
import { homedir as osHomedir } from 'node:os';
import { resolveShell } from '../utility/pty-host.ts';
import { runLoginShellProbe } from './claude-readiness.ts';
import { createTerminalCapabilities, type TerminalCapabilities } from './terminal-capabilities.ts';

interface DesktopTerminalCapabilitiesDeps {
  readonly classifyClaudeMcp: Parameters<typeof createTerminalCapabilities>[0]['classifyClaudeMcp'];
}

function probeLoginShellOnPath(args?: readonly string[]): Promise<number | null> {
  return runLoginShellProbe(
    (file, spawnArgs) => {
      const child = spawn(file, [...spawnArgs], { stdio: 'ignore', shell: false });
      return {
        onExit: (callback) => child.on('exit', (code) => callback(code)),
        onError: (callback) => child.on('error', (error) => callback(error)),
        kill: () => {
          child.kill('SIGKILL');
        },
      };
    },
    resolveShell(process.env),
    {
      setTimer: (callback, delay) => setTimeout(callback, delay),
      clearTimer: (token) => clearTimeout(token as ReturnType<typeof setTimeout>),
    },
    undefined,
    args,
  );
}

export function createDesktopTerminalCapabilities(
  deps: DesktopTerminalCapabilitiesDeps,
): TerminalCapabilities {
  return createTerminalCapabilities({
    homeDir: osHomedir,
    probeLoginShell: probeLoginShellOnPath,
    classifyClaudeMcp: deps.classifyClaudeMcp,
  });
}
