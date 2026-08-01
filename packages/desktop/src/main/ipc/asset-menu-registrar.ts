/** Native asset context-menu IPC, kept separate from file-open containment. */

import type { AssetRegistrarDeps } from './asset-registrar.ts';
import { isAssetMenuParams } from './asset-request.ts';

export function registerAssetMenuIpc(deps: AssetRegistrarDeps): void {
  deps.register('ok:shell:show-asset-menu', async (event, rawParams) => {
    const callerWindow = deps.getWindowForWebContents(event.sender);
    if (callerWindow === undefined) return undefined;
    const projectPath = deps.getProjectPath(callerWindow);
    if (!projectPath || !isAssetMenuParams(rawParams)) return undefined;
    deps.popAssetMenu(callerWindow, {
      kind: rawParams.kind,
      platform: deps.platform,
      actions: {
        reveal: async () => {
          await deps.revealAsset(projectPath, rawParams.relPath);
        },
        openInDefault: async () => {
          await deps.openAsset(projectPath, rawParams.relPath);
        },
        copyLink: () => deps.copyText(rawParams.relPath),
      },
    });
    return undefined;
  });
}
