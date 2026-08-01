import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

export interface ServerModuleSizeBudget {
  path: string;
  maxLines: number;
  owner: string;
}

/**
 * RFC 0011's first server boundary and the existing monoliths. Budgets start
 * at today's measured size so each tracked module can shrink but not grow.
 */
export const SERVER_MODULE_SIZE_BUDGETS: readonly ServerModuleSizeBudget[] = [
  {
    path: 'workspace-search-cache-key.ts',
    maxLines: 5,
    owner: 'workspace search cache-key encoding',
  },
  {
    path: 'content-show-all-walk.ts',
    maxLines: 626,
    owner: 'show-all and search directory walk',
  },
  {
    path: 'api-extension.ts',
    maxLines: 16_285,
    owner: 'Owns the HTTP API extension facade.',
  },
  {
    path: 'content-upload-policy.ts',
    maxLines: 46,
    owner: 'Owns content upload path and filename policy.',
  },
  {
    path: 'content-upload-service.ts',
    maxLines: 241,
    owner: 'Owns content upload streaming and duplicate detection.',
  },
  {
    path: 'content-path-safety.ts',
    maxLines: 46,
    owner: 'Owns content path symlink safety checks.',
  },
  {
    path: 'content-path-policy.ts',
    maxLines: 80,
    owner: 'Owns content path validation and resolution.',
  },
  {
    path: 'content-rename-filesystem.ts',
    maxLines: 134,
    owner: 'Owns managed rename filesystem and Git operations.',
  },
  {
    path: 'managed-rename-coordinator.ts',
    maxLines: 80,
    owner: 'Owns managed rename operation coordination.',
  },
  {
    path: 'managed-rename-content.ts',
    maxLines: 367,
    owner: 'Owns managed rename content contracts and orchestration.',
  },
  {
    path: 'managed-rename-enumeration.ts',
    maxLines: 135,
    owner: 'Owns managed rename asset enumeration.',
  },
  {
    path: 'managed-rename-asset-executor.ts',
    maxLines: 245,
    owner: 'Owns managed rename asset execution.',
  },
  {
    path: 'managed-rename-document-executor.ts',
    maxLines: 407,
    owner: 'Owns managed rename document execution.',
  },
  {
    path: 'database-plan.ts',
    maxLines: 5_780,
    owner: 'database plan engine',
  },
  {
    path: 'database-data-plane-api.ts',
    maxLines: 5_560,
    owner: 'database data-plane API schema and handlers',
  },
  {
    path: 'database-data-plane.ts',
    maxLines: 5_238,
    owner: 'database data-plane service',
  },
  {
    path: 'server-factory.ts',
    maxLines: 4_783,
    owner: 'server assembly',
  },
];

export function serverSourceRoot(moduleFile: string): string {
  return dirname(moduleFile);
}

export function resolveServerModule(serverSrc: string, modulePath: string): string {
  return normalize(join(serverSrc, modulePath));
}

/** Counts the final empty split segment, matching the app boundary guard. */
export function moduleLineCount(file: string): number {
  return readFileSync(file, 'utf8').split(/\r?\n/).length;
}

export function assertModuleSizeBudgets(
  serverSrc: string,
  budgets: readonly ServerModuleSizeBudget[],
): void {
  for (const budget of budgets) {
    const file = resolveServerModule(serverSrc, budget.path);
    if (!existsSync(file)) throw new Error(`${budget.path} must exist`);
    const lineCount = moduleLineCount(file);
    if (lineCount > budget.maxLines) {
      throw new Error(`${budget.path} exceeds ${budget.maxLines} lines (received ${lineCount})`);
    }
  }
}
