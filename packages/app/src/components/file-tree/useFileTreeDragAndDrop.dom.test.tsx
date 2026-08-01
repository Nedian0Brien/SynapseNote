import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import type { FileEntry } from '@/components/file-tree-utils';
import { useFileTreeDragAndDrop } from './useFileTreeDragAndDrop';

const entries: FileEntry[] = [
  { kind: 'folder', path: 'uploads', size: 0, modified: '2026-08-01T00:00:00.000Z' },
];

// happy-dom exposes DataTransfer but not a constructible DragEvent. The hook
// intentionally gates on `instanceof DragEvent`, so supply the browser-shaped
// constructor the production listener requires.
if (typeof DragEvent === 'undefined') {
  class TestDragEvent extends Event {}
  Object.defineProperty(globalThis, 'DragEvent', { value: TestDragEvent });
}

function dropFiles(target: HTMLElement, files: File[]) {
  const event = new DragEvent('drop', { bubbles: true, cancelable: true, composed: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { files, types: ['Files'], dropEffect: 'none' },
  });
  target.dispatchEvent(event);
  return event;
}

function DragHarness({ onUpload }: { onUpload: ReturnType<typeof mock> }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const documentsRef = useRef(entries);
  const pageMetaRef = useRef(new Map<string, { size?: number | null }>());
  const inProgressRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetRef = useRef<{ row: HTMLElement | null; root: HTMLElement | null }>({
    row: null,
    root: null,
  });
  const uploadRef = useRef(onUpload);
  uploadRef.current = onUpload;
  const attachTree = (host: HTMLDivElement | null) => {
    hostRef.current = host;
    if (!host || host.querySelector('file-tree')) return;
    const tree = document.createElement('file-tree');
    const shadow = tree.attachShadow({ mode: 'open' });
    const row = document.createElement('div');
    row.dataset.itemPath = 'uploads/';
    row.dataset.itemType = 'folder';
    shadow.append(row);
    host.append(tree);
  };

  useFileTreeDragAndDrop({
    fileTreeHostRef: hostRef,
    documents: entries,
    documentsRef,
    pageMetaRef,
    loading: false,
    sidebarDragInProgressRef: inProgressRef,
    sidebarDragClearTimerRef: timerRef,
    externalFileDropTargetRef: targetRef,
    uploadExternalFilesRef: uploadRef,
  });
  return <div data-testid="host" ref={attachTree} />;
}

describe('useFileTreeDragAndDrop external file drop', () => {
  afterEach(cleanup);

  test('routes shadow-DOM folder drops to the folder parent and preserves its busy path', async () => {
    const onUpload = mock(() => {});
    const { getByTestId } = render(<DragHarness onUpload={onUpload} />);
    const row = getByTestId('host').querySelector('file-tree')?.shadowRoot?.querySelector('div');
    expect(row).not.toBeNull();

    const event = dropFiles(row as HTMLElement, [
      new File(['asset'], 'image.png', { type: 'image/png' }),
    ]);

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(event.defaultPrevented).toBe(true);
    expect(onUpload).toHaveBeenCalledWith(
      [expect.objectContaining({ name: 'image.png' })],
      'uploads',
      'uploads/',
    );
  });
});
