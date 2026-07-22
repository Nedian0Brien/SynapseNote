import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

export type DatabaseGitOperation = 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'unknown';

export interface DatabaseGitRecoveryStatus {
  state: 'clean' | 'partial' | 'unresolved';
  operation: DatabaseGitOperation | null;
  revision: string;
  databasePaths: readonly string[];
  unmergedPaths: readonly string[];
  canAbort: boolean;
}

export interface CreateDatabaseGitRecoveryOptions {
  projectDir: string;
  contentDir: string;
  isKnownRecordPath?: (contentRelativePath: string) => boolean;
  afterAbort?: () => void | Promise<void>;
}

function splitNull(value: string): string[] {
  return value.split('\0').filter(Boolean);
}

function normalizedPath(value: string): string {
  return value.split('\\').join('/');
}

function databaseRecordBytes(value: string): boolean {
  return (
    /^---\r?\n/.test(value) &&
    /(?:^|\n)_sn:\r?\n/.test(value) &&
    /(?:^|\n)\s+database_id:\s*db_/.test(value) &&
    /(?:^|\n)\s+source_id:\s*ds_/.test(value) &&
    /(?:^|\n)\s+record_id:\s*rec_/.test(value)
  );
}

export class DatabaseGitRecoveryService {
  readonly #projectDir: string;
  readonly #contentDir: string;
  readonly #isKnownRecordPath: (contentRelativePath: string) => boolean;
  readonly #afterAbort: () => void | Promise<void>;
  #status: DatabaseGitRecoveryStatus;

  constructor(options: CreateDatabaseGitRecoveryOptions) {
    this.#projectDir = resolve(options.projectDir);
    this.#contentDir = resolve(options.contentDir);
    this.#isKnownRecordPath = options.isKnownRecordPath ?? (() => false);
    this.#afterAbort = options.afterAbort ?? (() => undefined);
    this.#status = this.#inspect();
  }

  status(): DatabaseGitRecoveryStatus {
    return structuredClone(this.#status);
  }

  isBlocked(): boolean {
    return this.#status.state !== 'clean';
  }

  refresh(): DatabaseGitRecoveryStatus {
    this.#status = this.#inspect();
    return this.status();
  }

  async abort(expectedRevision: string): Promise<DatabaseGitRecoveryStatus> {
    const current = this.refresh();
    if (current.revision !== expectedRevision) {
      throw new Error('Database Git recovery state changed; inspect it again before aborting');
    }
    if (current.state === 'clean') return current;
    const args = (() => {
      switch (current.operation) {
        case 'merge':
          return ['merge', '--abort'];
        case 'rebase':
          return ['rebase', '--abort'];
        case 'cherry-pick':
          return ['cherry-pick', '--abort'];
        case 'revert':
          return ['revert', '--abort'];
        default:
          return null;
      }
    })();
    if (!args || !current.canAbort) {
      throw new Error('The partial database Git state has no safe automatic abort operation');
    }
    const aborted = this.#git(args);
    if (aborted.status !== 0) {
      throw new Error(aborted.stderr.trim() || `git ${args.join(' ')} failed`);
    }
    await this.#afterAbort();
    const next = this.refresh();
    if (next.state !== 'clean') {
      throw new Error('Git abort completed but database paths remain partially applied');
    }
    return next;
  }

  #git(args: readonly string[]) {
    return spawnSync('git', args, {
      cwd: this.#projectDir,
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 4 * 1024 * 1024,
    });
  }

