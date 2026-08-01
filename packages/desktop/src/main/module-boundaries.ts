import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

export interface DesktopModuleSizeBudget {
  path: string;
  maxLines: number;
  owner: string;
}

/**
 * RFC 0011 desktop main-process boundaries. The main entrypoint remains the
 * lifecycle owner while extracted IPC registrars and capability composers keep
 * their own explicit, non-growing budgets.
 */
export const DESKTOP_MODULE_SIZE_BUDGETS: readonly DesktopModuleSizeBudget[] = [
  {
    path: 'index.ts',
    maxLines: 3_871,
    owner: 'Owns desktop main-process lifecycle orchestration.',
  },
  {
    path: 'desktop-app-state-ipc.ts',
    maxLines: 22,
    owner: 'Owns desktop app-state IPC composition.',
  },
  {
    path: 'desktop-asset-ipc.ts',
    maxLines: 147,
    owner: 'Owns desktop asset IPC composition.',
  },
  {
    path: 'desktop-integrations-ipc.ts',
    maxLines: 36,
    owner: 'Owns desktop integrations IPC composition.',
  },
  {
    path: 'desktop-ipc-composition.ts',
    maxLines: 120,
    owner: 'Owns desktop static IPC registration composition.',
  },
  {
    path: 'desktop-local-ops-ipc.ts',
    maxLines: 14,
    owner: 'Owns desktop local-operations IPC composition.',
  },
  {
    path: 'desktop-project-ipc.ts',
    maxLines: 159,
    owner: 'Owns desktop project IPC composition.',
  },
  {
    path: 'desktop-terminal-capabilities.ts',
    maxLines: 43,
    owner: 'Owns desktop terminal capability composition.',
  },
  {
    path: 'desktop-terminal-ipc.ts',
    maxLines: 66,
    owner: 'Owns desktop terminal IPC composition.',
  },
  {
    path: 'terminal-capabilities.ts',
    maxLines: 79,
    owner: 'Owns terminal capability probes.',
  },
  {
    path: 'shell-trash-telemetry.ts',
    maxLines: 21,
    owner: 'Owns shell trash telemetry.',
  },
  {
    path: 'startup-reclaim-toast.ts',
    maxLines: 84,
    owner: 'Owns startup reclaim toast delivery.',
  },
  {
    path: 'ipc/app-state-registrar.ts',
    maxLines: 55,
    owner: 'Owns app-state and theme IPC registration.',
  },
  {
    path: 'ipc/asset-registrar.ts',
    maxLines: 257,
    owner: 'Owns asset IPC registration.',
  },
  {
    path: 'ipc/asset-menu-registrar.ts',
    maxLines: 40,
    owner: 'Owns native asset-menu IPC registration.',
  },
  {
    path: 'ipc/asset-request.ts',
    maxLines: 50,
    owner: 'Owns asset IPC runtime payload guards.',
  },
  {
    path: 'ipc/bug-local-ops-registrar.ts',
    maxLines: 92,
    owner: 'Owns bug and local-operations IPC registration.',
  },
  {
    path: 'ipc/bug-report-registrar.ts',
    maxLines: 59,
    owner: 'Owns bug-report IPC registration.',
  },
  {
    path: 'ipc/integrations-settings-registrar.ts',
    maxLines: 294,
    owner: 'Owns integrations and settings IPC registration.',
  },
  {
    path: 'ipc/native-shell-registrar.ts',
    maxLines: 60,
    owner: 'Owns native-shell IPC registration.',
  },
  {
    path: 'ipc/project-create-registrar.ts',
    maxLines: 170,
    owner: 'Owns project-creation IPC registration.',
  },
  {
    path: 'ipc/project-registrar.ts',
    maxLines: 378,
    owner: 'Owns project and worktree IPC registration.',
  },
  {
    path: 'ipc/project-proxy-registrar.ts',
    maxLines: 77,
    owner: 'Owns project proxy IPC validation and registration.',
  },
  {
    path: 'ipc/registrar-registry.ts',
    maxLines: 139,
    owner: 'Owns static IPC registrar channel ownership.',
  },
  {
    path: 'ipc/registrar-ownership.ts',
    maxLines: 25,
    owner: 'Owns static registrar ownership validation.',
  },
  {
    path: 'ipc/seed-registrar.ts',
    maxLines: 56,
    owner: 'Owns seed IPC registration.',
  },
  {
    path: 'ipc/sharing-registrar.ts',
    maxLines: 25,
    owner: 'Owns sharing IPC registration.',
  },
  {
    path: 'ipc/state-debug-registrar.ts',
    maxLines: 23,
    owner: 'Owns state-debug IPC registration.',
  },
  {
    path: 'ipc/terminal-pty-registrar.ts',
    maxLines: 245,
    owner: 'Owns terminal PTY IPC registration.',
  },
  {
    path: 'ipc/terminal-pty-request.ts',
    maxLines: 124,
    owner: 'Owns terminal PTY runtime payload guards.',
  },
];

export function desktopSourceRoot(moduleFile: string): string {
  return normalize(join(dirname(moduleFile), '..', '..', 'src', 'main'));
}

export function resolveDesktopModule(desktopSrc: string, modulePath: string): string {
  return normalize(join(desktopSrc, modulePath));
}

/** Counts the final empty split segment, matching the server boundary guard. */
export function moduleLineCount(file: string): number {
  return readFileSync(file, 'utf8').split(/\r?\n/).length;
}

export function assertModuleSizeBudgets(
  desktopSrc: string,
  budgets: readonly DesktopModuleSizeBudget[],
): void {
  for (const budget of budgets) {
    const file = resolveDesktopModule(desktopSrc, budget.path);
    if (!existsSync(file)) throw new Error(`${budget.path} must exist`);
    const lineCount = moduleLineCount(file);
    if (lineCount > budget.maxLines) {
      throw new Error(`${budget.path} exceeds ${budget.maxLines} lines (received ${lineCount})`);
    }
  }
}
