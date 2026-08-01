import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  type DatabaseGitMergeConflict,
  mergeDatabaseManifestGit,
  mergeDatabaseMarkdownTables,
  mergeDatabaseRecordGit,
  parseDatabaseMarkdownOwner,
} from '@nedian0brien/synapsenote-core';
import {
  createDatabaseGitRecoveryService,
  createDatabaseMigrationJournal,
} from '@nedian0brien/synapsenote-server';
import { Command } from 'commander';

export type DatabaseGitArtifactKind = 'manifest' | 'record';

const ATTRIBUTE_BLOCK = `# SynapseNote database semantic merge drivers. The commands are trusted local Git config.
.ok/databases/*.yml diff merge=synapsenote-database-manifest
*.md diff merge=synapsenote-database-record
`;

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function currentDatabaseMergeCommandPrefix(): string {
  const entry = process.argv[1];
  if (!entry) throw new Error('Cannot locate the current SynapseNote CLI entrypoint');
  return `${shellQuote(process.execPath)} ${shellQuote(resolve(entry))}`;
}

function git(cwd: string, args: readonly string[]) {
  return spawnSync('git', args, { cwd, encoding: 'utf-8', windowsHide: true });
}

function ensureAttributes(projectRoot: string): 'created' | 'updated' | 'unchanged' {
  const path = join(projectRoot, '.gitattributes');
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
    throw new Error('Refusing to edit a symlinked .gitattributes file');
  }
  const existing = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  const missing = ATTRIBUTE_BLOCK.trimEnd()
    .split('\n')
    .filter((line) => line.startsWith('.') || line.startsWith('*'))
    .filter((line) => !existing.split(/\r?\n/).includes(line));
  if (missing.length === 0) return 'unchanged';
  const managedAddition = `# SynapseNote database semantic merge drivers. The commands are trusted local Git config.\n${missing.join('\n')}\n`;
  const addition = `${existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''}${
    existing.length > 0 ? '\n' : ''
  }${managedAddition}`;
  const temporary = join(dirname(path), `.gitattributes.synapsenote-${process.pid}.tmp`);
  try {
    writeFileSync(temporary, `${existing}${addition}`, { encoding: 'utf-8', flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return existing.length === 0 ? 'created' : 'updated';
}

export interface DatabaseGitDriverInstallResult {
  projectRoot: string;
  attributes: 'created' | 'updated' | 'unchanged';
  commandPrefix: string;
}

/** Installs only trusted repo-local config; `.gitattributes` cannot supply commands. */
export function installDatabaseGitDrivers(
  cwd = process.cwd(),
  commandPrefix = currentDatabaseMergeCommandPrefix(),
): DatabaseGitDriverInstallResult {
  const rootResult = git(cwd, ['rev-parse', '--show-toplevel']);
  if (rootResult.status !== 0) throw new Error('Database Git drivers require a Git worktree');
  const projectRoot = rootResult.stdout.trim();
  if (!projectRoot) throw new Error('Git did not return a worktree root');
  const attributes = ensureAttributes(projectRoot);
  const drivers = [
    ['synapsenote-database-manifest', 'manifest'],
    ['synapsenote-database-record', 'record'],
  ] as const;
  for (const [name, kind] of drivers) {
    const values = [
      [`merge.${name}.name`, `SynapseNote semantic ${kind} merge`],
      [`merge.${name}.driver`, `${commandPrefix} database merge-driver ${kind} %O %A %B`],
      [`merge.${name}.recursive`, 'binary'],
    ] as const;
    for (const [key, value] of values) {
      const configured = git(projectRoot, ['config', '--local', key, value]);
      if (configured.status !== 0) {
        throw new Error(configured.stderr.trim() || `Could not configure ${key}`);
      }
    }
  }
  return { projectRoot, attributes, commandPrefix };
}

function looksLikeDatabaseRecord(markdown: string): boolean {
  return (
    /^---\r?\n/.test(markdown) &&
    /(?:^|\n)_sn:\r?\n/.test(markdown) &&
    /(?:^|\n)\s+database_id:\s*db_/.test(markdown) &&
    /(?:^|\n)\s+record_id:\s*rec_/.test(markdown)
  );
}

function looksLikeMarkdownOwner(markdown: string): boolean {
  return parseDatabaseMarkdownOwner(markdown).ok;
}

function writeConflictSummary(conflicts: readonly DatabaseGitMergeConflict[]): void {
  for (const conflict of conflicts) {
    const path = conflict.path.length > 0 ? conflict.path.join('.') : '<artifact>';
    process.stderr.write(`[synapsenote merge] ${path}: ${conflict.message}\n`);
  }
}

function defaultMerge(basePath: string, currentPath: string, otherPath: string): number {
  const result = spawnSync('git', ['merge-file', currentPath, basePath, otherPath], {
    stdio: 'inherit',
    windowsHide: true,
  });
  return result.status ?? 2;
}

function writeWholeArtifactConflict(
  basePath: string,
  currentPath: string,
  otherPath: string,
): void {
  const ours = readFileSync(currentPath, 'utf-8');
  const base = readFileSync(basePath, 'utf-8');
  const theirs = readFileSync(otherPath, 'utf-8');
  writeFileSync(
    currentPath,
    `<<<<<<< current\n${ours}${ours.endsWith('\n') ? '' : '\n'}||||||| base\n${base}${
      base.endsWith('\n') ? '' : '\n'
    }=======\n${theirs}${theirs.endsWith('\n') ? '' : '\n'}>>>>>>> other\n`,
    'utf-8',
  );
}

interface DatabaseTaskRequestOptions {
  serverUrl?: string;
}

async function postDatabaseTask(
  projectRoot: string,
  body: Record<string, unknown>,
  options: DatabaseTaskRequestOptions,
): Promise<unknown> {
  const serverUrl = options.serverUrl ?? process.env.SYNAPSENOTE_SERVER_URL;
  if (!serverUrl) {
    throw new Error(
      'A running SynapseNote server is required; pass --server-url or set SYNAPSENOTE_SERVER_URL',
    );
  }
  const response = await fetch(new URL('/api/databases/task', serverUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      result &&
      typeof result === 'object' &&
      'detail' in result &&
      typeof result.detail === 'string'
        ? result.detail
        : `Database task request failed with HTTP ${response.status}`;
    throw new Error(`${detail} (project: ${projectRoot})`);
  }
  return result;
}

function printDatabaseTask(value: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  const task =
    value &&
    typeof value === 'object' &&
    'task' in value &&
    value.task &&
    typeof value.task === 'object'
      ? (value.task as Record<string, unknown>)
      : null;
  if (task) {
    console.log(`${String(task.id)}: ${String(task.state)} (${String(task.progress ?? '')})`);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

export function runDatabaseMergeDriver(
  kind: DatabaseGitArtifactKind,
  basePath: string,
  currentPath: string,
  otherPath: string,
): number {
  const base = readFileSync(basePath, 'utf-8');
  const ours = readFileSync(currentPath, 'utf-8');
  const theirs = readFileSync(otherPath, 'utf-8');
  if (
    kind === 'record' &&
    ![base, ours, theirs].every((markdown) => looksLikeDatabaseRecord(markdown))
  ) {
    if ([base, ours, theirs].every((markdown) => looksLikeMarkdownOwner(markdown))) {
      const merged = mergeDatabaseMarkdownTables({ base, ours, theirs });
      if (merged.merged !== null) {
        writeFileSync(currentPath, merged.merged, 'utf-8');
        return 0;
      }
      for (const conflict of merged.conflicts) {
        process.stderr.write(`[synapsenote owner-table merge] ${conflict.message}\n`);
      }
      const fallback = defaultMerge(basePath, currentPath, otherPath);
      if (fallback === 0) writeWholeArtifactConflict(basePath, currentPath, otherPath);
      return 1;
    }
    return defaultMerge(basePath, currentPath, otherPath);
  }
  const result =
    kind === 'manifest'
      ? mergeDatabaseManifestGit(base, ours, theirs)
      : mergeDatabaseRecordGit(base, ours, theirs);
  if (result.ok) {
    writeFileSync(currentPath, result.merged, 'utf-8');
    return 0;
  }
  writeConflictSummary(result.conflicts);
  const fallback = defaultMerge(basePath, currentPath, otherPath);
  if (fallback === 0) writeWholeArtifactConflict(basePath, currentPath, otherPath);
  return 1;
}

export function databaseCommand(): Command {
  const database = new Command('database').description('Database maintenance utilities');
  database
    .command('git-install')
    .description('Install trusted local semantic merge drivers for database files')
    .action(() => {
      const result = installDatabaseGitDrivers();
      console.log(
        `Installed database Git merge drivers in ${result.projectRoot} (${result.attributes} .gitattributes).`,
      );
    });
  const recovery = database
    .command('git-recovery')
    .description('Inspect or abort a partially applied Git database transition');
  recovery
    .command('status')
    .description('Print content-free recovery state as JSON')
    .action(() => {
      const service = createDatabaseGitRecoveryService({
        projectDir: process.cwd(),
        contentDir: process.cwd(),
      });
      console.log(JSON.stringify(service.status(), null, 2));
    });
  recovery
    .command('abort')
    .description('Abort the detected Git operation after an optimistic state check')
    .requiredOption('--expected-revision <revision>', 'revision returned by git-recovery status')
    .action(async (options: { expectedRevision: string }) => {
      const service = createDatabaseGitRecoveryService({
        projectDir: process.cwd(),
        contentDir: process.cwd(),
      });
      const status = await service.abort(options.expectedRevision);
      console.log(JSON.stringify(status, null, 2));
    });
  const migration = database
    .command('migration')
    .description('Preview, apply, inspect, resume, or rollback a v1→v2 migration');
  migration
    .command('status')
    .description('Inspect durable migration journals without reading content')
    .option('--server-url <url>', 'running server URL; omit to inspect local journals')
    .option('--json', 'print machine-readable JSON')
    .action(async (options: { serverUrl?: string; json?: boolean }) => {
      const projectRoot = resolve(process.cwd());
      if (options.serverUrl || process.env.SYNAPSENOTE_SERVER_URL) {
        const result = await postDatabaseTask(projectRoot, { action: 'list', limit: 200 }, options);
        printDatabaseTask(result, options.json === true);
        return;
      }
      const entries = await createDatabaseMigrationJournal(projectRoot).list();
      printDatabaseTask({ action: 'local_journal_status', entries }, options.json === true);
    });
  migration
    .command('preview')
    .description('Create an exact read-only v1→v2 plan')
    .requiredOption('--manifest-revision <revision>')
    .requiredOption('--target-version <version>', 'target manifest version', (value) =>
      Number(value),
    )
    .option('--database-id <id>', 'limit the preview to one database; repeatable via comma list')
    .requiredOption('--server-url <url>', 'running server URL')
    .option('--json', 'print machine-readable JSON')
    .action(
      async (options: {
        manifestRevision: string;
        targetVersion: number;
        databaseId?: string;
        serverUrl: string;
        json?: boolean;
      }) => {
        const result = await postDatabaseTask(
          process.cwd(),
          {
            action: 'preview_migration',
            expectedManifestRevision: options.manifestRevision,
            targetVersion: options.targetVersion,
            ...(options.databaseId
              ? { databaseIds: options.databaseId.split(',').filter(Boolean) }
              : {}),
          },
          options,
        );
        printDatabaseTask(result, options.json === true);
      },
    );
  migration
    .command('inspect <task-id>')
    .description('Inspect a migration task and content-free recovery hashes')
    .requiredOption('--server-url <url>', 'running server URL')
    .option('--json', 'print machine-readable JSON')
    .action(async (taskId: string, options: { serverUrl: string; json?: boolean }) => {
      const result = await postDatabaseTask(
        process.cwd(),
        { action: 'inspect_migration', taskId },
        options,
      );
      printDatabaseTask(result, options.json === true);
    });
  migration
    .command('preview-cleanup <task-id>')
    .description('Preview retention-expired migration staging and backup cleanup')
    .requiredOption('--server-url <url>', 'running server URL')
    .option('--json', 'print machine-readable JSON')
    .action(async (taskId: string, options: { serverUrl: string; json?: boolean }) => {
      const result = await postDatabaseTask(
        process.cwd(),
        { action: 'preview_cleanup_migration', taskId },
        options,
      );
      printDatabaseTask(result, options.json === true);
    });
  migration
    .command('apply')
    .description('Start a migration only with an explicitly approved preview hash')
    .requiredOption('--manifest-revision <revision>')
    .requiredOption('--target-version <version>', 'target manifest version', (value) =>
      Number(value),
    )
    .requiredOption(
      '--plan-hashes <json>',
      'JSON object mapping database IDs to preview plan hashes',
    )
    .requiredOption(
      '--approval-token <token>',
      'must equal approve:<sorted preview plan hashes joined by commas>',
    )
    .requiredOption('--server-url <url>', 'running server URL')
    .option('--database-id <id>', 'limit the migration to one database; repeatable via comma list')
    .option(
      '--migration-committed-at <json>',
      'JSON object mapping database IDs to preview timestamps',
    )
    .option('--json', 'print machine-readable JSON')
    .action(
      async (options: {
        manifestRevision: string;
        targetVersion: number;
        planHashes: string;
        approvalToken: string;
        serverUrl: string;
        databaseId?: string;
        migrationCommittedAt?: string;
        json?: boolean;
      }) => {
        let planHashes: Record<string, string>;
        let migrationCommittedAt: Record<string, string> | undefined;
        try {
          planHashes = JSON.parse(options.planHashes) as Record<string, string>;
          if (options.migrationCommittedAt)
            migrationCommittedAt = JSON.parse(options.migrationCommittedAt) as Record<
              string,
              string
            >;
        } catch {
          throw new Error('--plan-hashes and --migration-committed-at must be valid JSON objects');
        }
        const hashValues = Object.values(planHashes).sort();
        const expectedApproval = hashValues.length > 0 ? `approve:${hashValues.join(',')}` : null;
        if (expectedApproval === null || options.approvalToken !== expectedApproval) {
          throw new Error(
            'Migration apply requires --approval-token=approve:<sorted preview plan hashes joined by commas>',
          );
        }
        const result = await postDatabaseTask(
          process.cwd(),
          {
            action: 'start',
            task: {
              operation: 'migration',
              expectedManifestRevision: options.manifestRevision,
              targetVersion: options.targetVersion,
              planHashes,
              ...(options.databaseId
                ? { databaseIds: options.databaseId.split(',').filter(Boolean) }
                : {}),
              ...(migrationCommittedAt ? { migrationCommittedAt } : {}),
            },
          },
          options,
        );
        printDatabaseTask(result, options.json === true);
      },
    );
  for (const action of ['resume', 'rollback'] as const) {
    migration
      .command(`${action} <task-id>`)
      .description(`${action === 'resume' ? 'Resume' : 'Rollback'} a durable migration task`)
      .requiredOption('--expected-revision <revision>')
      .requiredOption('--server-url <url>', 'running server URL')
      .option('--json', 'print machine-readable JSON')
      .action(
        async (
          taskId: string,
          options: { expectedRevision: string; serverUrl: string; json?: boolean },
        ) => {
          const result = await postDatabaseTask(
            process.cwd(),
            {
              action,
              taskId,
              expectedRevision: options.expectedRevision,
            },
            options,
          );
          printDatabaseTask(result, options.json === true);
        },
      );
  }
  migration
    .command('cleanup <task-id>')
    .description('Delete retention-expired migration staging and backup material with approval')
    .requiredOption('--expected-revision <revision>')
    .requiredOption('--plan-hash <hash>', 'hash returned by preview-cleanup')
    .requiredOption('--approval-token <token>', 'must equal approve:<cleanup plan hash>')
    .requiredOption('--server-url <url>', 'running server URL')
    .option('--json', 'print machine-readable JSON')
    .action(
      async (
        taskId: string,
        options: {
          expectedRevision: string;
          planHash: string;
          approvalToken: string;
          serverUrl: string;
          json?: boolean;
        },
      ) => {
        const result = await postDatabaseTask(
          process.cwd(),
          {
            action: 'cleanup_migration',
            taskId,
            expectedRevision: options.expectedRevision,
            planHash: options.planHash,
            approvalToken: options.approvalToken,
          },
          options,
        );
        printDatabaseTask(result, options.json === true);
      },
    );
  database
    .command('merge-driver <kind> <base> <current> <other>', { hidden: true })
    .action((kind: string, base: string, current: string, other: string) => {
      if (kind !== 'manifest' && kind !== 'record') {
        process.stderr.write(`Unknown database merge artifact kind: ${kind}\n`);
        process.exitCode = 2;
        return;
      }
      process.exitCode = runDatabaseMergeDriver(kind, base, current, other);
    });
  return database;
}
