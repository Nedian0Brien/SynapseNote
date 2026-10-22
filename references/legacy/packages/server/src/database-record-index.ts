import { createHash } from 'node:crypto';
import { type Dirent, realpathSync, statSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  DatabaseDateValueSchema,
  type DatabaseFileAvailability,
  type DatabaseFileValue,
  type DatabaseRecord,
  type DatabaseRecordActor,
  type DatabaseRecordIssue,
  type DatabaseValue,
  type DatabaseVerificationProjection,
  DatabaseVerificationValueSchema,
  databaseFileDisplayName,
  databaseFileIdentity,
  isRecordPathInSource,
  isSafeDatabaseAssetPath,
  materializeDatabaseRecord,
  projectDatabaseRichText,
  serializeDatabaseDateValue,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseStore } from './database-store.ts';
import type { DiskEvent } from './file-watcher.ts';

export type DatabaseRecordIndexIssueCode =
  | 'unreadable_record'
  | 'record_symlink'
  | 'external_conflict'
  | 'duplicate_record_id'
  | 'duplicate_unique_value'
  | 'invalid_record';

export interface DatabaseRecordIndexIssue {
  code: DatabaseRecordIndexIssueCode;
  path: string;
  message: string;
  databaseId?: string;
  sourceId?: string;
  recordId?: string;
  propertyId?: string;
  materializationCode?: string;
  recordIssues?: readonly DatabaseRecordIssue[];
}

export interface DatabaseRecordIndexSnapshot {
  records: readonly DatabaseRecord[];
  issues: readonly DatabaseRecordIndexIssue[];
  revision: string;
  manifestRevision: string;
}

export interface DatabaseRecordIndexRebuildResult {
  indexed: number;
  invalid: number;
  revision: string;
}

export interface DatabaseRecordIndexStatus {
  state: 'idle' | 'rebuilding' | 'error';
  revision: string;
  manifestRevision: string;
  recordCount: number;
  issueCount: number;
  progress: { discovered: number; processed: number } | null;
  lastRebuiltAt: string | null;
  lastIncrementalAt: string | null;
  lastError: { code: 'rebuild_failed'; message: string } | null;
}

export interface DatabaseRecordIndexPathState {
  managed: boolean;
  databaseId: string | null;
  sourceId: string | null;
  recordId: string | null;
}

export interface DatabaseRecordIndexListOptions {
  /** Property-only consumers can avoid retaining or cloning canonical Markdown bodies. */
  includeBody?: boolean;
}

export interface DatabaseRecordIndexConsistencyReport {
  consistent: boolean;
  currentRevision: string;
  canonicalRevision: string;
  missingRecordIds: readonly string[];
  staleRecordIds: readonly string[];
  changedRecordIds: readonly string[];
  diagnosticsDiffer: boolean;
}

export type DatabaseLexicalMatchField = 'title' | 'property' | 'body';
export const DATABASE_LEXICAL_MAX_TERMS = 16;
export const DATABASE_LEXICAL_MAX_HITS = 500;
export const DATABASE_LEXICAL_MAX_EVIDENCE_PER_HIT = 8;

export class DatabaseLexicalSearchLimitError extends RangeError {
  readonly observedTerms: number;

  constructor(observedTerms: number) {
    super(`Lexical query exceeds the ${DATABASE_LEXICAL_MAX_TERMS}-term limit`);
    this.name = 'DatabaseLexicalSearchLimitError';
    this.observedTerms = observedTerms;
  }
}

export interface DatabaseLexicalEvidence {
  id: string;
  recordId: string;
  path: string;
  field: 'property' | 'body';
  propertyId?: string;
  start: number;
  end: number;
  offsetEncoding: 'utf16_code_units';
  snippet: string;
  snippetStart: number;
  snippetEnd: number;
  matchedTerms: readonly string[];
}

export interface DatabaseLexicalSearchHit {
  recordId: string;
  path: string;
  revision: string | null;
  score: number;
  scoreBreakdown: {
    title: number;
    property: number;
    body: number;
    /** Added only by the permission-aware data plane when full Verification evidence is disclosed. */
    verification?: number;
  };
  verification?: readonly (DatabaseVerificationProjection & { propertyId: string })[];
  matchedBy: readonly DatabaseLexicalMatchField[];
  evidence: readonly DatabaseLexicalEvidence[];
}

export interface DatabaseLexicalSearchResult {
  query: string;
  terms: readonly string[];
  offsetEncoding: 'utf16_code_units';
  matched: number;
  returned: number;
  isComplete: boolean;
  hits: readonly DatabaseLexicalSearchHit[];
  trace: {
    strategy: 'lexical_and';
    scope: {
      databaseId: string;
      sourceId: string;
      propertyIds: readonly string[];
      includeBody: boolean;
      includeArchived: boolean;
    };
    termStats: readonly {
      term: string;
      indexedRecords: number;
      scopedRecords: number;
    }[];
    ranking: {
      titleWeight: 40;
      propertyWeight: 20;
      bodyWeight: 10;
      verificationWeight?: 1;
      tieBreakers: readonly ['path', 'record_id'];
    };
    noMatchReason: 'no_terms' | 'term_absent_in_scope' | 'no_record_matches_all_terms' | null;
  };
}

