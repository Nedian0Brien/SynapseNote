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
    path: 'content-show-all-walk.ts',
    maxLines: 626,
    owner: 'show-all and search directory walk',
  },
  {
    path: 'api-extension.ts',
    maxLines: 18_229,
    owner: 'HTTP API extension facade',
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
