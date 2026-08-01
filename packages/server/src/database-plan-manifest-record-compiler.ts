import type {
  DatabaseDraftArtifact,
  DatabasePlanArtifact,
  DatabaseWriteGuardSnapshot,
} from './database-plan-artifacts.ts';
import { compileDatabasePlanManifest } from './database-plan-manifest-compiler.ts';
import { compileDatabasePlanArtifact } from './database-plan-operation-compiler.ts';
import { compileDatabasePlanRecords } from './database-plan-record-compiler.ts';
import type { DatabaseRecordIndex } from './database-record-index.ts';
import type { DatabaseStore } from './database-store.ts';

/** Narrow dependencies used while compiling manifest, records, and conflicts. */
export interface DatabasePlanManifestRecordCompilerContext {
  databaseRecordIndex?: DatabaseRecordIndex;
  projectDir?: string;
  contentDir?: string;
  readFile: (absolutePath: string) => string;
  generateUuid: () => string;
  captureWriteGuards: (
    draftId: string,
    immutableTargetSet: readonly string[],
  ) => DatabaseWriteGuardSnapshot;
}

/** Composes schema conflicts, record convergence, and deterministic artifact assembly. */
export function compileDatabasePlan(
  context: DatabasePlanManifestRecordCompilerContext,
  draft: DatabaseDraftArtifact,
  snapshot: ReturnType<DatabaseStore['snapshot']>,
  now: Date,
  expiresAt: string,
): DatabasePlanArtifact {
  const manifest = compileDatabasePlanManifest(context, draft, snapshot);
  const records = compileDatabasePlanRecords(context, draft, manifest);
  return compileDatabasePlanArtifact(context, draft, snapshot, now, expiresAt, manifest, records);
}