export interface DatabaseLexicalSearchInput {
  databaseId: string;
  sourceId: string;
  text: string;
  propertyIds: readonly string[];
  titlePropertyId: string;
  /** Trusted effective row scope. Omitted/null means every row in the source. */
  allowedRecordIds?: readonly string[] | null;
  includeBody?: boolean;
  includeArchived?: boolean;
  limit?: number;
  /** Trusted deterministic rank boost; used for permission-visible verification evidence. */
  rankBoost?: (record: Readonly<DatabaseRecord>) => number;
}

interface LexicalOccurrence {
  field: 'property' | 'body';
  propertyId?: string;
  start: number;
  end: number;
}

export interface CreateDatabaseRecordIndexOptions {
  contentDir: string;
  databaseStore: DatabaseStore;
}

export interface DatabaseRecordFileTimes {
  createdAt?: string;
  lastEditedAt?: string;
  lastEditedBy?: DatabaseRecordActor;
}

function cloneRecord(record: DatabaseRecord): DatabaseRecord {
  return structuredClone(record);
}

function valueKey(value: DatabaseValue): string {
  if (!Array.isArray(value) && typeof value === 'object') {
    const date = DatabaseDateValueSchema.safeParse(value);
    if (date.success) return `date:${serializeDatabaseDateValue(date.data)}`;
    const verification = DatabaseVerificationValueSchema.safeParse(value);
    if (verification.success) return `verification:${JSON.stringify(verification.data)}`;
    return `object:${JSON.stringify(value)}`;
  }
  return `${Array.isArray(value) ? 'array' : typeof value}:${JSON.stringify(value)}`;
}

function databaseValueText(value: DatabaseValue): string {
  const date = DatabaseDateValueSchema.safeParse(value);
  return date.success ? serializeDatabaseDateValue(date.data) : String(value);
}