  #stdout(args: readonly string[]): { ok: boolean; value: string } {
    const result = this.#git(args);
    return {
      ok: result.status === 0,
      value: result.status === 0 && typeof result.stdout === 'string' ? result.stdout : '',
    };
  }

  #gitPath(name: string): string | null {
    const result = this.#git(['rev-parse', '--git-path', name]);
    if (result.status !== 0) return null;
    const value = typeof result.stdout === 'string' ? result.stdout.trim() : '';
    return value ? resolve(this.#projectDir, value) : null;
  }

  #operation(): DatabaseGitOperation | null {
    const probes: Array<[DatabaseGitOperation, string]> = [
      ['rebase', 'rebase-merge'],
      ['rebase', 'rebase-apply'],
      ['merge', 'MERGE_HEAD'],
      ['cherry-pick', 'CHERRY_PICK_HEAD'],
      ['revert', 'REVERT_HEAD'],
    ];
    for (const [operation, name] of probes) {
      const path = this.#gitPath(name);
      if (path && existsSync(path)) return operation;
    }
    return null;
  }

  #stageLooksLikeRecord(path: string): boolean {
    for (const stage of [1, 2, 3]) {
      const result = this.#git(['show', `:${stage}:${path}`]);
      if (
        result.status === 0 &&
        typeof result.stdout === 'string' &&
        databaseRecordBytes(result.stdout)
      )
        return true;
    }
    return false;
  }

  #revisionLooksLikeRecord(path: string): boolean {
    for (const revision of [
      'HEAD',
      'MERGE_HEAD',
      'CHERRY_PICK_HEAD',
      'REVERT_HEAD',
      'REBASE_HEAD',
    ]) {
      const result = this.#git(['show', `${revision}:${path}`]);
      if (
        result.status === 0 &&
        typeof result.stdout === 'string' &&
        databaseRecordBytes(result.stdout)
      )
        return true;
    }
    return false;
  }

  #isDatabasePath(path: string): boolean {
    const normalized = normalizedPath(path);
    if (/^\.ok\/databases\/[^/]+\.ya?ml$/.test(normalized)) return true;
    const absolute = resolve(this.#projectDir, normalized);
    const contentRelative = relative(this.#contentDir, absolute);
    if (
      contentRelative === '' ||
      contentRelative === '..' ||
      contentRelative.startsWith(`..${sep}`) ||
      (!normalized.endsWith('.md') && !normalized.endsWith('.mdx'))
    ) {
      return false;
    }
    const recordPath = normalizedPath(contentRelative);
    if (this.#isKnownRecordPath(recordPath)) return true;
    try {
      if (databaseRecordBytes(readFileSync(absolute, 'utf-8'))) return true;
    } catch {
      // Deleted and unmerged records are detected from Git stages below.
    }
    return this.#stageLooksLikeRecord(normalized) || this.#revisionLooksLikeRecord(normalized);
  }

  #inspect(): DatabaseGitRecoveryStatus {
    const operation = this.#operation();
    const repository = this.#stdout(['rev-parse', '--is-inside-work-tree']);
    if (!repository.ok || repository.value.trim() !== 'true') {
      return this.#statusResult('clean', null, [], []);
    }
    const unstaged = this.#stdout(['diff', '--name-only', '-z']);
    const staged = this.#stdout(['diff', '--cached', '--name-only', '-z']);
    const unmergedRaw = this.#stdout(['diff', '--name-only', '--diff-filter=U', '-z']);
    if (!unstaged.ok || !staged.ok || !unmergedRaw.ok) {
      return this.#statusResult('unresolved', 'unknown', [], []);
    }
    const unmerged = splitNull(unmergedRaw.value).map(normalizedPath);
    const changed = [
      ...new Set([...splitNull(unstaged.value), ...splitNull(staged.value), ...unmerged]),
    ]
      .map(normalizedPath)
      .sort((left, right) => left.localeCompare(right));
    const databasePaths = changed.filter((path) => this.#isDatabasePath(path));
    const unmergedDatabasePaths = unmerged.filter((path) => databasePaths.includes(path)).sort();
    const state: DatabaseGitRecoveryStatus['state'] =
      databasePaths.length === 0
        ? 'clean'
        : operation !== null
          ? 'partial'
          : unmergedDatabasePaths.length > 0
            ? 'unresolved'
            : 'clean';
    const operationForStatus =
      state === 'clean'
        ? null
        : state === 'unresolved' && operation === null
          ? ('unknown' as const)
          : operation;
    return this.#statusResult(state, operationForStatus, databasePaths, unmergedDatabasePaths);
  }

  #statusResult(
    state: DatabaseGitRecoveryStatus['state'],
    operation: DatabaseGitOperation | null,
    databasePaths: readonly string[],
    unmergedPaths: readonly string[],
  ): DatabaseGitRecoveryStatus {
    const fingerprint = JSON.stringify({ state, operation, databasePaths, unmergedPaths });
    return {
      state,
      operation,
      revision: `sha256:${createHash('sha256').update(fingerprint).digest('hex')}`,
      databasePaths,
      unmergedPaths,
      canAbort: state === 'partial' && operation !== null && operation !== 'unknown',
    };
  }
}

export function createDatabaseGitRecoveryService(
  options: CreateDatabaseGitRecoveryOptions,
): DatabaseGitRecoveryService {
  return new DatabaseGitRecoveryService(options);
}
