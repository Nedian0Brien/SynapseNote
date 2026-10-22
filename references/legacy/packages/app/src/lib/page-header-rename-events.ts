/**
 * Request/response bridge from the page header's inline filename editor to the
 * FileTree-owned managed rename spine. FileTree must remain the single owner of
 * rename reconciliation (providers, IndexedDB, tabs, sidebar rows, navigation).
 */

const PAGE_HEADER_RENAME_EVENT = 'synapsenote:page-header-rename';

export interface PageHeaderRenameRequest {
  docName: string;
  docExt: string;
  nextTitle: string;
}

export interface PageHeaderRenameResult {
  ok: boolean;
  message?: string;
}

interface PageHeaderRenameEventDetail {
  request: PageHeaderRenameRequest;
  respond: (result: PageHeaderRenameResult) => void;
}

export function requestPageHeaderRename(
  request: PageHeaderRenameRequest,
): Promise<PageHeaderRenameResult> {
  return new Promise((resolve) => {
    const event = new CustomEvent<PageHeaderRenameEventDetail>(PAGE_HEADER_RENAME_EVENT, {
      cancelable: true,
      detail: { request, respond: resolve },
    });
    const handled = !window.dispatchEvent(event);
    if (!handled) resolve({ ok: false, message: 'Rename is unavailable' });
  });
}

export function subscribeToPageHeaderRename(
  onRequest: (request: PageHeaderRenameRequest) => Promise<PageHeaderRenameResult>,
): () => void {
  const listener = (event: Event) => {
    const renameEvent = event as CustomEvent<PageHeaderRenameEventDetail>;
    const detail = renameEvent.detail;
    if (!detail?.request || typeof detail.respond !== 'function') return;
    renameEvent.preventDefault();
    void onRequest(detail.request).then(detail.respond, (error: unknown) => {
      detail.respond({
        ok: false,
        message: error instanceof Error ? error.message : 'Rename failed',
      });
    });
  };
  window.addEventListener(PAGE_HEADER_RENAME_EVENT, listener);
  return () => window.removeEventListener(PAGE_HEADER_RENAME_EVENT, listener);
}