function isWithin(base: string, candidate: string): boolean {
  const rel = relative(base, candidate);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

function recordFileTimes(contentDir: string, recordPath: string): DatabaseRecordFileTimes {
  try {
    const stats = statSync(resolve(contentDir, recordPath));
    if (!stats.isFile() || stats.isSymbolicLink()) return {};
    return {
      ...(stats.birthtimeMs > 0 ? { createdAt: stats.birthtime.toISOString() } : {}),
      ...(stats.mtimeMs > 0 ? { lastEditedAt: stats.mtime.toISOString() } : {}),
    };
  } catch {
    return {};
  }
}

function lexicalTerms(value: string): Array<{ term: string; start: number; end: number }> {
  const terms: Array<{ term: string; start: number; end: number }> = [];
  for (const match of value.matchAll(/[\p{L}\p{N}_-]+/gu)) {
    const raw = match[0];
    const start = match.index;
    terms.push({ term: raw.normalize('NFKC').toLocaleLowerCase(), start, end: start + raw.length });
  }
  return terms;
}

function evidenceId(record: DatabaseRecord, occurrence: LexicalOccurrence): string {
  return `ev_${createHash('sha256')
    .update(
      JSON.stringify({
        recordId: record.id,
        revision: record.revision,
        field: occurrence.field,
        propertyId: occurrence.propertyId ?? null,
        start: occurrence.start,
        end: occurrence.end,
      }),
    )
    .digest('hex')
    .slice(0, 24)}`;
}

/**
 * Rebuildable in-memory projection of canonical database records. File watcher
 * events reparse only their affected path; every lookup is keyed by stable IDs.
 */
export class DatabaseRecordIndex {
  readonly #contentDir: string;
  readonly #databaseStore: DatabaseStore;
  readonly #candidatesByPath = new Map<string, DatabaseRecord>();
  readonly #pathsByRecordId = new Map<string, Set<string>>();
  readonly #recordsById = new Map<string, DatabaseRecord>();
  readonly #baseIssuesByPath = new Map<string, DatabaseRecordIndexIssue>();
  readonly #duplicateIssuesByPath = new Map<string, DatabaseRecordIndexIssue>();
  readonly #uniqueIssues = new Map<string, DatabaseRecordIndexIssue>();
  readonly #typed = new Map<string, Map<string, Set<string>>>();
  readonly #lexical = new Map<string, Map<string, LexicalOccurrence[]>>();
  readonly #lexicalTermsByRecordId = new Map<string, Set<string>>();
  #manifestRevision = 'sha256:empty';
  #state: DatabaseRecordIndexStatus['state'] = 'idle';
  #progress: DatabaseRecordIndexStatus['progress'] = null;
  #lastRebuiltAt: string | null = null;
  #lastIncrementalAt: string | null = null;
  #lastError: DatabaseRecordIndexStatus['lastError'] = null;

  constructor(options: CreateDatabaseRecordIndexOptions) {
    this.#contentDir = resolve(options.contentDir);
    this.#databaseStore = options.databaseStore;
  }

  snapshot(): DatabaseRecordIndexSnapshot {
    const records = [...this.#recordsById.values()]
      .map(cloneRecord)
      .sort((left, right) => left.id.localeCompare(right.id));
    const issues = [
      ...this.#baseIssuesByPath.values(),
      ...this.#duplicateIssuesByPath.values(),
      ...this.#uniqueIssues.values(),
    ]
      .map((issue) => structuredClone(issue))
      .sort(
        (left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code),
      );
    const hash = createHash('sha256');
    hash.update(this.#manifestRevision).update('\0');
    for (const record of records) hash.update(JSON.stringify(record)).update('\0');
    for (const issue of issues) hash.update(JSON.stringify(issue)).update('\0');
    return {
      records,
      issues,
      revision: `sha256:${hash.digest('hex')}`,
      manifestRevision: this.#manifestRevision,
    };
  }

  status(): DatabaseRecordIndexStatus {
    const snapshot = this.snapshot();
    return {
      state: this.#state,
      revision: snapshot.revision,
      manifestRevision: snapshot.manifestRevision,
      recordCount: snapshot.records.length,
      issueCount: snapshot.issues.length,
      progress: this.#progress === null ? null : { ...this.#progress },
      lastRebuiltAt: this.#lastRebuiltAt,
      lastIncrementalAt: this.#lastIncrementalAt,
      lastError: this.#lastError === null ? null : { ...this.#lastError },
    };
  }

  getById(recordId: string): DatabaseRecord | null {
    const record = this.#recordsById.get(recordId);
    return record ? cloneRecord(record) : null;
  }

  /** Content-free lookup used to scope realtime invalidations to database paths. */
  inspectPath(recordPath: string): DatabaseRecordIndexPathState {
    const record = this.#candidatesByPath.get(recordPath);
    const issue =
      this.#baseIssuesByPath.get(recordPath) ??
      this.#duplicateIssuesByPath.get(recordPath) ??
      [...this.#uniqueIssues.values()].find((candidate) => candidate.path === recordPath);
    return {
      managed: record !== undefined || issue !== undefined,
      databaseId: record?.databaseId ?? issue?.databaseId ?? null,
      sourceId: record?.sourceId ?? issue?.sourceId ?? null,
      recordId: record?.id ?? issue?.recordId ?? null,
    };
  }

  list(
    databaseId?: string,
    sourceId?: string,
    options: DatabaseRecordIndexListOptions = {},
  ): readonly DatabaseRecord[] {
    const includeBody = options.includeBody ?? true;
    return [...this.#recordsById.values()]
      .filter(
        (record) =>
          (databaseId === undefined || record.databaseId === databaseId) &&
          (sourceId === undefined || record.sourceId === sourceId),
      )
      .map((record) =>
        includeBody ? cloneRecord(record) : structuredClone({ ...record, body: '' }),
      )
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  fileAvailability(path: string): DatabaseFileAvailability {
    if (!isSafeDatabaseAssetPath(path)) return 'missing';
    try {
      const realContentDir = realpathSync(this.#contentDir);
      const realFile = realpathSync(resolve(realContentDir, path));
      return isWithin(realContentDir, realFile) && statSync(realFile).isFile()
        ? 'available'
        : 'missing';
    } catch {
      return 'missing';
    }
  }

  findByProperty(propertyId: string, value: DatabaseValue): readonly DatabaseRecord[] {
    const ids = this.#typed.get(propertyId)?.get(valueKey(value));
    if (!ids) return [];
    return [...ids]
      .sort((left, right) => left.localeCompare(right))
      .map((recordId) => this.#recordsById.get(recordId))
      .filter((record): record is DatabaseRecord => record !== undefined)
      .map(cloneRecord);
  }

  /**
   * Deterministic AND-term retrieval over the incrementally maintained lexical
   * index. Offsets address the canonical property string or Markdown body in
   * UTF-16 code units, matching JavaScript string slicing and editor APIs.
   */
  searchText(input: DatabaseLexicalSearchInput): DatabaseLexicalSearchResult {
    const terms = [...new Set(lexicalTerms(input.text).map((entry) => entry.term))];
    if (terms.length > DATABASE_LEXICAL_MAX_TERMS) {
      throw new DatabaseLexicalSearchLimitError(terms.length);
    }
    const limit = Math.min(DATABASE_LEXICAL_MAX_HITS, Math.max(1, input.limit ?? 25));
    const allowedProperties = new Set(input.propertyIds);
    const allowedRecords =
      input.allowedRecordIds === undefined || input.allowedRecordIds === null
        ? null
        : new Set(input.allowedRecordIds);
    const inScope = (recordId: string, occurrence: LexicalOccurrence): boolean => {
      const record = this.#recordsById.get(recordId);
      if (
        !record ||
        record.databaseId !== input.databaseId ||
        record.sourceId !== input.sourceId ||
        (record.archivedAt && input.includeArchived !== true) ||
        (allowedRecords !== null && !allowedRecords.has(recordId))
      ) {
        return false;
      }
      return occurrence.field === 'body'
        ? input.includeBody !== false
        : occurrence.propertyId !== undefined && allowedProperties.has(occurrence.propertyId);
    };
    const scopedRecordIds = terms.map((term) => {
      const records = this.#lexical.get(term);
      return new Set(
        [...(records?.entries() ?? [])]
          .filter(([recordId, occurrences]) =>
            occurrences.some((occurrence) => inScope(recordId, occurrence)),
          )
          .map(([recordId]) => recordId),
      );
    });
    const termStats = terms.map((term, index) => {
      const scopedCount = scopedRecordIds[index]?.size ?? 0;
      return {
        term,
        // Never expose corpus-wide term counts: both counts are computed only
        // after the caller's row/property/body scope has been applied.
        indexedRecords: scopedCount,
        scopedRecords: scopedCount,
      };
    });
    const traceBase = {
      strategy: 'lexical_and' as const,
      scope: {
        databaseId: input.databaseId,
        sourceId: input.sourceId,
        propertyIds: [...input.propertyIds],
        includeBody: input.includeBody !== false,
        includeArchived: input.includeArchived === true,
      },
      termStats,
      ranking: {
        titleWeight: 40 as const,
        propertyWeight: 20 as const,
        bodyWeight: 10 as const,
        tieBreakers: ['path', 'record_id'] as const,
      },
    };
    if (terms.length === 0) {
      return {
        query: input.text,
        terms,
        offsetEncoding: 'utf16_code_units',
        matched: 0,
        returned: 0,
        isComplete: true,
        hits: [],
        trace: { ...traceBase, noMatchReason: 'no_terms' },
      };
    }
    const termRecordIds = [...scopedRecordIds].sort((left, right) => left.size - right.size);
    const candidateIds = new Set(termRecordIds[0] ?? []);
    for (const ids of termRecordIds.slice(1)) {
      for (const recordId of candidateIds) {
        if (!ids.has(recordId)) candidateIds.delete(recordId);
      }
    }
    const compareHits = (left: DatabaseLexicalSearchHit, right: DatabaseLexicalSearchHit) =>
      right.score - left.score ||
      left.path.localeCompare(right.path) ||
      left.recordId.localeCompare(right.recordId);
    // A worst-first heap retains only the exact top-K while still counting all
    // permission-scoped matches. Result memory is independent of corpus size.
    const hits: DatabaseLexicalSearchHit[] = [];
    const pushTopHit = (hit: DatabaseLexicalSearchHit): void => {
      const worse = (left: DatabaseLexicalSearchHit, right: DatabaseLexicalSearchHit) =>
        compareHits(left, right) > 0;
      if (hits.length < limit) {
        hits.push(hit);
        let index = hits.length - 1;
        while (index > 0) {
          const parent = Math.floor((index - 1) / 2);
          if (
            !worse(
              hits[index] as DatabaseLexicalSearchHit,
              hits[parent] as DatabaseLexicalSearchHit,
            )
          )
            break;
          [hits[index], hits[parent]] = [
            hits[parent] as DatabaseLexicalSearchHit,
            hits[index] as DatabaseLexicalSearchHit,
          ];
          index = parent;
        }
        return;
      }
      const worst = hits[0];
      if (!worst || compareHits(hit, worst) >= 0) return;
      hits[0] = hit;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let next = index;
        if (
          left < hits.length &&
          worse(hits[left] as DatabaseLexicalSearchHit, hits[next] as DatabaseLexicalSearchHit)
        )
          next = left;
        if (
          right < hits.length &&
          worse(hits[right] as DatabaseLexicalSearchHit, hits[next] as DatabaseLexicalSearchHit)
        )
          next = right;
        if (next === index) break;
        [hits[index], hits[next]] = [
          hits[next] as DatabaseLexicalSearchHit,
          hits[index] as DatabaseLexicalSearchHit,
        ];
        index = next;
      }
    };
    let matched = 0;
    for (const recordId of candidateIds) {
      const record = this.#recordsById.get(recordId);
      if (!record || record.databaseId !== input.databaseId || record.sourceId !== input.sourceId) {
        continue;
      }
      const occurrencesByKey = new Map<
        string,
        { occurrence: LexicalOccurrence; terms: Set<string> }
      >();
      let everyTermMatched = true;
      for (const term of terms) {
        const occurrences = (this.#lexical.get(term)?.get(recordId) ?? []).filter((occurrence) =>
          inScope(recordId, occurrence),
        );
        if (occurrences.length === 0) {
          everyTermMatched = false;
          break;
        }
        for (const occurrence of occurrences) {
          const key = `${occurrence.field}:${occurrence.propertyId ?? ''}:${occurrence.start}:${occurrence.end}`;
          const entry = occurrencesByKey.get(key) ?? { occurrence, terms: new Set<string>() };
          entry.terms.add(term);
          occurrencesByKey.set(key, entry);
        }
      }
      if (!everyTermMatched) continue;
      const evidence = [...occurrencesByKey.values()]
        .sort(
          (left, right) =>
            (left.occurrence.field === 'property' ? -1 : 1) -
              (right.occurrence.field === 'property' ? -1 : 1) ||
            (left.occurrence.propertyId ?? '').localeCompare(right.occurrence.propertyId ?? '') ||
            left.occurrence.start - right.occurrence.start,
        )
        .slice(0, DATABASE_LEXICAL_MAX_EVIDENCE_PER_HIT)
        .map(({ occurrence, terms: matchedTerms }) => {
          const text =
            occurrence.field === 'body'
              ? record.body
              : this.#propertyText(
                  record,
                  occurrence.propertyId ?? '',
                  record.values[occurrence.propertyId ?? ''] ?? '',
                );
          const snippetStart = Math.max(0, occurrence.start - 80);
          const snippetEnd = Math.min(text.length, occurrence.end + 80);
          return {
            id: evidenceId(record, occurrence),
            recordId: record.id,
            path: record.path,
            field: occurrence.field,
            ...(occurrence.propertyId ? { propertyId: occurrence.propertyId } : {}),
            start: occurrence.start,
            end: occurrence.end,
            offsetEncoding: 'utf16_code_units' as const,
            snippet: text.slice(snippetStart, snippetEnd),
            snippetStart,
            snippetEnd,
            matchedTerms: [...matchedTerms].sort(),
          };
        });
      const matchedBy = [
        ...new Set<DatabaseLexicalMatchField>(
          evidence.map((entry) =>
            entry.field === 'body'
              ? 'body'
              : entry.propertyId === input.titlePropertyId
                ? 'title'
                : 'property',
          ),
        ),
      ];
      const baseScore = evidence.reduce(
        (sum, entry) =>
          sum +
          entry.matchedTerms.length *
            (entry.field === 'body' ? 10 : entry.propertyId === input.titlePropertyId ? 40 : 20),
        0,
      );
      const scoreBreakdown = {
        title: evidence
          .filter(
            (entry) => entry.field === 'property' && entry.propertyId === input.titlePropertyId,
          )
          .reduce((sum, entry) => sum + entry.matchedTerms.length * 40, 0),
        property: evidence
          .filter(
            (entry) => entry.field === 'property' && entry.propertyId !== input.titlePropertyId,
          )
          .reduce((sum, entry) => sum + entry.matchedTerms.length * 20, 0),
        body: evidence
          .filter((entry) => entry.field === 'body')
          .reduce((sum, entry) => sum + entry.matchedTerms.length * 10, 0),
      };
      const boost = input.rankBoost?.(cloneRecord(record)) ?? 0;
      if (!Number.isFinite(boost) || boost < 0 || boost > 100) {
        throw new RangeError('Lexical rank boost must be a finite number from 0 to 100');
      }
      matched += 1;
      pushTopHit({
        recordId: record.id,
        path: record.path,
        revision: record.revision,
        score: baseScore + boost,
        scoreBreakdown,
        matchedBy,
        evidence,
      });
    }
    hits.sort(compareHits);
    return {
      query: input.text,
      terms,
      offsetEncoding: 'utf16_code_units',
      matched,
      returned: hits.length,
      isComplete: matched <= limit,
      hits,
      trace: {
        ...traceBase,
        noMatchReason:
          matched > 0
            ? null
            : termStats.some((entry) => entry.scopedRecords === 0)
              ? 'term_absent_in_scope'
              : 'no_record_matches_all_terms',
      },
    };
  }

  async rebuild(): Promise<DatabaseRecordIndexRebuildResult> {
    this.#state = 'rebuilding';
    this.#progress = { discovered: 0, processed: 0 };
    this.#lastError = null;
    try {
      const storeSnapshot = await this.#databaseStore.reload();
      this.#manifestRevision = storeSnapshot.revision;
      this.#clear();

      const recordPaths = new Set<string>();
      for (const database of storeSnapshot.databases) {
        for (const source of database.sources) {
          const sourceRoot = resolve(this.#contentDir, source.folder === '.' ? '' : source.folder);
          if (!isWithin(this.#contentDir, sourceRoot)) continue;
          await this.#collectSourcePaths(sourceRoot, recordPaths);
        }
      }
      if (this.#progress) this.#progress.discovered = recordPaths.size;

      for (const recordPath of [...recordPaths].sort((left, right) => left.localeCompare(right))) {
        try {
          const markdown = await readFile(resolve(this.#contentDir, recordPath), 'utf-8');
          this.upsertPath(recordPath, markdown);
        } catch {
          this.deletePath(recordPath);
          this.#baseIssuesByPath.set(recordPath, {
            code: 'unreadable_record',
            path: recordPath,
            message: `Record "${recordPath}" could not be read`,
          });
        }
        if (this.#progress) this.#progress.processed += 1;
      }

      this.#reconcileUniqueConstraints();

      const snapshot = this.snapshot();
      this.#state = 'idle';
      this.#progress = null;
      this.#lastRebuiltAt = new Date().toISOString();
      return {
        indexed: snapshot.records.length,
        invalid: snapshot.issues.length,
        revision: snapshot.revision,
      };
    } catch (error) {
      this.#state = 'error';
      this.#progress = null;
      this.#lastError = {
        code: 'rebuild_failed',
        message: 'Database record index rebuild failed',
      };
      throw error;
    }
  }

  upsertPath(
    recordPath: string,
    markdown: string,
    fileTimes: DatabaseRecordFileTimes = recordFileTimes(this.#contentDir, recordPath),
  ): void {
    this.#markIncrementalChange();
    this.deletePath(recordPath);
    const matches = this.#databaseStore
      .list()
      .flatMap((database) =>
        database.sources
          .filter((source) => isRecordPathInSource(recordPath, source))
          .map((source) => ({ database, source })),
      )
      .sort(
        (left, right) =>
          left.database.id.localeCompare(right.database.id) ||
          left.source.id.localeCompare(right.source.id),
      );
    if (matches.length === 0) return;

    const failures: Array<{
      databaseId: string;
      sourceId: string;
      code: string;
      message: string;
      issues?: readonly DatabaseRecordIssue[];
    }> = [];
    for (const { database, source } of matches) {
      const materialized = materializeDatabaseRecord({
        definition: database,
        sourceId: source.id,
        path: recordPath,
        markdown,
        revision: `sha256:${createHash('sha256').update(markdown).digest('hex')}`,
        fileCreatedAt: fileTimes.createdAt,
        fileLastEditedAt: fileTimes.lastEditedAt,
        fileLastEditedBy: fileTimes.lastEditedBy,
        preserveInvalidValues: true,
      });
      if (materialized.ok) {
        const evidenceValues = Object.fromEntries(
          source.properties.flatMap((property) =>
            property.type === 'verification' ||
            materialized.record.values[property.id] === undefined
              ? []
              : [[property.id, materialized.record.values[property.id]]],
          ),
        );
        materialized.record.evidenceRevision = `sha256:${createHash('sha256')
          .update(
            JSON.stringify({
              sourceId: source.id,
              values: evidenceValues,
              body: materialized.record.body,
              archivedAt: materialized.record.archivedAt ?? null,
            }),
          )
          .digest('hex')}`;
        if (materialized.record.issues?.length) {
          this.#baseIssuesByPath.set(recordPath, {
            code: 'invalid_record',
            path: recordPath,
            message: `Record "${recordPath}" has ${materialized.record.issues.length} invalid database value${materialized.record.issues.length === 1 ? '' : 's'}`,
            databaseId: database.id,
            sourceId: source.id,
            recordId: materialized.record.id,
            materializationCode: 'invalid_record',
            recordIssues: structuredClone(materialized.record.issues),
          });
        }
        this.#addCandidate(recordPath, materialized.record);
        if (this.#state !== 'rebuilding') this.#reconcileUniqueConstraints();
        return;
      }
      failures.push({
        databaseId: database.id,
        sourceId: source.id,
        code: materialized.code,
        message: materialized.message,
        ...(materialized.issues ? { issues: materialized.issues } : {}),
      });
    }

    const failure = failures[0];
    if (failure) {
      this.#baseIssuesByPath.set(recordPath, {
        code: 'invalid_record',
        path: recordPath,
        message: failure.message,
        databaseId: failure.databaseId,
        sourceId: failure.sourceId,
        materializationCode: failure.code,
        ...(failure.issues ? { recordIssues: structuredClone(failure.issues) } : {}),
      });
    }
  }

  deletePath(recordPath: string): void {
    this.#markIncrementalChange();
    this.#baseIssuesByPath.delete(recordPath);
    this.#duplicateIssuesByPath.delete(recordPath);
    const previous = this.#candidatesByPath.get(recordPath);
    if (!previous) return;
    this.#candidatesByPath.delete(recordPath);
    const paths = this.#pathsByRecordId.get(previous.id);
    paths?.delete(recordPath);
    if (paths?.size === 0) this.#pathsByRecordId.delete(previous.id);
    this.#reconcileRecordId(previous.id);
    if (this.#state !== 'rebuilding') this.#reconcileUniqueConstraints();
  }

  renamePath(
    oldRecordPath: string,
    newRecordPath: string,
    markdown: string,
    fileTimes?: DatabaseRecordFileTimes,
  ): void {
    this.#markIncrementalChange();
    this.deletePath(oldRecordPath);
    this.upsertPath(newRecordPath, markdown, fileTimes);
  }

  invalidatePath(recordPath: string, message: string): void {
    this.#markIncrementalChange();
    this.deletePath(recordPath);
    this.#baseIssuesByPath.set(recordPath, {
      code: 'external_conflict',
      path: recordPath,
      message,
    });
  }

  async checkConsistency(): Promise<DatabaseRecordIndexConsistencyReport> {
    const current = this.snapshot();
    const canonicalIndex = new DatabaseRecordIndex({
      contentDir: this.#contentDir,
      databaseStore: this.#databaseStore,
    });
    await canonicalIndex.rebuild();
    const canonical = canonicalIndex.snapshot();
    const currentById = new Map(current.records.map((record) => [record.id, record]));
    const canonicalById = new Map(canonical.records.map((record) => [record.id, record]));
    const missingRecordIds = [...canonicalById.keys()]
      .filter((recordId) => !currentById.has(recordId))
      .sort((left, right) => left.localeCompare(right));
    const staleRecordIds = [...currentById.keys()]
      .filter((recordId) => !canonicalById.has(recordId))
      .sort((left, right) => left.localeCompare(right));
    const changedRecordIds = [...canonicalById.keys()]
      .filter((recordId) => {
        const indexed = currentById.get(recordId);
        return (
          indexed !== undefined &&
          JSON.stringify(indexed) !== JSON.stringify(canonicalById.get(recordId))
        );
      })
      .sort((left, right) => left.localeCompare(right));
    const diagnosticsDiffer = JSON.stringify(current.issues) !== JSON.stringify(canonical.issues);
    return {
      consistent:
        missingRecordIds.length === 0 &&
        staleRecordIds.length === 0 &&
        changedRecordIds.length === 0 &&
        !diagnosticsDiffer,
      currentRevision: current.revision,
      canonicalRevision: canonical.revision,
      missingRecordIds,
      staleRecordIds,
      changedRecordIds,
      diagnosticsDiffer,
    };
  }

  #clear(): void {
    this.#candidatesByPath.clear();
    this.#pathsByRecordId.clear();
    this.#recordsById.clear();
    this.#baseIssuesByPath.clear();
    this.#duplicateIssuesByPath.clear();
    this.#uniqueIssues.clear();
    this.#typed.clear();
    this.#lexical.clear();
    this.#lexicalTermsByRecordId.clear();
  }

  #markIncrementalChange(): void {
    if (this.#state !== 'rebuilding') this.#lastIncrementalAt = new Date().toISOString();
  }

  async #collectSourcePaths(directory: string, paths: Set<string>): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ENOENT'
      ) {
        return;
      }
      throw error;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      const recordPath = relative(this.#contentDir, absolutePath).split(sep).join('/');
      if (entry.isSymbolicLink()) {
        if (recordPath.endsWith('.md') || recordPath.endsWith('.mdx')) {
          this.#baseIssuesByPath.set(recordPath, {
            code: 'record_symlink',
            path: recordPath,
            message: `Record "${recordPath}" is a symbolic link and was not indexed`,
          });
        }
        continue;
      }
      if (entry.isDirectory()) {
        await this.#collectSourcePaths(absolutePath, paths);
      } else if (entry.isFile() && (recordPath.endsWith('.md') || recordPath.endsWith('.mdx'))) {
        paths.add(recordPath);
      }
    }
  }

  #addCandidate(recordPath: string, record: DatabaseRecord): void {
    this.#candidatesByPath.set(recordPath, record);
    const paths = this.#pathsByRecordId.get(record.id) ?? new Set<string>();
    paths.add(recordPath);
    this.#pathsByRecordId.set(record.id, paths);
    this.#reconcileRecordId(record.id);
  }

  #reconcileRecordId(recordId: string): void {
    const previous = this.#recordsById.get(recordId);
    if (previous) this.#removeTyped(previous);
    this.#recordsById.delete(recordId);

    const paths = this.#pathsByRecordId.get(recordId) ?? new Set<string>();
    for (const path of paths) this.#duplicateIssuesByPath.delete(path);
    if (paths.size === 1) {
      const onlyPath = [...paths][0];
      const candidate = onlyPath === undefined ? undefined : this.#candidatesByPath.get(onlyPath);
      if (candidate) {
        this.#recordsById.set(recordId, candidate);
        this.#addTyped(candidate);
      }
      return;
    }
    if (paths.size > 1) {
      for (const path of paths) {
        this.#duplicateIssuesByPath.set(path, {
          code: 'duplicate_record_id',
          path,
          message: `Record ID "${recordId}" is declared by more than one file`,
          recordId,
        });
      }
    }
  }

  #reconcileUniqueConstraints(): void {
    this.#uniqueIssues.clear();
    for (const database of this.#databaseStore.list()) {
      for (const source of database.sources) {
        const records = [...this.#recordsById.values()].filter(
          (record) => record.databaseId === database.id && record.sourceId === source.id,
        );
        for (const property of source.properties.filter(
          (candidate) => candidate.semantics.constraints.unique || candidate.type === 'unique_id',
        )) {
          const byValue = new Map<string, DatabaseRecord[]>();
          for (const record of records) {
            const value = record.values[property.id];
            if (value === undefined) continue;
            const key = valueKey(value);
            const duplicates = byValue.get(key) ?? [];
            duplicates.push(record);
            byValue.set(key, duplicates);
          }
          for (const duplicates of byValue.values()) {
            if (duplicates.length < 2) continue;
            for (const record of duplicates) {
              this.#uniqueIssues.set(`${record.path}\0${property.id}`, {
                code: 'duplicate_unique_value',
                path: record.path,
                message:
                  property.type === 'unique_id'
                    ? `Unique ID property "${property.key}" repeats an allocated number`
                    : `Property "${property.key}" repeats a value declared unique`,
                databaseId: database.id,
                sourceId: source.id,
                recordId: record.id,
                propertyId: property.id,
              });
            }
          }
        }
      }
    }
  }

  #addTyped(record: DatabaseRecord): void {
    for (const [propertyId, value] of Object.entries(record.values)) {
      const values = this.#typed.get(propertyId) ?? new Map<string, Set<string>>();
      const key = valueKey(value);
      const ids = values.get(key) ?? new Set<string>();
      ids.add(record.id);
      values.set(key, ids);
      this.#typed.set(propertyId, values);
    }
    const indexedTerms = new Set<string>();
    const addText = (text: string, field: 'property' | 'body', propertyId?: string): void => {
      for (const token of lexicalTerms(text)) {
        const records = this.#lexical.get(token.term) ?? new Map<string, LexicalOccurrence[]>();
        const occurrences = records.get(record.id) ?? [];
        occurrences.push({
          field,
          ...(propertyId ? { propertyId } : {}),
          start: token.start,
          end: token.end,
        });
        records.set(record.id, occurrences);
        this.#lexical.set(token.term, records);
        indexedTerms.add(token.term);
      }
    };
    for (const [propertyId, value] of Object.entries(record.values)) {
      const propertyText = this.#propertyText(record, propertyId, value);
      if (
        typeof value === 'string' ||
        DatabaseDateValueSchema.safeParse(value).success ||
        propertyText !== databaseValueText(value)
      ) {
        addText(propertyText, 'property', propertyId);
      }
    }
    addText(record.body, 'body');
    this.#lexicalTermsByRecordId.set(record.id, indexedTerms);
  }

  #propertyText(record: DatabaseRecord, propertyId: string, value: DatabaseValue): string {
    const database = this.#databaseStore.getById(record.databaseId);
    const property = database?.sources
      .find((source) => source.id === record.sourceId)
      ?.properties.find((candidate) => candidate.id === propertyId);
    if (property?.type === 'person' && Array.isArray(value)) {
      return value
        .map((personId) => {
          const person = database?.people.find((candidate) => candidate.id === personId);
          return person ? `${person.name} ${person.key} ${person.id}` : personId;
        })
        .join(' · ');
    }
    if (property?.type === 'text' && typeof value === 'string') {
      return projectDatabaseRichText(value).plainText;
    }
    if (property?.type === 'files' && Array.isArray(value)) {
      return (value as DatabaseFileValue[])
        .map((file) =>
          [databaseFileDisplayName(file), databaseFileIdentity(file), file.caption]
            .filter((entry): entry is string => Boolean(entry))
            .join(' '),
        )
        .join(' · ');
    }
    return databaseValueText(value);
  }

  #removeTyped(record: DatabaseRecord): void {
    for (const [propertyId, value] of Object.entries(record.values)) {
      const values = this.#typed.get(propertyId);
      const key = valueKey(value);
      const ids = values?.get(key);
      ids?.delete(record.id);
      if (ids?.size === 0) values?.delete(key);
      if (values?.size === 0) this.#typed.delete(propertyId);
    }
    for (const term of this.#lexicalTermsByRecordId.get(record.id) ?? []) {
      const records = this.#lexical.get(term);
      records?.delete(record.id);
      if (records?.size === 0) this.#lexical.delete(term);
    }
    this.#lexicalTermsByRecordId.delete(record.id);
  }
}

