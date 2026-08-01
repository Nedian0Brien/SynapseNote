import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

export interface ServerModuleSizeBudget {
  path: string;
  maxLines: number;
  owner: string;
}

export type FormerServerFacade =
  | 'database-data-plane-api.ts'
  | 'database-plan.ts'
  | 'database-data-plane.ts';

export interface FormerServerFacadeImport {
  path: string;
  target: FormerServerFacade;
  kind: 'type' | 'runtime';
}

const FORMER_SERVER_FACADE_IMPORT_RE =
  /\bfrom\s+['"](?:\.\.\/|\.\/)*(database-data-plane-api|database-plan|database-data-plane)\.ts['"]/g;

export function findFormerServerFacadeImports(
  modulePath: string,
  source: string,
): readonly FormerServerFacadeImport[] {
  const imports: FormerServerFacadeImport[] = [];
  for (const match of source.matchAll(FORMER_SERVER_FACADE_IMPORT_RE)) {
    const target = `${match[1]}.ts` as FormerServerFacade;
    const importStart = source.lastIndexOf('import', match.index ?? 0);
    const declaration = source.slice(importStart, match.index ?? 0).trimStart();
    imports.push({
      path: modulePath,
      target,
      kind: /^import\s+type\b/.test(declaration) ? 'type' : 'runtime',
    });
  }
  return imports;
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
    maxLines: 2_765,
    owner: 'Owns database plan engine orchestration.',
  },
  {
    path: 'database-data-plane-api.ts',
    maxLines: 246,
    owner: 'Owns database data-plane API composition.',
  },
  {
    path: 'database-data-plane.ts',
    maxLines: 1_744,
    owner: 'Owns database data-plane domain composition.',
  },
  {
    path: 'database-data-plane-access-policy.ts',
    maxLines: 453,
    owner: 'Owns database data-plane access policy.',
  },
  {
    path: 'database-data-plane-api-contracts-access.ts',
    maxLines: 339,
    owner: 'Owns database data-plane API access contracts.',
  },
  {
    path: 'database-data-plane-api-contracts-automation.ts',
    maxLines: 172,
    owner: 'Owns database data-plane API automation contracts.',
  },
  {
    path: 'database-data-plane-api-contracts-context-inspection.ts',
    maxLines: 233,
    owner: 'Owns database data-plane API context-inspection contracts.',
  },
  {
    path: 'database-data-plane-api-contracts-mutation.ts',
    maxLines: 374,
    owner: 'Owns database data-plane API mutation contracts.',
  },
  {
    path: 'database-data-plane-api-contracts-operation-responses.ts',
    maxLines: 623,
    owner: 'Owns database data-plane API operation-response contracts.',
  },
  {
    path: 'database-data-plane-api-contracts-query-retrieval.ts',
    maxLines: 594,
    owner: 'Owns database data-plane API query and retrieval contracts.',
  },
  {
    path: 'database-data-plane-api-contracts-read-requests.ts',
    maxLines: 235,
    owner: 'Owns database data-plane API read-request contracts.',
  },
  {
    path: 'database-data-plane-api-contracts-read-responses.ts',
    maxLines: 210,
    owner: 'Owns database data-plane API read-response contracts.',
  },
  {
    path: 'database-data-plane-api-contracts-task-migration.ts',
    maxLines: 397,
    owner: 'Owns database data-plane API task-migration contracts.',
  },
  {
    path: 'database-data-plane-api-handler-context.ts',
    maxLines: 65,
    owner: 'Owns database data-plane API handler context.',
  },
  {
    path: 'database-data-plane-api-handlers-agent-automation.ts',
    maxLines: 370,
    owner: 'Owns database data-plane API agent-automation handlers.',
  },
  {
    path: 'database-data-plane-api-handlers-catalog-query.ts',
    maxLines: 443,
    owner: 'Owns database data-plane API catalog and query handlers.',
  },
  {
    path: 'database-data-plane-api-handlers-mutation-commit.ts',
    maxLines: 349,
    owner: 'Owns database data-plane API mutation and commit handlers.',
  },
  {
    path: 'database-data-plane-api-handlers-permission-share-autonomy.ts',
    maxLines: 498,
    owner: 'Owns database data-plane API permission, share, and autonomy handlers.',
  },
  {
    path: 'database-data-plane-api-handlers-task-migration.ts',
    maxLines: 348,
    owner: 'Owns database data-plane API task-migration handlers.',
  },
  {
    path: 'database-data-plane-api-response.ts',
    maxLines: 485,
    owner: 'Owns database data-plane API problem and response mapping.',
  },
  {
    path: 'database-data-plane-api-schemas.ts',
    maxLines: 181,
    owner: 'Owns the immutable database API schema registry.',
  },
  {
    path: 'database-data-plane-buttons.ts',
    maxLines: 117,
    owner: 'Owns database button coordination.',
  },
  {
    path: 'database-data-plane-catalog.ts',
    maxLines: 316,
    owner: 'Owns database catalog and describe projection.',
  },
  {
    path: 'database-data-plane-commit-automation.ts',
    maxLines: 273,
    owner: 'Owns database commit automation coordination.',
  },
  {
    path: 'database-data-plane-computed-preview.ts',
    maxLines: 294,
    owner: 'Owns computed database property previews.',
  },
  {
    path: 'database-data-plane-contracts.ts',
    maxLines: 258,
    owner: 'Owns public database data-plane query and retrieval contracts.',
  },
  {
    path: 'database-data-plane-api-handler-contracts.ts',
    maxLines: 231,
    owner: 'Owns exact database API handler capability contracts.',
  },
  {
    path: 'database-data-plane-context-search-projection.ts',
    maxLines: 334,
    owner: 'Owns database context search projection.',
  },
  {
    path: 'database-data-plane-context.ts',
    maxLines: 334,
    owner: 'Owns database context-pack coordination.',
  },
  {
    path: 'database-data-plane-errors.ts',
    maxLines: 49,
    owner: 'Owns database data-plane error contracts.',
  },
  {
    path: 'database-data-plane-form-policy.ts',
    maxLines: 496,
    owner: 'Owns database form submission and external capability policy.',
  },
  {
    path: 'database-data-plane-markdown-adapters.ts',
    maxLines: 264,
    owner: 'Owns Markdown-table mutation and export adapters.',
  },
  {
    path: 'database-data-plane-plan-mutations.ts',
    maxLines: 311,
    owner: 'Owns database plan mutation coordination.',
  },
  {
    path: 'database-data-plane-public-share.ts',
    maxLines: 358,
    owner: 'Owns public sharing and permission projection.',
  },
  {
    path: 'database-data-plane-query-execution.ts',
    maxLines: 634,
    owner: 'Owns database query execution.',
  },
  {
    path: 'database-data-plane-query-filter.ts',
    maxLines: 120,
    owner: 'Owns database query filtering.',
  },
  {
    path: 'database-data-plane-query-trace.ts',
    maxLines: 135,
    owner: 'Owns database query explain traces.',
  },
  {
    path: 'database-data-plane-read-projection.ts',
    maxLines: 437,
    owner: 'Owns database read projection.',
  },
  {
    path: 'database-data-plane-retrieval.ts',
    maxLines: 381,
    owner: 'Owns database retrieval execution.',
  },
  {
    path: 'database-plan-artifacts.ts',
    maxLines: 411,
    owner: 'Owns public database plan artifacts and error contracts.',
  },
  {
    path: 'database-plan-conflict-compiler.ts',
    maxLines: 39,
    owner: 'Owns database plan relation-conflict compilation.',
  },
  {
    path: 'database-plan-convergence-policy.ts',
    maxLines: 271,
    owner: 'Owns database plan convergence and hash policy.',
  },
  {
    path: 'database-plan-draft-contracts.ts',
    maxLines: 474,
    owner: 'Owns validated database desired-state draft contracts.',
  },
  {
    path: 'database-plan-manifest-compiler.ts',
    maxLines: 287,
    owner: 'Owns database plan manifest compilation.',
  },
  {
    path: 'database-plan-manifest-record-compiler.ts',
    maxLines: 37,
    owner: 'Owns database plan manifest-record composition.',
  },
  {
    path: 'database-plan-normalization-policy.ts',
    maxLines: 729,
    owner: 'Owns database desired-state normalization policy.',
  },
  {
    path: 'database-plan-operation-compiler.ts',
    maxLines: 455,
    owner: 'Owns database plan operation compilation.',
  },
  {
    path: 'database-plan-record-compiler.ts',
    maxLines: 577,
    owner: 'Owns database plan record compilation.',
  },
  {
    path: 'database-plan-write-guards.ts',
    maxLines: 28,
    owner: 'Owns database plan write-guard contracts.',
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
