import { describe, expect, test } from 'bun:test';
import { applyRenamedDocuments } from './apply-renamed-documents';

describe('applyRenamedDocuments', () => {
  test('reconciles document, tab, pool, and active-target state after a mixed rename', async () => {
    const calls: string[] = [];
    const documents = [
      { kind: 'document' as const, docName: 'notes/plan', docExt: '.md', size: 1, modified: 'now' },
      {
        kind: 'asset' as const,
        path: 'images/photo.png',
        assetExt: '.png',
        size: 2,
        modified: 'now',
      },
    ];

    await applyRenamedDocuments({
      documents,
      renamed: [{ fromDocName: 'notes/plan', toDocName: 'archive/plan' }],
      renamedFolders: [{ fromPath: 'notes', toPath: 'archive' }],
      renamedAssets: [
        { fromPath: 'notes/plan.md', toPath: 'archive/plan.png' },
        { fromPath: 'images/photo.png', toPath: 'images/photo.md' },
      ],
      activeBeforeRename: { docName: 'notes/plan', folderPath: null, assetPath: null },
      getPoolActiveDocName: () => 'notes/plan',
      poolHas: () => true,
      captureRenameSnapshots: (renamed) => calls.push(`capture:${renamed[0]?.toDocName}`),
      closeAndClearForRename: async (docName) => calls.push(`clear:${docName}`),
      addPage: (docName) => calls.push(`page:${docName}`),
      remapTabsForRename: (renamed, folders, assets) =>
        calls.push(`tabs:${renamed.length}/${folders.length}/${assets.length}`),
      remapPathForFolderRenames: (path, folders) => {
        const mapping = folders.find(
          (entry) => path === entry.fromPath || path.startsWith(`${entry.fromPath}/`),
        );
        return mapping ? `${mapping.toPath}${path.slice(mapping.fromPath.length)}` : path;
      },
      setDocuments: (updater) => {
        const next = updater(documents);
        expect(next).toEqual([
          {
            kind: 'asset',
            path: 'archive/plan.png',
            assetExt: 'png',
            mediaKind: 'image',
            size: 1,
            modified: 'now',
            referencedBy: [],
          },
          {
            kind: 'document',
            docName: 'images/photo',
            docExt: '.md',
            size: 2,
            modified: 'now',
          },
        ]);
        return next;
      },
      reconcileModelAfterExtensionlessRename: () => calls.push('reconcile-model'),
      markNextDocumentsAsApplied: () => calls.push('mark-applied'),
      navigateToWithPulse: (docName) => calls.push(`navigate-doc:${docName}`),
      navigateToFolderWithPulse: (folderPath) => calls.push(`navigate-folder:${folderPath}`),
      navigateToAssetWithPulse: (assetPath) => calls.push(`navigate-asset:${assetPath}`),
      focusEditorAfterRename: (docName) => calls.push(`focus:${docName}`),
      emitDocumentsChanged: (domains) => calls.push(`emit:${domains.join(',')}`),
    });

    expect(calls).toEqual([
      'capture:archive/plan',
      'clear:notes/plan',
      'clear:archive/plan',
      'clear:notes/plan',
      'page:archive/plan',
      'page:images/photo',
      'tabs:1/1/2',
      'reconcile-model',
      'mark-applied',
      'navigate-asset:archive/plan.png',
      'emit:files,backlinks,graph',
    ]);
  });
});