export function createDatabaseRecordIndex(
  options: CreateDatabaseRecordIndexOptions,
): DatabaseRecordIndex {
  return new DatabaseRecordIndex(options);
}

/** Route one content watcher event into the derived database index. */
export function applyDatabaseRecordDiskEvent(
  index: DatabaseRecordIndex,
  contentDir: string,
  event: DiskEvent,
): void {
  const contentRoot = resolve(contentDir);
  const recordPath = (absolutePath: string): string | null => {
    const resolvedPath = resolve(absolutePath);
    if (!isWithin(contentRoot, resolvedPath)) return null;
    return relative(contentRoot, resolvedPath).split(sep).join('/');
  };

  switch (event.kind) {
    case 'create':
    case 'update': {
      const path = recordPath(event.path);
      if (path) {
        index.upsertPath(path, event.content, {
          ...recordFileTimes(contentRoot, path),
          lastEditedBy: { kind: 'filesystem', principal_id: 'local' },
        });
      }
      return;
    }
    case 'delete': {
      const path = recordPath(event.path);
      if (path) index.deletePath(path);
      return;
    }
    case 'rename': {
      const oldPath = recordPath(event.oldPath);
      const newPath = recordPath(event.newPath);
      if (oldPath && newPath) {
        index.renamePath(oldPath, newPath, event.content, {
          ...recordFileTimes(contentRoot, newPath),
          lastEditedBy: { kind: 'filesystem', principal_id: 'local' },
        });
      }
      return;
    }
    case 'conflict': {
      const path = recordPath(event.path);
      if (path) {
        index.invalidatePath(path, `Record "${path}" contains unresolved conflict markers`);
      }
      return;
    }
    case 'asset-create':
    case 'asset-delete':
    case 'folder-create':
    case 'folder-delete':
    case 'file-create':
    case 'file-update':
    case 'file-delete':
      return;
  }
}
