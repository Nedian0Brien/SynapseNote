/**
 * The durable portion of the managed-rename spine.
 *
 * Keeping this tiny adapter separate makes the journal boundary explicit: a
 * caller supplies the recovery envelope, and the coordinator never converts a
 * failed operation into success.  In particular, the envelope can only clear
 * its journal after the operation (including rename-log append) has resolved.
 */
export interface ManagedRenameCoordinatorDeps {
  withRecovery<T>(operation: () => Promise<T>): Promise<T>;
  executeAssetRename?: (fromPath: string, toPath: string) => Promise<AssetRenameResult>;
  executeDocumentToFileRename?: (fromPath: string, toPath: string) => Promise<AssetRenameResult>;
  executeDocumentRename?: (
    fromPath: string,
    toPath: string,
    kind: 'file' | 'folder',
    options?: ManagedRenameOptions,
  ) => Promise<DocumentRenameResult>;
}

export interface AssetRenameResult {
  renamedAssets: Array<{ fromPath: string; toPath: string }>;
  rewrittenDocs: Array<{ docName: string; rewrites: number }>;
}

export interface ManagedRenameOptions {
  actor?: {
    writerId: string;
    displayName: string;
    colorSeed?: string;
    actorMetadata?: {
      principalId?: string;
      agentType?: string;
      clientName?: string;
      clientVersion?: string;
      label?: string;
    };
  };
}

export interface DocumentRenameResult extends AssetRenameResult {
  renamed: Array<{ fromDocName: string; toDocName: string }>;
}

export interface ManagedRenameCoordinator {
  runDurableRename<T>(operation: () => Promise<T>): Promise<T>;
  renameAsset(fromPath: string, toPath: string): Promise<AssetRenameResult>;
  renameDocumentToFile(fromPath: string, toPath: string): Promise<AssetRenameResult>;
  renameDocuments(
    fromPath: string,
    toPath: string,
    kind: 'file' | 'folder',
    options?: ManagedRenameOptions,
  ): Promise<DocumentRenameResult>;
}

export function createManagedRenameCoordinator(
  deps: ManagedRenameCoordinatorDeps,
): ManagedRenameCoordinator {
  return {
    runDurableRename: (operation) => deps.withRecovery(operation),
    renameAsset: async (fromPath, toPath) => {
      if (!deps.executeAssetRename) throw new Error('Asset rename coordinator is not configured');
      return await deps.executeAssetRename(fromPath, toPath);
    },
    renameDocumentToFile: async (fromPath, toPath) => {
      if (!deps.executeDocumentToFileRename) {
        throw new Error('Document-to-file rename coordinator is not configured');
      }
      return await deps.executeDocumentToFileRename(fromPath, toPath);
    },
    renameDocuments: async (fromPath, toPath, kind, options) => {
      if (!deps.executeDocumentRename) {
        throw new Error('Document rename coordinator is not configured');
      }
      return await deps.executeDocumentRename(fromPath, toPath, kind, options);
    },
  };
}
