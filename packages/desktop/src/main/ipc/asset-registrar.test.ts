import { describe, expect, mock, test } from 'bun:test';
import {
  type AssetIpcHandler,
  type AssetIpcRegistrar,
  registerAssetIpcHandlers,
} from './asset-registrar.ts';

describe('registerAssetIpcHandlers', () => {
  test('registers project-scoped shell and asset handlers through explicit dependencies', async () => {
    const handlers = new Map<string, AssetIpcHandler>();
    const register: AssetIpcRegistrar = (channel, handler) => {
      handlers.set(channel, handler);
    };
    const sender = { id: 10 };
    const callerWindow = { id: 1 };
    const openAsset = mock(
      async (_projectPath: string, _relPath: string) => ({ ok: true }) as const,
    );
    const revealAsset = mock(
      async (_projectPath: string, _relPath: string) => ({ ok: true }) as const,
    );
    const spawnCursor = mock(
      async (_projectPath: string | undefined, _path: string) => ({ ok: true }) as const,
    );
    let menuParams:
      | Parameters<Parameters<typeof registerAssetIpcHandlers>[0]['popAssetMenu']>[1]
      | null = null;

    registerAssetIpcHandlers({
      register,
      platform: 'linux',
      getWindowForWebContents: (candidate) => (candidate === sender ? callerWindow : undefined),
      getProjectPath: (window) => (window === callerWindow ? '/project' : undefined),
      openExternal: async () => {},
      fetchWebPreviewMetadata: async () => null,
      detectProtocol: async () => ({ installed: false }),
      spawnCursor,
      recordHandoff: async () => {},
      openAsset,
      savePdfAsset: async () => ({ ok: true }),
      exportPdf: async () => ({ ok: true, canceled: true }),
      revealAsset,
      popAssetMenu: (_window, params) => {
        menuParams = params;
      },
      copyText: () => {},
      showItemInFolder: () => ({ ok: true }),
      defaultBugReportZipPath: () => '/tmp/bug-reports/report.zip',
      revealExternal: async () => ({ ok: true, outcome: 'dismissed' }),
      logIpcError: () => {},
      warn: () => {},
    });

    expect([...handlers.keys()]).toEqual([
      'ok:shell:open-external',
      'ok:shell:detect-protocol',
      'ok:shell:spawn-cursor',
      'ok:shell:record-handoff',
      'ok:shell:open-asset',
      'ok:shell:reveal-asset',
      'ok:shell:show-asset-menu',
      'ok:shell:show-item-in-folder',
      'ok:shell:reveal-external',
    ]);

    const event = { sender };
    await handlers.get('ok:shell:spawn-cursor')?.(event, '/project/docs');
    await handlers.get('ok:shell:open-asset')?.(event, 'docs/guide.pdf');
    await handlers.get('ok:shell:reveal-asset')?.(event, 'docs/guide.pdf');
    await handlers.get('ok:shell:show-asset-menu')?.(event, {
      kind: 'asset',
      relPath: 'docs/guide.pdf',
      title: 'Guide',
    });

    expect(spawnCursor).toHaveBeenCalledWith('/project', '/project/docs');
    expect(openAsset).toHaveBeenCalledWith('/project', 'docs/guide.pdf');
    expect(revealAsset).toHaveBeenCalledWith('/project', 'docs/guide.pdf');
    expect(menuParams).not.toBeNull();
    await menuParams?.actions.openInDefault();
    await menuParams?.actions.reveal();
    expect(openAsset).toHaveBeenLastCalledWith('/project', 'docs/guide.pdf');
    expect(revealAsset).toHaveBeenLastCalledWith('/project', 'docs/guide.pdf');
  });

  test('refuses malformed asset requests before they reach project-scoped operations', async () => {
    const handlers = new Map<string, AssetIpcHandler>();
    const openAsset = mock(async () => ({ ok: true }) as const);
    const exportPdf = mock(async () => ({ ok: true, canceled: true }) as const);

    registerAssetIpcHandlers({
      register: (channel, handler) => handlers.set(channel, handler),
      platform: 'linux',
      getWindowForWebContents: () => ({ id: 1 }),
      getProjectPath: () => '/project',
      openExternal: async () => {},
      fetchWebPreviewMetadata: async () => null,
      detectProtocol: async () => ({ installed: false }),
      spawnCursor: async () => ({ ok: true }),
      recordHandoff: async () => {},
      openAsset,
      savePdfAsset: async () => ({ ok: true }),
      exportPdf,
      revealAsset: async () => ({ ok: true }),
      popAssetMenu: () => {},
      copyText: () => {},
      showItemInFolder: () => ({ ok: true }),
      defaultBugReportZipPath: () => '/tmp/bug-reports/report.zip',
      revealExternal: async () => ({ ok: true, outcome: 'dismissed' }),
      logIpcError: () => {},
      warn: () => {},
    });

    await expect(handlers.get('ok:shell:open-asset')?.({ sender: {} }, null)).resolves.toEqual({
      ok: false,
      reason: 'print-failed',
    });
    expect(openAsset).not.toHaveBeenCalled();
    expect(exportPdf).not.toHaveBeenCalled();
  });
});
